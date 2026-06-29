import * as vscode from 'vscode';

import { registerCreateTaskCommand } from './commands/createTask';
import { registerSwitchTaskCommands } from './commands/switchTask';
import { registerTaskActionCommands } from './commands/taskActions';
import type { CommandDeps } from './commands/types';
import { BookmarkService } from './services/bookmarkService';
import { ChangeStatCache } from './services/changeStatCache';
import { BreakpointService } from './services/breakpointService';
import { ContextSwitcher } from './services/contextSwitcher';
import { EditorService } from './services/editorService';
import { GitService } from './services/gitService';
import { TaskStore } from './services/taskStore';
import { TaskStatusBar } from './ui/statusBar';
import { TaskTreeProvider } from './views/taskTreeProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage(
      'TaskKeeper: abra uma pasta ou workspace para usar a extensão.',
    );
    return;
  }

  const workspaceRoot = folder.uri.fsPath;

  const store = new TaskStore(workspaceRoot);
  await store.load();

  const editor = new EditorService(workspaceRoot);
  const breakpoints = new BreakpointService(workspaceRoot);
  const bookmarks = new BookmarkService(workspaceRoot);
  const git = new GitService(workspaceRoot);
  const switcher = new ContextSwitcher({
    store,
    editor,
    breakpoints,
    bookmarks,
    git,
  });

  const changeStatCache = new ChangeStatCache(git, store);
  const treeProvider = new TaskTreeProvider(store, changeStatCache, git, workspaceRoot);
  const statusBar = new TaskStatusBar(store);

  const treeView = vscode.window.createTreeView('taskkeeper.tasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  treeProvider.attachView(treeView);

  const deps: CommandDeps = { store, switcher, git, treeProvider, statusBar };

  registerCreateTaskCommand(context, deps);
  registerSwitchTaskCommands(context, deps);
  registerTaskActionCommands(context, deps);

  statusBar.show();

  const refreshIndicators = (): void => {
    treeProvider.refresh();
    statusBar.refresh();
  };

  // Atualização imediata em eventos discretos (abrir/fechar abas, salvar,
  // mudar de editor, breakpoints).
  const immediate = vscode.Disposable.from(
    vscode.window.tabGroups.onDidChangeTabs(refreshIndicators),
    vscode.window.onDidChangeActiveTextEditor(refreshIndicators),
    vscode.workspace.onDidSaveTextDocument(refreshIndicators),
    vscode.debug.onDidChangeBreakpoints(refreshIndicators),
  );

  // Edições no buffer (dirty) são frequentes — refletimos com debounce curto.
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const onEdit = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.scheme !== 'file') {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(refreshIndicators, 250);
  });

  context.subscriptions.push(
    treeView,
    statusBar,
    immediate,
    onEdit,
    new vscode.Disposable(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    }),
  );
}

export function deactivate(): void {}
