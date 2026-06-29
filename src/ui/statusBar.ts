import * as vscode from 'vscode';

import type { TaskStore } from '../services/taskStore';

export class TaskStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly store: TaskStore) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = 'taskkeeper.switchTask';
    this.item.tooltip = 'TaskKeeper: trocar task ativa';
  }

  show(): void {
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    const activeTask = this.store.getActiveTask();

    if (!activeTask) {
      this.item.text = '$(checklist) TaskKeeper: nenhuma task';
      this.item.backgroundColor = undefined;
      return;
    }

    this.item.text = `$(checklist) Task: ${activeTask.title}`;
    this.item.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.prominentBackground',
    );
  }

  dispose(): void {
    this.item.dispose();
  }
}
