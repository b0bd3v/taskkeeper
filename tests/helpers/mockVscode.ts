/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MockVscodeState {
  inputBoxResult?: string;
  quickPickResult?: unknown;
  informationMessageResult?: string;
  warningMessageResult?: string;
  configValues: Record<string, unknown>;
  workspaceFolders: Array<{ uri: { fsPath: string } }>;
  textDocuments: MockTextDocument[];
  tabGroups: MockTabGroup[];
  debugBreakpoints: unknown[];
  executedCommands: Array<{ command: string; args?: unknown[] }>;
}

export interface MockTextDocument {
  uri: { fsPath: string; scheme: string };
  isDirty: boolean;
  getText: () => string;
}

export interface MockTab {
  input: unknown;
}

export interface MockTabGroup {
  viewColumn?: number;
  tabs: MockTab[];
}

function defaultState(): MockVscodeState {
  return {
    configValues: { 'bookmarks.saveBookmarksInProject': true },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    textDocuments: [],
    tabGroups: [],
    debugBreakpoints: [],
    executedCommands: [],
  };
}

let state = defaultState();
let cachedMock: Record<string, unknown> | undefined;

export function resetMockVscode(overrides: Partial<MockVscodeState> = {}): void {
  state = { ...defaultState(), ...overrides };
}

export function getMockVscodeState(): MockVscodeState {
  return state;
}

