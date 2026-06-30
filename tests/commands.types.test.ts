import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { refreshUi, taskIdFrom, type CommandDeps } from '../src/commands/types';
import { GENERAL_PATCH_ID } from '../src/services/taskStore';
import { resetMockVscode } from './helpers/mockVscode';

describe('commands/types', () => {
  it('taskIdFrom handles string and tree elements', () => {
    assert.equal(taskIdFrom('abc'), 'abc');
    assert.equal(taskIdFrom({ type: 'general' }), GENERAL_PATCH_ID);
    assert.equal(
      taskIdFrom({ type: 'task', taskId: 'task-1' }),
      'task-1',
    );
    assert.equal(taskIdFrom({ id: 'legacy' }), 'legacy');
    assert.equal(taskIdFrom({ summary: { id: 'from-summary' } }), 'from-summary');
    assert.equal(taskIdFrom(undefined), undefined);
    assert.equal(taskIdFrom(42), undefined);
  });

  it('refreshUi delegates to tree provider and status bar', () => {
    resetMockVscode();
    const calls: string[] = [];
    const deps = {
      store: {} as CommandDeps['store'],
      switcher: {} as CommandDeps['switcher'],
      git: {} as CommandDeps['git'],
      workspaceRoot: '/workspace',
      treeProvider: {
        refresh: () => calls.push('full'),
        refreshScopeStates: () => calls.push('scopes'),
        refreshLiveStats: () => calls.push('live'),
      } as unknown as CommandDeps['treeProvider'],
      statusBar: {
        refresh: () => calls.push('status'),
      } as unknown as CommandDeps['statusBar'],
    };

    refreshUi(deps, 'full');
    refreshUi(deps, 'scopes');
    refreshUi(deps, 'live');

    assert.deepEqual(calls, ['full', 'status', 'scopes', 'status', 'live', 'status']);
  });
});
