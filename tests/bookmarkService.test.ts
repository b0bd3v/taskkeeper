import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { BookmarkService } from '../src/services/bookmarkService';
import { getMockVscodeState, resetMockVscode } from './helpers/mockVscode';
import { withTempDir } from './helpers/tempDir';

describe('BookmarkService', () => {
  it('capture reads bookmarks.json and flattens entries', async () => {
    await withTempDir('taskkeeper-bookmarks-', async (dir) => {
      resetMockVscode();
      const service = new BookmarkService(dir);
      const bookmarksDir = path.join(dir, '.vscode');
      await fsp.mkdir(bookmarksDir, { recursive: true });
      await fsp.writeFile(
        path.join(bookmarksDir, 'bookmarks.json'),
        JSON.stringify({
          files: [
            {
              path: 'src/a.ts',
              bookmarks: [{ line: 10, label: 'here' }],
            },
          ],
        }),
        'utf8',
      );

      const captured = await service.capture();
      assert.equal(captured.entries.length, 1);
      assert.equal(captured.entries[0]?.file, 'src/a.ts');
      assert.equal(captured.entries[0]?.line, 10);
    });
  });

  it('capture returns empty when file missing', async () => {
    await withTempDir('taskkeeper-bookmarks-', async (dir) => {
      resetMockVscode();
      const service = new BookmarkService(dir);
      const captured = await service.capture();
      assert.deepEqual(captured.entries, []);
    });
  });

  it('restore and clear write bookmarks file', async () => {
    await withTempDir('taskkeeper-bookmarks-', async (dir) => {
      resetMockVscode();
      const service = new BookmarkService(dir);
      await service.restore({
        files: [{ path: 'b.ts', bookmarks: [{ line: 3 }] }],
      });

      const raw = await fsp.readFile(
        path.join(dir, '.vscode', 'bookmarks.json'),
        'utf8',
      );
      assert.ok(raw.includes('b.ts'));

      await service.clear();
      const cleared = JSON.parse(
        await fsp.readFile(path.join(dir, '.vscode', 'bookmarks.json'), 'utf8'),
      );
      assert.deepEqual(cleared.files, []);
    });
  });

  it('mergeSnapshots deduplicates by file and line', () => {
    resetMockVscode();
    const service = new BookmarkService('/tmp');
    const merged = service.mergeSnapshots(
      { files: [{ path: 'a.ts', bookmarks: [{ line: 1 }] }] },
      {
        files: [
          { path: 'a.ts', bookmarks: [{ line: 1 }, { line: 2 }] },
          { path: 'b.ts', bookmarks: [{ line: 5 }] },
        ],
      },
    ) as { files: Array<{ path: string; bookmarks: Array<{ line: number }> }> };

    const a = merged.files.find((f) => f.path === 'a.ts');
    assert.equal(a?.bookmarks.length, 2);
    assert.equal(merged.files.length, 2);
  });

  it('entriesFromSnapshot handles invalid input', () => {
    resetMockVscode();
    const service = new BookmarkService('/tmp');
    assert.deepEqual(service.entriesFromSnapshot(null), []);
    assert.deepEqual(service.entriesFromSnapshot(undefined), []);
  });

  it('isEnabled reads workspace configuration', () => {
    resetMockVscode({ configValues: { 'bookmarks.saveBookmarksInProject': false } });
    const service = new BookmarkService('/tmp');
    assert.equal(service.isEnabled(), false);
  });

  it('ensureProjectStorage returns true when already enabled', async () => {
    resetMockVscode({ configValues: { 'bookmarks.saveBookmarksInProject': true } });
    const service = new BookmarkService('/tmp');
    assert.equal(await service.ensureProjectStorage(), true);
  });

  it('ensureProjectStorage prompts and updates config', async () => {
    resetMockVscode({
      configValues: { 'bookmarks.saveBookmarksInProject': false },
      informationMessageResult: 'Habilitar',
    });
    const service = new BookmarkService('/tmp');
    assert.equal(await service.ensureProjectStorage(), true);
    assert.equal(
      getMockVscodeState().configValues['bookmarks.saveBookmarksInProject'],
      true,
    );
  });

  it('ensureProjectStorage returns false when user declines', async () => {
    resetMockVscode({
      configValues: { 'bookmarks.saveBookmarksInProject': false },
      quickPickResult: undefined,
      informationMessageResult: 'Agora não',
    });
    const service = new BookmarkService('/tmp');
    assert.equal(await service.ensureProjectStorage(), false);
  });
});
