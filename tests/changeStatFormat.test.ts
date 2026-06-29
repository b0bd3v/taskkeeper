import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChangeStat } from '../src/models/changeStat';
import {
  formatFileDescription,
  formatScopeDescription,
} from '../src/utils/changeStatFormat';

const sample: ChangeStat = {
  modified: [
    { path: 'src/app.ts', status: 'modified', insertions: 8, deletions: 2 },
    { path: 'src/util.ts', status: 'modified', insertions: 4, deletions: 2 },
  ],
  added: [{ path: 'src/new.ts', status: 'added', insertions: 10, deletions: 0 }],
  deleted: [{ path: 'src/old.ts', status: 'deleted', insertions: 0, deletions: 6 }],
  insertions: 22,
  deletions: 10,
};

describe('changeStatFormat', () => {
  it('formatScopeDescription renders compact summary', () => {
    assert.equal(formatScopeDescription(sample), '~2 +1 −1  ⬆22 ⬇10');
  });

  it('formatScopeDescription handles empty stat', () => {
    const empty: ChangeStat = {
      modified: [],
      added: [],
      deleted: [],
      insertions: 0,
      deletions: 0,
    };
    assert.equal(formatScopeDescription(empty), 'sem alterações');
  });

  it('formatFileDescription shows dir and line delta', () => {
    assert.equal(
      formatFileDescription(sample.modified[0]!),
      'src  ⬆8 ⬇2',
    );
  });

  it('formatFileDescription omits zero insertions', () => {
    assert.equal(
      formatFileDescription(sample.deleted[0]!),
      'src  ⬇6',
    );
  });
});
