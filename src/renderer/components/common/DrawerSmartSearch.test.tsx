// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawerSmartSearch } from './DrawerSmartSearch';

const SearchFixture = (): JSX.Element => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isBufferOpen, setIsBufferOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);

  return (
    <div className="audio-drawer">
      <div ref={rootRef}>
        <DrawerSmartSearch
          rootRef={rootRef}
          showResultList
          label="Search sidebar content"
          placeholder="Search this sidebar"
          clearLabel="Clear search"
          enabledValueLabel="Enabled"
          disabledValueLabel="Disabled"
          noResultsLabel="No matches"
          resultCountLabel={(count) => `${count} found`}
          resultLabel={(result) => `Jump to ${result}`}
          nextLabel="Next match"
          previousLabel="Previous match"
          shortcutHint="Ctrl+F to focus, Enter to jump"
        />
        <section className="audio-drawer-section" data-testid="output-section">
          <h3>Output</h3>
          <label className="audio-toggle-row" data-testid="automatic-output">
            <span><strong>Automatic output</strong></span>
            <input type="checkbox" defaultChecked />
          </label>
          <p>Choose the best available device automatically</p>
          <div className="audio-advanced-group" data-testid="buffer-group">
            <button type="button" aria-expanded={isBufferOpen} onClick={() => setIsBufferOpen(true)}>
              <strong>Buffer and latency</strong>
            </button>
            <span>Stable playback</span>
          </div>
        </section>
        <section className="audio-drawer-section" data-testid="device-section">
          <h3>Devices</h3>
          <span>Choose an audio interface</span>
        </section>
        <section className="lyrics-visual-group" data-testid="typography-group">
          <button type="button" aria-expanded={isTypographyOpen} onClick={() => setIsTypographyOpen(true)}>
            <span className="lyrics-visual-group__heading"><strong>Typography</strong></span>
          </button>
          <label className="lyrics-drawer-range" data-testid="font-size-setting">
            <span><strong>Font size</strong><em>32px</em></span>
            <input type="range" value="32" readOnly />
          </label>
        </section>
        <label className="audio-toggle-row" data-testid="text-style-setting">
          <span><strong>文字与样式</strong></span>
          <input type="checkbox" defaultChecked />
        </label>
        <label className="audio-toggle-row" data-testid="wo-setting">
          <span><strong>我的歌词页</strong></span>
          <input type="checkbox" />
        </label>
      </div>
    </div>
  );
};

describe('DrawerSmartSearch', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps matching nested controls and their parent context visible', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'buffer' } });

    await waitFor(() => expect(screen.getByTestId('buffer-group').dataset.drawerSearchMatch).toBe('true'));
    expect(screen.getByTestId('output-section').dataset.drawerSearchHidden).toBe('false');
    expect(screen.getByTestId('output-section').dataset.drawerSearchContext).toBe('true');
    expect(screen.getByTestId('device-section').dataset.drawerSearchHidden).toBe('true');
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Jump to Buffer and latency / Output' })).toBeTruthy();
  });

  it('focuses through Ctrl+F and expands the first match with Enter', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<SearchFixture />);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    const input = screen.getByPlaceholderText('Search this sidebar');
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'latency' } });
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeTruthy());
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('button', { name: 'Buffer and latency' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('buffer-group').dataset.drawerSearchActive).toBe('true');
  });

  it('jumps to a visible result when it is clicked', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'buffer' } });
    const result = await screen.findByRole('option', { name: 'Jump to Buffer and latency / Output' });
    fireEvent.click(result);

    expect(result.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Buffer and latency' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('buffer-group').dataset.drawerSearchActive).toBe('true');
  });

  it('shows the exact setting, description, current value, and path', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'automatic output' } });
    const result = await screen.findByRole('option', {
      name: 'Jump to Automatic output / Choose the best available device automatically / Enabled / Output',
    });

    expect(result.textContent).toContain('Automatic output');
    expect(result.textContent).toContain('Choose the best available device automatically');
    expect(result.textContent).toContain('Enabled');
    expect(result.textContent).toContain('Output');
  });

  it('finds a detailed control inside a collapsed group and expands it on jump', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'font size' } });
    const result = await screen.findByRole('option', { name: 'Jump to Font size / 32px / Typography' });
    fireEvent.click(result);

    expect(screen.getByTestId('font-size-setting').dataset.drawerSearchActive).toBe('true');
    expect(screen.getByRole('button', { name: 'Typography' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('does not treat a single han character as a pinyin-initial wildcard', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: '我' } });

    await waitFor(() => expect(screen.getByTestId('wo-setting').dataset.drawerSearchMatch).toBe('true'));
    expect(screen.getByTestId('text-style-setting').dataset.drawerSearchHidden).toBe('true');
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });

  it('still finds chinese titles by the typed characters', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: '文字' } });

    await waitFor(() => expect(screen.getByTestId('text-style-setting').dataset.drawerSearchMatch).toBe('true'));
    expect(screen.getByTestId('wo-setting').dataset.drawerSearchHidden).toBe('true');
  });

  it('finds chinese titles by pinyin without matching unrelated aliases', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'wenzi' } });

    await waitFor(() => expect(screen.getByTestId('text-style-setting').dataset.drawerSearchMatch).toBe('true'));
    expect(screen.getByTestId('wo-setting').dataset.drawerSearchHidden).toBe('true');
  });

  it('counts the actual setting instead of its parent section', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: 'output' } });

    await waitFor(() => expect(screen.getByTestId('automatic-output').dataset.drawerSearchMatch).toBe('true'));
    expect(screen.getByTestId('output-section').dataset.drawerSearchContext).toBe('true');
    expect(screen.getByTestId('output-section').dataset.drawerSearchMatch).toBeUndefined();
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Jump to Automatic output/ })).toBeTruthy();
  });

  it('does not treat stuttering as a buffer alias', async () => {
    render(<SearchFixture />);

    fireEvent.change(screen.getByPlaceholderText('Search this sidebar'), { target: { value: '卡顿' } });

    await waitFor(() => expect(screen.getByText('No matches')).toBeTruthy());
    expect(screen.getByTestId('buffer-group').dataset.drawerSearchHidden).toBe('true');
  });

  it('focuses the matched control with Enter', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<SearchFixture />);

    const input = screen.getByPlaceholderText('Search this sidebar');
    fireEvent.change(input, { target: { value: 'automatic output' } });
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeTruthy());
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(document.activeElement).toBe(screen.getByTestId('automatic-output').querySelector('input'));
  });
});
