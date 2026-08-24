import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerCoverProtocolHandler: vi.fn(),
}));

vi.mock('../protocol/coverProtocol', () => ({
  registerCoverProtocolHandler: mocks.registerCoverProtocolHandler,
}));

describe('auxiliary renderer session protocols', () => {
  beforeEach(() => {
    mocks.registerCoverProtocolHandler.mockClear();
    vi.resetModules();
  });

  it('registers cover and wallpaper handlers once for each isolated session', async () => {
    const { ensureAuxiliaryRendererSessionProtocols } = await import('./auxiliaryRendererSession');
    const firstSession = { protocol: { handle: vi.fn() } } as unknown as Electron.Session;
    const secondSession = { protocol: { handle: vi.fn() } } as unknown as Electron.Session;

    ensureAuxiliaryRendererSessionProtocols(firstSession);
    ensureAuxiliaryRendererSessionProtocols(firstSession);
    ensureAuxiliaryRendererSessionProtocols(secondSession);

    expect(mocks.registerCoverProtocolHandler).toHaveBeenCalledTimes(2);
    expect(mocks.registerCoverProtocolHandler).toHaveBeenNthCalledWith(1, firstSession.protocol);
    expect(mocks.registerCoverProtocolHandler).toHaveBeenNthCalledWith(2, secondSession.protocol);
  });
});
