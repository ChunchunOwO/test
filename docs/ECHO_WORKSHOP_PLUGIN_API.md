# ECHO Workshop sandbox plugin API

ECHO Workshop plugins are programmable `.echo` packages that run JavaScript inside an opaque iframe sandbox. They can add commands and panels, navigate inside ECHO, react to playback/library/queue/spectrum events, browse the structured library, build local playlists, orchestrate the playback queue, provide user-selectable lyrics sources, submit user-approved direct audio streams, call explicitly declared remote HTTP(S) services, register author-written Agents, control playback when explicitly approved, and persist a small private state. They do not run in Electron main, preload, Audio Core or the native host.

VST3/VST3i integration uses a separate data-only `audio-plugin-profile` Workshop item. A sandbox plugin may list that item as an outer Workshop dependency, but it never receives the VST binary, a native handle or an arbitrary parameter-execution surface. Real processing remains unavailable until the subscriber has a matching local plugin and a compatible optional `echo.audio-plugin-adapter`, with Audio Core retaining the authoritative state. See [Workshop audio plug-in profile schema](./ECHO_WORKSHOP_AUDIO_PLUGIN_PROFILE.md).

## Create a plugin project

```powershell
npm run workshop:author -- init misc/workshop/community-tools `
  --kind plugin-package `
  --id echo.community-tools `
  --title "Community Tools" `
  --holder "ECHO Community Author"
```

Add a `preview.jpg` under 1 MB, then run:

```powershell
npm run workshop:author -- prepare misc/workshop/community-tools
npm run workshop:author -- validate misc/workshop/community-tools
```

The generated `content/community.echo` is a JSON package with an `echo-plugin-package` manifest and UTF-8 text files. The outer `content/echo.workshop.json` records the exact package size and SHA-256. Do not unpack the `.echo` package beside the Workshop manifest.

## Package manifest

```json
{
  "type": "echo-plugin-package",
  "version": 1,
  "exportedAt": "2026-08-16T00:00:00.000Z",
  "manifest": {
    "id": "echo.community-tools",
    "name": "Community Tools",
    "version": "1.0.0",
    "apiVersion": 2,
    "entry": "plugin.js",
    "permissions": [
      "navigation",
      "playback:read",
      "playback:share",
      "audio:spectrum",
      "library:read",
      "library:control",
      "queue:read",
      "queue:control",
      "sources:provide",
      "sources:direct",
      "network:request",
      "agent:runtime",
      "lyrics:provide",
      "fs:plugin"
    ],
    "contributes": {
      "commands": [{ "id": "library-summary", "title": "显示曲库摘要" }],
      "trackContextMenus": [{
        "id": "inspect-track",
        "title": "检查歌曲",
        "description": "对右键选中的歌曲运行此插件的命令",
        "commandId": "library-summary",
        "localOnly": false
      }],
      "playerBarActions": [{
        "id": "quick-library-summary",
        "title": "曲库摘要",
        "description": "从播放器栏运行插件命令",
        "commandId": "library-summary",
        "icon": "sparkles"
      }],
      "panels": [{ "id": "main", "title": "工具面板", "path": "panel.html", "placement": "utility" }],
      "agents": [{
        "id": "library-helper",
        "title": "曲库助手",
        "description": "作者实现的曲库 Agent",
        "inputPlaceholder": "例如：概括我的曲库"
      }],
      "sourceProviders": [{
        "id": "community-radio",
        "title": "Community Radio",
        "description": "A searchable catalog of direct streams"
      }],
      "lyricsProviders": [{
        "id": "community-lyrics",
        "title": "Community Lyrics",
        "description": "A user-selectable lyrics source"
      }],
      "metadataProviders": [{
        "id": "community-metadata",
        "title": "Community Metadata",
        "description": "Tag candidates for the track editor"
      }],
      "coverProviders": [{
        "id": "community-covers",
        "title": "Community Covers",
        "description": "Cover candidates for the track editor"
      }],
      "themePresets": [{
        "id": "aurora-glass",
        "title": "Aurora Glass",
        "description": "A theme users can import and customize",
        "basePreset": "classic",
        "preview": "linear-gradient(135deg, #08111f 0%, #257f96 100%)",
        "swatches": ["#08111f", "#257f96", "#5cc8dc", "#f0b35b"],
        "light": { "appBg": "#eef8ff", "panel": "#ffffff", "accent": "#257f96", "text": "#234150" },
        "dark": { "appBg": "#08111f", "panel": "#142234", "accent": "#5cc8dc", "text": "#c8dce8" }
      }],
      "settings": [
        {
          "id": "summary-style",
          "title": "摘要风格",
          "type": "select",
          "defaultValue": "brief",
          "options": [
            { "label": "简洁", "value": "brief" },
            { "label": "详细", "value": "detailed" }
          ]
        },
        {
          "id": "show-notifications",
          "title": "显示完成通知",
          "type": "boolean",
          "defaultValue": true
        }
      ]
    }
  },
  "files": [
    { "path": "plugin.js", "content": "..." },
    { "path": "panel.html", "content": "..." },
    { "path": "panel.js", "content": "..." },
    { "path": "panel.css", "content": "..." }
  ]
}
```

