# ECHO Steam achievements

The Steam release uses a fixed main-process achievement registry. Renderer code cannot submit arbitrary API names, and achievement checks never expose the Steam client through preload IPC.

| API name | Display name (English) | Display name (Simplified Chinese) | Unlock condition | Hidden |
| --- | --- | --- | --- | --- |
| `ECHO_FIRST_LAUNCH` | Generous Boss! | 老板大气！ | Start ECHO with the Steam runtime available. | No |
| `ECHO_FIRST_LOCAL_IMPORT` | Let Me See | 让我康康 | The local library contains at least one imported song. | No |
| `ECHO_LIBRARY_OVER_500` | WINK~ | WINK~ | The local library contains more than 500 songs. | No |
| `ECHO_MIDNIGHT_LISTENER` | Good Night | 晚安 | Play a track between 00:00 and 00:59 local time. | No |
| `ECHO_FIRST_CRASH_RECOVERY` | Sob... | 呜呜呜…… | On startup, diagnostics identifies the previous ECHO session as an abnormal exit. | Yes |
| `ECHO_FIRST_BIT_PERFECT` | That's Hi-Fi! | 太 HiFi 了！ | Play a track while Audio Core reports a Bit-Perfect candidate output path. | No |
| `ECHO_LONG_TRACK` | This Is Not a Song | 这不是一首歌 | Actually play at least 80% of a track that is 20 minutes or longer. | No |
| `ECHO_FULL_ALBUM` | One Album, No Breaks | 一张听到底 | In one playback run, naturally complete every track of a local album containing at least four tracks, in album order, with at least 75% actual playback per track. Appending songs after the album does not reset progress. | No |
| `ECHO_FIRST_GAPLESS` | Between Breaths | 呼吸之间 | Audio Core receives one native-host-confirmed Gapless queue boundary. Enabling the setting alone does not count. | No |
| `ECHO_LONG_TIME_NO_SEE` | Long Time No See | 好久不见 | Naturally complete a local track whose previous local playback history is at least 90 days old. | No |
| `ECHO_CONTINUOUS_PLAY_FIVE` | You Take It From Here | 交给你了 | Naturally complete three distinct Local Smart Radio recommendations in sequence. A manual skip or incompatible queue edit resets the run. | No |
| `ECHO_CUSTOM_EQ_TRACK` | Tuner on Duty | 调音师上岗 | Naturally complete a track with the same saved custom EQ preset enabled from the start or selected within the opening 10% (at most 15 seconds). Built-in presets do not count. | No |
| `ECHO_STATS_LISTENING_100_HOURS` | Time You Can Hear | 听得见的时间 | Accumulate 100 hours of actual local playback. Paused time and seeking do not add progress. | No |
| `ECHO_STATS_100_COMPLETED_TRACKS` | Library Roll Call | 曲库点名册 | Naturally complete 100 different local tracks. | No |
| `ECHO_STATS_SEVEN_DAY_STREAK` | Seven Days of ECHO | 七日回声 | Naturally complete at least one local track on seven consecutive local calendar days. | No |
| `ECHO_STATS_NIGHT_5_HOURS` | The Moon Knows | 月亮知道 | Accumulate five hours of actual local playback from sessions started between 00:00 and 04:59 local time. | No |
| `ECHO_STATS_FAVORITE_ALBUM` | Just a Little Biased | 偏心一点点 | For one current local album containing at least four tracks, naturally complete every track at least three times. | No |
| `ECHO_STATS_YEARBOOK` | My Listening Yearbook | 我的声音年鉴 | Unlock the other five ECHO data achievements. | No |
| `ECHO_OLD_UNPLAYED_TREASURE` | Treasure | 宝贝 | Naturally complete a local track imported at least 180 days ago that has never been played before. | No |
| `ECHO_SAME_TITLE_DIFFERENT_ARTIST` | Same Name, Different Fate | 同名不同命 | Naturally complete two consecutive local tracks with the same title and different artists. Any intervening track resets the sequence. | No |
| `ECHO_FIVE_DECADES_SESSION` | Time Machine | 时光穿梭机 | During one application playback session, naturally complete local tracks from four different decades. Tracks without a year do not count. | No |
| `ECHO_REVERSE_ALBUM` | Backwards Works Too | 倒着听也可以 | Naturally complete a local album containing at least four tracks in reverse track order without skipping or reordering the active album. Appending songs after the album does not reset progress. | No |
| `ECHO_MIDNIGHT_BRIDGE` | Midnight Bridge | 零点过桥 | Start a local track lasting at least two minutes before midnight and naturally complete it after midnight with at least 75% actual playback. | No |
| `ECHO_TEN_SHORT_TRACKS` | Short and Sweet | 短小精悍 | Naturally complete five different local tracks whose duration is no longer than 60 seconds. | No |
| `ECHO_DARK_SIDE_OF_THE_MOON` | The Dark Side of the Moon | The Dark Side of the Moon | Naturally complete a local track whose track artist or album artist contains a distinct Pink Floyd credit after normalization. Tribute-band names do not count. | Yes |
| `ECHO_PF_WISH_YOU_WERE_HERE` | Wish You Were Here | Wish You Were Here | In one verified queue, naturally complete every local track of the Pink Floyd album `Wish You Were Here` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_THE_WALL` | Another Brick | Another Brick | In one verified queue, naturally complete every local track of the Pink Floyd album `The Wall` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_ANIMALS` | Pigs Can Fly | Pigs Can Fly | In one verified queue, naturally complete every local track of the Pink Floyd album `Animals` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_MEDDLE` | Echoes in the Deep | Echoes in the Deep | In one verified queue, naturally complete every local track of the Pink Floyd album `Meddle` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_DIVISION_BELL` | Two Faces, One Bell | Two Faces, One Bell | In one verified queue, naturally complete every local track of the Pink Floyd album `The Division Bell` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_ATOM_HEART_MOTHER` | Atom Heart Mother | Atom Heart Mother | In one verified queue, naturally complete every local track of the Pink Floyd album `Atom Heart Mother` in library order. The album must contain at least four tracks and each track must reach 75% actual playback. Appending later songs is allowed. A single-file whole-album rip also qualifies when it is the album's only local track, lasts at least 30 minutes, and reaches 85% actual playback. | Yes |
| `ECHO_PF_ECHOES` | Where ECHO Began | 回声开始的地方 | Naturally complete a local Pink Floyd track titled `Echoes`, allowing a common remaster/edition suffix, lasting at least 20 minutes, with at least 80% actual playback. | Yes |
| `ECHO_PLAY_AGAIN` | Play It Again | 再来一遍 | Naturally complete the same local track twice in a row at 80% actual playback, with the replay beginning within 30 seconds. | No |
| `ECHO_FAVORITE_PART` | Rewind Life | 倒带人生 | After a local track passes halfway, seek back into its opening 20%, then naturally finish with cumulative actual playback reaching 80%. | No |
| `ECHO_FLIP_SIDE` | Flip the Record | 换面 | Naturally complete the final track of disc one and then the first track of disc two from the same local album, reaching 75% actual playback on both. | No |
| `ECHO_SHUFFLE_FATE` | Shuffle Decides | 随机的安排 | With shuffle enabled, naturally complete five different local tracks in one application session. Skipped or non-shuffled tracks simply do not count and do not reset progress. | No |
| `ECHO_AFTER_CURTAIN` | After the Curtain | 谢幕以后 | Naturally complete the final track of a local album containing at least four tracks, then leave playback silent for thirty seconds. | No |
| `ECHO_FOUR_SEASONS` | One Song, Four Seasons | 一曲四季 | Naturally complete the same local track in all four calendar quarters of one year. | No |
| `ECHO_COMPLETED_250` | Ears Warmed Up | 耳朵热身完毕 | Accumulate 250 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_COMPLETED_500` | The Playlist Is Getting Heavy | 歌单有点重 | Accumulate 500 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_COMPLETED_1000` | A Thousand Songs, Still Awake | 千曲不困 | Accumulate 1,000 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_COMPLETED_2500` | Turn the Days Into Songs | 把日子听成歌 | Accumulate 2,500 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_COMPLETED_5000` | The Jukebox Never Tires | 不会停的点唱机 | Accumulate 5,000 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_COMPLETED_10000` | Ten Thousand Echoes | 一万次回响 | Accumulate 10,000 local-track completions with at least 75% actual playback each. Repeated tracks count. | No |
| `ECHO_REPEAT_ONE_FIVE` | Loop Victim | 单曲循环受害者 | With Repeat One enabled, complete the same local track three times in a row with at least 75% actual playback each. | No |
| `ECHO_TRACK_THREE_IN_DAY` | Again and Again | 再来亿遍 | Complete the same local track three times within a rolling 24-hour window with at least 75% actual playback each. The plays do not need to be consecutive. | No |
| `ECHO_FIVE_GENRES_SESSION` | Not a Picky Listener | 不挑食 | In one playback session, complete local tracks from three different tagged genres. | No |
| `ECHO_TEN_ARTISTS_SESSION` | One-Person Festival | 一人音乐节 | In one playback session, complete local tracks by five different known artists. | No |
| `ECHO_GOLDEN_THREE_MINUTES` | Golden Three Minutes | 黄金三分钟 | Complete a local track lasting from 2:55 through 3:05 with at least 85% actual playback. | No |
| `ECHO_PAUSE_NEAR_END` | Wait, Don't End Yet | 先别结束 | Pause a local track with no more than ten seconds remaining, wait five seconds, then resume and let it finish naturally. | No |
| `ECHO_UNINTERRUPTED_FOUR_MINUTES` | Quietly, All the Way | 安静地听完 | Complete a local track of at least three minutes with 85% actual playback and no pause, seek, or playback-rate change. | No |
| `ECHO_FIVE_COVERLESS` | Still Sounds Good | 没有封面也很好听 | In one playback session, complete three different local tracks that have no cover artwork. | No |
| `ECHO_MANUAL_QUEUE_THREE` | Three Is Just Right | 三首刚刚好 | Create a manual queue of exactly three different local tracks and complete it in order without editing or skipping. | No |
| `ECHO_ONE_HOUR_SESSION` | One-Hour Club | 一小时俱乐部 | Accumulate one hour of actual listening in one application session. Paused time does not count; changing tracks is allowed. | No |
| `ECHO_THREE_DAY_TRACK_STREAK` | Yesterday Once More | 昨日重现 | Complete the same local track on three consecutive local calendar days. | No |
| `ECHO_ALBUM_ALL_DAY` | From Morning to Night | 从早听到晚 | In one day, complete different tracks from the same local album in the morning, afternoon, and evening. | No |
| `ECHO_ZHAO_XIAOLIU_HANDSOME` | Looks Off the Charts | 颜值爆表 | Complete a special local track with at least 75% actual playback. | No |
| `ECHO_THREE_AUDIO_FORMATS` | Three Flavors | 三种口味 | In one application session, naturally complete local tracks in three different file formats. | No |
| `ECHO_SHORT_AND_LONG` | Short and Long | 大小通吃 | In one application session, naturally complete one local track no longer than 90 seconds and one lasting at least eight minutes, in either order. | No |
| `ECHO_VOLUME_SLIDE` | Volume Slide | 音量滑梯 | Change the volume meaningfully at least three times while one local track is playing, then naturally complete that track. | No |
| `ECHO_ALBUM_BOOKENDS` | Album Bookends | 有头有尾 | In one application session, naturally complete the first and last tracks of the same local album containing at least four tracks, in either order. | No |
| `ECHO_EARLY_BIRD` | Early Bird | 早起有歌听 | Naturally complete a local track between 06:00 and 09:00 local time. | No |
| `ECHO_MIDNIGHT_THREE` | The Moon Is Still Awake | 月亮不睡我不睡 | In one application session, naturally complete three different local tracks between 00:00 and 04:00 local time. | No |
| `ECHO_TEN_ALBUMS` | Cover Traveler | 封面旅行家 | Accumulate natural completions from ten different local albums; one completed track per album is enough. | No |

