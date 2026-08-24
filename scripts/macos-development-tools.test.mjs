import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMacosDevAppLaunch } from './launch-macos-dev-app.mjs';
import { getMacosDevAppCandidates, findMacosDevApp } from './macos-dev-app-paths.mjs';
import { createMacosNativePreparationSteps } from './prepare-macos-native.mjs';
import { assertPinnedMacosJavaScriptToolchain, createMacosSetupSteps } from './setup-macos.mjs';

describe('macOS development tools', () => {
  it('fails before system installation when Node or npm is outside the repository contract', () => {
    expect(() => assertPinnedMacosJavaScriptToolchain({
      nodeVersion: '22.23.2',
      npmUserAgent: 'npm/10.9.8 node/v22.23.2 darwin arm64',
    })).not.toThrow();
    expect(() => assertPinnedMacosJavaScriptToolchain({
      nodeVersion: '22.22.0',
      npmUserAgent: 'npm/10.9.8 node/v22.22.0 darwin arm64',
    })).toThrow(/Node\.js 22\.23\.2/u);
    expect(() => assertPinnedMacosJavaScriptToolchain({
      nodeVersion: '22.23.2',
      npmUserAgent: 'npm/11.1.0 node/v22.23.2 darwin arm64',
    })).toThrow(/npm 10\.9\.8/u);
    expect(() => assertPinnedMacosJavaScriptToolchain({
      nodeVersion: '22.23.2',
      npmUserAgent: 'npm/10.8.3 node/v22.23.2 darwin arm64',
    })).toThrow(/npm 10\.9\.8/u);
  });

  it('keeps first-time system dependencies in one Homebrew manifest', () => {
    const steps = createMacosSetupSteps({
      root: '/repo',
      npmExecPath: '/node/npm-cli.js',
      nodePath: '/node/bin/node',
    });
    expect(steps).toEqual([
      expect.objectContaining({
        command: 'brew',
        args: ['bundle', `--file=${join('/repo', 'build-resources', 'macos', 'Brewfile.dev')}`],
      }),
      expect.objectContaining({
        command: '/node/bin/node',
        args: ['/node/npm-cli.js', 'ci'],
      }),
      expect.objectContaining({
        args: [join('/repo', 'scripts', 'doctor-macos.mjs'), '--compile-only'],
      }),
    ]);
  });

  it('prepares only the native pieces required by macOS development', () => {
    const steps = createMacosNativePreparationSteps({ root: '/repo', nodePath: '/node' });
    const commands = steps.flatMap((step) => step.args).join(' ');
    expect(commands).toContain('ensure-native-abi.mjs electron');
    expect(commands).toContain('build-audio-host.mjs');
    expect(commands).toContain('build-native-scanner.mjs');
    expect(commands).not.toMatch(/airplay|smtc|taskbar|steam-leaderboards/iu);
    expect(steps.find((step) => step.label === 'Native Audio Host')?.env).toEqual({
      ECHO_ENABLE_ASIO: 'OFF',
      ECHO_ENABLE_CUDA_DSP: 'OFF',
    });
  });

  it('locates both electron-builder macOS directory layouts', () => {
    const candidates = getMacosDevAppCandidates({ projectRoot: '/repo', arch: 'arm64' });
    expect(candidates).toEqual([
      join('/repo', 'dist', 'mac-arm64', 'ECHO.app'),
      join('/repo', 'dist', 'mac', 'ECHO.app'),
    ]);
    expect(findMacosDevApp({
      projectRoot: '/repo',
      arch: 'arm64',
      pathExists: (path) => path === candidates[1],
    })).toBe(candidates[1]);
  });

  it('supports terminal-log and LaunchServices app starts', () => {
    expect(createMacosDevAppLaunch({
      appPath: '/repo/dist/mac-arm64/ECHO.app',
      appArgs: ['--inspect=9229'],
    })).toEqual({
      command: join('/repo/dist/mac-arm64/ECHO.app', 'Contents', 'MacOS', 'ECHO'),
      args: ['--inspect=9229'],
    });
    expect(createMacosDevAppLaunch({
      appPath: '/repo/dist/mac-arm64/ECHO.app',
      finder: true,
    })).toEqual({
      command: 'open',
      args: ['-n', '/repo/dist/mac-arm64/ECHO.app'],
    });
  });
});
