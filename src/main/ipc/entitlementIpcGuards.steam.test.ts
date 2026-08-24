import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requireConnectDonatorFeatureThen,
  requireEchoProFeatureThen,
  requireLocalProFeatureThen,
  requirePrivateFeatureThen,
} from './entitlementIpcGuards';

const requireLocalProMock = vi.hoisted(() => vi.fn());

vi.mock('../plugins/LocalProEntitlements', () => ({
  requireLocalPro: requireLocalProMock,
}));

describe('Steam IPC feature access', () => {
  beforeEach(() => requireLocalProMock.mockReset());

  it.each([
    ['connect', 'connect', (handler: (event: unknown, value: string) => string) => requireConnectDonatorFeatureThen(handler)],
    ['echo-pro', 'echo-pro', (handler: (event: unknown, value: string) => string) => requireEchoProFeatureThen(handler)],
    ['private', 'plugins', (handler: (event: unknown, value: string) => string) => requirePrivateFeatureThen('plugins', handler)],
    ['local', 'dsp', (handler: (event: unknown, value: string) => string) => requireLocalProFeatureThen('dsp', handler)],
  ] as const)('checks the %s DLC entitlement before running the handler', (_name, feature, wrap) => {
    const handler = vi.fn((_event: unknown, value: string) => `ok:${value}`);
    const wrapped = wrap(handler);

    expect(wrapped({} as never, 'steam')).toBe('ok:steam');
    expect(requireLocalProMock).toHaveBeenCalledWith(feature);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
