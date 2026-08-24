# ECHO Steam leaderboards

ECHO exposes five fixed, opt-in Steam Community leaderboards for release App ID `5105090`.

| Steam ID | API name | Community name | Sort | Display | Client writes | Local source |
| --- | --- | --- | --- | --- | --- | --- |
| `20662314` | `ECHO_LISTENING_SECONDS_V1` | ECHO Listening Time | Descending | Seconds | Allowed | Actual local playback seconds |
| `20662321` | `ECHO_COMPLETED_TRACKS_V1` | ECHO Completed Tracks | Descending | Numeric | Allowed | Distinct naturally completed local tracks |
| `20662447` | `ECHO_LONGEST_STREAK_DAYS_V1` | ECHO Longest Listening Streak | Descending | Numeric | Allowed | Longest run of local completion days |
| `20662451` | `ECHO_LONGEST_SESSION_SECONDS_V1` | ECHO Deep Listening Session | Descending | Seconds | Allowed | Longest local session with a 30-minute gap boundary |
| `20662455` | `ECHO_REDISCOVERED_TRACKS_V1` | ECHO Rediscovered Tracks | Descending | Numeric | Allowed | Distinct local tracks replayed after at least 45 days |

All five boards are active in Steamworks. Steamworks applies leaderboard edits immediately; they are not part of the app metadata publication queue. The app deliberately calls `FindLeaderboard`; it never creates or renames boards at runtime. Keep `Trusted Writes` disabled for this casual, client-authored feature, and keep reads global so the Global, Friends, and Around Me views all work.

## Privacy and trust boundary

Participation is disabled by default. Settings > Steam Settings provides the opt-in switch, and the History page keeps the complete leaderboard browser and sync controls. Both entry points explain the upload and require confirmation before enabling it. ECHO sends only the five account-linked aggregate integer scores through the local Steam client. A player's public Steam persona and rank may appear on a board. Track names, artists, albums, file paths, device information, playback rows, Steam tickets, and credentials are not included. The participation setting remains local and is excluded from the Steam Cloud settings snapshot.

The renderer cannot submit API names, handles, Steam IDs, or scores. It can select only one of the five fixed board IDs and one of the three fixed read scopes through typed preload IPC. The main process derives scores from local aggregate playback-history queries. Steam IDs remain inside main/native code; renderer entries contain only rank, score, the Steam-provided persona name when available, a current-user marker, and fixed aggregate integer summaries.

Each upload includes seven fixed-order integer details: completed unique tracks, session count, longest session seconds, longest completion streak days, night listening seconds, rediscovered track count, and completed short-track count. No detail contains a title, artist, album, path, timestamp, individual playback row, device value, or stable local identifier.

These are casual community rankings. Local playback history is not server-verifiable, so they must not be used for prizes or security-sensitive competition. A future trusted leaderboard would require Steam Web API ticket authentication and publisher-key writes from a secured ECHO server; the publisher key must never ship in the desktop client.

## Runtime and rate limiting

`SteamLeaderboardService` owns the fixed registry and serializes native calls. `SteamLeaderboardStatusSync` submits at startup when participation is enabled, then no more than once every ten minutes. Uploads use Steam's Keep Best behavior. Turning participation off stops future reads and uploads but does not delete an existing Steam score.

The Windows-only `echo-steam-leaderboards.node` bridge attaches to the already initialized `steam_api64.dll`; it does not call `SteamAPI_Init` or create a second Steam client. It uses the flat Steamworks ABI to find boards, upload scores, and download Global, Friends, or Around Me entries. The build copies the signed `.node` file into the packaged resources root.

## Required real-Steam smoke

After uploading a private build:

1. Launch ECHO from Steam with participation initially off and confirm no score is submitted.
2. Enable participation on History and confirm the disclosure appears before the first upload.
3. Confirm all five scores, ranks, and anonymous detail summaries render after Sync.
4. Check Global, Friends, and Around Me with two Steam accounts.
5. Play and naturally complete a local track, wait for the next sync, and verify scores only increase.
6. Disable participation and confirm subsequent refreshes do not read or upload scores.
7. Inspect diagnostics and logs for absence of Steam IDs, tickets, local paths, and track metadata.

Native build success and focused tests do not replace this ordinary Steam-client smoke.

### Smoke status: 2026-08-15

A real Steam-client development smoke passed against App ID `5105090` using an isolated copy of local ECHO data. Steamworks initialized, all five boards accepted their scores, and Around Me read each score back at rank 1 with all seven integer details. Global and Friends reads also succeeded for the current account. The History UI showed participation, rank 1, the score, anonymous details, and a localized fallback for an invisible Steam persona name.

This proves the current-account client/API path, not the packaged depot artifact or a two-account friend comparison. Repeat steps 4-7 above with a second account and the private packaged build before release sign-off.
