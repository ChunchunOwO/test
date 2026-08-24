# ECHO Steamworks integration

## Runtime boundaries

- `SteamRuntimeService` is the only owner of the `steamworks.js` client.
- Packaged releases use the numeric App ID embedded from `ECHO_STEAM_RELEASE_APP_ID` during the main-process build.
- Packaged releases ignore the development-only `ECHO_STEAM_APP_ID` runtime variable.
- Renderer code receives typed status through preload IPC and never receives Steam IDs, auth tickets, or the raw SDK client.
- Presence, achievements, Cloud profile storage, and DLC checks remain main-process services.
- Pro ownership uses the build-time `ECHO_STEAM_PRO_DLC_APP_ID` and Steam `BIsSubscribedApp`; a missing App ID, unavailable Steam client, or unowned DLC all fail closed.
- The Pro DLC is entitlement-only: Pro code ships in the base app, while Remote/Connect routes, Pro themes, and every optional signal-altering audio-processing control stay hidden and their IPC calls stay blocked until ownership is verified. This includes ReplayGain, headroom, EQ, dynamics, stereo/channel tools, headphone and room correction, protection limiting, PCM dither, ECHO SRC, and PCM-to-DSD (SDM). Window acrylic, DSD file decoding, and DoP/native DSD passthrough remain available without Pro because they are base-edition appearance or playback/output capabilities rather than optional processing. See [steam-pro-dlc.md](./steam-pro-dlc.md) for the customer-facing entitlement matrix and release acceptance checks.
- Steam entitlement state is not audio-backend truth. DSP entitlement reconciles through `AudioEntitlementRuntime` before the native host applies capabilities.

## Configure Steam Cloud settings sync

ECHO stores one versioned Remote Storage file, `echo-steam-settings-v1.json`. It contains a SHA-256-checked snapshot of portable application preferences. On startup, ECHO compares the cloud snapshot with the local settings timestamp and applies the newer side. After a local settings change, writes are debounced for 1.2 seconds. Settings > About > Steamworks also provides explicit upload and download actions.

If Steam initializes after ECHO or a Remote Storage write fails transiently, startup reconciliation and automatic uploads retry after 5 seconds, 15 seconds, 1 minute, and then every 5 minutes. A newer local settings change supersedes an older queued retry. The typed status surface reports the current state, last attempt, last success, retry count, and next retry time; it never exposes the Remote Storage client or the snapshot payload to Renderer code.

The cloud projection intentionally excludes machine-local or sensitive values: audio device identity, hidden device keys, window bounds, local wallpaper/font/cache/backup paths, launch-at-login and safe-mode state, proxy settings, MQTT/ECHO Link/HQPlayer/Spotify/Tidal endpoints, entitlement flags, passwords, tokens, cookies, authorization/session data, and device or machine identifiers. Downloading a snapshot applies only the portable patch, so the destination computer keeps its own hardware and paths.

The implementation uses the Steamworks Remote Storage API, not Auto-Cloud. In each App ID's Steam Cloud settings:

- Set a non-zero byte quota and file-count quota. ECHO currently uses 100 MB and 100 files so the main App ID also has room for Workshop preview storage.
- Leave Auto-Cloud root paths empty; the app writes the versioned file through `steamworks.js`.
- Leave Dynamic Cloud Sync disabled until ECHO handles mid-session remote-file change notifications.
- Disable developer-only Cloud before public release so ordinary customers can use it.
- Publish the Steamworks metadata change after saving. Saving the page alone does not activate the quota.

The main App ID and Playtest App ID have separate Cloud namespaces unless a shared Cloud App ID is configured. Do not enable shared storage while either side is unpublished; test each App ID independently and reconsider sharing after both publication states support it.

### Steam Cloud remote handoff — 2026-08-15

- App ID `5105090` (ECHO): Remote Storage quota is 100,000,000 bytes and 100 files. Developer-only Cloud is disabled; Dynamic Cloud Sync is disabled; Auto-Cloud paths are empty; shared Cloud App ID is `0`. The inspected `ufs` change was published successfully. Because the app is not yet released, Steamworks reports that this metadata is currently available only to accounts with a release-status-override package.
- App ID `5105150` (ECHO Playtest): Remote Storage quota is 104,857,600 bytes and 100 files. Developer-only Cloud is disabled; Dynamic Cloud Sync is disabled; Auto-Cloud paths are empty; shared Cloud App ID is `0`. The authoritative history shows the `ufs` Cloud section and the `extended` section were published on 2026-08-13. The only pending Playtest metadata as of this handoff is `common` revision 3, whose inspected diff changes the client and application icon hashes; it is unrelated to Cloud and remains unpublished pending separate approval.
- The code schema is `echo-steam-settings-v1.json`. It synchronizes only the allowlisted portable settings described above and keeps machine-local, hardware, path, credential, entitlement, and session state out of Steam Cloud.
- Focused Cloud/IPC/UI tests, the Electron bundle build, Steam distribution boundary check, and oversized-file growth check passed. Full repository typecheck remains blocked by unrelated pre-existing errors outside this Steam Cloud change set.
- No real two-machine or two-account Steam Cloud smoke has been completed. Do not treat the successful metadata publication or local Remote Storage calls as proof that conflict resolution and cross-machine download work in the released Steam client.

