# ECHO Workshop authoring CLI

The in-app Authoring Studio can create or update a real Steam Workshop item. Edit visibility, description, change note and tags, save the draft, prepare the package, review the generated preview, confirm that all content is owned or authorized, and then choose **Publish to Steam**. First publication writes the returned PublishedFileID back to `echo.workshop.project.json`; later publications update that same item instead of creating duplicates. Public, unlisted, friends-only and private visibility all use the project setting and require a final confirmation immediately before upload.

The machine-readable SDK contract is [echo-workshop-sdk.json](./workshop-sdk/echo-workshop-sdk.json). It identifies supported manifest schemas, content kinds, sandbox plug-in API versions and the separately versioned audio adapter protocol. Treat versions outside those arrays as unsupported instead of guessing compatibility.

SDK `1.1.0` completes the low-risk P1 author loop. `init --kind` generates production-validated projects for all six content kinds; `test` exercises sandbox registrations against deterministic host fixtures; `dev` serves the same report from a local hot-reloading mock host; and `quality` checks preview dimensions, listing copy, update notes, tags, compatibility, placeholders and README coverage. The SDK also includes focused examples for lyrics sources, author Agents, authorized direct-source catalogs, API 2 Listen Together share tasks, metadata/cover providers and complete declarative themes. These local tools never publish to Steam, never read the author's real ECHO library and do not replace a packaged-client smoke test.

The in-app dependency center shows a dependency-first composition order, exports a portable composition manifest, and can subscribe to every missing required Steam Workshop dependency in one confirmed action. Subscription only starts Steam download; it does not auto-enable or auto-approve any dependent plug-in capability.

The in-ECHO **Workshop → 创作** workbench and the matching authoring CLI create, edit, validate and prepare Workshop projects for the ECHO release AppID `5105090`; the app can additionally publish the prepared project using the active Steam client. The app workbench uses the same production parser, provides schema-aware forms without discarding unknown JSON fields, updates the file inventory and SHA-256 values when saving, and opens the generated listing preview after preparation. Themes may include the sandboxed UI runtime, presets remain data-only, and `plugin-package` projects may include capability-gated JavaScript commands and panels in an opaque iframe. Neither authoring surface can target the Playtest AppID, run Node/native plugins, or collect Steam credentials.

For the subscriber-facing workflow, status meanings and troubleshooting steps, see [ECHO 创意工坊使用指南](./ECHO_WORKSHOP_USER_GUIDE.zh-CN.md).

## Create a project

```powershell
npm run workshop:author -- init misc/workshop/aurora-theme `
  --kind theme `
  --id echo.aurora-theme `
  --title "Aurora Theme" `
  --holder "ECHO Community Author"
```

Supported kinds:

- `theme`
- `lyrics-style`
- `visualizer-preset`
- `dsp-preset`
- `audio-plugin-profile`
- `plugin-package`

The project is created with this layout:

```text
aurora-theme/
  echo.workshop.project.json
  README.md
  content/
    echo.workshop.json
    theme.json
```

Add a `preview.jpg`, `preview.png`, or `preview.gif` under 1 MB at the project root. The preview is outside the uploaded content manifest because Steam stores Workshop preview images separately through Steam Cloud.

## Prepare and validate

```powershell
npm run workshop:author -- prepare misc/workshop/aurora-theme
npm run workshop:author -- validate misc/workshop/aurora-theme
```

`prepare`:

1. inventories every regular file under `content/` except `echo.workshop.json`;
2. rejects links and unsafe paths;
3. writes exact file sizes and SHA-256 values into the manifest;
4. runs the production directory, manifest, asset and data-entry normalizers;
5. writes a private SteamCMD test VDF for AppID `5105090`;
6. writes `workshop-preview.html`, a local Steam-listing preview.

The preview is a listing preview, not proof that the theme, lyrics scene, visualizer or DSP preset renders correctly in ECHO. A real Steam subscription and explicit ECHO **Use** action remain required before release.

## Structured editor, fixtures, and preflight

