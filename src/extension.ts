import * as vscode from 'vscode';

import { registerCreateTaskCommand } from './commands/createTask';
import { registerSwitchTaskCommand } from './commands/switchTask';
import { TaskStore } from './services/taskStore';
import { TaskStatusBar } from './ui/statusBar';
import { TaskTreeProvider } from './views/taskTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const store = new TaskStore();
  const treeProvider = new TaskTreeProvider(store);
  const statusBar = new TaskStatusBar(store);

  const treeView = vscode.window.createTreeView('taskkeeper.tasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  registerCreateTaskCommand(context, { store, treeProvider, statusBar });
  registerSwitchTaskCommand(context, { store, treeProvider, statusBar });

  statusBar.show();

  context.subscriptions.push(treeView, statusBar);
}

export function deactivate(): void {}
