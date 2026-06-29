import * as vscode from 'vscode';

import type { TaskStore } from '../services/taskStore';

export class TaskStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly store: TaskStore) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      Number.MAX_SAFE_INTEGER,
    );
    this.item.command = 'taskkeeper.switchTask';
  }

  show(): void {
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    const activeTask = this.store.getActiveTask();

    if (!activeTask) {
      this.item.text = '$(home) Geral';
      this.item.tooltip = 'TaskKeeper: escopo Geral ativo — clique para trocar';
      this.item.backgroundColor = undefined;
      return;
    }

    this.item.text = `$(target) ${activeTask.title}`;
    this.item.tooltip = new vscode.MarkdownString(
      `**Task ativa:** ${activeTask.title}\n\nClique para trocar de task.`,
    );
    this.item.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground',
    );
  }

  dispose(): void {
    this.item.dispose();
  }
}
