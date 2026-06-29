# Design — Lista de tasks orientada a alterações + escopo Geral

Data: 2026-06-29
Status: aprovado para implementação

## Contexto e problema

Hoje a "lista de arquivos" de cada task na TreeView é o conjunto de **abas
abertas** no editor (`EditorService.capture()`, consumido por
`TaskTreeProvider`). Isso gera os problemas relatados:

1. Qualquer arquivo aberto aparece na lista, mesmo sem alteração.
2. Não há visão das alterações reais (modificados / incluídos / excluídos) nem
   de um total.
3. Não existe um escopo "Geral" visível. Quando não há task ativa, o contexto
   solto fica num limbo invisível; ao criar/trocar de task o `git reset --hard`
   reverte a working tree e "o código some" — as alterações vão para o stash
   geral, mas o usuário não tem como ver nem voltar facilmente.

As alterações reais já são capturadas como **patch** por task
(`.taskkeeper/patches/{id}.patch`), mas nunca são exibidas.

## Objetivo

Reorientar a TreeView para mostrar as **alterações git** de cada escopo,
categorizadas, com um total de delta de linhas, ordenadas pela última vez que o
escopo esteve ativo, e tornar o **Geral** um escopo de primeira classe e
visível para que a troca de contexto seja previsível.

## Decisões (do brainstorming)

- **Fonte da lista**: alterações git (working tree / patch), não abas abertas.
- **Geral = home base**: escopo ativo sempre que nenhuma task está ativa;
  sempre visível no topo; trocar para uma task guarda o Geral, voltar restaura.
- **Total**: delta de linhas (inserções − remoções), estilo diffstat.
- **Cálculo dos números (Approach A)**: derivar do patch sob demanda; live para
  o escopo ativo. Sem migração de schema, fonte única (o patch).
- **Layout**: lista **plana** de arquivos com ícone de status M/A/D; resumo
  compacto na linha do escopo.
- **Ordenação**: por `lastActiveAt` desc; Geral fixo no topo; arquivadas no fim.

## Arquitetura

### Conceito de "escopo"

Um **escopo** é o dono da working tree: ou o **Geral** ou uma **Task**.
Reframe do modelo atual: `activeTaskId === undefined` passa a significar
explicitamente "**Geral ativo**" (não mais um limbo).

Troca de escopo é uniforme:

```
shelve(escopo atual) → reverter working tree → restore(escopo destino)
```

- Task → Geral: aplica `__general__.patch` + restaura abas/breakpoints/bookmarks
  do `general.json`.
- Geral → Task: faz shelve do Geral (`general.json` + `__general__.patch`),
  aplica o patch da task.
- Task → Task: shelve da atual, restore da destino (Geral não entra no meio).

O prompt "vincular contexto solto?" é reescrito para referenciar o Geral
("vincular as alterações do Geral à task?"), eliminando o mistério.

### Modelo de dados

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

`TaskContext` ganha `lastActiveAt?: number` (setado na ativação; fallback para
`updatedAt` em tasks antigas). `OpenFileSnapshot[]` continua sendo capturado e
restaurado para reabrir abas na troca — apenas **deixa de ser** a fonte da
lista da árvore.

### `GitService` — novos métodos

- `liveChangeStat(): Promise<ChangeStat>` — escopo ativo, a partir da working
  tree:
  - `git diff --numstat HEAD` → inserções/remoções por arquivo versionado.
  - `git diff --name-status HEAD` → status (M/A/D) por arquivo versionado.
  - untracked via `ls-files --others --exclude-standard` adicionados como
    `added` (reaproveitar o truque de `add -N` já usado em `captureChanges`,
    com cleanup `reset`), contando linhas via `numstat`.
- `patchChangeStat(patchFile: string): Promise<ChangeStat>` — escopo inativo, a
  partir do patch salvo:
  - `git apply --numstat <patch>` → inserções/remoções + path.
  - `git apply --summary <patch>` → linhas `create mode` / `delete mode` para
    derivar status; ausência → `modified`.

Arquivos binários (numstat com `-`) contam como 0/0 linhas mas aparecem na
categoria correta.

### `TaskTreeProvider` — assíncrono + cache

- `getChildren` passa a ser assíncrono (VS Code suporta `Thenable`).
- Cache de `ChangeStat` por escopo:
  - escopo ativo: recalculado a cada `refresh()`.
  - escopo inativo: chaveado por mtime do arquivo de patch; recalcula só quando
    o patch muda.
- Para o escopo sem patch (sem alterações), `ChangeStat` vazio.

## Layout da TreeView

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

- **Topo fixo: Geral.** Marcado como ativo (●) quando nenhuma task está ativa.
- **Tasks** ordenadas por `lastActiveAt` desc; a ativa marcada (✓ / "ativa").
- **Tasks arquivadas**: pasta colapsável no fim (comportamento atual mantido).
- **Resumo na linha do escopo** (`description`): `~mod +add −del  ⬆ins ⬇del`.
  O total pedido é o delta de linhas (⬆/⬇).
- **Filhos = lista plana** de `FileChange`, ordenada modificados → incluídos →
  excluídos, depois por path. Cada arquivo:
  - ícone/letra de status M/A/D (com cor de tema),
  - `description` = diretório + `⬆ins ⬇del` do arquivo,
  - clique abre o arquivo (`vscode.open`).
- Escopo sem alterações: sem filhos (não-expansível); resumo vazio ou "sem
  alterações".

## Comportamento de troca (previsibilidade)

- Toast ao trocar deixa explícito o destino do contexto, ex.:
  "Geral guardado (3 alterações)" / "Task X ativada (5 alterações restauradas)".
- Conflito de patch: mantém o aviso atual + patch preservado.
- Fora de repositório git: escopos mostram "alterações indisponíveis (sem git)";
  só abas/breakpoints/bookmarks são preservados (igual hoje).

## Fora de escopo

- Stage/unstage de arquivos pela árvore.
- Diff inline / preview de hunks.
- Edição do patch.
- Multi-workspace folder.

## Critérios de aceite

- [ ] A lista de cada escopo mostra alterações git (M/A/D), não abas abertas.
- [ ] Arquivo aberto e não modificado **não** aparece na lista.
- [ ] Cada escopo mostra contagem de modificados/incluídos/excluídos.
- [ ] Cada escopo mostra delta de linhas (inserções/remoções) como total.
- [ ] Tasks ordenadas pela última vez ativa (`lastActiveAt`).
- [ ] Geral aparece fixo no topo e é ativável; voltar ao Geral restaura as
      alterações guardadas.
- [ ] Trocar de task não "perde" o código: o contexto vai para o Geral
      (visível) e é recuperável.
- [ ] Números de tasks inativas derivam do patch salvo (Approach A).
- [ ] Fallback sem git: mensagem clara, restauração de abas/breakpoints/bookmarks.