### Steam client icon upload handoff — 2026-08-15

- App IDs `5105090` (ECHO) and `5105150` (ECHO Playtest) both accepted a new shortcut icon upload and a new 184 x 184 application icon upload. All four uploads returned Steamworks' success message; no metadata publication was performed in this step.
- The shortcut upload used `build-resources/icons/echo-app-icon.ico` (SHA-256 `A34BB932E1F5290DE6151A3E2B6F54AD3B5137D9CCE7213E107013351F15BF04`), matching the pre-v2 transparent `software.ico` treatment. Its corresponding local PNG is `build-resources/icons/echo-app-icon.png` (SHA-256 `9CA9B620BEEBC09D0EF23B8BFF22CA129B36320FA831319FC89AB6888A1AB240`).
- The application icon upload used `build-resources/steam/app-icon-184.jpg` (SHA-256 `DB8F0FFB34CAF64671EF09677EB16F9B7127BF290F60F9AA3AE5047C00DF89B9`), an opaque full-bleed square composition designed for Steam's compact list slot.
- `Upload shortcut icon and convert to app icon` was explicitly disabled for both App IDs before uploading the shortcut, so the shortcut artwork does not overwrite the separately uploaded application icon.
- Both apps still report unpublished metadata changes. Before publishing, inspect the authoritative pending `common` diff for each App ID and stop if any section outside the understood client/application icon hashes is present. The current download links can continue to show the previously published hashes until the pending metadata is published, so upload success alone is not proof of the live Steam client result.
- Later on 2026-08-15, only App ID `5105090` received a replacement application icon based on `build-resources/icons/echo-app-icon-concepts/echo-steam-square-integrated-v3.png`. The tracked `build-resources/steam/app-icon-184.jpg` is now the opaque `184 x 184` upload artifact (SHA-256 `A51F49DCAF6C4C05B33C5DF60EFD722DC54FCEB7CDA9612C0567D123ACE64139`). The shortcut icon and Playtest application icon were not changed in this follow-up.
- Steamworks generated `32 x 32`, `64 x 64`, and `184 x 184` previews under application-icon hash `2b26473d852e8b5964b7d0356a42ece5141da4ed`. The authoritative pending `common` diff changes `icon` from `fddbed49dab02450d3d97e6ac3330b99ada52e24` to that hash while retaining the separately uploaded `clienticon` hash `6ee29657b744acb19481142d201c3c14cf5c86a4`. No metadata was published; the same pending publish set also contains pre-existing `stats` revision 13, `ogg` revision 2, and an EULA reference in `common` revision 6, so they must not be published as part of this icon-only task.

### English store description handoff — 2026-08-15

- App ID `5105090` (ECHO) received an English `About This App` detailed description matching the already saved Simplified Chinese product description. The existing English short description and the Simplified Chinese detailed description were left unchanged.
- Steamworks returned `Changes saved`, and the release landing page changed the required `Description` checklist row to complete. This verifies only the saved metadata and checklist calculation in the partner account.
- The store metadata was not published in this step. The app already had other unpublished metadata changes, so the authoritative pending diff must still be inspected and separately approved before any publication.

### Localized store short description handoff — 2026-08-15

- App ID `5105090` (ECHO), Store Item ID `1284845`, received localized short descriptions for Simplified Chinese, Traditional Chinese, Japanese, and Korean. The existing English short description was retained unchanged.
- The four localized values are each within Steam's required `200–300` character range: Simplified Chinese `238`, Traditional Chinese `238`, Japanese `270`, and Korean `297` characters.
- After the localization JSON upload, the authoritative all-language JSON was downloaded again and compared semantically with the pre-upload copy. Exactly four fields changed, all at `app[content][short_description]` for those four languages; no other store localization field changed.
- This uploaded and saved store-page localization only. The store page still has unpublished changes; no store publication, App metadata publication, depot upload, or branch change was performed.

### Complete supported-language store localization handoff — 2026-08-15

- App ID `5105090` (ECHO), Store Item ID `1284845`, received the remaining supported-language store copy for English, Simplified Chinese, Traditional Chinese, Japanese, and Korean. Existing short descriptions were retained unchanged.
- Traditional Chinese, Japanese, and Korean each received all six Early Access answers, the full `About This App` description, localized Windows minimum-requirement text, and the special-announcement title and body. Simplified Chinese received localized Windows minimum-requirement text. English received the current developer-led full description and product-focused special-announcement body, replacing the stale Playtest callout; an accidental Chinese full stop in the English Early Access answer was also corrected.
- The authoritative all-language JSON was downloaded immediately after upload. It matched the prepared upload semantically with zero differences and differed from the pre-upload download in exactly `42` intended fields. All required store fields for the five supported interface languages were non-empty. The authoritative post-upload JSON had SHA-256 `7c0f536657b7b7c97ae960bb30fc19d1c63380c9892249d5b99a51c23e2abd58`.
- The release landing page no longer lists Japanese, Korean, or Traditional Chinese store localization as recommended incomplete items. This confirms Steamworks accepted the saved localization and recalculated its checklist; it does not prove public customer visibility.
- This was a store-page draft save only. No store publication, review submission, App metadata publication, depot upload, or branch change was performed.

