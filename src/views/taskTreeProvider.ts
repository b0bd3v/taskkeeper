import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  EMPTY_CHANGE_STAT,
  flattenChanges,
  type ChangeStat,
  type FileChange,
  type FileChangeStatus,
} from '../models/changeStat';
import type {
  BookmarkEntry,
  SerializedBreakpoint,
  TaskSummary,
} from '../models/taskContext';
import type { BookmarkService } from '../services/bookmarkService';
import type { BreakpointService } from '../services/breakpointService';
import type { ChangeStatCache } from '../services/changeStatCache';
import type { GitService } from '../services/gitService';
import { GENERAL_PATCH_ID, type TaskStore } from '../services/taskStore';
import {
  formatFileDescription,
  formatScopeDescription,
  type ScopeDebugCounts,
} from '../utils/changeStatFormat';

const NO_GIT_DESCRIPTION = 'alterações indisponíveis (sem git)';
const ARCHIVED_FOLDER_ID = '__archived__';
const EMPTY_CHANGES_LABEL = 'Nenhuma alteração foi feita';

export type TaskTreeElement =
  | { type: 'general' }
  | { type: 'task'; taskId: string }
  | { type: 'archived-folder' }
  | { type: 'change-file'; scopeId: string; change: FileChange }
  | { type: 'breakpoint'; scopeId: string; breakpoint: SerializedBreakpoint }
  | { type: 'bookmark'; scopeId: string; bookmark: BookmarkEntry }
  | { type: 'empty-changes'; scopeId: string }
  | { type: 'no-git'; scopeId: string };

const GENERAL_ELEMENT: TaskTreeElement = { type: 'general' };
const ARCHIVED_FOLDER_ELEMENT: TaskTreeElement = { type: 'archived-folder' };

