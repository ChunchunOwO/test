# ECHO macOS 开发交接

> 更新时间：2026-08-17
>
> 目标：让下一台 Apple Silicon Mac、下一位开发者或下一次 AI 会话不依赖聊天记录即可继续工作。
>
> 当前状态：**开发地基已进入仓库工作树，但尚未取得真实 Mac 构建、桌面、音频、签名、公证或 Steam 客户端证据。macOS 仍不是受支持或可发布平台。**

## 1. 接手时先读什么

按以下顺序恢复上下文：

1. 仓库根目录 `AGENTS.md`：跨平台、Steam、发布和安全边界的最高优先级约定。
2. `README.md`：产品范围、当前平台状态和常用命令。
3. `docs/ECHO_MACOS_BUILD.md`：Mac 工具链、构建入口、开发 `.app`、CI 与发布阻塞项。
4. 本文：当前实现快照、接手顺序、验收表和停止条件。
5. 涉及音频时继续读 `docs/ECHO_AUDIO_CORE.md` 与 `docs/ECHO_NATIVE_AUDIO_PIPELINE.md`；涉及 Steam 时继续读 `docs/steamworks-integration.md`。

仓库文档是跨电脑交接事实源，但分支、远端 Steamworks 和本机工具链都可能变化。开始前必须重新读取实际状态，不能只照抄本文的日期快照。

## 2. 当前快照与证据边界

编写本文时的本地快照：

| 项目 | 快照 |
| --- | --- |
| 分支 | `main` |
| HEAD | `4ac044601af8b0fc84d64f2e19deeb1ab1869ba6` |
| 与远端关系 | `main...origin/main [ahead 1, behind 1]` |
| 工作树 | 非干净；包含 macOS 地基改动，也包含其他进程的 Workshop 改动 |
| 当前发布主线 | Windows x64 |
| macOS 第一目标 | 真实 Apple Silicon `arm64` |
| macOS 可宣称状态 | compile + local unsigned dev app foundation，仅限开发 |

这个快照不是提交记录，也不代表这些改动已经推送。接手时先运行：

```bash
git status --short --branch
git rev-parse HEAD
git log -1 --oneline
```

当前工作树有并行改动时：

- 不要执行整仓格式化、整仓暂存或批量回退。
- 不要把 Workshop 文件误算作 macOS 地基改动。
- 不要直接在脏工作树上 `pull`、rebase 或切换分支；先由用户决定如何保存和归属未提交改动。
- 本文不构成提交、推送、上传 depot、切换 Steam 分支或发布的授权。

## 3. 不可破坏的架构边界

macOS 适配必须保持现有权威链路：

```text
Renderer 控制面
  -> typed preload / IPC
  -> AudioSession
  -> Native Audio Host / Audio Core
  -> CoreAudio shared output
```

必须遵守：

- Renderer 只发出控制意图和展示状态，不持有设备、播放、DSP、缓冲、EOF 或 drain 真相。
- 第一阶段只装配 CoreAudio shared output。WASAPI Exclusive、ASIO、WDM-KS、SMTC 和 Windows taskbar helper 不属于 macOS 能力。
- 不得用 UI fallback 或 Web Audio 伪装原生后端已支持。
- Windows、Linux、macOS 各自在本平台重新安装依赖和构建原生产物；禁止复制 `node_modules`、`dist`、`.node`、Audio Host、scanner 或 FFmpeg 产物。
- 平台差异放进清晰命名的 adapter、service、backend 或构建脚本，不把散落的 `process.platform` 判断扩散到 Renderer。
- 业务代码与共享配置不得写入 Homebrew、用户目录或某台电脑的绝对路径。

## 4. 已经落地的开发地基

以下是代码或构建契约已经具备的内容，不等于已经在真实 Mac 上通过：

