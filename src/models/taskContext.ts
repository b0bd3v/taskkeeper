export interface TaskContext {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  bookmarks: BookmarkEntry[];
  breakpoints: SerializedBreakpoint[];
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

export interface CreateTaskFormResult {
  title: string;
  createNewContext: boolean;
}

export interface TaskSummary {
  id: string;
  title: string;
  updatedAt: number;
  bookmarkCount: number;
  breakpointCount: number;
  isActive: boolean;
}