export function createVscodeMock(): Record<string, unknown> {
  if (cachedMock) {
    return cachedMock;
  }
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();

    readonly event = (listener: (value: T) => void): { dispose: () => void } => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };

    fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  class Disposable {
    constructor(private readonly call?: () => void) {}

    dispose(): void {
      this.call?.();
    }

    static from(...disposables: Array<{ dispose: () => void }>): Disposable {
      return new Disposable(() => disposables.forEach((d) => d.dispose()));
    }
  }

  class Position {
    constructor(
      readonly line: number,
      readonly character: number,
    ) {}
  }

  class Range {
    constructor(
      readonly start: Position,
      readonly end: Position,
    ) {}
  }

  class Location {
    readonly range: Range;

    constructor(
      readonly uri: { fsPath: string },
      positionOrRange: Position | Range,
    ) {
      this.range =
        positionOrRange instanceof Range
          ? positionOrRange
          : new Range(positionOrRange, positionOrRange);
    }
  }

  class Uri {
    readonly fsPath: string;
    readonly scheme: string;

    private constructor(fsPath: string, scheme = 'file') {
      this.fsPath = fsPath;
      this.scheme = scheme;
    }

    static file(fsPath: string): Uri {
      return new Uri(fsPath);
    }
  }

  class RelativePattern {
    constructor(
      readonly base: { uri: { fsPath: string } } | string,
      readonly pattern: string,
    ) {}
  }

  class ThemeColor {
    constructor(readonly id: string) {}
  }

  class ThemeIcon {
    constructor(
      readonly id: string,
      readonly color?: ThemeColor,
    ) {}
  }

  class MarkdownString {
    value = '';

    appendMarkdown(text: string): void {
      this.value += text;
    }
  }

  class TreeItem {
    id?: string;
    label?: string;
    description?: string;
    tooltip?: string | MarkdownString;
    iconPath?: ThemeIcon;
    contextValue?: string;
    command?: { command: string; title: string; arguments?: unknown[] };

    constructor(
      label: string,
      readonly collapsibleState: number,
    ) {
      this.label = label;
    }
  }

  class TabInputText {
    constructor(readonly uri: Uri) {}
  }

  class Breakpoint {}

  class SourceBreakpoint extends Breakpoint {
    constructor(
      readonly location: Location,
      readonly enabled: boolean,
      readonly condition?: string,
      readonly hitCondition?: string,
      readonly logMessage?: string,
    ) {
      super();
    }
  }

  class FunctionBreakpoint extends Breakpoint {
    constructor(
      readonly functionName: string,
      readonly enabled: boolean,
      readonly condition?: string,
      readonly hitCondition?: string,
      readonly logMessage?: string,
    ) {
      super();
    }
  }

  class WorkspaceEdit {
    replace(): void {
      return undefined;
    }
  }

  const statusBarItems: Array<{
    text: string;
    tooltip?: string | MarkdownString;
    backgroundColor?: ThemeColor;
    command?: string;
    show: () => void;
    dispose: () => void;
  }> = [];

  const configuration = {
    get<T>(key: string, defaultValue?: T): T {
      const fullKey = `bookmarks.${key}`;
      return (state.configValues[fullKey] ?? defaultValue) as T;
    },
    async update(
      key: string,
      value: unknown,
    ): Promise<void> {
      state.configValues[`bookmarks.${key}`] = value;
    },
  };

  const mock = {
    EventEmitter,
    Disposable,
    Position,
    Range,
    Location,
    Uri,
    RelativePattern,
    ThemeColor,
    ThemeIcon,
    MarkdownString,
    TreeItem,
    TabInputText,
    Breakpoint,
    SourceBreakpoint,
    FunctionBreakpoint,
    WorkspaceEdit,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Notification: 15 },
    ConfigurationTarget: { Workspace: 2 },
    ViewColumn: { One: 1, Two: 2 },
    window: {
      get tabGroups() {
        return { all: state.tabGroups };
      },
      createStatusBarItem: () => {
        const item = {
          text: '',
          tooltip: undefined as string | MarkdownString | undefined,
          backgroundColor: undefined as ThemeColor | undefined,
          command: undefined as string | undefined,
          show: () => undefined,
          dispose: () => undefined,
        };
        statusBarItems.push(item);
        return item;
      },
      showTextDocument: async (doc: MockTextDocument) => doc,
      showInputBox: async () => state.inputBoxResult,
      showQuickPick: async () => state.quickPickResult,
      showInformationMessage: async () => state.informationMessageResult,
      showWarningMessage: async () => state.warningMessageResult,
      withProgress: async (
        _options: unknown,
        task: () => Promise<void>,
      ) => task(),
      createTreeView: (_id: string, _options: unknown) => ({
        message: undefined as string | undefined,
        dispose: () => undefined,
      }),
    },
    workspace: {
      get workspaceFolders() {
        return state.workspaceFolders;
      },
      get textDocuments() {
        return state.textDocuments;
      },
      getConfiguration: () => configuration,
      openTextDocument: async (uri: Uri) => {
        const existing = state.textDocuments.find(
          (doc) => doc.uri.fsPath === uri.fsPath,
        );
        if (existing) {
          return existing;
        }
        const created: MockTextDocument & {
          positionAt: (offset: number) => Position;
        } = {
          uri: { fsPath: uri.fsPath, scheme: 'file' },
          isDirty: false,
          getText: () => '',
          positionAt: (offset: number) => new Position(0, offset),
        };
        state.textDocuments.push(created);
        return created;
      },
      applyEdit: async () => true,
      onDidSaveTextDocument: (listener: (doc: unknown) => void) => ({
        dispose: () => undefined,
        listener,
      }),
      onDidChangeTextDocument: (listener: (event: unknown) => void) => ({
        dispose: () => undefined,
        listener,
      }),
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose: () => undefined }),
        onDidCreate: () => ({ dispose: () => undefined }),
        onDidDelete: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
      }),
    },
    debug: {
      get breakpoints() {
        return state.debugBreakpoints;
      },
      addBreakpoints: (bps: unknown[]) => {
        state.debugBreakpoints.push(...bps);
      },
      removeBreakpoints: (bps: unknown[]) => {
        state.debugBreakpoints = state.debugBreakpoints.filter(
          (bp) => !bps.includes(bp),
        );
      },
      onDidChangeBreakpoints: (listener: () => void) => ({
        dispose: () => undefined,
        listener,
      }),
    },
    commands: {
      registerCommand: (_id: string, handler: (...args: unknown[]) => unknown) => ({
        dispose: () => undefined,
        handler,
      }),
      executeCommand: async (command: string, ...args: unknown[]) => {
        state.executedCommands.push({ command, args });
      },
    },
    __statusBarItems: statusBarItems,
  };

  cachedMock = mock;
  return mock;
}
