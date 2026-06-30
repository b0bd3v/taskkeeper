import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { ChangeStatCache } from '../src/services/changeStatCache';
import { GitService } from '../src/services/gitService';
import { GENERAL_PATCH_ID, TaskStore } from '../src/services/taskStore';
import { withTempDir } from './helpers/tempDir';
import { withTempGitRepo } from './helpers/tempGitRepo';

describe('ChangeStatCache', () => {
  it('getForGeneral active uses live stats', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# live\n', 'utf8');
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);
      const cache = new ChangeStatCache(git, store);

      const stat = await cache.getForGeneral(true);
      assert.ok(stat.modified.length >= 1);
    });
  });

  it('getForTask inactive reads patch and caches by mtime', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# patched\n', 'utf8');
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);
      const { patch } = await git.captureChanges();
      await store.savePatch('task-1', patch);
      await git.revertWorkingTree([]);

      const cache = new ChangeStatCache(git, store);
      const first = await cache.getForTask('task-1', false);
      const second = await cache.getForTask('task-1', false);
      assert.equal(first.modified.length, 1);
      assert.deepEqual(second, first);
    });
  });

  it('getFromPatch returns empty when no patch file', async () => {
    await withTempDir('taskkeeper-cache-', async (dir) => {
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);
      const cache = new ChangeStatCache(git, store);

      const stat = await cache.getForGeneral(false);
      assert.equal(stat.modified.length, 0);
      assert.equal(stat.added.length, 0);
    });
  });

  it('invalidate clears cached entries', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# patched\n', 'utf8');
      const store = new TaskStore(dir);
      await store.load();
      const git = new GitService(dir);
      const { patch } = await git.captureChanges();
      await store.savePatch(GENERAL_PATCH_ID, patch);
      await git.revertWorkingTree([]);

      const cache = new ChangeStatCache(git, store);
      await cache.getForGeneral(false);
      cache.invalidate();
      const stat = await cache.getForGeneral(false);
      assert.equal(stat.modified.length, 1);
    });
  });
});
