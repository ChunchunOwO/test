// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultGlobalShortcuts,
  createDefaultLocalShortcuts,
} from '../../../../shared/types/globalShortcuts';
import type { TranslationKey } from '../../../i18n/locales';
import { ShortcutBindingsPanel } from './ShortcutBindingsPanel';

const translate = (key: TranslationKey, options?: Record<string, string | number>): string => {
  if (!options) {
    return key;
  }

  return `${key}:${JSON.stringify(options)}`;
};

const playbackGroupHeader = () =>
  screen.getByRole('button', { name: /^settings\.shortcuts\.group\.playback / });

const renderPanel = (props?: Partial<ComponentProps<typeof ShortcutBindingsPanel>>) =>
  render(
    <ShortcutBindingsPanel
      disabled={false}
      globalShortcuts={createDefaultGlobalShortcuts()}
      localShortcuts={createDefaultLocalShortcuts()}
      recordingShortcutTarget={null}
      shortcutMessages={{}}
      subsection={{
        title: 'settings.shortcuts.bindings.title',
        description: 'settings.shortcuts.bindings.description',
      }}
      t={translate}
      onClear={vi.fn()}
      onRecord={vi.fn()}
      onToggle={vi.fn()}
      {...props}
    />,
  );

describe('ShortcutBindingsPanel', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('renders grouped shortcut rows expanded by default', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'settings.shortcuts.group.playback' })).toBeTruthy();
    expect(screen.getByText('settings.shortcuts.action.playPause.title')).toBeTruthy();
    expect(screen.getByText('settings.shortcuts.action.volumeUp.title')).toBeTruthy();
    expect(screen.queryByText('settings.shortcuts.action.openMvSettings.title')).toBeNull();
  });

  it('collapses a group and can restore every group', () => {
    renderPanel();

    fireEvent.click(playbackGroupHeader());
    expect(screen.queryByText('settings.shortcuts.action.playPause.title')).toBeNull();
    expect(screen.getByText('settings.shortcuts.action.volumeUp.title')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'settings.shortcuts.group.expandAll' }));
    expect(screen.getByText('settings.shortcuts.action.playPause.title')).toBeTruthy();
  });

  it('filters to one category and toggles that chip back to all groups', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'settings.shortcuts.group.volume' }));
    expect(screen.getByText('settings.shortcuts.action.volumeUp.title')).toBeTruthy();
    expect(screen.queryByText('settings.shortcuts.action.playPause.title')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'settings.shortcuts.group.volume' }));
    expect(screen.getByText('settings.shortcuts.action.playPause.title')).toBeTruthy();
  });

  it('expands a collapsed group when that action starts recording', () => {
    const localShortcuts = createDefaultLocalShortcuts();
    const globalShortcuts = createDefaultGlobalShortcuts();
    const { rerender } = renderPanel({ localShortcuts, globalShortcuts });

    fireEvent.click(playbackGroupHeader());
    expect(screen.queryByText('settings.shortcuts.action.playPause.title')).toBeNull();

    rerender(
      <ShortcutBindingsPanel
        disabled={false}
        globalShortcuts={globalShortcuts}
        localShortcuts={localShortcuts}
        recordingShortcutTarget={{ scope: 'local', action: 'playPause' }}
        shortcutMessages={{}}
        subsection={{
          title: 'settings.shortcuts.bindings.title',
          description: 'settings.shortcuts.bindings.description',
        }}
        t={translate}
        onClear={vi.fn()}
        onRecord={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('settings.shortcuts.action.playPause.title')).toBeTruthy();
  });
});
