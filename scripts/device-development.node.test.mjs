import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateHandoffState,
  parseAheadBehind,
  selectDeviceNpmScript,
  shouldRunDeviceSetup,
} from './device-development.mjs';

describe('cross-device development commands', () => {
  it('selects the native development entry for Windows and Apple Silicon macOS', () => {
    assert.equal(selectDeviceNpmScript({ platform: 'win32', arch: 'x64', task: 'setup' }), 'setup');
    assert.equal(selectDeviceNpmScript({ platform: 'win32', arch: 'x64', task: 'doctor' }), 'doctor');
    assert.equal(selectDeviceNpmScript({ platform: 'win32', arch: 'x64', task: 'start' }), 'dev');
    assert.equal(selectDeviceNpmScript({ platform: 'darwin', arch: 'arm64', task: 'setup' }), 'setup:mac');
    assert.equal(selectDeviceNpmScript({ platform: 'darwin', arch: 'arm64', task: 'doctor' }), 'doctor:mac');
    assert.equal(selectDeviceNpmScript({ platform: 'darwin', arch: 'arm64', task: 'start' }), 'dev:mac');
    assert.equal(selectDeviceNpmScript({ platform: 'darwin', arch: 'arm64', task: 'start', quick: true }), 'dev:mac:quick');
  });

  it('rejects unsupported or Rosetta-style development sessions', () => {
    assert.throws(
      () => selectDeviceNpmScript({ platform: 'darwin', arch: 'x64', task: 'start' }),
      /Apple Silicon/u,
    );
    assert.throws(
      () => selectDeviceNpmScript({ platform: 'linux', arch: 'x64', task: 'start' }),
      /supports Windows x64/u,
    );
  });

  it('parses Git ahead and behind counts', () => {
    assert.deepEqual(parseAheadBehind('2\t3'), { ahead: 2, behind: 3 });
  });

  it('reruns setup only when local dependencies or platform setup inputs require it', () => {
    assert.equal(shouldRunDeviceSetup({
      platform: 'win32',
      nodeModulesPresent: false,
      changedPaths: [],
    }), true);
    assert.equal(shouldRunDeviceSetup({
      platform: 'win32',
      nodeModulesPresent: true,
      changedPaths: ['src/renderer/App.tsx'],
    }), false);
    assert.equal(shouldRunDeviceSetup({
      platform: 'win32',
      nodeModulesPresent: true,
      changedPaths: ['package-lock.json'],
    }), true);
    assert.equal(shouldRunDeviceSetup({
      platform: 'darwin',
      nodeModulesPresent: true,
      changedPaths: ['build-resources\\macos\\Brewfile.dev'],
    }), true);
  });

  it('requires a clean, named, fully synchronized branch for handoff', () => {
    assert.deepEqual(evaluateHandoffState({
      branch: 'feature/device-switch',
      upstream: 'origin/feature/device-switch',
      dirtyFiles: [],
      ahead: 0,
      behind: 0,
    }), []);

    const blockers = evaluateHandoffState({
      branch: null,
      upstream: null,
      dirtyFiles: [' M package.json'],
      ahead: 2,
      behind: 1,
    });
    assert.equal(blockers.length, 5);
    assert.match(blockers.join(' '), /detached|uncommitted|upstream|ahead|behind/iu);
  });
});
