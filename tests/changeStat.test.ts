import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_CHANGE_STAT,
  flattenChanges,
  sumChangeStat,
  totalFileCount,
} from '../src/models/changeStat';

describe('changeStat model', () => {
  it('totalFileCount sums all categories', () => {
    const stat = sumChangeStat([
      { path: 'a.ts', status: 'modified', insertions: 1, deletions: 0 },
      { path: 'b.ts', status: 'added', insertions: 2, deletions: 0 },
      { path: 'c.ts', status: 'deleted', insertions: 0, deletions: 3 },
    ]);
    assert.equal(totalFileCount(stat), 3);
    assert.equal(stat.insertions, 3);
    assert.equal(stat.deletions, 3);
  });

  it('flattenChanges sorts by status then path', () => {
    const stat = sumChangeStat([
      { path: 'z.ts', status: 'added', insertions: 1, deletions: 0 },
      { path: 'a.ts', status: 'modified', insertions: 1, deletions: 0 },
      { path: 'm.ts', status: 'deleted', insertions: 0, deletions: 1 },
      { path: 'b.ts', status: 'modified', insertions: 1, deletions: 0 },
    ]);

    const paths = flattenChanges(stat).map((c) => `${c.status}:${c.path}`);
    assert.deepEqual(paths, [
      'modified:a.ts',
      'modified:b.ts',
      'added:z.ts',
      'deleted:m.ts',
    ]);
  });

  it('EMPTY_CHANGE_STAT has zero files', () => {
    assert.equal(totalFileCount(EMPTY_CHANGE_STAT), 0);
  });
});
