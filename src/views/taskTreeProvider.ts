import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  EMPTY_CHANGE_STAT,
  flattenChanges,
  totalFileCount,
  type ChangeStat,
  type FileChange,
  type FileChangeStatus,
} from '../models/changeStat';
import type { TaskSummary } from '../models/taskContext';
import type { ChangeStatCache } from '../services/changeStatCache';
import type { GitService } from '../services/gitService';
import { GENERAL_PATCH_ID, type TaskStore } from '../services/taskStore';
import { formatFileDescription, formatScopeDescription } from '../utils/changeStatFormat';

const NO_GIT_DESCRIPTION = 'alterações indisponíveis (sem git)';

type TaskTreeNode =
  | GeneralItem
  | TaskItem
  | ChangeFileItem
  | ArchivedFolderItem;

class ArchivedFolderItem extends vscode.TreeItem {
  constructor(count: number) {
    super('Tasks arquivadas', vscode.TreeItemCollapsibleState.Collapsed);

    this.description = `${count}`;
    this.iconPath = new vscode.ThemeIcon('archive');
    this.contextValue = 'taskkeeper.archivedFolder';
  }
}

class GeneralItem extends vscode.TreeItem {
  constructor(isActive: boolean, stat: ChangeStat, gitAvailable: boolean) {
    const hasChanges = gitAvailable && totalFileCount(stat) > 0;
    super(
      'Geral',
      hasChanges
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = GENERAL_PATCH_ID;
    this.description = gitAvailable
      ? formatScopeDescription(stat)
      : NO_GIT_DESCRIPTION;
    this.contextValue = isActive
      ? 'taskkeeper.general.active'
      : 'taskkeeper.general';
    this.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'home');
    this.tooltip = isActive
      ? 'Escopo Geral ativo — alterações que não pertencem a nenhuma task'
      : 'Clique ▶ para ativar o Geral';

    if (!isActive) {
      this.command = {
        command: 'taskkeeper.activateGeneral',
        title: 'Ativar Geral',
        arguments: [],
      };
    }
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(
    readonly summary: TaskSummary,
    stat: ChangeStat,
    gitAvailable: boolean,
  ) {
    const hasChanges = gitAvailable && totalFileCount(stat) > 0;
    super(
      summary.title,
      hasChanges
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = summary.id;
    this.description = gitAvailable
      ? formatScopeDescription(stat)
      : NO_GIT_DESCRIPTION;
    this.tooltip = buildTooltip(summary);

    if (summary.isArchived) {
      this.iconPath = new vscode.ThemeIcon('inbox');
      this.contextValue = 'taskkeeper.task.archived';
    } else if (summary.isActive) {
      this.iconPath = new vscode.ThemeIcon('check');
      this.contextValue = 'taskkeeper.task.active';
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
      this.contextValue = 'taskkeeper.task';
    }
  }
}

class ChangeFileItem extends vscode.TreeItem {
  constructor(change: FileChange, workspaceRoot: string) {
    super(path.basename(change.path), vscode.TreeItemCollapsibleState.None);

    this.description = formatFileDescription(change);
    this.tooltip = change.path;
    this.resourceUri = vscode.Uri.file(path.join(workspaceRoot, change.path));

    const icon =
      change.status === 'added'
        ? 'diff-added'
        : change.status === 'deleted'
          ? 'diff-removed'
          : 'diff-modified';

    this.iconPath = new vscode.ThemeIcon(icon);
    this.label = `${statusLetter(change.status)}  ${path.basename(change.path)}`;
    this.contextValue = 'taskkeeper.changeFile';
    this.command = {
      command: 'vscode.open',
      title: 'Abrir arquivo',
      arguments: [this.resourceUri],
    };
  }
}

function statusLetter(status: FileChangeStatus): string {
  if (status === 'added') {
    return 'A';
  }
  if (status === 'deleted') {
    return 'D';
  }
  return 'M';
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TaskTreeNode | undefined
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private view?: vscode.TreeView<TaskTreeNode>;

  constructor(
    private readonly store: TaskStore,
    private readonly changeStatCache: ChangeStatCache,
    private readonly git: GitService,
    private readonly workspaceRoot: string,
  ) {}

  attachView(view: vscode.TreeView<TaskTreeNode>): void {
    this.view = view;
    this.syncBanner();
  }

  refresh(): void {
    this.changeStatCache.invalidate();
    this.syncBanner();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TaskTreeNode): Promise<TaskTreeNode[]> {
    if (!element) {
      return this.getRoots();
    }
    if (element instanceof GeneralItem) {
      return this.getGeneralChildren();
    }
    if (element instanceof ArchivedFolderItem) {
      return this.getArchived();
    }
    if (element instanceof TaskItem) {
      return this.getTaskChildren(element.summary);
    }
    return [];
  }

  private syncBanner(): void {
    if (!this.view) {
      return;
    }
    const active = this.store.getActiveTask();
    this.view.message = active
      ? `● Task ativa: ${active.title}`
      : '● Geral ativo';
  }

  private async getRoots(): Promise<TaskTreeNode[]> {
    const gitAvailable = await this.git.canShelve();
    const isGeneralActive = !this.store.getActiveTaskId();
    const generalStat = gitAvailable
      ? await this.changeStatCache.getForGeneral(isGeneralActive)
      : EMPTY_CHANGE_STAT;

    const nodes: TaskTreeNode[] = [
      new GeneralItem(isGeneralActive, generalStat, gitAvailable),
    ];

    const summaries = this.store
      .listSummaries()
      .filter((s) => !s.isArchived);

    for (const summary of summaries) {
      const stat = gitAvailable
        ? await this.changeStatCache.getForTask(summary.id, summary.isActive)
        : EMPTY_CHANGE_STAT;
      nodes.push(new TaskItem(summary, stat, gitAvailable));
    }

    const archived = this.store.listSummaries().filter((s) => s.isArchived);
    if (archived.length > 0) {
      nodes.push(new ArchivedFolderItem(archived.length));
    }

    return nodes;
  }

  private async getGeneralChildren(): Promise<TaskTreeNode[]> {
    if (!(await this.git.canShelve())) {
      return [];
    }

    const isGeneralActive = !this.store.getActiveTaskId();
    const stat = await this.changeStatCache.getForGeneral(isGeneralActive);
    return flattenChanges(stat).map(
      (change) => new ChangeFileItem(change, this.workspaceRoot),
    );
  }

  private async getTaskChildren(summary: TaskSummary): Promise<TaskTreeNode[]> {
    if (!(await this.git.canShelve())) {
      return [];
    }

    const stat = await this.changeStatCache.getForTask(
      summary.id,
      summary.isActive,
    );
    return flattenChanges(stat).map(
      (change) => new ChangeFileItem(change, this.workspaceRoot),
    );
  }

  private async getArchived(): Promise<TaskTreeNode[]> {
    const gitAvailable = await this.git.canShelve();
    const nodes: TaskTreeNode[] = [];

    for (const summary of this.store
      .listSummaries()
      .filter((s) => s.isArchived)) {
      const stat = gitAvailable
        ? await this.changeStatCache.getForTask(summary.id, false)
        : EMPTY_CHANGE_STAT;
      nodes.push(new TaskItem(summary, stat, gitAvailable));
    }

    return nodes;
  }
}

function buildTooltip(summary: TaskSummary): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${summary.title}**\n\n`);
  markdown.appendMarkdown(
    `- Breakpoints: ${summary.breakpointCount}\n- Bookmarks: ${summary.bookmarkCount}\n- Atualizada: ${new Date(summary.updatedAt).toLocaleString()}`,
  );
  return markdown;
}
