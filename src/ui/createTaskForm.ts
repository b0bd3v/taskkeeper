import * as vscode from 'vscode';

/** Pede apenas o título da nova task. */
export async function showCreateTaskForm(): Promise<string | undefined> {
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

  return title?.trim() || undefined;
}