### Simplified Chinese About-page feature banners — 2026-08-15

- App ID `5105090` (ECHO), Store Item ID `1284845`, received two `1560 x 624` Simplified Chinese custom images: `echo-about-03-audio-control` and `echo-about-04-workshop`.
- The images were inserted into the Simplified Chinese `About This App` description only. The audio-control banner follows the paragraph describing EQ and DSP; the Workshop banner follows the final paragraph. The prepared library and lyrics banners were not uploaded or displayed.
- Steamworks reported both image uploads as successful, loaded both processed assets at their expected dimensions in the editor preview, and returned `Changes saved` after the description update.
- This saved a store-page draft only. The store page continues to report unpublished changes; no metadata publication, store-page release, depot upload, or branch change was performed.
- Later on 2026-08-15, three developer-written Simplified Chinese paragraphs were added at the start of `About This App`, describing the developer as a music and audio-equipment enthusiast, the motivation for ECHO, and the host-backed playback/output-state behavior. Steamworks returned `Changes saved`, and both existing feature banners remained in place.
- The initial store page cannot be published directly yet. Steamworks offers `Mark as ready for review` as the next distinct action and states that Valve approval plus at least two weeks of public `Coming Soon` visibility are required before release. No review submission or store publication was performed in this step.
- The Simplified Chinese special-announcement title and body were rewritten in a more direct developer voice. The adjacent DSP paragraph now states that advanced DSP, ASIO, and exclusive output require some understanding of the user's sound card, driver, and output path; the earlier claim that no audio knowledge was needed was removed. The saved beta preview showed the new title, body, and threshold wording.
- The bottom of the Simplified Chinese `About This App` description now includes an `ECHO Pro` section that identifies the complete audio-processing workbench, Connect, and remote/cloud libraries as advanced DLC capabilities, while explicitly telling local-library listeners that they do not need Pro. The first save used unsupported `[h3]` headings; all four were replaced with `[h2]`, Steamworks returned `Changes saved`, and the `beta=1` store preview rendered all five headings without exposing raw BBCode. This changed only the saved store-page draft; no review submission or publication was performed.
- Store Item ID `1284845` no longer lists Playtest App ID `5105150` as downloadable content. Pro DLC App ID `5105160` remains in the downloadable-content display list. This was a saved store-page change only; the store page was not submitted for review or published.
- Base sales package `1768456` and Pro package `1768477` both have active prices: USD `$5.99` and CNY `¥39.00`, with the remaining currencies populated by Steam's multivariable conversion. The previous Pro proposal of USD `$6.99` and CNY `¥49.00` was cancelled and replaced by this price set.
- Automatic price publication remains disabled. The current price set is live, but no App metadata publication, depot upload, beta-branch change, or store-page review submission was performed as part of the Pro information work below.

### ECHO Pro store information handoff — 2026-08-15

- App ID `5105160` (ECHO Pro), Store Item ID `1284859`, package `1768477`, remains an entitlement-only DLC with no separate depot. Its saved store draft now identifies developer `Moekotori` and publisher `Moe Shop`, uses privacy URL `https://echonext.moe/en/privacy/steam/`, and provides the existing GitHub support URL plus `nyafairy233@gmail.com`.
- English, Simplified Chinese, Traditional Chinese, Japanese, and Korean are marked as interface-only languages. The incorrect full-audio and subtitle flags for English, Japanese, and Korean were removed. Five tags were copied from the base application.
- All five languages received detailed and short customer-facing entitlement copy. It states that every optional signal-altering audio-processing feature belongs to Pro, names the major processing groups, and separately states that DSD file playback, DoP, and supported ASIO Native DSD passthrough remain in the base edition.
- The five short descriptions are within Steam's `200–300` character requirement: English `295`, Simplified Chinese `221`, Traditional Chinese `221`, Japanese `276`, and Korean `300` characters. An authoritative all-language JSON downloaded after upload matched the prepared draft semantically with zero differences and differed from the pre-upload download in exactly those five short-description fields. Its SHA-256 is `aede2eafbf4675f3fff602889cf7a52dc50cb4d97f882850d42d75fa4840e0ce`.
- The planned Pro release time is aligned with the base application at `2026-09-08 21:20` (Asia/Hong_Kong). The public-facing precision remains month-only (`2026年9月`).
- Steamworks accepted these as saved store-page draft changes. No review submission, store-page publication, App metadata publication, depot upload, or branch change was performed. The optional accessibility questionnaire remains incomplete because it requires a separate evidence-based product audit rather than copied or assumed answers.

