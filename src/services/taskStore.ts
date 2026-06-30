import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type {
  StashContext,
  TaskContext,
  TaskStatus,
  TaskSummary,
} from '../models/taskContext';
import { compareByDayDesc } from '../utils/dayTime';

interface StoreConfig {
  version: number;
  activeTaskId?: string;
}

const STORE_VERSION = 1;

/** Id reservado para o patch do contexto geral (sem task ativa). */
export const GENERAL_PATCH_ID = '__general__';

/**
 * Store persistido em disco sob `<workspace>/.taskkeeper/`.
 * Mantém um cache em memória com write-through a cada mutação.
 */
export class TaskStore {
  private tasks = new Map<string, TaskContext>();
  private activeTaskId: string | undefined;

  private readonly rootDir: string;
  private readonly tasksDir: string;
  private readonly patchesDir: string;
  private readonly configPath: string;
  private readonly generalPath: string;

  constructor(workspaceRoot: string) {
    this.rootDir = path.join(workspaceRoot, '.taskkeeper');
    this.tasksDir = path.join(this.rootDir, 'tasks');
    this.patchesDir = path.join(this.rootDir, 'patches');
    this.configPath = path.join(this.rootDir, 'config.json');
    this.generalPath = path.join(this.rootDir, 'general.json');
  }

  async load(): Promise<void> {
    await this.ensureDirs();
    this.tasks.clear();

    const config = await this.readConfig();
    this.activeTaskId = config?.activeTaskId;

    let entries: string[] = [];
    try {
      entries = await fsp.readdir(this.tasksDir);
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }

      try {
        const raw = await fsp.readFile(path.join(this.tasksDir, entry), 'utf8');
        const task = JSON.parse(raw) as TaskContext;
        if (task && typeof task.id === 'string') {
          this.tasks.set(task.id, this.normalize(task));
        }
      } catch {
        // ignora arquivos corrompidos
      }
    }

