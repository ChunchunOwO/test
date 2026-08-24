# ECHO Steam listening stats

## Product and privacy boundary

ECHO defines eight fixed integer-only Steam stats from aggregate local playback history. All eight sync by default while ECHO runs through Steam. Users can disable the two extended listening stats; the six values used by Steam achievement progress continue to synchronize. This Steam-edition preference is not copied from the regular edition and is not included in the Steam Cloud settings projection. The values are associated with the active Steam account and must not be described as anonymous.

Only the aggregate integers below may leave the device. Track titles, artists, album names, lyrics, local paths, cover art, devices, timestamps, per-play rows, Steam IDs, and event timelines are excluded. Renderer code can only read typed status, enable or disable the two extended stats, and request a sync; it cannot submit API names or values. Achievement-backed values are derived from the Main-owned Audio Core playback-fact ledger rather than Renderer playback-history completion flags.

Extended stats are enabled by default. Disabling them stops future reads and submissions for longest session and rediscovered tracks, but does not stop the six achievement-progress values. ECHO compares each local aggregate with the current Steam value and submits the greater value, so deleting local history or using a computer with less history cannot lower a previously stored stat. These client-written values are personal progress, not trusted evidence for prizes, anti-cheat, or business reporting.

The compact controls are available in Settings > Steam Settings under **Steam Achievements, Stats, And Community**. The History page keeps the full local-versus-Steam values, milestone progress, and manual sync action.

The first version is a highest-observed snapshot, not a cross-device sum. It avoids double-counting without uploading track identities, but activity on a secondary computer will not increase a Steam value until that computer's local aggregate exceeds the existing remote value.

## Steamworks definitions for release App ID 5105090

These definitions and their achievement progress mappings were published for App ID `5105090` on 2026-08-16. Publication does not replace the required real Steam-client Stats and Achievement smoke.

| API name | Display name | Sync policy | Type | Set by | Increment only | Min | Max | Default | Aggregated |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `ECHO_STAT_LISTEN_MINUTES` | Listening Minutes | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_COMPLETED_PLAYS` | Completed Plays | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_UNIQUE_TRACKS` | Unique Tracks Completed | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_LONGEST_STREAK_DAYS` | Longest Listening Streak | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_NIGHT_MINUTES` | Night Listening Minutes | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_LONGEST_SESSION_MINUTES` | Longest Listening Session | Optional | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_REDISCOVERED_TRACKS` | Rediscovered Tracks | Optional | INT | Client | Yes | 0 | 2147483647 | 0 | No |
| `ECHO_STAT_COMPLETED_ALBUMS` | Albums Explored | Achievement | INT | Client | Yes | 0 | 2147483647 | 0 | No |

Do not enable `Aggregated` in the first release. The client can submit these values, and cross-user totals would not be trustworthy operating metrics.

## Achievement progress mapping

After all eight stat definitions are published and a real-client stat sync succeeds, the following existing achievements can use Steam's Progress Stat field. Keep the main-process achievement evaluation in place as a fallback and verify that Steam does not double-notify.

| Achievement API name | Progress stat | Unlock value |
| --- | --- | ---: |
| `ECHO_STATS_LISTENING_100_HOURS` | `ECHO_STAT_LISTEN_MINUTES` | 6000 |
| `ECHO_STATS_100_COMPLETED_TRACKS` | `ECHO_STAT_UNIQUE_TRACKS` | 100 |
| `ECHO_STATS_SEVEN_DAY_STREAK` | `ECHO_STAT_LONGEST_STREAK_DAYS` | 7 |
| `ECHO_STATS_NIGHT_5_HOURS` | `ECHO_STAT_NIGHT_MINUTES` | 300 |
| `ECHO_COMPLETED_250` | `ECHO_STAT_COMPLETED_PLAYS` | 250 |
| `ECHO_COMPLETED_500` | `ECHO_STAT_COMPLETED_PLAYS` | 500 |
| `ECHO_COMPLETED_1000` | `ECHO_STAT_COMPLETED_PLAYS` | 1000 |
| `ECHO_COMPLETED_2500` | `ECHO_STAT_COMPLETED_PLAYS` | 2500 |
| `ECHO_COMPLETED_5000` | `ECHO_STAT_COMPLETED_PLAYS` | 5000 |
| `ECHO_COMPLETED_10000` | `ECHO_STAT_COMPLETED_PLAYS` | 10000 |
| `ECHO_TEN_ALBUMS` | `ECHO_STAT_COMPLETED_ALBUMS` | 10 |

`ECHO_ONE_HOUR_SESSION` is intentionally not mapped to `ECHO_STAT_LONGEST_SESSION_MINUTES` yet. Its achievement logic is scoped to one application session, while the historical dashboard groups listening sessions by time gaps; those semantics must be reconciled before Steam is allowed to auto-unlock it.

## Runtime behavior and verification

- Startup schedules synchronization followed by a maximum cadence of once every ten minutes. The default scope contains all eight definitions; disabling extended stats narrows it to the six achievement definitions.
- Transient Steam, read, write, or `StoreStats` failures retry after 5 seconds, 15 seconds, 1 minute, and then every 5 minutes. A manual sync cancels the pending timer and retries immediately; shutdown clears all timers.
- Opening the History page or Steam settings performs an immediate single-flight remote reconciliation. If startup synchronization is already running, readers share that operation instead of showing a local zero snapshot or issuing duplicate Steam calls.
- Typed status reads never write to Steam. The History and Steam settings surfaces poll read-only status every ten seconds and show `syncing`, `retrying`, the next retry time, pending value count, and last successful account sync.
- The History page displays the greater of the local aggregate and the account-backed Steam value, so a newly installed computer with no local playback database still restores the previously stored progress after Steam responds.
- A manual History-page action can request an immediate achievement-progress sync regardless of the optional setting.
- The History page always shows the six achievement values and their next configured milestone. The two optional values appear only when extended stats are enabled.
- The service reads every value in the active synchronization scope first and refuses to write if any required definition is missing or unpublished. Missing optional definitions cannot block achievement progress while extended stats are off.
- `StoreStats` runs only when at least one value increased.
- If one or more `SetStat` calls succeed but `StoreStats` fails, ECHO retains a pending-store receipt. The next sync retries `StoreStats` even when the in-memory Steam values no longer appear to have changed.
- Failed writes remain retryable and never make Renderer state the source of playback truth.

Before changing the remote schema, inspect the exact pending `stats` diff and confirm that it contains only these eight definitions and the explicitly approved achievement progress mappings. After a build containing the 2026-08-17 immediate-reconciliation change is installed, restart ECHO from Steam on a second computer with an empty local playback database and verify that the six achievement values reappear; then enable extended stats and verify all eight values. Inspect `%steam_install%/logs/stats_log.txt`, exercise disable/re-enable, and confirm that no metadata or per-play history leaves the process. This code change does not publish Steamworks metadata or replace the required two-computer Steam-client smoke.
