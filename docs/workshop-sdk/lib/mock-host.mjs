import { createServer } from 'node:http';
import vm from 'node:vm';
import { readFile, watch } from 'node:fs/promises';
import { resolve } from 'node:path';

const withTimeout = async (label, task, timeoutMs = 1_500) => Promise.race([
  Promise.resolve().then(task),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)),
]);

const createMockEcho = () => {
  const registrations = {
    commands: new Map(), agents: new Map(), sources: new Map(), lyrics: new Map(),
    metadata: new Map(), covers: new Map(), notifications: [],
  };
  const storage = new Map();
  const echo = {
    commands: { register: (id, definition, handler) => registrations.commands.set(id, { definition, handler }) },
    agents: {
      register: (id, definition, handler) => registrations.agents.set(id, { definition, handler }),
      run: async (id, input) => registrations.agents.get(id)?.handler(input),
    },
    sources: {
      registerProvider: (id, definition, handlers) => registrations.sources.set(id, { definition, handlers }),
      playDirect: async (track) => ({ accepted: true, track }),
    },
    lyrics: { registerProvider: (id, definition, handler) => registrations.lyrics.set(id, { definition, handler }) },
    metadata: { registerProvider: (id, definition, handler) => registrations.metadata.set(id, { definition, handler }) },
    covers: { registerProvider: (id, definition, handler) => registrations.covers.set(id, { definition, handler }) },
    playback: {
      getStatus: async () => ({ state: 'playing', position: 42.5, duration: 221.2 }),
      getShareInfo: async () => ({ available: true, reason: null, track: fixtureTrack, allowedHosts: ['together.example.invalid'] }),
      shareCurrentTrack: async () => ({ id: 'fixture-share-task', state: 'ready', playbackUrl: 'https://fixture.invalid/stream' }),
      getShareTask: async (id) => ({ id, state: 'ready', playbackUrl: 'https://fixture.invalid/stream' }),
      playUrl: async (url, metadata) => ({ accepted: true, url, metadata }),
    },
    audio: { getSpectrum: async () => ({ bands: [0.08, 0.2, 0.46, 0.72], energy: 0.48 }) },
    library: { getSummary: async () => ({ trackCount: 1248, albumCount: 96, artistCount: 143, playlistCount: 7 }) },
    queue: { getSnapshot: async () => ({ items: [], currentIndex: -1 }) },
    settings: { get: async () => ({}) },
    storage: { get: async (key) => storage.get(key), set: async (key, value) => { storage.set(key, value); } },
    network: {
      request: async (options) => ({ url: options.url, status: 200, statusText: 'Fixture', ok: true, headers: {}, body: '{"tracks":[]}' }),
      get: async (url) => ({ url, status: 200, statusText: 'Fixture', ok: true, headers: {}, body: '{"tracks":[]}' }),
      post: async (url) => ({ url, status: 200, statusText: 'Fixture', ok: true, headers: {}, body: '{}' }),
    },
    ui: { notify: async (message) => { registrations.notifications.push(String(message)); } },
  };
  return { echo, registrations };
};

const fixtureTrack = {
  id: 'fixture-track-01', title: 'Neon Harbor', artist: 'ECHO Fixtures', album: 'Local Signals',
  codec: 'FLAC', sampleRate: 96000,
};

export const testPluginPackage = async (packageValue) => {
  const entry = packageValue.files.find((file) => file.path === packageValue.manifest.entry);
  if (!entry) throw new Error('Mock host could not find the plug-in entry file');
  const { echo, registrations } = createMockEcho();
  const logs = [];
  vm.runInNewContext(entry.content, {
    echo,
    console: { log: (...values) => logs.push(values.map(String).join(' ')), warn: (...values) => logs.push(values.map(String).join(' ')) },
    setTimeout,
    clearTimeout,
  }, { filename: entry.path, timeout: 1_000 });

  const checks = [];
  const run = async (kind, id, task) => {
    try {
      await withTimeout(`${kind}:${id}`, task);
      checks.push({ kind, id, ok: true });
    } catch (error) {
      checks.push({ kind, id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  for (const [id, value] of registrations.commands) await run('command', id, () => value.handler(fixtureTrack));
  for (const [id, value] of registrations.agents) await run('agent', id, () => value.handler('summarize the fixture library'));
  for (const [id, value] of registrations.sources) {
    await run('source-search', id, () => value.handlers.search({ query: '', page: 1, pageSize: 20 }));
    if (typeof value.handlers.resolve === 'function') await run('source-resolve', id, () => value.handlers.resolve({ providerTrackId: 'fixture' }));
  }
  for (const [id, value] of registrations.lyrics) await run('lyrics', id, () => value.handler({ track: fixtureTrack, query: fixtureTrack.title }));
  for (const [id, value] of registrations.metadata) await run('metadata', id, () => value.handler({ track: fixtureTrack }));
  for (const [id, value] of registrations.covers) await run('covers', id, () => value.handler({ track: fixtureTrack }));

  return {
    ok: checks.every((check) => check.ok),
    registrations: Object.fromEntries(['commands', 'agents', 'sources', 'lyrics', 'metadata', 'covers'].map((key) => [key, registrations[key].size])),
    checks,
    notifications: registrations.notifications,
    logs,
  };
};

const devHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ECHO Workshop Mock Host</title><style>body{font:15px system-ui;margin:0;background:#0e1420;color:#eaf4ff}main{max-width:900px;margin:40px auto;padding:24px}pre{padding:18px;border:1px solid #31445b;border-radius:14px;background:#151f2d;white-space:pre-wrap}.ok{color:#87efbd}.bad{color:#ff9f9f}</style></head><body><main><h1>ECHO Workshop Mock Host</h1><p id="status">Waiting for the first local test…</p><pre id="report"></pre></main><script>const render=async()=>{const r=await fetch('/report.json',{cache:'no-store'}).then(x=>x.json());status.textContent=r.ok?'Local fixtures passed':'Local fixtures need attention';status.className=r.ok?'ok':'bad';report.textContent=JSON.stringify(r,null,2)};new EventSource('/events').onmessage=render;render();</script></body></html>`;

export const startMockHost = async ({ root, port, runTests, watchPath }) => {
  let report = await runTests();
  const clients = new Set();
  const server = createServer((request, response) => {
    if (request.url === '/report.json') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(report, null, 2));
      return;
    }
    if (request.url === '/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(devHtml);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const watcher = watch(resolve(root, watchPath));
  void (async () => {
    for await (const _event of watcher) {
      try { report = await runTests(); }
      catch (error) { report = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      for (const client of clients) client.write(`data: reload\n\n`);
    }
  })();
  return { server, watcher, url: `http://127.0.0.1:${port}` };
};
