import * as path from 'node:path';

import * as vscode from 'vscode';

import type { OpenFileSnapshot } from '../models/taskContext';

/**
 * Captura e restaura o conjunto de editores abertos e seus buffers não salvos.
 * Abordagem git-free: o "contexto de arquivos" de uma task é o que está aberto
 * no editor, incluindo alterações pendentes (dirty).
 */
export class EditorService {
  constructor(private readonly workspaceRoot: string) {}

  capture(): OpenFileSnapshot[] {
    const seen = new Set<string>();
    const result: OpenFileSnapshot[] = [];

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (!(input instanceof vscode.TabInputText)) {
          continue;
        }

        const uri = input.uri;
        if (uri.scheme !== 'file') {
          continue;
        }

        const relative = this.toRelative(uri);
        if (seen.has(relative)) {
          continue;
        }
        seen.add(relative);

        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.fsPath === uri.fsPath,
        );
        const isDirty = doc?.isDirty ?? false;

        result.push({
          path: relative,
          isDirty,
          content: isDirty ? doc?.getText() : undefined,
          viewColumn: group.viewColumn,
        });
      }
    }

    return result;
  }

  /**
   * Descarta alterações pendentes (já capturadas em snapshot) e fecha todos os
   * editores, sem disparar diálogos de "salvar?".
   */
  async clearEditors(): Promise<void> {
    const dirtyDocs = vscode.workspace.textDocuments.filter(
      (d) => d.isDirty && d.uri.scheme === 'file',
    );

    for (const doc of dirtyDocs) {
      try {
        await vscode.window.showTextDocument(doc, { preview: false });
        await vscode.commands.executeCommand('workbench.action.files.revert');
      } catch {
        // ignora editores que não puderam ser revertidos
      }
    }

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }

  async restore(snapshots: OpenFileSnapshot[] | undefined): Promise<void> {
    if (!snapshots || snapshots.length === 0) {
      return;
    }

    for (const snap of snapshots) {
      const uri = vscode.Uri.file(this.toAbsolute(snap.path));

      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        continue;
      }

      const options: vscode.TextDocumentShowOptions = { preview: false };
      if (snap.viewColumn !== undefined) {
        options.viewColumn = snap.viewColumn as vscode.ViewColumn;
      }
      await vscode.window.showTextDocument(doc, options);

      if (
        snap.isDirty &&
        snap.content !== undefined &&
        doc.getText() !== snap.content
      ) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        edit.replace(uri, fullRange, snap.content);
        await vscode.workspace.applyEdit(edit);
      }
    }
  }

  private toRelative(uri: vscode.Uri): string {
    return path.relative(this.workspaceRoot, uri.fsPath);
  }

  private toAbsolute(relative: string): string {
    return path.isAbsolute(relative)
      ? relative
      : path.join(this.workspaceRoot, relative);
  }
}