export class TaskTreeProvider
  implements vscode.TreeDataProvider<TaskTreeElement>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TaskTreeElement | undefined
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private view?: vscode.TreeView<TaskTreeElement>;

  constructor(
    private readonly store: TaskStore,
    private readonly changeStatCache: ChangeStatCache,
    private readonly git: GitService,
    private readonly breakpoints: BreakpointService,
    private readonly bookmarks: BookmarkService,
  ) {}

  attachView(view: vscode.TreeView<TaskTreeElement>): void {
    this.view = view;
    this.syncBanner();
  }

  /** Recria a árvore inteira (criar/excluir task, etc.). */
  refresh(): void {
    this.changeStatCache.invalidate();
    this.syncBanner();
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Atualiza ícones/estado ativo sem reordenar a lista. */
  refreshScopeStates(): void {
    this.syncBanner();
    this._onDidChangeTreeData.fire(GENERAL_ELEMENT);
    for (const summary of this.store.listSummaries()) {
      if (!summary.isArchived) {
        this._onDidChangeTreeData.fire({ type: 'task', taskId: summary.id });
      }
    }
  }

  /** Atualiza só o escopo ativo (alterações git em tempo real). */
  refreshLiveStats(): void {
    this.syncBanner();
    const activeId = this.store.getActiveTaskId();
    this._onDidChangeTreeData.fire(
      activeId ? { type: 'task', taskId: activeId } : GENERAL_ELEMENT,
    );
  }

  getTreeItem(element: TaskTreeElement): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return this.buildTreeItem(element);
  }

  async getChildren(element?: TaskTreeElement): Promise<TaskTreeElement[]> {
    if (!element) {
      return this.getRoots();
    }
    if (element.type === 'general') {
      return this.getScopeChildren(GENERAL_PATCH_ID, !this.store.getActiveTaskId());
    }
    if (element.type === 'archived-folder') {
      return this.getArchivedTaskElements();
    }
    if (element.type === 'task') {
      const summary = this.store.listSummaries().find((s) => s.id === element.taskId);
      return this.getScopeChildren(element.taskId, summary?.isActive ?? false);
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

  private getRoots(): TaskTreeElement[] {
    const nodes: TaskTreeElement[] = [GENERAL_ELEMENT];

    for (const summary of this.store.listSummaries()) {
      if (!summary.isArchived) {
        nodes.push({ type: 'task', taskId: summary.id });
      }
    }

    const archivedCount = this.store
      .listSummaries()
      .filter((s) => s.isArchived).length;
    if (archivedCount > 0) {
      nodes.push(ARCHIVED_FOLDER_ELEMENT);
    }

    return nodes;
  }

  private getArchivedTaskElements(): TaskTreeElement[] {
    return this.store
      .listSummaries()
      .filter((s) => s.isArchived)
      .map((summary) => ({ type: 'task', taskId: summary.id }));
  }

  private async getScopeChildren(
    scopeId: string,
    isScopeActive: boolean,
  ): Promise<TaskTreeElement[]> {
    const gitAvailable = await this.git.canShelve();
    const debugContext = await this.getScopeDebugContext(scopeId, isScopeActive);
    const children: TaskTreeElement[] = [];

    if (gitAvailable) {
      const stat = scopeId === GENERAL_PATCH_ID
        ? await this.changeStatCache.getForGeneral(isScopeActive)
        : await this.changeStatCache.getForTask(scopeId, isScopeActive);

      for (const change of flattenChanges(stat)) {
        children.push({ type: 'change-file', scopeId, change });
      }
    }

    for (const breakpoint of debugContext.breakpoints) {
      children.push({ type: 'breakpoint', scopeId, breakpoint });
    }

    for (const bookmark of debugContext.bookmarks) {
      children.push({ type: 'bookmark', scopeId, bookmark });
    }

    if (children.length === 0) {
      if (!gitAvailable) {
        return [{ type: 'no-git', scopeId }];
      }
      return [{ type: 'empty-changes', scopeId }];
    }

    return children;
  }

  private async getScopeDebugContext(
    scopeId: string,
    isScopeActive: boolean,
  ): Promise<{ bookmarks: BookmarkEntry[]; breakpoints: SerializedBreakpoint[] }> {
    if (isScopeActive) {
      const bookmarks = this.bookmarks.isEnabled()
        ? (await this.bookmarks.capture()).entries
        : [];

      return {
        bookmarks,
        breakpoints: this.breakpoints.capture(),
      };
    }

    if (scopeId === GENERAL_PATCH_ID) {
      const general = await this.store.getGeneral();
      return {
        bookmarks: this.bookmarks.entriesFromSnapshot(general?.bookmarksSnapshot),
        breakpoints: general?.breakpoints ?? [],
      };
    }

    const task = this.store.getTask(scopeId);
    return {
      bookmarks: task?.bookmarks ?? [],
      breakpoints: task?.breakpoints ?? [],
    };
  }

  private async getScopeDebugCounts(
    scopeId: string,
    isScopeActive: boolean,
  ): Promise<ScopeDebugCounts> {
    const context = await this.getScopeDebugContext(scopeId, isScopeActive);
    return {
      bookmarkCount: context.bookmarks.length,
      breakpointCount: context.breakpoints.length,
    };
  }

  private async buildTreeItem(element: TaskTreeElement): Promise<vscode.TreeItem> {
    switch (element.type) {
      case 'general':
        return this.buildGeneralItem();
      case 'task':
        return this.buildTaskItem(element.taskId);
      case 'archived-folder':
        return this.buildArchivedFolderItem();
      case 'change-file':
        return this.buildChangeFileItem(element.scopeId, element.change);
      case 'breakpoint':
        return this.buildBreakpointItem(element.scopeId, element.breakpoint);
      case 'bookmark':
        return this.buildBookmarkItem(element.scopeId, element.bookmark);
      case 'empty-changes':
        return this.buildEmptyChangesItem(element.scopeId);
      case 'no-git':
        return this.buildNoGitItem(element.scopeId);
    }
  }

  private async buildGeneralItem(): Promise<vscode.TreeItem> {
    const gitAvailable = await this.git.canShelve();
    const isActive = !this.store.getActiveTaskId();
    const debugCounts = await this.getScopeDebugCounts(GENERAL_PATCH_ID, isActive);
    const stat = gitAvailable
      ? await this.changeStatCache.getForGeneral(isActive)
      : EMPTY_CHANGE_STAT;

    const item = new vscode.TreeItem(
      'Geral',
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.id = GENERAL_PATCH_ID;
    item.description = formatScopeDescription(stat, debugCounts, gitAvailable);
    item.contextValue = isActive
      ? 'taskkeeper.general.active'
      : 'taskkeeper.general';
    item.iconPath = new vscode.ThemeIcon('home');
    item.tooltip = isActive
      ? 'Escopo Geral ativo — alterações que não pertencem a nenhuma task'
      : 'Use ▶ para ativar o Geral';

    return item;
  }

  private async buildTaskItem(taskId: string): Promise<vscode.TreeItem> {
    const summary = this.store.listSummaries().find((s) => s.id === taskId);
    if (!summary) {
      return new vscode.TreeItem('Task removida', vscode.TreeItemCollapsibleState.None);
    }

    const gitAvailable = await this.git.canShelve();
    const debugCounts = await this.getScopeDebugCounts(taskId, summary.isActive);
    const stat = gitAvailable
      ? await this.changeStatCache.getForTask(taskId, summary.isActive)
      : EMPTY_CHANGE_STAT;

    const item = new vscode.TreeItem(
      summary.title,
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.id = taskId;
    item.description = formatScopeDescription(stat, debugCounts, gitAvailable);
    item.tooltip = buildTooltip(summary);

    if (summary.isArchived) {
      item.iconPath = new vscode.ThemeIcon('inbox');
      item.contextValue = 'taskkeeper.task.archived';
    } else if (summary.isActive) {
      item.iconPath = new vscode.ThemeIcon('check');
      item.contextValue = 'taskkeeper.task.active';
    } else {
      item.iconPath = new vscode.ThemeIcon('circle-outline');
      item.contextValue = 'taskkeeper.task';
    }

    return item;
  }

  private buildArchivedFolderItem(): vscode.TreeItem {
    const count = this.store.listSummaries().filter((s) => s.isArchived).length;
    const item = new vscode.TreeItem(
      'Tasks arquivadas',
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.id = ARCHIVED_FOLDER_ID;
    item.description = `${count}`;
    item.iconPath = new vscode.ThemeIcon('archive');
    item.contextValue = 'taskkeeper.archivedFolder';

    return item;
  }

  private buildChangeFileItem(
    scopeId: string,
    change: FileChange,
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(
      path.basename(change.path),
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `${scopeId}:${change.path}`;
    item.description = formatFileDescription(change);
    item.tooltip = change.path;
    item.iconPath = statusIcon(change.status);
    item.label = `${statusLetter(change.status)}  ${path.basename(change.path)}`;
    item.contextValue = 'taskkeeper.changeFile';
    item.command = {
      command: 'taskkeeper.openChangeFile',
      title: 'Abrir arquivo',
      arguments: [
        {
          scopeId,
          relativePath: change.path,
          status: change.status,
        },
      ],
    };

    return item;
  }

  private buildBreakpointItem(
    scopeId: string,
    breakpoint: SerializedBreakpoint,
  ): vscode.TreeItem {
    if (breakpoint.type === 'function' && breakpoint.functionName) {
      const item = new vscode.TreeItem(
        `●  ${breakpoint.functionName}`,
        vscode.TreeItemCollapsibleState.None,
      );

      item.id = `${scopeId}:bp:fn:${breakpoint.functionName}`;
      item.description = breakpoint.enabled ? undefined : 'desabilitado';
      item.iconPath = new vscode.ThemeIcon('debug-breakpoint');
      item.contextValue = 'taskkeeper.breakpoint';
      item.tooltip = breakpoint.functionName;

      return item;
    }

    const file = breakpoint.file ?? 'unknown';
    const line = breakpoint.line ?? 0;
    const item = new vscode.TreeItem(
      `●  ${path.basename(file)}:${line + 1}`,
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `${scopeId}:bp:${file}:${line}`;
    item.description = breakpointDescription(breakpoint);
    item.iconPath = new vscode.ThemeIcon('debug-breakpoint');
    item.contextValue = 'taskkeeper.breakpoint';
    item.tooltip = breakpointTooltip(breakpoint);
    item.command = {
      command: 'taskkeeper.openFileAtLine',
      title: 'Abrir no breakpoint',
      arguments: [{ relativePath: file, line }],
    };

    return item;
  }

  private buildBookmarkItem(
    scopeId: string,
    bookmark: BookmarkEntry,
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `♡  ${path.basename(bookmark.file)}:${bookmark.line + 1}`,
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `${scopeId}:bm:${bookmark.file}:${bookmark.line}`;
    item.description = bookmark.label ?? path.dirname(bookmark.file);
    item.iconPath = new vscode.ThemeIcon('bookmark');
    item.contextValue = 'taskkeeper.bookmark';
    item.tooltip = bookmark.label
      ? `${bookmark.file}:${bookmark.line + 1} — ${bookmark.label}`
      : `${bookmark.file}:${bookmark.line + 1}`;
    item.command = {
      command: 'taskkeeper.openFileAtLine',
      title: 'Abrir bookmark',
      arguments: [{ relativePath: bookmark.file, line: bookmark.line }],
    };

    return item;
  }

  private buildEmptyChangesItem(scopeId: string): vscode.TreeItem {
    const item = new vscode.TreeItem(
      EMPTY_CHANGES_LABEL,
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `${scopeId}:empty`;
    item.contextValue = 'taskkeeper.emptyChanges';

    return item;
  }

  private buildNoGitItem(scopeId: string): vscode.TreeItem {
    const item = new vscode.TreeItem(
      NO_GIT_DESCRIPTION,
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `${scopeId}:no-git`;
    item.contextValue = 'taskkeeper.noGit';

    return item;
  }
}

function statusIcon(status: FileChangeStatus): vscode.ThemeIcon {
  if (status === 'added') {
    return new vscode.ThemeIcon(
      'diff-added',
      new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
    );
  }
  if (status === 'deleted') {
    return new vscode.ThemeIcon(
      'diff-removed',
      new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
    );
  }
  return new vscode.ThemeIcon(
    'diff-modified',
    new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
  );
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

function breakpointDescription(breakpoint: SerializedBreakpoint): string | undefined {
  const parts: string[] = [];
  const dir = breakpoint.file ? path.dirname(breakpoint.file) : '';
  if (dir && dir !== '.') {
    parts.push(dir);
  }
  if (!breakpoint.enabled) {
    parts.push('desabilitado');
  }
  if (breakpoint.condition) {
    parts.push(`if ${breakpoint.condition}`);
  }
  return parts.length > 0 ? parts.join('  ') : undefined;
}

function breakpointTooltip(breakpoint: SerializedBreakpoint): string {
  const file = breakpoint.file ?? 'unknown';
  const line = (breakpoint.line ?? 0) + 1;
  const parts = [`${file}:${line}`];
  if (breakpoint.condition) {
    parts.push(`condição: ${breakpoint.condition}`);
  }
  if (breakpoint.hitCondition) {
    parts.push(`hit: ${breakpoint.hitCondition}`);
  }
  if (breakpoint.logMessage) {
    parts.push(`log: ${breakpoint.logMessage}`);
  }
  return parts.join('\n');
}

function buildTooltip(summary: TaskSummary): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${summary.title}**\n\n`);
  markdown.appendMarkdown(
    `- Breakpoints: ${summary.breakpointCount}\n- Bookmarks: ${summary.bookmarkCount}\n- Última vez ativa: ${new Date(summary.lastActiveAt).toLocaleString()}`,
  );
  return markdown;
}
