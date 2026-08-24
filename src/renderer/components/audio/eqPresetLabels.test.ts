import { describe, expect, it } from 'vitest';
import { builtInEqPresetDefinitions } from '../../../shared/audio/eqBuiltInPresets';
import type { TranslationKey } from '../../i18n/locales';
import { zhCN } from '../../i18n/locales/zhCN';
import { describePreset } from './eqPanelUtils';
import { builtInEqPresetNameKeyById, eqPresetSearchText, resolveEqPresetLabel } from './eqPresetLabels';

const translateZh = (key: TranslationKey): string => zhCN[key] ?? key;

describe('eqPresetLabels', () => {
  it('gives every built-in preset a localized name key and metadata', () => {
    for (const preset of builtInEqPresetDefinitions) {
      expect(builtInEqPresetNameKeyById[preset.id], preset.id).toBeTruthy();
      expect(describePreset(preset.id), preset.id).toBeTruthy();
    }
  });

  it('keeps Chinese preset names plain instead of literary nicknames', () => {
    expect(resolveEqPresetLabel({ id: 'flat', name: 'Flat' }, translateZh)).toBe('平坦');
    expect(resolveEqPresetLabel({ id: 'rock', name: 'Rock Drive' }, translateZh)).toBe('摇滚');
    expect(resolveEqPresetLabel({ id: 'harman-target', name: 'Harman Inspired · Balanced' }, translateZh)).toBe('Harman 平衡');
    expect(resolveEqPresetLabel({ id: 'bass-boost', name: 'Bass Punch' }, translateZh)).toBe('低音增强');
    expect(eqPresetSearchText({ id: 'flat', name: 'Flat' }, translateZh)).toContain('Flat');
    expect(eqPresetSearchText({ id: 'flat', name: 'Flat' }, translateZh)).toContain('平坦');
  });

  it('falls back to the stored name for user presets', () => {
    expect(resolveEqPresetLabel({ id: 'user-bright', name: 'My Bright' }, translateZh)).toBe('My Bright');
  });
});
