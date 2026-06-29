import * as vscode from 'vscode';

import type { TaskStore } from '../services/taskStore';
import type { TaskTreeProvider } from '../views/taskTreeProvider';
import type { TaskStatusBar } from '../ui/statusBar';
import { showTaskSelection } from '../ui/taskQuickPick';

interface SwitchTaskDeps {
  store: TaskStore;
  treeProvider: TaskTreeProvider;
  statusBar: TaskStatusBar;
}

export function registerSwitchTaskCommand(
  context: vscode.ExtensionContext,
  deps: SwitchTaskDeps,
): void {
  const switchTask = vscode.commands.registerCommand(
    'taskkeeper.switchTask',
    async () => {
      const taskId = await showTaskSelection(deps.store.listSummaries());
      if (!taskId) {
        return;
      }

      activateTask(taskId, deps, 'TaskKeeper: task ativada via seleção.');
    },
  );

  const selectFromTree = vscode.commands.registerCommand(
    'taskkeeper.selectTaskFromTree',
    async (taskId: string) => {
      if (!taskId) {
        return;
      }

      activateTask(taskId, deps, 'TaskKeeper: task ativada pela lista.');
    },
  );

  const refreshTasks = vscode.commands.registerCommand(
    'taskkeeper.refreshTasks',
    () => {
      deps.treeProvider.refresh();
      deps.statusBar.refresh();
      void vscode.window.showInformationMessage('TaskKeeper: lista atualizada.');
    },
  );

  context.subscriptions.push(switchTask, selectFromTree, refreshTasks);
}

function activateTask(
  taskId: string,
  deps: SwitchTaskDeps,
  message: string,
): void {
  const task = deps.store.setActiveTask(taskId);
  if (!task) {
    void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
    return;
  }

  deps.treeProvider.refresh();
  deps.statusBar.refresh();
  void vscode.window.showInformationMessage(`${message} "${task.title}"`);
}
