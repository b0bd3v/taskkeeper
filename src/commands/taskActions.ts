import * as vscode from 'vscode';

import { refreshUi, taskIdFrom, type CommandDeps } from './types';

export function registerTaskActionCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const renameTask = vscode.commands.registerCommand(
    'taskkeeper.renameTask',
    async (arg?: unknown) => {
      const taskId = taskIdFrom(arg);
      const task = taskId ? deps.store.getTask(taskId) : undefined;
      if (!task) {
        void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
        return;
      }

      const newTitle = await vscode.window.showInputBox({
        title: 'TaskKeeper — Renomear task',
        prompt: 'Novo título da task',
        value: task.title,
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim() ? undefined : 'O título não pode ficar vazio.',
      });

      if (newTitle === undefined) {
        return;
      }

      const trimmed = newTitle.trim();
      if (trimmed === task.title) {
        return;
      }

      await deps.store.renameTask(task.id, trimmed);
      refreshUi(deps, 'scopes');
      void vscode.window.showInformationMessage(
        `TaskKeeper: task renomeada para "${trimmed}".`,
      );
    },
  );

  const deleteTask = vscode.commands.registerCommand(
    'taskkeeper.deleteTask',
    async (arg?: unknown) => {
      const taskId = taskIdFrom(arg);
      const task = taskId ? deps.store.getTask(taskId) : undefined;
      if (!task) {
        void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
        return;
      }

      await confirmDeleteOrArchive(deps, task.id, task.title);
    },
  );

  const completeTask = vscode.commands.registerCommand(
    'taskkeeper.completeTask',
    async (arg?: unknown) => {
      const taskId = taskIdFrom(arg);
      const task = taskId ? deps.store.getTask(taskId) : undefined;
      if (!task) {
        void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
        return;
      }

      const choice = await vscode.window.showQuickPick(
        [
          {
            label: '$(archive) Arquivar',
            description: 'Mantém o histórico na pasta de tasks arquivadas',
            action: 'archive' as const,
          },
          {
            label: '$(trash) Excluir',
            description: 'Remove a task e o patch associado',
            action: 'delete' as const,
          },
        ],
        {
          title: `TaskKeeper — Concluir "${task.title}"`,
          placeHolder: 'O que fazer com a task concluída?',
          ignoreFocusOut: true,
        },
      );

      if (!choice) {
        return;
      }

      if (choice.action === 'archive') {
        await deps.store.setStatus(task.id, 'archived');
        refreshUi(deps, 'full');
        void vscode.window.showInformationMessage(
          `TaskKeeper: task "${task.title}" concluída e arquivada.`,
        );
        return;
      }

      await confirmDeleteOrArchive(deps, task.id, task.title, {
        skipArchiveOption: true,
      });
    },
  );

  context.subscriptions.push(renameTask, deleteTask, completeTask);
}

async function confirmDeleteOrArchive(
  deps: CommandDeps,
  taskId: string,
  title: string,
  options: { skipArchiveOption?: boolean } = {},
): Promise<void> {
  const isActive = deps.store.getActiveTaskId() === taskId;
  const detail = isActive
    ? 'Esta é a task ativa. O patch salvo será removido ao excluir.'
    : 'O patch salvo desta task será removido ao excluir.';

  const choice = options.skipArchiveOption
    ? await vscode.window.showWarningMessage(
        `Excluir a task "${title}"?`,
        { modal: true, detail },
        'Excluir',
      )
    : await vscode.window.showWarningMessage(
        `Excluir a task "${title}"?`,
        { modal: true, detail },
        'Excluir',
        'Arquivar',
      );

  if (choice === 'Arquivar') {
    await deps.store.setStatus(taskId, 'archived');
    refreshUi(deps, 'full');
    void vscode.window.showInformationMessage(
      `TaskKeeper: task "${title}" arquivada.`,
    );
    return;
  }

  if (choice === 'Excluir') {
    await deps.switcher.deleteTask(taskId);
    refreshUi(deps, 'full');
    void vscode.window.showInformationMessage(
      `TaskKeeper: task "${title}" excluída.`,
    );
  }
}
