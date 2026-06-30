import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EditorService } from '../src/services/editorService';
import { getMockVscodeState, resetMockVscode } from './helpers/mockVscode';

describe('EditorService', () => {
  it('capture collects open text tabs in workspace', () => {
    const vscode = require('vscode') as {
      Uri: { file: (p: string) => { fsPath: string; scheme: string } };
      TabInputText: new (uri: { fsPath: string; scheme: string }) => unknown;
    };

    const uri = vscode.Uri.file('/workspace/src/a.ts');
    resetMockVscode({
      tabGroups: [
        {
          viewColumn: 1,
          tabs: [{ input: new vscode.TabInputText(uri) }],
        },
      ],
      textDocuments: [
        {
          uri: { fsPath: uri.fsPath, scheme: 'file' },
          isDirty: true,
          getText: () => 'dirty content',
        },
      ],
    });

    const service = new EditorService('/workspace');
    const captured = service.capture();

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.path, 'src/a.ts');
    assert.equal(captured[0]?.isDirty, true);
    assert.equal(captured[0]?.content, 'dirty content');
  });

  it('capture skips non-file and duplicate tabs', () => {
    const vscode = require('vscode') as {
      Uri: { file: (p: string) => { fsPath: string; scheme: string } };
      TabInputText: new (uri: { fsPath: string; scheme: string }) => unknown;
    };

    const fileUri = vscode.Uri.file('/workspace/a.ts');
    const otherScheme = { fsPath: '/workspace/b.ts', scheme: 'untitled' };

    resetMockVscode({
      tabGroups: [
        {
          tabs: [
            { input: new vscode.TabInputText(fileUri) },
            { input: new vscode.TabInputText(fileUri) },
            { input: new vscode.TabInputText(otherScheme) },
            { input: { kind: 'terminal' } },
          ],
        },
      ],
      textDocuments: [],
    });

    const service = new EditorService('/workspace');
    assert.equal(service.capture().length, 1);
  });

  it('restore opens documents and applies dirty content', async () => {
    resetMockVscode();
    const service = new EditorService('/workspace');
    await service.restore([
      { path: 'src/new.ts', isDirty: true, content: 'hello', viewColumn: 1 },
    ]);

    const docs = getMockVscodeState().textDocuments;
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.uri.fsPath.endsWith('src/new.ts'), true);
  });

  it('restore no-ops for empty snapshots', async () => {
    resetMockVscode();
    const service = new EditorService('/workspace');
    await service.restore(undefined);
    await service.restore([]);
    assert.equal(getMockVscodeState().textDocuments.length, 0);
  });

  it('clearEditors executes revert and close commands', async () => {
    resetMockVscode({
      textDocuments: [
        {
          uri: { fsPath: '/workspace/dirty.ts', scheme: 'file' },
          isDirty: true,
          getText: () => 'x',
        },
      ],
    });

    const service = new EditorService('/workspace');
    await service.clearEditors();

    const commands = getMockVscodeState().executedCommands.map((c) => c.command);
    assert.ok(commands.includes('workbench.action.files.revert'));
    assert.ok(commands.includes('workbench.action.closeAllEditors'));
  });
});
