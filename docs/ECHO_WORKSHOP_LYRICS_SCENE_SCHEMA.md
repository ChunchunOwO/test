# ECHO Workshop lyrics scene schema v1

Lyrics scenes are declarative, data-only layouts. A scene may completely replace the built-in lyrics page composition, while ECHO continues to own playback, timing, lyrics resolution and audio telemetry.

## Contribution shape

Use `content.kind: "lyrics-style"` in `echo.workshop.json`. Its declared entry may contain `settings`, `scene`, or both:

```json
{
  "type": "echo-workshop-lyrics-style",
  "schemaVersion": 1,
  "id": "echo.editorial-rebuild",
  "title": "Editorial Rebuild",
  "description": "A complete two-column lyrics-page rebuild.",
  "settings": {
    "lyricsWordHighlightEnabled": true,
    "lyricsMusicReactiveVisualsEnabled": true
  },
  "scene": {
    "schemaVersion": 1,
    "background": "cover-blur",
    "root": {
      "id": "stage",
      "type": "group",
      "style": {
        "display": "grid",
        "gridTemplateColumns": "minmax(240px, 0.8fr) minmax(0, 1.2fr)",
        "gap": "clamp(24px, 4vw, 72px)",
        "padding": "32px 5vw",
        "height": "100%"
      },
      "responsive": {
        "compact": {
          "gridTemplateColumns": "1fr",
          "padding": "20px"
        }
      },
      "children": [
        {
          "id": "cover",
          "type": "slot",
          "slot": "cover",
          "style": {
            "width": "100%",
            "aspectRatio": "1 / 1",
            "objectFit": "cover",
            "borderRadius": "28px"
          }
        },
        {
          "id": "copy",
          "type": "group",
          "style": {
            "display": "flex",
            "flexDirection": "column",
            "justifyContent": "center",
            "gap": "18px",
            "minWidth": "0"
          },
          "children": [
            {
              "id": "title",
              "type": "slot",
              "slot": "title",
              "style": {
                "color": "$text",
                "fontSize": "clamp(32px, 6vw, 96px)",
                "fontWeight": 700,
                "lineHeight": 1.02
              },
              "motion": {
                "preset": "slide-up",
                "durationMs": 720,
                "intensity": 0.8
              }
            },
            {
              "id": "artist",
              "type": "slot",
              "slot": "artist",
              "style": {
                "color": "$muted",
                "fontSize": "18px"
              }
            },
            {
              "id": "lyrics",
              "type": "slot",
              "slot": "lyrics",
              "style": {
                "minHeight": "260px",
                "overflow": "hidden"
              },
              "options": {
                "showTranslation": true,
                "showRomanization": true,
                "wordHighlightEnabled": true
              }
            },
            {
              "id": "transport",
              "type": "group",
              "style": {
                "display": "grid",
                "gridTemplateColumns": "auto 1fr auto",
                "alignItems": "center",
                "gap": "12px"
              },
              "children": [
                { "id": "now", "type": "slot", "slot": "time-current" },
                { "id": "progress", "type": "slot", "slot": "progress" },
                { "id": "duration", "type": "slot", "slot": "time-duration" }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

## Host chrome

`scene.hostChrome.miniPlayer` is `"visible"` by default. Setting it to `"hidden"` lets a scene that builds its own transport row take over the bottom of the lyrics page instead of stacking under ECHO's mini player.

This is fail-closed on both sides: normalization rejects `"hidden"` unless the scene actually declares a `play-toggle` slot, and the renderer re-checks the same rule before the host bar is removed, so a malformed or partially authored scene can never leave the page without a way to resume playback. Leaving the lyrics page always restores the full player bar.

## Nodes and slots

Every scene root is a `group`. IDs must be unique and match `^[a-z][a-z0-9_-]{0,47}$`.

| Node | Purpose |
| --- | --- |
| `group` | Arbitrary nested flex, grid, absolute or normal-flow composition through `children`. |
| `slot` | A trusted ECHO-owned runtime value. It may have slot-specific `options`. |
| `text` | Static author text. It is rendered as inert text, never parsed as HTML. |
| `decoration` | A style-only shape for panels, lines, gradients and visual accents. |
| `image` | A packaged raster from a declared relative path such as `art/panel.png`. Main rewrites it to an `echo-workshop://asset/` URL before the renderer sees it. |

Supported slots:

- Media: `cover`, `title`, `artist`, `album`.
- Lyrics: `lyrics`, `current-line`, `previous-line`, `next-line`, `translation`.
- Playback readout: `progress`, `time-current`, `time-duration`, `status`, `track-tech`.
- Playback transport: `seek-bar`, `play-toggle`, `previous-track`, `next-track`, `volume-slider`.
- Audio-reactive display: `spectrum`.

