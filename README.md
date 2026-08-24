# ECHO Steam

ECHO 的独立 Steam 发行仓库。当前处于 Beta 阶段，目标是在保留本地音乐、媒体库、Audio Core、DSP 与原生音频宿主的前提下，提供边界清晰、可审计、适合 Steam 分发的桌面音乐播放器。

本仓库不是 `ECHODev` 的直接镜像。上游功能进入 Steam 版前，必须单独确认产品必要性、第三方授权、网络与隐私边界、生产依赖以及最终发布物内容。

[当前状态](#当前状态) · [主要能力](#主要能力) · [快速开始](#快速开始) · [Steam-发布边界](#steam-发布边界) · [构建与验证](#构建与验证) · [相关文档](#相关文档)

## 当前状态

| 项目 | 现状 |
| --- | --- |
| 产品名称 | ECHO |
| 包名 | `echo-steam` |
| 开发阶段 | Beta；具体版本以 [`package.json`](./package.json) 为准 |
| 当前发布主线 | Windows x64；支持已签名 loose depot、SteamPipe 预览和私有测试分支流程 |
| Linux | 已有 Linux x64 的 AppImage / deb 开发构建链路，但 Steam runtime、FFmpeg 许可与最终产物边界尚未完成发布级收口 |
| macOS | 已建立 Apple Silicon 优先的 compile foundation、unsigned 本机开发 `.app` 生成/审计入口与手动 CI；尚无可发布打包、签名、公证和真实设备验收链路 |
| 许可 | Source-available，不是开源许可证；仅允许协议明确授予的审阅、学习和个人本地构建等用途 |

当前 README 只描述已经进入 Steam 仓库装配或已经明确建立的开发流程。静态检查通过只代表对应技术检查项通过，不等于完成真实 Steam 客户端验证，也不构成版权、商标或法律安全结论。

## Steam 版定位

Steam 版保留 ECHO 的本地播放器核心，不因为普通版存在某项能力就自动带入。

保留并持续维护：

- 本地文件导入、扫描、元数据、封面、专辑、歌手、文件夹、播放列表、喜欢与播放历史。
- Audio Core、Native Audio Host、播放队列、设备状态、解码、seek、曲目完成与错误解释。
- ECHO SRC、EQ、ReplayGain、PCM dither、声道处理，以及受设备和输出模式约束的 SDM / DSD 实验链路。
- 沉浸歌词、桌面歌词、歌词候选与本地 LRC 调整。
- 用户明确配置的远程音乐库，包括 WebDAV、Jellyfin、Emby、SMB、SSHFS 与 Subsonic 兼容服务。
- DLNA、AirPlay、ECHO Link Basic、MQTT 等独立的局域网或用户自有服务连接能力。
- Steamworks 状态、Rich Presence、Cloud / Achievement 基础能力与 Steam Workshop 数据内容链路。
- Windows 托盘、迷你播放器、任务栏播放器、SMTC 与 UltraLight 低界面占用模式。

Steam 发布装配明确不提供：

- 音乐或视频下载器、`yt-dlp`、歌单下载、平台解析下载。
- YouTube、Spotify、Tidal、Qobuz、网易云音乐、QQ 音乐、酷狗、Bilibili 等第三方音乐平台的搜索、登录、Cookie、解析或在线播放实现。
- MV 搜索、解析、缓存、下载和播放链路。
- 主进程/Node/native 可执行插件入口；Steam Workshop 仅允许经过校验、逐项授权并在 opaque iframe 中运行的 HTML/JavaScript 沙箱插件。
- 绕过 Steam 发布渠道覆盖应用文件的外部自更新器。

相关实现源码可能为了低风险迁移暂时保留在仓库中，但不得进入 Renderer 路由、Preload API、Main / IPC 装配、生产依赖、资源清单或最终发布物。

## 主要能力

### 媒体库

- 基于 SQLite 的本地曲库与分页查询。
- 原生扫描器、元数据 worker、封面处理和目录重扫。
- 本地文件、CUE、Audio CD 与多种常见音频格式的统一媒体入口。
- 曲库快照、扫描保护、损坏数据库隔离与恢复工具。
- Steam 版使用独立的 `ECHO Steam` 用户数据目录；跨版本共享只通过明确的曲库与设置同步边界完成。

### Audio Core 与 DSP

本地播放的数据面由 Native Audio Host 持有。Renderer 只是控制与展示层，不能成为播放进度、decoder EOF、设备状态或 DSP 生效状态的事实来源。

当前链路覆盖：

- 本地文件读取、libav 解码、FIFO、输出 drain 与播放完成判定。
- System、WASAPI Shared、WASAPI Exclusive 与 ASIO 等 Windows 输出路径。
- ECHO SRC、EQ、ReplayGain、PCM dither、声道处理与响度 / 削波保护。
- DSD 文件、DoP、ASIO Native DSD 与 PCM -> SDM 实验路径；不满足设备或输出条件时必须明确失败或回落，不能在 UI 中假装生效。

任何 DSP 都可能改变音频信号。界面和日志必须诚实报告 bit-perfect 影响、实际输出模式与 fallback 原因。

### 歌词与桌面体验

- 沉浸歌词页、逐字高亮、翻译、偏移与可读性设置。
- 桌面歌词、迷你播放器、任务栏播放器和系统媒体控制。
- UltraLight 模式可卸载主要 Renderer UI，并通过托盘、快捷键或原生悬浮播放器继续控制与恢复。

### Steamworks 与创意工坊

Steamworks 客户端只由主进程持有。Renderer 通过类型化 Preload / IPC 获取经过清理的状态，不接触原始 Steam client、认证票据、安装目录或凭据。

当前 Workshop 基础链路支持对订阅内容进行下载状态读取、校验、暂存、启用与修复，并可显式应用声明式主题、歌词场景、可视化和 DSP / EQ 预设；已启用的歌词场景还能在歌词设置中直接切换并恢复内置布局。工坊作者还可发布不含二进制的音频插件接入配置：用 VST3 Class ID 描述订阅者本机已安装的效果器或音源、参数映射、便携预设和路由建议；ECHO 本体与工坊包都不代为分发第三方插件。主题可提供隔离的完整 UI runtime；`.echo` 功能插件可在用户确认精确权限后注册命令、面板、可搜索音源提供器、用户可选的歌词源和作者自写 Agent，并声明由宿主统一渲染、按插件隔离保存的文本、数字、开关与选项设置。插件还可按声明使用应用导航、播放控制、Audio Core 只读频谱、结构化曲库、收藏与本地播放列表、宿主播放队列、会话级确认的 HTTP(S) 直链音源、固定域名的受限 HTTP(S) JSON/文本连接和私有状态。音源提供器由作者实现搜索和解析逻辑，ECHO 校验结果并持有搜索界面、来源确认、队列与播放；歌词源只接收当前歌曲的清理后元数据并返回有上限的 LRC/文本候选。`playback:share` 允许一起听插件把当前本地歌曲流式上传到清单声明的服务：每次上传由用户确认，插件只得到任务进度和播放 URL，不得到路径或文件句柄。所有 HTML/JavaScript 都只从内容寻址的已启用修订进入 opaque iframe，不会获得 Node、任意文件、浏览器 Cookie、Steamworks、原始 IPC 或 native host 访问；网络连接只能通过用户已批准的 `network:request` 调用清单列出的域名。

## 架构边界

```text
React Renderer
  页面、设置、播放器控制与状态展示
        |
Typed Preload / IPC
        |
Electron Main Process
  生命周期、窗口、Steamworks、曲库服务与控制编排
        |
        +-- Library Core
        |     SQLite、扫描、元数据、封面、播放列表、远程库
        |
        +-- Audio Core
        |     会话、队列、设备、DSP 规划与状态解释
        |
        +-- Native Hosts
              解码、ECHO SRC、Dither、SDM、WASAPI / ASIO、SMTC
```

音频修改必须沿 `Renderer -> Typed Preload / IPC -> AudioSession -> Native Host` 追踪。新功能先判断是否应进入 Steam 发布物，再选择现有模块边界；不要把独立职责继续堆进超大文件。

## 开发环境

| 依赖 | 要求 |
| --- | --- |
| Node.js | `22.23.2`；仓库通过 `.nvmrc`、`.node-version` 与 Volta 固定 |
| npm | `10.9.8`；以 `package.json#packageManager` 为准 |
| Git | 2.x |
| Python | 3.x，供部分原生依赖构建链使用 |
| CMake | 3.24 或更高 |
| Windows C++ 工具链 | Visual Studio 2022，安装 Desktop development with C++ 与 Windows SDK |

不要在设备之间复制 `node_modules`、`out`、`dist`、原生构建产物、签名文件或 `.env`。每台设备都应使用锁文件和本机工具链重新准备依赖与原生模块。

## 快速开始

Windows：

```powershell
git clone https://github.com/Moekotori/ECHOSteam.git
cd ECHOSteam
npm run setup -- --mirror  # 中国大陆网络；其他地区使用 npm run setup
npm run doctor
npm run dev
```

`npm run setup` 会检查主要工具链并按 `package-lock.json` 安装依赖。`--mirror` 会配置当前开发环境使用的 npm、Electron 与 electron-builder 镜像；不要把个人代理、令牌或私有镜像凭据提交到仓库。

普通开发使用 `npm run dev`。需要同时准备完整 Windows SMTC 宿主时使用：

```powershell
npm run dev:full
```

在 Windows 与 Apple Silicon Mac 之间切换日常开发时，可以使用统一入口：

```bash
npm run setup:auto       # 首次准备，自动选择 Windows/macOS 安装入口
npm run dev:status       # 查看平台、版本、分支、upstream 与工作树状态
npm run dev:auto         # 仅按当前平台启动开发
npm run dev:handoff      # 旧设备检查提交、推送与工作树是否可交接
npm run dev:switch       # 新设备安全 fast-forward 后按当前平台启动
```

切换脚本不会 stash、rebase、覆盖未提交改动或复制跨平台原生产物。完整约定见 [Windows / macOS 日常切换开发](./docs/ECHO_CROSS_DEVICE_DEVELOPMENT.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run setup` | 检查环境并按 lockfile 初始化当前设备 |
| `npm run setup:auto` | 按当前系统选择 Windows 或 Apple Silicon macOS 首次准备入口 |
| `npm run doctor` | 诊断 Node、npm、Python、CMake、MSVC 与 Windows SDK |
| `npm run doctor:auto` | 按当前系统运行对应开发环境诊断 |
| `npm run dev` | 增量准备必要原生组件并启动开发环境 |
| `npm run dev:auto` | 按当前系统选择 Windows `dev` 或 macOS `dev:mac` |
| `npm run dev:status` | 查看当前设备、工具版本与 Git 交接状态，不修改仓库 |
| `npm run dev:handoff` | 在旧设备检查分支、工作树和 upstream 是否已经可交接 |
| `npm run dev:switch` | 在干净的新设备 fetch、仅 fast-forward 并启动对应开发入口 |
| `npm run dev:full` | 额外准备完整 SMTC 宿主后启动开发环境 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行 Vitest 测试；日常改动优先选择 focused test |
| `npm run build` | 类型检查并构建 main、preload 与 renderer bundle |
| `npm run build:quick` | 本地快速 bundle 构建，不替代提交前的完整检查 |
| `npm run check:file-growth` | 检查受保护超大文件没有继续增长 |
| `npm run check:steam-distribution` | 检查已构建 bundle 的 Steam 裁剪边界 |
| `npm run check:third-party-notices` | 检查第三方组件与 notices 记录 |
| `npm run build:win:dir` | 构建并审计 Windows unpacked 目录包 |
| `npm run build:win:steam` | 构建已签名的 Windows Steam loose depot |
| `npm run setup:mac` | 在 Apple Silicon Mac 上按共享 Brewfile 安装开发依赖、执行 `npm ci` 并检查环境 |
| `npm run doctor:mac` | 在 Apple Silicon Mac 上检查原生编译环境，并单独报告签名/公证工具准备度 |
| `npm run dev:mac` | 增量准备 Mac 原生产物并启动 Electron 热开发；不装配 Windows helper |
| `npm run build:mac:foundation` | 仅在真实 macOS 上验证原生宿主、scanner 与 Electron bundle 编译地基，不生成发布包 |
| `npm run build:mac:dev-app` | 在真实 macOS 上生成并审计仅供本机使用的 unsigned `.app`，不生成 DMG 或发布包 |
| `npm run launch:mac:dev-app` | 从终端启动 unsigned 开发 `.app` 并保留 Electron/native 日志 |
| `npm run smoke:mac:native` | 在真实 Apple Silicon Mac 上验证 native decode、daemon、scanner 与 CoreAudio 设备枚举 |
| `npm run steam:release:preflight` | 生成发布前检查记录、文件清单与 SHA-256 |
| `npm run steam:depot:prepare` | 在本机生成 SteamPipe 预览配置，不上传 |
| `npm run workshop:sdk:check` | 检查公共 Workshop SDK、脚手架、Schema 和哈希保护 |
| `npm run workshop:sdk:pack` | 生成可独立分发的 Workshop SDK `.tgz` 开发包，不发布到 npm |

## 构建与验证

普通代码改动先运行最小充分验证：

```powershell
npm run typecheck
npm run check:file-growth
```

涉及路由、Preload、IPC、生产依赖或 Steam 裁剪边界时，至少运行：

```powershell
npm run build
npm run check:steam-distribution
npm run check:third-party-notices
npm run check:file-growth
```

`check:steam-distribution` 检查 bundle、生产依赖与已知禁止标记，但它不是最终包审计。只有修改打包、依赖、资源边界或准备实际发布时，才需要生成 Windows unpacked 包并检查 `app.asar`、`app.asar.unpacked` 与 `resources`：

```powershell
npm run build:win:dir
```

音频修改按风险追加相关 Audio Core focused tests。只有触及 Native Host 时才运行原生 build、CTest 或设备 smoke；普通 README、文案或小 UI 改动不应触发耗时的全量音频测试。

## Steam 发布边界

构建签名 Steam loose depot 需要在受保护环境中配置正式 App ID 与 Windows 代码签名变量：

```powershell
$env:ECHO_STEAM_RELEASE_APP_ID='<app-id>'
npm run build:win:steam
npm run steam:release:preflight
```

发布前置记录会拒绝脏工作树、缺失 App ID、失败的裁剪 / notices / 签名 / 最终产物检查，以及进入 depot 的 `steam_appid.txt`、VDF 或其他本地开发文件。

SteamPipe 生成器默认只创建预览配置。上传命令仅允许显式批准的私有测试分支，并拒绝 `default` 与 `public`；公开分支提升仍是 Steamworks 后台中的独立人工操作。完整流程见 [Steamworks 集成与发布说明](./docs/steamworks-integration.md)。

静态检查、签名成功和生成 depot 都不能替代真实 Steam 客户端 smoke。实际发布前必须在干净 Windows 环境中验证 Steam 启动、Overlay、App ID / BuildID / beta branch、所有权、Cloud 状态、本地导入、播放、暂停 / 恢复、seek、切歌和退出。

## 上游同步

- `origin` 指向独立的 `ECHOSteam` 仓库；`upstream` 用于跟踪 `ECHODev`。
- 不得无审查覆盖 Steam 的路由表、Preload API、IPC 注册器、Service 装配、`package.json`、打包配置或 Steam 校验脚本。
- 上游重新引入下载、平台流媒体、MV、插件执行、外部更新器或未经确认的第三方素材时，默认保留 Steam 侧隔离边界并单独处理冲突。
- 上游合并后必须重新运行 Steam 裁剪检查；准备发布时还要重新完成最终产物与许可审计。

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [Steamworks 集成与发布说明](./docs/steamworks-integration.md) | Rich Presence、已签名 loose depot、preflight、SteamPipe 与真实 Steam smoke |
| [ECHO Pro Steam DLC](./docs/steam-pro-dlc.md) | Pro 权益范围、基础版边界、Steam 所有权校验与发行验收 |
| [Steam Workshop foundation](./docs/ECHO_STEAM_WORKSHOP_FOUNDATION.md) | Workshop 数据内容、校验、暂存、启用与应用边界 |
| [Workshop 歌词场景 Schema](./docs/ECHO_WORKSHOP_LYRICS_SCENE_SCHEMA.md) | 声明式歌词场景能力与限制 |
| [Workshop 沙箱插件 API](./docs/ECHO_WORKSHOP_PLUGIN_API.md) | `.echo` 插件包、命令、面板、权限与作者示例 |
| [Workshop SDK](./docs/workshop-sdk/README.md) | 可移植类型声明、JSON Schema、零依赖 CLI、插件 starter 与 CI 模板 |
| [Workshop 音频插件接入配置](./docs/ECHO_WORKSHOP_AUDIO_PLUGIN_PROFILE.md) | VST3 / VST3i 本地依赖、参数映射、预设与适配器边界 |
| [总体架构](./docs/ECHO_ARCHITECTURE.md) | Renderer、Main、Library Core、Audio Core 与原生宿主关系 |
| [Audio Core](./docs/ECHO_AUDIO_CORE.md) | 播放事实、输出模式、DSP 与验证策略 |
| [Native Audio Pipeline](./docs/ECHO_NATIVE_AUDIO_PIPELINE.md) | Native Host 数据面、迁移现状与多人协作边界 |
| [Library Core](./docs/ECHO_LIBRARY_CORE.md) | 曲库、扫描、元数据、封面和数据安全 |
| [EQ](./docs/ECHO_EQ.md) | EQ、DSP、削波与 bit-perfect 边界 |
| [Linux 构建](./docs/ECHO_LINUX_BUILD.md) | 当前 Linux x64 开发构建流程 |
| [macOS 开发构建地基](./docs/ECHO_MACOS_BUILD.md) | Apple Silicon 优先的编译入口、CI、真实 Mac 验收与发布阻塞项 |
| [macOS 开发交接](./docs/ECHO_MACOS_HANDOFF.md) | 当前实现快照、接手顺序、真实硬件验收、证据模板与停止条件 |
| [超大文件职责地图](./docs/ECHO_OVERSIZED_FILE_MAP.md) | 受保护大文件入口与维护导航 |
| [ECHO Steam 最终用户许可协议](./EULA.md) | 消费者软件许可、Steamworks、Pro DLC、创意工坊与强制消费者权利 |
| [ECHO Steam 隐私政策](./PRIVACY.md) | 本地数据、Steamworks、远程音乐库、可选统计与诊断边界 |
| [第三方组件清单](./THIRD_PARTY_NOTICES.md) | 生产依赖、原生组件、字体与 notice 义务 |

## License

ECHO 使用 [ECHO Source-Available License](./LICENSE)。该协议不是开源许可证。请在构建、修改、贡献、分发或使用项目名称与素材前阅读完整条款；未经授权不得发布修改版构建、重新分发安装包、绕过权益或完整性检查，也不得将非官方版本表述为官方 ECHO。
