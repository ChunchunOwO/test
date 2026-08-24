# ECHO Windows / macOS 日常切换开发

## 目标

同一份 Git 源码可以在 Windows x64 与 Apple Silicon macOS 之间安全切换，但每台设备独立安装依赖并编译原生产物。不得跨设备复制 `node_modules`、`dist`、native addon、Audio Host、scanner、FFmpeg、签名文件或本机凭据。

跨设备入口只负责编排现有平台脚本。它不会 stash、rebase、创建合并提交、覆盖本机改动，也不会改变 `Renderer -> typed preload / IPC -> AudioSession -> Native Audio Host` 的音频事实边界。

## 第一次准备

两台设备克隆同一仓库后都可以使用统一入口：

```bash
npm run setup:auto
npm run doctor:auto
```

- Windows 自动使用 `setup` 与 `doctor`。
- 原生 Apple Silicon macOS 自动使用 `setup:mac` 与 `doctor:mac`。
- Intel/Rosetta macOS 和其他平台会明确拒绝，不伪装成已支持的日常切换环境。

## 日常开发

随时查看当前设备与 Git 状态：

```bash
npm run dev:status
```

该命令不访问远端，也不修改仓库。它会显示平台、Node/npm、分支、HEAD、upstream、本地已知 ahead/behind 和未提交路径数量。

不需要同步 Git，只按当前平台启动：

```bash
npm run dev:auto
```

Mac 在确认 native 源码、CMake、FFmpeg、锁文件、Electron 与 Node 都没有变化时，可以使用：

```bash
npm run dev:auto:quick
```

Windows 的 quick 入口仍使用现有 `dev`，因为 Windows 的 ensure 脚本本身会增量判断所需原生产物。

## 从旧设备交接

完成一个可交接的小提交并推送后运行：

```bash
npm run dev:handoff
```

该命令只读取 Git 状态并检查：

- 当前处于命名分支；
- 工作树没有未提交文件；
- 分支已经设置 upstream；
- 本地相对 upstream 不 ahead、不 behind。

检查结果写入 Git 忽略的 `misc/device-handoff.json`。报告不记录仓库绝对路径、用户名、凭据或文件内容。检查失败时自行提交、推送或 fast-forward 后重新运行；脚本不会自动保存或覆盖改动。

## 在新设备继续

目标设备已有仓库且工作树干净时运行：

```bash
npm run dev:switch
```

该命令会：

1. 拒绝 detached HEAD、未设置 upstream 或存在本机未提交改动的状态；
2. 执行 `git fetch --prune`；
3. 仅允许从 upstream 做 `--ff-only` 更新；
4. 如果本地 ahead 或发生分叉则停止，让开发者明确处理；
5. 缺少 `node_modules`，或者锁文件、固定 Node 版本、Mac Brewfile 在这次更新中变化时，自动运行对应平台 setup；否则运行对应平台 doctor；
6. 环境检查通过后按当前系统启动 Windows `dev` 或 macOS `dev:mac`。

参数会继续转发给底层开发入口：

```bash
npm run dev:switch -- --host 0.0.0.0
```

`dev:switch` 会访问 Git 远端，并且只在缺少本机依赖或开发依赖清单发生变化时运行锁文件安装。它不会 push、强制更新、rebase、删除源码、上传 Steam 内容，也不会复制另一平台的构建产物。需要首次手动准备时仍可直接运行 `npm run setup:auto`。

## 推荐节奏

```text
设备 A：完成小提交 -> push -> npm run dev:handoff
设备 B：npm run dev:switch -> 开发 -> 完成小提交 -> push -> npm run dev:handoff
设备 A：npm run dev:switch
```

不要让两台设备长期同时修改同一分支。确需并行时，每台设备使用独立 feature branch，完成后通过正常代码审查合并。

Windows 仍是当前 Steam 发布主线。Mac 日常开发入口和本机 unsigned `.app` 不代表已完成 macOS 签名、公证、Steam depot 或发布级音频验收；Mac 平台状态继续以 [ECHO macOS 开发构建地基](./ECHO_MACOS_BUILD.md) 为准。
