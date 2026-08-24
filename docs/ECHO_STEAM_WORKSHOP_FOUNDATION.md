# ECHO Steam Workshop foundation

## Current scope

This foundation now includes a typed management UI and preload API for status, in-app browse/subscribe, download, ingestion, data activation, one-click use, safe reconciliation, explicit contribution application, a sandboxed full-theme UI runtime, capability-gated `.echo` plugin commands/panels/author Agents, host-rendered plug-in settings, user-approved direct audio-source handoff, declared-host bounded HTTP(S) requests, host-owned UI slots, per-contribution visibility/pinning/order, an in-ECHO authoring and Steam publishing studio, dependency/version/conflict declarations with required-dependency auto-subscription, last-known-good rollback, preview-token cleanup, host-event automation, runtime diagnostics, a real subscription/download/use acceptance runner and versioned customization profiles. It intentionally stops before Node/native plugin execution, unrestricted Workshop `fetch`/WebSocket/browser sessions, a bundled production VST3 processing host, or automatically applying subscribed content without a user command.

The ownership boundary is:

```text
WorkshopSource
  provides source-neutral discovery, download and install locations
        |
        +-- SteamWorkshopService
        +-- LocalWorkshopSource
        |
        v
WorkshopIngestionService
  serializes each item and coordinates the fail-closed workflow
        |
        v
WorkshopContentValidator
  performs the first manifest, path, size and SHA-256 inspection
        |
        v
WorkshopCompatibilityService
  checks ECHO, schema, content, plugin API and dependency compatibility
        |
        v
WorkshopStagingInstaller
  copies declared files, verifies again and atomically promotes owned content
        |
        v
WorkshopRegistry
  records the candidate revision as staged, then disabled by default
        |
        v
WorkshopDataActivationService
  revalidates and enables data-only contributions transactionally
        |
        +-- ThemePresetHandler
        +-- LyricsStyleHandler
        +-- VisualizerPresetHandler
        +-- DspPresetHandler
        |
        v
WorkshopDataCatalog
  stores normalized available contributions
        |
        +-------------------------+
        |                         |
        v                         v
WorkshopReconcileService   WorkshopContributionApplyService
  repairs startup state      rechecks Registry + catalog revision truth
                                  |
                                  +-- Theme/AppSettings + theme-background adapter
                                  +-- Lyrics/AppSettings + Scene adapter
                                  +-- Visualizer receipt adapter
                                  +-- DSP/EqBridge adapter
                                            |
                                            v
                              WorkshopLyricsSceneService / VisualizerPresetService
                         stores a revision receipt, resolves catalog truth
        |                         |
        +------------+------------+
                     v
            WorkshopManagerService
       exposes redacted snapshots and serialized commands
                     |
                     v
            typed main/preload IPC
                   |
                   v
              WorkshopPage
        renderer control plane only
```

Steam Workshop is a distribution source, not a runtime. Content must never execute directly from Steam's install directory.

## Module responsibilities

