import { describe, expect, it } from 'vitest';
import { WorkshopAudioPluginProfileHandler } from './WorkshopAudioPluginProfileHandler';

const validProfile = {
  type: 'echo-workshop-audio-plugin-profile',
  schemaVersion: 1,
  id: 'echo.test-vst-profile',
  title: 'Test VST Profile',
  description: 'Portable parameter mapping only.',
  format: 'vst3',
  role: 'effect',
  plugin: {
    classId: '0123456789abcdef0123456789abcdef',
    name: 'Example Effect',
    vendor: 'Example Vendor',
  },
  adapter: { api: 'echo.audio-plugin-adapter', minimumVersion: 1 },
  routing: { placement: 'post-dsp' },
  parameters: [
    { id: 7, title: 'Mix', kind: 'continuous', defaultValue: 0.5 },
    { id: 9, title: 'Mode', kind: 'choice', defaultValue: 0, choices: ['Clean', 'Wide'] },
  ],
  presets: [
    { id: 'wide', title: 'Wide', values: { 7: 0.8, 9: 1 } },
  ],
};

describe('WorkshopAudioPluginProfileHandler', () => {
  it('normalizes a binary-free VST3 mapping for a subscriber-installed plug-in', () => {
    const profile = new WorkshopAudioPluginProfileHandler().normalize(
      validProfile,
      'echo.test-vst-profile',
    );

    expect(profile).toMatchObject({
      format: 'vst3',
      role: 'effect',
      plugin: { classId: '0123456789abcdef0123456789abcdef' },
      routing: { placement: 'post-dsp' },
      presets: [{ id: 'wide', values: { 7: 0.8, 9: 1 } }],
    });
  });

  it('supports VST3 instruments as a declared local dependency', () => {
    const profile = new WorkshopAudioPluginProfileHandler().normalize(
      { ...validProfile, role: 'instrument', routing: { placement: 'pre-dsp' } },
      'echo.test-vst-profile',
    );
    expect(profile.role).toBe('instrument');
  });

  it('rejects undeclared parameters, invalid class IDs, and binary paths', () => {
    expect(() => new WorkshopAudioPluginProfileHandler().normalize({
      ...validProfile,
      presets: [{ id: 'bad', title: 'Bad', values: { 99: 1 } }],
    }, 'echo.test-vst-profile')).toThrow('workshop_data_audio_plugin_preset_parameter_unknown');

    expect(() => new WorkshopAudioPluginProfileHandler().normalize({
      ...validProfile,
      plugin: { ...validProfile.plugin, classId: 'not-a-class-id' },
    }, 'echo.test-vst-profile')).toThrow('workshop_data_audio_plugin_class_id_invalid');

    expect(() => new WorkshopAudioPluginProfileHandler().normalize({
      ...validProfile,
      binary: 'plugin.dll',
    }, 'echo.test-vst-profile')).toThrow('workshop_data_audio_plugin_profile_unknown_field');
  });
});
