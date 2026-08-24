# ECHO macOS 开发构建地基

换到真实 Mac 或交给新的开发者前，请先阅读 [ECHO macOS 开发交接](./ECHO_MACOS_HANDOFF.md)。该文档记录当前实现快照、首日操作顺序、真实硬件验收表、证据模板与停止条件。

## 当前结论

macOS 目前处于 **compile + local dev app foundation** 阶段，不是可发布平台。仓库已经提供 Apple Silicon 优先的原生编译入口、unsigned 本机开发 `.app` 生成/审计入口和手动 CI，用于尽早暴露 CoreAudio、FFmpeg、Electron ABI、Steamworks native payload 与平台装配问题；它不会生成 DMG、签名、公证或 Steam depot，也不能替代真实 Mac 上的音频和桌面 smoke。

当前音频目标仅为 Native Audio Host 的 CoreAudio shared output。Renderer 仍然只是控制面，设备、播放、DSP、缓冲、EOF 与 drain 事实继续由 `AudioSession -> Native Audio Host` 持有。WASAPI Exclusive、ASIO、WDM-KS、SMTC 与 Windows taskbar helper 不在 macOS 装配范围内；在真正实现并验证新的后端前，不得用 UI fallback 模拟这些能力。

平台能力、设备枚举和 `AudioSession` 自动输出现在共用 `isNativeSharedOutputPlatform`：macOS 自动输出会选择 Native Host 的 `shared + auto`，不会再被旧的 Windows/Linux 条件误导到 `system`。这只是路由契约修复，真实 CoreAudio 出声仍需目标 Mac smoke。

## 目标平台

- 第一阶段：Apple Silicon `arm64`，在真实 Apple 硬件上完成开发构建和 smoke。
- 后续阶段：根据实际支持计划单独验证 Intel `x64`，再决定是否生成 universal 包。
- Windows、Linux 和 macOS 各自重新安装依赖并构建原生产物。禁止跨平台复制 `node_modules`、`dist`、native addon、Audio Host、FFmpeg 或 scanner。

## Mac 首次准备

在目标 Mac 上准备：

1. Xcode Command Line Tools，并确认 `xcode-select -p` 和 `xcrun --find clang` 可用。
2. 仓库 `.nvmrc` 指定的 Node 22 与 package metadata 指定的 npm 10。
3. Homebrew。仓库的 `build-resources/macos/Brewfile.dev` 统一声明 CMake、pkg-config 和 FFmpeg 开发依赖，CI 也读取同一文件。

安装 Xcode Command Line Tools、Homebrew 和正确 Node/npm 后，推荐只运行：

```bash
npm run setup:mac
```

`setup:mac` 会执行 `brew bundle`、基于锁文件执行 `npm ci`，最后运行 compile-only doctor。该命令会安装或更新 Brewfile 缺失的本机开发 formula，并替换当前 `node_modules`；不要在仍有其他 npm 进程使用同一工作树时运行。Homebrew 产物只用于开发，不是发布再分发与许可审核结论。

不要从 Windows 或另一台机器复制已经构建的依赖。若使用签名身份、notarization 凭据或 Steam 凭据，只能放入 Keychain、CI secret 或 Git 忽略的本机配置，不能写进仓库和日志。

安装完成后先运行：

```bash
npm run doctor:mac
```

该命令会拒绝 Intel/Rosetta 开发会话，检查仓库固定的 Node/npm、Xcode/SDK、CMake、pkg-config、FFmpeg CLI 与 development packages。`codesign`、`notarytool` 和 `stapler` 作为后续发布工具单独报告，不会把“能编译”误报成“能发布”。编译入口内部会以 `--compile-only` 模式再次执行这组前置检查。成功或失败的机器可读结果都会写入 Git 忽略的 `misc/macos-doctor.json`；compile-only 报告会把未检查的 release tools 记为 `null`，不会误报 ready。

## 日常热开发

首次安装完成后使用 Mac 专用入口：

```bash
npm run dev:mac
```