| Module | Responsibility |
| --- | --- |
| `src/shared/types/workshop.ts` | Serializable manifest, catalog, install and download contracts. |
| `src/main/workshop/WorkshopSource.ts` | Source-neutral contract for catalog, download and install-location operations. |
| `src/main/workshop/LocalWorkshopSource.ts` | Steam-independent source for development fixtures and focused tests. |
| `src/main/workshop/WorkshopManifest.ts` | Fail-closed schema normalization, compatibility, size and path policy. |
| `src/main/workshop/WorkshopVersion.ts` | Shared stable/prerelease ECHO version comparison. |
| `src/main/workshop/WorkshopCompatibilityService.ts` | Pure compatibility evaluation with structured failure reasons. |
| `src/main/workshop/WorkshopContentValidator.ts` | Directory inventory, undeclared-file rejection, executable rejection and SHA-256 verification. |
| `src/main/workshop/WorkshopInstallLayout.ts` | Owned staging and content-addressed installed-directory layout. |
| `src/main/workshop/WorkshopStagingInstaller.ts` | Declared-file copy, second verification, atomic promotion, idempotency and bounded rollback. |
| `src/main/workshop/WorkshopIngestionService.ts` | Per-item Source → validation → compatibility → staging → Registry orchestration and crash recovery. |
| `src/main/workshop/WorkshopDataContentHandler.ts` | Shared abstraction and kind-based handler registry for data-only entry schemas. |
| `src/main/workshop/WorkshopThemePresetHandler.ts` | Declarative theme normalization without Pro-theme unlock bypass. |
| `src/main/workshop/WorkshopThemeUiRuntimeNormalizer.ts` | Validates a packaged HTML entry and the closed UI capability set. |
| `src/main/workshop/WorkshopLyricsStyleHandler.ts` | Normalizes bounded lyrics settings and the versioned declarative lyrics scene graph. |
| `src/main/workshop/WorkshopLyricsSceneNormalizer.ts` | Enforces scene complexity limits and the style, motion, condition and slot whitelist; rejects executable CSS and external URLs. |
| `src/main/workshop/WorkshopLyricsSceneSelectionStore.ts` | Atomically persists only the selected Registry revision receipt, never the scene payload. |
| `src/main/workshop/WorkshopLyricsSceneService.ts` | Resolves the active scene only when the selected receipt still matches enabled Registry and catalog truth. |
| `src/main/workshop/WorkshopVisualizerPresetHandler.ts` | Renderer-only visualization shape, palette and motion parameters. |
| `src/main/workshop/WorkshopDspPresetHandler.ts` | Strict 32-band EQ preset data; does not apply DSP state. |
| `src/main/workshop/WorkshopDataCatalog.ts` | Atomic, fail-closed persistence for enabled normalized data contributions. |
| `src/main/workshop/WorkshopDataActivationService.ts` | Transactional catalog/Registry enable-disable coordination and quarantine. |
| `src/main/workshop/WorkshopDataActivationAssembly.ts` | Builds one handler/catalog/service assembly with shared schema ownership. |
| `src/main/workshop/WorkshopDataCatalogRecordLoader.ts` | One verification and normalization path shared by activation and reconciliation. |
| `src/main/workshop/WorkshopReconcileService.ts` | Recovers staged revisions, restores valid enabled catalog data, prunes stale catalog records and quarantines tampered content. |
| `src/main/workshop/WorkshopContributionApplyService.ts` | Rechecks enabled Registry and matching catalog truth before dispatching an explicit apply command. |
| `src/main/workshop/WorkshopAppSettingsApplyAdapters.ts` | Applies themes as isolated custom themes and lyrics styles through the AppSettings owner. |
| `src/main/workshop/WorkshopDspPresetApplyAdapter.ts` | Saves and applies DSP presets through the existing DSP bridge, awaits host confirmation and performs best-effort rollback on failure. |
| `src/main/workshop/WorkshopContributionApplyAssembly.ts` | Wires AppSettings notifications and the current main-owned DSP bridge into Workshop adapters. |
| `src/main/workshop/WorkshopManagerService.ts` | Serializes management mutations and builds path-free renderer snapshots. |
| `src/main/workshop/getWorkshopManagerService.ts` | Main-owned runtime assembly over the Steam source, Registry, installer, activation and reconcile services. |
| `src/main/workshop/WorkshopRegistryTypes.ts` | Registry state, revision and persistence contracts. |
| `src/main/workshop/WorkshopRegistryCodec.ts` | Fail-closed normalization for persisted registry data and untrusted inputs. |
| `src/main/workshop/WorkshopRegistry.ts` | Atomic persistence and explicit state transitions, including approved capabilities and rollback metadata. |
| `src/main/workshop/WorkshopAuthoringService.ts` | Main-owned data-only project templates, production validation, integrity inventory and private SteamCMD test artifacts. |
| `src/renderer/workshop/WorkshopAuthoringWorkbenchModel.ts` | Schema-aware form transforms, deterministic host-event/library fixtures and author preflight checks. |
| `src/renderer/workshop/WorkshopAuthoringWorkbench.tsx` | In-app structured editor, fixture switcher and release-readiness report. |
| `src/main/workshop/WorkshopAuthoringPublisher.ts` | CLI-only private Steamworks create/update path with explicit rights confirmation, exact tags and durable PublishedFileID recording. |
| `src/main/workshop/WorkshopPluginService.ts` | Revalidates `.echo` packages, enforces the Workshop permission subset, activates exact approvals and resolves enabled text assets. |
| `src/main/workshop/WorkshopPluginBridgeScript.ts` | Injects the versioned command, Agent, source-provider, lyrics-provider, settings, direct-source, event, navigation, playback, spectrum, library, queue, storage and notification API into opaque plugin frames. |
| `src/main/integrations/steam/SteamWorkshopService.ts` | Main-process-only adapter over the Steamworks Workshop API. |
| `src/main/integrations/steam/SteamCapabilityServices.ts` | Owns the Workshop adapter beside the other isolated Steam capabilities. |
| `src/main/ipc/workshopIpc.ts` | Focused typed registrar for management commands; it starts background reconciliation. |
| `src/preload/ipc/workshopApi.ts` | Minimal Workshop control surface without filesystem or Steamworks objects. |
| `src/renderer/pages/WorkshopPage.tsx` | Discover and installed management UI for browse, subscribe, refresh, repair, one-click use, enable, apply and disable. |
| `src/renderer/workshop/WorkshopLyricsSceneRenderer.tsx` | Renderer-only scene composer over trusted track, lyrics, clock, spectrum and packaged raster slots. |
| `src/renderer/components/home/HomeSignalVisualizer.tsx` | Home visualizer presentation over Audio Core spectrum; Workshop presets change bars/wave/radial styling only. |
| `src/main/protocol/workshopAssetProtocol.ts` | `echo-workshop://` handler for owned rasters, CSP-constrained UI runtime files and Steam CDN preview proxying. |
| `src/renderer/workshop/WorkshopUiRuntimeHost.tsx` | Opaque iframe host, capability-checked message bridge, sanitized playback state and emergency exit. |
| `src/renderer/workshop/WorkshopPluginHost.tsx` | Runs enabled background frames, checks every host action, exposes declared commands/panels/Agents/settings/source and lyrics providers, asks for per-origin direct-source approval and owns host close/runner UI. |
| `src/renderer/workshop/WorkshopSourceProviderRuntime.ts` | Bounds source searches and strips every result or playback field outside the Workshop provider contract. |
| `src/renderer/workshop/WorkshopSourceProviderDialog.tsx` | Provides the host-owned search, result and play surface for declared Workshop source catalogs. |
| `src/renderer/workshop/WorkshopLyricsSourcePicker.tsx` | Lets the user select a ready Workshop lyrics provider, sends sanitized current-track metadata, and applies a chosen bounded LRC/text result through the typed lyrics API. |
| `src/renderer/workshop/WorkshopLyricsThemePicker.tsx` | Switches explicitly between ECHO's built-in lyrics layout and enabled validated Workshop lyrics scenes. |
| `src/renderer/workshop/WorkshopPluginSettingsDialog.tsx` | Renders bounded author-declared fields in host UI; plug-ins cannot replace or conceal the settings surface. |
| `src/renderer/workshop/WorkshopPluginStorage.ts` | Isolates private state and validated declarative settings by Workshop plug-in without exposing arbitrary files or app settings. |
| `src/renderer/workshop/WorkshopPluginMediaBridge.ts` | Sanitizes structured library results and routes navigation, local-playlist, direct-stream and queue requests to existing renderer owners. |
| `docs/ECHO_WORKSHOP_THEME_SKIN_SCHEMA.md` | Declarative whole-chrome skins plus the optional full UI runtime contract. |

