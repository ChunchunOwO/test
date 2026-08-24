import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workshopManifestFileName, type WorkshopContentKind } from '../../shared/types/workshop';
import { validateWorkshopContentDirectory } from './WorkshopContentValidator';

const temporaryDirectories: string[] = [];

const checksumText = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const createWorkshopDirectory = (
  files: Record<string, string>,
  options: { kind?: WorkshopContentKind; entry?: string; declaredFiles?: string[] } = {},
): string => {
  const root = mkdtempSync(join(tmpdir(), 'echo-workshop-content-'));
  temporaryDirectories.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }

  const declaredFiles = options.declaredFiles ?? Object.keys(files);
  const manifest = {
    type: 'echo-workshop-item',
    schemaVersion: 1,
    id: 'echo.validator-fixture',
    title: 'Validator Fixture',
    version: '1.0.0',
    content: {
      kind: options.kind ?? 'theme',
      entry: options.entry ?? 'theme.json',
    },
    compatibility: {
      minEchoVersion: '26.8.0',
      ...(options.kind === 'plugin-package' ? { pluginApiVersion: 2 } : {}),
    },
    files: declaredFiles.map((path) => ({
      path,
      size: Buffer.byteLength(files[path] ?? '', 'utf8'),
      sha256: checksumText(files[path] ?? ''),
    })),
    license: { id: 'CC0-1.0', holder: 'ECHO QA' },
  };
  writeFileSync(join(root, workshopManifestFileName), JSON.stringify(manifest), 'utf8');
  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Workshop content directory validation', () => {
  it('verifies every declared file before the item can enter an install flow', async () => {
    const root = createWorkshopDirectory({
      'theme.json': '{"accent":"#7dd3fc"}',
      'assets/preview.txt': 'preview',
    });

    await expect(validateWorkshopContentDirectory(root)).resolves.toMatchObject({
      rootDirectory: root,
      manifest: { id: 'echo.validator-fixture', content: { kind: 'theme' } },
      totalBytes: Buffer.byteLength('{"accent":"#7dd3fc"}preview', 'utf8'),
    });
  });

  it('rejects undeclared files and checksum mismatches fail closed', async () => {
    const undeclaredRoot = createWorkshopDirectory(
      { 'theme.json': '{}', 'hidden.txt': 'not declared' },
      { declaredFiles: ['theme.json'] },
    );
    await expect(validateWorkshopContentDirectory(undeclaredRoot)).rejects.toThrow(
      'workshop_content_undeclared_file:hidden.txt',
    );

    const checksumRoot = createWorkshopDirectory({ 'theme.json': '{}' });
    writeFileSync(join(checksumRoot, 'theme.json'), '[]', 'utf8');
    await expect(validateWorkshopContentDirectory(checksumRoot)).rejects.toThrow(
      'workshop_content_checksum_mismatch:theme.json',
    );
  });

  it('rejects native executable payloads even when they are declared and hashed', async () => {
    const root = createWorkshopDirectory(
      { 'plugin.echo': '{"type":"echo-plugin-package"}', 'payload.dll': 'binary-placeholder' },
      { kind: 'plugin-package', entry: 'plugin.echo' },
    );

    await expect(validateWorkshopContentDirectory(root)).rejects.toThrow(
      'workshop_content_executable_forbidden:payload.dll',
    );
  });

  it.each(['payload.vst3', 'payload.clap', 'payload.so', 'payload.dylib'])(
    'rejects native audio plug-in payload %s while profiles remain data-only',
    async (fileName) => {
      const directory = createWorkshopDirectory(
        { 'profile.json': '{}', [fileName]: 'native-plugin-placeholder' },
        { kind: 'audio-plugin-profile', entry: 'profile.json' },
      );
      await expect(validateWorkshopContentDirectory(directory)).rejects.toThrow(
        `workshop_content_executable_forbidden:${fileName}`,
      );
    },
  );

  it('rejects SVG payloads and raster-count or raster-size overflows', async () => {
    const svgRoot = createWorkshopDirectory({
      'theme.json': '{"accent":"#7dd3fc"}',
      'art/panel.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    await expect(validateWorkshopContentDirectory(svgRoot)).rejects.toThrow(
      'workshop_content_svg_forbidden:art/panel.svg',
    );

    const rasterFiles: Record<string, string> = { 'theme.json': '{}' };
    for (let index = 0; index < 17; index += 1) {
      rasterFiles[`art/${index}.png`] = 'x';
    }
    const tooMany = createWorkshopDirectory(rasterFiles);
    await expect(validateWorkshopContentDirectory(tooMany)).rejects.toThrow(
      'workshop_content_raster_asset_limit_exceeded',
    );

    const tooLarge = createWorkshopDirectory({
      'theme.json': '{}',
      'art/huge.png': 'x'.repeat(2 * 1024 * 1024 + 1),
    });
    await expect(validateWorkshopContentDirectory(tooLarge)).rejects.toThrow(
      'workshop_content_raster_asset_too_large',
    );
  });
});