The in-app authoring workbench keeps the raw outer manifest and entry JSON available, while also exposing schema-aware fields for identity, compatibility, license, dependencies, conflicts, network hosts and the most useful fields for the selected content kind. Editing through the form rewrites only those paths and preserves unrelated extension fields. Dependency rows use `itemId | versionRange | optional`; the last two columns may be omitted.

Five deterministic fixtures are built into the workbench: healthy playback, empty library, missing lyrics, Audio Core-confirmed playback end, and an unavailable remote provider. They are protocol-payload previews only: they never read the author's real library, paths, accounts, audio device or network state, and they do not pretend to be a full installed-package smoke test. In particular, the ended fixture is a host-supplied `state: "ended"` event with an empty native tail, not a position-based renderer guess.

The preflight report checks the production schema, license-source completeness, template placeholders, fixed-host declarations for `network:request`, and fixture availability. Blockers disable **Prepare package** in the workbench. Any edit invalidates the previous prepared preview, and unsaved text must be saved before a new package can be prepared; this prevents the disk package from silently lagging behind the visible editor. Warnings remain explicit author decisions and are not automatically rewritten.

## First-wave theme workflow

The generated `theme.json` is intentionally a full skin example rather than a two-color sample. Authors can independently tune:

- light and dark color systems, glass, blur, radius, saturation, shadow and motion;
- sidebar position/presentation/width, titlebar, player, cards, navigation and content density;
- home, lyrics, queue and song-list stage styles;
- bounded atmosphere effects and up to ten packaged raster regions.

Keep or remove any optional field after previewing the result. If images are used, place owned or licensed PNG/JPG/JPEG/WebP files under `content/`, reference them from `skin.assets`, then run `prepare` so hashes and sizes are rebuilt.

For a completely independent UI, add `runtime.entry` and `runtime.capabilities` to `theme.json`, then place external HTML/CSS/JS files under `content/ui/`. The HTML entry must be packaged and `.html`; relative CSS, script, JSON, font and raster references are served from the same owned revision. A functional replacement UI can request sanitized library/search/favorite/queue surfaces and route playback through the existing ECHO queue owner; it never receives file paths. The frame has no external network, Node, filesystem, Steamworks, preload, raw ECHO API, media or child-frame access. See `docs/ECHO_WORKSHOP_THEME_SKIN_SCHEMA.md` for the bridge protocol and emergency exit.

The subscriber flow is **Subscribe in Steam → open ECHO Workshop Installed → Enable and switch / Switch theme**. ECHO shows the validated title, palette, color modes and skin capabilities, and marks the AppSettings-selected item as **Current theme**. Merely subscribing never changes the user's appearance.

## Sandboxed plugin workflow

Use `--kind plugin-package` to generate a `.echo` package containing a background script, global and per-track context-menu commands, a player-bar command button, a utility panel, host-rendered settings, an author-written Agent, a paged searchable source provider, a user-selectable lyrics source, track metadata/cover providers, and an importable appearance-theme example. Plugins may declare separate capabilities for navigation, playback, Audio Core spectrum, structured library reads, favorites/local-playlist writes, queue orchestration, searchable source catalogs, lyrics providers, user-approved direct HTTP(S) audio sources, fixed-host HTTP(S) JSON/text requests, author Agent execution and private state. A `trackContextMenus` contribution connects a declared command to every single-track right-click menu and passes the command a sanitized track object without the local path. `playerBarActions` places up to eight host-rendered icon buttons in the existing player bar and invokes only commands declared by the same plug-in. Panel `placement` accepts `main`, `utility`, `sidebar`, `home`, `lyrics`, `queue`, `track-detail` or `player`; page slots are host-rendered launch surfaces and the opened content remains in the opaque panel sandbox. Users can independently show, hide, pin and reorder contributions from **插件 → 管理插件功能**, while `Ctrl+Shift+P` opens the searchable plug-in dock from anywhere. `metadataProviders` and `coverProviders` contribute selectable tag and artwork candidates to the existing single-track editor; ECHO keeps final validation, downloading and saving in the library service. `themePresets` contributes up to twelve declarative light/dark themes: enabled entries appear under Appearance, where the subscriber imports one into My themes and can continue editing it. A source provider requests `sources:provide`, declares up to eight entries, implements bounded paged `search` and `resolve` handlers, and hands only a sanitized direct URL back to the host-owned queue. A remote source, lyrics, metadata, cover or Agent connector additionally requests `network:request` and lists every target hostname in the outer `networkHosts`; the host limits methods, sizes, time, redirects and concurrency and never attaches cookies or Steam identity. A lyrics provider requests `lyrics:provide`, is selected by the subscriber in the lyrics drawer, receives only sanitized track metadata and returns bounded LRC/text candidates. Settings may be string, number, boolean or select fields and require `fs:plugin`; credential/secret fields are rejected because Workshop storage is not a credential vault. The project is validated against the same production parser used at activation. Subscribers must confirm the exact requested capability list before the plugin runs. Copy [the Workshop TypeScript declaration](./workshop-sdk/echo-workshop-plugin.d.ts) into an author project for editor completion, and see [ECHO Workshop sandbox plugin API](./ECHO_WORKSHOP_PLUGIN_API.md) for the package schema, full bridge API, events, quotas and examples.

