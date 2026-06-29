# TaskKeeper — Especificação

Extensão VS Code / Cursor para desenvolvedores de **suporte** que alternam entre tickets sem perder contexto de IDE (breakpoints, bookmarks, alterações pendentes).

---

## Nomes considerados

| Nome | ID sugerido | Notas |
|------|-------------|-------|
| **TaskKeeper** ✅ escolhido | `utils.taskkeeper` | Evoca ContextKeeper; foco em tarefas |
| ContextShift | `utils.context-shift` | Descreve a ação principal |
| SupportShift | `utils.support-shift` | Explícito para suporte |
| TaskPatch | `utils.taskpatch` | Destaca o mecanismo de patch |
| SnapFlow | `utils.snapflow` | Snapshot + fluxo entre tarefas |

---

## Problema

Em suporte, o fluxo típico é:

1. Trabalhar no ticket A (breakpoints, arquivos abertos, mudanças locais)
2. Urgência no ticket B — precisa trocar **agora**
3. Commitar ou stash vira atrito; contexto se perde
4. Voltar ao ticket A exige remontar breakpoints, bookmarks e memória do que estava fazendo

**Objetivo:** trocar de tarefa em segundos, com contexto isolado por task, leve e sem ceremony.

---

## Conceitos

### Task (tarefa)

Unidade de trabalho nomeada pelo usuário (ex.: `JIRA-1234`, `fix login timeout`).

Cada task persiste um **TaskContext** no workspace:

```typescript
interface TaskContext {
  id: string;           // UUID
  title: string;        // título informado pelo usuário
  createdAt: number;
  updatedAt: number;
  lastActiveAt?: number;  // setado na ativação; fallback para updatedAt em tasks antigas
  status: 'open' | 'archived' | 'completed';

  /** Abas abertas (e buffers não salvos) capturadas no save */
  files?: OpenFileSnapshot[];

  bookmarks: BookmarkEntry[];
  breakpoints: SerializedBreakpoint[];

  /** Conteúdo bruto de `.vscode/bookmarks.json` (extensão alefragnani) */
  bookmarksSnapshot?: unknown;
}

// O patch das alterações da working tree NÃO fica no JSON: é um arquivo
// sidecar em `.taskkeeper/patches/{id}.patch`, escrito/lido pelo TaskStore.

interface OpenFileSnapshot {
  path: string;         // path relativo ao workspace
  isDirty: boolean;     // havia alterações não salvas no buffer
  content?: string;     // conteúdo do buffer quando dirty
  viewColumn?: number;  // coluna do editor
}

interface BookmarkEntry {
  file: string;       // path relativo ao workspace
  line: number;       // 0-based
  label?: string;
}

interface SerializedBreakpoint {
  type: 'source' | 'function';
  file?: string;
  line?: number;
  functionName?: string;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}
```

### Escopo

Um **escopo** é o dono da working tree: ou o **Geral** ou uma **Task**.

- `activeTaskId === undefined` significa **Geral ativo** — não é mais um limbo invisível.
- Troca de escopo é uniforme: `shelve(escopo atual) → reverter working tree → restore(escopo destino)`.
  - Task → Geral: aplica `__general__.patch` + restaura abas/breakpoints/bookmarks do `general.json`.
  - Geral → Task: faz shelve do Geral, aplica o patch da task.
  - Task → Task: shelve da atual, restore da destino (Geral não entra no meio).

### Escopo Geral (`__general__`)

O **Geral** é um escopo de primeira classe, sempre visível no topo da TreeView.

- Quando **nenhuma task está ativa**, o Geral é o escopo ativo — alterações, abas, breakpoints e bookmarks ficam nele.
- Ao **ativar uma task**, o Geral é guardado (`.taskkeeper/general.json` + `.taskkeeper/patches/__general__.patch`) e a task destino é restaurada.
- Ao **voltar ao Geral** (comando `TaskKeeper: Activate General Scope` ou ícone ▶), o patch e o contexto do Geral são reaplicados.
- O prompt "vincular contexto solto?" referencia explicitamente o Geral: *"Há alterações no Geral — vincular à task?"*.

Quando **não há task ativa** e o Geral tem alterações, ao criar/ativar uma task o TaskKeeper pergunta:

- **Vincular** — as alterações do Geral passam a pertencer àquela task (funde com o que ela já tiver salvo).
- **Não vincular** — o Geral é guardado e permanece visível na lista; a task abre com o seu próprio contexto.

Quando **há task ativa**, a troca é sempre limpa: o contexto da anterior é shelvado e não vaza para a próxima (sem prompt).

### ChangeStat (alterações git por escopo)

A TreeView mostra alterações git de cada escopo — **não** abas abertas. `OpenFileSnapshot[]` continua sendo capturado e restaurado para reabrir abas na troca; apenas deixa de ser a fonte da lista da árvore.

```typescript
type FileChangeStatus = 'modified' | 'added' | 'deleted';

interface FileChange {
  path: string;            // relativo ao workspace root
  status: FileChangeStatus;
  insertions: number;
  deletions: number;
}

interface ChangeStat {
  modified: FileChange[];
  added: FileChange[];     // inclui untracked (intent-to-add)
  deleted: FileChange[];
  insertions: number;      // soma
  deletions: number;       // soma
}
```

