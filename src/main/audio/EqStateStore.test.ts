import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EqStateStore } from './EqStateStore';

const electronMock = vi.hoisted(() => ({
  throwGetPath: false,
  userDataPath: '',
}));

vi.mock('electron', () => {
  const app = {
    getPath: vi.fn((name: string) => {
      if (electronMock.throwGetPath) {
        throw new Error('userData unavailable');
      }

      return name === 'userData' ? electronMock.userDataPath : '';
    }),
  };

  return { app, default: { app } };
});

const originalCwd = process.cwd();
const originalEnv = {
  APPDATA: process.env.APPDATA,
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};
const roots: string[] = [];

const restoreEnv = (name: keyof typeof originalEnv): void => {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

const expectedFallbackConfigPath = (root: string): string => {
  if (process.platform === 'linux') {
    return join(root, 'xdg-config', 'echo-steam');
  }

  if (process.platform === 'darwin') {
    return join(root, 'home', 'Library', 'Application Support', 'ECHO Steam');
  }

  if (process.platform === 'win32') {
    return join(root, 'app-data', 'ECHO Steam');
  }

  return join(root, 'home', '.config', 'echo-steam');
};

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'echo-eq-state-store-'));
  roots.push(root);

  const cwd = join(root, 'cwd');
  const userDataPath = join(root, 'user-data');
  mkdirSync(cwd, { recursive: true });
  process.chdir(cwd);
  electronMock.throwGetPath = false;
  electronMock.userDataPath = userDataPath;
});

afterEach(() => {
  process.chdir(originalCwd);
  restoreEnv('APPDATA');
  restoreEnv('HOME');
  restoreEnv('USERPROFILE');
  restoreEnv('XDG_CONFIG_HOME');

  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('EqStateStore paths', () => {
  it('persists EQ state under Electron userData instead of the current working directory', () => {
    const state = EqStateStore.loadEqState();

    EqStateStore.saveEqState({ ...state, enabled: true });

    expect(existsSync(join(electronMock.userDataPath, 'eq', 'state.json'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'eq'))).toBe(false);
  });

  it('falls back to the ECHO config directory when Electron userData is unavailable', () => {
    const root = roots[0];
    process.env.APPDATA = join(root, 'app-data');
    process.env.HOME = join(root, 'home');
    process.env.USERPROFILE = join(root, 'home');
    process.env.XDG_CONFIG_HOME = join(root, 'xdg-config');
    electronMock.throwGetPath = true;

    const state = EqStateStore.loadEqState();
    EqStateStore.saveEqState({ ...state, enabled: true });

    expect(existsSync(join(expectedFallbackConfigPath(root), 'eq', 'state.json'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'eq'))).toBe(false);
  });

  it('ignores relative config environment paths when Electron userData is unavailable', () => {
    const root = roots[0];
    process.env.APPDATA = 'relative-app-data';
    process.env.HOME = join(root, 'safe-home');
    process.env.USERPROFILE = 'relative-profile';
    process.env.XDG_CONFIG_HOME = 'relative-xdg-config';
    electronMock.throwGetPath = true;

    const state = EqStateStore.loadEqState();
    EqStateStore.saveEqState({ ...state, enabled: true });

    expect(existsSync(join(process.cwd(), 'eq'))).toBe(false);
    expect(existsSync(join(tmpdir(), '.config', 'echo-steam', 'eq'))).toBe(false);
    expect(existsSync(join(root, 'safe-home', '.config', 'echo-steam', 'eq', 'state.json'))).toBe(process.platform === 'linux');
  });

  it('returns cloned EQ state so repeated loads cannot mutate the cache', () => {
    const first = EqStateStore.loadEqState();
    first.enabled = true;
    first.bands[0]!.gainDb = 6;

    const second = EqStateStore.loadEqState();

    expect(second.enabled).toBe(false);
    expect(second.bands[0]?.gainDb).toBe(0);
  });

  it('serves saved EQ state from cache without losing the persisted file', () => {
    const initial = EqStateStore.loadEqState();
    EqStateStore.saveEqState({ ...initial, enabled: true, presetName: 'Cached' });

    const loaded = EqStateStore.loadEqState();
    loaded.enabled = false;

    expect(EqStateStore.loadEqState()).toMatchObject({
      enabled: true,
    });
    expect(existsSync(join(electronMock.userDataPath, 'eq', 'state.json'))).toBe(true);
  });
});
