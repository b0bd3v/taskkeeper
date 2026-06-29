import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { TaskStore } from '../src/services/taskStore';

describe('TaskStore sorting', () => {
  it('listSummaries sorts by lastActiveAt desc', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taskkeeper-store-'));
    try {
      const store = new TaskStore(dir);
      await store.load();

      const a = await store.createTask('A');
      await store.clearActiveTask();
      const b = await store.createTask('B');
      await store.clearActiveTask();
      const c = await store.createTask('C');

      a.lastActiveAt = 100;
      b.lastActiveAt = 300;
      c.lastActiveAt = 200;
      await store.saveTask(a);
      await store.saveTask(b);
      await store.saveTask(c);

      const titles = store.listSummaries().map((s) => s.title);
      assert.deepEqual(titles, ['B', 'C', 'A']);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
