import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BreakpointService } from '../src/services/breakpointService';
import { getMockVscodeState, resetMockVscode } from './helpers/mockVscode';

describe('BreakpointService', () => {
  it('capture round-trips serialized breakpoints', () => {
    resetMockVscode();
    const service = new BreakpointService('/workspace');
    service.restore([
      {
        type: 'source',
        file: 'src/app.ts',
        line: 4,
        enabled: true,
        condition: 'x > 1',
      },
      {
        type: 'function',
        functionName: 'myFn',
        enabled: false,
      },
    ]);

    const captured = service.capture();
    assert.equal(captured.length, 2);
    assert.equal(captured[0]?.type, 'source');
    assert.equal(captured[0]?.file, 'src/app.ts');
    assert.equal(captured[1]?.functionName, 'myFn');
  });

  it('clear removes all breakpoints', () => {
    resetMockVscode();
    getMockVscodeState().debugBreakpoints = [{ id: 1 }, { id: 2 }];
    const service = new BreakpointService('/workspace');
    service.clear();
    assert.equal(getMockVscodeState().debugBreakpoints.length, 0);
  });

  it('restore recreates breakpoints from serialized data', () => {
    resetMockVscode();
    const service = new BreakpointService('/workspace');
    service.restore([
      {
        type: 'source',
        file: 'src/main.ts',
        line: 10,
        enabled: true,
      },
      {
        type: 'function',
        functionName: 'handler',
        enabled: true,
      },
      {
        type: 'source',
        file: undefined,
        line: 1,
        enabled: true,
      },
    ]);

    assert.equal(getMockVscodeState().debugBreakpoints.length, 2);
  });
});