Limits:

- package: 2 MB;
- files: 32;
- each text file: 512 KB;
- file types: `.html`, `.css`, `.js`, `.mjs`, `.json`;
- no SVG, binary, native addon, executable, command script or undeclared file;
- the background entry must be a packaged `.js` file;
- panel files must be packaged `.html` files.

## Permissions

| Permission | API | Notes |
| --- | --- | --- |
| `navigation` | `echo.navigation.open(routeId)` | Opens a known ECHO sidebar route or `lyrics`; arbitrary URLs are rejected. |
| `playback:read` | `echo.playback.getStatus()`, `playback:status` event | Returns state, track id, progress, duration and volume; never a file path. |
| `playback:control` | `echo.playback.play()`, `pause()`, `seek(seconds)` | Routes through the existing typed playback control plane. |
| `playback:share` | `getShareInfo()`, `shareCurrentTrack()`, `getShareTask()`, `playUrl()` | Lets an author build listen-together workflows. Local files are uploaded only by the main process, to declared hosts, after a per-upload confirmation. No local path or file handle reaches the plug-in. |
| `audio:spectrum` | `echo.audio.getSpectrum()`, `audio:spectrum` event | Read-only Audio Core visual telemetry, capped at 128 bands and throttled by the host. |
| `library:read` | `echo.library.getSummary()`, structured browse and liked/playlist reads | Results strip local paths, remote source identifiers and provider URLs. Page size is capped at 100. Only local playlists are exposed. |
| `library:control` | liked toggles, `createPlaylist()`, `addTracksToPlaylist()` | Can change favorites and add tracks to local playlists. It cannot edit tags, import files, delete media or operate remote playlists. |
| `queue:read` | `echo.queue.get()`, `queue:changed` event | Returns the host-owned queue with sanitized track snapshots, capped at 500 items. |
| `queue:control` | `playTrack()`, `enqueueTrack()`, `playItem()`, `removeItem()`, `clear()` | Calls the existing renderer queue owner; it does not create a second playback backend. |
| `sources:provide` | `echo.sources.registerProvider()`, `search()`, `resolve()` | Registers a declared searchable source catalog. Search and resolve handlers run in the sandbox; ECHO validates results and owns the search UI, origin confirmation, queue and playback handoff. |
| `sources:direct` | `echo.sources.playDirect({ url, title?, artist?, album?, live? })` | Submits an HTTP(S) direct audio URL to the existing queue and Audio Core pipeline. ECHO asks once per plug-in and origin during the current session. No cookies or custom headers are accepted. |
| `network:request` | `echo.network.request()`, `get()`, `post()` | Calls only hosts declared in the outer Workshop manifest. Requests are host-mediated, size/time/concurrency limited, and never include browser cookies, Steam identity, local paths or automatic credentials. |
| `agent:runtime` | `echo.agents.register()`, `echo.agents.run()` | Registers and invokes author code in the opaque runtime. Agents may compose only the other capabilities approved for that plug-in. |
| `lyrics:provide` | `echo.lyrics.registerProvider()` | Registers a declared source in the host-owned lyrics picker. The handler receives title, artist, album and duration, never a path or audio bytes. |
| `fs:plugin` | `echo.storage.get/set/remove` | Namespaced local state only; 16 KB per value, 64 KB total. It is not a filesystem API. |