| 区域 | 当前入口或实现 | 已证明什么 | 尚未证明什么 |
| --- | --- | --- | --- |
| 环境检查 | `npm run doctor:mac` | 会拒绝非 macOS、Intel/Rosetta 和错误 Node/npm；检查 Xcode、SDK、CMake、pkg-config、FFmpeg | 当前目标 Mac 的实际工具链可用性 |
| 首次准备 | `npm run setup:mac` | CI 与本机共用 `build-resources/macos/Brewfile.dev`，统一安装 Brew 依赖并执行 `npm ci` | 可分发依赖与许可证结论 |
| 日常开发 | `npm run dev:mac` / `dev:mac:quick` | 只准备 Mac 所需 ABI、Audio Host、scanner 并启动热开发；排除 Windows helper | 真实 Mac 上的启动与交互结果 |
| 自动输出路由 | `AudioSession.resolveAutomaticOutputSettings` | macOS 与能力表、设备枚举一致地选择 Native Host `shared + auto` | CoreAudio 默认设备实际出声与切换 |
| 原生编译 | `npm run build:mac:foundation` | 已建立 Electron ABI、Audio Host、scanner、TypeScript/Electron bundle 的 arm64 构建链 | 真实 Mac 编译成功、应用可启动、声音可输出 |
| 开发 App | `npm run build:mac:dev-app` | 仅生成 unsigned `arm64 + dir` 开发 `.app`，明确不生成发布包 | DMG、Developer ID、Hardened Runtime、公证和 Gatekeeper |
| 产物审计 | `npm run verify:mac:dev-app` | 检查 App 结构、ASAR、架构、执行位、Info.plist、Mach-O 依赖并拒绝 Windows payload | 可移植依赖、发布许可与最终签名完整性 |
| 原生 smoke | `npm run smoke:mac:native` | 覆盖解码、daemon 协议、scanner 和 CoreAudio 设备枚举 | 实际出声、长播、热插拔、EOF/drain 和应用级交互 |
| Finder 文件打开 | `src/main/app/macosOpenFile.ts` | `open-file` 进入既有本地文件队列，支持启动早期排队与运行中聚焦 | Finder 双击在真实 `.app` 中的行为 |
| 路径身份 | `src/main/app/localFilePathIdentity.ts` | macOS 保留路径大小写，Windows 保持不区分大小写语义 | 大小写敏感卷、外置卷和别名的实际行为 |
| 原生菜单 | `src/main/app/macosApplicationMenu.ts` | Application/File/Edit/Playback/View/Window 菜单发送既有控制命令 | 快捷键冲突、全屏和窗口生命周期体验 |
| 签名草案 | `build-resources/macos/entitlements.mac*.plist` | 保存最小权限候选；未接入 unsigned dev target | Developer ID 签名、公证和权限是否充分 |
| CI | `.github/workflows/macos-foundation.yml` | 手动 macOS foundation workflow 已定义，且不上传开发产物 | CI 实际运行结果和真实桌面/声卡证据 |

相关实现入口集中在：

- `scripts/doctor-macos.mjs`
- `scripts/setup-macos.mjs`
- `scripts/prepare-macos-native.mjs`
- `scripts/dev-macos.mjs`
- `scripts/build-macos-foundation.mjs`
- `scripts/build-macos-dev-app.mjs`
- `scripts/launch-macos-dev-app.mjs`
- `scripts/prepare-macos-icon.mjs`
- `scripts/verify-macos-dev-app.mjs`
- `scripts/smoke-macos-native.mjs`
- `native/audio-host/CMakeLists.txt`
- `src/main/audio/FfmpegToolchain.ts`
- `src/shared/utils/audioPlatformCapabilities.ts`
- `src/main/app/lifecycle.ts`
- `src/main/app/localFileOpen.ts`

## 5. 第一台 Mac 的接手顺序

### 5.1 硬件与系统

- 使用真实 Apple Silicon Mac，终端 `uname -m` 必须返回 `arm64`。
- 不把黑苹果、Intel Mac、Rosetta 或虚拟机作为发布依据。
- 首轮只处理 `arm64`；不要在没有需求和证据时同时扩展 `x64` 或 universal。

### 5.2 安装本机依赖

安装 Xcode Command Line Tools、Homebrew 和正确版本的 Node/npm 后，在仓库目录运行一键准备：

```bash
node -v
npm -v
npm run setup:mac
```

期望版本是 Node `22.23.2`、npm `10.9.8`。`setup:mac` 会按共享 Brewfile 安装 CMake、pkg-config、FFmpeg，执行 `npm ci` 并运行 doctor。它会替换 `node_modules`，不要与同一工作树里的 npm/dev 进程并行运行。Homebrew FFmpeg 只用于本机开发；它不是可再分发方案，也不能直接成为发布产物依赖。

### 5.3 按层验证

```bash
npm run dev:mac
npm run build:mac:foundation
npm run build:mac:dev-app
npm run verify:mac:dev-app
npm run smoke:mac:native
```

