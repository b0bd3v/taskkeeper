import Module from 'node:module';

import { createVscodeMock } from './mockVscode';

const originalRequire = Module.prototype.require;

// Intercepta `require('vscode')` para testes fora do Extension Host.
Module.prototype.require = function (id: string, ...args: unknown[]) {
  if (id === 'vscode') {
    return createVscodeMock();
  }
  return (originalRequire as (...inner: unknown[]) => unknown).apply(this, [
    id,
    ...args,
  ]);
};
