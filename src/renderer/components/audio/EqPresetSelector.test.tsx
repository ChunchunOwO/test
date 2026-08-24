// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EqPreset } from '../../../shared/types/eq';
import { I18nProvider } from '../../i18n/I18nProvider';
import { EqPresetSelector } from './EqPresetSelector';

const presets: EqPreset[] = [
  { id: 'flat', name: 'Flat', preampDb: 0, bands: [], createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'open', name: 'Diffuse Inspired · Open', preampDb: -4, bands: [], createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
  { id: 'user', name: 'My Preset', preampDb: -2, bands: [], createdAt: 'now', updatedAt: 'now', readonly: false },
];

const renderSelector = (value = 'custom', onChange = vi.fn()): ReturnType<typeof render> => render(
  <I18nProvider>
    <EqPresetSelector presets={presets} value={value} onChange={onChange} />
  </I18nProvider>,
);

beforeEach(() => {
  window.localStorage.setItem('echo.locale', 'en-US');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EqPresetSelector', () => {
  it('shows the modified state first and clearly marks it as selected', async () => {
    renderSelector();

    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /EQ/ }));

    const options = await screen.findAllByRole('option');
    expect(['Modified', '已修改']).toContain(options[0]?.textContent);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
    expect(screen.getByRole('option', { name: /Diffuse Inspired/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('supports keyboard navigation, Escape focus return, outside close, and selection', async () => {
    const onChange = vi.fn();
    renderSelector('custom', onChange);
    const trigger = screen.getByRole('button', { name: /EQ/ });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const modified = (await screen.findAllByRole('option'))[0] as HTMLButtonElement;
    expect(document.activeElement).toBe(modified);

    fireEvent.keyDown(modified, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /^(Flat|平坦)$/ }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await screen.findByRole('option', { name: /^(Flat|平坦)$/ });
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: /^(Flat|平坦)$/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('flat'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows natural Chinese names for built-in presets', async () => {
    window.localStorage.setItem('echo.locale', 'zh-CN');
    render(
      <I18nProvider>
        <EqPresetSelector
          presets={[
            { id: 'flat', name: 'Flat', preampDb: 0, bands: [], createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
            { id: 'harman-target', name: 'Harman Inspired · Balanced', preampDb: -2, bands: [], createdAt: 'built-in', updatedAt: 'built-in', readonly: true },
          ]}
          value="custom"
          onChange={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /EQ/ }));

    expect(await screen.findByRole('option', { name: '平坦' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Harman 平衡' })).toBeTruthy();
  });
});
