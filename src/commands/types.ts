import type { ContextSwitcher } from '../services/contextSwitcher';
import type { GitService } from '../services/gitService';
import { GENERAL_PATCH_ID, type TaskStore } from '../services/taskStore';
import type { TaskStatusBar } from '../ui/statusBar';
import type { TaskTreeElement, TaskTreeProvider } from '../views/taskTreeProvider';

export interface CommandDeps {
  store: TaskStore;
  switcher: ContextSwitcher;
  git: GitService;
  treeProvider: TaskTreeProvider;
  statusBar: TaskStatusBar;
  workspaceRoot: string;
}

export function refreshUi(deps: CommandDeps, mode: 'full' | 'scopes' | 'live' = 'scopes'): void {
  if (mode === 'full') {
    deps.treeProvider.refresh();
  } else if (mode === 'live') {
    deps.treeProvider.refreshLiveStats();
  } else {
    deps.treeProvider.refreshScopeStates();
  }
  deps.statusBar.refresh();
}

/**
 * Comandos da árvore recebem o `TaskTreeElement` do provider (não o TreeItem).
 * Outros fluxos podem passar id string ou TreeItem legado com `.id`.
 */
export function taskIdFrom(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }

  if (!arg || typeof arg !== 'object') {
    return undefined;
  }

  const element = arg as TaskTreeElement & {
    id?: unknown;
    summary?: { id?: unknown };
  };

  if (element.type === 'general') {
    return GENERAL_PATCH_ID;
  }
  if (element.type === 'task' && typeof element.taskId === 'string') {
    return element.taskId;
  }

  if (typeof element.id === 'string') {
    return element.id;
  }
  if (typeof element.summary?.id === 'string') {
    return element.summary.id;
  }

  return undefined;
}
