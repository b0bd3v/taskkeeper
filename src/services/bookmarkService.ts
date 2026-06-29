import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import * as vscode from 'vscode';

import type { BookmarkEntry } from '../models/taskContext';

interface BookmarksFileEntry {
  path: string;
  bookmarks?: Array<{ line: number; column?: number; label?: string }>;
}

interface BookmarksFile {
  files?: BookmarksFileEntry[];
}

export interface BookmarkCapture {
  snapshot: unknown;
  entries: BookmarkEntry[];
}

/**
 * Integra com a extensão alefragnani.Bookmarks via o arquivo de projeto
 * `.vscode/bookmarks.json`, disponível quando `bookmarks.saveBookmarksInProject`
 * está habilitado (a extensão não expõe API pública).
 */
export class BookmarkService {
  constructor(private readonly workspaceRoot: string) {}

  private get bookmarksFilePath(): string {
    return path.join(this.workspaceRoot, '.vscode', 'bookmarks.json');
  }

  /** Indica se o armazenamento em projeto já está habilitado (sem prompt). */
  isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('bookmarks')
      .get<boolean>('saveBookmarksInProject', false);
  }

  /** Garante o armazenamento em projeto; pergunta antes de alterar a config. */
  async ensureProjectStorage(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('bookmarks');
    if (config.get<boolean>('saveBookmarksInProject', false)) {
      return true;
    }

    const choice = await vscode.window.showInformationMessage(
      'TaskKeeper precisa que a extensão Bookmarks salve no projeto para capturar/restaurar bookmarks por task.',
      'Habilitar',
      'Agora não',
    );

    if (choice !== 'Habilitar') {
      return false;
    }

    await config.update(
      'saveBookmarksInProject',
      true,
      vscode.ConfigurationTarget.Workspace,
    );
    return true;
  }

  async capture(): Promise<BookmarkCapture> {
    try {
      const raw = await fsp.readFile(this.bookmarksFilePath, 'utf8');
      const snapshot = JSON.parse(raw) as BookmarksFile;
      return { snapshot, entries: flatten(snapshot) };
    } catch {
      return { snapshot: undefined, entries: [] };
    }
  }

  async restore(snapshot: unknown): Promise<void> {
    const dir = path.dirname(this.bookmarksFilePath);
    await fsp.mkdir(dir, { recursive: true });

    const content: BookmarksFile =
      snapshot && typeof snapshot === 'object'
        ? (snapshot as BookmarksFile)
        : { files: [] };

    await fsp.writeFile(
      this.bookmarksFilePath,
      `${JSON.stringify(content, null, 2)}\n`,
      'utf8',
    );
  }

  async clear(): Promise<void> {
    await this.restore({ files: [] });
  }

  /** Deriva as entradas planas a partir de um snapshot bruto de bookmarks. */
  entriesFromSnapshot(snapshot: unknown): BookmarkEntry[] {
    if (!snapshot || typeof snapshot !== 'object') {
      return [];
    }
    return flatten(snapshot as BookmarksFile);
  }

  /**
   * Une dois snapshots de bookmarks, deduplicando por arquivo + linha. As
   * entradas de `extra` que ainda não existirem em `base` são adicionadas.
   */
  mergeSnapshots(base: unknown, extra: unknown): unknown {
    const baseFile = toBookmarksFile(base);
    const extraFile = toBookmarksFile(extra);

    if (!extraFile.files || extraFile.files.length === 0) {
      return baseFile;
    }

    const byPath = new Map<string, BookmarksFileEntry>();
    for (const entry of baseFile.files ?? []) {
      byPath.set(entry.path, {
        path: entry.path,
        bookmarks: [...(entry.bookmarks ?? [])],
      });
    }

    for (const entry of extraFile.files) {
      const existing = byPath.get(entry.path);
      if (!existing) {
        byPath.set(entry.path, {
          path: entry.path,
          bookmarks: [...(entry.bookmarks ?? [])],
        });
        continue;
      }

      const seen = new Set(
        (existing.bookmarks ?? []).map((b) => `${b.line}:${b.column ?? ''}`),
      );
      for (const bookmark of entry.bookmarks ?? []) {
        const key = `${bookmark.line}:${bookmark.column ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          existing.bookmarks = [...(existing.bookmarks ?? []), bookmark];
        }
      }
    }

    return { files: [...byPath.values()] };
  }
}

function toBookmarksFile(value: unknown): BookmarksFile {
  return value && typeof value === 'object'
    ? (value as BookmarksFile)
    : { files: [] };
}

function flatten(file: BookmarksFile): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];

  for (const fileEntry of file.files ?? []) {
    for (const bookmark of fileEntry.bookmarks ?? []) {
      entries.push({
        file: fileEntry.path,
        line: bookmark.line,
        label: bookmark.label,
      });
    }
  }

  return entries;
}