Natural-completion ratios allow only a bounded tail-sampling tolerance, capped at 1.5 seconds across live and historical paths and reduced proportionally for short tracks. This compensates for status-event granularity without crediting forward seeks or manual skips. Pink Floyd album and track checks accept common remaster, deluxe, anniversary, expanded, and edition suffixes while retaining exact artist-credit boundaries.

Achievement listening history is stored in the Main-owned `steam_achievement_playback_facts` ledger. New facts are written only from Audio Core status, natural-end, and track-advance observations; Renderer playback-history `completed` values are not achievement authority. Migration 51 imports existing local history once for continuity, but marks a legacy completion as qualified only when its recorded played time reaches the same 75% threshold. New incomplete or manually stopped Audio Core sessions still contribute trusted listening time without counting as qualified completions.

The coordinator retries safe milestone checks every 15 seconds because Steam achievement state may not be ready at the first startup callback. One-shot activations that Steam temporarily rejects remain pending and are retried on the same interval. Historical data achievements are throttled to one database evaluation per minute. Successful activations are suppressed for the rest of the process. Launch and crash-recovery milestones use a library-independent startup coordinator initialized immediately after crash diagnostics, so recovery mode, an unhealthy library, and UltraLight startup do not discard the previous abnormal-exit evidence.

## Steamworks deployment status