**Fonte dos números (Approach A):** derivar do patch sob demanda; live para o escopo ativo.

- Escopo **ativo**: `GitService.liveChangeStat()` a partir da working tree (`git diff --numstat/--name-status HEAD` + untracked via `ls-files --others`).
- Escopo **inativo**: `GitService.patchChangeStat(patchFile)` a partir do patch salvo (`git apply --numstat/--summary`).
- Cache por escopo (`ChangeStatCache`): escopo ativo recalculado a cada `refresh()`; inativo chaveado por mtime do patch.
- Arquivos binários (numstat com `-`) contam como 0/0 linhas mas aparecem na categoria correta.
- Escopo sem patch → `ChangeStat` vazio.

### Patch por task (shelve)

Ao sair de uma task (trocar ou criar outra), a working tree é serializada como **patch** via `git diff --binary HEAD` (modificações de versionados + arquivos novos via *intent-to-add*) e a árvore é revertida a HEAD com `git reset --hard` + remoção dos untracked capturados.

- Ao **reativar** uma task, o patch é reaplicado com `git apply --3way`. Conflito → aviso; o patch é preservado.
- Patches ficam em `.taskkeeper/patches/{id}.patch` (a pasta `.taskkeeper/` já é gitignored).
- Fora de um repositório git, o shelve de alterações é ignorado (apenas abas/breakpoints/bookmarks).
- O `git reset --hard` só ocorre **após** salvar o patch — nenhuma alteração é perdida sem rede de segurança.

### TreeView — lista orientada a alterações

```
● Geral                    ~2 +1 −1  ⬆12 ⬇4
   ├ M  src/app.ts                  ⬆8 ⬇2
   ├ M  src/util.ts                 ⬆4 ⬇2
   ├ A  src/new.ts                  ⬆10
   └ D  src/old.ts                       ⬇6
✓ JIRA-123  (ativa)        ~5 +0 −2  ⬆80 ⬇10
○ fix-login                ~1 +0 −0  ⬆3 ⬇1
▸ Tasks arquivadas (2)
```

- **Topo fixo: Geral.** Marcado como ativo (●) quando nenhuma task está ativa; clicável para ativar.
- **Tasks** ordenadas por `lastActiveAt` desc; a ativa marcada (✓).
- **Tasks arquivadas**: pasta colapsável no fim.
- **Resumo na linha do escopo** (`description`): `~mod +add −del  ⬆ins ⬇del`. Escopo sem alterações: `sem alterações`.
- **Filhos = lista plana** de `FileChange`, ordenada modificados → incluídos → excluídos, depois por path. Cada arquivo:
  - ícone/letra de status M/A/D (com cor de tema),
  - `description` = diretório + `⬆ins ⬇del` do arquivo,
  - clique abre o arquivo (`vscode.open`).
- Escopo sem alterações: sem filhos (não-expansível).
- Fora de repositório git: escopos mostram `alterações indisponíveis (sem git)`.

**Toast ao trocar** deixa explícito o destino do contexto, ex.: *"Geral guardado (3 alterações)"* / *"Task X ativada (5 alterações restauradas)"*.

---

## Comandos (roadmap)

### Fase 1 — MVP

| Comando | Paleta | Descrição |
|---------|--------|-----------|
| `TaskKeeper: Create Task` | ✅ | Input de título → pergunta se cria contexto novo → salva patch da task anterior (ou geral) → task vazia |
| `TaskKeeper: Switch Task` | ✅ | Quick pick lista tasks → salva contexto atual → restaura task selecionada |
| `TaskKeeper: Hello World` | ✅ | Smoke test (remover antes do release) |

### Fase 2

| Comando | Descrição |
|---------|-----------|
| `TaskKeeper: List Tasks` | Tree view ou quick pick com detalhes |
| `TaskKeeper: Delete Task` | Remove task e patch associado |
| `TaskKeeper: Rename Task` | Renomeia título |
| `TaskKeeper: Show Active Task` | Status bar com task ativa |

---

## Fluxo: Create Task

```
Usuário: Cmd+Shift+P → "TaskKeeper: Create Task"
    │
    ▼
InputBox: "Título da task"
    │
    ├── Há task ATIVA → shelve dela (patch + abas + breakpoints + bookmarks)
    │                   + limpar ambiente → nova task vazia
    │
    └── Sem task ativa, Geral com alterações → QuickPick "Vincular alterações do Geral?"
        ├── Vincular → nova task adota o contexto do Geral (capture)
        └── Não      → guarda Geral + limpar ambiente → nova task vazia
    │
    ▼
Criar TaskContext vazio, definir como ativa
Status bar: "Task: {título}"
```

## Fluxo: Switch Task

