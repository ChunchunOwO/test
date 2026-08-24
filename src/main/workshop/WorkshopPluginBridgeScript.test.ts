import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { workshopPluginBridgeScript } from './WorkshopPluginBridgeScript';

describe('WorkshopPluginBridgeScript', () => {
  it('dispatches agent invocations independently from command invocations', async () => {
    const listeners: {
      message?: (event: { source: unknown; data: Record<string, unknown> }) => Promise<void>;
    } = {};
    const parent = { postMessage: vi.fn() };
    const window = {
      addEventListener: vi.fn((name: string, listener: typeof listeners.message) => {
        if (name === 'message' && listener) listeners.message = listener;
      }),
    };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      agents: { register: (id: string, metadata: unknown, handler: (input: unknown) => unknown) => void };
    };
    echo.agents.register('helper', { title: 'Helper' }, (input) => ({ input, ok: true }));

    expect(listeners.message).toBeTypeOf('function');
    await listeners.message?.({
      source: parent,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'invoke-agent',
        invocationId: 'agent-1',
        agentId: 'helper',
        input: 'hello',
      },
    });

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-result',
      invocationId: 'agent-1',
      ok: true,
      value: { input: 'hello', ok: true },
    }), '*');
    expect(parent.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'command-result' }), '*');
  });

  it('exposes settings requests without leaking a host object', async () => {
    const parent = { postMessage: vi.fn() };
    const window = { addEventListener: vi.fn() };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      settings: {
        get: (settingId?: string) => Promise<unknown>;
        set: (settingId: string, value: unknown) => Promise<unknown>;
      };
    };
    void echo.settings.get('summary-style');
    void echo.settings.set('show-notifications', false);

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request', action: 'settings:get', payload: { settingId: 'summary-style' },
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request', action: 'settings:set', payload: { settingId: 'show-notifications', value: false },
    }), '*');
  });

  it('routes declared-host network calls through the host request bridge', async () => {
    const parent = { postMessage: vi.fn() };
    const window = { addEventListener: vi.fn() };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      network: {
        get: (url: string, options?: unknown) => Promise<unknown>;
        post: (url: string, body: string, options?: unknown) => Promise<unknown>;
      };
    };
    void echo.network.get('https://api.example/catalog', { headers: { accept: 'application/json' } });
    void echo.network.post('https://agent.example/run', '{"prompt":"hello"}', {
      headers: { 'content-type': 'application/json' },
    });

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request',
      action: 'network:request',
      payload: {
        url: 'https://api.example/catalog',
        method: 'GET',
        headers: { accept: 'application/json' },
      },
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'request',
      action: 'network:request',
      payload: {
        url: 'https://agent.example/run',
        method: 'POST',
        body: '{"prompt":"hello"}',
        headers: { 'content-type': 'application/json' },
      },
    }), '*');
    expect(context).not.toHaveProperty('fetch');
  });

  it('registers and invokes an author lyrics provider', async () => {
    const listeners: {
      message?: (event: { source: unknown; data: Record<string, unknown> }) => Promise<void>;
    } = {};
    const parent = { postMessage: vi.fn() };
    const window = {
      addEventListener: vi.fn((name: string, listener: typeof listeners.message) => {
        if (name === 'message' && listener) listeners.message = listener;
      }),
    };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      lyrics: { registerProvider: (id: string, metadata: unknown, handler: (request: unknown) => unknown) => void };
    };
    echo.lyrics.registerProvider('community', { title: 'Community' }, (request) => ({
      candidates: [{ title: 'Song', lrc: '[00:00.00]Hello', request }],
    }));

    await listeners.message?.({
      source: parent,
      data: {
        channel: 'echo:workshop-plugin',
        version: 1,
        type: 'invoke-lyrics-provider',
        invocationId: 'lyrics-1',
        providerId: 'community',
        request: { track: { title: 'Song' } },
      },
    });

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'register-lyrics-provider', providerId: 'community',
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'lyrics-provider-result', invocationId: 'lyrics-1', ok: true,
    }), '*');
  });

  it('registers source search and resolve handlers without exposing network access', async () => {
    const listeners: {
      message?: (event: { source: unknown; data: Record<string, unknown> }) => Promise<void>;
    } = {};
    const parent = { postMessage: vi.fn() };
    const window = {
      addEventListener: vi.fn((name: string, listener: typeof listeners.message) => {
        if (name === 'message' && listener) listeners.message = listener;
      }),
    };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      sources: {
        registerProvider: (id: string, metadata: unknown, handlers: {
          search: (request: unknown) => unknown;
          resolve: (request: { providerTrackId: string }) => unknown;
        }) => void;
      };
    };
    echo.sources.registerProvider('radio', { title: 'Radio' }, {
      search: (request) => ({ tracks: [{ providerTrackId: 'live', title: 'Live', request }] }),
      resolve: ({ providerTrackId }) => ({ url: `https://radio.example/${providerTrackId}.mp3`, live: true }),
    });

    await listeners.message?.({
      source: parent,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'invoke-source-provider',
        invocationId: 'source-search-1', providerId: 'radio', operation: 'search', request: { query: 'live' },
      },
    });
    await listeners.message?.({
      source: parent,
      data: {
        channel: 'echo:workshop-plugin', version: 1, type: 'invoke-source-provider',
        invocationId: 'source-resolve-1', providerId: 'radio', operation: 'resolve', request: { providerTrackId: 'live' },
      },
    });

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'register-source-provider', providerId: 'radio',
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'source-provider-result', invocationId: 'source-search-1', ok: true,
    }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'source-provider-result', invocationId: 'source-resolve-1', ok: true,
      value: { url: 'https://radio.example/live.mp3', live: true },
    }), '*');
    expect(context).not.toHaveProperty('fetch');
  });

  it('registers and invokes metadata and cover providers', async () => {
    const listeners: {
      message?: (event: { source: unknown; data: Record<string, unknown> }) => Promise<void>;
    } = {};
    const parent = { postMessage: vi.fn() };
    const window = {
      addEventListener: vi.fn((name: string, listener: typeof listeners.message) => {
        if (name === 'message' && listener) listeners.message = listener;
      }),
    };
    const context = { window, parent } as Record<string, unknown>;

    runInNewContext(workshopPluginBridgeScript, context);
    const echo = context.echo as {
      metadata: { registerProvider: (id: string, metadata: unknown, handler: (request: unknown) => unknown) => void };
      covers: { registerProvider: (id: string, metadata: unknown, handler: (request: unknown) => unknown) => void };
    };
    echo.metadata.registerProvider('tags', { title: 'Tags' }, () => ({ candidates: [{ title: 'Song' }] }));
    echo.covers.registerProvider('covers', { title: 'Covers' }, () => ({ candidates: [{ imageUrl: 'https://images.example/cover.jpg' }] }));

    await listeners.message?.({
      source: parent,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'invoke-metadata-provider', invocationId: 'metadata-1', providerId: 'tags', request: {} },
    });
    await listeners.message?.({
      source: parent,
      data: { channel: 'echo:workshop-plugin', version: 1, type: 'invoke-cover-provider', invocationId: 'cover-1', providerId: 'covers', request: {} },
    });

    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'register-metadata-provider', providerId: 'tags' }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'register-cover-provider', providerId: 'covers' }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'metadata-provider-result', invocationId: 'metadata-1', ok: true }), '*');
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'cover-provider-result', invocationId: 'cover-1', ok: true }), '*');
  });
});
