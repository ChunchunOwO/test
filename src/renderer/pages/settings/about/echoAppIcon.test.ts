import { describe, expect, it } from 'vitest';
import { echoAppIconUrl } from './echoAppIcon';

describe('echoAppIconUrl', () => {
  it('points at the packaged ECHO app icon', () => {
    expect(echoAppIconUrl).toContain('echo-app-icon.png');
  });
});
