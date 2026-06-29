import { randomUUID } from 'node:crypto';

import type { TaskContext, TaskSummary } from '../models/taskContext';

/**
 * Store em memória apenas para a camada de UI.
 * Persistência, patches e contexto real serão implementados depois.
 */
export class TaskStore {
  private tasks = new Map<string, TaskContext>();
  private activeTaskId: string | undefined;

  listSummaries(): TaskSummary[] {
    return [...this.tasks.values()]
      .map((task) => this.toSummary(task))
      .sort((a, b) => b.updatedAt - a.updatedAt);
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

  createTask(title: string, _createNewContext: boolean): TaskContext {
    const now = Date.now();
    const task: TaskContext = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      bookmarks: [],
      breakpoints: [],
    };

    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;
    return task;
  }

  setActiveTask(id: string): TaskContext | undefined {
    const task = this.tasks.get(id);
    if (!task) {
      return undefined;
    }

    this.activeTaskId = id;
    task.updatedAt = Date.now();
    return task;
  }

  private toSummary(task: TaskContext): TaskSummary {
    return {
      id: task.id,
      title: task.title,
      updatedAt: task.updatedAt,
      bookmarkCount: task.bookmarks.length,
      breakpointCount: task.breakpoints.length,
      isActive: task.id === this.activeTaskId,
    };
  }
}
