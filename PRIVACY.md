# ECHO Steam Privacy Policy / ECHO Steam 隐私政策

- Effective date / 生效日期: 2026-08-15
- Last updated / 最后更新: 2026-08-16
- Steam App ID: `5105090`
- Public Chinese version / 中文公开版: <https://echonext.moe/zh/privacy/steam/>
- Public English version / 英文公开版: <https://echonext.moe/en/privacy/steam/>

This Privacy Policy applies to the ECHO edition distributed through Steam ("ECHO Steam"). It is separate from the ECHO End User License Agreement, third-party notices, and source-available license.

本隐私政策适用于通过 Steam 分发的 ECHO 版本（“ECHO Steam”）。它与 ECHO 最终用户许可协议、第三方声明和源码可用许可证相互独立。

## 中文

### 1. 概述

ECHO Steam 是以本地音乐库为核心的桌面音乐播放器。基础本地播放不依赖 ECHO 官方服务器。

ECHO 不出售或出租用户数据，不内置广告追踪 SDK，不会自动上传诊断报告，也不会把完整本地音乐库、逐条播放历史、原始音乐文件、歌词、封面、文件路径、音频设备列表或远程音乐库凭据上传到 ECHO 官方服务器。

当你主动启用 Steamworks、远程音乐库、在线歌词或元数据、OPRA、Discord Rich Presence、Last.fm 等联网功能时，为实现该功能所必需的数据会发送给相应的第三方服务或你自行配置的服务器。第三方会按其自己的条款和隐私政策处理数据。

### 2. 本地处理和存储的数据

ECHO Steam 可能在你的设备上处理和保存：

- 你选择的音乐文件夹、文件路径、文件名、音频标签、格式、时长、专辑封面和歌词；
- 曲库索引、播放队列、播放列表、喜欢、播放历史和基于历史生成的本地统计；
- 主题、语言、音频输出、设备、EQ、DSP、歌词、快捷键和其他应用设置；
- 远程音乐库的服务器地址、账号标识、访问令牌或密码等连接配置；
- 创意工坊项目 ID、版本、校验摘要、安装、启用和应用状态；
- 缓存、备份、日志、崩溃恢复信息和诊断报告。

这些数据通常保存在当前操作系统用户的 ECHO Steam 应用数据目录，或你明确选择的缓存、备份和挂载位置。删除 ECHO 的数据库、缓存或设置不会删除你的原始音乐文件，除非你在文件系统中另行删除这些文件。

### 3. Steamworks 数据

ECHO Steam 通过本机 Steam 客户端使用 Valve 提供的 Steamworks 服务。ECHO 不要求或保存你的 Steam 密码、Steam Guard 验证码或 Steam 会话 Cookie。Steamworks 所需的账号标识、所有权状态和认证数据只在受支持的本机 Steam 链路中使用，不会暴露给创意工坊主题，也不会写入面向用户的普通诊断报告。

