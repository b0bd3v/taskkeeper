import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaskStatusBar } from '../src/ui/statusBar';
import { TaskStore } from '../src/services/taskStore';
import { resetMockVscode } from './helpers/mockVscode';
import { withTempDir } from './helpers/tempDir';

describe('TaskStatusBar', () => {
  it('shows Geral when no active task', async () => {
    await withTempDir('taskkeeper-status-', async (dir) => {
      resetMockVscode();
      const store = new TaskStore(dir);
      await store.load();
      await store.clearActiveTask();

      const statusBar = new TaskStatusBar(store);
      statusBar.show();

      const vscode = require('vscode') as {
        __statusBarItems: Array<{ text: string; tooltip?: string }>;
      };
      const item = vscode.__statusBarItems.at(-1);
      assert.equal(item?.text, '$(home) Geral');
      statusBar.dispose();
    });
  });

  it('shows active task title with warning background', async () => {
    await withTempDir('taskkeeper-status-', async (dir) => {
      resetMockVscode();
      const store = new TaskStore(dir);
      await store.load();
      await store.createTask('Minha Task');

      const statusBar = new TaskStatusBar(store);
      statusBar.refresh();

      const vscode = require('vscode') as {
        __statusBarItems: Array<{ text: string; backgroundColor?: { id: string } }>;
      };
      const item = vscode.__statusBarItems.at(-1);
      assert.equal(item?.text, '$(target) Minha Task');
      assert.equal(item?.backgroundColor?.id, 'statusBarItem.warningBackground');
      statusBar.dispose();
    });
  });
});
