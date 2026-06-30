import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_CHANGE_STAT } from '../src/models/changeStat';
import {
  scopeActivatedMessage,
  scopeSavedMessage,
} from '../src/utils/activationMessages';

describe('activationMessages', () => {
  const stat = {
    ...EMPTY_CHANGE_STAT,
    modified: [{ path: 'a.ts', status: 'modified' as const, insertions: 1, deletions: 0 }],
  };

  it('scopeSavedMessage pluralizes alterations', () => {
    assert.equal(
      scopeSavedMessage('Geral', stat),
      'TaskKeeper: Geral guardado (1 alteração).',
    );
    assert.equal(
      scopeSavedMessage('Geral', {
        ...stat,
        added: [{ path: 'b.ts', status: 'added', insertions: 1, deletions: 0 }],
      }),
      'TaskKeeper: Geral guardado (2 alteraçãoões).',
    );
  });

  it('scopeSavedMessage omits count when empty', () => {
    assert.equal(
      scopeSavedMessage('Task A', EMPTY_CHANGE_STAT),
      'TaskKeeper: Task A guardado.',
    );
  });

  it('scopeActivatedMessage pluralizes restored changes', () => {
    assert.equal(
      scopeActivatedMessage('Task B', stat),
      'TaskKeeper: Task B ativado (1 alteração restauradas).',
    );
    assert.equal(
      scopeActivatedMessage('Task B', EMPTY_CHANGE_STAT),
      'TaskKeeper: Task B ativado.',
    );
  });
});