Permission approval is exact. If an update adds or removes a permission, the stored approval no longer matches and the runtime will not load until the user confirms again.

## Listen-together and local-track sharing

`sources:direct` alone cannot share a local library file: it accepts an already existing external URL. A listen-together plug-in must declare `playback:share` and list every upload/playback hostname in the outer `echo.workshop.json`:

```json
{
  "networkHosts": ["together.example", "cdn.together.example"]
}
```

The compatibility surface intentionally restores the names used by earlier plug-ins:

```js
const info = await echo.playback.getShareInfo();
if (!info.available) throw new Error(info.reason);

let task = await echo.playback.shareCurrentTrack({
  uploadUrl: 'https://together.example/v1/tracks',
  roomId: 'room-42',
  headers: { authorization: 'Bearer user-owned-token' },
});

while (task.state === 'queued' || task.state === 'uploading') {
  await new Promise((resolve) => setTimeout(resolve, 500));
  task = await echo.playback.getShareTask(task.id);
}

if (task.state === 'ready') {
  await echo.playback.playUrl(task.playbackUrl, {
    title: task.track.title,
    artist: task.track.artist,
    album: task.track.album,
    live: false,
  });
}
```

`getShareInfo()` returns only sanitized metadata, size and availability. `shareCurrentTrack()` always triggers a host-owned confirmation showing the current title and upload origin. The main process then streams the current local file as the raw POST body; the plug-in never reads the file or path. `getShareTask()` returns `queued`, `uploading`, `ready` or `error`, byte progress and the final playback URL. Tasks are isolated by Workshop item and retained for one hour.

The upload request contains:

- `Content-Type`: inferred audio MIME type;
- `Content-Length`: local file size;
- `X-Echo-Share-Version: 1`;
- `X-Echo-Track-Metadata`: base64url JSON containing sanitized `track` and optional `roomId`;
- optional author-supplied `Authorization` and `X-*` headers, capped at 8 KB. Cookie, Host, Content-Length overrides and line breaks are rejected.

The sharing server must reply with JSON such as:

```json
{
  "playbackUrl": "https://cdn.together.example/tracks/abc123.flac",
  "expiresAt": "2026-08-17T00:00:00.000Z"
}
```

Both the upload host and returned playback host must appear in `networkHosts`. This is a narrow upload protocol, not arbitrary `fetch`, WebSocket, page parsing or account-cookie access. The author owns the room/signaling server and must tell users what is uploaded, how long it is retained and how it can be deleted. Users must share only audio they are permitted to transmit.

Undeclared network destinations, WebSocket, browser cookies, application settings, file import/deletion, metadata editing, arbitrary library writes, native code and raw filesystem access are not part of the Workshop plugin API. `sources:direct` is a playback handoff and `playback:share` is a host-owned current-track upload task. General remote JSON/text access requires the separate `network:request` capability and an exact outer-manifest hostname list.

## Declared remote HTTP(S) services

Use `network:request` when a lyrics source, searchable audio catalog, Webhook or author-written Agent needs a remote JSON/text API. Every destination hostname must be listed in the outer `echo.workshop.json` and is shown to the subscriber during capability approval:

