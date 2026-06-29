import * as vscode from 'vscode';

import { showCreateTaskForm } from '../ui/createTaskForm';
import { promptLinkLooseContext } from '../ui/linkContextPrompt';
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

      const hasActive = deps.store.getActiveTask() !== undefined;

      if (hasActive) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'TaskKeeper: salvando contexto da task ativa...',
          },
          () => deps.switcher.shelveActiveAndClear(),
        );

        const task = await deps.store.createTask(title);
        refreshUi(deps);
        void vscode.window.showInformationMessage(
          `TaskKeeper: task "${task.title}" criada com contexto novo (estado anterior salvo).`,
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

      if (!linkLoose) {
        await deps.switcher.shelveGeneralAndClear();
      }

      const task = await deps.store.createTask(title);

      if (linkLoose) {
        await deps.switcher.captureContext(task);
      }

      refreshUi(deps);

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