On 2026-08-14, the six-achievement Stats schema was published to release App ID `5105090` as `stats` revision 1. English and Simplified Chinese achievement localization was published with `common` revision 3. `ECHO_FIRST_CRASH_RECOVERY` is configured as hidden; the other five achievements are public.

The 256x256 achieved and grayscale unachieved icons for all six achievements were uploaded and published on 2026-08-14 as `stats` revision 2. A real Steam-client schema refresh and unlock smoke is still required after restarting ECHO from Steam.

On 2026-08-15, the second six-achievement set and all twelve achieved/unachieved icons were published to release App ID `5105090` as `stats` revision 3. Steamworks reports twelve achievements total, with complete English and Simplified Chinese localization and no remaining unpublished app-data changes.

On 2026-08-15, the third six-achievement data set and all twelve achieved/unachieved icons were published to release App ID `5105090` as `stats` revision 4. Steamworks reports eighteen achievements total, with complete English and Simplified Chinese localization and no remaining unpublished app-data changes. Its conditions are evaluated only in the main process from local playback history; no renderer API can submit achievement names or fabricate progress.

On 2026-08-15, the fourth six-achievement set and all twelve achieved/unachieved icons were published to release App ID `5105090` as `stats` revision 5. Steamworks reports twenty-four achievements total, with complete English and Simplified Chinese localization and no remaining unpublished app-data changes.

