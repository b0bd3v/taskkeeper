import * as vscode from 'vscode';

import type { TaskSummary } from '../models/taskContext';
import { GENERAL_PATCH_ID } from '../services/taskStore';
import { formatRelativeDay } from '../utils/dayTime';

interface TaskPickItem extends vscode.QuickPickItem {
  taskId: string;
}

export async function showTaskSelection(
  tasks: TaskSummary[],
  options?: { includeGeneral?: boolean; generalDescription?: string },
): Promise<string | undefined> {
  const items: TaskPickItem[] = [];

  if (options?.includeGeneral) {
    items.push({
      label: '$(home) Geral',
      description: options.generalDescription ?? 'escopo base',
      detail: 'Alterações que não pertencem a nenhuma task',
      taskId: GENERAL_PATCH_ID,
    });
  }

  items.push(
    ...tasks.map((task) => ({
      label: task.isActive ? `$(check) ${task.title}` : task.title,
      description: formatRelativeDay(task.lastActiveAt),
      detail: `${task.breakpointCount} breakpoints · ${task.bookmarkCount} bookmarks`,
      taskId: task.id,
      picked: task.isActive,
    })),
  );

  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      'TaskKeeper: nenhuma task cadastrada. Use "Create Task" para começar.',
    );
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(items, {
    title: 'TaskKeeper — Trocar task',
    placeHolder: 'Selecione a task para ativar',
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.taskId;
}
