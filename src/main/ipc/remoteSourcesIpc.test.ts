import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../shared/constants/ipcChannels';

const handlers: Record<string, (...args: unknown[]) => unknown> = {};
const trustedRendererUrl = 'file:///C:/Program%20Files/ECHO/resources/app.asar/out/renderer/index.html';
const trustedFrame = { url: trustedRendererUrl };
const trustedSender = { mainFrame: trustedFrame };
const untrustedSender = {};
const trustedEvent = { sender: trustedSender, senderFrame: trustedFrame };
const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  handlers[channel] = handler;
});
const openExternalMock = vi.fn(async () => undefined);
const showOpenDialogMock = vi.fn(async () => ({ canceled: false, filePaths: ['Z:\\Music'] }));
const listSourcesMock = vi.fn<() => unknown[]>(() => []);
const createSourceMock = vi.fn(() => ({ id: 'remote-1' }));
const updateSourceMock = vi.fn<(input?: unknown) => Record<string, unknown>>(() => ({ id: 'remote-1' }));
const testSourceMock = vi.fn(async () => ({ ok: true }));
const startBackgroundJobsMock = vi.fn(async () => ({ queued: 0 }));
const listIssuesMock = vi.fn(() => []);
const authorizeZConnectMock = vi.fn(async () => ({
  ok: true,
  baseUrl: 'https://remote-access-32769.zconnect.cn/',
  message: 'authorized',
}));
let accountStatus = { loggedIn: false, pro: false, status: 'anonymous', checkedAt: null as string | null };
let plugins: unknown[] = [];

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  ipcMain: {
    handle: handleMock,
  },
  shell: {
    openExternal: openExternalMock,
  },
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
}));

vi.mock('../library/remote/ZConnectWebAuthorizationService', () => ({
  isZConnectRemoteAccessUrl: (value: string) => /^https:\/\/remote-access-\d+\.zconnect\.cn\/?$/u.test(value),
  startZConnectWebAuthorization: authorizeZConnectMock,
}));

vi.mock('../library/remote/RemoteSourceService', () => ({
  getRemoteSourceService: () => ({
    listSources: listSourcesMock,
    createSource: createSourceMock,
    updateSource: updateSourceMock,
    testSource: testSourceMock,
    startBackgroundJobs: startBackgroundJobsMock,
    listIssues: listIssuesMock,
  }),
}));

vi.mock('../app/windowManager', () => ({
  getMainWindow: () => ({
    isDestroyed: () => false,
    webContents: trustedSender,
  }),
  getTrustedMainWindowUrl: () => trustedRendererUrl,
}));

vi.mock('../plugins/EchoProAccountService', () => ({
  getEchoProAccountService: () => ({ getStatus: () => accountStatus }),
}));

vi.mock('../plugins/PluginService', () => ({
  getPluginService: () => ({ list: () => ({ plugins }) }),
}));

const resetHandlers = (): void => {
  for (const key of Object.keys(handlers)) {
    delete handlers[key];
  }
};

