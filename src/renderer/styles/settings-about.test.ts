import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('settings-about polish', () => {
  const css = readFileSync('src/renderer/styles/settings-about.css', 'utf8').replace(/\r\n/g, '\n');
  const aboutSection = readFileSync('src/renderer/pages/settings/about/AboutSettingsSection.tsx', 'utf8');
  const polish = readFileSync('src/renderer/styles/settings-polish.css', 'utf8');

  it('shows the app icon instead of a letter mark', () => {
    expect(css).toContain('.settings-about-identity-icon');
    expect(css).not.toContain('identity-mark');
    expect(aboutSection).toContain('echoAppIconUrl');
  });

  it('puts community links in one chip tray, not a text directory or boxed groups', () => {
    expect(aboutSection).toContain('settings-action-button');
    expect(aboutSection).toContain('settings-chip-row');
    expect(aboutSection).not.toContain('settings-about-link');
    expect(css).toContain('#settings-row-about-community > .settings-chip-row');
    expect(css).toContain('border-radius: 12px');
  });

  it('uses the same board hover and card closers as General', () => {
    expect(css).toContain('inset 2px 0 0');
    expect(css).toContain('#settings-sec-advancedCustom');
    expect(css).not.toContain('setting-row--about-stack');
    expect(css).not.toContain('settings-about-highlight-ping');
    expect(polish).not.toContain(':not(#settings-sec-about)');
  });

  it('loads after settings-polish so About can share the board language', () => {
    const settingsRoute = readFileSync('src/renderer/pages/SettingsRoute.tsx', 'utf8');
    expect(settingsRoute.indexOf("import '../styles/settings-about.css';")).toBeGreaterThan(
      settingsRoute.indexOf("import '../styles/settings-polish.css';"),
    );
  });
});
