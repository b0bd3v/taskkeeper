import { totalFileCount } from '../models/changeStat';
import type {
  OpenFileSnapshot,
  SerializedBreakpoint,
  TaskContext,
} from '../models/taskContext';
import type { BookmarkService } from './bookmarkService';
import type { BreakpointService } from './breakpointService';
import type { EditorService } from './editorService';
import type { GitService } from './gitService';
import { GENERAL_PATCH_ID, type TaskStore } from './taskStore';

export interface ContextSwitcherDeps {
  store: TaskStore;
  editor: EditorService;
  breakpoints: BreakpointService;
  bookmarks: BookmarkService;
  git: GitService;
}

export interface ActivateResult {
  ok: boolean;
  notFound?: boolean;
  /** Houve conflito ao reaplicar o patch de alterações da task. */
  conflicted?: boolean;
  task?: TaskContext;
}

export interface ActivateOptions {
  /**
   * Só relevante quando NÃO há task ativa: indica se o contexto solto atual
   * (arquivos/breakpoints/bookmarks/alterações que não pertencem a nenhuma
   * task) deve ser vinculado à task de destino.
   */
  linkLoose?: boolean;
}

/**
 * Orquestra o ciclo salvar -> limpar -> restaurar entre contextos de task,
 * incluindo o "shelve" das alterações da working tree (estilo JetBrains).
 */
export class ContextSwitcher {
  constructor(private readonly deps: ContextSwitcherDeps) {}

  /**
   * Captura o contexto atual (editores + breakpoints + bookmarks + patch das
   * alterações) na task, sem destruir o ambiente.
   */
  async captureContext(task: TaskContext): Promise<string[]> {
    const { editor, breakpoints, bookmarks, store, git } = this.deps;

    task.files = editor.capture();
    task.breakpoints = breakpoints.capture();

    if (await bookmarks.ensureProjectStorage()) {
      const captured = await bookmarks.capture();
      task.bookmarks = captured.entries;
      task.bookmarksSnapshot = captured.snapshot;
    }

    let untracked: string[] = [];
    if (await git.canShelve()) {
      const changes = await git.captureChanges();
      await store.savePatch(task.id, changes.patch);
      untracked = changes.untracked;
    }

    task.lastActiveAt = Date.now();
    await store.saveTask(task);
    return untracked;
  }

  /**
   * Indica se o Geral tem alterações git visíveis na árvore (working tree).
   * Usado para decidir se o prompt "vincular ao destino?" deve aparecer.
   */
  async hasLooseGitChanges(): Promise<boolean> {
    const { git } = this.deps;
    if (!(await git.canShelve())) {
      return false;
    }
    const stat = await git.liveChangeStat();
    return totalFileCount(stat) > 0;
  }