## Consumer EULA

The consumer EULA is maintained separately from the Privacy Policy, `THIRD_PARTY_NOTICES.md`, and the source-available `LICENSE`:

- Public English URL: <https://echonext.moe/en/eula/steam/>
- Public Chinese localization: <https://echonext.moe/zh/eula/steam/>
- Auditable repository copy: [`EULA.md`](../EULA.md)

The EULA covers the consumer license grant, lawful-use restrictions, local media responsibility, Steamworks dependencies, purchases and refunds, Pro DLC entitlement, Steam Cloud, Workshop content, updates, third-party licenses, audio safety, mandatory consumer rights, warranty boundaries, liability, and termination. It deliberately does not invent a private legal name, company, address, or exclusive jurisdiction; the public project identity is Moekotori and the contact address is `nyafairy233@gmail.com`.

### EULA handoff — 2026-08-15

- The localized website pages were deployed from ECHOPage commit `677d2e3` and the English and Simplified Chinese URLs returned the expected EULA title, App ID `5105090`, and version `1.0` in a live check.
- Steamworks EULA ID `5105090_eula_0` was created for the global region and saved with the complete English and Simplified Chinese titles and sixteen-section texts. The saved fields were read back and matched the prepared BBCode text.
- The independent EULA publish action returned `Successfully published changes!`, and the EULA list no longer reports unpublished EULA content. This published only EULA ID `5105090_eula_0`; it did not publish App metadata.
- The public Steam EULA URL still returned `There was an error loading the content of this EULA` after the EULA publication. The App-level EULA reference remains inside the pending `common` metadata, so do not claim that Steam installation/store presentation is active until the App metadata is published and the public page is rechecked.
- The App publish diff still includes unrelated `stats` revision 13, `common` revision 6 (the EULA reference plus pre-existing icon changes), and `ogg` revision 2 changes. No App metadata was published; inspect and separately approve every included section before publication.

## Privacy policy URL

The Steam-specific Privacy Policy is maintained separately from the consumer EULA, `THIRD_PARTY_NOTICES.md`, and the source-available `LICENSE`:

- Public English URL for the Steamworks **Privacy Policy URL** field: <https://echonext.moe/en/privacy/steam/>
- Public Chinese localization: <https://echonext.moe/zh/privacy/steam/>
- Auditable repository copy: [`PRIVACY.md`](../PRIVACY.md)

The policy covers local library data, the allowlisted Steam Cloud settings projection, default and optional Rich Presence fields, achievements, opt-in stats and leaderboards, Workshop interactions, user-configured remote libraries, optional network integrations, and local-first diagnostics.

### Privacy policy handoff — 2026-08-15

- Target App ID is `5105090` (ECHO), not Playtest App ID `5105150`.
- The localized website pages were deployed and the English URL returned the expected ECHO Steam policy, App ID, and 2026-08-15 update date in a live browser check.
- Store Item ID `1284845` now has **Privacy Policy URL** set to `https://echonext.moe/en/privacy/steam/`. Steamworks returned `Changes saved`, and the field value was read back after navigation.
- This action saved the store-page draft only. The page already reported other unpublished store changes before the privacy edit; none of those changes were published as part of this task.
- Before any later store publication, inspect the complete pending store state and confirm every included change. Do not assume the privacy save authorizes unrelated description, asset, system-requirement, localization, package, depot, or App metadata publication.

## Steam launch language

When Steamworks is available, ECHO reads the language selected in Steam Properties at startup after Steam Cloud settings reconciliation. The supported Steam language names map as follows: `english` -> `en-US`, `schinese` -> `zh-CN`, `tchinese` -> `zh-TW`, `japanese` -> `ja-JP`, and `koreana` -> `ko-KR`. Unsupported Steam languages leave the existing ECHO language unchanged. Non-Steam launches continue to use ECHO's saved language or the system-language default.

Changing the language in Steam Properties takes effect on the next ECHO launch. This behavior must be verified from a real Steam client because unit and bundle tests cannot prove the selected Steam language reaches the packaged app.

### Steam language build handoff — 2026-08-15

- A Windows x64 Steam loose depot was built from commit `ab189a6c223a7bf9ef55cb6d35f1cfe820c583b9` for release App ID `5105090`, content depot `5105091`, and Pro DLC configuration `5105160`. Focused language tests, typecheck, bundle budgets, Steam distribution checks, final artifact audit, third-party notices, VC++ runtime verification, and release preflight passed. The Steam depot was unsigned because no code-signing publisher was configured; Steam depot signing is optional in the current release tooling.
- SteamCMD uploaded depot manifest `1411704781410821422`; the authoritative Steamworks Builds page confirmed BuildID `24750884` with depot `5105091`. SteamCMD then failed while trying to set the nonexistent `qa-private` branch live. The build exists in Steamworks but is not assigned to any branch.
- The only configured application branch at handoff time was `default`, still on BuildID `24748933`. No default/public promotion, App metadata publication, store publication, or real-client language/playback smoke was performed.