    if (this.activeTaskId && !this.tasks.has(this.activeTaskId)) {
      this.activeTaskId = undefined;
      await this.writeConfig();
    }
  }

  listSummaries(): TaskSummary[] {
    return [...this.tasks.values()]
      .map((task) => this.toSummary(task))
      .sort((a, b) => {
        const byDay = compareByDayDesc(a.lastActiveAt, b.lastActiveAt);
        if (byDay !== 0) {
          return byDay;
        }
        const taskA = this.tasks.get(a.id);
        const taskB = this.tasks.get(b.id);
        return (taskB?.createdAt ?? 0) - (taskA?.createdAt ?? 0);
      });
  }

  getActiveTaskId(): string | undefined {
    return this.activeTaskId;
  }

  getActiveTask(): TaskContext | undefined {
    if (!this.activeTaskId) {
      return undefined;
    }

    return this.tasks.get(this.activeTaskId);
  }

  getTask(id: string): TaskContext | undefined {
    return this.tasks.get(id);
  }

  async createTask(title: string): Promise<TaskContext> {
    const now = Date.now();
    const task: TaskContext = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      status: 'open',
      bookmarks: [],
      breakpoints: [],
    };

    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;
    await this.writeTask(task);
    await this.writeConfig();
    return task;
  }

  /** Persiste uma TaskContext já mutada em memória. */
  async saveTask(task: TaskContext): Promise<void> {
    task.updatedAt = Date.now();
    this.tasks.set(task.id, task);
    await this.writeTask(task);
  }

  async setActiveTask(id: string): Promise<TaskContext | undefined> {
    const task = this.tasks.get(id);
    if (!task) {
      return undefined;
    }

    this.activeTaskId = id;
    task.updatedAt = Date.now();
    await this.writeTask(task);
    await this.writeConfig();
    return task;
  }

  async clearActiveTask(): Promise<void> {
    this.activeTaskId = undefined;
    await this.writeConfig();
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
    if (this.activeTaskId === id) {
      this.activeTaskId = undefined;
      await this.writeConfig();
    }

    try {
      await fsp.unlink(path.join(this.tasksDir, `${id}.json`));
    } catch {
      // arquivo já inexistente
    }

    await this.deletePatch(id);
  }

  /** Caminho do arquivo de patch de uma task (ou do contexto geral). */
  private patchPath(id: string): string {
    return path.join(this.patchesDir, `${id}.patch`);
  }

  /** Salva (ou remove, se vazio) o patch das alterações shelvadas. */
  async savePatch(id: string, patch: string): Promise<boolean> {
    if (!patch.trim()) {
      await this.deletePatch(id);
      return false;
    }

    await fsp.mkdir(this.patchesDir, { recursive: true });
    await fsp.writeFile(this.patchPath(id), patch, 'utf8');
    return true;
  }

  /** Retorna o caminho do patch se existir conteúdo shelvado. */
  async patchFile(id: string): Promise<string | undefined> {
    const file = this.patchPath(id);
    try {
      await fsp.access(file);
      return file;
    } catch {
      return undefined;
    }
  }

  async deletePatch(id: string): Promise<void> {
    try {
      await fsp.unlink(this.patchPath(id));
    } catch {
      // patch inexistente
    }
  }

  async renameTask(id: string, title: string): Promise<TaskContext | undefined> {
    const task = this.tasks.get(id);
    if (!task) {
      return undefined;
    }

    task.title = title;
    await this.saveTask(task);
    return task;
  }

  async setStatus(
    id: string,
    status: TaskStatus,
  ): Promise<TaskContext | undefined> {
    const task = this.tasks.get(id);
    if (!task) {
      return undefined;
    }

    task.status = status;
    if (status === 'archived' && this.activeTaskId === id) {
      this.activeTaskId = undefined;
      await this.writeConfig();
    }

    await this.saveTask(task);
    return task;
  }

  private normalize(task: TaskContext): TaskContext {
    return {
      ...task,
      status: task.status ?? 'open',
      bookmarks: task.bookmarks ?? [],
      breakpoints: task.breakpoints ?? [],
    };
  }

  private toSummary(task: TaskContext): TaskSummary {
    const lastActiveAt = task.lastActiveAt ?? task.updatedAt;
    return {
      id: task.id,
      title: task.title,
      updatedAt: task.updatedAt,
      lastActiveAt,
      status: task.status,
      bookmarkCount: task.bookmarks.length,
      breakpointCount: task.breakpoints.length,
      fileCount: task.files?.length ?? 0,
      isActive: task.id === this.activeTaskId,
      isArchived: task.status === 'archived',
    };
  }

  async saveGeneral(stash: StashContext): Promise<void> {
    await fsp.writeFile(
      this.generalPath,
      `${JSON.stringify(stash, null, 2)}\n`,
      'utf8',
    );
  }

  async getGeneral(): Promise<StashContext | undefined> {
    try {
      const raw = await fsp.readFile(this.generalPath, 'utf8');
      return JSON.parse(raw) as StashContext;
    } catch {
      return undefined;
    }
  }

  private async ensureDirs(): Promise<void> {
    await fsp.mkdir(this.tasksDir, { recursive: true });
    await fsp.mkdir(this.patchesDir, { recursive: true });

    const gitignorePath = path.join(this.rootDir, '.gitignore');
    try {
      await fsp.access(gitignorePath);
    } catch {
      await fsp.writeFile(gitignorePath, '*\n', 'utf8');
    }
  }

  private async readConfig(): Promise<StoreConfig | undefined> {
    try {
      const raw = await fsp.readFile(this.configPath, 'utf8');
      return JSON.parse(raw) as StoreConfig;
    } catch {
      return undefined;
    }
  }

  private async writeConfig(): Promise<void> {
    const config: StoreConfig = {
      version: STORE_VERSION,
      activeTaskId: this.activeTaskId,
    };
    await fsp.writeFile(
      this.configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
  }

  private async writeTask(task: TaskContext): Promise<void> {
    await fsp.writeFile(
      path.join(this.tasksDir, `${task.id}.json`),
      `${JSON.stringify(task, null, 2)}\n`,
      'utf8',
    );
  }
}
