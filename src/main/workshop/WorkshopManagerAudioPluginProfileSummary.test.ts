import { describe, expect, it } from 'vitest';
import { buildWorkshopManagerAudioPluginProfileSummary } from './WorkshopManagerAudioPluginProfileSummary';

describe('buildWorkshopManagerAudioPluginProfileSummary', () => {
  it('returns a path-free dependency summary without claiming the plug-in is active', () => {
    const summary = buildWorkshopManagerAudioPluginProfileSummary({
      sourceId: 'steam',
      itemId: '123',
      contentId: 'echo.profile',
      contentKind: 'audio-plugin-profile',
      version: '1.0.0',
      manifestSha256: 'a'.repeat(64),
      entryPath: 'audio-plugin-profile.json',
      activatedAt: '2026-08-16T00:00:00.000Z',
      contribution: {
        type: 'echo-workshop-audio-plugin-profile',
        schemaVersion: 1,
        id: 'echo.profile',
        title: 'Profile',
        format: 'vst3',
        role: 'instrument',
        plugin: {
          classId: '0123456789abcdef0123456789abcdef',
          name: 'Instrument',
          vendor: 'Vendor',
        },
        adapter: { api: 'echo.audio-plugin-adapter', minimumVersion: 2 },
        routing: { placement: 'pre-dsp' },
        parameters: [{ id: 1, title: 'Tone', kind: 'continuous', defaultValue: 0.5 }],
        presets: [{ id: 'soft', title: 'Soft', values: { 1: 0.25 } }],
      },
    });

    expect(summary).toMatchObject({
      role: 'instrument',
      parameterCount: 1,
      presetCount: 1,
      runtime: { state: 'adapter-required', minimumVersion: 2 },
    });
    expect(JSON.stringify(summary)).not.toMatch(/path|directory|dll/iu);
  });
});