`lyrics` uses ECHO's existing synchronized lyrics renderer and seek behavior. `spectrum` samples existing Audio Core telemetry; it does not create a second analyser or audio pipeline.

Transport slots are host-built controls: the scene declares where one goes and how it is styled, while ECHO renders the button, resolves its enabled state, and runs the same playback command the mini player and the keyboard shortcuts use. A scene never receives a playback API of its own. `play-toggle` follows the host play/pause state, `previous-track` and `next-track` disable themselves when the queue has no neighbour, and `seek-bar` is draggable and arrow-key seekable whenever the user's lyrics seek setting allows it. Icon size follows the node's `fontSize`, so a scene controls the control's scale through normal typography.

`track-tech` renders the current track's technical facts as separate `KHZ` / `BIT` / `KBPS` / `BPM` labelled items sourced from the host library metadata (codec, bit depth, sample rate, bitrate, BPM). Missing fields are omitted and the slot renders nothing when no facts are known; the scene styles the row as a whole through normal typography properties.

`volume-slider` is a host-built output-volume scrubber with an automatic speaker icon. It mirrors Audio Core's volume, commits changes through the same output path as the host volume control, persists the user's volume setting, and becomes non-interactive while the fixed-volume (100%) setting is enabled. The slot never exposes an audio API to the scene.

For `spectrum`, `options.spectrumBars` accepts 4–128 rendered bars and `options.spectrumGain` accepts a bounded 0.25–4 display gain. `options.spectrumScale` may be `linear` or `perceptual`; perceptual scaling spreads the host's low-frequency detail across more of the available width. ECHO interpolates the host-owned spectrum across the requested bar count; these options change presentation only and never replace or synthesize telemetry.

Audio Core delivers spectrum telemetry in packets rather than per frame, so the renderer eases each bar toward the newest packet instead of snapping to it. `options.spectrumAttackMs` (8–600, default 18) and `options.spectrumReleaseMs` (8–1200, default 48) set those rise and fall time constants. Values close to the telemetry interval keep motion continuous between packets; very small values reproduce the packet rate as visible steps. Easing only changes how a real value is approached — it never invents, holds or extrapolates telemetry.

## Styling, responsiveness and motion

`style` accepts the whitelisted properties declared in `src/shared/types/workshopLyricsScene.ts`. It covers:

- flex and grid layout, absolute positioning and z-order;
- sizing, spacing, overflow and aspect ratio;
- colors, safe gradients, borders, radius, shadows, filters and transforms;
- fonts, typography, alignment, wrapping and object fit.

Values may use normal units (including the container-query units `cqw`, `cqh`, `cqmin` and `cqmax`, resolved against the scene stage), 1-4 value spacing/radius shorthands, and bounded `calc()`, `clamp()`, `min()` or `max()` expressions. `display` accepts `block`, `flex`, `grid` or `none`, so a responsive override can remove a node from the flow entirely. The renderer also resolves these theme tokens:

`$text`, `$muted`, `$accent`, `$accent-strong`, `$panel`, `$background`, `$border`, `$danger`, `$success`, `$on-cover`.

`responsive.compact` applies below 760 px and `responsive.wide` applies from 1440 px. Supported motion presets are `none`, `fade`, `slide-up`, `slide-left`, `scale`, `float` and `pulse`; motion follows ECHO's motion/reduced-motion policy.

`when` can conditionally include a node with `hasCover`, `hasLyrics` or `isPlaying`.

## Limits and security boundary

- Maximum 64 nodes, depth 8, 24 children per group and 48 style properties per style block.
- External URLs, `url()`, `expression()`, `javascript:`, `@import`, declarations containing `;`, and raw stylesheet blocks are rejected.
- The scene cannot provide scripts, HTML, React components, filesystem paths, remote fonts, SVG or remote images. Album art comes only from the current ECHO track.
- Packaged rasters are allowed when declared in the manifest as `.png` / `.jpg` / `.jpeg` / `.webp` (max 16 files, 2 MB each). `background: "asset"` requires `backgroundAsset`. The renderer only receives `echo-workshop://asset/` URLs from an enabled owned revision.
- Applying stores only a source/item/version/SHA/Registry-update receipt. The scene is re-read from the currently enabled, verified catalog revision.
- Disabling an item immediately removes its active scene. Re-enabling does not silently restore it; the user must explicitly apply it again.

These constraints are the execution boundary, not a visual template restriction: authors can rebuild the entire composition inside the declarative graph without becoming code running inside ECHO.
