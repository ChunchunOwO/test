import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createSteamReleasePreflight, readGitMetadata } from './create-release-preflight-report.mjs';

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'echo-steam-preflight-'));
  const artifactRoot = join(root, 'dist', 'win-unpacked');
  mkdirSync(join(artifactRoot, 'resources'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'echo-steam', version: '1.2.3', productName: 'ECHO' }));
  writeFileSync(join(artifactRoot, 'ECHO.exe'), 'exe');
  writeFileSync(join(artifactRoot, 'resources', 'app.asar'), 'asar');
  return { root, artifactRoot };
};

describe('Steam release preflight report', () => {
  it('recognizes a clean Git worktree when porcelain output is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-steam-clean-git-'));
    execFileSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    expect(readGitMetadata(root).clean).toBe(true);
  });

  it('writes a reproducible privacy-safe inventory when all checks pass', async () => {
    const fixture = createFixture();
    const runCheck = vi.fn(({ script }) => ({ name: script, passed: true, output: 'PASS' }));
    const result = await createSteamReleasePreflight({
      ...fixture,
      env: { ECHO_STEAM_RELEASE_APP_ID: '123456', ECHO_STEAM_PRO_DLC_APP_ID: '654321' },
      git: { sha: 'abc123', branch: 'main', clean: true },
      now: new Date('2026-08-09T00:00:00.000Z'),
      runCheck,
    });

    expect(result.report.result).toBe('pass');
    expect(result.report.artifact.files).toHaveLength(2);
    expect(result.report.artifact.files[0]?.path).not.toContain(fixture.root);
    expect(readFileSync(result.manifestPath, 'utf8')).toMatch(/[a-f0-9]{64} {2}ECHO\.exe/u);
    expect(runCheck).toHaveBeenCalledTimes(4);
    expect(runCheck).toHaveBeenCalledWith(expect.objectContaining({
      script: 'scripts/verify-win-release-signatures.mjs',
      args: expect.arrayContaining(['--optional', '--unpacked-only']),
    }));
  });

  it('fails closed but still writes a report for dirty or forbidden artifacts', async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.artifactRoot, 'steam_appid.txt'), '480');
    const result = await createSteamReleasePreflight({
      ...fixture,
      env: {},
      git: { sha: 'abc123', branch: 'main', clean: false },
      runCheck: ({ script }) => ({ name: script, passed: false, output: 'failed' }),
    });

    expect(result.report.result).toBe('fail');
    expect(result.report.findings.join('\n')).toMatch(/steam_appid\.txt/u);
    expect(result.report.findings.join('\n')).toMatch(/worktree is not clean/iu);
    expect(readFileSync(result.jsonPath, 'utf8')).toContain('"result": "fail"');
  });
});
