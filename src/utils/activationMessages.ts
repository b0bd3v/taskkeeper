import { totalFileCount, type ChangeStat } from '../models/changeStat';

export function scopeSavedMessage(scopeLabel: string, stat: ChangeStat): string {
  const count = totalFileCount(stat);
  return count > 0
    ? `TaskKeeper: ${scopeLabel} guardado (${count} alteração${count === 1 ? '' : 'ões'}).`
    : `TaskKeeper: ${scopeLabel} guardado.`;
}

export function scopeActivatedMessage(scopeLabel: string, stat: ChangeStat): string {
  const count = totalFileCount(stat);
  return count > 0
    ? `TaskKeeper: ${scopeLabel} ativado (${count} alteração${count === 1 ? '' : 'ões'} restauradas).`
    : `TaskKeeper: ${scopeLabel} ativado.`;
}
