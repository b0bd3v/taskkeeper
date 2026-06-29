# TaskKeeper

Extensão Cursor/VS Code para alternar entre tickets de suporte sem perder breakpoints, bookmarks e alterações locais.

> Especificação completa: [docs/SPECIFICATION.md](docs/SPECIFICATION.md)

## Desenvolvimento

```bash
npm install
npm run watch    # terminal 1
```

No Cursor: **Run → Start Debugging** (F5) ou configuração **Run Extension**.

Teste: `Cmd+Shift+P` → `TaskKeeper: Hello World`

## Status

v0.0.2 — interface UI (formulário, lista, seleção). Persistência, patches, breakpoints e bookmarks ainda não implementados.

### Comandos

| Comando | Atalho visual |
|---------|---------------|
| `TaskKeeper: Create Task` | Ícone `+` na sidebar |
| `TaskKeeper: Switch Task` | Ícone swap na sidebar / status bar |
| `TaskKeeper: Refresh` | Ícone refresh na sidebar |

Sidebar: ícone **TaskKeeper** (`checklist`) na activity bar.
