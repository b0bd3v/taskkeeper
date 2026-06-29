export type FileChangeStatus = 'modified' | 'added' | 'deleted';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  insertions: number;
  deletions: number;
}

export interface ChangeStat {
  modified: FileChange[];
  added: FileChange[];
  deleted: FileChange[];
  insertions: number;
  deletions: number;
}

export const EMPTY_CHANGE_STAT: ChangeStat = {
  modified: [],
  added: [],
  deleted: [],
  insertions: 0,
  deletions: 0,
};

const STATUS_ORDER: Record<FileChangeStatus, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
};

export function flattenChanges(stat: ChangeStat): FileChange[] {
  return [...stat.modified, ...stat.added, ...stat.deleted].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    return a.path.localeCompare(b.path);
  });
}

export function totalFileCount(stat: ChangeStat): number {
  return stat.modified.length + stat.added.length + stat.deleted.length;
}

export function sumChangeStat(changes: FileChange[]): ChangeStat {
  const stat: ChangeStat = {
    modified: [],
    added: [],
    deleted: [],
    insertions: 0,
    deletions: 0,
  };

  for (const change of changes) {
    stat[change.status].push(change);
    stat.insertions += change.insertions;
    stat.deletions += change.deletions;
  }

  return stat;
}
