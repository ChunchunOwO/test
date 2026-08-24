# ECHO Workshop theme skin schema

Workshop themes have two independent authoring levels:

1. `skin`: a declarative, no-code restyle of the existing ECHO chrome;
2. `runtime`: an optional packaged HTML/CSS/JavaScript application that can replace the entire visible UI and does not need to resemble ECHO.

The runtime is executable but isolated. It runs in an opaque `sandbox="allow-scripts"` iframe with a host-owned emergency exit. It has no Node, filesystem, Steamworks, preload API, raw `window.echo`, external network, media, child-frame or Audio Core access. All interaction goes through a versioned `postMessage` capability bridge.

Color still uses the existing `light` / `dark` tone overrides (accent, panels, titlebar, sidebar, player, radius, glass, motion). The optional `skin` object goes further and can rearrange the shell.

## Contribution shape

```json
{
  "type": "echo-workshop-theme-preset",
  "schemaVersion": 1,
  "id": "echo.harbor-shell",
  "title": "Harbor Shell",
  "basePreset": "classic",
  "dark": {
    "appBg": "#10131a",
    "accent": "#66ccff",
    "panelOpacityPercent": 64,
    "glassPercent": 28,
    "cornerRadiusPx": 18
  },
  "backgroundAsset": "art/bg.png",
  "skin": {
    "mode": "shell",
    "layout": {
      "sidebarPosition": "right",
      "sidebarPresentation": "overlay",
      "sidebarWidth": "wide",
      "playerStyle": "hero",
      "titlebarStyle": "immersive",
      "contentDensity": "editorial",
      "cardStyle": "glass",
      "displayStyle": "editorial",
      "navStyle": "pills",
      "motion": "cinematic"
    },
    "stages": {
      "home": "cinema",
      "lyrics": "theater",
      "queue": "tickets",
      "songs": "poster"
    },
    "assets": {
      "background": "art/bg.png",
      "titlebar": "art/titlebar.png",
      "sidebar": "art/sidebar.png",
      "player": "art/player.png",
      "page": "art/page.png",
      "home": "art/home.png",
      "lyrics": "art/lyrics.png",
      "queue": "art/queue.png",
      "nowPlaying": "art/now.png",
      "watermark": "art/mark.png"
    },
    "effects": {
      "grainPercent": 12,
      "vignettePercent": 28,
      "glowPercent": 16,
      "scrimPercent": 36,
      "bloomPercent": 18,
      "mistPercent": 10,
      "dimChromePercent": 16,
      "spotlightPercent": 32,
      "frostPercent": 8
    }
  }
}
```

## Full UI runtime

Add a packaged HTML entry beside the declarative fallback:

```json
{
  "runtime": {
    "entry": "ui/index.html",
    "capabilities": [
      "navigation",
      "playback:read",
      "playback:control",
      "library:read",
      "library:control",
      "queue:read",
      "queue:control",
      "window:control"
    ]
  }
}
```

Allowed runtime files are declared and hashed `.html`, `.css`, `.js`, `.mjs`, `.json`, `.woff`, `.woff2`, `.png`, `.jpg`, `.jpeg` and `.webp` files. Each non-raster runtime file is limited to 4 MB; normal raster limits still apply. Relative links from the HTML entry are supported through `echo-workshop://ui/`. Inline scripts, SVG, native modules, executables and external URLs remain blocked.

Capability meanings:

| Capability | Host surface |
| --- | --- |
| `navigation` | Navigate to a validated built-in ECHO route. Availability and entitlement checks still run in the host. |
| `playback:read` | Receive a sanitized playback snapshot: state, track id, position, duration and volume. Local paths are removed. |
| `playback:control` | Play, pause, play/pause, previous, next, seek and set volume through the existing playback controller. |
| `library:read` | Page and search the real library, plus read liked state. Returned tracks contain display metadata only; local and remote paths are removed. |
| `library:control` | Toggle a real track's liked state by validated library id. |
| `queue:read` | Receive the current queue and current-track display metadata, with paths removed. |
| `queue:control` | Play a library track through `PlaybackQueueProvider`, enqueue it, play/remove an existing queue item, or clear the queue. Audio truth remains in Audio Core. |
| `window:control` | Minimize, toggle maximize/fullscreen and close the main window. |

