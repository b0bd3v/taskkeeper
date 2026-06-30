import * as vscode from 'vscode';

import { registerCreateTaskCommand } from './commands/createTask';
import { registerOpenChangeFileCommand } from './commands/openChangeFile';
import { registerOpenFileAtLineCommand } from './commands/openFileAtLine';
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
  const treeProvider = new TaskTreeProvider(
    store,
    changeStatCache,
    git,
    breakpoints,
    bookmarks,
  );
  const statusBar = new TaskStatusBar(store);

  const treeView = vscode.window.createTreeView('taskkeeper.tasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  treeProvider.attachView(treeView);

  const deps: CommandDeps = {
    store,
    switcher,
    git,
    treeProvider,
    statusBar,
    workspaceRoot,
  };

  registerCreateTaskCommand(context, deps);
  registerSwitchTaskCommands(context, deps);
  registerTaskActionCommands(context, deps);
  registerOpenChangeFileCommand(context, deps);
  registerOpenFileAtLineCommand(context, workspaceRoot);

  statusBar.show();

  const refreshIndicators = (): void => {
    treeProvider.refreshLiveStats();
    statusBar.refresh();
  };

  // Atualização imediata em eventos discretos que afetam alterações git.
  const immediate = vscode.Disposable.from(
    vscode.workspace.onDidSaveTextDocument(refreshIndicators),
    vscode.debug.onDidChangeBreakpoints(refreshIndicators),
  );

  const bookmarkWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '.vscode/bookmarks.json'),
  );
  bookmarkWatcher.onDidChange(refreshIndicators);
  bookmarkWatcher.onDidCreate(refreshIndicators);
  bookmarkWatcher.onDidDelete(refreshIndicators);

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
    bookmarkWatcher,
    onEdit,
    new vscode.Disposable(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    }),
  );
}

export function deactivate(): void {}
