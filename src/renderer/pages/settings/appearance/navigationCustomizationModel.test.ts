import { describe, expect, it } from 'vitest';
import { playerBarButtonSettingsItems } from './navigationCustomizationModel';

describe('player bar button customization', () => {
  it('does not expose streaming download in the Steam settings', () => {
    expect(playerBarButtonSettingsItems.map(({ id }) => id)).not.toContain('streamingDownload');
  });
});
