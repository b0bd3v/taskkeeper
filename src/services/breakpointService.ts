import * as path from 'node:path';

import * as vscode from 'vscode';

import type { SerializedBreakpoint } from '../models/taskContext';

/** Captura e restaura breakpoints via a Debug API do VS Code. */
export class BreakpointService {
  constructor(private readonly workspaceRoot: string) {}

  capture(): SerializedBreakpoint[] {
    const result: SerializedBreakpoint[] = [];

    for (const bp of vscode.debug.breakpoints) {
      if (bp instanceof vscode.SourceBreakpoint) {
        result.push({
          type: 'source',
          file: this.toRelative(bp.location.uri),
          line: bp.location.range.start.line,
          enabled: bp.enabled,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
        });
      } else if (bp instanceof vscode.FunctionBreakpoint) {
        result.push({
          type: 'function',
          functionName: bp.functionName,
          enabled: bp.enabled,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
        });
      }
    }

    return result;
  }

  clear(): void {
    vscode.debug.removeBreakpoints([...vscode.debug.breakpoints]);
  }

  restore(serialized: SerializedBreakpoint[]): void {
    this.clear();

    const breakpoints: vscode.Breakpoint[] = [];

    for (const entry of serialized) {
      if (entry.type === 'source' && entry.file !== undefined) {
        const uri = vscode.Uri.file(this.toAbsolute(entry.file));
        const position = new vscode.Position(entry.line ?? 0, 0);
        breakpoints.push(
          new vscode.SourceBreakpoint(
            new vscode.Location(uri, position),
            entry.enabled,
            entry.condition,
            entry.hitCondition,
            entry.logMessage,
          ),
        );
      } else if (entry.type === 'function' && entry.functionName !== undefined) {
        breakpoints.push(
          new vscode.FunctionBreakpoint(
            entry.functionName,
            entry.enabled,
            entry.condition,
            entry.hitCondition,
            entry.logMessage,
          ),
        );
      }
    }

    if (breakpoints.length > 0) {
      vscode.debug.addBreakpoints(breakpoints);
    }
  }

  private toRelative(uri: vscode.Uri): string {
    return path.relative(this.workspaceRoot, uri.fsPath);
  }

  private toAbsolute(relative: string): string {
    return path.isAbsolute(relative)
      ? relative
      : path.join(this.workspaceRoot, relative);
  }
}
