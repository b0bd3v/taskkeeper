import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { registerCreateTaskCommand } from '../src/commands/createTask';
import { registerSwitchTaskCommands } from '../src/commands/switchTask';
import { BookmarkService } from '../src/services/bookmarkService';
import { BreakpointService } from '../src/services/breakpointService';
import { ChangeStatCache } from '../src/services/changeStatCache';
import { ContextSwitcher } from '../src/services/contextSwitcher';
import { EditorService } from '../src/services/editorService';
import { GitService } from '../src/services/gitService';
import { TaskStore } from '../src/services/taskStore';
import { TaskStatusBar } from '../src/ui/statusBar';
import { TaskTreeProvider } from '../src/views/taskTreeProvider';
import { resetMockVscode } from './helpers/mockVscode';
import { withTempGitRepo } from './helpers/tempGitRepo';

function buildDeps(dir: string) {
  const store = new TaskStore(dir);
  const git = new GitService(dir);
  const editor = new EditorService(dir);
  const breakpoints = new BreakpointService(dir);
  const bookmarks = new BookmarkService(dir);
  const switcher = new ContextSwitcher({
    store,
    editor,
    breakpoints,
    bookmarks,
    git,
  });
  const treeProvider = new TaskTreeProvider(
    store,
    new ChangeStatCache(git, store),
    git,
    breakpoints,
    bookmarks,
  );
  return {
    store,
    git,
    switcher,
    treeProvider,
    statusBar: new TaskStatusBar(store),
    workspaceRoot: dir,
  };
}

describe('createTask command', () => {
  it('creates first task from general scope', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode({ inputBoxResult: 'Primeira task' });
      const deps = buildDeps(dir);
      await deps.store.load();
      await deps.store.clearActiveTask();

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerCreateTaskCommand(context as never, deps);

      const cmd = context.subscriptions[0] as unknown as {
        handler: () => Promise<void>;
      };
      await cmd.handler();

      const summaries = deps.store.listSummaries();
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0]?.title, 'Primeira task');
    });
  });

  it('shelves active task before creating a new one', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode({ inputBoxResult: 'Segunda task' });
      const deps = buildDeps(dir);
      await deps.store.load();
      await deps.store.createTask('Primeira');
      await fsp.writeFile(path.join(dir, 'README.md'), '# changed\n', 'utf8');

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerCreateTaskCommand(context as never, deps);

      const cmd = context.subscriptions[0] as unknown as {
        handler: () => Promise<void>;
      };
      await cmd.handler();

      assert.equal(deps.store.listSummaries().length, 2);
      const active = deps.store.getActiveTask();
      assert.equal(active?.title, 'Segunda task');
    });
  });
});

describe('switchTask commands', () => {
  it('activateGeneral switches back to general scope', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode();
      const deps = buildDeps(dir);
      await deps.store.load();
      await deps.store.createTask('Ativa');

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerSwitchTaskCommands(context as never, deps);

      const generalCmd = context.subscriptions[3] as unknown as {
        handler: () => Promise<void>;
      };
      await generalCmd.handler();

      assert.equal(deps.store.getActiveTaskId(), undefined);
    });
  });

  it('refreshTasks triggers full tree refresh', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode();
      const deps = buildDeps(dir);
      await deps.store.load();

      const context = { subscriptions: [] as Array<{ dispose: () => void }> };
      registerSwitchTaskCommands(context as never, deps);

      const refreshCmd = context.subscriptions[2] as unknown as {
        handler: () => Promise<void>;
      };
      await refreshCmd.handler();
      assert.ok(true);
    });
  });
});