### Formal default-branch update handoff — 2026-08-16

- A fresh Windows x64 Steam loose depot was built from clean `main` commit `2de03447613e6303ddcbe230ecb39f381c6ae496`, version `26.8.15`, for release App ID `5105090`, content depot `5105091`, and Pro DLC configuration `5105160`. Typecheck, bundle budgets, VC++ runtime verification, AirPlay package smoke, Steam distribution checks, final artifact audit, third-party notices, oversized-file growth check, and release preflight passed.
- The preflight recorded 324 files and 619,083,283 bytes with a complete SHA-256 manifest. No code-signing publisher was configured, so the application binaries remain unsigned under the repository's optional Steam depot signing policy.
- The first SteamCMD submission uploaded depot manifest `1491555168471452037` and produced BuildID `24758546`, but its requested `SetLive` operation failed because the `qa-private` branch did not exist. It did not change `default`.
- After the user explicitly requested a direct formal update, the same audited content was submitted without automatic branch assignment. SteamCMD successfully created BuildID `24758577`; the authoritative Builds page associated it with depot `5105091` and manifest `743971862810307440`.
- The Steamworks branch preview showed `default` changing only from BuildID `24748933` to `24758577`, with an estimated 11.3 MB client update. The user explicitly approved the public/default promotion, and the authoritative Builds page now reports BuildID `24758577` as the current `default` build.
- No App metadata or store-page draft was published during this depot operation. A real Steam-client smoke for launch, ownership, Overlay, Cloud settings sync, local import/playback, pause/resume, seek, track change, and exit remains required; the build and static audits do not prove those client behaviors.

### Corrected formal default-branch update handoff — 2026-08-17

- A corrected Windows x64 Steam loose depot was built from clean commit `c1902ebae87a5cf3cf7dc01a425a440ddfdce541`, version `26.8.15`, for release App ID `5105090`, content depot `5105091`, and Pro DLC configuration `5105160`. VC++ runtime verification, the packaged AirPlay helper smoke, Steam distribution checks, final artifact audit, third-party notices, oversized-file growth checks, and release preflight passed.
- The preflight recorded 429 files and 620,123,644 bytes with a complete SHA-256 manifest. No code-signing publisher was configured, so the application binaries remain unsigned under the repository's optional Steam depot signing policy.
- The first SteamCMD submission uploaded depot manifest `1427690506322384561` and created BuildID `24763271`, but automatic assignment to the nonexistent `qa-private` branch failed. A second submission without automatic branch assignment created BuildID `24763278` with depot manifest `8749546981431144791`.
- The Steamworks preview showed `default` changing only from BuildID `24758577` to `24763278`, with manifest `743971862810307440` changing to `8749546981431144791` and an estimated 12.4 MB client update. The user explicitly confirmed the formal promotion, and the authoritative Builds page and build history now report BuildID `24763278` as the current `default` build.
- No App metadata or store-page draft was published during this depot operation. A real Steam-client smoke for launch, ownership, Overlay, Cloud settings sync, local import/playback, pause/resume, seek, track change, and exit remains required; the build and static audits do not prove those client behaviors.

### Formal depot upload handoff — 2026-08-17

- A Windows x64 Steam loose depot was built from clean local release commit `7bb4aaa2b0cbc2fc7dc8db045244fe4d74efbf87`, version `26.8.15`, for release App ID `5105090`, content depot `5105091`, and Pro DLC configuration `5105160`. The release commit removes production-only route-switch console diagnostics to restore the App shell bundle budget and also removes committed conflict markers from this handoff document; it has not been pushed to `origin/main` at this handoff.
- Typecheck, all bundle budgets, VC++ runtime verification, packaged AirPlay helper smoke, Steam distribution checks, final artifact audit, third-party notices, oversized-file growth checks, and the fail-closed release preflight passed. The preflight recorded 321 files and 619,513,006 bytes; the complete artifact manifest SHA-256 is `3CC4E913614DBE395641E85ECFF95E2242F8949BF333F6FC0698A04212344F79`. No code-signing publisher was configured, so the application binaries remain unsigned under the repository's optional Steam depot signing policy.
- The packaged native Audio Host passed cold-open local WAV playback, explicit stop, and lifecycle shutdown smoke scenarios. These checks exercised the binary inside `dist/win-unpacked`; they do not prove Steam client, Overlay, Cloud, ownership, or real-device behavior.
- SteamCMD successfully created BuildID `24770415` with depot manifest `4577818941893706704`, based on manifest `8749546981431144791`. The submitted AppBuild used `Preview "0"` and contained no `SetLive`, so the upload did not request a branch assignment or change `default`; the last documented authoritative `default` remains BuildID `24763278` pending a fresh Steamworks readback.
- No App metadata, store-page draft, Workshop item, or branch assignment was published during this depot upload. Assigning BuildID `24770415` to `default` remains a separate explicit action and requires the real Steam-client acceptance pass described below.

