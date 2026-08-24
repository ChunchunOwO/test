import { describe, expect, it, vi } from 'vitest';
import { createMockIpcRenderer } from '../../test-utils/electronMocks';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { createDiagnosticsApi } from './ipcDiagnostics';

describe('createDiagnosticsApi renderer memory reclamation', () => {
  it('releases only WebFrame resources that Electron marks as unused', () => {
    const clearCache = vi.fn();
    const api = createDiagnosticsApi(
      createMockIpcRenderer() as unknown as Electron.IpcRenderer,
      IpcChannels,
      { clearCache },
    );

    expect(api.releaseUnusedRendererMemory?.()).toBe(true);
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op when WebFrame reclamation is unavailable', () => {
    const api = createDiagnosticsApi(
      createMockIpcRenderer() as unknown as Electron.IpcRenderer,
      IpcChannels,
    );

    expect(api.releaseUnusedRendererMemory?.()).toBe(false);
  });
});