## Security and architecture invariants

- No Workshop object, install path, or Steamworks client is exposed to renderer code.
- Downloaded content is never enabled automatically.
- Startup reconciliation may recover a verified staged revision to `disabled`, but never to `enabled`.
- Re-ingesting an installed update returns the item to `disabled`; update synchronization is never treated as activation.
- Renderer snapshots contain no install directory, manifest path, Steamworks client or raw contribution payload.
- Management mutations are serialized in main; renderer only issues commands and displays returned state.
- Enabling a contribution only makes it available. Theme, lyrics, visualizer and DSP state changes still require an explicit apply command; the renderer **使用** button runs ingest → enable → apply. If Steam still needs to download the item, **使用** starts that download and continues the same command when the install is ready. Subscribe and background downloads still never auto-enable.
- Every apply command rechecks an enabled Registry record and an exact matching catalog revision; the catalog is never accepted as activation truth by itself.
- Workshop themes are stored as stable isolated custom themes, so applying one does not overwrite user overrides for a built-in preset. A declarative **skin** remains no-code. An optional **runtime** may provide hashed packaged HTML/CSS/JavaScript and fully replace the visible UI through `echo-workshop://ui/`.
- Theme runtime executes only in `sandbox="allow-scripts"` without same-origin authority. It receives no preload, Node, filesystem, Steamworks, raw `window.echo`, external network, media or child-frame access. The host exposes only declared navigation, playback, sanitized library/favorite, queue and window capabilities through versioned `postMessage`; local paths are stripped, playback still routes through `PlaybackQueueProvider` and Audio Core, commands are rate-limited, and the host retains an unhideable exit button plus main-process `Ctrl+Shift+F12` interception.
- Workshop lyrics application can write only the already validated lyrics settings whitelist and may select one validated scene receipt transactionally.
- A scene selection is active only while its exact Registry revision remains enabled. Disable/re-enable does not silently reactivate an old selection; the user must apply it again.
- Scene authors can rebuild the entire lyrics layout through groups, trusted data slots, packaged raster `image` nodes, decorations, responsive overrides and bounded motion. They cannot inject HTML, JavaScript, raw stylesheets, SVG, filesystem paths or external asset URLs.
- Track metadata, cover, lyrics, translation, progress, playback state and spectrum are injected by ECHO. Workshop content never becomes a playback clock or audio telemetry owner.
- Workshop plug-in lyrics providers receive only title, artist, album, duration and an optional user query. Results are bounded, selected by the user and applied through the existing main-owned lyrics service; no file path, audio bytes or direct renderer mutation is exposed.
- Workshop metadata and cover providers receive only sanitized track identity and display metadata. The host aggregates bounded candidates in the existing single-track tag editor; selecting a candidate only stages form fields or an HTTP(S) cover URL, while the existing library save path remains responsible for validation, download and persistence.
- Workshop plug-in theme presets are validated as bounded declarative light/dark overrides and surfaced through the existing Appearance editor. Importing creates or refreshes a stable user-owned custom-theme copy; the plug-in never becomes the active-theme owner and receives no runtime capability from this contribution.
- Workshop source providers receive only a bounded query or opaque provider track id. Search results are sanitized, playback resolution may return only a direct URL plus display metadata, and the user-triggered result still passes through per-origin confirmation and the existing queue/Audio Core path. `sources:provide` alone grants no network access; a remote catalog must separately request `network:request`.
- Workshop `network:request` calls only exact outer-manifest hostnames after capability approval. Main owns GET/POST execution, redirect revalidation, proxy use, timeouts, body/header limits and concurrency; the frame receives no browser cookies, Steam identity, local paths, automatic credentials, raw socket, WebSocket or unrestricted fetch surface.
- Workshop DSP application saves the normalized preset through the existing DSP control path and resolves only after the target preset is confirmed; failures are surfaced and preset persistence is rolled back where possible.
- Visualizer presets apply as a revision receipt and restyle the existing Home visualizer. They never create a second analyser or redefine Audio Core telemetry.
- In-app discovery uses Steamworks `getAllItems` / `subscribe` / `unsubscribe` in main. Renderer snapshots contain item id, title, truncated description, tags, votes, subscription counts and a proxied preview URL only. Banned items are dropped. Preview bytes are fetched by main after Steam CDN host checks; the overlay may open `https://steamcommunity.com/sharedfiles/filedetails/?id=...`.
- Packaged images are limited to declared `.png` / `.jpg` / `.jpeg` / `.webp` files (max 16, 2 MB each). SVG is rejected. The renderer only receives `echo-workshop://` URLs.
- An unreadable registry remains untouched and becomes read-only until repaired explicitly.
- Registry transitions are explicit; detected content cannot jump directly to enabled.
- Concurrent ingestion for the same source item shares one in-flight operation.
- Installed paths are derived from a hashed source/item key plus normalized content identity; untrusted IDs never become raw directory segments.
- The owned install store cannot overlap the untrusted source tree.
- Existing content-addressed destinations are revalidated and never overwritten when corrupted.
- A crash after the Registry records `staged` resumes by revalidating that exact owned revision before moving to `disabled`.
- Non-plugin Workshop content cannot declare network hosts, including UI runtime themes.
- Data activation always revalidates the installed revision and cross-checks the inner entry `id` with the outer manifest `id`.
- Theme entries cannot use `nyanCat`, `darkSideMoon`, or `FINAL` as a base preset to bypass product entitlement.
- Lyrics entries cannot provide font files, wallpaper paths, HTML, JavaScript, raw stylesheets or arbitrary settings keys. The declarative scene graph accepts only normalized style properties and safe values.
- Visualizer entries contain renderer presentation parameters only; they do not synthesize audio or redefine spectrum telemetry.
- DSP entries become bounded EQ preset data only. Applying them uses the existing typed DSP bridge/Audio Core path and never calls AudioSession or native host from renderer code.
- Audio plug-in profile entries are binary-free dependency descriptions. They may identify a subscriber-installed VST3 effect or VST3i instrument by 128-bit Class ID and carry bounded normalized parameter maps and presets. They never contain, download or load a DLL; activation only registers the profile, while an optional Audio Core adapter remains responsible for matching the local plug-in and reporting real processing state.
- Enabling or disabling updates the data catalog and Registry transactionally; a failed Registry transition restores the previous catalog record.
- The data catalog is not activation truth by itself; consumers must also require an enabled Registry record with the same manifest SHA-256.
- An unreadable data catalog is preserved and becomes read-only instead of being reset.
- Code-bearing content runs only in dedicated opaque iframes. `.echo` plugins require an exact per-revision capability confirmation and can expose only declared commands and panels. Navigation, spectrum, structured library reads, favorite/local-playlist writes and queue orchestration are separately grantable capabilities.
- Declared plug-in commands can be surfaced as bounded single-track context actions or host-rendered player-bar buttons. Both remain disabled until the exact command registers and both invoke the same timed sandbox command path; presentation placement never adds a capability.
- Sandboxed panels may select `main`, `utility`, `sidebar`, `home`, `lyrics`, `queue`, `track-detail` or `player`. Non-modal slots are host-rendered launch surfaces; opening one still uses the same opaque panel frame and host-owned close control. Subscribers can independently hide, pin and reorder every declared contribution without disabling the whole package.
- Native executables, DLLs, Node addons and command scripts are rejected.
- Workshop code never owns playback, decoder, DSP, device, queue, or completion truth. `sources:direct` creates only a temporary host queue item after per-origin confirmation.
- `playback:share` restores the listen-together compatibility surface without exposing a local path: main reads AudioSession truth, streams the current file only after a per-upload confirmation, enforces the outer manifest host allowlist, and returns a plugin-isolated task plus final playback URL.
- `agent:runtime` runs author handlers in the same opaque frame. It adds no model credential or implicit network authority; an Agent can compose only capabilities approved for its plug-in.
- Declared plug-in settings are stored under a host-reserved namespace and surfaced through `echo.settings`; only string, number, boolean and select fields are accepted. Secret fields are rejected and values never enter global ECHO settings.
- Plugin playback actions must continue through permission-checked host actions; Audio Core and native host remain authoritative.
- A failed Registry write before `staged` rolls back only the newly created owned directory. Once `staged` is durable, the directory is retained for safe resume.
- Previous installed revisions are not deleted during ingestion; Registry last-known-good metadata remains available for future activation rollback.
- Public publishing must remain separate from consumption and requires an explicit rights, moderation, deletion, reporting and privacy design. The CLI-only private uploader is not exposed through renderer or preload.