### Latest formal depot upload handoff — 2026-08-17

- A Windows x64 Steam loose depot was built from clean `main` commit `6dd4857037e2eda4090392819504d9dd4c194907`, version `26.8.15`, for release App ID `5105090`, content depot `5105091`, and Pro DLC configuration `5105160`. At build start, `main` was synchronized with `origin/main`; the release was produced in an isolated detached worktree with repository Node `22.23.2` and npm `10.9.8`.
- Typecheck, all bundle budgets, VC++ runtime verification, packaged AirPlay helper smoke, Steam distribution checks, final artifact audit, third-party notices, oversized-file growth checks, and the fail-closed release preflight passed. The upload-time preflight recorded 448 files and 620,688,076 bytes; the complete artifact manifest SHA-256 is `26573F08175C6EDA5E02A4AB2E7CBD30722FE747C8B590010947D778EE461A9F`. No code-signing publisher was configured, so the application binaries remain unsigned under the repository's optional Steam depot signing policy.
- SteamCMD successfully created BuildID `24771652` with depot manifest `4254239153730050137`, based on manifest `8749546981431144791`. The authoritative Steamworks Builds page independently confirmed BuildID `24771652`, Depot `5105091`, and the same manifest ID.
- The submitted AppBuild used `Preview "0"` and contained no `SetLive`. The authoritative Builds page therefore shows BuildID `24771652` unassigned while `default` remains BuildID `24763278`; no branch, App metadata, store-page draft, or Workshop item changed during this upload.
- A real Steam-client smoke for launch, ownership, Overlay, Cloud settings sync, local import/playback, pause/resume, seek, track change, and exit remains required before promoting this build to `default`. Branch assignment is a separate explicit action.

## Default and opt-in policy

- Default/automatic when available: allowlisted Steam Cloud settings reconciliation, detailed Steam Rich Presence, the six integer achievement-progress stats, and the two extended personal stats.
- User-configurable in Settings: Rich Presence mode and individual detail fields, extended personal stats, Steam leaderboards, Discord Rich Presence, and Last.fm. Leaderboards, Discord Rich Presence, and Last.fm are off by default; enabling leaderboards requires an account-linkage and public-rank confirmation.
- Explicit-use only: Workshop content is never automatically enabled or applied. Steam Cloud availability follows the Steam client setting; ECHO does not override that platform-level choice.

## Steam Listen Together V1

ECHO provides an explicit-use Steam friends room for up to four listeners. It uses Steam Lobby, invitations, the Rich Presence `connect` join argument, and reliable Steam P2P control packets. The host publishes only host-backed playback state and sanitized title/artist/album metadata; guests strictly resolve a matching file from their own local libraries before following play, pause, seek, stop, and track changes. Local paths, library IDs, device details, cover art, lyrics, file bytes, and audio are never sent.

The implementation and real-client acceptance boundary are documented in [steam-listen-together-v1.md](./steam-listen-together-v1.md). The older [steam-listen-together-transport-probe.md](./steam-listen-together-transport-probe.md) remains a separately gated synthetic transport experiment and is not the product room.

## Configure Rich Presence

ECHO publishes detailed title, artist, album, and 15-second progress Rich Presence by default. Friends-list copy is short and listening-oriented (`Starlight — ECHO`, `Paused ·`, `Cueing ·`) rather than a debug-style `Playing:` dump. The fallback `status` string and settings text preview follow the app locale; Steam friends still see `steam_display` tokens localized by the Steam client language after the VDF is uploaded. Details use a middle-dot separator. Optional stable context fields are off by default: the first library genre tag and shuffle/repeat state. Privacy and idle states use short room/library lines, with a midnight easter egg (`Listening after midnight`) between 00:00 and 04:59 local time. Settings > Steam Settings provides three instant presets: Music (full track context), Minimal (title and artist only), and Privacy (metadata-free ECHO activity). Album, progress, genre, and playback-order visibility can be controlled independently where applicable. Playing, loading, paused, idle, and library states use distinct copy.

Turning Rich Presence off immediately clears every ECHO key. The formatter only consumes typed Audio Core status fields. Device names, device IDs, local file paths, credentials, and raw backend labels are never published or used as metadata fallbacks.

The Integrations page also shows typed Steamworks connection diagnostics, the sanitized submitted-text preview, local submission state, the last submission time, and a safe retry message after failed writes. Submission means the app called the local Steamworks wrapper without an exception; it does not prove that a remote friend client rendered the text. The page refreshes every 15 seconds and can be refreshed manually; raw Steam clients, tickets, credentials, and local paths never cross preload IPC.

Upload `docs/steam-rich-presence-localization.vdf` in the Steamworks Community Rich Presence configuration for the release App ID, then publish the configuration. The `steam_display` values used by the app reference the tokens in that file; without the uploaded configuration Steam may only show the raw fallback `status` string. Re-upload after copy changes so friends see localized listening lines and the `#Status_PlayingLocalMusicNight` token instead of a raw token name.

