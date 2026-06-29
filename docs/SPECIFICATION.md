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

  /** Patch unificado das alterações de working tree salvas nesta task */
  patchPath?: string;

  bookmarks: BookmarkEntry[];
  breakpoints: SerializedBreakpoint[];
  openEditors?: EditorSnapshot[];  // fase 2 — abas e cursor
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

### Contexto geral (`__general__`)

Quando não há task anterior ativa, alterações pendentes vão para um patch no **contexto geral** — bucket default para mudanças não associadas a nenhuma task.

### Patch por task

Ao criar uma nova task (ou trocar), o working tree atual é serializado como **patch** (formato unified diff ou `git diff` + `git diff --cached`) e associado à task de origem.

- Ao **reativar** uma task, o patch é reaplicado (`git apply` ou API equivalente)
- Patches ficam em `.taskkeeper/patches/` (gitignored por padrão, configurável)

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
    ▼
QuickPick: "Criar contexto novo?"
    ├── Sim → serializar estado da task ATIVA (se existir):
    │         • git diff → patch
    │         • breakpoints → JSON
    │         • bookmarks → JSON
    │         • (fase 2) abas abertas
    │         Salvar na task anterior OU no contexto geral
    │
    └── Não → manter patches existentes; só registrar nova task
    │
    ▼
Criar TaskContext vazio (ou clonar estrutura mínima)
Definir como task ativa
Status bar: "Task: {título}"
```

## Fluxo: Switch Task

```
Usuário: Cmd+Shift+P → "TaskKeeper: Switch Task"
    │
    ▼
QuickPick: lista tasks (título + updatedAt)
    │
    ▼
Salvar snapshot da task atual (patch + breakpoints + bookmarks)
    │
    ▼
Limpar breakpoints ativos
    │
    ▼
Restaurar task selecionada:
    • git apply patch (com validação de conflito)
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
  extension.ts              # activate / deactivate
  commands/
    createTask.ts
    switchTask.ts
  services/
    taskStore.ts            # CRUD + persistência
    patchService.ts         # git diff / apply
    breakpointService.ts    # save / restore via debug API
    bookmarkService.ts      # save / restore (decorations ou lista)
    contextSwitcher.ts      # orquestra save → clear → restore
  models/
    taskContext.ts
  utils/
    paths.ts
    git.ts
```

---

## Critérios de aceite — v0.1

- [ ] Create Task com input de título
- [ ] Prompt "contexto novo?" funcional
- [ ] Patch salvo na task anterior ou contexto geral
- [ ] Switch Task via quick pick
- [ ] Breakpoints restaurados após switch
- [ ] Bookmarks restaurados após switch
- [ ] Status bar mostra task ativa
- [ ] `.taskkeeper/` no `.gitignore` do projeto consumidor (documentado)

---

## Desenvolvimento

```bash
cd ~/projects/utils/taskkeeper
npm install
npm run watch          # terminal 1 — compilação contínua
# F5 no Cursor       — Extension Development Host
```

Comandos de teste: `TaskKeeper: Hello World`