Valve 对 Steam 账号和 Steam 服务数据的处理由 [Valve 隐私政策](https://store.steampowered.com/privacy_agreement/) 约束。

#### Steam Cloud

当该 App 的 Steam Cloud 可用且你未在 Steam 中关闭 Cloud 时，ECHO 会通过 Steam Remote Storage 同步一个版本化文件 `echo-steam-settings-v1.json`。它只包含经过白名单筛选的可移植应用设置以及版本、更新时间和完整性摘要。

Steam Cloud 投影明确排除：曲库数据库、音乐文件、播放列表内容、逐条播放历史、绝对路径、窗口位置、音频设备和硬件标识、代理和远程服务配置、密码、令牌、Cookie、授权或会话数据、Steam 权益状态、日志和诊断报告。

ECHO 会在启动时比较本地与云端设置，并在设置变化后延迟同步；设置页也提供手动上传和下载。你可以在 Steam 的全局设置或 ECHO 的 Steam 属性中关闭 Steam Cloud。关闭同步会停止后续传输，但不会自动删除 Valve 已保存的云端文件。

#### Steam Rich Presence

Steam Rich Presence 默认启用。默认“音乐”预设会向本机 Steam 客户端提交当前曲名、艺术家、专辑和以 15 秒为粒度的播放进度。流派、播放顺序、BPM、音质、格式和 bit-perfect 状态默认不提交，只有你明确开启相应选项后才会加入。

这些内容可能按你的 Steam 隐私和好友设置显示给 Steam 好友。你可以选择“精简”“隐私”预设，关闭单独字段，或完全关闭 Rich Presence。完全关闭后，ECHO 会立即清除当前提交的 ECHO Rich Presence 字段。

#### 成就、可选 Steam 统计和排行榜

ECHO 可根据本地播放事实向 Steam 提交固定成就标识和解锁或进度状态。为使 Steam 正确显示累计成就进度，ECHO 会自动提交六个与当前 Steam 账号关联的整数汇总值：听歌分钟、有效完整播放次数、已完整播放的唯一曲目数、最长连续收听天数、夜间收听分钟和已探索的专辑数。

“Steam 扩展听歌统计”默认开启，你可以随时关闭。开启时，ECHO 会在上述六项成就进度之外，再提交最长收听会话分钟和重新发现的曲目数两个整数汇总值。无论是否开启扩展统计，曲名、艺术家、专辑、歌词、封面、路径、设备、时间戳和逐条播放记录都不会提交。

“Steam 排行榜”默认关闭，并要求单独确认。启用后，ECHO 可提交五个固定的最佳整数分数以及七个固定顺序的整数摘要，用于收听时间、已完整播放曲目、最长连续收听、最长会话和重新发现曲目排行榜。排行榜读回内容可能包含 Valve 提供的公开昵称、名次和分数。

关闭扩展统计会停止上述两个可选值的后续读取和提交，但不会停止 Steam 成就所需的六项累计进度。关闭排行榜会停止后续排行榜读取和提交。关闭这些功能不会自动删除 Valve 已保存的统计值或排行榜成绩；删除本地播放历史也不会降低已经提交的最高值。

#### Steam 创意工坊

当你浏览、订阅、取消订阅或下载创意工坊内容时，Steam 会处理你的 Steam 账号、项目 ID、订阅关系、下载状态和相关请求。ECHO 会在本地读取项目元数据、安装位置和状态，并保存项目 ID、版本、校验摘要、启用和应用状态，用于验证、隔离、修复和显式应用内容。

ECHO 不会把你的本地音乐文件、文件路径、完整播放历史或远程服务凭据上传到创意工坊。被你明确启用的自定义 UI 主题可在无外部网络、无 Node、无文件系统、无 Steamworks 的隔离 iframe 中，按其声明的能力处理经过清理的曲库、播放、队列或频谱数据；这些数据不会因此离开本机。请只启用你信任的创意工坊内容。

### 4. 远程音乐库和用户配置的服务

ECHO Steam 支持你明确配置的 WebDAV、Jellyfin、Emby、Subsonic/Navidrome 兼容服务，以及通过操作系统挂载的 SMB 或 SSHFS 位置。

使用网络型远程库时，ECHO 会直接连接你填写的服务器。为登录、浏览、索引、获取封面或歌词以及流式读取音频，服务器可能收到其地址、账号名、密码或令牌、文件夹和媒体 ID、搜索或分页参数、媒体元数据、字节范围请求、IP 地址和普通 HTTPS 请求信息。ECHO 官方服务器不代理这些连接。服务器运营者对其收到的数据负责；请阅读其政策并只连接你信任的服务器。

SMB 和 SSHFS 当前通过你在操作系统中明确选择或挂载的路径访问。相关认证通常由操作系统或挂载工具处理。

### 5. 其他可选网络功能

根据你启用的功能，ECHO Steam 还可能进行以下请求：

- 在线歌词或元数据候选：向相应服务发送曲名、艺术家、专辑、时长或搜索文本；
- OPRA 耳机校正：获取公开的耳机型号、校正曲线和署名素材；不会发送本地曲库、播放历史或设备列表；
- Discord Rich Presence：默认关闭；只有你在设置中启用后，才向本机 Discord 客户端提交播放状态和曲目展示信息；
- Last.fm：只有在你连接并启用后，才向 Last.fm 发送账号授权信息、正在播放或 Scrobble 所需的曲名、艺术家、专辑、时长和时间；
- 用户提供的直接电台流、局域网设备或其他自有服务：向你选择的地址发送建立连接和播放所需的数据。

这些功能可能让第三方看到你的 IP 地址和普通网络请求元数据。各服务的数据处理和保留由其自己的政策决定。

### 6. 诊断、反馈和支持

日志、崩溃恢复信息和诊断报告默认保存在本机。ECHO 不会自动把这些内容上传给维护者或第三方崩溃分析服务。

只有当你主动导出、复制、上传或发送报告时，接收方才会收到你提供的内容。报告可能包含 ECHO 版本、操作系统、错误和功能状态、硬件或音频状态，以及经过清理的文件名或路径摘要。提交前请检查报告并删除你不希望分享的内容。

### 7. 数据共享、保留和删除

ECHO 不出售或出租个人数据，也不基于本地曲库建立广告画像。数据只会在以下情况下离开本机：你启用或使用本政策说明的联网功能；你主动发送反馈、诊断或支持材料；或法律要求处理相关请求。

本地数据会保留到你在应用内清理、通过卸载器删除应用数据，或手动删除对应目录。第三方服务中的数据按其各自政策保留。Steam Cloud、统计、排行榜、成就、创意工坊订阅和 Steam 账号数据由 Valve 管理；在 ECHO 中关闭功能不一定删除 Valve 已保存的历史数据。

### 8. 你的选择和权利

你可以：

- 不导入音乐文件夹，或移除已扫描的文件夹；
- 清理本地缓存、播放历史、设置、备份和其他应用数据；
- 关闭 Steam Cloud、Rich Presence、Steam 扩展统计、排行榜、Discord Rich Presence、Last.fm 和其他可选网络功能；Steam 成就所需的最小累计进度会在 Steam 运行时继续同步；
- 断开远程音乐库并删除其本地连接配置；
- 在发送诊断或反馈前检查内容；
- 通过下方邮箱询问 ECHO 维护者实际持有的数据，或依法提出访问、更正、删除、限制或反对处理的请求。

对于 Valve 或其他第三方独立控制的数据，请直接使用相应服务提供的隐私工具或联系该服务。

### 9. 儿童隐私

ECHO Steam 面向普通桌面用户，不以儿童为主要目标用户。ECHO 维护者不会有意通过 ECHO Steam 收集儿童的个人信息。

### 10. 政策更新

如果 ECHO Steam 的数据处理方式发生重要变化，本政策会更新“最后更新”日期和相关说明。重大变化会在适当位置提供额外提示。

### 11. 联系方式

ECHO 由 Moekotori 维护。隐私问题和请求请发送至 <nyafairy233@gmail.com>。

## English

### 1. Overview

ECHO Steam is a desktop music player built around a local music library. Basic local playback does not depend on official ECHO servers.

ECHO does not sell or rent user data, include an advertising-tracking SDK, automatically upload diagnostic reports, or upload your complete local library, per-play history, original audio files, lyrics, artwork, file paths, audio-device list, or remote-library credentials to official ECHO servers.

When you choose to use Steamworks, remote libraries, online lyrics or metadata, OPRA, Discord Rich Presence, Last.fm, or another network feature, the data required for that feature is sent to the relevant third party or server configured by you. Those services process data under their own terms and privacy policies.

### 2. Data Processed and Stored Locally

ECHO Steam may process and store on your device:

- selected music folders, paths, file names, audio tags, formats, duration, artwork, and lyrics;
- the library index, queue, playlists, likes, playback history, and locally derived listening summaries;
- theme, language, audio output, device, EQ, DSP, lyrics, shortcut, and other app settings;
- server addresses, account identifiers, access tokens, passwords, and other connection settings for remote libraries;
- Workshop item IDs, versions, integrity digests, install, enable, and applied state;
- caches, backups, logs, crash-recovery information, and diagnostic reports.

This data is normally stored in the ECHO Steam app-data directory for the current operating-system user or in a cache, backup, or mount location you explicitly select. Removing ECHO databases, caches, or settings does not remove original music files unless you separately delete those files through the file system.

### 3. Steamworks Data

ECHO Steam uses Steamworks through the local Steam client. ECHO does not request or store your Steam password, Steam Guard code, or Steam session cookies. Account identifiers, ownership state, and authentication data required by Steamworks stay within the supported local Steam path; they are not exposed to Workshop themes or written to ordinary user-facing diagnostic reports.

Valve's handling of Steam account and service data is governed by the [Valve Privacy Policy](https://store.steampowered.com/privacy_agreement/).

#### Steam Cloud

When Steam Cloud is available for the App and you have not disabled Cloud in Steam, ECHO uses Steam Remote Storage to synchronize one versioned file named `echo-steam-settings-v1.json`. It contains only an allowlisted projection of portable app settings plus version, update time, and an integrity digest.

The projection excludes the library database, music files, playlist contents, per-play history, absolute paths, window position, audio-device or hardware identifiers, proxy and remote-service configuration, passwords, tokens, cookies, authorization or session data, Steam entitlement state, logs, and diagnostic reports.

ECHO compares local and cloud settings at startup and schedules a delayed update after settings change. Manual upload and download actions are also available. You can disable Steam Cloud globally or for ECHO in Steam. Disabling synchronization stops future transfers but does not automatically delete a file already stored by Valve.

#### Steam Rich Presence

Steam Rich Presence is enabled by default. The default Music preset submits the current title, artist, album, and playback progress rounded to 15-second intervals to the local Steam client. Genre, playback order, BPM, quality, format, and bit-perfect state are off by default and are included only if you enable their individual options.

This information may be shown to Steam friends according to your Steam privacy and friends settings. You can select the Minimal or Privacy preset, disable individual fields, or turn Rich Presence off. Turning it off clears the current ECHO Rich Presence fields immediately.

#### Achievements, Optional Steam Stats, and Leaderboards

ECHO may submit fixed achievement identifiers and unlock or progress state derived from local playback facts. To keep cumulative achievement progress accurate in Steam, ECHO automatically submits six account-linked integer aggregates: listening minutes, qualified completed plays, unique tracks completed, longest listening streak, night listening minutes, and completed albums.

Steam Extended Listening Stats is on by default and can be disabled at any time. When enabled and available, ECHO submits two additional integer aggregates beyond the six achievement-progress values: longest listening session and rediscovered tracks. Titles, artists, albums, lyrics, artwork, paths, devices, timestamps, and individual playback rows are excluded whether or not extended stats are enabled.

Steam Leaderboards is off by default and requires a separate confirmation. If enabled, ECHO may submit five fixed best integer scores and seven fixed-order integer summaries for listening time, completed tracks, longest streak, longest session, and rediscovered-track leaderboards. Read results may include a public persona name supplied by Valve, rank, and score.

Disabling extended stats stops future reads and submissions for those two optional values, but does not stop the six cumulative values required for Steam achievements. Disabling leaderboards stops future leaderboard reads and submissions. These controls do not automatically delete values or scores already stored by Valve, and removing local playback history does not lower a previously submitted best value.

#### Steam Workshop

When you browse, subscribe to, unsubscribe from, or download Workshop content, Steam processes your Steam account, item IDs, subscription relationship, download state, and related requests. ECHO reads item metadata, install location, and state locally and stores item ID, version, integrity digest, enable, and applied state to validate, isolate, repair, and explicitly apply content.

ECHO does not upload your local music files, file paths, full playback history, or remote-service credentials to the Workshop. A custom UI theme that you explicitly enable may process sanitized library, playback, queue, or spectrum data inside an isolated iframe according to its declared capabilities. The frame has no external network, Node, file-system, or Steamworks access, so that data does not leave the device through the theme. Enable only Workshop content you trust.

### 4. Remote Libraries and User-Configured Services

ECHO Steam supports WebDAV, Jellyfin, Emby, Subsonic/Navidrome-compatible services, and SMB or SSHFS locations mounted through the operating system when explicitly configured by you.

For a network remote library, ECHO connects directly to the server you enter. To authenticate, browse, index, load artwork or lyrics, and stream audio, that server may receive its address, username, password or token, folder and media IDs, search or pagination parameters, media metadata, byte-range requests, IP address, and ordinary HTTPS request metadata. Official ECHO servers do not proxy these connections. The server operator is responsible for data it receives; review its policy and connect only to servers you trust.

SMB and SSHFS are currently accessed through a path that you explicitly select or mount in the operating system. Authentication for those mounts is normally handled by the operating system or mount tool.

### 5. Other Optional Network Features

Depending on the features you enable, ECHO Steam may also make these requests:

- online lyrics or metadata candidates: title, artist, album, duration, or search text is sent to the relevant provider;
- OPRA headphone correction: public headphone model, correction-curve, and attribution resources are fetched; the local library, playback history, and device list are not sent;
- Discord Rich Presence: disabled by default; playback state and track display information are submitted to the local Discord client only after you enable it in Settings;
- Last.fm: only after you connect and enable it, account authorization plus title, artist, album, duration, and play time needed for Now Playing or Scrobble is sent to Last.fm;
- direct radio streams, local-network devices, or other user-owned services: connection and playback data is sent to the address you select.

These services may receive your IP address and ordinary network-request metadata. Their own policies determine how they process and retain data.

### 6. Diagnostics, Feedback, and Support

Logs, crash-recovery information, and diagnostic reports are stored locally by default. ECHO does not automatically upload them to the maintainer or to a third-party crash-analytics service.

A recipient receives diagnostic content only when you choose to export, copy, upload, or send it. Reports may contain the ECHO version, operating system, errors and feature state, hardware or audio state, and sanitized file-name or path summaries. Review a report before sharing and remove anything you do not want to disclose.

### 7. Sharing, Retention, and Deletion

ECHO does not sell or rent personal data or build an advertising profile from your local library. Data leaves the device only when you use a network feature described in this Policy, choose to send feedback, diagnostics, or support material, or processing is required by law.

Local data is retained until you clear it in the app, remove app data through the uninstaller, or delete the relevant directory. Third parties retain data under their own policies. Steam Cloud, stats, leaderboards, achievements, Workshop subscriptions, and Steam account data are managed by Valve; turning a feature off in ECHO may not delete historical data stored by Valve.

### 8. Your Choices and Rights

You can:

- avoid importing music folders or remove scanned folders;
- clear local caches, playback history, settings, backups, and other app data;
- disable Steam Cloud, Rich Presence, Steam Extended Stats, leaderboards, Discord Rich Presence, Last.fm, and other optional network features; the minimum cumulative progress required for Steam achievements continues to sync while running through Steam;
- disconnect a remote library and remove its local connection settings;
- review diagnostics or feedback before sending them;
- contact the ECHO maintainer to ask about data actually held by ECHO or to exercise applicable access, correction, deletion, restriction, or objection rights.

For data independently controlled by Valve or another third party, use that service's privacy tools or contact the service directly.

### 9. Children's Privacy

ECHO Steam is intended for general desktop users and is not directed to children. The ECHO maintainer does not knowingly collect children's personal information through ECHO Steam.

### 10. Policy Changes

If ECHO Steam's data handling changes materially, this Policy will be updated with a new "Last updated" date and relevant details. Additional notice will be provided where appropriate.

### 11. Contact

ECHO is maintained by Moekotori. For privacy questions or requests, email <nyafairy233@gmail.com>.
