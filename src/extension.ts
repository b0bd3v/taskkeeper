import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const helloWorld = vscode.commands.registerCommand(
    'taskkeeper.helloWorld',
    () => {
      void vscode.window.showInformationMessage(
        'TaskKeeper: Hello World — extensão pronta para desenvolvimento.',
      );
    },
  );

  context.subscriptions.push(helloWorld);
}

export function deactivate(): void {}