构建完成后应记录：

- 开发 App：`dist/mac-arm64/ECHO.app` 或 electron-builder 实际报告的 `dist/mac/ECHO.app`。
- 环境诊断：`misc/macos-doctor.json`。
- App 审计：`misc/macos-dev-app-audit.json`。
- 原生 smoke：`misc/macos-native-smoke.json`。
- 当前提交 SHA、Mac 型号、macOS 版本、Node/npm 版本和测试声卡。

`misc/` 是 Git 忽略的本机证据目录。需要长期保留的结论应整理进本文或对应正式文档，不要提交机器路径、用户名、Steam 凭据或完整私人日志。

### 5.4 启动开发 App

首次启动只验证本机 unsigned 开发包，不要把它发送给其他人：

```bash
npm run launch:mac:dev-app
```

该入口会自动找到两种已知 electron-builder 输出目录，并直接运行 bundle executable，让 Electron/native 日志保留在终端。验证 LaunchServices 时改用 `npm run launch:mac:dev-app -- --finder`。不要通过临时删除安全属性、关闭系统安全策略或放宽 entitlements 来掩盖构建问题；先保存错误和 `codesign`/`otool` 证据，再修正构建链。

## 6. 真实 Mac 验收清单

每项只在取得对应证据后标记通过。

### A. 构建与产物

- [ ] `doctor:mac` 在原生 arm64 终端通过。
- [ ] `build:mac:foundation` 从干净依赖安装完成。
- [ ] `build:mac:dev-app` 生成 `.app`。
- [ ] `verify:mac:dev-app` 通过，关键 Mach-O 全为 arm64。
- [ ] App 内不存在 `.exe`、`.dll`、VC runtime、Windows Steamworks、RAOP prebuild、VDF 或 `steam_appid.txt`。
- [ ] 开发包的机器绝对 dylib 依赖已记录，未被误称为可分发。

### B. 桌面与生命周期

- [ ] Finder 双击支持的音频文件可冷启动并打开。
- [ ] App 已运行时再次打开文件会恢复并聚焦窗口。
- [ ] Dock、关闭窗口、重新打开窗口、退出和重新启动行为符合 macOS 习惯。
- [ ] Application/File/Edit/Playback/View/Window 菜单可用且不会重复触发。
- [ ] 全屏、最小化、隐藏、睡眠/唤醒没有丢失窗口或会话。
- [ ] 文件路径大小写、空格、中文、外置卷和符号链接不被错误归一化。

### C. 音频与设备

- [ ] 内置扬声器播放、暂停、恢复、seek、切歌和自然 EOF 正常。
- [ ] 耳机、HDMI 和至少一台 USB DAC 可枚举与切换。
- [ ] 系统默认输出变化能正确反映到 Audio Core。
- [ ] 播放中拔插设备会给出可理解错误并可恢复。
- [ ] 44.1/48/96 kHz 等实际拥有的设备格式经过验证，不臆测未测能力。
- [ ] DSP 开关、增益、暂停后 drain 和队列自动切歌以 Native Host 状态为准。
- [ ] 长时间播放、睡眠/唤醒后恢复与退出清理通过。

### D. 输入与系统集成

- [ ] 菜单快捷键不与文本编辑、抽屉 Escape 或系统快捷键冲突。
- [ ] 媒体键行为经真实 Mac 验证；未实现时不在 UI 宣称支持。
- [ ] 登录启动、通知、权限提示和辅助功能依赖均有明确行为。

### E. Steam，仅在单独获得授权后

- [ ] 确认目标是 ECHO 正式 AppID `5105090`，不是 Playtest、package、depot 或 Store Item ID。
- [ ] Mac Steamworks native dependency 在最终 App 中架构和签名正确。
- [ ] 通过真实 Steam 客户端验证启动、Overlay、所有权、Cloud、退出清理和目标 branch。
- [ ] Mac depot、上传、branch 变更和公开发布分别取得用户明确批准。

### F. 发布级验证，当前全部未完成

- [ ] 独立 release 配置，不复用 unsigned dev target。
- [ ] Developer ID、Hardened Runtime、主/继承 entitlements 和所有嵌套代码签名通过。
- [ ] notarization、stapling、`spctl`/Gatekeeper 与干净 Mac 安装通过。
- [ ] FFmpeg、native dylib、`.node`、Steamworks 和所有资源的来源、版本、许可证及商业再分发义务可追溯。
- [ ] 最终 DMG/ZIP/PKG 形式与 arm64/x64/universal 策略已决策并验证。
- [ ] 最终产物树、ASAR、依赖、域名、notices 和敏感文件完成审计。

