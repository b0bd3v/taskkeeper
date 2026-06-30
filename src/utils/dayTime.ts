/** Início do dia civil no fuso local (00:00:00.000). */
export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Ordena timestamps do dia mais recente ao mais antigo; no mesmo dia ignora hora. */
export function compareByDayDesc(a: number, b: number): number {
  const dayDiff = startOfLocalDay(b) - startOfLocalDay(a);
  if (dayDiff !== 0) {
    return dayDiff;
  }
  return 0;
}

export function formatRelativeDay(timestamp: number): string {
  const todayStart = startOfLocalDay(Date.now());
  const dayStart = startOfLocalDay(timestamp);
  const diffDays = Math.round((todayStart - dayStart) / 86_400_000);

  if (diffDays === 0) {
    return 'hoje';
  }
  if (diffDays === 1) {
    return 'ontem';
  }
  return `há ${diffDays} d`;
}
