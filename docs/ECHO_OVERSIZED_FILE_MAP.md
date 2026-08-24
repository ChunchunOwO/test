# ECHO 超大文件职责地图

这份文档用于回答两个问题：

1. 某项修改应该从哪个文件开始找。
2. 哪些职责不能继续塞进现有超大文件。

它不是拆分计划，也不要求为了行数主动重构。现有行为稳定时可以保持不动；小修复可以直接完成；只有新增了独立职责时，才优先放入清晰命名的新模块。

受保护文件的实际行数上限以 [`../scripts/oversized-file-baseline.json`](../scripts/oversized-file-baseline.json) 为准，并由 `npm run check:file-growth` 检查。

## 总览

| 文件 | 当前角色 | 一句话边界 |
| --- | --- | --- |
| `src/main/audio/AudioSession.ts` | 主进程音频会话编排器 | 编排播放和后端，但不取代 native host 的播放事实 |
| `src/main/library/LibraryStore.ts` | 本地曲库 SQLite store | 负责持久化和查询，不负责播放、UI 或扫描任务编排 |
| `src/renderer/pages/SettingsPage.tsx` | 设置页路由壳和控制面 | 组合设置分区并调用 typed bridge，不拥有后端事实 |
| `src/renderer/styles/app.css` | 主窗口遗留全局样式与兼容覆盖 | 只维护现有全局契约，不继续收纳新的独立组件样式 |
| `src/renderer/styles/theme-presets.css` | 主题预设覆盖层 | 只表达主题差异，不承载基础布局和业务组件结构 |

## `AudioSession.ts`

### 负责什么

- 主进程播放会话的创建、切换、停止和释放。
- `play`、`pause`、`seek`、`stop`、输出设备选择和输出模式编排。
- decoder、daemon backend、native bridge 与 EQ 状态的协调。
- AutoMix、gapless、队列同步和自然结束后的会话推进。
- 输出 fallback、watchdog、恢复策略、状态发布和播放诊断。
- 把 renderer / IPC 的控制请求转换成 host-facing 操作。

### 不负责什么

- Renderer 不得把 UI 推测当作真实播放状态。
- decoder EOF 不等于播放结束；PCM 是否排空由 native host / Audio Core 判断。
- 实时解码、DSP、FIFO、设备 callback 和权威播放位置不能搬到 renderer。
- 新 backend 的实现细节不能以大量 `if/else` 继续散落在会话编排代码中。

### 常见修改入口

| 需求 | 优先查看 |
| --- | --- |
| 播放会话选择、fallback、恢复和状态编排 | `AudioSession.ts` |
| daemon backend 生命周期与能力 | `DaemonAudioBackend.ts`、`NativePcmHostProcess.ts` |
| backend 选择 | `BackendFactory.ts`、`AudioBackend.ts` |
| JSON-RPC 契约 | `JsonRpcBridge.ts` 与 `native/audio-host/src/main.cpp` |
| 解码、DSP、FIFO、drain、设备输出 | `native/audio-host`、`native/audio-engine` |
| 完整音频边界 | [`ECHO_NATIVE_AUDIO_PIPELINE.md`](./ECHO_NATIVE_AUDIO_PIPELINE.md) |

新增一种同类 backend 时，应实现共同抽象并在 factory / routing 边界注册。状态改变型 RPC 必须等待结果；session 生命周期必须只有一个 owner。

## `LibraryStore.ts`

### 负责什么

- SQLite 事务、读写、分页查询和数据库行映射。
- 文件夹、扫描记录、歌曲、专辑、艺术家和封面状态。
- 歌单、收藏、播放历史、统计、收件箱和曲库质量查询。
- 搜索字段、排序、去重索引和部分维护标记的持久化。
- 本地与允许的远程曲库记录的统一查询表达。

### 不负责什么

- 不播放或解码音频，不控制输出设备。
- 不渲染歌曲列表、专辑墙或设置界面。
- 不承担文件枚举、metadata worker 和后台扫描调度的全部生命周期。
- 不自动删除、移动或重命名用户真实音频文件。

### 常见修改入口

