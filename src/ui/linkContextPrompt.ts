import * as vscode from 'vscode';

interface LinkChoice extends vscode.QuickPickItem {
  link: boolean;
}

/**
 * Pergunta, quando NÃO há task ativa, se o contexto do Geral deve ser vinculado
 * à task de destino. Retorna `undefined` se o usuário cancelar.
 */
export async function promptLinkLooseContext(
  targetTitle: string,
  action: 'create' | 'switch',
): Promise<boolean | undefined> {
  const verb = action === 'create' ? 'nova task' : 'task';

  const choice = await vscode.window.showQuickPick<LinkChoice>(
    [
      {
        label: '$(link) Vincular à task',
        description: `Anexa o Geral à ${verb} "${targetTitle}"`,
        detail:
          'As alterações atuais do Geral passam a pertencer a esta task.',
        link: true,
        picked: true,
      },
      {
        label: '$(circle-slash) Não vincular',
        description: 'Guarda o Geral e abre a task com o seu próprio contexto',
        detail:
          'A task será aberta com o seu próprio contexto; o Geral fica guardado e visível na lista.',
        link: false,
      },
    ],
    {
      title: 'TaskKeeper — Alterações do Geral',
      placeHolder:
        'Há alterações no Geral (arquivos, breakpoints, bookmarks). O que fazer?',
      ignoreFocusOut: true,
    },
  );

  return choice?.link;
}
