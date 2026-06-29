import * as vscode from 'vscode';

import type { CreateTaskFormResult } from '../models/taskContext';

interface ContextChoice extends vscode.QuickPickItem {
  createNewContext: boolean;
}

export async function showCreateTaskForm(): Promise<
  CreateTaskFormResult | undefined
> {
  const title = await vscode.window.showInputBox({
    title: 'TaskKeeper — Nova task',
    prompt: 'Informe o título da task (ex.: JIRA-1234, fix login timeout)',
    placeHolder: 'Título da task',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) {
        return 'O título não pode ficar vazio.';
      }

      return undefined;
    },
  });

  if (title === undefined) {
    return undefined;
  }

  const contextChoice = await vscode.window.showQuickPick<ContextChoice>(
    [
      {
        label: '$(new-folder) Sim, criar contexto novo',
        description: 'Salva o estado da task atual antes de abrir a nova',
        detail:
          'Patch, breakpoints e bookmarks da task anterior seriam preservados (não implementado ainda).',
        createNewContext: true,
        picked: true,
      },
      {
        label: '$(folder) Não, manter contexto atual',
        description: 'Apenas registra a nova task sem trocar o contexto salvo',
        detail: 'Útil quando você quer organizar sem serializar alterações agora.',
        createNewContext: false,
      },
    ],
    {
      title: 'TaskKeeper — Contexto',
      placeHolder: 'Deseja criar um contexto novo?',
      ignoreFocusOut: true,
    },
  );

  if (!contextChoice) {
    return undefined;
  }

  return {
    title: title.trim(),
    createNewContext: contextChoice.createNewContext,
  };
}
