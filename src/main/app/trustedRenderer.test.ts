import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, isAllowedWorkshopFrameNavigation, isTrustedRendererUrl, isWorkshopFrameUrl } from './trustedRenderer';

describe('trusted renderer URL boundary', () => {
  it('allows the packaged renderer entry with query or hash changes only', () => {
    const trusted = 'file:///C:/Program%20Files/ECHO/resources/app.asar/out/renderer/index.html';

    expect(isTrustedRendererUrl(`${trusted}?miniPlayer=0#library`, trusted)).toBe(true);
    expect(isTrustedRendererUrl('file:///C:/Program%20Files/ECHO/resources/app.asar/out/renderer/other.html', trusted)).toBe(false);
    expect(isTrustedRendererUrl('https://attacker.example/', trusted)).toBe(false);
  });

  it('allows same-origin development navigation but rejects a different origin', () => {
    const trusted = 'http://127.0.0.1:5173/';

    expect(isTrustedRendererUrl('http://127.0.0.1:5173/settings?tab=remote', trusted)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/', trusted)).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:4173/', trusted)).toBe(false);
  });

  it('only sends HTTP(S) links to the system browser', () => {
    expect(isAllowedExternalUrl('https://example.com/docs')).toBe(true);
    expect(isAllowedExternalUrl('http://example.com/docs')).toBe(true);
    expect(isAllowedExternalUrl('file:///C:/secret.txt')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('keeps Workshop frames inside the same enabled item scope', () => {
    expect(isWorkshopFrameUrl('echo-workshop://plugin/steam/123/panel.html')).toBe(true);
    expect(isWorkshopFrameUrl('https://example.com/')).toBe(false);
    expect(isAllowedWorkshopFrameNavigation(
      'about:blank',
      'echo-workshop://plugin/steam/123/panel.html',
    )).toBe(true);
    expect(isAllowedWorkshopFrameNavigation(
      'echo-workshop://plugin/steam/123/panel.html',
      'echo-workshop://plugin/steam/123/other.html',
    )).toBe(true);
    expect(isAllowedWorkshopFrameNavigation(
      'echo-workshop://plugin/steam/123/panel.html',
      'echo-workshop://plugin/steam/456/panel.html',
    )).toBe(false);
    expect(isAllowedWorkshopFrameNavigation(
      'echo-workshop://ui/steam/123/index.html',
      'https://attacker.example/',
    )).toBe(false);
  });
});
