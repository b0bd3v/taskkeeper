# Task List Changes + Geral Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorient the TaskKeeper sidebar to show categorized git changes per scope (Geral + tasks), with line-delta totals and predictable scope switching.

**Architecture:** Add pure `ChangeStat` types and git parsers in `GitService`, promote Geral to a first-class activatable scope in `ContextSwitcher`, and rewrite `TaskTreeProvider` to render flat M/A/D file lists from live or patch-derived stats with caching.

**Tech Stack:** TypeScript 5.5, VS Code Extension API 1.85+, Node 20+, git CLI (no new runtime deps); `node:test` for unit tests.

## Global Constraints

- Zero runtime dependencies — only `@types/vscode` + TypeScript (per spec).
- Paths relative to workspace root.
- Lista = alterações git (M/A/D), **não** abas abertas.
- Geral fixo no topo; `activeTaskId === undefined` significa **Geral ativo**.
- Total = delta de linhas (`insertions` / `deletions`), não contagem de arquivos.
- Números de escopos inativos derivados do patch salvo (Approach A).
- Layout: lista plana de arquivos; resumo compacto `~mod +add −del  ⬆ins ⬇del`.
- Ordenação de tasks por `lastActiveAt` desc (fallback `updatedAt`).
- Fora de repo git: mensagem "alterações indisponíveis (sem git)"; abas/breakpoints/bookmarks continuam.
- Copy em português na UI (manter padrão existente).

---

## File map

| File | Responsibility |
|------|----------------|
| `src/models/changeStat.ts` | `FileChange`, `ChangeStat`, helpers |
| `src/utils/changeStatFormat.ts` | Format scope/file descriptions for TreeView |
| `src/services/gitService.ts` | `liveChangeStat`, `patchChangeStat`, parsers |
| `src/services/changeStatCache.ts` | Cache stats by scope + patch mtime |
| `src/models/taskContext.ts` | `lastActiveAt`, remove `fileCount` reliance |
| `src/services/taskStore.ts` | Sort by `lastActiveAt`, set on activation |
| `src/services/contextSwitcher.ts` | `activateGeneral`, uniform shelve/restore |
| `src/views/taskTreeProvider.ts` | Geral node, flat change files, async |
| `src/commands/switchTask.ts` | `activateGeneral` command + toasts |
| `src/commands/createTask.ts` | Geral-aware create flow |
| `src/ui/linkContextPrompt.ts` | Copy references Geral |
| `src/ui/statusBar.ts` | Show "Geral" when no active task |
| `src/ui/taskQuickPick.ts` | Include Geral option + change summary |
| `package.json` | `activateGeneral` command + menus |
| `tests/changeStatFormat.test.ts` | Formatter unit tests |
| `tests/gitService.changeStat.test.ts` | Git stat integration tests |
| `tests/taskStore.sort.test.ts` | `lastActiveAt` sort tests |

---

### Task 1: Change stat types, formatters, and test harness

**Files:**
- Create: `src/models/changeStat.ts`
- Create: `src/utils/changeStatFormat.ts`
- Create: `tests/changeStatFormat.test.ts`
- Create: `tsconfig.test.json`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces:
  - `FileChangeStatus`, `FileChange`, `ChangeStat`, `EMPTY_CHANGE_STAT`
  - `flattenChanges(stat: ChangeStat): FileChange[]`
  - `totalFileCount(stat: ChangeStat): number`
  - `formatScopeDescription(stat: ChangeStat): string`
  - `formatFileDescription(change: FileChange): string`

- [ ] **Step 1: Add test tsconfig and script**

Create `tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "out-test"
  },
  "include": ["src", "tests"]
}
```

In `package.json` scripts, add:

```json
"test": "tsc -p tsconfig.test.json && node --test out-test/tests/**/*.test.js",
"test:watch": "tsc -p tsconfig.test.json -w"
```

- [ ] **Step 2: Write the failing test**

