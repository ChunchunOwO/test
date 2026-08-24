// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LibraryTrack } from '../../../shared/types/library';
import { clearTrackContextMenuPluginCacheForTests, TrackContextMenu } from './TrackContextMenu';
import { publishWorkshopTrackContextActions } from '../../workshop/WorkshopTrackContextActions';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const track: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\track-1.flac',
  title: 'Track One',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'FLAC',
  sampleRate: 96_000,
  bitDepth: 24,
  bitrate: 1_200_000,
  coverId: null,
  coverThumb: null,
  embeddedMetadataStatus: 'present',
  embeddedCoverStatus: 'missing',
  networkMetadataStatus: 'none',
  fieldSources: {},
};

describe('TrackContextMenu Steam actions', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearTrackContextMenuPluginCacheForTests();
    Reflect.deleteProperty(window, 'echo');
  });

  it('does not query or show plugin-provided track actions', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const list = vi.fn(async () => ({ directory: 'D:\\Echo\\Plugins', plugins: [] }));
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        plugins: { list },
      },
    });

    render(<TrackContextMenu track={track} position={{ x: 20, y: 24 }} onAction={onAction} onClose={onClose} />);

    expect(await screen.findByRole('menuitem', { name: 'trackMenu.action.playNext' })).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('does not wait for a legacy plugin bridge before showing the menu', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const list = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        plugins: { list },
      },
    });

    render(<TrackContextMenu track={track} position={{ x: 20, y: 24 }} onAction={onAction} onClose={onClose} />);

    expect(await screen.findByRole('menuitem', { name: 'trackMenu.action.playNext' })).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });

  it('shows ready Workshop track actions without querying the legacy plugin bridge', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const run = vi.fn(async () => undefined);
    publishWorkshopTrackContextActions([{
      key: 'steam:123:inspect-track',
      title: '检查歌曲',
      description: '读取歌曲摘要',
      pluginName: 'Community Tools',
      localOnly: true,
      ready: true,
      run,
    }]);

    render(<TrackContextMenu track={track} position={{ x: 20, y: 24 }} onAction={onAction} onClose={onClose} />);

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Community Tools · 检查歌曲' }));
    expect(run).toHaveBeenCalledWith(track);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('waits for the extra action setting before showing the menu on a cold settings cache', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    let resolveSettings!: (value: { trackContextMenuExtraActionsEnabled: boolean }) => void;
    const settingsResult = new Promise<Parameters<typeof resolveSettings>[0]>((resolve) => {
      resolveSettings = resolve;
    });
    Object.defineProperty(window, 'echo', {
      configurable: true,
      value: {
        app: {
          getSettings: vi.fn(() => settingsResult),
        },
      },
    });

    render(<TrackContextMenu track={track} position={{ x: 20, y: 24 }} onAction={onAction} onClose={onClose} />);

    expect(screen.queryByRole('menuitem', { name: 'trackMenu.action.playNext' })).toBeNull();

    resolveSettings({ trackContextMenuExtraActionsEnabled: true });

    expect(await screen.findByRole('menuitem', { name: 'trackMenu.action.playNext' })).toBeTruthy();
    expect(await screen.findByRole('menuitem', { name: 'trackMenu.action.openOsuTiming' })).toBeTruthy();
  });
});