```json
{
  "networkHosts": ["api.community.example", "agent.community.example"]
}
```

```js
const response = await echo.network.get(
  'https://api.community.example/v1/stations?q=ambient',
  { headers: { accept: 'application/json' } },
);

if (!response.ok) throw new Error(`catalog-http-${response.status}`);
const stations = JSON.parse(response.body);

const agentResponse = await echo.network.post(
  'https://agent.community.example/v1/run',
  JSON.stringify({ prompt: '整理一个夜间队列' }),
  { headers: { 'content-type': 'application/json' } },
);
```

The API accepts `GET` and `POST`, URL strings up to 2048 characters, UTF-8 request bodies up to 256 KB, at most 24 request headers / 8 KB, and response bodies up to 1 MB. Calls time out after 10 seconds and each plug-in may have at most four in flight. Redirects are followed at most three times and every redirect target must also use a declared hostname. Allowed request headers are `Accept`, `Accept-Language`, `Content-Type` and `X-*`; response headers expose a small metadata allowlist plus `X-*`. `Cookie`, `Set-Cookie`, `Authorization`, `Origin`, `Referer`, browser sessions and URL-embedded credentials are unavailable.

This is a connector API, not a hidden downloader or page-extraction API. Do not use it to bypass third-party service rules, scrape platform pages, import login cookies or obtain media URLs from services that do not permit it. Authors must state the service operator, purpose, transmitted fields, retention/deletion policy and how users can disable the connector. ECHO shows the declared host list at enable time; removing the plug-in's approval or disabling it immediately removes this network surface.

## Direct network audio sources

An author can build any catalog or station UI from packaged JSON and plug-in state, then hand a selected direct audio stream to ECHO:

```js
await echo.sources.playDirect({
  url: 'https://radio.example/live.mp3',
  title: 'Community Radio',
  artist: 'Live Stream',
  album: 'My Workshop Sources',
  live: true,
});
```

The URL must use HTTP or HTTPS, contain no embedded username/password and be at most 2048 characters. Known music/video platform page hosts are rejected because this API is not a platform extractor. Before the first play from an origin in a session, ECHO displays the plug-in name and origin for user approval. Playback then enters the host-owned queue as a temporary streaming track; the plug-in never receives decoder, device, EOF or DSP authority.

## Searchable source providers

Declare up to eight providers in `manifest.contributes.sourceProviders`, request `sources:provide`, and register both a search and resolve handler:

```js
const stations = [{
  providerTrackId: 'ambient-live',
  title: 'Ambient Radio',
  artist: 'Community Station',
  source: 'My licensed catalog',
  playable: true,
}];

echo.sources.registerProvider(
  'community-radio',
  { title: 'Community Radio' },
  {
    search: async ({ query, page, pageSize }) => {
      const matches = stations.filter((station) =>
        station.title.toLowerCase().includes(query.toLowerCase()));
      return {
        tracks: matches.slice((page - 1) * pageSize, page * pageSize),
        total: matches.length,
        hasMore: page * pageSize < matches.length,
      };
    },
    resolve: async ({ providerTrackId }) => {
      if (providerTrackId !== 'ambient-live') throw new Error('station-not-found');
      return {
        url: 'https://radio.example/live.mp3',
        title: 'Ambient Radio',
        artist: 'Community Station',
        live: true,
      };
    },
  },
);
```

The provider appears in ECHO's host-owned plug-in dock. The result view exposes previous/next page controls and calls the handler again with the requested `page`; return `hasMore: true` to enable the next-page button. Search input is capped at 240 characters; page size and returned tracks are capped at 50; each result is capped at 64 KB and each handler at 12 seconds. A track must provide `providerTrackId` and `title`. Optional fields are `artist`, `album`, `durationSeconds`, `source`, `playable` and `unavailableReason`. Resolve returns only `{ url, title?, artist?, album?, live? }`; response headers, cookies, proxy flags, file paths and executable objects are discarded.