The outer manifest may declare legacy exact dependencies as Steam item IDs or structured dependencies such as `{ "itemId": "123", "versionRange": "^2.1.0", "optional": true }`. Supported ranges are exact versions, `*`, `^`, `~`, `>`, `>=`, `<` and `<=`. `conflicts` lists incompatible item IDs. ECHO checks required dependencies, version ranges and conflicts before staging, shows a dependency-first composition order in **Workshop → 编排**, and keeps optional missing dependencies non-blocking.

Users may bind registered commands or Agents to host-owned `track-started`, authoritative `track-ended`, queue, output-device and timer events. Authors do not declare hidden automation in the package: the subscriber creates and enables each rule in **Workshop → 编排**. Rules call the same registered command/Agent path and do not create playback truth.

For a custom lyrics theme, use `--kind lyrics-style`. The generated declarative scene can replace the lyrics-page layout with trusted cover, title, artist, album, lyrics, translation, progress, time, status and spectrum slots. Once enabled, subscribers switch between it and ECHO's built-in layout directly in the lyrics settings drawer. It cannot inject HTML, JavaScript, arbitrary CSS or external asset URLs; see [ECHO Workshop lyrics scene schema](./ECHO_WORKSHOP_LYRICS_SCENE_SCHEMA.md).

For a listen-together plug-in, add `playback:share` to the inner `.echo` manifest permissions and add every upload/CDN host to `networkHosts` in `content/echo.workshop.json`. `prepare` preserves and validates that host list. The plug-in can then call `getShareInfo`, `shareCurrentTrack`, `getShareTask` and `playUrl`; it never receives the local path or file bytes. The destination service must implement the raw POST protocol documented in the plug-in API guide.

## Audio plug-in profile workflow

Use `--kind audio-plugin-profile` to publish a portable connection profile for a VST3 effect or VST3i instrument that the subscriber installs separately. The generated JSON records the VST3 Class ID, display identity, role, normalized parameter IDs/values, presets, optional adapter API version and suggested pre/post-DSP placement.

The profile is data-only. Do not add a `.dll`, `.vst3` bundle, installer, download script or license key to the project. Enabling the profile only makes the mapping available; ECHO reports an unmet dependency until a matching local plug-in and compatible optional Audio Core adapter are present. It never treats the Workshop profile as proof that audio processing is active. See [Workshop audio plug-in profile schema](./ECHO_WORKSHOP_AUDIO_PLUGIN_PROFILE.md).

## Private test upload

Review the generated `workshop-item.vdf` before using it. It is created with:

- release AppID `5105090`;
- `publishedfileid` set to `0` for a new item;
- private visibility;
- no Steam account, password, Steam Guard code or session data.

SteamCMD remains available for internal testing. Authenticate SteamCMD interactively; never put Steam passwords or Steam Guard codes into this project, command-line arguments, logs or repository files.

The generated SteamCMD VDF does not apply Workshop item tags. To create or update a private test item through the local Steam client, use:

```powershell
npm run workshop:author -- publish-private misc/workshop/aurora-theme `
  --confirm-rights owned-or-authorized