它会增量检查 Electron native ABI，构建 Native Audio Host 与 native scanner，然后启动 `electron-vite dev`。Mac 入口不会调用 Windows-only 的 RAOP、SMTC、taskbar helper 或 Steam leaderboard addon。音频仍沿 `Renderer -> typed preload/IPC -> AudioSession -> Native Audio Host` 运行，脚本不会引入 Renderer 音频 fallback。

仅修改 TypeScript、Renderer 或样式，并且已经确认 native 源码、Node/Electron 版本和依赖没有变化时，可以缩短循环：

```bash
npm run dev:mac:quick
```

quick 模式仍执行 doctor，并要求既有 `better_sqlite3.node`、Audio Host 和 scanner 存在，但不会重编原生产物。修改 native、CMake、FFmpeg、锁文件、Electron 或 Node 版本后必须恢复使用完整 `dev:mac`。

## 编译地基入口

```bash
npm run build:mac:foundation
```

该入口会 fail-closed 地检查：

- 当前系统确实是 macOS，并且 Node/终端原生运行在 `arm64` 而不是 Intel/Rosetta；
- Xcode developer directory 与 Clang 可用；
- CMake、pkg-config、FFmpeg CLI 和 FFmpeg development packages 可用；
- `better-sqlite3` 等 Electron native ABI 在当前 Mac 上重新构建；
- Native Audio Host 与 native scanner 能在当前 Mac 上生成可执行文件；
- main、preload 与 renderer bundle 通过 typecheck 和构建。

这个命令成功只证明当前 Mac 的编译地基通过，不证明应用可安装、可签名、公证成功、Steam 可用或真实音频稳定。

## 本机 unsigned 开发 App

```bash
npm run build:mac:dev-app
```

该入口会先执行 compile foundation，再使用现有 PNG 源图生成本机 `.icns`，最后通过 electron-builder 的 `dir` target 生成 unsigned `ECHO.app`。当前 package config 只允许 `arm64 + dir`，并显式使用 `identity: null` 与 `hardenedRuntime: false`；命令不会生成 DMG、ZIP、PKG，不会发现或使用签名身份，也不会执行 notarization。这里关闭 Hardened Runtime 只服务于完全未签名的本机开发目标，避免把未签名与 Hardened Runtime 混成不可启动的半成品，不是未来发布配置。

开发 `.app` 会装配：

- 当前 Mac 原生构建的 `echo-audio-host` 与 `echo-native-scanner`；
- 当前 Mac Electron ABI 的 `better_sqlite3.node`；
- `steamworks.js` 的 macOS `arm64` / `x64` addon 与 `libsteam_api.dylib`；
- main、preload、renderer、第三方 notices 和必要运行资源。

构建完成后 `verify:mac:dev-app` 会检查 `.app/Contents` 结构、目标架构、Mach-O 动态库、ASAR 关键入口和可执行权限，并拒绝 Windows Steamworks、RAOP prebuild、SMTC/taskbar helper、VC runtime、`steam_appid.txt` 与 VDF。审计会解析每个关键 Mach-O 的 `otool -L` 结果，把 `/System/Library`、`/usr/lib` 与 bundle-relative 链接同其他机器绝对路径分开记录。机器可读报告写入 Git 忽略的 `misc/macos-dev-app-audit.json`；开发包对 Homebrew 等机器本地链接只给出“仅限本机”警告，正式发布检查必须拒绝这种依赖。

文件关联现在由跨平台打包白名单统一生成；macOS 审计会从 `Info.plist/CFBundleDocumentTypes` 重新读取并确认 FLAC、MP3、WAV、M4A、AIFF 与 CUE 等核心类型。主进程在 `whenReady()` 之前注册 Finder/LaunchServices `open-file` 事件，启动早期先进入现有本地文件队列，Renderer 加载完成后再通过既有类型化控制面处理。运行中的 App 会恢复并聚焦窗口。macOS 还会安装原生 Application/Edit/Playback/View/Window 菜单；菜单只发送既有控制命令，不持有播放事实。

开发 `.app` 仍依赖当前 Mac 的 Homebrew FFmpeg/dylib 环境，不得发给朋友、上传 Steam、作为下载包或用于商店审核。

构建后可直接从终端启动并保留 Electron/native 日志：

