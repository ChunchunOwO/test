import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppIconPath } from './appIcon';

const tempDirs: string[] = [];

const makeMainOutputDir = (): { root: string; mainDir: string } => {
  const root = mkdtempSync(join(tmpdir(), 'echo-icon-'));
  const mainDir = join(root, 'out', 'main');

  mkdirSync(mainDir, { recursive: true });
  tempDirs.push(root);

  return { root, mainDir };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveAppIconPath', () => {
  it('finds the packaged build resource icon', () => {
    const { root, mainDir } = makeMainOutputDir();
    const iconPath = join(root, 'build-resources', 'icons', 'echo-app-icon.ico');
    mkdirSync(join(root, 'build-resources', 'icons'), { recursive: true });
    writeFileSync(iconPath, '');

    expect(resolveAppIconPath(mainDir)).toBe(iconPath);
  });

  it('ignores historical root icon duplicates', () => {
    const { root, mainDir } = makeMainOutputDir();
    writeFileSync(join(root, 'echo-app-icon.ico'), '');

    expect(resolveAppIconPath(mainDir)).toBeNull();
  });
});
