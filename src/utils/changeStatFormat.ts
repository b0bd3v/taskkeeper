import * as path from 'node:path';

import type { ChangeStat, FileChange } from '../models/changeStat';
import { totalFileCount } from '../models/changeStat';

export function formatScopeDescription(stat: ChangeStat): string {
  if (totalFileCount(stat) === 0) {
    return 'sem alterações';
  }

  return `~${stat.modified.length} +${stat.added.length} −${stat.deleted.length}  ⬆${stat.insertions} ⬇${stat.deletions}`;
}

export function formatFileDescription(change: FileChange): string {
  const dir = path.dirname(change.path);
  const dirLabel = dir === '.' ? '' : dir;
  const parts: string[] = [];

  if (change.insertions > 0) {
    parts.push(`⬆${change.insertions}`);
  }
  if (change.deletions > 0) {
    parts.push(`⬇${change.deletions}`);
  }

  const delta = parts.join(' ');
  return [dirLabel, delta].filter(Boolean).join('  ');
}
