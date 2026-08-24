export const workshopPluginBridgeScript = String.raw`(() => {
  'use strict';
  const channel = 'echo:workshop-plugin';
  const version = 1;
    const pending = new Map();
    const commandHandlers = new Map();
    const agentHandlers = new Map();
    const sourceProviderHandlers = new Map();
    const lyricsProviderHandlers = new Map();
    const metadataProviderHandlers = new Map();
    const coverProviderHandlers = new Map();
    const eventHandlers = new Map();
  let sequence = 0;

  const request = (action, payload) => new Promise((resolve, reject) => {
    const requestId = String(Date.now()) + '-' + String(++sequence);
    pending.set(requestId, { resolve, reject });
    parent.postMessage({ channel, version, type: 'request', requestId, action, payload }, '*');
  });

  const on = (eventName, handler) => {
    if (typeof eventName !== 'string' || typeof handler !== 'function') return () => undefined;
    const handlers = eventHandlers.get(eventName) || new Set();
    handlers.add(handler);
    eventHandlers.set(eventName, handlers);
    return () => handlers.delete(handler);
  };

  const emit = async (eventName, payload) => {
    for (const handler of eventHandlers.get(eventName) || []) {
      try { await handler(payload); } catch { /* plugin callback isolation */ }
    }
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== parent || !event.data || event.data.channel !== channel || event.data.version !== version) return;
    const message = event.data;
    if (message.type === 'response') {
      const operation = pending.get(message.requestId);
      if (!operation) return;
      pending.delete(message.requestId);
      if (message.ok) operation.resolve(message.value);
      else operation.reject(new Error(message.error || 'plugin-host-error'));
      return;
    }
    if (message.type === 'event') {
      await emit(message.eventName, message.payload);
      return;
    }
    if (message.type === 'invoke-command') {
      const handler = commandHandlers.get(message.commandId);
      if (!handler) {
        parent.postMessage({ channel, version, type: 'command-result', invocationId: message.invocationId, ok: false, error: 'command-not-registered' }, '*');
        return;
      }
      try {
        const value = await handler(...(Array.isArray(message.args) ? message.args : []));
        parent.postMessage({ channel, version, type: 'command-result', invocationId: message.invocationId, ok: true, value }, '*');
      } catch (error) {
        parent.postMessage({ channel, version, type: 'command-result', invocationId: message.invocationId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : 'command-failed' }, '*');
      }
      return;
    }
    if (message.type === 'invoke-agent') {
        const handler = agentHandlers.get(message.agentId);
        if (!handler) {
          parent.postMessage({ channel, version, type: 'agent-result', invocationId: message.invocationId, ok: false, error: 'agent-not-registered' }, '*');
          return;
        }
        try {
          const value = await handler(message.input, Object.freeze({ agentId: message.agentId }));
          parent.postMessage({ channel, version, type: 'agent-result', invocationId: message.invocationId, ok: true, value }, '*');
        } catch (error) {
          parent.postMessage({ channel, version, type: 'agent-result', invocationId: message.invocationId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : 'agent-failed' }, '*');
        }
        return;
    }
    if (message.type === 'invoke-source-provider') {
      const handlers = sourceProviderHandlers.get(message.providerId);
      const handler = handlers && handlers[message.operation];
      if (typeof handler !== 'function') {
        parent.postMessage({ channel, version, type: 'source-provider-result', invocationId: message.invocationId, ok: false, error: 'source-provider-not-registered' }, '*');
        return;
      }
      try {
        const value = await handler(message.request, Object.freeze({ providerId: message.providerId, operation: message.operation }));
        parent.postMessage({ channel, version, type: 'source-provider-result', invocationId: message.invocationId, ok: true, value }, '*');
      } catch (error) {
        parent.postMessage({ channel, version, type: 'source-provider-result', invocationId: message.invocationId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : 'source-provider-failed' }, '*');
      }
      return;
    }
    if (message.type === 'invoke-lyrics-provider') {
      const handler = lyricsProviderHandlers.get(message.providerId);
      if (!handler) {
        parent.postMessage({ channel, version, type: 'lyrics-provider-result', invocationId: message.invocationId, ok: false, error: 'lyrics-provider-not-registered' }, '*');
        return;
      }
      try {
        const value = await handler(message.request, Object.freeze({ providerId: message.providerId }));
        parent.postMessage({ channel, version, type: 'lyrics-provider-result', invocationId: message.invocationId, ok: true, value }, '*');
      } catch (error) {
        parent.postMessage({ channel, version, type: 'lyrics-provider-result', invocationId: message.invocationId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : 'lyrics-provider-failed' }, '*');
      }
      return;
    }
    if (message.type === 'invoke-metadata-provider' || message.type === 'invoke-cover-provider') {
      const isMetadata = message.type === 'invoke-metadata-provider';
      const handler = (isMetadata ? metadataProviderHandlers : coverProviderHandlers).get(message.providerId);
      const resultType = isMetadata ? 'metadata-provider-result' : 'cover-provider-result';
      if (!handler) {
        parent.postMessage({ channel, version, type: resultType, invocationId: message.invocationId, ok: false, error: isMetadata ? 'metadata-provider-not-registered' : 'cover-provider-not-registered' }, '*');
        return;
      }
      try {
        const value = await handler(message.request, Object.freeze({ providerId: message.providerId }));
        parent.postMessage({ channel, version, type: resultType, invocationId: message.invocationId, ok: true, value }, '*');
      } catch (error) {
        parent.postMessage({ channel, version, type: resultType, invocationId: message.invocationId, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : (isMetadata ? 'metadata-provider-failed' : 'cover-provider-failed') }, '*');
      }
      return;
    }
  });

  const echo = Object.freeze({
    commands: Object.freeze({
      register(id, metadata, handler) {
        if (typeof id !== 'string' || typeof handler !== 'function') throw new Error('invalid-command-registration');
        commandHandlers.set(id, handler);
        parent.postMessage({ channel, version, type: 'register-command', commandId: id, title: metadata && metadata.title }, '*');
      },
    }),
    events: Object.freeze({ on }),
    navigation: Object.freeze({ open: (routeId) => request('navigation:open', { routeId }) }),
      playback: Object.freeze({
        getStatus: () => request('playback:getStatus'),
        play: () => request('playback:play'),
        pause: () => request('playback:pause'),
        seek: (positionSeconds) => request('playback:seek', { positionSeconds }),
        getShareInfo: () => request('playback:getShareInfo'),
        shareCurrentTrack: (options) => request('playback:shareCurrentTrack', options),
        getShareTask: (taskId) => request('playback:getShareTask', { taskId }),
        playUrl: (url, metadata) => request('playback:playUrl', typeof url === 'string' ? { ...(metadata || {}), url } : url),
      }),
    audio: Object.freeze({ getSpectrum: () => request('audio:getSpectrum') }),
    library: Object.freeze({
      getSummary: () => request('library:getSummary'),
      getTracks: (query) => request('library:getTracks', query || {}),
      getAlbums: (query) => request('library:getAlbums', query || {}),
      getAlbumTracks: (id, query) => request('library:getAlbumTracks', { ...(query || {}), id }),
      getArtists: (query) => request('library:getArtists', query || {}),
      getArtistTracks: (id, query) => request('library:getArtistTracks', { ...(query || {}), id }),
      getArtistAlbums: (id, query) => request('library:getArtistAlbums', { ...(query || {}), id }),
      getGenres: (query) => request('library:getGenres', query || {}),
      getGenreTracks: (id, query) => request('library:getGenreTracks', { ...(query || {}), id }),
      getGenreAlbums: (id, query) => request('library:getGenreAlbums', { ...(query || {}), id }),
      getPlaylists: () => request('library:getPlaylists'),
      getPlaylistItems: (id, query) => request('library:getPlaylistItems', { ...(query || {}), id }),
      getLikedTracks: (query) => request('library:getLikedTracks', query || {}),
      getLikedTrackIds: (trackIds) => request('library:getLikedTrackIds', { trackIds }),
      toggleTrackLiked: (trackId) => request('library:toggleTrackLiked', { trackId }),
      toggleAlbumLiked: (albumId) => request('library:toggleAlbumLiked', { albumId }),
      createPlaylist: (input) => request('library:createPlaylist', input || {}),
      addTracksToPlaylist: (playlistId, trackIds) => request('library:addTracksToPlaylist', { playlistId, trackIds }),
    }),
      queue: Object.freeze({
      get: () => request('queue:get'),
      playTrack: (trackId, queueTrackIds) => request('queue:playTrack', { trackId, queueTrackIds }),
      enqueueTrack: (trackId) => request('queue:enqueueTrack', { trackId }),
      playItem: (queueId) => request('queue:playItem', { queueId }),
      removeItem: (queueId) => request('queue:removeItem', { queueId }),
        clear: () => request('queue:clear'),
      }),
      sources: Object.freeze({
        playDirect: (source) => request('sources:playDirect', source),
        registerProvider: (id, metadata, handlers) => {
          if (typeof id !== 'string' || !handlers || typeof handlers.search !== 'function' || typeof handlers.resolve !== 'function') {
            throw new TypeError('invalid-source-provider');
          }
          sourceProviderHandlers.set(id, Object.freeze({ search: handlers.search, resolve: handlers.resolve }));
          parent.postMessage({ channel, version, type: 'register-source-provider', providerId: id, title: metadata && metadata.title }, '*');
        },
        search: (providerId, query) => request('source-provider:search', { providerId, ...(query || {}) }),
        resolve: (providerId, providerTrackId) => request('source-provider:resolve', { providerId, providerTrackId }),
      }),
      agents: Object.freeze({
        register: (id, metadata, handler) => {
          if (typeof id !== 'string' || typeof handler !== 'function') throw new TypeError('invalid-agent');
          agentHandlers.set(id, handler);
          parent.postMessage({ channel, version, type: 'register-agent', agentId: id, title: metadata && metadata.title }, '*');
        },
        run: (agentId, input) => request('agent:run', { agentId, input }),
      }),
      network: Object.freeze({
        request: (options) => request('network:request', options || {}),
        get: (url, options) => request('network:request', { ...(options || {}), url, method: 'GET' }),
        post: (url, body, options) => request('network:request', { ...(options || {}), url, body, method: 'POST' }),
      }),
      lyrics: Object.freeze({
        registerProvider: (id, metadata, handler) => {
          if (typeof id !== 'string' || typeof handler !== 'function') throw new TypeError('invalid-lyrics-provider');
          lyricsProviderHandlers.set(id, handler);
          parent.postMessage({ channel, version, type: 'register-lyrics-provider', providerId: id, title: metadata && metadata.title }, '*');
        },
      }),
      metadata: Object.freeze({
        registerProvider: (id, metadata, handler) => {
          if (typeof id !== 'string' || typeof handler !== 'function') throw new TypeError('invalid-metadata-provider');
          metadataProviderHandlers.set(id, handler);
          parent.postMessage({ channel, version, type: 'register-metadata-provider', providerId: id, title: metadata && metadata.title }, '*');
        },
      }),
      covers: Object.freeze({
        registerProvider: (id, metadata, handler) => {
          if (typeof id !== 'string' || typeof handler !== 'function') throw new TypeError('invalid-cover-provider');
          coverProviderHandlers.set(id, handler);
          parent.postMessage({ channel, version, type: 'register-cover-provider', providerId: id, title: metadata && metadata.title }, '*');
        },
      }),
      settings: Object.freeze({
        get: (settingId) => request('settings:get', settingId === undefined ? {} : { settingId }),
        set: (settingId, value) => request('settings:set', { settingId, value }),
        onChanged: (handler) => on('settings:changed', handler),
      }),
      storage: Object.freeze({
      get: (key) => request('storage:get', { key }),
      set: (key, value) => request('storage:set', { key, value }),
      remove: (key) => request('storage:remove', { key }),
    }),
    ui: Object.freeze({ notify: (message) => request('ui:notify', { message }) }),
  });

  Object.defineProperty(globalThis, 'echo', { value: echo, configurable: false, writable: false });
  parent.postMessage({ channel, version, type: 'ready' }, '*');
})();`;
