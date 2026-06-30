import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export async function withTempDir(
  prefix: string,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