Create `tests/changeStatFormat.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChangeStat } from '../src/models/changeStat';
import {
  formatFileDescription,
  formatScopeDescription,
} from '../src/utils/changeStatFormat';

const sample: ChangeStat = {
  modified: [
    { path: 'src/app.ts', status: 'modified', insertions: 8, deletions: 2 },
    { path: 'src/util.ts', status: 'modified', insertions: 4, deletions: 2 },
  ],
  added: [{ path: 'src/new.ts', status: 'added', insertions: 10, deletions: 0 }],
  deleted: [{ path: 'src/old.ts', status: 'deleted', insertions: 0, deletions: 6 }],
  insertions: 22,
  deletions: 10,
};

describe('changeStatFormat', () => {
  it('formatScopeDescription renders compact summary', () => {
    assert.equal(formatScopeDescription(sample), '~2 +1 −1  ⬆22 ⬇10');
  });

  it('formatScopeDescription handles empty stat', () => {
    const empty: ChangeStat = {
      modified: [],
      added: [],
      deleted: [],
      insertions: 0,
      deletions: 0,
    };
    assert.equal(formatScopeDescription(empty), 'sem alterações');
  });

  it('formatFileDescription shows dir and line delta', () => {
    assert.equal(
      formatFileDescription(sample.modified[0]!),
      'src  ⬆8 ⬇2',
    );
  });

  it('formatFileDescription omits zero insertions', () => {
    assert.equal(
      formatFileDescription(sample.deleted[0]!),
      'src  ⬇6',
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement types and formatters**

Create `src/models/changeStat.ts`:

```typescript
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
```

Create `src/utils/changeStatFormat.ts`:

```typescript
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
  return [dirLabel, delta].filter(Boolean).join('  ') || undefined;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `changeStatFormat` tests

- [ ] **Step 6: Commit**

```bash
git add src/models/changeStat.ts src/utils/changeStatFormat.ts tests/changeStatFormat.test.ts tsconfig.test.json package.json
git commit -m "feat: add ChangeStat types and formatters with tests"
```

---

### Task 2: GitService change stat parsing

**Files:**
- Modify: `src/services/gitService.ts`
- Create: `tests/gitService.changeStat.test.ts`
- Create: `tests/helpers/tempGitRepo.ts`

**Interfaces:**
- Consumes: `ChangeStat`, `FileChange`, `sumChangeStat`, `EMPTY_CHANGE_STAT` from Task 1
- Produces:
  - `GitService.liveChangeStat(): Promise<ChangeStat>`
  - `GitService.patchChangeStat(patchFile: string): Promise<ChangeStat>`
  - Returns `EMPTY_CHANGE_STAT` when `canShelve()` is false

- [ ] **Step 1: Write the failing test**

Create `tests/helpers/tempGitRepo.ts`:

```typescript
import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function withTempGitRepo(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taskkeeper-'));
  try {
    await exec('git', ['init'], { cwd: dir });
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: dir });
    await fsp.writeFile(path.join(dir, 'README.md'), '# base\n', 'utf8');
    await exec('git', ['add', 'README.md'], { cwd: dir });
    await exec('git', ['commit', '-m', 'init'], { cwd: dir });
    await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
```

Create `tests/gitService.changeStat.test.ts`:

```typescript
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { GitService } from '../src/services/gitService';
import { withTempGitRepo } from './helpers/tempGitRepo';

describe('GitService change stats', () => {
  it('liveChangeStat categorizes modified, added, deleted', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# changed\nmore\n', 'utf8');
      await fsp.writeFile(path.join(dir, 'new.ts'), 'export const x = 1;\n', 'utf8');
      await fsp.writeFile(path.join(dir, 'gone.txt'), 'temp\n', 'utf8');
      await execGit(dir, ['add', 'gone.txt']);
      await execGit(dir, ['commit', '-m', 'add gone']);
      await fsp.unlink(path.join(dir, 'gone.txt'));

      const git = new GitService(dir);
      const stat = await git.liveChangeStat();

      assert.equal(stat.modified.length, 1);
      assert.equal(stat.modified[0]?.path, 'README.md');
      assert.equal(stat.added.length, 1);
      assert.equal(stat.added[0]?.path, 'new.ts');
      assert.equal(stat.deleted.length, 1);
      assert.equal(stat.deleted[0]?.path, 'gone.txt');
      assert.ok(stat.insertions > 0);
      assert.ok(stat.deletions > 0);
    });
  });

  it('patchChangeStat parses saved patch', async () => {
    await withTempGitRepo(async (dir) => {
      await fsp.writeFile(path.join(dir, 'README.md'), '# patched\n', 'utf8');
      const git = new GitService(dir);
      const { patch } = await git.captureChanges();
      const patchFile = path.join(dir, 'test.patch');
      await fsp.writeFile(patchFile, patch, 'utf8');
      await git.revertWorkingTree([]);

      const stat = await git.patchChangeStat(patchFile);
      assert.equal(stat.modified.length, 1);
      assert.equal(stat.modified[0]?.path, 'README.md');
    });
  });
});

async function execGit(cwd: string, args: string[]): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('git', args, { cwd });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `liveChangeStat` not defined

- [ ] **Step 3: Implement GitService methods**

Add to `src/services/gitService.ts` (imports + methods):

```typescript
import {
  EMPTY_CHANGE_STAT,
  type ChangeStat,
  type FileChange,
  type FileChangeStatus,
  sumChangeStat,
} from '../models/changeStat';

