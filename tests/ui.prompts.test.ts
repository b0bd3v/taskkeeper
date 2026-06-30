import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { showCreateTaskForm } from '../src/ui/createTaskForm';
import { promptLinkLooseContext } from '../src/ui/linkContextPrompt';
import { showTaskSelection } from '../src/ui/taskQuickPick';
import { GENERAL_PATCH_ID } from '../src/services/taskStore';
import { resetMockVscode } from './helpers/mockVscode';

describe('UI prompts', () => {
  it('showCreateTaskForm trims title', async () => {
    resetMockVscode({ inputBoxResult: '  Nova task  ' });
    assert.equal(await showCreateTaskForm(), 'Nova task');
  });

  it('showCreateTaskForm returns undefined when cancelled', async () => {
    resetMockVscode({ inputBoxResult: undefined });
    assert.equal(await showCreateTaskForm(), undefined);
  });

  it('promptLinkLooseContext returns link choice', async () => {
    resetMockVscode({ quickPickResult: { link: true } });
    assert.equal(await promptLinkLooseContext('Task X', 'create'), true);

    resetMockVscode({ quickPickResult: { link: false } });
    assert.equal(await promptLinkLooseContext('Task X', 'switch'), false);

    resetMockVscode({ quickPickResult: undefined });
    assert.equal(await promptLinkLooseContext('Task X', 'switch'), undefined);
  });

  it('showTaskSelection returns selected task id', async () => {
    resetMockVscode({
      quickPickResult: { taskId: 'task-42', label: 'Task 42' },
    });

    const selected = await showTaskSelection(
      [
        {
          id: 'task-42',
          title: 'Task 42',
          updatedAt: 1,
          lastActiveAt: 1,
          status: 'open',
          bookmarkCount: 0,
          breakpointCount: 0,
          fileCount: 0,
          isActive: false,
          isArchived: false,
        },
      ],
      { includeGeneral: true },
    );

    assert.equal(selected, 'task-42');
  });

  it('showTaskSelection includes general option', async () => {
    resetMockVscode({
      quickPickResult: { taskId: GENERAL_PATCH_ID },
    });

    const selected = await showTaskSelection([], { includeGeneral: true });
    assert.equal(selected, GENERAL_PATCH_ID);
  });

  it('showTaskSelection returns undefined when list empty', async () => {
    resetMockVscode();
    assert.equal(await showTaskSelection([]), undefined);
  });
});
