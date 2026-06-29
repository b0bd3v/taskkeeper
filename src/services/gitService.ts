import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import {
  EMPTY_CHANGE_STAT,
  type ChangeStat,
  type FileChange,
  type FileChangeStatus,
  sumChangeStat,
} from '../models/changeStat';

const exec = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;

export interface ChangeCapture {
  /** Unified diff (git diff --binary HEAD) das alterações da working tree. */
  patch: string;
  /** Arquivos novos (untracked) incluídos na captura, relativos ao root. */
  untracked: string[];
}

/**
 * Wrapper fino sobre o git CLI para "shelve" estilo JetBrains: captura as
 * alterações da working tree como patch, reverte a árvore e reaplica depois.
 */
export class GitService {
  constructor(private readonly cwd: string) {}

  /**
   * Indica se dá para fazer shelve: precisa estar dentro de um repositório git
   * E ter ao menos um commit (HEAD válido). Repos vazios caem no fallback,
   * evitando `git diff HEAD` / `git reset --hard HEAD` sem base.
   */
  async canShelve(): Promise<boolean> {
    try {
      const { stdout } = await this.run(['rev-parse', '--is-inside-work-tree']);
      if (stdout.trim() !== 'true') {
        return false;
      }
    } catch {
      return false;
    }

    try {
      await this.run(['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Captura as alterações atuais como patch único (modificações de arquivos
   * versionados + arquivos novos via intent-to-add). Não destrói a árvore.
   */
  async captureChanges(): Promise<ChangeCapture> {
    const untracked = await this.listUntracked();

    if (untracked.length > 0) {
      await this.run(['add', '-N', '--', ...untracked]);
    }

    let patch = '';
    try {
      const { stdout } = await this.run(['diff', '--binary', 'HEAD']);
      patch = stdout;
    } finally {
      if (untracked.length > 0) {
        // desfaz o intent-to-add, sem tocar no conteúdo dos arquivos
        await this.run(['reset', '--quiet', '--', ...untracked]).catch(
          () => undefined,
        );
      }
    }

    return { patch, untracked };
  }

  /**
   * Reverte a working tree ao estado limpo de HEAD e remove os arquivos novos
   * capturados. As alterações já devem ter sido salvas num patch.
   */
  async revertWorkingTree(untracked: string[]): Promise<void> {
    await this.run(['reset', '--hard', 'HEAD']);

    for (const relative of untracked) {
      try {
        await fsp.rm(path.join(this.cwd, relative), { force: true });
      } catch {
        // ignora arquivos já inexistentes
      }
    }
  }

  /**
   * Reaplica um patch salvo na working tree atual. Usa merge 3-way para
   * tolerar divergências de base. Retorna `false` em caso de conflito/falha.
   */
  async applyPatch(patchFilePath: string): Promise<boolean> {
    try {
      await this.run([
        'apply',
        '--3way',
        '--whitespace=nowarn',
        '--',
        patchFilePath,
      ]);
      return true;
    } catch {
      return false;
    }
  }

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

  private async listUntracked(): Promise<string[]> {
    try {
      const { stdout } = await this.run([
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
      ]);
      return stdout.split('\0').filter((entry) => entry.length > 0);
    } catch {
      return [];
    }
  }

  private run(args: string[]) {
    return exec('git', args, { cwd: this.cwd, maxBuffer: MAX_BUFFER });
  }
}

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
