import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFfmpegToolchain } from './FfmpegToolchain';

describe('FFmpeg platform development paths', () => {
  it('uses the macOS-specific development tool directory before the legacy directory', () => {
    const cwd = join('workspace', 'echo-steam');
    const macTool = join(cwd, 'electron-app', 'tools-macos', 'ffmpeg');
    const legacyTool = join(cwd, 'electron-app', 'tools', 'ffmpeg');

    const info = resolveFfmpegToolchain({
      env: {},
      platform: 'darwin',
      resourcesPath: null,
      cwd,
      existsSync: (path) => path === macTool || path === legacyTool,
      requireHealthy: false,
    });

    expect(info.path).toBe(macTool);
    expect(info.source).toBe('dev-bundled');
  });
});
