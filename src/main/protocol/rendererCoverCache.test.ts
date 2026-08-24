import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { resolveRendererOriginalCover } from './rendererCoverCache';

const testRoots: string[] = [];

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

describe('rendererCoverCache', () => {
  it('preserves original dimensions in a lossless renderer-safe asset', async () => {
    const root = join(tmpdir(), `echo-renderer-cover-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    testRoots.push(root);
    mkdirSync(root, { recursive: true });
    const originalPath = join(root, 'original.png');
    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 58, g: 92, b: 163, alpha: 1 },
      },
    }).png().toFile(originalPath);

    const result = await resolveRendererOriginalCover(originalPath);

    expect(result).toBeTruthy();
    expect(existsSync(result!)).toBe(true);
    const metadata = await sharp(readFileSync(result!)).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
  });
});