// inside GitService class:

async liveChangeStat(): Promise<ChangeStat> {
  if (!(await this.canShelve())) {
    return EMPTY_CHANGE_STAT;
  }

  const untracked = await this.listUntracked();

  if (untracked.length > 0) {
    await this.run(['add', '-N', '--', ...untracked]);
  }

  try {
    const [{ stdout: numstatOut }, { stdout: nameStatusOut }] = await Promise.all([
      this.run(['diff', '--numstat', 'HEAD']),
      this.run(['diff', '--name-status', 'HEAD']),
    ]);

    const statusByPath = parseNameStatus(nameStatusOut);
    const changes = parseNumstat(numstatOut, statusByPath);

    for (const relative of untracked) {
      if (changes.some((c) => c.path === relative)) {
        continue;
      }
      const lineCount = await this.countLines(path.join(this.cwd, relative));
      changes.push({
        path: relative,
        status: 'added',
        insertions: lineCount,
        deletions: 0,
      });
    }

    return sumChangeStat(changes);
  } finally {
    if (untracked.length > 0) {
      await this.run(['reset', '--quiet', '--', ...untracked]).catch(() => undefined);
    }
  }
}

async patchChangeStat(patchFile: string): Promise<ChangeStat> {
  if (!(await this.canShelve())) {
    return EMPTY_CHANGE_STAT;
  }

  try {
    const [{ stdout: numstatOut }, { stdout: summaryOut }] = await Promise.all([
      this.run(['apply', '--numstat', patchFile]),
      this.run(['apply', '--summary', patchFile]),
    ]);

    const statusByPath = parsePatchSummary(summaryOut);
    return sumChangeStat(parseNumstat(numstatOut, statusByPath));
  } catch {
    return EMPTY_CHANGE_STAT;
  }
}

private async countLines(filePath: string): Promise<number> {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    if (content.length === 0) {
      return 0;
    }
    return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
  } catch {
    return 0;
  }
}
```

Add parser helpers at bottom of `gitService.ts`:

```typescript
function parseNumstat(
  output: string,
  statusByPath: Map<string, FileChangeStatus>,
): FileChange[] {
  const changes: FileChange[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) {
      continue;
    }

    const insertions = match[1] === '-' ? 0 : Number(match[1]);
    const deletions = match[2] === '-' ? 0 : Number(match[2]);
    const filePath = match[3]!;
    const status = statusByPath.get(filePath) ?? 'modified';

    changes.push({ path: filePath, status, insertions, deletions });
  }

  return changes;
}

function parseNameStatus(output: string): Map<string, FileChangeStatus> {
  const map = new Map<string, FileChangeStatus>();

  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const tab = line.indexOf('\t');
    if (tab === -1) {
      continue;
    }

    const code = line.slice(0, tab);
    const filePath = line.slice(tab + 1).split('\t').pop()!;
    const status = gitStatusToChangeStatus(code);
    if (status) {
      map.set(filePath, status);
    }
  }

  return map;
}

function parsePatchSummary(output: string): Map<string, FileChangeStatus> {
  const map = new Map<string, FileChangeStatus>();

  for (const line of output.split('\n')) {
  const create = line.match(/^ create mode \d+ (.+)$/);
    if (create) {
      map.set(create[1]!, 'added');
      continue;
    }

    const del = line.match(/^ delete mode \d+ (.+)$/);
    if (del) {
      map.set(del[1]!, 'deleted');
    }
  }

  return map;
}

