import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  echoWorkshopConsumerAppId,
  WorkshopAuthoringService,
  workshopAuthoringPreviewFileName,
  workshopAuthoringProjectFileName,
  workshopAuthoringVdfFileName,
} from './WorkshopAuthoringService';

const previewFixture = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

const createThemeProject = async () => {
  const rootDirectory = join(await mkdtemp(join(tmpdir(), 'echo-workshop-authoring-')), 'project');
  const service = new WorkshopAuthoringService();
  await service.createProject({
    rootDirectory,
    kind: 'theme',
    id: 'echo.test-theme',
    title: 'Test Theme',
    licenseHolder: 'ECHO Test',
    minEchoVersion: '26.8.2-beta.4',
  });
  await writeFile(resolve(rootDirectory, 'preview.jpg'), previewFixture);
  return { rootDirectory, service };
};

const supportedKinds = [
  ['theme', 'Theme'],
  ['lyrics-style', 'Lyrics Scene'],
  ['visualizer-preset', 'Visualizer Preset'],
  ['dsp-preset', 'DSP / EQ Preset'],
  ['audio-plugin-profile', 'DSP / EQ Preset'],
  ['plugin-package', 'Sandboxed Plugin'],
] as const;

describe('WorkshopAuthoringService', () => {
  it('creates and prepares a private main-AppID data-only project', async () => {
    const { rootDirectory, service } = await createThemeProject();
    await writeFile(resolve(rootDirectory, 'content', 'notes.txt'), 'declared after prepare');

    const prepared = await service.prepareProject(rootDirectory);
    const manifest = JSON.parse(await readFile(resolve(
      rootDirectory,
      'content',
      'echo.workshop.json',
    ), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
    const vdf = await readFile(resolve(rootDirectory, workshopAuthoringVdfFileName), 'utf8');
    const preview = await readFile(resolve(rootDirectory, workshopAuthoringPreviewFileName), 'utf8');

    expect(prepared.manifest.id).toBe('echo.test-theme');
    expect(prepared.manifest.content.kind).toBe('theme');
    expect(manifest.files.map((file) => file.path)).toEqual(['notes.txt', 'theme.json']);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256))).toBe(true);
    expect(vdf).toContain(`"appid" "${echoWorkshopConsumerAppId}"`);
    expect(vdf).toContain('"publishedfileid" "0"');
    expect(vdf).toContain('"visibility" "2"');
    expect(vdf).not.toMatch(/password|login/u);
    expect(preview).toContain('Test Theme');
    expect(preview).toContain('Theme');
  });

  it('detects tampering with the production checksum validator', async () => {
    const { rootDirectory, service } = await createThemeProject();
    await service.prepareProject(rootDirectory);
    await writeFile(resolve(rootDirectory, 'content', 'theme.json'), '{}');

    await expect(service.validateProject(rootDirectory)).rejects.toThrow(
      'workshop_content_file_size_mismatch',
    );
  });

  it('reads, live-validates, and saves an editable in-app draft', async () => {
    const { rootDirectory, service } = await createThemeProject();
    const draft = await service.readDraft(rootDirectory);
    const entry = JSON.parse(draft.entryText) as Record<string, unknown>;
    const entryText = `${JSON.stringify({ ...entry, title: 'Edited in ECHO' }, null, 2)}\n`;

    expect(service.validateDraft({ manifestText: draft.manifestText, entryText })).toMatchObject({
      ok: true,
      kind: 'theme',
      id: 'echo.test-theme',
    });

    const saved = await service.saveDraft(rootDirectory, { manifestText: draft.manifestText, entryText });
    const prepared = await service.prepareProject(rootDirectory);

    expect(saved.entryText).toContain('Edited in ECHO');
    expect(prepared.normalizedContribution).toMatchObject({ title: 'Edited in ECHO' });
  });

  it('returns a bounded validation error without writing an invalid draft', async () => {
    const { rootDirectory, service } = await createThemeProject();
    const draft = await service.readDraft(rootDirectory);

    expect(service.validateDraft({ manifestText: draft.manifestText, entryText: '{' })).toEqual({
      ok: false,
      kind: null,
      id: null,
      title: null,
      normalizedContribution: null,
      error: 'workshop_authoring_entry_invalid_json',
    });
  });

  it('fails closed when a project targets anything except the ECHO main AppID', async () => {
    const { rootDirectory, service } = await createThemeProject();
    const configPath = resolve(rootDirectory, workshopAuthoringProjectFileName);
    const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    await writeFile(configPath, `${JSON.stringify({ ...config, appId: '5105150' }, null, 2)}\n`);

    await expect(service.prepareProject(rootDirectory)).rejects.toThrow(
      'workshop_authoring_main_app_id_required',
    );
  });

  it.each(supportedKinds)('creates a production-valid %s template', async (kind, tag) => {
    const rootDirectory = join(await mkdtemp(join(tmpdir(), 'echo-workshop-authoring-')), 'project');
    const service = new WorkshopAuthoringService();
    await service.createProject({
      rootDirectory,
      kind,
      id: `echo.test-${kind}`,
      title: `Test ${kind}`,
      licenseHolder: 'ECHO Test',
      minEchoVersion: '26.8.2-beta.4',
    });
    await writeFile(resolve(rootDirectory, 'preview.jpg'), previewFixture);

    const prepared = await service.prepareProject(rootDirectory);
    const preview = await readFile(resolve(rootDirectory, workshopAuthoringPreviewFileName), 'utf8');

    expect(prepared.manifest.content.kind).toBe(kind);
    expect(prepared.normalizedContribution).toBeTruthy();
    expect(preview).toContain(tag);
  });
});
