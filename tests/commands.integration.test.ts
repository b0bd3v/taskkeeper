import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { registerOpenChangeFileCommand } from '../src/commands/openChangeFile';
import { ChangeStatCache } from '../src/services/changeStatCache';
import { GitService } from '../src/services/gitService';
import { TaskStore } from '../src/services/taskStore';
import { TaskTreeProvider } from '../src/views/taskTreeProvider';
import { TaskStatusBar } from '../src/ui/statusBar';
import { ContextSwitcher } from '../src/services/contextSwitcher';
import { BookmarkService } from '../src/services/bookmarkService';
import { BreakpointService } from '../src/services/breakpointService';
import { EditorService } from '../src/services/editorService';
import { getMockVscodeState, resetMockVscode } from './helpers/mockVscode';
import { withTempGitRepo } from './helpers/tempGitRepo';

function treeProviderFor(store: TaskStore, git: GitService, dir: string) {
  return new TaskTreeProvider(
    store,
    new ChangeStatCache(git, store),
    git,
    new BreakpointService(dir),
    new BookmarkService(dir),
  );
}

describe('openChangeFile command', () => {
  it('opens existing file directly', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode();
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);
      const existing = path.join(dir, 'README.md');

      const deps = {
        store,
        git,
        workspaceRoot: dir,
        switcher: {} as ContextSwitcher,
        treeProvider: treeProviderFor(store, git, dir),
        statusBar: new TaskStatusBar(store),
      };

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerOpenChangeFileCommand(context as never, deps);

      const registration = context.subscriptions[0] as unknown as {
        handler: (args: unknown) => Promise<void>;
      };
      await registration.handler({
        scopeId: '__general__',
        relativePath: 'README.md',
        status: 'modified',
      });

      const openCmd = getMockVscodeState().executedCommands.find(
        (c) => c.command === 'vscode.open',
      );
      assert.ok(openCmd);
      assert.equal(await fsp.access(existing).then(() => true).catch(() => false), true);
    });
  });

  it('shows message for deleted files', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode();
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);

      const deps = {
        store,
        git,
        workspaceRoot: dir,
        switcher: {} as ContextSwitcher,
        treeProvider: treeProviderFor(store, git, dir),
        statusBar: new TaskStatusBar(store),
      };

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerOpenChangeFileCommand(context as never, deps);
      const registration = context.subscriptions[0] as unknown as {
        handler: (args: unknown) => Promise<void>;
      };

      await registration.handler({
        scopeId: '__general__',
        relativePath: 'missing.ts',
        status: 'deleted',
      });

      assert.equal(getMockVscodeState().executedCommands.length, 0);
    });
  });
});

describe('taskActions command', () => {
  it('renameTask updates title when confirmed', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode({ inputBoxResult: 'Novo nome' });
      const store = new TaskStore(dir);
      await store.load();
      const task = await store.createTask('Antigo');

      const git = new GitService(dir);
      const editor = new EditorService(dir);
      const deps = {
        store,
        git,
        workspaceRoot: dir,
        switcher: new ContextSwitcher({
          store,
          editor,
          breakpoints: new BreakpointService(dir),
          bookmarks: new BookmarkService(dir),
          git,
        }),
        treeProvider: treeProviderFor(store, git, dir),
        statusBar: new TaskStatusBar(store),
      };

      const { registerTaskActionCommands } = await import('../src/commands/taskActions.js');
      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerTaskActionCommands(context as never, deps);

      const renameCmd = context.subscriptions[0] as unknown as {
        handler: (arg: unknown) => Promise<void>;
      };
      await renameCmd.handler({ type: 'task', taskId: task.id });

      assert.equal(store.getTask(task.id)?.title, 'Novo nome');
    });
  });
});
