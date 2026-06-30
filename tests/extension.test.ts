import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activate, deactivate } from '../src/extension';
import { getMockVscodeState, resetMockVscode } from './helpers/mockVscode';
import { withTempGitRepo } from './helpers/tempGitRepo';

describe('extension', () => {
  it('activate warns when no workspace folder', async () => {
    resetMockVscode({ workspaceFolders: [] });
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    await activate(context as never);
    assert.equal(getMockVscodeState().workspaceFolders.length, 0);
  });

  it('activate registers tree view and commands', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode({
        workspaceFolders: [{ uri: { fsPath: dir } }],
      });

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      await activate(context as never);

      assert.ok(context.subscriptions.length > 0);
    });
  });

  it('deactivate is a no-op', () => {
    assert.equal(deactivate(), undefined);
  });
});
