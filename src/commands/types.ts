import type { ContextSwitcher } from '../services/contextSwitcher';
import type { GitService } from '../services/gitService';
import type { TaskStore } from '../services/taskStore';
import type { TaskStatusBar } from '../ui/statusBar';
import type { TaskTreeProvider } from '../views/taskTreeProvider';

export interface CommandDeps {
  store: TaskStore;
  switcher: ContextSwitcher;
  git: GitService;
  treeProvider: TaskTreeProvider;
  statusBar: TaskStatusBar;
}

export function refreshUi(deps: CommandDeps): void {
  deps.treeProvider.refresh();
  deps.statusBar.refresh();
}

/**
 * Comandos podem ser disparados pelo clique no item (arg: id string) ou pelo
 * menu de contexto (arg: o próprio TreeItem). Normaliza para o id da task.
 */
export function taskIdFrom(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg && typeof arg === 'object') {
    const candidate = arg as { id?: unknown; summary?: { id?: unknown } };
    if (typeof candidate.id === 'string') {
      return candidate.id;
    }
    if (typeof candidate.summary?.id === 'string') {
      return candidate.summary.id;
    }
  }

  return undefined;
}