Playing a result is a two-stage handoff: the author handler resolves an opaque provider track id to one direct HTTP(S) URL, then ECHO shows the origin confirmation and submits the sanitized source to its existing queue and Audio Core. The provider never becomes the playback backend. A plug-in panel may reuse its declared provider through `echo.sources.search(providerId, request)` and `echo.sources.resolve(providerId, providerTrackId)`.

`sources:provide` by itself does not grant network access, WebSocket, cookies, page parsing, account login, custom headers or local-file streaming. It works for packaged catalogs and generated catalogs. A remote catalog may additionally request `network:request` and list every API hostname in the outer manifest; the source provider still returns only sanitized candidates and one direct playback URL. Authors must have the right to list and play every returned source.

## Track metadata and cover providers

Declare up to eight entries in `manifest.contributes.metadataProviders` and `manifest.contributes.coverProviders`, then register matching handlers from the background entry:

```js
echo.metadata.registerProvider('community-metadata', { title: 'Community Metadata' }, async ({ track }) => ({
  candidates: [{
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: 'Ambient',
    year: 2026,
    source: 'My metadata service',
    confidence: 0.9,
  }],
}));

echo.covers.registerProvider('community-covers', { title: 'Community Covers' }, async ({ track }) => ({
  candidates: [{
    imageUrl: `https://images.example/covers/${encodeURIComponent(track.id)}.jpg`,
    title: `${track.title} cover`,
    source: 'My authorized image catalog',
    width: 1200,
    height: 1200,
  }],
}));
```

Ready providers appear in the existing single-track tag editor under **Workshop enhancements**. ECHO calls every ready provider when the user selects **Find tags** or **Find covers**, merges up to 24 sanitized candidates and lets the user choose one. Metadata candidates can fill `title`, `artist`, `album`, `albumArtist`, `genre`, `year`, `trackNo`, `discNo` and `bpm`. Cover candidates must contain an HTTP(S) `imageUrl`; choosing one only stages it, and the existing library save flow downloads and writes it after the user presses **Save tags**.

Providers receive title, artist, album, album artist, duration and an opaque track id, never the local path. A provider result is capped at 64 KB and 24 candidates and has a 12-second timeout. Remote provider logic can compose the separately approved `network:request` API. Returning a URL does not make the plugin the media-library owner: validation, downloading and tag persistence remain in ECHO's existing library service.

## Importable appearance themes

Declare up to twelve entries in `manifest.contributes.themePresets`. A preset is declarative: it has no runtime registration call and does not need a capability. Each entry needs a unique `id`, a `title`, a supported non-Pro `basePreset`, and at least one normalized `light` or `dark` tone override. `description`, a CSS-gradient `preview`, and up to six hexadecimal `swatches` are optional.

After the subscriber enables the Workshop plug-in, ECHO lists these entries under **Settings → Appearance → Custom theme → Plug-in themes**. Selecting one imports or updates a stable copy in **My themes**, applies it, and leaves every color and motion field editable. Disabling or updating the plug-in does not silently delete the user's imported copy; selecting the contribution again refreshes that copy from the current Workshop revision.

Theme presets change renderer presentation only. They do not receive JavaScript execution, external network, local paths, playback authority, Audio Core access, or a way to unlock protected presets. Use a standalone Workshop `theme` item instead when the content needs the full declarative skin or sandboxed replacement-UI schema.

## User-selectable lyrics sources

Declare up to eight providers in `manifest.contributes.lyricsProviders`, request `lyrics:provide`, and register each handler from the background entry:

```js
echo.lyrics.registerProvider(
  'community-lyrics',
  { title: 'Community Lyrics' },
  async ({ track, query }) => ({
    candidates: [{
      title: track.title,
      language: 'zh-CN',
      source: 'My licensed catalog',
      confidence: 0.9,
      lrc: '[00:00.00]Example synced lyric',
    }],
  }),
);
```

The user chooses the provider and starts the query from the lyrics settings drawer. The request contains only `{ id, title, artist, album, durationSeconds }` and an optional user-entered query. A result is `{ candidates }`; each candidate may contain `title`, `language`, `source`, `sourceUrl`, `confidence`, `lrc` and/or `text`. At least `lrc` or `text` is required. The host accepts at most 24 candidates and 256 KB per invocation, with a 12-second timeout.

Selecting a candidate sends its text through ECHO's existing typed custom-LRC application API. The Workshop frame does not become the current-lyrics owner and cannot directly mutate the lyrics renderer. `lyrics:provide` alone adds no network access; a remote lyrics catalog must separately request `network:request`, declare every API host and follow the same no-cookie/no-platform-scraping boundary. Authors must have the right to distribute or retrieve the returned lyrics.

## Author-written Agents

An Agent is declared in `manifest.contributes.agents` and registered by the background entry. ECHO provides the runner and approved tools; the author supplies the reasoning, rules, model integration strategy or local algorithm.

```js
echo.agents.register(
  'library-helper',
  { title: '曲库助手' },
  async (input) => {
    const summary = await echo.library.getSummary();
    const tracks = await echo.library.getTracks({ search: String(input), pageSize: 20 });
    return {
      answer: `曲库共 ${summary.trackCount} 首，找到 ${tracks.total} 个相关结果。`,
      tracks: tracks.items,
    };
  },
);
```

Declared Agents appear in ECHO's plug-in dock and can also be called from a plug-in panel:

```js
const result = await echo.agents.run('library-helper', '找一些适合夜晚的歌');
```

Input strings are capped at 4000 characters (structured input at 16 KB), results at 32 KB, and each invocation at 15 seconds. An Agent handler can call `echo.library`, `echo.queue`, `echo.playback`, `echo.audio`, `echo.sources`, `echo.network` and private storage only when the same plug-in declared and the subscriber approved those capabilities. ECHO supplies no shared model credential. A remote-model Agent must use `network:request` with declared hosts; it still receives no Cookie, Steam credential, local path or automatic API key.

## Host-rendered plugin settings

`manifest.contributes.settings` lets a plug-in add its own configuration without shipping another settings page. ECHO renders the form in the host-owned plug-in dock, validates values and stores them in a revision-independent namespace isolated to that plug-in.

Supported field types:

- `string`: optional `placeholder`, `defaultValue` and `required`;
- `number`: optional finite `min`, `max`, `defaultValue` and `required`;
- `boolean`: optional boolean `defaultValue`;
- `select`: 2–24 declared `{ label, value }` options and an optional default.

Up to 32 settings may be declared. A plug-in with settings must request `fs:plugin`. `secret` is rejected because Workshop local storage is not a credential vault; never ask subscribers to put API keys, cookies, passwords or activation material into a normal text setting.

```js
const settings = await echo.settings.get();
const style = await echo.settings.get('summary-style');

