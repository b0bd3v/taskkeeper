import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function withTempGitRepo(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taskkeeper-'));
  try {
    await exec('git', ['init'], { cwd: dir });
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: dir });
    await fsp.writeFile(path.join(dir, 'README.md'), '# base\n', 'utf8');
    await exec('git', ['add', 'README.md'], { cwd: dir });
    await exec('git', ['commit', '-m', 'init'], { cwd: dir });
    await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
