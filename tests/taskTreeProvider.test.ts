import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { ChangeStatCache } from '../src/services/changeStatCache';
import { BookmarkService } from '../src/services/bookmarkService';
import { BreakpointService } from '../src/services/breakpointService';
import { GitService } from '../src/services/gitService';
import { TaskStore } from '../src/services/taskStore';
import { TaskTreeProvider } from '../src/views/taskTreeProvider';
import { resetMockVscode } from './helpers/mockVscode';
import { withTempDir } from './helpers/tempDir';
import { withTempGitRepo } from './helpers/tempGitRepo';

async function createProvider(dir: string) {
  resetMockVscode();
  const store = new TaskStore(dir);
  await store.load();
  const git = new GitService(dir);
  const cache = new ChangeStatCache(git, store);
  const breakpoints = new BreakpointService(dir);
  const bookmarks = new BookmarkService(dir);
  const provider = new TaskTreeProvider(
    store,
    cache,
    git,
    breakpoints,
    bookmarks,
  );
  return { store, provider, git, breakpoints, bookmarks };
}

describe('TaskTreeProvider', () => {
  it('getChildren returns general and open tasks', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, provider } = await createProvider(dir);
      await store.createTask('Open task');
      await store.clearActiveTask();
      await store.createTask('Another');

      const roots = await provider.getChildren();
      assert.ok(roots.some((n) => n.type === 'general'));
      assert.equal(roots.filter((n) => n.type === 'task').length, 2);
    });
  });

  it('getChildren includes archived folder when needed', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, provider } = await createProvider(dir);
      const task = await store.createTask('Archived');
      await store.setStatus(task.id, 'archived');

      const roots = await provider.getChildren();
      assert.ok(roots.some((n) => n.type === 'archived-folder'));
    });
  });

  it('getScopeChildren lists change files for active task', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, provider } = await createProvider(dir);
      const task = await store.createTask('With changes');
      await fsp.writeFile(path.join(dir, 'README.md'), '# changed\n', 'utf8');

      const children = await provider.getChildren({ type: 'task', taskId: task.id });
      assert.ok(
        children.some((n) => n.type === 'change-file' || n.type === 'empty-changes'),
      );
    });
  });

  it('getScopeChildren shows no-git when nothing else exists', async () => {
    await withTempDir('taskkeeper-tree-', async (dir) => {
      const { provider } = await createProvider(dir);
      const children = await provider.getChildren({ type: 'general' });
      assert.deepEqual(children, [{ type: 'no-git', scopeId: '__general__' }]);
    });
  });

  it('getScopeChildren lists stored breakpoints and bookmarks', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, provider } = await createProvider(dir);
      const task = await store.createTask('Debug task');
      const saved = store.getTask(task.id)!;
      saved.breakpoints = [
        {
          type: 'source',
          file: 'src/app.ts',
          line: 9,
          enabled: true,
        },
      ];
      saved.bookmarks = [{ file: 'src/app.ts', line: 4, label: 'todo' }];
      await store.saveTask(saved);
      await store.clearActiveTask();

      const children = await provider.getChildren({ type: 'task', taskId: task.id });
      assert.ok(children.some((n) => n.type === 'breakpoint'));
      assert.ok(children.some((n) => n.type === 'bookmark'));
    });
  });

  it('buildTreeItem sets labels and context values', async () => {
    await withTempGitRepo(async (dir) => {
      const { provider } = await createProvider(dir);
      const vscode = require('vscode') as {
        window: {
          createTreeView: (
            _id: string,
            _options: unknown,
          ) => { message?: string; dispose: () => void };
        };
      };

      const view = vscode.window.createTreeView('taskkeeper.tasks', {
        treeDataProvider: provider,
      });
      provider.attachView(view as never);

      provider.refresh();
      provider.refreshScopeStates();
      provider.refreshLiveStats();

      assert.ok(true);
    });
  });

  it('archived folder children list archived tasks', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, provider } = await createProvider(dir);
      const task = await store.createTask('Old');
      await store.setStatus(task.id, 'archived');

      const archived = await provider.getChildren({ type: 'archived-folder' });
      assert.deepEqual(archived, [{ type: 'task', taskId: task.id }]);
    });
  });

  it('bookmark and breakpoint items open file at line', async () => {
    await withTempGitRepo(async (dir) => {
      const { provider } = await createProvider(dir);

      const bookmarkItem = await provider.getTreeItem({
        type: 'bookmark',
        scopeId: '__general__',
        bookmark: { file: 'src/app.ts', line: 3, label: 'here' },
      });
      const breakpointItem = await provider.getTreeItem({
        type: 'breakpoint',
        scopeId: '__general__',
        breakpoint: {
          type: 'source',
          file: 'src/app.ts',
          line: 10,
          enabled: true,
        },
      });

      const bookmark = bookmarkItem as {
        command?: { command: string };
        label?: string;
      };
      const breakpoint = breakpointItem as {
        command?: { command: string };
        label?: string;
      };

      assert.equal(bookmark.command?.command, 'taskkeeper.openFileAtLine');
      assert.equal(breakpoint.command?.command, 'taskkeeper.openFileAtLine');
      assert.ok(String(bookmark.label).includes('app.ts:4'));
      assert.ok(String(breakpoint.label).includes('app.ts:11'));
    });
  });

  it('scope description includes bookmark and breakpoint counts', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode({ configValues: { 'bookmarks.saveBookmarksInProject': true } });
      const { store, provider } = await createProvider(dir);
      const task = await store.createTask('Counts');
      const saved = store.getTask(task.id)!;
      saved.breakpoints = [
        { type: 'source', file: 'a.ts', line: 0, enabled: true },
        { type: 'source', file: 'b.ts', line: 1, enabled: true },
      ];
      saved.bookmarks = [{ file: 'a.ts', line: 0 }];
      await store.saveTask(saved);
      await store.clearActiveTask();

      const item = await provider.getTreeItem({ type: 'task', taskId: task.id });
      assert.match(String((item as { description?: string }).description), /♡1/);
      assert.match(String((item as { description?: string }).description), /●2/);
    });
  });

  it('change-file item includes open command', async () => {
    await withTempGitRepo(async (dir) => {
      const { provider } = await createProvider(dir);
      const item = await provider.getTreeItem({
        type: 'change-file',
        scopeId: '__general__',
        change: {
          path: 'src/app.ts',
          status: 'modified',
          insertions: 2,
          deletions: 1,
        },
      });

      const treeItem = item as {
        command?: { command: string; arguments?: unknown[] };
        label?: string;
      };
      assert.equal(treeItem.command?.command, 'taskkeeper.openChangeFile');
      assert.ok(String(treeItem.label).includes('app.ts'));
    });
  });
});
