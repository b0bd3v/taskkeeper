import * as vscode from 'vscode';

import { EMPTY_CHANGE_STAT, type ChangeStat } from '../models/changeStat';
import { GENERAL_PATCH_ID } from '../services/taskStore';
import { showCreateTaskForm } from '../ui/createTaskForm';
import { promptLinkLooseContext } from '../ui/linkContextPrompt';
import { scopeSavedMessage } from '../utils/activationMessages';
import { refreshUi, type CommandDeps } from './types';

export function registerCreateTaskCommand(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const command = vscode.commands.registerCommand(
    'taskkeeper.createTask',
    async () => {
      const title = await showCreateTaskForm();
      if (!title) {
        return;
      }

      const activeTask = deps.store.getActiveTask();

      if (activeTask) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'TaskKeeper: salvando contexto da task ativa...',
          },
          () => deps.switcher.shelveActiveAndClear(),
        );

        const shelvedStat = await shelvedScopeStat(deps, activeTask.id);
        const task = await deps.store.createTask(title);
        refreshUi(deps);
        void vscode.window.showInformationMessage(
          scopeSavedMessage(activeTask.title, shelvedStat),
        );
        void vscode.window.showInformationMessage(
          `TaskKeeper: task "${task.title}" criada com contexto novo.`,
        );
        return;
      }

      let linkLoose = false;
      if (await deps.switcher.hasLooseContext()) {
        const choice = await promptLinkLooseContext(title, 'create');
        if (choice === undefined) {
          return;
        }
        linkLoose = choice;
      }

      let shelvedGeneralStat = EMPTY_CHANGE_STAT;
      if (!linkLoose) {
        await deps.switcher.shelveGeneralAndClear();
        shelvedGeneralStat = await shelvedScopeStat(deps, GENERAL_PATCH_ID);
      }

      const task = await deps.store.createTask(title);

      if (linkLoose) {
        await deps.switcher.captureContext(task);
      }

      refreshUi(deps);

      if (!linkLoose) {
        void vscode.window.showInformationMessage(
          scopeSavedMessage('Geral', shelvedGeneralStat),
        );
      }
      const contextLabel = linkLoose
        ? 'com o contexto atual vinculado'
        : 'com contexto novo';
      void vscode.window.showInformationMessage(
        `TaskKeeper: task "${task.title}" criada ${contextLabel}.`,
      );
    },
  );

  context.subscriptions.push(command);
}

async function shelvedScopeStat(
  deps: CommandDeps,
  scopeId: string,
): Promise<ChangeStat> {
  if (!(await deps.git.canShelve())) {
    return EMPTY_CHANGE_STAT;
  }

  const patchFile = await deps.store.patchFile(scopeId);
  if (!patchFile) {
    return EMPTY_CHANGE_STAT;
  }

  return deps.git.patchChangeStat(patchFile);
}