describe('remote sources IPC', () => {
  beforeEach(async () => {
    resetHandlers();
    handleMock.mockClear();
    openExternalMock.mockClear();
    showOpenDialogMock.mockClear();
    listSourcesMock.mockReset();
    listSourcesMock.mockReturnValue([]);
    createSourceMock.mockReset();
    createSourceMock.mockReturnValue({ id: 'remote-1' });
    updateSourceMock.mockReset();
    updateSourceMock.mockReturnValue({ id: 'remote-1' });
    testSourceMock.mockReset();
    testSourceMock.mockResolvedValue({ ok: true });
    startBackgroundJobsMock.mockReset();
    startBackgroundJobsMock.mockResolvedValue({ queued: 0 });
    listIssuesMock.mockReset();
    listIssuesMock.mockReturnValue([]);
    authorizeZConnectMock.mockClear();
    accountStatus = { loggedIn: false, pro: false, status: 'anonymous', checkedAt: null };
    plugins = [];
    trustedFrame.url = trustedRendererUrl;
    vi.resetModules();
    const module = await import('./remoteSourcesIpc');
    module.registerRemoteSourcesIpc();
    await Promise.resolve();
  });

  it('routes remote source actions without a legacy Pro entitlement gate', async () => {
    await expect(handlers[IpcChannels.RemoteSourcesList]!(trustedEvent)).resolves.toEqual([]);
    await expect(
      handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
        provider: 'webdav',
        displayName: 'NAS',
        baseUrl: 'https://nas.example',
        authType: 'none',
      }),
    ).resolves.toEqual({ id: 'remote-1' });

    expect(listSourcesMock).toHaveBeenCalledTimes(1);
    expect(createSourceMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'webdav' }));
  });

  it('opens the scoped ZConnect authorization flow from a trusted renderer', async () => {
    await expect(handlers[IpcChannels.RemoteSourcesAuthorizeZConnect]!(
      trustedEvent,
      'https://remote-access-32769.zconnect.cn/app/',
    )).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(authorizeZConnectMock).toHaveBeenCalledWith(
      'https://remote-access-32769.zconnect.cn/app/',
      null,
    );
  });

  it('routes requests without online verification for a locally known Pro account', async () => {
    accountStatus = { loggedIn: true, pro: true, status: 'active', checkedAt: '2026-07-12T00:00:00.000Z' };
    listSourcesMock.mockReturnValue([{ id: 'remote-1', status: 'enabled' }]);

    await expect(handlers[IpcChannels.RemoteSourcesList]!(trustedEvent)).resolves.toEqual([{ id: 'remote-1', status: 'enabled' }]);

    expect(listSourcesMock).toHaveBeenCalledTimes(1);
  });

  it('requires a system-picker grant before creating a mounted source', async () => {
    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'smb',
      displayName: 'NAS',
      baseUrl: 'C:\\Users',
      authType: 'none',
      config: { rootPath: '/' },
    })).rejects.toThrow('system folder picker');

    const providerBoundGrant = await handlers[IpcChannels.RemoteSourcesSelectMountedRoot]!(trustedEvent, 'smb') as { grantId: string; displayName: string };
    expect(providerBoundGrant).toEqual({ grantId: expect.any(String), displayName: 'Music' });
    expect(JSON.stringify(providerBoundGrant)).not.toContain('Z:\\Music');
    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'sshfs',
      displayName: 'Wrong provider',
      baseUrl: null,
      authType: 'none',
      config: { rootPath: '/', mountGrantId: providerBoundGrant.grantId },
    })).rejects.toThrow('system folder picker');

    const grant = await handlers[IpcChannels.RemoteSourcesSelectMountedRoot]!(trustedEvent, 'smb') as { grantId: string; displayName: string };
    await expect(handlers[IpcChannels.RemoteSourcesTest]!(trustedEvent, {
      provider: 'smb',
      displayName: 'NAS',
      baseUrl: null,
      authType: 'none',
      config: { rootPath: '/', mountGrantId: grant.grantId },
    })).resolves.toEqual({ ok: true });
    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'smb',
      displayName: 'NAS',
      baseUrl: null,
      authType: 'none',
      config: { rootPath: '/', mountGrantId: grant.grantId },
    })).resolves.toEqual({ id: 'remote-1' });

    expect(showOpenDialogMock).toHaveBeenCalledTimes(2);
    expect(createSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'smb',
      baseUrl: 'Z:\\Music',
      config: expect.not.objectContaining({ mountGrantId: expect.anything() }),
    }));

    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'smb',
      displayName: 'Reused grant',
      baseUrl: null,
      authType: 'none',
      config: { rootPath: '/', mountGrantId: grant.grantId },
    })).rejects.toThrow('system folder picker');
  });

  it('redacts mounted paths from list results', async () => {
    listSourcesMock.mockReturnValue([{
      id: 'mounted-1',
      provider: 'smb',
      baseUrl: 'Z:\\Music',
      config: { rootPath: '/' },
    }]);

    const result = await handlers[IpcChannels.RemoteSourcesList]!(trustedEvent);
    expect(result).toEqual([expect.objectContaining({ id: 'mounted-1', baseUrl: null })]);
    expect(JSON.stringify(result)).not.toContain('Z:\\Music');
  });

  it('changes mounted roots only through a fresh grant and redacts the result', async () => {
    const current = {
      id: 'mounted-1',
      provider: 'smb',
      baseUrl: 'Y:\\OldMusic',
      authType: 'none',
      config: { rootPath: '/' },
    };
    listSourcesMock.mockReturnValue([current]);
    updateSourceMock.mockReturnValue({ ...current, baseUrl: 'Z:\\Music' });
    const grant = await handlers[IpcChannels.RemoteSourcesSelectMountedRoot]!(trustedEvent, 'smb') as { grantId: string };

    const result = await handlers[IpcChannels.RemoteSourcesUpdate]!(trustedEvent, {
      id: current.id,
      baseUrl: null,
      config: { rootPath: '/', mountGrantId: grant.grantId },
    });
    expect(updateSourceMock).toHaveBeenCalledWith(expect.objectContaining({
      id: current.id,
      baseUrl: 'Z:\\Music',
      config: expect.not.objectContaining({ mountGrantId: expect.anything() }),
    }));
    expect(result).toEqual(expect.objectContaining({ baseUrl: null }));

    await expect(handlers[IpcChannels.RemoteSourcesUpdate]!(trustedEvent, {
      id: current.id,
      baseUrl: 'C:\\Users',
    })).rejects.toThrow('must not be sent by the renderer');
  });

  it('rejects remote-source calls from auxiliary or untrusted renderer windows', async () => {
    await expect(handlers[IpcChannels.RemoteSourcesList]!({ sender: untrustedSender, senderFrame: trustedFrame })).rejects.toThrow('trusted main renderer');
    await expect(handlers[IpcChannels.RemoteSourcesList]!({ sender: trustedSender, senderFrame: { url: trustedRendererUrl } })).rejects.toThrow('trusted main renderer');
    expect(listSourcesMock).not.toHaveBeenCalled();
  });

  it('rejects remote-source calls after the main frame navigates away from the trusted renderer', async () => {
    trustedFrame.url = 'https://attacker.example/';

    await expect(handlers[IpcChannels.RemoteSourcesList]!(trustedEvent)).rejects.toThrow('trusted main renderer');
    expect(listSourcesMock).not.toHaveBeenCalled();
  });

  it('rejects removed MV background-job and issue kinds instead of falling back to another job', async () => {
    await expect(
      handlers[IpcChannels.RemoteSourcesStartBackgroundJobs]!(trustedEvent, 'remote-1', ['mv']),
    ).rejects.toThrow('Unsupported background job kind');
    await expect(
      handlers[IpcChannels.RemoteSourcesListIssues]!(trustedEvent, 'remote-1', 'mv'),
    ).rejects.toThrow('Unsupported remote source issue kind');

    expect(startBackgroundJobsMock).not.toHaveBeenCalled();
    expect(listIssuesMock).not.toHaveBeenCalled();
  });

  it('rejects plaintext credentials in config and credentialed public HTTP endpoints', async () => {
    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'webdav',
      displayName: 'Unsafe config',
      baseUrl: 'https://nas.example',
      authType: 'none',
      config: { password: 'do-not-store-here' },
    })).rejects.toThrow('dedicated secret field');

    await expect(handlers[IpcChannels.RemoteSourcesCreate]!(trustedEvent, {
      provider: 'webdav',
      displayName: 'Plain HTTP',
      baseUrl: 'http://public.example/dav',
      username: 'alice',
      secret: 'password',
      authType: 'basic',
    })).rejects.toThrow('must use HTTPS');
  });
});
