import * as vscode from 'vscode';

import type { TaskSummary } from '../models/taskContext';

interface TaskPickItem extends vscode.QuickPickItem {
  taskId: string;
}

export async function showTaskSelection(
  tasks: TaskSummary[],
): Promise<string | undefined> {
  if (tasks.length === 0) {
    void vscode.window.showInformationMessage(
      'TaskKeeper: nenhuma task cadastrada. Use "Create Task" para começar.',
    );
    return undefined;
  }

  const items: TaskPickItem[] = tasks.map((task) => ({
    label: task.isActive ? `$(check) ${task.title}` : task.title,
    description: formatRelativeTime(task.updatedAt),
    detail: `${task.breakpointCount} breakpoints · ${task.bookmarkCount} bookmarks`,
    taskId: task.id,
    picked: task.isActive,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: 'TaskKeeper — Trocar task',
    placeHolder: 'Selecione a task para ativar',
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.taskId;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'agora';
  }

  if (diffMinutes < 60) {
    return `há ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `há ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays} d`;
}