```

This command runs the same production validation as `prepare`, requires an explicit content-rights confirmation, forces Steam visibility to private, and submits the configured tags through `steamworks.js`. The tags must exactly match the English names configured for AppID `5105090`: `Theme`, `Lyrics Scene`, `Visualizer Preset`, or `DSP / EQ Preset`.

For a new item, its Steam PublishedFileID is written to `echo.workshop.project.json` immediately after creation, before content upload. This prevents a failed upload retry from accidentally creating duplicate orphan items. Steam may still require the current account to accept the Workshop legal agreement.

After SteamCMD uploads the item, it updates `publishedfileid` in the VDF. Copy that numeric value into `echo.workshop.project.json` before preparing a later update, otherwise a new item could be created.

## Content rules

- The inner entry `id` must match the outer `echo.workshop.json` `id`.
- Non-plugin content cannot declare network hosts.
- Theme runtime may package declared HTML, CSS, JavaScript, JSON, WOFF/WOFF2 and raster files. SVG, executables, DLLs, Node addons, command scripts, remote assets and filesystem paths are rejected.
- Audio plug-in profiles may identify a subscriber-installed VST3/VST3i by Class ID and carry normalized parameter maps, but may not contain the plug-in binary, an installer, activation material or an external download payload.
- Every uploaded content file must be declared with the exact size and SHA-256 produced by `prepare`.
- License holder and license identifier are required. Replace the template `All-Rights-Reserved` value only when the author has selected another valid license and owns the required rights.
- Public publishing remains separate from private testing. Public uploads still require explicit product approval, legal-agreement handling, moderation, deletion, reporting and privacy governance.

## Published item handoff — 2026-08-16

- `Editorial Record Spectrum` was uploaded to the formal ECHO Workshop for AppID `5105090` as PublishedFileID `3784584393` with the `Lyrics Scene` tag.
- The upload was created privately first, then explicitly updated to Steam visibility `0` (`Public`) after the user authorized direct publication. Steam reported no pending Workshop legal-agreement acceptance.
- An authenticated `steamworks.js` query returned the expected AppID, title, public visibility, tag, preview URL and `banned=false`. The unauthenticated public Web API still returned result `9`; because the main App is not released, this does not establish ordinary-account browse or subscription readiness.
- The public preview is `effect-preview-editorial-public-v1.jpg`, built from original abstract artwork and fictional lyrics. Local QA screenshots containing real library covers or lyrics were not uploaded.
- The item declares minimum ECHO version `26.8.15`. Future updates must keep PublishedFileID `3784584393` and must not create a replacement item accidentally.

## Public Workshop update handoff — 2026-08-17

- Existing public items were updated in place for formal ECHO AppID `5105090`; no new PublishedFileID was created.
- `Editorial Record Spectrum` remains PublishedFileID `3784584393`, public visibility `0`, with the `Lyrics Scene` tag and validated version `1.0.0` content.
- After the theme was declared final on 2026-08-17, PublishedFileID `3784584393` was published in place again (`created=false`). Steamworks reported public visibility, no pending legal-agreement acceptance, and a zero-cache readback confirmed AppID `5105090`, `banned=false`, the expected tag and updated preview.
- PublishedFileID `3783131921` was updated from the old `Lunar Bloom` listing to `Midnight Record Room`, public visibility `0`, with the `Theme` tag and validated version `1.4.3` content. Its preview and packaged images are covered by `misc/workshop/lunar-bloom-theme/PROVENANCE.md`.
- Steamworks.js returned each expected PublishedFileID and no Workshop legal-agreement requirement. A zero-cache `getItem` readback confirmed the new titles, visibility, tags, AppID ownership and `banned=false` immediately after each update.
- This publishes Workshop item content only. The P0/P1/P2 host capabilities and authoring UI are application code and still require a separately built, audited and deployed ECHO App depot before subscribers can use them.

See also:

- `docs/ECHO_STEAM_WORKSHOP_FOUNDATION.md`
- `docs/ECHO_WORKSHOP_THEME_SKIN_SCHEMA.md`
- `docs/ECHO_WORKSHOP_LYRICS_SCENE_SCHEMA.md`