On 2026-08-15, the hidden `The Dark Side of the Moon` easter egg and its achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 6. Steamworks reports twenty-five achievements total and no remaining unpublished app-data changes.

On 2026-08-15, the six hidden Pink Floyd album easter eggs and all twelve achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 7. Steamworks reports thirty-one achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

On 2026-08-15, the hidden `Where ECHO Began` achievement and its bespoke achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 8. Steamworks reports thirty-two achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

On 2026-08-15, the six listening-behavior achievements and all twelve achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 9. Steamworks reports thirty-eight achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

On 2026-08-15, the six cumulative local-play completion milestones and all twelve achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 10. Steamworks reports forty-four achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

On 2026-08-15, the twelve playful listening achievements and all twenty-four achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 11. Steamworks reports fifty-six achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

On 2026-08-15, the non-hidden `Looks Off the Charts` achievement and its achieved/unachieved pixel icons were published to release App ID `5105090` as `stats` revision 12. Steamworks reports fifty-seven achievements total, complete English and Simplified Chinese localization, and no remaining unpublished app-data changes.

## Artwork staging

The original six source PNG files are staged in the ignored `misc/ach` directory. Their Steam-ready 256x256 achieved and grayscale unachieved JPG variants are generated under `misc/ach/steam-ready`.

The second set uses the pixel source PNGs under `misc/ach/pixel-achievements-v1`. Steam-ready achieved and grayscale unachieved PNG variants are generated under `misc/ach/steam-ready-pixel`. These staging assets are not packaged with the application; their published Steam copies are stored by Steam's community asset CDN.

The third set uses the approved hand-built 32x32 pixel sources under `misc/ach/data-stats-cute-simple-v2`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The fourth set uses the approved hand-built 32x32 pixel sources under `misc/ach/story-achievements-pixel-v1`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The hidden easter-egg set uses the same deterministic 32x32 pixel system under `misc/ach/easter-eggs-pixel-v1`. Steam-ready achieved and grayscale unachieved variants remain staging-only and are not packaged with the application.

The six Pink Floyd album easter eggs use the approved deterministic 32x32 pixel sources under `misc/ach/pink-floyd-albums-pixel-v1`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The dedicated `Where ECHO Began` icon uses a bespoke deterministic 32x32 source under `misc/ach/echoes-special-pixel-v1`. Its Steam-ready achieved and grayscale unachieved variants remain staging-only and are not packaged with the application.

The six listening-behavior achievements use the approved deterministic 32x32 pixel sources under `misc/ach/fun-listening-achievements-pixel-v1`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The six cumulative-completion milestones use the approved deterministic 32x32 pixel sources under `misc/ach/cumulative-song-milestones-pixel-v1`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The twelve playful listening achievements use deterministic 32x32 pixel sources under `misc/ach/behavior-achievements-pixel-v1`. Steam-ready achieved and grayscale unachieved variants are generated in its `steam-ready` subdirectory and remain outside the packaged application.

The `Looks Off the Charts` achievement uses the approved chibi pixel portrait under `misc/ach/zhaoxiaoliu-handsome-pixel-v1`. Its 32x32 source and Steam-ready achieved/unachieved variants remain staging-only and are not packaged with the application.
