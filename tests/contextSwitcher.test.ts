import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import type { OpenFileSnapshot, SerializedBreakpoint } from '../src/models/taskContext';
import { BookmarkService } from '../src/services/bookmarkService';
import { BreakpointService } from '../src/services/breakpointService';
import { ContextSwitcher } from '../src/services/contextSwitcher';
import { EditorService } from '../src/services/editorService';
import { GitService } from '../src/services/gitService';
import { GENERAL_PATCH_ID, TaskStore } from '../src/services/taskStore';
import { resetMockVscode } from './helpers/mockVscode';
import { withTempGitRepo } from './helpers/tempGitRepo';

function createSwitcher(dir: string) {
  const store = new TaskStore(dir);
  const editor = new EditorService(dir);
  const breakpoints = new BreakpointService(dir);
  const bookmarks = new BookmarkService(dir);
  const git = new GitService(dir);
  const switcher = new ContextSwitcher({
    store,
    editor,
    breakpoints,
    bookmarks,
    git,
  });
  return { store, switcher, git, editor, breakpoints, bookmarks };
}

describe('ContextSwitcher', () => {
  it('activate returns notFound for missing task', async () => {
    await withTempGitRepo(async (dir) => {
      resetMockVscode();
      const { store, switcher } = createSwitcher(dir);
      await store.load();
      const result = await switcher.activate('missing');
      assert.equal(result.ok, false);
      assert.equal(result.notFound, true);
    });
  });

  it('activateGeneral clears active task and restores general', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();

      const task = await store.createTask('Ativa');
      await store.saveGeneral({
        files: [{ path: 'README.md', isDirty: false }],
        breakpoints: [],
        updatedAt: Date.now(),
      });

      const result = await switcher.activateGeneral();
      assert.equal(result.ok, true);
      assert.equal(store.getActiveTaskId(), undefined);
      assert.notEqual(store.getTask(task.id), undefined);
    });
  });

  it('activateGeneral no-ops when no active task', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();
      await store.clearActiveTask();

      const result = await switcher.activateGeneral();
      assert.equal(result.ok, true);
      assert.equal(result.conflicted, false);
    });
  });

  it('shelveActiveAndClear captures and clears when task active', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();

      await store.createTask('Shelve me');
      await fsp.writeFile(path.join(dir, 'README.md'), '# changed\n', 'utf8');

      await switcher.shelveActiveAndClear();
      const active = store.getActiveTask();
      assert.ok(active);
      const patch = await store.patchFile(active.id);
      assert.ok(patch);
    });
  });

  it('shelveGeneralAndClear persists general stash', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();
      await store.clearActiveTask();

      await fsp.writeFile(path.join(dir, 'README.md'), '# general\n', 'utf8');
      await switcher.shelveGeneralAndClear();

      const general = await store.getGeneral();
      assert.ok(general);
      const patch = await store.patchFile(GENERAL_PATCH_ID);
      assert.ok(patch);
    });
  });

  it('activate switches between tasks with shelve/unshelve', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();

      const first = await store.createTask('First');
      await fsp.writeFile(path.join(dir, 'README.md'), '# first\n', 'utf8');
      await switcher.shelveActiveAndClear();

      await store.clearActiveTask();
      const second = await store.createTask('Second');
      await fsp.writeFile(path.join(dir, 'README.md'), '# second\n', 'utf8');
      await switcher.shelveActiveAndClear();
      await store.clearActiveTask();

      const result = await switcher.activate(first.id);
      assert.equal(result.ok, true);
      assert.equal(store.getActiveTaskId(), first.id);

      const switched = await switcher.activate(second.id);
      assert.equal(switched.ok, true);
      assert.equal(store.getActiveTaskId(), second.id);
    });
  });

  it('activate with linkLoose merges loose context into target', async () => {
    await withTempGitRepo(async (dir) => {
      const vscode = require('vscode') as {
        Uri: { file: (p: string) => { fsPath: string; scheme: string } };
        TabInputText: new (uri: { fsPath: string; scheme: string }) => unknown;
      };
      const uri = vscode.Uri.file(path.join(dir, 'loose.ts'));
      resetMockVscode({
        configValues: { 'bookmarks.saveBookmarksInProject': true },
        tabGroups: [{ tabs: [{ input: new vscode.TabInputText(uri) }] }],
        textDocuments: [
          {
            uri: { fsPath: uri.fsPath, scheme: 'file' },
            isDirty: false,
            getText: () => '',
          },
        ],
      });

      const { store, switcher } = createSwitcher(dir);
      await store.load();
      await store.clearActiveTask();

      const target = await store.createTask('Target');
      await store.clearActiveTask();
      target.files = [{ path: 'saved.ts', isDirty: false }];
      await store.saveTask(target);

      const result = await switcher.activate(target.id, { linkLoose: true });
      assert.equal(result.ok, true);
      const updated = store.getTask(target.id);
      assert.ok(updated?.files?.some((f) => f.path === 'loose.ts'));
    });
  });

  it('hasLooseGitChanges detects working tree changes', async () => {
    await withTempGitRepo(async (dir) => {
      const { switcher } = createSwitcher(dir);
      assert.equal(await switcher.hasLooseGitChanges(), false);

      await fsp.writeFile(path.join(dir, 'README.md'), '# dirty\n', 'utf8');
      assert.equal(await switcher.hasLooseGitChanges(), true);
    });
  });

  it('hasLooseContext detects editors and breakpoints', async () => {
    const vscode = require('vscode') as {
      Uri: { file: (p: string) => { fsPath: string; scheme: string } };
      TabInputText: new (uri: { fsPath: string; scheme: string }) => unknown;
    };

    await withTempGitRepo(async (dir) => {
      const uri = vscode.Uri.file(path.join(dir, 'open.ts'));
      resetMockVscode({
        tabGroups: [{ tabs: [{ input: new vscode.TabInputText(uri) }] }],
        textDocuments: [
          {
            uri: { fsPath: uri.fsPath, scheme: 'file' },
            isDirty: false,
            getText: () => '',
          },
        ],
      });

      const { switcher } = createSwitcher(dir);
      assert.equal(await switcher.hasLooseContext(), true);
    });
  });

  it('deleteTask removes task from store', async () => {
    await withTempGitRepo(async (dir) => {
      const { store, switcher } = createSwitcher(dir);
      await store.load();
      const task = await store.createTask('Delete me');
      await switcher.deleteTask(task.id);
      assert.equal(store.getTask(task.id), undefined);
    });
  });
});