```bash
npm run launch:mac:dev-app
```

需要验证 LaunchServices/Dock 启动而不是终端直启时使用 `npm run launch:mac:dev-app -- --finder`。脚本会兼容 electron-builder 的 `dist/mac-arm64/ECHO.app` 与 `dist/mac/ECHO.app` 两种目录，不再要求开发者手动猜路径。这里启动的仍是本机 unsigned 开发包。

`build-resources/macos/entitlements.mac.plist` 与 `entitlements.mac.inherit.plist` 只是一组尚未接入开发 target 的最小发布草案，包含 Electron/V8 所需的 JIT 与 unsigned executable memory 权限；目前不包含 App Sandbox、DYLD 环境变量或关闭 library validation 的放宽项。未来独立发布配置必须重新启用 Hardened Runtime、接入主/继承 entitlements，并在同一签名身份下覆盖 Electron helpers、Audio Host、scanner、Steamworks dylib 和所有 `.node`。真实签名前不会把这些草案描述为已验证。

## Apple Silicon 原生 smoke

完成 foundation 或 dev app 构建后运行：

```bash
npm run smoke:mac:native
```

该入口会验证 Native Audio Host 的 WAV/FLAC/MP3 解码、无设备 daemon ping/shutdown、native scanner 协议与 CoreAudio 设备枚举，并把证据写入 Git 忽略的 `misc/macos-native-smoke.json`。真实 Mac 默认要求至少枚举到一个输出设备；只有无声卡的 CI 可以显式使用 `--allow-no-device`。这仍不证明声音实际从目标 DAC 输出，不能替代应用内的播放、暂停、seek、切歌、EOF/drain 和拔插设备验收。

## CI

`.github/workflows/macos-foundation.yml` 是手动触发的 Apple Silicon foundation workflow。它安装 Mac 构建依赖、运行平台/打包/Finder 生命周期契约 focused tests、构建并执行 Native Audio Host CTest，生成和审计 unsigned 开发 `.app`，最后执行不要求 CI 音频硬件的 native smoke。当前不上传 `.app` 或 native artifact，避免把 CI 产物误当成本机或发布构建复用。

CI 不能替代以下真实 Mac 验收：

- CoreAudio 设备枚举、默认设备变化、耳机/HDMI/USB DAC 切换；
- 导入、本地播放、暂停/恢复、seek、切歌、队列完成与退出 drain；
- 睡眠/唤醒、采样率变化、长时间播放、拔插设备与错误恢复；
- 菜单栏、Dock、窗口、全屏、快捷键、媒体键与登录启动行为；
- Steam 客户端启动、Overlay、AppID、所有权、Cloud、branch 与退出清理。

## 发布构建前仍需完成

以下项目未完成前，README、商店页面和 UI 都不得宣称支持 macOS：

1. 固定来源、版本、许可证与商业再分发边界的 macOS FFmpeg/native dependency 方案，并处理 dylib/rpath、notices 与最终包审计。
2. 将当前仅允许 `arm64 + dir` 的开发配置升级为独立发布配置，完成 x64/universal 决策、最终资源白名单和可分发包格式；现有 `.icns` 生成只证明开发资源链可用。
3. Steamworks macOS native dependency、正式 AppID 注入、Mac depot 与真实 Steam 客户端验证。
4. 建立独立发布配置，将当前未签名 dev target 切换为 Developer ID 签名、Hardened Runtime、已验证的主/继承 entitlements、notarization、stapling 与签名后验证；不得直接把开发 target 当发布 target 使用。
5. 干净 Mac 上的安装、Gatekeeper、启动、更新、卸载与用户数据隔离验证。
6. CoreAudio shared-output 的设备、播放、DSP、EOF/drain 和故障恢复 smoke；任何高级或 bit-perfect 输出能力必须单独实现和验证。
7. 发布产物文件树、ASAR、native addon、dylib、FFmpeg、域名、第三方 notices 和许可证的最终审计。

只有目标架构真实构建、签名、公证、安装、Steam 和音频 smoke 全部通过后，才能把 macOS 状态从“开发地基”更新为“受支持平台”。