function gitStatusToChangeStatus(code: string): FileChangeStatus | undefined {
  if (code.startsWith('A') || code === '??') {
    return 'added';
  }
  if (code.startsWith('D')) {
    return 'deleted';
  }
  if (code.startsWith('M') || code.startsWith('R') || code.startsWith('C')) {
    return 'modified';
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/gitService.ts tests/gitService.changeStat.test.ts tests/helpers/tempGitRepo.ts
git commit -m "feat: derive ChangeStat from live working tree and saved patches"
```

---

### Task 3: TaskStore `lastActiveAt` and sorting

**Files:**
- Modify: `src/models/taskContext.ts`
- Modify: `src/services/taskStore.ts`
- Create: `tests/taskStore.sort.test.ts`

**Interfaces:**
- Produces:
  - `TaskContext.lastActiveAt?: number`
  - `TaskSummary.lastActiveAt: number` (effective: `lastActiveAt ?? updatedAt`)
  - `listSummaries()` sorted by effective `lastActiveAt` desc
  - `setActiveTask()` sets `lastActiveAt = Date.now()`

- [ ] **Step 1: Write the failing test**

Create `tests/taskStore.sort.test.ts`:

```typescript
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { TaskStore } from '../src/services/taskStore';

describe('TaskStore sorting', () => {
  it('listSummaries sorts by lastActiveAt desc', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taskkeeper-store-'));
  try {
      const store = new TaskStore(dir);
      await store.load();

      const a = await store.createTask('A');
      await store.clearActiveTask();
      const b = await store.createTask('B');
      await store.clearActiveTask();
      const c = await store.createTask('C');

      a.lastActiveAt = 100;
      b.lastActiveAt = 300;
      c.lastActiveAt = 200;
      await store.saveTask(a);
      await store.saveTask(b);
      await store.saveTask(c);

      const titles = store.listSummaries().map((s) => s.title);
      assert.deepEqual(titles, ['B', 'C', 'A']);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — order wrong or `lastActiveAt` missing

- [ ] **Step 3: Implement**

In `src/models/taskContext.ts`, add to `TaskContext`:

```typescript
lastActiveAt?: number;
```

Add to `TaskSummary`:

```typescript
lastActiveAt: number;
```

In `src/services/taskStore.ts`:

```typescript
async setActiveTask(id: string): Promise<TaskContext | undefined> {
  const task = this.tasks.get(id);
  if (!task) {
    return undefined;
  }

  this.activeTaskId = id;
  const now = Date.now();
  task.lastActiveAt = now;
  task.updatedAt = now;
  await this.writeTask(task);
  await this.writeConfig();
  return task;
}

private toSummary(task: TaskContext): TaskSummary {
  const lastActiveAt = task.lastActiveAt ?? task.updatedAt;
  return {
    id: task.id,
    title: task.title,
    updatedAt: task.updatedAt,
    lastActiveAt,
    status: task.status,
    bookmarkCount: task.bookmarks.length,
    breakpointCount: task.breakpoints.length,
    fileCount: task.files?.length ?? 0,
    isActive: task.id === this.activeTaskId,
    isArchived: task.status === 'archived',
  };
}

listSummaries(): TaskSummary[] {
  return [...this.tasks.values()]
    .map((task) => this.toSummary(task))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/taskContext.ts src/services/taskStore.ts tests/taskStore.sort.test.ts
git commit -m "feat: track lastActiveAt and sort task summaries by it"
```

---

### Task 4: ContextSwitcher — Geral as first-class scope

**Files:**
- Modify: `src/services/contextSwitcher.ts`

**Interfaces:**
- Consumes: `GENERAL_PATCH_ID`, `store.getGeneral()`, `store.saveGeneral()` from TaskStore
- Produces:
  - `activateGeneral(): Promise<ActivateResult>`
  - `shelveGeneralAndClear(): Promise<void>` — saves live Geral context to `general.json` + `__general__.patch`, clears env
  - `restoreGeneral(): Promise<boolean>` — applies general patch, restores editors/breakpoints/bookmarks; returns conflict flag
  - Updated `activate()`: when no active task, treat as Geral→Task (shelve Geral unless `linkLoose`)

- [ ] **Step 1: Add `restoreGeneral` and `shelveGeneralAndClear`**

In `contextSwitcher.ts`:

```typescript
async shelveGeneralAndClear(): Promise<void> {
  const { store, editor, breakpoints, bookmarks, git } = this.deps;

  let bookmarksSnapshot: unknown;
  if (bookmarks.isEnabled()) {
    bookmarksSnapshot = (await bookmarks.capture()).snapshot;
  }

  let untracked: string[] = [];
  if (await git.canShelve()) {
    const changes = await git.captureChanges();
    await store.savePatch(GENERAL_PATCH_ID, changes.patch);
    untracked = changes.untracked;
  }

  await store.saveGeneral({
    files: editor.capture(),
    breakpoints: breakpoints.capture(),
    bookmarksSnapshot,
    updatedAt: Date.now(),
  });

  await this.clearEnvironment(untracked);
}

private async restoreGeneral(): Promise<boolean> {
  const { store, editor, breakpoints, bookmarks, git } = this.deps;
  const general = await store.getGeneral();

  let conflicted = false;
  if (await git.canShelve()) {
    const patchFile = await store.patchFile(GENERAL_PATCH_ID);
    if (patchFile) {
      const ok = await git.applyPatch(patchFile);
      conflicted = !ok;
    }
  }

  await editor.restore(general?.files);
  breakpoints.restore(general?.breakpoints ?? []);
  if (general?.bookmarksSnapshot !== undefined && bookmarks.isEnabled()) {
    await bookmarks.restore(general.bookmarksSnapshot);
  }

  return conflicted;
}

async activateGeneral(): Promise<ActivateResult> {
  const active = this.deps.store.getActiveTask();

  if (!active) {
    return { ok: true, conflicted: false };
  }

  await this.shelveActiveAndClear();
  const conflicted = await this.restoreGeneral();
  await this.deps.store.clearActiveTask();

  return { ok: true, conflicted };
}
```

- [ ] **Step 2: Update `activate()` for Geral→Task**

Replace the `else` branch (no active task) in `activate()`:

```typescript
} else {
  // Geral ativo — shelve o contexto do Geral antes de restaurar a task.
  if (!options.linkLoose) {
    await this.shelveGeneralAndClear();
  } else {
    const merged = await this.mergeLooseInto(target);
    await store.saveTask(merged);
    target = merged;
    await this.clearEnvironment([]);
  }
  conflicted = await this.unshelveInto(target);
}
```

Remove direct calls to `stashLooseAndClear()` from `activate()` — Geral is now explicit via `shelveGeneralAndClear()`.

Keep `stashLooseAndClear()` as an alias delegating to `shelveGeneralAndClear()` for backward compatibility in create flow, or update create flow in Task 5 to call `shelveGeneralAndClear()` directly.

- [ ] **Step 3: Compile check**

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/services/contextSwitcher.ts
git commit -m "feat: promote Geral to first-class activatable scope"
```

---

### Task 5: Commands — activate Geral, updated flows, copy

**Files:**
- Modify: `src/commands/switchTask.ts`
- Modify: `src/commands/createTask.ts`
- Modify: `src/ui/linkContextPrompt.ts`
- Modify: `src/ui/taskQuickPick.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `activateGeneral()`, `totalFileCount()`, `formatScopeDescription()` via git/cache (Task 6 will wire tree; here use `git.liveChangeStat()` for toast counts when possible)
- Produces: command `taskkeeper.activateGeneral`

- [ ] **Step 1: Register `activateGeneral` command**

In `switchTask.ts`, add:

```typescript
const activateGeneral = vscode.commands.registerCommand(
  'taskkeeper.activateGeneral',
  async () => {
    if (!deps.store.getActiveTask()) {
      void vscode.window.showInformationMessage(
        'TaskKeeper: Geral já é o escopo ativo.',
      );
      return;
    }

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'TaskKeeper: ativando Geral...',
      },
      () => deps.switcher.activateGeneral(),
    );

    refreshUi(deps);

    if (result.conflicted) {
      void vscode.window.showWarningMessage(
        'TaskKeeper: Geral ativado, mas houve conflito ao reaplicar alterações. O patch foi preservado em .taskkeeper/patches/__general__.patch.',
      );
      return;
    }

    void vscode.window.showInformationMessage('TaskKeeper: Geral ativado.');
  },
);

context.subscriptions.push(switchTask, activateConfirm, refreshTasks, activateGeneral);
```

Update `performActivation` success toast to mention change count when available (add optional `changeCount` param after Task 6 wires `ChangeStatCache`; for now use `git.liveChangeStat()` inline if needed).

- [ ] **Step 2: Update linkContextPrompt copy**

Replace strings in `src/ui/linkContextPrompt.ts`:

```typescript
title: 'TaskKeeper — Alterações do Geral',
placeHolder:
  'Há alterações no Geral (arquivos, breakpoints, bookmarks). O que fazer?',
// option 1 detail:
'As alterações atuais do Geral passam a pertencer a esta task.',
// option 2 detail:
'A task será aberta com o seu próprio contexto; o Geral fica guardado e visível na lista.',
```

- [ ] **Step 3: Add Geral to quick pick**

In `taskQuickPick.ts`, prepend a Geral item when building the pick list:

```typescript
export async function showTaskSelection(
  tasks: TaskSummary[],
  options?: { includeGeneral?: boolean; generalDescription?: string },
): Promise<string | undefined> {
  const items: TaskPickItem[] = [];

  if (options?.includeGeneral) {
    items.push({
      label: '$(home) Geral',
      description: options.generalDescription ?? 'escopo base',
      detail: 'Alterações que não pertencem a nenhuma task',
      taskId: '__general__',
    });
  }

  items.push(
    ...tasks.map((task) => ({
      label: task.isActive ? `$(check) ${task.title}` : task.title,
      description: formatRelativeTime(task.lastActiveAt),
      detail: `${task.breakpointCount} breakpoints · ${task.bookmarkCount} bookmarks`,
      taskId: task.id,
      picked: task.isActive,
    })),
  );
  // ...
}
```

In `switchTask.ts`, when `showTaskSelection` returns `__general__`, call `activateGeneral()` instead of `performActivation`.

- [ ] **Step 4: Update createTask to use shelveGeneralAndClear**

In `createTask.ts`, replace `stashLooseAndClear()` with `shelveGeneralAndClear()`.

- [ ] **Step 5: package.json**

Add command:

```json
{
  "command": "taskkeeper.activateGeneral",
  "title": "Activate General Scope",
  "category": "TaskKeeper",
  "icon": "$(home)"
}
```

Add to `activationEvents`: `"onCommand:taskkeeper.activateGeneral"`

Add menu entry:

```json
{
  "command": "taskkeeper.activateGeneral",
  "when": "view == taskkeeper.tasks && viewItem == taskkeeper.general",
  "group": "inline@1"
}
```

- [ ] **Step 6: Compile check**

Run: `npm run compile`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands/switchTask.ts src/commands/createTask.ts src/ui/linkContextPrompt.ts src/ui/taskQuickPick.ts package.json
git commit -m "feat: add activate Geral command and update switch/create flows"
```

---

### Task 6: ChangeStatCache service

**Files:**
- Create: `src/services/changeStatCache.ts`

**Interfaces:**
- Consumes: `GitService.liveChangeStat`, `GitService.patchChangeStat`, `GENERAL_PATCH_ID`
- Produces:
  - `ChangeStatCache.getForGeneral(isActive: boolean): Promise<ChangeStat>`
  - `ChangeStatCache.getForTask(taskId: string, isActive: boolean): Promise<ChangeStat>`
  - `ChangeStatCache.invalidate(): void`

- [ ] **Step 1: Implement cache**

Create `src/services/changeStatCache.ts`:

```typescript
import * as fsp from 'node:fs/promises';

import { EMPTY_CHANGE_STAT, type ChangeStat } from '../models/changeStat';
import type { GitService } from './gitService';
import { GENERAL_PATCH_ID, type TaskStore } from './taskStore';

interface CacheEntry {
  mtimeMs: number;
  stat: ChangeStat;
}

export class ChangeStatCache {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly git: GitService,
    private readonly store: TaskStore,
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async getForGeneral(isActive: boolean): Promise<ChangeStat> {
    if (isActive) {
      return this.git.liveChangeStat();
    }
    return this.getFromPatch(GENERAL_PATCH_ID);
  }

  async getForTask(taskId: string, isActive: boolean): Promise<ChangeStat> {
    if (isActive) {
      return this.git.liveChangeStat();
    }
    return this.getFromPatch(taskId);
  }

  private async getFromPatch(scopeId: string): Promise<ChangeStat> {
    const patchFile = await this.store.patchFile(scopeId);
    if (!patchFile) {
      return EMPTY_CHANGE_STAT;
    }

    const stat = await fsp.stat(patchFile);
    const cached = this.cache.get(scopeId);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.stat;
    }

    const changeStat = await this.git.patchChangeStat(patchFile);
    this.cache.set(scopeId, { mtimeMs: stat.mtimeMs, stat: changeStat });
    return changeStat;
  }
}
```

- [ ] **Step 2: Wire in extension.ts**

```typescript
import { ChangeStatCache } from './services/changeStatCache';

const changeStatCache = new ChangeStatCache(git, store);
const treeProvider = new TaskTreeProvider(store, changeStatCache, git, workspaceRoot);
```

Update `CommandDeps` if needed for toast counts.

- [ ] **Step 3: Commit**

```bash
git add src/services/changeStatCache.ts src/extension.ts
git commit -m "feat: add ChangeStatCache for scope stats"
```

---

### Task 7: Rewrite TaskTreeProvider

**Files:**
- Modify: `src/views/taskTreeProvider.ts`

**Interfaces:**
- Consumes: `ChangeStatCache`, `flattenChanges`, `formatScopeDescription`, `formatFileDescription`, `totalFileCount`
- Produces: tree nodes `GeneralItem`, `TaskItem`, `ChangeFileItem`, `ArchivedFolderItem`

- [ ] **Step 1: Replace FileItem with ChangeFileItem**

```typescript
class ChangeFileItem extends vscode.TreeItem {
  constructor(change: FileChange, workspaceRoot: string) {
    super(path.basename(change.path), vscode.TreeItemCollapsibleState.None);

    this.description = formatFileDescription(change);
    this.tooltip = change.path;
    this.resourceUri = vscode.Uri.file(path.join(workspaceRoot, change.path));

    const icon =
      change.status === 'added'
        ? 'diff-added'
        : change.status === 'deleted'
          ? 'diff-removed'
          : 'diff-modified';

    this.iconPath = new vscode.ThemeIcon(icon);
    this.label = `${statusLetter(change.status)}  ${path.basename(change.path)}`;
    this.contextValue = 'taskkeeper.changeFile';
    this.command = {
      command: 'vscode.open',
      title: 'Abrir arquivo',
      arguments: [this.resourceUri],
    };
  }
}

function statusLetter(status: FileChangeStatus): string {
  if (status === 'added') return 'A';
  if (status === 'deleted') return 'D';
  return 'M';
}
```

- [ ] **Step 2: Add GeneralItem**

```typescript
class GeneralItem extends vscode.TreeItem {
  constructor(isActive: boolean, stat: ChangeStat) {
    const hasChanges = totalFileCount(stat) > 0;
    super(
      'Geral',
      hasChanges
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = GENERAL_PATCH_ID;
    this.description = formatScopeDescription(stat);
    this.contextValue = isActive ? 'taskkeeper.general.active' : 'taskkeeper.general';
    this.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'home');
    this.tooltip = isActive
      ? 'Escopo Geral ativo — alterações que não pertencem a nenhuma task'
      : 'Clique ▶ para ativar o Geral';

    if (!isActive) {
      this.command = {
        command: 'taskkeeper.activateGeneral',
        title: 'Ativar Geral',
        arguments: [],
      };
    }
  }
}
```

- [ ] **Step 3: Make getChildren async**

```typescript
async getChildren(element?: TaskTreeNode): Promise<TaskTreeNode[]> {
  if (!element) {
    return this.getRoots();
  }
  if (element instanceof GeneralItem) {
    return this.getGeneralChildren();
  }
  if (element instanceof ArchivedFolderItem) {
    return this.getArchived();
  }
  if (element instanceof TaskItem) {
    return this.getTaskChildren(element.summary);
  }
  return [];
}

private async getRoots(): Promise<TaskTreeNode[]> {
  const isGeneralActive = !this.store.getActiveTaskId();
  const generalStat = await this.changeStatCache.getForGeneral(isGeneralActive);

  const nodes: TaskTreeNode[] = [
    new GeneralItem(isGeneralActive, generalStat),
  ];

  const summaries = this.store
    .listSummaries()
    .filter((s) => !s.isArchived);

  for (const summary of summaries) {
    const stat = await this.changeStatCache.getForTask(
      summary.id,
      summary.isActive,
    );
    nodes.push(new TaskItem(summary, stat));
  }

  const archived = this.store.listSummaries().filter((s) => s.isArchived);
  if (archived.length > 0) {
    nodes.push(new ArchivedFolderItem(archived.length));
  }

  return nodes;
}
```

Update `TaskItem` constructor to accept `ChangeStat` instead of `fileCount`:

```typescript
class TaskItem extends vscode.TreeItem {
  constructor(readonly summary: TaskSummary, stat: ChangeStat) {
    const hasChanges = totalFileCount(stat) > 0;
    super(
      summary.title,
      hasChanges
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.id = summary.id;
    this.description = formatScopeDescription(stat);
    // icon/contextValue logic unchanged
  }
}
```

- [ ] **Step 4: Update refresh + banner**

```typescript
refresh(): void {
  this.changeStatCache.invalidate();
  this.syncBanner();
  this._onDidChangeTreeData.fire(undefined);
}

private syncBanner(): void {
  if (!this.view) return;
  const active = this.store.getActiveTask();
  this.view.message = active
    ? `● Task ativa: ${active.title}`
    : '● Geral ativo';
}
```

Remove `activeFiles` / `editor.capture()` usage entirely.

- [ ] **Step 5: Handle no-git fallback**

When `!(await git.canShelve())`, set `GeneralItem` / `TaskItem` description to `'alterações indisponíveis (sem git)'` and skip children.

- [ ] **Step 6: Manual smoke test**

1. F5 → Extension Development Host
2. Modify a tracked file → appears under Geral with M
3. Create task → Geral shelved, task active
4. Activate Geral → changes restored
5. Open unmodified file → does NOT appear in list

- [ ] **Step 7: Commit**

```bash
git add src/views/taskTreeProvider.ts
git commit -m "feat: rewrite task tree to show git changes per scope"
```

---

### Task 8: Status bar and toast polish

**Files:**
- Modify: `src/ui/statusBar.ts`
- Modify: `src/commands/switchTask.ts`
- Modify: `src/commands/createTask.ts`

- [ ] **Step 1: Status bar shows Geral**

In `statusBar.ts`:

```typescript
if (!activeTask) {
  this.item.text = '$(home) Geral';
  this.item.tooltip = 'TaskKeeper: escopo Geral ativo — clique para trocar';
  this.item.backgroundColor = undefined;
  return;
}
```

- [ ] **Step 2: Toasts with change counts**

Helper in `src/utils/activationMessages.ts`:

```typescript
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
```

Use in `performActivation` and `activateGeneral` after fetching stats from cache.

- [ ] **Step 3: Commit**

```bash
git add src/ui/statusBar.ts src/commands/switchTask.ts src/commands/createTask.ts src/utils/activationMessages.ts
git commit -m "feat: show Geral in status bar and improve activation toasts"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/SPECIFICATION.md`
- Modify: `README.md`

- [ ] **Step 1: Update SPECIFICATION.md**

Add section on Geral scope, ChangeStat model, tree layout, and acceptance criteria from design spec.

- [ ] **Step 2: Update README.md**

Replace outdated "v0.0.2 — patches not implemented" note. Document Geral scope and change-oriented tree.

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md README.md
git commit -m "docs: document Geral scope and change-oriented task list"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Lista = alterações git M/A/D | Task 2, 7 |
| Arquivo aberto sem alteração não aparece | Task 7 (liveChangeStat only) |
| Contagem mod/add/del + delta linhas | Task 1, 2, 7 |
| Ordenação por lastActiveAt | Task 3 |
| Geral fixo no topo, ativável | Task 4, 5, 7 |
| Contexto recuperável ao trocar | Task 4, 5 |
| Stats inativos do patch | Task 2, 6 |
| Fallback sem git | Task 2, 7 |
| Toast previsível | Task 8 |
| Prompt referencia Geral | Task 5 |

No placeholders found. Type names consistent across tasks.
