import * as path from 'node:path';

import type { ChangeStat, FileChange } from '../models/changeStat';
import { totalFileCount } from '../models/changeStat';

export interface ScopeDebugCounts {
  bookmarkCount: number;
  breakpointCount: number;
}

export function formatScopeDescription(
  stat: ChangeStat,
  debugCounts?: ScopeDebugCounts,
  gitAvailable = true,
): string {
  const debugSuffix = formatDebugCounts(debugCounts);

  if (!gitAvailable) {
    const base = 'alterações indisponíveis (sem git)';
    return debugSuffix ? `${base}  ${debugSuffix}` : base;
  }

  const hasChanges = totalFileCount(stat) > 0;
  if (!hasChanges && !debugSuffix) {
    return 'sem alterações';
  }

  const changePart = hasChanges
    ? `~${stat.modified.length} +${stat.added.length} −${stat.deleted.length}  ⬆${stat.insertions} ⬇${stat.deletions}`
    : 'sem alterações';

  return debugSuffix ? `${changePart}  ${debugSuffix}` : changePart;
}

function formatDebugCounts(counts?: ScopeDebugCounts): string {
  if (!counts) {
    return '';
  }

  const parts: string[] = [];
  if (counts.bookmarkCount > 0) {
    parts.push(`♡${counts.bookmarkCount}`);
  }
  if (counts.breakpointCount > 0) {
    parts.push(`●${counts.breakpointCount}`);
  }

  return parts.join(' ');
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