```
Usuário: ícone ▶ no item / "TaskKeeper: Switch Task"
    │
    ▼
QuickPick: lista tasks (título + updatedAt)   [clicar no título NÃO troca]
    │
    ├── Há task ATIVA → shelve dela; limpar ambiente (reverter working tree)
    │
    └── Sem task ativa, Geral com alterações → QuickPick "Vincular alterações do Geral?"
        ├── Vincular → fundir contexto do Geral com o da task destino
        └── Não      → guarda Geral + limpar ambiente
    │
    ▼
Restaurar task selecionada:
    • git apply --3way patch (conflito → aviso, patch preservado)
    • editores/abas
    • addBreakpoints(...)
    • restaurar bookmarks
    │
    ▼
Task ativa = selecionada
```

---

## Persistência

```
.taskkeeper/
  config.json          # task ativa, preferências
  tasks/
    {uuid}.json        # TaskContext metadata
  patches/
    {uuid}.patch       # diff da task
    __general__.patch  # contexto geral
```

Storage alternativo: `ExtensionContext.workspaceState` para índice; arquivos em `context.storageUri` para patches grandes.

**Regra:** paths relativos ao workspace root — portabilidade entre máquinas.

---

## Princípios de design

1. **Leve** — zero dependências runtime; só `@types/vscode` + TypeScript
2. **Explícito** — usuário controla quando salvar/trocar; sem auto-magic agressivo no MVP
3. **Agilidade** — dois comandos cobrem 90% do fluxo de suporte
4. **Fail-safe** — conflito de patch → aviso + opção de abortar; nunca perder patch sem confirmação
5. **Git-native** — patches via diff/apply; não reinventar VCS

---

## Limitações conhecidas (VS Code API)

- Bookmarks no gutter conflitam com breakpoints ([vscode#5923](https://github.com/microsoft/vscode/issues/5923)) → MVP usa lista lateral, não gutter
- Mesmo arquivo alterado em duas tasks → patch pode conflitar; avisar usuário
- Posição de janelas / multi-monitor → fora de escopo
- Data breakpoints → API limitada; ignorar no MVP

---

## Estrutura de código (alvo)

```
src/
  extension.ts              # activate / deactivate + wiring
  commands/
    createTask.ts
    switchTask.ts
    taskActions.ts          # rename / delete / complete
    types.ts                # CommandDeps + helpers
  services/
    taskStore.ts            # CRUD + persistência (tasks + patches)
    gitService.ts           # git diff/apply, untracked, revert (shelve)
    changeStatCache.ts      # cache de ChangeStat por escopo
    editorService.ts        # captura/restaura abas + buffers
    breakpointService.ts    # save / restore via Debug API
    bookmarkService.ts      # save / restore / merge via .vscode/bookmarks.json
    contextSwitcher.ts      # orquestra shelve → clear → unshelve
  ui/
    createTaskForm.ts       # input de título
    linkContextPrompt.ts    # prompt "vincular alterações do Geral?"
    taskQuickPick.ts        # seleção de task
    statusBar.ts            # task ativa / Geral
  views/
    taskTreeProvider.ts     # árvore de escopos + alterações git
  models/
    taskContext.ts
    changeStat.ts
  utils/
    changeStatFormat.ts     # formatação de resumos M/A/D
    activationMessages.ts     # toasts ao trocar escopo
```

---

## Critérios de aceite — v0.2

- [x] Create Task com input de título
- [x] Shelve git por task (patch de `git diff --binary HEAD` + untracked)
- [x] Working tree revertida ao sair; reaplicada (`git apply --3way`) ao entrar
- [x] Prompt "vincular alterações do Geral?" só quando não há task ativa
- [x] Troca com task ativa não vaza contexto da anterior
- [x] Switch Task via quick pick / ícone ▶ (clique no título não troca)
- [x] Breakpoints restaurados após switch
- [x] Bookmarks restaurados após switch
- [x] Aviso em conflito de patch, com patch preservado
- [x] Fallback fora de repositório git (sem shelve de alterações)
- [x] `.taskkeeper/` auto-ignorado (`.taskkeeper/.gitignore` com `*`)

## Critérios de aceite — lista orientada a alterações

- [x] A lista de cada escopo mostra alterações git (M/A/D), não abas abertas
- [x] Arquivo aberto e não modificado **não** aparece na lista
- [x] Cada escopo mostra contagem de modificados/incluídos/excluídos
- [x] Cada escopo mostra delta de linhas (inserções/remoções) como total
- [x] Tasks ordenadas pela última vez ativa (`lastActiveAt`)
- [x] Geral aparece fixo no topo e é ativável; voltar ao Geral restaura as alterações guardadas
- [x] Trocar de task não "perde" o código: o contexto vai para o Geral (visível) e é recuperável
- [x] Números de tasks inativas derivam do patch salvo (Approach A)
- [x] Fallback sem git: mensagem clara, restauração de abas/breakpoints/bookmarks
- [x] Toast ao trocar deixa explícito o destino do contexto

---

## Desenvolvimento

```bash
cd ~/projects/utils/taskkeeper
npm install
npm run watch          # terminal 1 — compilação contínua
# F5 no Cursor       — Extension Development Host
```

Comandos de teste: `TaskKeeper: Hello World`
