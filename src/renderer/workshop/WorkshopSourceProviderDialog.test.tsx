// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import { WorkshopSourceProviderDialog } from './WorkshopSourceProviderDialog';

const plugin: WorkshopPluginSummary = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.radio',
  version: '1.0.0',
  pluginId: 'echo.radio',
  name: 'Community Radio',
  permissions: ['sources:provide'],
  commands: [],
  panels: [],
  agents: [],
  sourceProviders: [{ id: 'stations', title: 'Stations', description: null }],
  lyricsProviders: [],
  settings: [],
  networkHosts: [],
  runtimeEntryUrl: 'echo-workshop://plugin/steam/123/__runtime__.html',
  enabled: true,
  error: null,
};

afterEach(cleanup);

describe('WorkshopSourceProviderDialog', () => {
  it('requests subsequent pages when the provider reports more results', async () => {
    const onSearch = vi.fn(async (_query: string, page: number) => ({
      tracks: [{
        providerTrackId: `station-${page}`,
        title: `Station ${page}`,
        artist: null,
        album: null,
        durationSeconds: null,
        source: null,
        playable: true,
        unavailableReason: null,
      }],
      total: 2,
      hasMore: page < 2,
    }));
    const { getByRole, getByText } = render(
      <WorkshopSourceProviderDialog
        plugin={plugin}
        provider={plugin.sourceProviders![0]}
        ready
        onClose={vi.fn()}
        onSearch={onSearch}
        onPlay={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(getByRole('textbox', { name: '音源搜索词' }), { target: { value: 'ambient' } });
    fireEvent.click(getByRole('button', { name: '搜索' }));
    await waitFor(() => expect(getByText('Station 1')).toBeTruthy());
    expect(onSearch).toHaveBeenLastCalledWith('ambient', 1);

    fireEvent.click(getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(getByText('Station 2')).toBeTruthy());
    expect(onSearch).toHaveBeenLastCalledWith('ambient', 2);
    expect((getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
