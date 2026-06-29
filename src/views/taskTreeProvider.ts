import * as vscode from 'vscode';

import type { TaskSummary } from '../models/taskContext';
import type { TaskStore } from '../services/taskStore';

type TaskTreeNode = TaskItem | MessageItem;

class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(
    readonly summary: TaskSummary,
    commandId: string,
  ) {
    super(summary.title, vscode.TreeItemCollapsibleState.None);

    this.id = summary.id;
    this.description = summary.isActive ? 'ativa' : undefined;
    this.tooltip = buildTooltip(summary);
    this.contextValue = summary.isActive ? 'taskkeeper.task.active' : 'taskkeeper.task';
    this.iconPath = new vscode.ThemeIcon(
      summary.isActive ? 'check' : 'circle-outline',
    );
    this.command = {
      command: commandId,
      title: 'Ativar task',
      arguments: [summary.id],
    };
  }
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TaskTreeNode | undefined
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: TaskStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(): TaskTreeNode[] {
    const tasks = this.store.listSummaries();

    if (tasks.length === 0) {
      return [
        new MessageItem('Nenhuma task ainda'),
        new MessageItem('Use "Create Task" para adicionar'),
      ];
    }

    return tasks.map(
      (summary) => new TaskItem(summary, 'taskkeeper.selectTaskFromTree'),
    );
  }
}

function buildTooltip(summary: TaskSummary): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${summary.title}**\n\n`);
  markdown.appendMarkdown(
    `- Breakpoints: ${summary.breakpointCount}\n- Bookmarks: ${summary.bookmarkCount}\n- Atualizada: ${new Date(summary.updatedAt).toLocaleString()}`,
  );
  return markdown;
}
