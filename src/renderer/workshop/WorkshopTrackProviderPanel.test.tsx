// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrack } from '../../shared/types/library';
import { WorkshopTrackProviderPanel } from './WorkshopTrackProviderPanel';
import { clearWorkshopTrackProvidersForTests, publishWorkshopTrackProviders } from './WorkshopTrackProviderRegistry';

const track: LibraryTrack = {
  id: 'track-1',
  path: 'D:\\Music\\song.flac',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  trackNo: 1,
  discNo: 1,
  year: 2026,
  genre: null,
  duration: 180,
  codec: 'flac',
  sampleRate: 48_000,
  bitDepth: 24,
  bitrate: 1_000_000,
  coverId: null,
  coverThumb: null,
  fieldSources: {},
};

afterEach(() => {
  cleanup();
  clearWorkshopTrackProvidersForTests();
});

describe('WorkshopTrackProviderPanel', () => {
  it('searches ready Workshop providers and applies selected metadata and covers', async () => {
    publishWorkshopTrackProviders({
      metadataProviders: [{
        key: 'metadata', pluginName: 'Community Tools', providerId: 'tags', title: 'Tags', description: null, ready: true,
        lookup: vi.fn(async () => [{ title: 'Better Song', artist: 'Better Artist', year: 2025 }]),
      }],
      coverProviders: [{
        key: 'covers', pluginName: 'Community Tools', providerId: 'covers', title: 'Covers', description: null, ready: true,
        lookup: vi.fn(async () => [{ imageUrl: 'https://images.example/cover.jpg', title: 'Blue Cover' }]),
      }],
    });
    const onApplyMetadata = vi.fn();
    const onApplyCover = vi.fn();
    const { getByRole, getByText } = render(
      <WorkshopTrackProviderPanel
        track={track}
        disabled={false}
        onApplyMetadata={onApplyMetadata}
        onApplyCover={onApplyCover}
      />,
    );

    fireEvent.click(getByRole('button', { name: '查找标签' }));
    await waitFor(() => expect(getByText('Better Song')).toBeTruthy());
    fireEvent.click(getByRole('button', { name: '应用' }));
    expect(onApplyMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'Better Song', year: 2025 }));

    fireEvent.click(getByRole('button', { name: '查找封面' }));
    fireEvent.click(await waitFor(() => getByRole('button', { name: '选择封面 Blue Cover' })));
    expect(onApplyCover).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://images.example/cover.jpg' }));
  });
});
