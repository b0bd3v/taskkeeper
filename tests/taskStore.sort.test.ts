import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { TaskStore } from '../src/services/taskStore';
import { startOfLocalDay } from '../src/utils/dayTime';

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

      const today = startOfLocalDay(Date.now());
      b.lastActiveAt = today + 10 * 3_600_000;
      c.lastActiveAt = today - 86_400_000 + 15 * 3_600_000;
      a.lastActiveAt = today - 2 * 86_400_000 + 8 * 3_600_000;
      await store.saveTask(a);
      await store.saveTask(b);
      await store.saveTask(c);

      const titles = store.listSummaries().map((s) => s.title);
      assert.deepEqual(titles, ['B', 'C', 'A']);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('listSummaries ignores time within the same day', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taskkeeper-store-'));
    try {
      const store = new TaskStore(dir);
      await store.load();

      const morning = await store.createTask('Manhã');
      await store.clearActiveTask();
      const afternoon = await store.createTask('Tarde');

      const day = startOfLocalDay(Date.now());
      morning.lastActiveAt = day + 9 * 3_600_000;
      afternoon.lastActiveAt = day + 17 * 3_600_000;
      await store.saveTask(morning);
      await store.saveTask(afternoon);

      const titles = store.listSummaries().map((s) => s.title);
      assert.deepEqual(titles, ['Tarde', 'Manhã']);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
