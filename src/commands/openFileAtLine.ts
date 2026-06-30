import * as path from 'node:path';

import * as vscode from 'vscode';

export interface OpenFileAtLineArgs {
  relativePath: string;
  line: number;
}

export function registerOpenFileAtLineCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): void {
  const disposable = vscode.commands.registerCommand(
    'taskkeeper.openFileAtLine',
    async (args?: OpenFileAtLineArgs) => {
      if (!args?.relativePath || args.line === undefined) {
        return;
      }

      const uri = vscode.Uri.file(path.join(workspaceRoot, args.relativePath));
      const position = new vscode.Position(Math.max(0, args.line), 0);
      await vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(position, position),
      });
    },
  );

  context.subscriptions.push(disposable);
}
