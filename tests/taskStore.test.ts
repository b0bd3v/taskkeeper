import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { GENERAL_PATCH_ID, TaskStore } from '../src/services/taskStore';
import { withTempDir } from './helpers/tempDir';

describe('TaskStore', () => {
  it('creates task and persists to disk', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const task = await store.createTask('Minha task');
      assert.equal(task.title, 'Minha task');
      assert.equal(store.getActiveTaskId(), task.id);

      const raw = await fsp.readFile(
        path.join(dir, '.taskkeeper', 'tasks', `${task.id}.json`),
        'utf8',
      );
      assert.ok(raw.includes('Minha task'));
    });
  });

  it('setActiveTask, clearActiveTask and deleteTask', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const a = await store.createTask('A');
      await store.clearActiveTask();
      const b = await store.createTask('B');

      const activated = await store.setActiveTask(a.id);
      assert.equal(activated?.id, a.id);
      assert.equal(store.getActiveTaskId(), a.id);

      await store.deleteTask(a.id);
      assert.equal(store.getActiveTaskId(), undefined);
      assert.equal(store.getTask(a.id), undefined);
    });
  });

  it('renameTask and setStatus archived clears active', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const task = await store.createTask('Original');
      const renamed = await store.renameTask(task.id, 'Renomeada');
      assert.equal(renamed?.title, 'Renomeada');

      await store.setStatus(task.id, 'archived');
      assert.equal(store.getActiveTaskId(), undefined);
      assert.equal(store.getTask(task.id)?.status, 'archived');
    });
  });

  it('savePatch, patchFile and deletePatch', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const saved = await store.savePatch('task-1', 'diff content');
      assert.equal(saved, true);
      const file = await store.patchFile('task-1');
      assert.ok(file?.endsWith('task-1.patch'));

      const empty = await store.savePatch('task-1', '   ');
      assert.equal(empty, false);
      assert.equal(await store.patchFile('task-1'), undefined);
    });
  });

  it('saveGeneral and getGeneral round-trip', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      await store.saveGeneral({
        files: [{ path: 'src/a.ts', isDirty: false }],
        updatedAt: 123,
      });

      const general = await store.getGeneral();
      assert.equal(general?.files?.[0]?.path, 'src/a.ts');
    });
  });

  it('load ignores corrupt task files and stale active id', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const root = path.join(dir, '.taskkeeper');
      await fsp.mkdir(path.join(root, 'tasks'), { recursive: true });
      await fsp.writeFile(path.join(root, 'tasks', 'bad.json'), '{not json', 'utf8');
      await fsp.writeFile(
        path.join(root, 'config.json'),
        JSON.stringify({ version: 1, activeTaskId: 'missing' }),
        'utf8',
      );

      const store = new TaskStore(dir);
      await store.load();
      assert.equal(store.getActiveTaskId(), undefined);
      assert.equal(store.listSummaries().length, 0);
    });
  });

  it('load normalizes tasks missing optional fields', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const root = path.join(dir, '.taskkeeper');
      await fsp.mkdir(path.join(root, 'tasks'), { recursive: true });
      await fsp.writeFile(
        path.join(root, 'tasks', 'legacy.json'),
        JSON.stringify({
          id: 'legacy',
          title: 'Legacy',
          createdAt: 1,
          updatedAt: 2,
        }),
        'utf8',
      );

      const store = new TaskStore(dir);
      await store.load();
      const task = store.getTask('legacy');
      assert.deepEqual(task?.bookmarks, []);
      assert.deepEqual(task?.breakpoints, []);
      assert.equal(task?.status, 'open');
    });
  });

  it('ensureDirs creates gitignore on first load', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const gitignore = await fsp.readFile(
        path.join(dir, '.taskkeeper', '.gitignore'),
        'utf8',
      );
      assert.equal(gitignore, '*\n');
    });
  });

  it('listSummaries marks active and archived flags', async () => {
    await withTempDir('taskkeeper-store-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();

      const active = await store.createTask('Ativa');
      const other = await store.createTask('Outra');
      await store.clearActiveTask();
      await store.setActiveTask(active.id);
      await store.setStatus(other.id, 'archived');

      const summaries = store.listSummaries();
      const activeSummary = summaries.find((s) => s.id === active.id);
      const archivedSummary = summaries.find((s) => s.id === other.id);

      assert.equal(activeSummary?.isActive, true);
      assert.equal(archivedSummary?.isArchived, true);
    });
  });

  it('GENERAL_PATCH_ID is reserved constant', () => {
    assert.equal(GENERAL_PATCH_ID, '__general__');
  });
});
