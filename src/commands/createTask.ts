import * as vscode from 'vscode';

import type { TaskStore } from '../services/taskStore';
import type { TaskTreeProvider } from '../views/taskTreeProvider';
import type { TaskStatusBar } from '../ui/statusBar';
import { showCreateTaskForm } from '../ui/createTaskForm';

interface CreateTaskDeps {
  store: TaskStore;
  treeProvider: TaskTreeProvider;
  statusBar: TaskStatusBar;
}

export function registerCreateTaskCommand(
  context: vscode.ExtensionContext,
  deps: CreateTaskDeps,
): void {
  const command = vscode.commands.registerCommand(
    'taskkeeper.createTask',
    async () => {
      const form = await showCreateTaskForm();
      if (!form) {
        return;
      }

      const task = deps.store.createTask(form.title, form.createNewContext);

      deps.treeProvider.refresh();
      deps.statusBar.refresh();

      const contextLabel = form.createNewContext
        ? 'com contexto novo (simulado)'
        : 'sem trocar contexto salvo';

      void vscode.window.showInformationMessage(
        `TaskKeeper: task "${task.title}" criada ${contextLabel}.`,
      );
    },
  );

  context.subscriptions.push(command);
}