Before release, test playing, paused, track changes, missing metadata, disabling the setting, and exiting through a real Steam client account. Confirm that disabling and exiting remove the status, and that no local path appears when tags are absent.

## Configure Steam leaderboards

ECHO uses five fixed opt-in boards for listening time, completed tracks, longest completion streak, longest listening session, and rediscovered tracks. Their scores and integer-only detail summaries come from aggregate local playback history, while board handles, Steam IDs, and score submission stay in main/native code. Renderer IPC accepts only fixed board IDs and read scopes. Participation is off by default, exposed in Settings > Steam Settings and on the History page, and excluded from Steam Cloud settings. Enabling it requires confirmation that scores are account-linked and that the public Steam persona and rank may appear.

All five boards are active in App ID `5105090`; Steamworks applies leaderboard changes immediately rather than through the app metadata publication queue. See [steam-leaderboards.md](./steam-leaderboards.md) for their Steam IDs, exact sort/display settings, aggregate detail layout, privacy boundaries, packaging details, and the required two-account smoke.

## Configure personal listening stats

ECHO has a local implementation for eight fixed integer-only Steam Stats: listening minutes, qualified completed plays, unique completed tracks, longest completion streak, night listening minutes, longest listening session, rediscovered tracks, and completed albums. All eight synchronize by default. Settings > Steam Settings lets users disable longest listening session and rediscovered tracks, while the six values mapped to Steam achievement progress continue automatically. All values are account-linked rather than anonymous, excluded from Steam Cloud, and limited to aggregates. Song, artist, album, path, device, timestamp, and per-play data are never submitted.

The remote definitions and achievement progress mappings were published for App ID `5105090` on 2026-08-16. See [steam-listening-stats.md](./steam-listening-stats.md) for the exact fields, privacy boundary, Progress Stat mappings, and real-client acceptance steps. Publication makes the schema available to release-status-override owners while the app remains unreleased; it does not replace the required real-client Stats and Achievement smoke.

### Formal App metadata publication and build-review handoff — 2026-08-16

- The authoritative pending diff contained only `stats` revision 13, `common` revision 6, and `ogg` revision 2. It covered the reviewed Stats/Achievement schema and artwork updates, the client/application icon hashes, the ECHO EULA reference, and the community avatar hash.
- After explicit user approval, those three sections were published for formal App ID `5105090`. Steamworks returned `Your changes have been published`; because the app remains unreleased, Steamworks states that the published metadata is currently limited to owners with a release-status-override package.
- Publishing removed the blocker on the release landing page. The current Windows x64 build on the `default` branch was then marked ready for review, and the landing page now states that the game build is in Valve's review queue. Steamworks reports an expected review time of 3-5 business days, or up to 7 business days when feedback requires changes.
- The store page was already in its separate review queue. Neither metadata publication nor build-review submission releases the app, changes the `default` build, or proves real Steam-client launch, ownership, Overlay, Cloud, local playback, Stats, Achievement, or exit behavior.

### Public Workshop item update handoff — 2026-08-17

- Target: formal ECHO Workshop under AppID `5105090`; this was not a Playtest, Depot, package, App metadata or branch operation.
- Updated existing PublishedFileID `3784584393` in place as `Editorial Record Spectrum`, visibility `0` (public), tag `Lyrics Scene`.
- Updated existing PublishedFileID `3783131921` in place as `Midnight Record Room`, visibility `0` (public), tag `Theme`; this intentionally replaces its former `Lunar Bloom` listing title and publishes validated theme version `1.4.3`.
- Both updates used the current account that already owned the remote items. Steamworks.js returned the expected IDs with `needsToAcceptAgreement=false`; immediate uncached readback confirmed creator/consumer AppID `5105090`, public visibility, expected titles/tags and `banned=false`.
- No new Workshop item, Steam depot, App metadata publication, beta/default branch change or application release occurred. The P0/P1/P2 Workshop host features remain dependent on a later audited ECHO App depot update.

### Public Workshop SDK starter publication — 2026-08-17

- Target: formal ECHO Workshop under AppID `5105090`; this was a new Workshop item publication, not a Depot, package, App metadata or branch operation.
- Created PublishedFileID `3784997717` as `ECHO Workshop SDK Starter`, visibility `0` (public), tag `Sandboxed Plugin`: <https://steamcommunity.com/sharedfiles/filedetails/?id=3784997717>.
- The 45,745-byte content payload contains a runnable API 2 sandbox plug-in, the portable SDK CLI, TypeScript declarations, both JSON Schemas, starter/CI templates, documentation and `echo-workshop-sdk-1.0.0.tgz` (SHA-256 `5355494725088258AB0FB7C8E517CA3D1364DD3AC3FCEDFF10D31A3E8D929E09`). It contains no VST binary, DLL, native addon or third-party music-service implementation.
- Portable and production authoring validation both passed for 14 declared files. Steamworks.js readback confirmed creator/consumer AppID `5105090`, the expected title/tag, public visibility, `banned=false` and `needsToAcceptAgreement=false`; a fresh subscription downloaded and hash-verified every declared file.
- No Steam depot, App metadata, beta/default branch or application release changed during this publication. The item requires an ECHO build containing Workshop plug-in API 2 for runtime use.

