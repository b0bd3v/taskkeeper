# TaskKeeper

Extensão Cursor/VS Code para alternar entre tickets de suporte sem perder breakpoints, bookmarks e alterações locais.

> Especificação completa: [docs/SPECIFICATION.md](docs/SPECIFICATION.md)

## Desenvolvimento

```bash
npm install
npm run watch    # terminal 1
```

No Cursor: **Run → Start Debugging** (F5) ou configuração **Run Extension**.

## Como funciona

Cada task isola o seu contexto de trabalho. Ao **sair** de uma task (trocar ou criar outra), o TaskKeeper salva e remove do ambiente:

- **Alterações da working tree** — `git diff --binary HEAD` (incluindo arquivos novos) é salvo como patch em `.taskkeeper/patches/{id}.patch` e a árvore é revertida a HEAD. Estilo *shelve* do JetBrains: as mudanças daquela task somem da tela enquanto você está em outra.
- **Editores abertos** + buffers não salvos.
- **Breakpoints** (Debug API) e **bookmarks** (extensão `alefragnani.Bookmarks` com `saveBookmarksInProject`).

Ao **entrar** numa task, o patch é reaplicado (`git apply --3way`) e abas/breakpoints/bookmarks são restaurados por cima. Em caso de conflito, a troca acontece mesmo assim e o patch é preservado em `.taskkeeper/patches/`.

Quando **nenhuma task está ativa**, o escopo **Geral** está ativo — alterações, abas, breakpoints e bookmarks ficam nele e aparecem no topo da sidebar. Ao **ativar uma task**, o Geral é guardado (`.taskkeeper/general.json` + `__general__.patch`) e permanece visível na lista; voltar ao Geral restaura tudo.

Se o Geral tem alterações ao criar/ativar uma task, o TaskKeeper pergunta se você quer **vinculá-las** à task de destino. Se recusar, o Geral fica guardado e visível — nada some sem rastro.

Fora de um repositório git, o shelve de alterações é ignorado — apenas abas, breakpoints e bookmarks são preservados; a sidebar mostra `alterações indisponíveis (sem git)`.

> O `git reset --hard` só ocorre **depois** de salvar o patch, então nada é perdido (recuperável em `.taskkeeper/patches/`).

## Sidebar — lista orientada a alterações

A TreeView mostra **alterações git** (modificados / incluídos / excluídos) de cada escopo — não abas abertas. Arquivo aberto sem alteração **não** aparece.

```
● Geral                    ~2 +1 −1  ⬆12 ⬇4
✓ JIRA-123                 ~5 +0 −2  ⬆80 ⬇10
○ fix-login                ~1 +0 −0  ⬆3 ⬇1
```

- **Geral** fixo no topo; ativo quando nenhuma task está selecionada.
- **Tasks** ordenadas pela última vez ativa; a ativa marcada com ✓.
- Cada linha resume contagem M/A/D e delta de linhas (⬆ inserções, ⬇ remoções).
- Expandir um escopo mostra a lista plana de arquivos com status M/A/D; clique abre o arquivo.

## Status

v0.0.4 — escopo Geral de primeira classe, lista de alterações git na sidebar, abrir arquivos de alteração direto pela sidebar e toasts ao trocar escopo.

### Comandos

| Comando | Atalho visual |
|---------|---------------|
| `TaskKeeper: Create Task` | Ícone `+` na sidebar |
| `TaskKeeper: Switch Task` | Ícone swap na sidebar / status bar |
| `TaskKeeper: Activate General Scope` | Ícone ▶ no item Geral |
| `TaskKeeper: Refresh` | Ícone refresh na sidebar |

Sidebar: ícone **TaskKeeper** (`checklist`) na activity bar.