## Outbound hosts for Workshop

Static hosts are used for Workshop discovery previews and the Steam overlay item page. Enabled plug-ins may additionally call the exact hostnames in their own validated `networkHosts` list only after the subscriber approves `network:request`. None of these paths restore platform login, Cookie import, downloaders or remote config:

| Host pattern | Purpose | Close / avoid |
| --- | --- | --- |
| `*.steamstatic.com`, `*.steamusercontent.com`, Steam `*.akamaihd.net` | Main-process preview image fetch after host checks | Unsubscribe or leave Discover; renderer never fetches arbitrary URLs |
| `steamcommunity.com/sharedfiles/filedetails/` | Overlay item page | Overlay is user-initiated “在 Steam 中查看” |
| Per-item exact `networkHosts` entries | Main-process bounded GET/POST for an author-described catalog, Webhook, lyrics source or Agent service; transmitted fields are chosen by plug-in code and must be disclosed by its author | Deny capability approval or disable the plug-in; no Cookie, Steam identity, local path or automatic credential is attached |

## Next modules, in order

1. Public publishing only after Steamworks configuration, content rights, moderation, deletion, reporting and privacy governance are ready.
2. Add the optional Audio Core audio-plug-in adapter contract and process-isolated host; Workshop profiles must remain useful dependency/mapping data and must not become a native-binary distribution channel.
3. Expand the Workshop plugin API only through reviewed capability additions; unrestricted networking, credential vaults, native code and new write surfaces require their own governance and release audit. Remote-model connectors must stay inside `network:request` quotas and declared-host approval unless a separately reviewed capability is introduced.

Do not remove the existing Steam distribution checks merely to expose unfinished Workshop or plugin surfaces. Change the assembly boundary only when the corresponding runtime, permission, artifact and moderation checks exist.
