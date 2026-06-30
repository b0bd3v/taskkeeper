import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type { FileChangeStatus } from '../models/changeStat';
import { GENERAL_PATCH_ID } from '../services/taskStore';
import { refreshUi, type CommandDeps } from './types';

export interface OpenChangeFileArgs {
  scopeId: string;
  relativePath: string;
  status: FileChangeStatus;
}

export function registerOpenChangeFileCommand(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  const openChangeFile = vscode.commands.registerCommand(
    'taskkeeper.openChangeFile',
    async (args?: OpenChangeFileArgs) => {
      if (!args?.scopeId || !args.relativePath) {
        return;
      }

      await openChangeFileFromTree(deps, args);
    },
  );

  context.subscriptions.push(openChangeFile);
}

async function openChangeFileFromTree(
  deps: CommandDeps,
  args: OpenChangeFileArgs,
): Promise<void> {
  const fileUri = vscode.Uri.file(
    path.join(deps.workspaceRoot, args.relativePath),
  );

  if (await pathExists(fileUri.fsPath)) {
    await vscode.commands.executeCommand('vscode.open', fileUri);
    return;
  }

  if (args.status === 'deleted') {
    void vscode.window.showInformationMessage(
      `TaskKeeper: "${args.relativePath}" foi excluído neste escopo e não está disponível para abrir.`,
    );
    return;
  }

  const patchFile = await deps.store.patchFile(args.scopeId);
  if (!patchFile) {
    void vscode.window.showWarningMessage(
      `TaskKeeper: arquivo "${args.relativePath}" não encontrado.`,
    );
    return;
  }

  const sourceLabel = await scopeLabel(deps, args.scopeId);
  const targetLabel = activeScopeLabel(deps);
  const choice = await vscode.window.showWarningMessage(
    `O arquivo "${args.relativePath}" está guardado em "${sourceLabel}" e não existe no escopo atual (${targetLabel}).`,
    {
      modal: true,
      detail: 'Deseja trazer uma cópia do arquivo para o escopo atual?',
    },
    'Trazer cópia',
  );

  if (choice !== 'Trazer cópia') {
    return;
  }

  const ok = await deps.git.applyPatchPaths(patchFile, [args.relativePath]);
  if (!ok) {
    void vscode.window.showWarningMessage(
      `TaskKeeper: não foi possível trazer "${args.relativePath}" — pode haver conflito com alterações no escopo atual.`,
    );
    return;
  }

  refreshUi(deps, 'live');
  await vscode.commands.executeCommand('vscode.open', fileUri);
  void vscode.window.showInformationMessage(
    `TaskKeeper: "${args.relativePath}" trazido para o escopo "${targetLabel}".`,
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function scopeLabel(deps: CommandDeps, scopeId: string): Promise<string> {
  if (scopeId === GENERAL_PATCH_ID) {
    return 'Geral';
  }
  return deps.store.getTask(scopeId)?.title ?? 'task';
}

function activeScopeLabel(deps: CommandDeps): string {
  return deps.store.getActiveTask()?.title ?? 'Geral';
}