  /**
   * Indica se existe contexto solto no ambiente atual (editores abertos,
   * breakpoints, bookmarks ou alterações na working tree).
   */
  async hasLooseContext(): Promise<boolean> {
    const { editor, breakpoints, bookmarks, git } = this.deps;

    if (editor.capture().length > 0) {
      return true;
    }
    if (breakpoints.capture().length > 0) {
      return true;
    }
    if (bookmarks.isEnabled()) {
      const captured = await bookmarks.capture();
      if (captured.entries.length > 0) {
        return true;
      }
    }
    if (await git.canShelve()) {
      const changes = await git.captureChanges();
      if (changes.patch.trim().length > 0 || changes.untracked.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Salva (shelve) o contexto da task ativa e limpa o ambiente, deixando-o
   * pronto para uma task nova "do zero". Usado ao criar/trocar com task ativa.
   */
  async shelveActiveAndClear(): Promise<void> {
    const active = this.deps.store.getActiveTask();
    if (!active) {
      await this.clearEnvironment([]);
      return;
    }

    const untracked = await this.captureContext(active);
    await this.clearEnvironment(untracked);
  }

  /**
   * Salva o contexto do Geral em `general.json` + `__general__.patch` e limpa
   * o ambiente.
   */
  async shelveGeneralAndClear(): Promise<void> {
    const { store, editor, breakpoints, bookmarks, git } = this.deps;

    let bookmarksSnapshot: unknown;
    if (bookmarks.isEnabled()) {
      bookmarksSnapshot = (await bookmarks.capture()).snapshot;
    }

    let untracked: string[] = [];
    if (await git.canShelve()) {
      const changes = await git.captureChanges();
      await store.savePatch(GENERAL_PATCH_ID, changes.patch);
      untracked = changes.untracked;
    }

    await store.saveGeneral({
      files: editor.capture(),
      breakpoints: breakpoints.capture(),
      bookmarksSnapshot,
      updatedAt: Date.now(),
    });

    await this.clearEnvironment(untracked);
  }

  async activateGeneral(): Promise<ActivateResult> {
    const active = this.deps.store.getActiveTask();

    if (!active) {
      return { ok: true, conflicted: false };
    }

    await this.shelveActiveAndClear();
    const conflicted = await this.restoreGeneral();
    await this.deps.store.clearActiveTask();

    return { ok: true, conflicted };
  }

  async activate(
    targetId: string,
    options: ActivateOptions = {},
  ): Promise<ActivateResult> {
    const { store } = this.deps;

    let target = store.getTask(targetId);
    if (!target) {
      return { ok: false, notFound: true };
    }

    const active = store.getActiveTask();
    let conflicted = false;

    if (active) {
      await this.shelveActiveAndClear();
      conflicted = await this.unshelveInto(target);
    } else {
      // Geral ativo — shelve o contexto do Geral antes de restaurar a task.
      if (!options.linkLoose) {
        await this.shelveGeneralAndClear();
      } else {
        const merged = await this.mergeLooseInto(target);
        await store.saveTask(merged);
        target = merged;
        await this.clearEnvironment([]);
      }
      conflicted = await this.unshelveInto(target);
    }

    const updated = await store.setActiveTask(targetId);
    return { ok: true, task: updated ?? target, conflicted };
  }

  /** Remove a task e o patch associado. */
  async deleteTask(id: string): Promise<void> {
    await this.deps.store.deleteTask(id);
  }

  /** Fecha editores, limpa breakpoints/bookmarks e reverte a working tree. */
  private async clearEnvironment(untracked: string[]): Promise<void> {
    const { editor, breakpoints, bookmarks, git } = this.deps;

    await editor.clearEditors();
    breakpoints.clear();
    if (bookmarks.isEnabled()) {
      await bookmarks.clear();
    }

    if (await git.canShelve()) {
      await git.revertWorkingTree(untracked);
    }
  }

  private async restoreGeneral(): Promise<boolean> {
    const { store, editor, breakpoints, bookmarks, git } = this.deps;
    const general = await store.getGeneral();

    let conflicted = false;
    if (await git.canShelve()) {
      const patchFile = await store.patchFile(GENERAL_PATCH_ID);
      if (patchFile) {
        const ok = await git.applyPatch(patchFile);
        conflicted = !ok;
      }
    }

    await editor.restore(general?.files);
    breakpoints.restore(general?.breakpoints ?? []);
    if (general?.bookmarksSnapshot !== undefined && bookmarks.isEnabled()) {
      await bookmarks.restore(general.bookmarksSnapshot);
    }

    return conflicted;
  }

  /**
   * Restaura o contexto de uma task: aplica o patch de alterações e reabre
   * editores/breakpoints/bookmarks. Retorna `true` se o patch conflitou.
   */
  private async unshelveInto(task: TaskContext): Promise<boolean> {
    const { editor, breakpoints, bookmarks, store, git } = this.deps;

    let conflicted = false;
    if (await git.canShelve()) {
      const patchFile = await store.patchFile(task.id);
      if (patchFile) {
        const ok = await git.applyPatch(patchFile);
        conflicted = !ok;
      }
    }

    await editor.restore(task.files);
    breakpoints.restore(task.breakpoints);

    if (task.bookmarksSnapshot !== undefined && bookmarks.isEnabled()) {
      await bookmarks.restore(task.bookmarksSnapshot);
    }

    return conflicted;
  }

  /** Funde o contexto solto atual sobre o contexto salvo da task. */
  private async mergeLooseInto(task: TaskContext): Promise<TaskContext> {
    const { editor, breakpoints, bookmarks } = this.deps;

    const looseFiles = editor.capture();
    const looseBreakpoints = breakpoints.capture();

    let bookmarksSnapshot = task.bookmarksSnapshot;
    if (bookmarks.isEnabled()) {
      const looseSnapshot = (await bookmarks.capture()).snapshot;
      bookmarksSnapshot = bookmarks.mergeSnapshots(
        task.bookmarksSnapshot,
        looseSnapshot,
      );
    }

    return {
      ...task,
      files: mergeFiles(task.files, looseFiles),
      breakpoints: mergeBreakpoints(task.breakpoints, looseBreakpoints),
      bookmarksSnapshot,
      bookmarks: bookmarks.entriesFromSnapshot(bookmarksSnapshot),
    };
  }
}

/** União de arquivos por path; o item solto prevalece (mantém buffer dirty). */
function mergeFiles(
  base: OpenFileSnapshot[] | undefined,
  loose: OpenFileSnapshot[],
): OpenFileSnapshot[] {
  const byPath = new Map<string, OpenFileSnapshot>();
  for (const snap of base ?? []) {
    byPath.set(snap.path, snap);
  }
  for (const snap of loose) {
    byPath.set(snap.path, snap);
  }
  return [...byPath.values()];
}

/** União de breakpoints, deduplicando por arquivo+linha ou nome de função. */
function mergeBreakpoints(
  base: SerializedBreakpoint[] | undefined,
  loose: SerializedBreakpoint[],
): SerializedBreakpoint[] {
  const seen = new Set<string>();
  const result: SerializedBreakpoint[] = [];

  for (const bp of [...(base ?? []), ...loose]) {
    const key =
      bp.type === 'source'
        ? `source:${bp.file ?? ''}:${bp.line ?? ''}`
        : `function:${bp.functionName ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(bp);
  }

  return result;
}
