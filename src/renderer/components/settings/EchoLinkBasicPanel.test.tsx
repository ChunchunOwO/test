// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EchoLinkBasicPanel } from './EchoLinkBasicPanel';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  startPairing: vi.fn(),
  cancelPairing: vi.fn(),
  revokeClient: vi.fn(),
}));

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh-CN' }),
}));

vi.mock('../../utils/echoBridge', () => ({
  getEchoLinkBridge: () => mocks,
}));

const status = {
  enabled: true,
  running: true,
  host: '192.168.1.20',
  port: 26789,
  addresses: ['192.168.1.20'],
  deviceId: 'echo-pc',
  deviceName: 'ECHO PC',
  pairingActive: false,
  clients: [{
    id: 'client-1',
    name: '客厅遥控器',
    platform: 'Android',
    scopes: ['status:read', 'events:read', 'playback:control'],
    createdAt: '2026-07-17T00:00:00.000Z',
    lastSeenAt: null,
  }],
  error: null,
  updatedAt: '2026-07-17T00:00:00.000Z',
} as const;

describe('EchoLinkBasicPanel', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue(status);
    mocks.setEnabled.mockResolvedValue({ ...status, enabled: false, running: false });
    mocks.startPairing.mockResolvedValue({
      id: 'pair-1',
      pairingUri: 'echo://pair?version=2&host=192.168.1.20&port=26789&pairingId=pair-1&secret=secret',
      webRemoteUrl: 'http://192.168.1.20:26789/echo-link/v2/remote#pair=echo%3A%2F%2Fpair',
      qrDataUrl: 'data:image/png;base64,AA',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    mocks.cancelPairing.mockResolvedValue(status);
    mocks.revokeClient.mockResolvedValue({ ...status, clients: [] });
  });

  it('is visible without Pro and manages pairing and individual clients', async () => {
    render(<EchoLinkBasicPanel />);

    expect(await screen.findByText('ECHO Link Basic')).not.toBeNull();
    expect(screen.getByText('免费')).not.toBeNull();
    expect(screen.queryByText(/媒体串流/u)).toBeNull();
    expect(await screen.findByText('客厅遥控器')).not.toBeNull();
    expect(screen.getByText('http://192.168.1.20:26789')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /扫码配对/u }));
    expect(await screen.findByRole('dialog', { name: '配对新设备' })).not.toBeNull();
    expect(mocks.startPairing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /撤销/u }));
    await waitFor(() => expect(mocks.revokeClient).toHaveBeenCalledWith('client-1'));
  });

  it('persists the Basic enable switch through its own bridge', async () => {
    render(<EchoLinkBasicPanel />);
    const toggle = await screen.findByRole('switch', { name: '关闭' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalledWith(false));
  });

  it('pairs through the LAN address selected on a multi-NIC PC', async () => {
    mocks.getStatus.mockResolvedValue({ ...status, addresses: ['192.168.1.20', '10.0.0.5'] });
    render(<EchoLinkBasicPanel />);

    const addressSelect = await screen.findByRole('combobox');
    fireEvent.change(addressSelect, { target: { value: '10.0.0.5' } });
    fireEvent.click(screen.getByRole('button', { name: /扫码配对/u }));

    await waitFor(() => expect(mocks.startPairing).toHaveBeenCalledWith('10.0.0.5'));
  });

  it('keeps keyboard focus inside pairing and restores it after Escape closes the dialog', async () => {
    render(<EchoLinkBasicPanel />);
    const pairingTrigger = await screen.findByRole('button', { name: /扫码配对/u });

    pairingTrigger.focus();
    fireEvent.click(pairingTrigger);

    const dialog = await screen.findByRole('dialog', { name: '配对新设备' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const copyButton = screen.getByRole('button', { name: '复制配对 URI' });
    await waitFor(() => expect(document.activeElement).toBe(copyButton));

    const closeButton = screen.getAllByRole('button', { name: '取消' })[0];
    const cancelButton = screen.getAllByRole('button', { name: '取消' }).at(-1)!;
    cancelButton.focus();
    fireEvent.keyDown(cancelButton, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);

    fireEvent.keyDown(cancelButton, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '配对新设备' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(pairingTrigger));
    expect(mocks.cancelPairing).toHaveBeenCalledTimes(1);
  });
});