await echo.settings.set('show-notifications', false);

const stop = echo.settings.onChanged((nextValues) => {
  renderSettings(nextValues);
});
```

`get()` returns every declared setting with a validated stored or default value. `get(id)` returns one value. `set(id, value)` accepts only a declared field and returns the complete next snapshot. Host form saves and API writes both emit `settings:changed`. Settings do not enter ECHO's global `AppSettings`, cannot change Audio Core by themselves, and do not grant new capabilities.

## Creative API surface

All collection reads accept `{ page, pageSize, search }` where relevant. IDs must come from an earlier host result; page size is capped at 100.

```js
const albums = await echo.library.getAlbums({ search: 'live', pageSize: 24 });
const albumTracks = await echo.library.getAlbumTracks(albums.items[0].id);
const artists = await echo.library.getArtists({ pageSize: 50 });
const artistAlbums = await echo.library.getArtistAlbums(artists.items[0].id);
const genres = await echo.library.getGenres();
const genreTracks = await echo.library.getGenreTracks(genres.items[0].id);

const playlist = await echo.library.createPlaylist({
  name: '插件灵感收集',
  description: '由我的 Workshop 插件维护',
});
await echo.library.addTracksToPlaylist(
  playlist.id,
  genreTracks.items.slice(0, 20).map((track) => track.id),
);