| 需求 | 优先查看 |
| --- | --- |
| 新增 SQLite 查询、事务或持久化字段 | `LibraryStore.ts`、数据库 migration |
| IPC facade 与曲库能力组合 | `LibraryService.ts` |
| 扫描任务、取消和并发 | `ScanJobQueue.ts` |
| metadata、封面、专辑聚合和搜索词 | 对应的 `MetadataService`、`CoverService`、`AlbumService`、`SearchIndexTokens` |
| 文件变化和局部重扫 | `LibraryWatcherService.ts` |
| 完整曲库边界 | [`ECHO_LIBRARY_CORE.md`](./ECHO_LIBRARY_CORE.md) |

新增独立的数据域时，优先在对应 service / repository 中实现，并由 `LibraryStore` 保留必要的兼容入口；不要为了拆分而制造只转发一次的空壳。

## `SettingsPage.tsx`

### 负责什么

- 设置页面的导航、当前分区、搜索结果跳转和滚动位置。
- 组合 General、Playback、EQ、Lyrics、Library、Appearance、Integrations、Danger、About 等设置分区。
- 管理页面级加载状态、用户操作反馈以及对 typed preload bridge 的调用。
- 组合已经拆出的设置组件，例如 appearance、lyrics、remote、plugins、danger、playback 和 shortcuts 子模块。

### 不负责什么

- 不拥有音频设备、播放会话、曲库数据库或 Steam 身份的权威状态。
- 不在 JSX 中重新实现 main / native service 的业务规则。
- 不通过隐藏 UI 代替 Steam renderer、preload、IPC、依赖和打包边界的真实切断。
- Steam 版不得新增被禁止的第三方平台搜索、登录、解析、播放或下载入口。

### 新设置应该放哪里

- 小型现有设置的修复可以留在原位置，但不能突破文件行数基线。
- 新的独立设置分区放到 `src/renderer/pages/settings/<domain>/`。
- 导航定义和可见性放到 `settingsNavigation.ts`，搜索元数据放到 `settingsSearch.ts` 或对应分区模块。
- 页面只组合组件、管理页面级交互并调用 bridge；业务事实留在 main service / Audio Core / Library Core。

## `app.css`

### 负责什么

- 主窗口当前仍依赖的全局基础样式、共享外壳和遗留兼容覆盖。
- 少数跨页面 drawer、popover、设置外壳及全局状态类的既有样式契约。
- 通过 `mainWindowStyles.ts` 进入主窗口样式加载顺序。

### 不再接收什么

- 新页面的大段专属样式。
- 新组件只在一个位置使用的样式。
- 通过文件尾部反复追加覆盖来修复层叠顺序的问题。
- 与主题预设绑定的视觉差异。

新样式优先放到现有页面样式文件、组件样式文件或新的清晰命名样式模块中。必须记录 import 顺序，避免把新的全局覆盖链转移到另一个文件。

## `theme-presets.css`

### 负责什么

- 主题 preset 对颜色、材质、表面、导航、播放器和页面表现的差异化覆盖。
- 主窗口、迷你播放器和桌面歌词共用的既有主题契约。
- 主题特有的可读性、对比度和连续表面修正。

### 不再接收什么

- 与主题无关的基础组件布局。
- 业务状态和交互行为的替代实现。
- 只为压过旧选择器而追加的重复规则。
- 大段新主题实现；新增主题视觉应使用独立、清晰命名的样式模块并明确加载顺序。Fable 四套（夜玻璃 / 骨铁 / 港灯 / 灰蔷）在 `theme-presets-fable.css`，经 `mainWindowStyles.ts`、`miniPlayerStyles.ts`、`desktopLyricsStyles.ts` 在 `theme-presets.css` 之后加载。

修改主题样式时要同时检查主窗口、迷你播放器和桌面歌词，不得只验证一个 renderer surface。

## 维护流程

修改受保护文件时采用以下最短流程：

1. 先搜索准确的方法、组件或选择器，不通读整份文件。
2. 根据本页确认事实归属和首要修改入口。
3. 小修复直接完成；新增独立职责放入对应模块，不顺手重构无关区域。
4. 运行与改动相关的 focused test；仅文档改动运行 `git diff --check` 即可。
5. 运行 `npm run check:file-growth`。
6. 只有职责归属发生变化时才更新本页；普通实现细节不需要同步到文档。

如果某个受保护文件发生实质性缩减，应同步下调 `scripts/oversized-file-baseline.json`。不得通过压缩代码、合并语句或提高基线来制造“没有增长”的假象。
