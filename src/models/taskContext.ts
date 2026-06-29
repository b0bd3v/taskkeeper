export type TaskStatus = 'open' | 'archived' | 'completed';

/** Snapshot de um editor/aba aberto (abordagem git-free). */
export interface OpenFileSnapshot {
  /** path relativo ao workspace root */
  path: string;
  /** havia alterações não salvas no buffer */
  isDirty: boolean;
  /** conteúdo do buffer quando havia alterações não salvas */
  content?: string;
  /** coluna do editor (ViewColumn) onde estava aberto */
  viewColumn?: number;
}

export interface TaskContext {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt?: number;
  status: TaskStatus;

  /** Editores abertos (e buffers não salvos) capturados no momento do save */
  files?: OpenFileSnapshot[];

  bookmarks: BookmarkEntry[];
  breakpoints: SerializedBreakpoint[];

  /** Conteúdo bruto de `.vscode/bookmarks.json` da extensão alefragnani */
  bookmarksSnapshot?: unknown;
}

/** Contexto "geral" — estado salvo quando não há task ativa (rede de segurança). */
export interface StashContext {
  files?: OpenFileSnapshot[];
  breakpoints?: SerializedBreakpoint[];
  bookmarksSnapshot?: unknown;
  updatedAt: number;
}

export interface BookmarkEntry {
  file: string;
  line: number;
  label?: string;
}

export interface SerializedBreakpoint {
  type: 'source' | 'function';
  file?: string;
  line?: number;
  functionName?: string;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  updatedAt: number;
  lastActiveAt: number;
  status: TaskStatus;
  bookmarkCount: number;
  breakpointCount: number;
  fileCount: number;
  isActive: boolean;
  isArchived: boolean;
}
