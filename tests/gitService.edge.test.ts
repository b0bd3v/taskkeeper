import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { GitService } from '../src/services/gitService';
import { withTempDir } from './helpers/tempDir';

describe('GitService edge cases', () => {
  it('canShelve returns false outside git repo', async () => {
    await withTempDir('taskkeeper-nogit-', async (dir) => {
      const git = new GitService(dir);
      assert.equal(await git.canShelve(), false);
      assert.deepEqual(await git.liveChangeStat(), {
        modified: [],
        added: [],
        deleted: [],
        insertions: 0,
        deletions: 0,
      });
    });
  });

  it('applyPatchPaths returns false for empty paths', async () => {
    const git = new GitService('/tmp');
    assert.equal(await git.applyPatchPaths('/tmp/x.patch', []), false);
  });

  it('applyPatch returns false for invalid patch', async () => {
    await withTempDir('taskkeeper-nogit-', async (dir) => {
      const git = new GitService(dir);
      assert.equal(await git.applyPatch(path.join(dir, 'missing.patch')), false);
    });
  });
});