## 7. 证据记录模板

每次真实 Mac 验收可复制以下模板到对应 issue、任务记录或本文后续章节：

```text
日期：
结论：PASS / FAIL / BLOCKED
分支与提交：
工作树是否干净：
Mac 型号：
macOS 版本：
架构与 Rosetta 状态：
Node / npm：
Xcode / SDK：
构建命令：
App 路径与 SHA-256：
输出设备 / 连接方式：
测试媒体来源与格式：
通过项：
失败项与最小复现：
日志或报告路径：
尚未覆盖的边界：
```

不要只写“Mac 没问题”。需要区分静态契约、CI、真实桌面、真实声卡、签名、公证和 Steam 客户端证据。

## 8. 已知阻塞项与优先级

### P0：取得第一份真实 Apple Silicon 证据

1. 在目标 Mac 运行 `doctor:mac`、foundation、dev app、审计和 native smoke。
2. 只修复实际暴露的编译、架构、rpath 或生命周期问题。
3. 完成内置输出和一台外接设备的应用级播放 smoke。

### P1：收口 CoreAudio 和桌面行为

1. 默认设备变化、热插拔、睡眠/唤醒、长播和 EOF/drain。
2. Finder 打开文件、菜单、Dock、窗口、全屏、快捷键和媒体键。
3. 为真实失败补 focused test，避免为未观察到的问题做大范围重构。

### P2：建立可分发依赖和独立 release 配置

1. 固定 FFmpeg/native dependency 的来源、版本、架构、rpath 和许可义务。
2. 决定 arm64-only、x64 或 universal；不要把 CI 交叉结果当真实硬件结果。
3. 建立发布资源白名单、包格式和 fail-closed 最终产物审计。

### P3：签名与公证

1. 接入 Developer ID Application 证书和 CI/Keychain secret。
2. 启用 Hardened Runtime，验证主/继承 entitlements。
3. 递归验证 Electron helpers、Audio Host、scanner、Steamworks dylib 和所有 `.node` 的签名。
4. 完成 notarization、stapling、Gatekeeper 与干净机器安装。

### P4：Steam Mac 发布链路

只有用户单独授权后才创建或修改 Mac depot、上传 build、分配 branch 或改变公开状态。代码构建成功不自动授权任何 Steamworks 写入。

## 9. 必须停止并报告的情况

遇到以下任一情况，不要继续打包、签名、上传或发布：

- 目标不是原生 Apple Silicon，或终端运行在 Rosetta 下。
- 工作树含来源不明且与 macOS/打包边界重叠的并行改动。
- 最终 App 出现 Windows helper、错误 Steamworks 库、RAOP、VDF、`steam_appid.txt` 或未声明可执行文件。
- 发布候选仍依赖 `/opt/homebrew`、`/usr/local`、用户目录或其他机器绝对路径。
- FFmpeg、dylib、字体、图片、SDK 或其他资源的来源和商业分发权不清楚。
- 签名身份、entitlements、bundle ID、AppID、Depot、branch 或构建来源与预期不一致。
- 产物审计、关键启动、本地播放、退出 smoke、notarization 或 Gatekeeper 验证失败。
- 需要通过关闭系统安全、禁用 library validation 或加入宽泛权限才能启动，但没有经过设计审查和用户批准。

## 10. 交接完成标准

下一阶段至少取得以下证据后，才算从“Windows 上打地基”进入“真实 Mac 开发”：

1. 同一提交在真实 Apple Silicon 上完成依赖安装、foundation 和 unsigned dev app 构建。
2. App 审计与 native smoke 报告已保存，失败边界明确。
3. 真实 `.app` 可启动，Finder 文件打开、原生菜单和窗口生命周期完成首轮 smoke。
4. 内置输出与至少一台外接设备完成应用内播放链路验证。
5. 本文或 `docs/ECHO_MACOS_BUILD.md` 已更新实际结论，不把计划写成已支持。

即使以上全部完成，也只能说明开发链路和首轮真实 Mac smoke 已建立。发布支持仍需独立完成可分发依赖、签名、公证、Gatekeeper、Steam 客户端和最终许可证/产物审计。