await echo.queue.playTrack(albumTracks.items[0].id, albumTracks.items.map((track) => track.id));
await echo.queue.enqueueTrack(genreTracks.items[0].id);
await echo.navigation.open('queue');
```

Available library methods are:

- reads: `getSummary`, `getTracks`, `getAlbums`, `getAlbumTracks`, `getArtists`, `getArtistTracks`, `getArtistAlbums`, `getGenres`, `getGenreTracks`, `getGenreAlbums`, `getPlaylists`, `getPlaylistItems`, `getLikedTracks`, `getLikedTrackIds`;
- controlled writes: `toggleTrackLiked`, `toggleAlbumLiked`, `createPlaylist`, `addTracksToPlaylist`.

Available events are `playback:status`, `audio:spectrum`, `queue:changed`, `library:changed` and `library:liked-changed`.

```js
echo.events.on('audio:spectrum', ({ bands, energy, transient, state }) => {
  renderMyVisualizer({ bands, energy, transient, state });
});

echo.events.on('queue:changed', (queue) => {
  renderMyQueue(queue.items, queue.currentQueueId);
});
```

## Background entry API

The host loads `__bridge__.js` before the declared background entry, so `globalThis.echo` is ready when `plugin.js` runs.

```js
echo.commands.register(
  'library-summary',
  { title: '显示曲库摘要' },
  async () => {
    const summary = await echo.library.getSummary();
    await echo.storage.set('lastSummary', summary);
    await echo.ui.notify(`曲库中有 ${summary.trackCount} 首歌曲`);
  },
);