### Workshop P1 authoring closure — 2026-08-17

- The portable SDK advanced to `1.1.0` locally with generators for all six Workshop content kinds, deterministic `test` fixtures, a hot-reloading local `dev` mock host, a publication `quality` report and six focused functional examples.
- The in-app dependency center now exposes the dependency-first composition graph as a portable composition manifest and can subscribe to all missing required Workshop dependencies after one explicit confirmation. Subscription does not auto-enable plug-ins or approve capabilities.
- All six generated content kinds pass the same production authoring validator used by ECHO. This is focused developer evidence only; it is not the deferred ordinary-user Steam acceptance requested after review approval.
- No Workshop item update, Community Guide submission, Steam depot upload, App metadata publication, branch assignment or application release occurred in this P1 work.

## Build a signed loose Steam depot

Configure the protected build environment:

- `ECHO_STEAM_RELEASE_APP_ID`: numeric release App ID.
- `ECHO_STEAM_PRO_DLC_APP_ID`: numeric entitlement-only Pro DLC App ID.
- Windows signing variables already required by `build:win:release`.

Run:

```powershell
$env:ECHO_STEAM_RELEASE_APP_ID='<app-id>'
$env:ECHO_STEAM_PRO_DLC_APP_ID='<pro-dlc-app-id>'
npm run build:win:steam
```

The verified depot content is `dist/win-unpacked`. The dedicated GitHub workflow `Windows Steam depot build` produces the same loose artifact and requires the App ID through a GitHub Actions variable.

## Create a release preflight record

After the signed loose depot has been built, generate the fail-closed release record:

```powershell
$env:ECHO_STEAM_RELEASE_APP_ID='<app-id>'
$env:ECHO_STEAM_PRO_DLC_APP_ID='<pro-dlc-app-id>'
npm run steam:release:preflight
```

The command reruns the Steam bundle, final-artifact, third-party notice, and Windows signature checks. It writes ignored local evidence under `artifacts/steam-preflight`:

- `steam-release-preflight.md`: human-readable result, build provenance, and failed checks.
- `steam-release-preflight.json`: machine-readable result and complete relative artifact inventory.
- `artifact-manifest.sha256`: SHA-256 for every file in `dist/win-unpacked`.

The report fails if the App ID is missing, the Git worktree is dirty, a required check fails, or local Steam files such as `steam_appid.txt`/VDF files enter the depot. Reports contain no credentials or absolute local paths.

## Prepare a SteamPipe preview

The generator writes all App/Depot VDF files under ignored `artifacts/steam-pipe`; no generated depot configuration is committed.

```powershell
$env:ECHO_STEAM_RELEASE_APP_ID='<app-id>'
$env:ECHO_STEAM_DEPOT_ID='<depot-id>'
npm run steam:depot:prepare
```

Preview mode is the default. It emits `Preview "1"` and never sets a live branch.

## Upload to a private beta branch

Use a dedicated least-privilege Steam build account and a locally installed SteamCMD. Authenticate it interactively once so no password is placed in command-line arguments or repository files.

```powershell
$env:ECHO_STEAM_RELEASE_APP_ID='<app-id>'
$env:ECHO_STEAM_DEPOT_ID='<depot-id>'
$env:ECHO_STEAM_PRIVATE_BRANCH='qa-private'
$env:ECHO_STEAM_UPLOAD_APPROVED='1'
$env:STEAMCMD_PATH='C:\Steamworks\tools\ContentBuilder\builder\steamcmd.exe'
$env:STEAM_BUILD_ACCOUNT='<dedicated-build-account>'
npm run steam:depot:upload-private
```

The upload command refuses `default` and `public`. Promotion to the public branch remains a separate manual Steamworks action.
It also generates and requires a passing release preflight immediately before SteamCMD starts. Dirty worktrees, unsigned or incomplete artifacts, missing notices, forbidden Steam-cut features, and local Steam/VDF files block the upload.

## Required real-Steam verification

After uploading to the private branch, verify from the Steam client on a clean Windows account/machine:

1. Install and launch from Steam; direct executable launch should relaunch through Steam.
2. Confirm the status reports the expected App ID, BuildID, beta branch, ownership, and Cloud state.
3. Confirm Overlay rendering does not regress the main window, transparent auxiliary windows, or GPU performance.
4. Exercise local import, playback, pause/resume, seek, track change, and exit.
5. Confirm `steam_appid.txt`, VDF files, credentials, and forbidden Steam-cut features are absent from the installed depot.

Passing static checks or producing a signed artifact is not equivalent to completing this real-Steam smoke.
