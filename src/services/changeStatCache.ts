import * as fsp from 'node:fs/promises';

import { EMPTY_CHANGE_STAT, type ChangeStat } from '../models/changeStat';
import type { GitService } from './gitService';
import { GENERAL_PATCH_ID, type TaskStore } from './taskStore';

interface CacheEntry {
  mtimeMs: number;
  stat: ChangeStat;
}

export class ChangeStatCache {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly git: GitService,
    private readonly store: TaskStore,
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async getForGeneral(isActive: boolean): Promise<ChangeStat> {
    if (isActive) {
      return this.git.liveChangeStat();
    }
    return this.getFromPatch(GENERAL_PATCH_ID);
  }

  async getForTask(taskId: string, isActive: boolean): Promise<ChangeStat> {
    if (isActive) {
      return this.git.liveChangeStat();
    }
    return this.getFromPatch(taskId);
  }

  private async getFromPatch(scopeId: string): Promise<ChangeStat> {
    const patchFile = await this.store.patchFile(scopeId);
    if (!patchFile) {
      return EMPTY_CHANGE_STAT;
    }

    const stat = await fsp.stat(patchFile);
    const cached = this.cache.get(scopeId);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.stat;
    }

    const changeStat = await this.git.patchChangeStat(patchFile);
    this.cache.set(scopeId, { mtimeMs: stat.mtimeMs, stat: changeStat });
    return changeStat;
  }
}
