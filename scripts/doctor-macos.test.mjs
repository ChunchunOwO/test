import { describe, expect, it } from 'vitest';
import { createMacosDoctorEvidence, evaluateMacosDevelopmentEnvironment } from './doctor-macos.mjs';

const healthyProbe = (command, args) => {
  const key = `${command} ${args.join(' ')}`;
  const outputs = new Map([
    ['xcode-select -p', '/Applications/Xcode.app/Contents/Developer'],
    ['xcrun --find clang', '/usr/bin/clang'],
    ['xcrun --sdk macosx --show-sdk-path', '/Applications/Xcode.app/SDKs/MacOSX.sdk'],
    ['cmake --version', 'cmake version 3.31.0'],
    ['pkg-config --version', '2.3.0'],
    ['pkg-config --exists libavformat libavcodec libswresample libavutil', ''],
    ['ffmpeg -hide_banner -version', 'ffmpeg version 8.0'],
    ['uname -m', 'arm64'],
  ]);
  if (key === 'sysctl -in sysctl.proc_translated') return { ok: false, output: 'unknown oid' };
  return outputs.has(key)
    ? { ok: true, output: outputs.get(key) }
    : { ok: false, output: `unexpected probe ${key}` };
};

describe('macOS development doctor', () => {
  it('accepts the pinned arm64 compile toolchain', () => {
    const report = evaluateMacosDevelopmentEnvironment({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '22.23.2',
      npmVersion: '10.9.8',
      probe: healthyProbe,
      compileOnly: true,
    });
    expect(report.ready).toBe(true);
  });

  it('rejects Rosetta or Intel development sessions', () => {
    const report = evaluateMacosDevelopmentEnvironment({
      platform: 'darwin',
      arch: 'x64',
      nodeVersion: '22.23.2',
      npmVersion: '10.9.8',
      probe: (command, args) => command === 'sysctl'
        ? { ok: true, output: '1' }
        : healthyProbe(command, args),
      compileOnly: true,
    });
    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Apple Silicon process', ok: false }),
      expect.objectContaining({ name: 'Rosetta translation disabled', ok: false }),
    ]));
  });

  it('rejects npm versions that drift from the packageManager pin', () => {
    const report = evaluateMacosDevelopmentEnvironment({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '22.23.2',
      npmVersion: '10.8.3',
      probe: healthyProbe,
      compileOnly: true,
    });
    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'npm', ok: false }),
    ]));
  });

  it('fails closed when invoked away from macOS', () => {
    const report = evaluateMacosDevelopmentEnvironment({
      platform: 'win32',
      arch: 'x64',
      nodeVersion: '22.23.2',
      npmVersion: '10.9.8',
      probe: healthyProbe,
    });
    expect(report.ready).toBe(false);
    expect(report.checks).toEqual([
      expect.objectContaining({ name: 'macOS host', ok: false }),
    ]);
  });

  it('does not report unchecked release tooling as ready in compile-only evidence', () => {
    const report = evaluateMacosDevelopmentEnvironment({
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '22.23.2',
      npmVersion: '10.9.8',
      probe: healthyProbe,
      compileOnly: true,
    });
    expect(createMacosDoctorEvidence({
      report,
      compileOnly: true,
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '22.23.2',
      npmVersion: '10.9.8',
      timestamp: '2026-08-17T00:00:00.000Z',
    })).toMatchObject({
      result: 'pass',
      kind: 'compile-prerequisites',
      releaseToolsChecked: false,
      releaseToolsReady: null,
    });
  });
});