The theme sends `{ "type": "echo:workshop-ui:ready" }` when ready. Commands use `{ "type": "echo:workshop-ui:command", "requestId": "...", "command": "playPause", "payload": {} }`. The host replies with `echo:workshop-ui:init`, `echo:workshop-ui:state` and `echo:workshop-ui:result` messages; successful query results are returned in `result.value`. Available functional commands include `library:listTracks`, `library:listLiked`, `library:getLiked`, `library:toggleLiked`, `queue:get`, `queue:playTrack`, `queue:enqueueTrack`, `queue:playItem`, `queue:removeItem` and `queue:clear`. Commands are rate limited and denied unless their capability is declared.

The host always renders an exit button above the iframe. `Ctrl+Shift+F12` exits the custom UI for the current session even if its own navigation is broken.

`backgroundAsset` remains a shorthand for `skin.assets.background`.

## Modes

| Mode | Effect |
| --- | --- |
| `chrome` | Keep the standard app structure. Apply region rasters, density, card style, stages and effects. |
| `shell` | Same as chrome, plus stronger glass and more of the packaged background showing through. Combine with `overlay` / `rail` sidebar, `hero` or `floating` player, and `immersive` titlebar for a full reskin. |

## Layout whitelist

- `sidebarPosition`: `left` \| `right` (desktop only; compact layouts stay unchanged)
- `sidebarPresentation`: `dock` \| `overlay` \| `rail` (desktop only; lyrics / standalone shells stay unchanged)
- `sidebarWidth`: `narrow` \| `standard` \| `wide` (`rail` always uses the icon-only width)
- `playerStyle`: `standard` \| `compact` \| `floating` \| `hero`
- `titlebarStyle`: `standard` \| `minimal` \| `immersive`
- `contentDensity`: `comfortable` \| `compact` \| `editorial`
- `cardStyle`: `flat` \| `raised` \| `glass` \| `outline`
- `displayStyle`: `default` \| `editorial` \| `technical` \| `playful`
- `navStyle`: `standard` \| `pills` \| `ghost`
- `motion`: `none` \| `gentle` \| `cinematic` (cinematic follows `prefers-reduced-motion`)

## Stage whitelist

These restyle existing page classes. They do not inject new React trees; a `runtime` replaces the visible shell separately.

- `home`: `standard` \| `hero` \| `cinema` \| `magazine`
- `lyrics`: `standard` \| `theater` \| `poster` \| `vinyl`
- `queue`: `standard` \| `tickets` \| `compact`
- `songs`: `standard` \| `poster` \| `dense`

## Assets

All images must be declared packaged `.png` / `.jpg` / `.jpeg` / `.webp` files (same 16 / 2 MB raster policy). They are served through `echo-workshop://asset/` only.

| Key | Target |
| --- | --- |
| `background` | App shell / overlay |
| `titlebar` | `.app-titlebar` |
| `sidebar` | `.sidebar` |
| `player` | `.player-bar` |
| `page` | `.page-surface` |
| `home` | `.home-page` |
| `lyrics` | `.lyrics-page` |
| `queue` | `.queue-page` |
| `nowPlaying` | `.home-now-card` / `.queue-now-card` |
| `watermark` | Fail-closed corner mark |

## Atmosphere bounds

| Field | Range | Default |
| --- | --- | --- |
| `grainPercent` | 0–40 | 0 |
| `vignettePercent` | 0–60 | 0 |
| `glowPercent` | 0–80 | 0 |
| `scrimPercent` | 8–90 | 42 |
| `bloomPercent` | 0–50 | 0 |
| `mistPercent` | 0–40 | 0 |
| `dimChromePercent` | 0–60 | 0 |
| `spotlightPercent` | 0–80 | 0 |
| `frostPercent` | 0–40 | 0 |

## Hard limits

- Declarative `skin` values still cannot contain raw CSS, HTML, script or `url()` values. Executable UI belongs only in declared `runtime` files.
- Runtime files cannot access Node, filesystem paths, Steamworks, preload, raw IPC, `window.echo`, external network, audio/media elements or child frames. SVG and native/code executables remain forbidden.
- Applying a theme still writes an isolated custom theme into AppSettings. Skin receipts are separate and never become wallpaper paths.
- Subscribe / download still does not auto-enable. Runtime themes show an additional executable-UI confirmation before use.
- `.echo` plugins stay disabled after ingest; theme runtime does not activate the plugin system.
