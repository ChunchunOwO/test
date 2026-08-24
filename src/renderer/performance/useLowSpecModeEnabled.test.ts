// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLowSpecModeEnabled } from './useLowSpecModeEnabled';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'echo');
});

describe('useLowSpecModeEnabled', () => {
  it('starts from the app-shell lightweight-mode attribute', () => {
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    shell.setAttribute('data-low-spec-mode', 'true');
    document.body.append(shell);

    const { result } = renderHook(() => useLowSpecModeEnabled());
    expect(result.current).toBe(true);

    shell.remove();
  });

  it('follows the lightweight mode setting', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lowSpecModeEnabled: true }),
      },
    } as unknown as Window['echo'];

    const { result } = renderHook(() => useLowSpecModeEnabled());

    await waitFor(() => expect(result.current).toBe(true));

    window.dispatchEvent(new CustomEvent('settings:changed', { detail: { lowSpecModeEnabled: false } }));
    await waitFor(() => expect(result.current).toBe(false));
  });
});