echo.events.on('playback:status', async (status) => {
  await echo.storage.set('lastPlaybackState', status.state);
});
```

Only commands and Agents declared in `manifest.contributes` appear in ECHO. Runtime registration cannot create hidden undeclared entries. Commands have a five-second host timeout; Agents have a fifteen-second timeout.

### Track context menu contributions

`manifest.contributes.trackContextMenus` can place a declared command directly in every single-track context menu:

```json
{
  "commands": [{ "id": "inspect-track", "title": "检查歌曲" }],
  "trackContextMenus": [{
    "id": "inspect-track-action",
    "title": "检查歌曲",
    "description": "显示这首歌的格式摘要",
    "commandId": "inspect-track",
    "localOnly": true
  }]
}
```

```js
echo.commands.register('inspect-track', { title: '检查歌曲' }, async (track) => {
  await echo.ui.notify(`${track.title} · ${track.codec || 'unknown'}`);
});
```

The command receives one host-sanitized track object containing display metadata and technical summary fields, but never a local path. Set `localOnly` when an action only makes sense for imported local songs. Context actions are shown only after their declared command has registered successfully; batch-selection menus do not run single-track actions. A package may declare at most 16 context actions, and every `commandId` must reference a command declared in the same manifest.

### Player-bar action contributions

`manifest.contributes.playerBarActions` can place up to eight host-rendered buttons in the existing ECHO player bar. Each entry references one declared command and may select a host-owned icon:

```json
{
  "commands": [{ "id": "show-status", "title": "显示状态" }],
  "playerBarActions": [{
    "id": "quick-status",
    "title": "快捷状态",
    "description": "显示当前播放摘要",
    "commandId": "show-status",
    "icon": "sparkles"
  }]
}
```

Supported icons are `blocks`, `sparkles`, `bot`, `radio`, `list-music`, `heart`, `bookmark` and `zap`. The button remains disabled until the background runtime registers the referenced command. Clicking it invokes the same bounded five-second command path used by the plug-in dock; it does not grant playback or library permissions by itself.

Panel `placement` is functional: `main` opens a large workbench, `utility` opens a narrower side tool, and `sidebar`, `home`, `lyrics`, `queue`, `track-detail` or `player` add a host-owned launcher to that surface. The panel itself always opens inside the same opaque sandbox with a host-owned close control. Users can open and search the plug-in dock anywhere with `Ctrl+Shift+P`, then use **管理插件功能** to hide, pin or reorder individual contributions without disabling the entire plug-in.

## Composition, automation, and diagnostics

Outer-manifest `dependencies` accept either an exact Workshop item ID or `{ itemId, versionRange?, optional? }`; `conflicts` lists item IDs that cannot be composed with this item. ECHO evaluates these before staging and presents a dependency-first order in **Workshop → 编排**. An update shows capability and contribution-count differences before approval. The previous active revision remains available for explicit rollback, and rollback always returns the item to disabled state so code-bearing content is confirmed again.

Subscribers can create automations that invoke declared commands or Agents on host-owned track start/end, queue, output-device and timer events. `track-ended` comes only from Audio Core's `ended` status; the renderer does not infer it from duration. The diagnostics view records bounded lifecycle, registration, command, Agent, host-action and automation entries with elapsed time. Configuration profiles export only declared settings, contribution layout and automation rules; plug-in private cache/state is not treated as portable configuration.

## Authoring fixtures and preflight

**Workshop → 创作** includes schema-aware outer-manifest and package fields alongside the raw JSON. The form preserves fields it does not own, so an author can use the visual editor and still maintain advanced declarations manually. Its local fixtures cover a populated library during playback, an empty library, a track without lyrics, an Audio Core-confirmed `ended` state, and a failed provider request. These fixtures are stable protocol examples; they do not execute the plug-in or expose a real user's library.

Before preparing a package, the workbench reports schema failures, missing license source information, untouched template placeholders, and `network:request` without a fixed outer `networkHosts` declaration. Unsaved edits invalidate the previous preview and cannot be prepared until saved. Authors should still install the prepared private item and test every declared command, panel, provider, Agent, automation target and failure path in ECHO before publishing.

## Panel API

Panels are independent sandbox frames. Load the bridge before your panel script:

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="panel.css">
<main><h1>Community Tools</h1><p id="summary"></p></main>
<script src="__bridge__.js"></script>
<script src="panel.js"></script>
```

```js
echo.library.getSummary().then((summary) => {
  document.querySelector('#summary').textContent =
    `${summary.trackCount} tracks · ${summary.albumCount} albums`;
});
```

The host owns the panel window and close button. Plugin HTML cannot cover or remove that close control.

## Runtime boundary

Both background and panel frames use `sandbox="allow-scripts"` without `allow-same-origin`. They receive no preload, Node, Electron, Steamworks, raw `window.echo`, Audio Core, filesystem or native host objects. The plugin CSP uses `connect-src 'none'`, `media-src 'none'`, `frame-src 'none'` and `object-src 'none'`. Host requests are rate-limited to 20 per second per frame.

Playback truth remains in Audio Core/native host. A plugin can request a command or render returned state; it cannot manufacture authoritative progress, device, DSP, EOF or queue state.

## Subscriber lifecycle

1. Subscribe/download does not execute code.
2. ECHO validates the outer manifest, exact hashes, `.echo` package, plugin manifest and requested capabilities.
3. The item remains `disabled`.
4. The user clicks **Use** and confirms the exact permission list.
5. ECHO records those approved capabilities and enables that exact revision.
6. Enabled commands and panels appear in the host-owned **插件** dock.
7. Update, tampering, disable or approval mismatch removes the runtime from the active set.

Public publishing is still a separate rights and moderation decision. The authoring CLI prepares private items by default and never publishes publicly on its own.
