import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { GitService } from '../src/services/gitService';
import { withTempGitRepo } from './helpers/tempGitRepo';

describe('GitService change stats', () => {
  it('liveChangeStat categorizes modified, added, deleted', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# changed\nmore\n', 'utf8');
      await fsp.writeFile(path.join(dir, 'new.ts'), 'export const x = 1;\n', 'utf8');
      await fsp.writeFile(path.join(dir, 'gone.txt'), 'temp\n', 'utf8');
      await execGit(dir, ['add', 'gone.txt']);
      await execGit(dir, ['commit', '-m', 'add gone']);
      await fsp.unlink(path.join(dir, 'gone.txt'));

      const git = new GitService(dir);
      const stat = await git.liveChangeStat();

      assert.equal(stat.modified.length, 1);
      assert.equal(stat.modified[0]?.path, 'README.md');
      assert.equal(stat.added.length, 1);
      assert.equal(stat.added[0]?.path, 'new.ts');
      assert.equal(stat.deleted.length, 1);
      assert.equal(stat.deleted[0]?.path, 'gone.txt');
      assert.ok(stat.insertions > 0);
      assert.ok(stat.deletions > 0);
    });
  });

  it('patchChangeStat parses saved patch', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# patched\n', 'utf8');
      const git = new GitService(dir);
      const { patch } = await git.captureChanges();
      const patchFile = path.join(dir, 'test.patch');
      await fsp.writeFile(patchFile, patch, 'utf8');
      await git.revertWorkingTree([]);

      const stat = await git.patchChangeStat(patchFile);
      assert.equal(stat.modified.length, 1);
      assert.equal(stat.modified[0]?.path, 'README.md');
    });
  });
});

async function execGit(cwd: string, args: string[]): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('git', args, { cwd });
}
