import * as vscode from 'vscode';

import { GENERAL_PATCH_ID } from '../services/taskStore';
import { EMPTY_CHANGE_STAT, type ChangeStat } from '../models/changeStat';
import { scopeActivatedMessage } from '../utils/activationMessages';
import { formatScopeDescription } from '../utils/changeStatFormat';
import { promptLinkLooseContext } from '../ui/linkContextPrompt';
import { showTaskSelection } from '../ui/taskQuickPick';
import { refreshUi, taskIdFrom, type CommandDeps } from './types';

export function registerSwitchTaskCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const switchTask = vscode.commands.registerCommand(
    'taskkeeper.switchTask',
    async () => {
      const generalDescription = await getGeneralDescription(deps);
      const taskId = await showTaskSelection(deps.store.listSummaries(), {
        includeGeneral: true,
        generalDescription,
      });
      if (!taskId) {
        return;
      }

      if (taskId === GENERAL_PATCH_ID) {
        await runActivateGeneral(deps);
        return;
      }

      await performActivation(taskId, deps);
    },
  );

  const activateConfirm = vscode.commands.registerCommand(
    'taskkeeper.activateTaskConfirm',
    async (arg?: unknown) => {
      const taskId = taskIdFrom(arg);
      if (!taskId) {
        return;
      }

      if (taskId === GENERAL_PATCH_ID) {
        await runActivateGeneral(deps);
        return;
      }

      await performActivation(taskId, deps);
    },
  );

  const refreshTasks = vscode.commands.registerCommand(
    'taskkeeper.refreshTasks',
    () => {
      refreshUi(deps, 'full');
      void vscode.window.showInformationMessage('TaskKeeper: lista atualizada.');
    },
  );

  const activateGeneral = vscode.commands.registerCommand(
    'taskkeeper.activateGeneral',
    async () => {
      await runActivateGeneral(deps);
    },
  );

  context.subscriptions.push(
    switchTask,
    activateConfirm,
    refreshTasks,
    activateGeneral,
  );
}

async function runActivateGeneral(deps: CommandDeps): Promise<void> {
  if (!deps.store.getActiveTask()) {
    void vscode.window.showInformationMessage(
      'TaskKeeper: Geral já é o escopo ativo.',
    );
    return;
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'TaskKeeper: ativando Geral...',
    },
    () => deps.switcher.activateGeneral(),
  );

  refreshUi(deps);

  if (result.conflicted) {
    void vscode.window.showWarningMessage(
      'TaskKeeper: Geral ativado, mas houve conflito ao reaplicar alterações. O patch foi preservado em .taskkeeper/patches/__general__.patch.',
    );
    return;
  }

  await showScopeActivatedToast(deps, 'Geral');
}

async function performActivation(
  taskId: string,
  deps: CommandDeps,
): Promise<void> {
  const target = deps.store.getTask(taskId);
  if (!target) {
    void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
    return;
  }

  if (target.id === deps.store.getActiveTaskId()) {
    void vscode.window.showInformationMessage(
      `TaskKeeper: "${target.title}" já é a task ativa.`,
    );
    return;
  }

  let linkLoose = false;
  const hasActive = deps.store.getActiveTask() !== undefined;
  if (!hasActive && (await deps.switcher.hasLooseGitChanges())) {
    const choice = await promptLinkLooseContext(target.title, 'switch');
    if (choice === undefined) {
      return;
    }
    linkLoose = choice;
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `TaskKeeper: ativando "${target.title}"...`,
    },
    () => deps.switcher.activate(taskId, { linkLoose }),
  );

  if (!result.ok) {
    void vscode.window.showWarningMessage('TaskKeeper: task não encontrada.');
    return;
  }

  refreshUi(deps);

  const title = result.task?.title ?? target.title;
  if (result.conflicted) {
    void vscode.window.showWarningMessage(
      `TaskKeeper: task "${title}" ativada, mas houve conflito ao reaplicar as alterações. O patch foi preservado em .taskkeeper/patches.`,
    );
    return;
  }

  await showScopeActivatedToast(deps, title);
}

async function showScopeActivatedToast(
  deps: CommandDeps,
  scopeLabel: string,
): Promise<void> {
  const stat: ChangeStat = (await deps.git.canShelve())
    ? await deps.git.liveChangeStat()
    : EMPTY_CHANGE_STAT;

  void vscode.window.showInformationMessage(
    scopeActivatedMessage(scopeLabel, stat),
  );
}

async function getGeneralDescription(deps: CommandDeps): Promise<string> {
  const isGeneralActive = !deps.store.getActiveTaskId();

  if (!(await deps.git.canShelve())) {
    return isGeneralActive ? 'ativo' : 'escopo base';
  }

  if (isGeneralActive) {
    const stat = await deps.git.liveChangeStat();
    return formatScopeDescription(stat);
  }

  const patchFile = await deps.store.patchFile(GENERAL_PATCH_ID);
  if (patchFile) {
    const stat = await deps.git.patchChangeStat(patchFile);
    return formatScopeDescription(stat);
  }

  return 'sem alterações';
}
