# ECHO Pro Steam DLC

## Product identity

| Field | Value |
| --- | --- |
| Base application | ECHO, App ID `5105090` |
| Pro DLC | ECHO Pro, App ID `5105160` |
| Pro store package | `1768477` |
| Delivery model | Entitlement-only DLC; no separate depot or download |
| Ownership check | Steam `BIsSubscribedApp`, configured at build time by `ECHO_STEAM_PRO_DLC_APP_ID` |

ECHO Pro unlocks capabilities already shipped in the ECHO executable. The DLC follows the Steam account that owns it. A missing DLC App ID, unavailable Steam client, unsubscribed base application, unowned DLC, refund, or revocation must lock Pro again without deleting the user's base-edition library or settings.

## Entitlement matrix

| Capability | ECHO base edition | ECHO Pro |
| --- | --- | --- |
| Local library, metadata, playlists, playback history, lyrics, decoding, playback, and output-device selection | Included | Included |
| DSD file playback, DoP, and supported ASIO Native DSD passthrough | Included as playback / passthrough paths | Included |
| Optional signal processing: ReplayGain, headroom, EQ, compressor, crossfeed, stereo field, channel balance and matrix, headphone correction, room correction / FIR, and protection limiter | Hidden, bypassed, and blocked | Unlocked |
| PCM dither | Hidden, off, and blocked | Unlocked |
| ECHO SRC sample-rate conversion controls | Hidden, off, and blocked | Unlocked, subject to the active audio path |
| PCM-to-SDM conversion, target-rate, quality, filter, sound-profile, and compute controls | Hidden, off, and blocked | Unlocked, subject to hardware, driver, and output-mode support |
| Remote workspace for user-configured remote libraries | Hidden and blocked | Unlocked |
| Connect workspace for supported local-network and companion-device workflows | Hidden and blocked | Unlocked |
| Pro theme presets | Hidden and blocked | Unlocked |
| Acrylic window customization | Included on supported Windows systems | Included |

All optional DSP and signal-altering audio processing belongs to ECHO Pro. Base ECHO remains a local player with unprocessed playback and supported output / passthrough paths. Pro ownership does not guarantee that a requested audio format, target rate, acceleration method, or device mode will work on a particular system. The native audio host and Audio Core remain the source of truth for the active signal path. Unsupported requests must remain disabled or fall back to a safe unprocessed configuration with a visible reason.

## Customer-facing entitlement statement

### English

ECHO Pro is an entitlement-only DLC for the ECHO desktop application. No separate download is required. Owning the DLC unlocks all optional audio processing in ECHO: ReplayGain, headroom, EQ, dynamics, stereo and channel tools, headphone and room correction, protection limiting, PCM dither, ECHO SRC, and PCM-to-SDM controls. It also unlocks the Remote and Connect workspaces and Pro theme presets. Acrylic window customization remains part of the base ECHO installation on supported Windows systems.

DSD file playback, DoP, and supported ASIO Native DSD passthrough remain part of the ECHO base edition because they are playback / passthrough paths, not optional signal processing. Available Pro audio modes still depend on the connected hardware, manufacturer driver, operating system, output mode, and compatible software. ECHO reports the path that is actually active and safely rejects or falls back from unsupported requests.

The entitlement is associated with the Steam account that owns ECHO Pro. A refund, revocation, loss of ownership, or inability to verify ownership may lock Pro features again without deleting base-edition data.

### Simplified Chinese

ECHO Pro 是基础应用 ECHO 的权益型 DLC，无需另行下载内容。购买后，会在同一份 ECHO 安装中解锁全部可选音频处理：ReplayGain、Headroom、EQ、动态处理、立体声与声道工具、耳机与房间校正、保护限幅、PCM Dither、ECHO SRC 和 PCM 转 SDM 控制；同时解锁 Remote 与 Connect 工作区以及 Pro 主题预设。在受支持的 Windows 系统上，亚克力窗口外观仍属于 ECHO 基础版。

DSD 文件播放、DoP 与受支持的 ASIO Native DSD 直通属于播放或直通路径，不是可选的信号处理，因此仍属于 ECHO 基础版。Pro 音频模式能否实际使用，仍取决于连接的硬件、厂商驱动、操作系统、输出模式与兼容软件。ECHO 会显示真正生效的信号路径，并对不受支持的请求明确拒绝或安全回退。

ECHO Pro 权益与购买它的 Steam 账号关联。退款、撤销、失去所有权或暂时无法验证所有权时，Pro 功能可能重新锁定，但不会删除基础版中的曲库和设置。

## Enforcement boundary

The renderer hides unauthorized Pro routes and controls, but renderer visibility is not the security boundary. Main-process IPC must call `requireLocalPro`, and audio capability changes must reconcile through `AudioEntitlementRuntime` before reaching the native host. Downloads and platform extraction remain outside the Steam distribution boundary regardless of Pro ownership.

## Release acceptance

Before releasing the DLC, verify all of the following in a real Steam client build produced with `ECHO_STEAM_PRO_DLC_APP_ID=5105160`:

- An ordinary account without the DLC cannot see or invoke optional DSP / audio-processing controls, Remote, Connect, or Pro themes. It can use acrylic window customization on supported Windows systems, and its active audio path remains unprocessed.
- An account that owns the DLC sees and can use the supported Pro controls.
- DSD file playback, DoP, and supported Native DSD passthrough remain available without the DLC.
- Losing or refunding the DLC relocks Pro capabilities without deleting base-edition data.
- Unsupported audio modes report the actual host-backed fallback instead of presenting a renderer-only success state.
- The base application and DLC release dates are aligned, and the DLC store page has passed Valve review before release.

Local tests, bundle checks, saved Steamworks metadata, and a published price do not replace this two-account client smoke.

## Steamworks draft status — 2026-08-15

- Store Item ID `1284859` has saved English, Simplified Chinese, Traditional Chinese, Japanese, and Korean entitlement copy matching the matrix above.
- Developer `Moekotori`, publisher `Moe Shop`, the Steam privacy-policy URL, customer-support email, interface-only language flags, five inherited base tags, and the planned release time `2026-09-08 21:20` (Asia/Hong_Kong) have been saved and read back.
- The price is active at USD `$5.99` / CNY `¥39.00`; the DLC remains entitlement-only with no separate depot.
- The page has not been submitted for Valve review or published. The local accessibility audit supports only Adjustable Text Size, Contrast Controls, and Camera Comfort; these answers have not yet been saved in Steamworks. Real owned/unowned Steam-client entitlement smoke remains required before release.
- The base ECHO store copy still contains unqualified references to EQ / DSP / audio processing in its short description, overview, about text, and Early Access current-state answer. Refresh the current all-language Steamworks JSON and qualify those references as ECHO Pro before publication; do not overwrite newer concurrent store edits from an older export.
