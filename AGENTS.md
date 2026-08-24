# AGENTS.md instructions

一些小东西不必测试浪费时间，测试要高效率，不能低效率测试半天。
安全稳定为主；如果有高风险改动，请先提示我。
我可能会多进程工作，注意不要覆盖无关改动。

## 临时杂物目录

- 临时截图、日志、对比图、一次性脚本、补丁、下载文件，以及其他不属于正式源码、文档或素材的文件，统一放到仓库根目录 `misc/`。
- `misc/` 仅用于本机临时存放，整个目录由 Git 忽略；确需长期保留的内容必须移入对应的正式目录后再提交。
- 不要再把此类文件散落到仓库根目录；使用完毕后及时清理 `misc/` 中的过期内容。

## 跨电脑与跨平台开发约定

- 本文件和仓库内文档是换电脑、换系统、换 AI 会话后的项目事实源；不得依赖某台电脑的 AI 记忆、聊天记录、全局配置或本机绝对路径。开始工作时先读取本文件、`README.md` 和任务对应的 `docs/` 文档，并运行 `git status --short --branch`。
- 当前平台事实必须区分清楚：Windows x64 是发布主线；Linux x64 已有 AppImage / deb 开发构建链路，但尚未完成 Steam runtime、FFmpeg 许可和最终产物的发布级收口；macOS 尚无可发布的构建、签名、公证与 CI 链路。计划支持不等于已经支持，只有目标平台真实构建、启动和音频 smoke 通过后才能更新结论。
- 不得把 `C:\...`、`F:\...`、`/home/...`、盘符、用户名或某台机器的 SDK 安装位置写进业务代码和共享配置。路径使用 Node/Electron 的平台 API（如 `path`、`app.getPath()`、`process.resourcesPath`）和项目内相对位置；用户可配置路径放入本机配置或环境变量，并提供清晰报错。
- 不在不同操作系统或 CPU 架构之间复制 `node_modules`、`dist`、native addon、audio host、FFmpeg 或其他构建产物。每个平台使用锁文件重新安装/构建其原生依赖，Windows 与 Linux 的工具和资源目录保持隔离；Linux 构建遵循 `docs/ECHO_LINUX_BUILD.md`。
- 新增平台相关能力时，先在清晰命名的 platform adapter、service、backend 或构建脚本中隔离，再由通用层调用；不要把散落的 `process.platform` 判断扩散到 renderer。Windows-only 能力在其他平台必须不装配、不可调用且不误显示为可用，不能用静默降级伪装成已支持。
- 音频事实仍由 native host / Audio Core 持有。适配新平台时必须沿 `renderer -> typed preload/IPC -> AudioSession -> native host` 验证，不能为了跨平台便利在 renderer 另造播放、设备、DSP、EOF 或会话事实。
- 平台文件名、可执行权限、路径分隔符、大小写敏感、换行符、窗口/托盘行为、媒体键和音频后端都按目标系统处理；禁止假定 `.exe`、反斜杠、Windows 盘符、大小写不敏感或所有平台都有 WASAPI / ASIO / SMTC。
- 只修改通用 TypeScript/UI 时做 focused test、typecheck 或快速构建；触及 native、打包、安装、签名或平台资源时，必须在对应目标系统验证。CI 或交叉编译成功只证明其覆盖项，不替代真实桌面、声卡、媒体键和安装包 smoke。
- 新增 macOS 或新的 Linux 架构前，先补齐独立构建入口、native host/依赖产物、资源清单、许可证、签名/公证（如适用）、CI 和平台验收文档；未补齐前不得在 README、商店或 UI 中宣称支持。
- API key、签名证书、Steam 凭据、测试账号和机器专用路径只进入 CI secret、环境变量或 Git 忽略的本机文件，不得提交。新增开发环境要求或平台支持状态变化时，要在同一改动中更新 `README.md`、相关构建文档和本节，避免下一台电脑上的 AI 得到过时信息。

## Steam 跨电脑开发与交接

- 新电脑或新 AI 会话接手任何 Steam 任务时，必须先读取本节、`docs/steamworks-integration.md`、任务对应的 Steam 专项文档和当前构建脚本；再确认 Git 分支/提交、工作树、目标 AppID、Depot、package、beta branch 与操作性质。不得仅凭聊天记忆或某个相近数字执行 Steamworks 操作。
- 当前已确认的 ID 映射：`5105090` 是 ECHO 正式 AppID；`5105150` 是 Steam Playtest AppID；`1768454` 是 Developer Comp package；`1768455` 是 Beta Testing package；`1768456` 是商店销售 package；`1284845` 是 Store Item ID。它们不是同一种 ID，任何表单、脚本或 API 调用都必须按字段逐项映射。
- `package.json` 中 Electron 的 `build.appId = "app.echo.steam"` 是桌面应用标识，不是 Steam 数字 AppID，不得改成 `5105090`。正式构建通过 `ECHO_STEAM_RELEASE_APP_ID` 注入数字 AppID；Windows Depot 使用独立的 `ECHO_STEAM_DEPOT_ID`，不得拿 AppID、package ID、Store Item ID 或 Playtest AppID 代替。
- Pro DLC AppID 只有在 Steamworks 中真实创建、确认归属并写入受保护构建环境后才可配置为 `ECHO_STEAM_PRO_DLC_APP_ID`。缺失或无法验证时必须 fail-closed：隐藏 Pro UI，并在 main IPC / Audio Core 同步拒绝，不得填占位数字、猜测 ID 或仅在 renderer 解锁。
- Steamworks 后台的当前 App metadata、package/depot 关联、Cloud、Rich Presence、Achievements、Leaderboards 和发布历史是远端事实源；仓库文档是可审计交接记录。两者不一致时先停止写入，查明目标与 pending diff，不能用本地旧 VDF、截图、缓存或 AI 记忆覆盖远端状态。
- Steamworks 的保存、发布、构建上传、beta 分支切换和公开发布是不同动作。发现包含未知 `extended`、`ufs` 或其他无关 section 的 pending diff 时不得发布；先保留证据并让用户确认。用户要求改代码、构建或检查，不自动等同于允许上传 depot、发布 metadata、切换 public/default 分支或发布商店素材。
- `npm run steam:depot:prepare` 默认只生成本地 Preview VDF，不上传；`steam:depot:upload-private` 只能在用户明确授权后上传到专用私有分支，并必须保留 fail-closed preflight。公开分支提升仍需用户单独明确批准并在 Steamworks 后台人工确认。
- `steam_appid.txt`、SteamCMD 登录状态、build account、Steam Guard、Cookie、API key、签名证书和密码必须保持本机/CI 私有且 Git 忽略，不得写入仓库、日志、命令行参数、诊断包或发布物。换电脑时应重新配置受保护环境，不从旧电脑复制凭据文件进仓库。
- Steam Cloud 仅同步经过白名单投影的小型可移植设置；不得同步曲库、绝对路径、音频设备/硬件设置、窗口位置、凭据、会话、授权、缓存或日志。正式 AppID 与 Playtest AppID 默认是两个独立 Cloud namespace，除非远端已明确配置并验收 shared Cloud AppID。
- Rich Presence 本地状态显示 “submitted” 只表示 wrapper 调用未报错，不代表好友端已经显示。发布 VDF 后应从 Steamworks 重新下载权威的全语言 VDF 做语义比对，并用真实 Steam 好友账号验证显示、禁用与退出清理。
- Windows x64 是当前 Steam 发布主线。Linux 开发包构建成功不等于 Linux Steam runtime、Overlay、Cloud、Steamworks native dependency 或 depot 已验收；macOS 亦不得推定支持。每个平台必须分别完成原生构建、Steam 客户端启动、Overlay、AppID / BuildID / branch、所有权、Cloud、本地播放和退出 smoke。
- 每次实际修改 Steamworks metadata、ID 映射、Cloud schema、成就/排行榜、depot 或分支状态后，都要在同一任务中更新对应 `docs/steam-*.md` 交接记录，写明日期、目标 AppID、修改范围、发布/未发布状态和验证边界；不得记录账号、凭据或敏感后台截图。这样下一台电脑上的 AI 可以先读仓库恢复上下文，再到后台验证当前状态。

## 模块化提醒

- 开发新功能或扩展现有功能时，先判断代码职责和现有模块边界，优先把独立职责放进清晰命名的模块、组件、hook、service 或后端对象中。
- 避免持续向已经明显过大的页面、服务、状态容器或样式文件追加无关逻辑；
- 小修复和简单改动可以直接在原文件完成，不要求为了拆分而拆分，也不要制造只有转发作用的碎片模块或过度抽象。
- 拆分时保持行为不变、依赖方向清楚，并复用已有架构；音频后端事实仍归 native host / Audio Core，renderer 只作为控制面。

## 超大文件增长禁令

- 以下已经超过 1 万行的文件实行严格行数封顶，**禁止继续膨胀**：`src/main/audio/AudioSession.ts`、`src/main/library/LibraryStore.ts`、`src/renderer/pages/SettingsPage.tsx`、`src/renderer/styles/app.css`、`src/renderer/styles/theme-presets.css`。
- 修改这些文件前先阅读 `docs/ECHO_OVERSIZED_FILE_MAP.md`，按其中的职责地图定位入口；该文档是维护导航，不是强制拆分计划。
- 行数上限以 `scripts/oversized-file-baseline.json` 为准。任何修改都不得让受保护文件超过其基线；必须运行 `npm run check:file-growth`，CI 也必须执行该检查。
- 不得为了让检查通过而擅自提高基线、压缩代码、合并多条语句或删除必要的可读性。确有不可避免的例外时，必须先取得用户明确批准，并说明增加原因和后续回收方案。
- 本禁令不要求一次性重构或强制拆分现有文件。小修复仍可直接完成；新增独立职责时，应把新增部分放入清晰命名的模块，并保持原文件净增行数不超过基线。
- 当受保护文件完成实质性缩减后，应同步下调对应基线，防止以后重新长回去；不得借机扩大其他文件制造新的巨型文件。

### 稳妥维护流程

- 行数检查只是防止失控的保险丝，不是重构目标。没有具体故障、性能证据或高频冲突时，不得为了缩短文件主动开展大规模拆分。
- 开始修改前必须先运行 `git status --short --branch`，再查看目标文件的现有 diff。发现其他进程正在修改同一文件时，保留其改动；若修改区域重叠，先缩小范围或向用户报告，不得覆盖、回退或整文件格式化。
- 先通过方法名、组件名、设置 key、IPC channel 或 CSS 选择器精确定位目标，不要求通读整份超大文件，也不得顺手整理无关区域。
- 小 bug、文案和现有职责内的局部判断可以直接在原文件修复。新增完整职责时，放入清晰命名的 component、hook、service、repository、backend 对象或样式模块，再由原文件做最小接入。
- 为通过行数检查而压缩代码、合并语句、删除必要注释或降低可读性，视为违规。确需新增代码时，应提取同一职责或删除真实冗余，而不是机械凑行数。
- 一次改动只解决一个明确问题。禁止同时混入批量重命名、导入重排、全文件格式化、无关清理或大范围 CSS 覆盖迁移。
- 音频修改必须沿 `renderer -> typed preload/IPC -> AudioSession -> native host` 追踪。renderer 只负责控制和显示；decoder EOF、PCM drain、设备状态、DSP 状态和播放完成仍以 native host / Audio Core 为准。
- 修改完成后按风险做最小充分验证：文档运行 `git diff --check`；普通 UI/CSS 跑相关 focused test 和必要的真实界面检查；`LibraryStore` 跑相关 Library Core 测试；`AudioSession` 跑相关 Audio Core 测试与 typecheck；只有触及 native host 才运行 native build、CTest 或 smoke。最后运行 `npm run check:file-growth`。
- 只有职责归属、首要修改入口或不可破坏边界发生变化时，才更新 `docs/ECHO_OVERSIZED_FILE_MAP.md`；普通实现细节不写入职责地图，避免文档快速失真。

## 侧栏搜索约定

- 新建或改造内容型、设置型侧栏时，默认接入统一的侧栏搜索体验；设置项侧栏复用 `DrawerSmartSearch`，虚拟列表侧栏使用同视觉的受控搜索并在数据层过滤。
- 搜索应支持即时过滤、清空、命中数量、键盘聚焦与命中跳转；折叠组命中后可直接展开。避免用建议词标签和结果标签堆高侧栏顶部，也不要让同义词扩展造成明显误命中。

## Steam 发行版定位

- 本仓库是 ECHO Steam 发行版，默认按“最小必要能力”装配，不因为主版本存在某功能就自动带入 Steam 版。
- 保留本地音乐播放、媒体库、合法的本地元数据处理、Audio Core、DSP 和 native host。不为 Steam 版复制或阉割另一套音频后端。
- renderer 仍只是控制面；播放、设备、DSP 和会话事实必须继续由 native host / Audio Core 拥有。
- 所有新功能、上游合并和依赖升级都必须先回答“这是否应进入 Steam 发布物”。没有明确答案时按不进入处理。
- 用户的功能批准不等于第三方授权。不能用“用户要求加入”替代版权、商标、SDK 条款、API 条款和商业再分发权确认。

## 高风险功能硬隔离

除非用户明确批准并确认了授权和发布边界，Steam 版不得提供、暴露或打包以下能力：

- 音乐或视频下载器，包括 yt-dlp、平台解析下载、批量下载、歌单下载和 osu! 在线下载器。
- 第三方音乐平台搜索、解析或在线播放实现，包括 YouTube、SoundCloud、Spotify、Tidal、Qobuz、网易云音乐、QQ 音乐、酷狗和 Bilibili 等平台。
- 上述平台的登录、Cookie 导入、二维码登录、Token 保存、账号检测和鉴权绕行能力。
- MV 搜索、在线解析、缓存、下载、播放页面和相关协议处理。
- 任何依赖非官方 API、抓取、Cookie、签名伪造、视频/音频地址提取或规避平台限制的新功能。

通用网络电台只能作为独立能力保留：仅播放用户明确提供或合法来源返回的直接电台流，不得借此恢复音乐平台搜索、解析、登录或下载。FFmpeg 可用于本地解码和已允许的直接流播放，不得作为平台提取/下载链路。

### Workshop 自定义 UI 运行时例外

- Workshop 主题可以携带已声明并通过清单哈希校验的 HTML、CSS、JavaScript、JSON、WOFF/WOFF2 和栅格素材，用自己的结构完整替换可见 UI；视觉不要求保留 ECHO 的布局、图标或品牌。
- 这些文件只能在 `sandbox="allow-scripts"` 且不带 `allow-same-origin` 的 iframe 中运行。不得向 frame 注入 preload、Node、文件系统、Steamworks、原始 `window.echo`、Audio Core、外部网络、媒体或子 frame 权限。
- Host 桥必须是版本化、类型化、按主题声明 capability 的 `postMessage` 白名单；播放和设备事实仍由原有 renderer 控制面与 Audio Core 持有。不得把任意 IPC、任意方法名或本地路径透传给主题。
- 自定义 UI 必须保留宿主拥有且主题无法遮盖的退出按钮，并支持 `Ctrl+Shift+Esc` 会话级紧急退出。首次使用包含 UI runtime 的主题必须再次向用户明确确认。
- 此例外不开放 `.echo` 插件执行、native addon、DLL、命令脚本、任意网络或应用热更新；这些仍按现有禁止和发布边界处理。

## 切断标准

移除功能不能只隐藏按钮或页面。必须同时满足以下全部条件：

1. **Renderer**：不存在导航、路由、设置项、快捷键、右键菜单、隐藏入口或懒加载 chunk。
2. **Preload**：`window.echo` 不暴露相关方法、事件或类型表面；不保留可被手动调用的空壳 API。
3. **Main / IPC**：不导入、不注册相关 IPC、Service、协议、后台任务、登录窗口或自动恢复逻辑。
4. **Dependencies / resources**：相关生产依赖必须从 `dependencies` 移除；相关二进制、脚本、模型、图片和配置不得进入 `files`、`asarUnpack`、`extraResources` 或 `extraFiles`。仅构建时需要的包放入 `devDependencies`。
5. **Final artifact**：最终 `app.asar`、`app.asar.unpacked`、`resources` 和安装目录中不存在对应实现、依赖、可执行文件、素材或可调用入口。

不得用散落在业务代码中的 `if (steam)` 当作安全边界。优先在路由表、preload API 表、IPC 注册器、Service 装配点和打包白名单这些单一边界切断导入链。

## 源码与素材

- 为了小步、低风险迁移，已断开全部导入且不会进入发布物的普通实现源码可以暂时保留，不要为了“看起来干净”一次性大删文件。
- 未经授权的图片、音频、视频、字体、Logo、复制代码或其他受保护素材不能因为“没打包”就留在公开仓库；发现时先隔离并向用户报告，不自行推定授权。
- 新增第三方 SDK、字体、图片、音频、视频或 native 库时，必须记录来源、版本、许可证和是否允许商业再分发；无法确认时默认不打包。

## 第三方许可与来源证据

- 发布物中的每个第三方依赖、native 二进制、字体、图片、图标、音效、示例媒体和数据文件都要有可追溯来源。“网上找的”、“开源的”或“别的软件也在用”不是有效证据。
- 来源记录至少包含：名称、上游 URL、版本/提交、许可证标识、版权声明、修改情况、商业分发是否允许、需要随包提供的 notice/source 义务。
- 发布前必须生成或更新第三方组件清单和 notices。不得因为依赖没有显示在 UI 中就忽略它的许可证义务。
- 对 GPL/LGPL/MPL/CC 等存在额外义务的许可证，不凭印象判断；要核对实际链接方式、修改内容、分发形式和 notice/source 要求。无法确认时停止发布并上报。
- 锁文件必须提交并与 `package.json` 一致；不允许在正式打包时临时拉取未锁定的脚本、二进制、模型或媒体资源。

## 商标、商店素材与宣传

- 不得在应用图标、启动页、商店胶囊图、截图或宣传文案中使用未授权的艺人照片、专辑封面、视频画面、角色、游戏素材、平台 Logo 或品牌视觉。
- 商店截图应使用自有、明确获授权或专为 QA 生成的占位媒体；不得把本机用户曲库中的真实封面和歌词直接用于公开宣传。
- 使用 Steam / Steamworks 名称、Logo 和标识时必须遵守 Valve 当前品牌规则，不得暗示 Valve 对 ECHO 进行了赞助、认证或官方背书。
- 对第三方平台的兼容性描述必须客观、必要且不使用对方 Logo；不得使用“官方”、“授权”、“合作”等未有证据的表述。

## 网络、账号与隐私边界

- Steam 发行版应维护明确的外联域名/用途清单。新增域名、WebSocket、MQTT broker、远程配置、更新地址或遥测端点必须先说明目的、发送数据和关闭方式。
- 不允许远程配置、插件、热更新、下载脚本或服务端开关重新启用本文禁止的功能。发布边界必须由本地可审计代码决定。
- 不得请求、读取、保存或上传用户的 Steam 密码、Steam Guard 验证码或会话 Cookie。Steam 身份只能通过受支持的 Steamworks 链路使用。
- 默认不上传本地曲库路径、文件名、标签、封面、歌词、播放历史、设备列表和调试日志。确需联网发送时，必须有明确产品需求、最小数据集、用户可见说明和退出/删除方案。
- 不得在日志、崩溃报告、诊断包、URL、IPC payload 或截图中泄露 token、cookie、密码、Steam 票据、本地绝对路径或可识别用户的内容。
- 如果功能涉及用户上传、Workshop、公开分享、云存档或社区内容，必须先单独设计内容权利、隐私、删除、举报和滥用处理边界，不能顺手接入。

## Steam 平台与更新

- Steam 版必须使用独立且稳定的 `appId`、产品名、可执行文件名、用户数据目录、协议注册和更新通道；不得与主版本互相覆盖用户数据或安装目录。
- Steam 正式发行默认由 Steam depot 管理应用文件。未经明确批准，不得保留会下载并覆盖应用文件的外部自更新器，不得绕过 Steam 发布通道热更新代码。
- Steamworks 独占功能必须放在清晰命名的 Steam 模块/Service 中，通过类型化 preload/IPC 调用；不得在 renderer 直接加载 native SDK，也不得把 Steam 身份变成音频后端事实源。
- 本地开发用 `steam_appid.txt`、测试账号、depot 配置、签名凭据和 API 密钥不得提交到仓库或进入发布包；只能通过本地忽略文件或 CI secret 提供。

## 上游同步与回归防线

- 从 ECHODev 同步时，不得无审查整体覆盖 Steam 的路由表、preload API、IPC 注册器、Service 装配、`package.json`、打包配置和 Steam 检查脚本。
- 合并中一旦重新出现被禁止的 import、生产依赖、路由、IPC channel、Service 或素材，默认保留 Steam 侧的隔离边界，并向用户报告冲突，不能为了尽快合并而放行。
- 每次合并主版本后都要重跑 Steam 裁剪检查；不得因为合并本身“没改 Steam 文件”就跳过。

## 停止发布条件

出现以下任一情况时，代理必须停止打包/上传/发布，保留证据并向用户报告，不得自行忽略：

- 最终产物出现被禁止的功能、依赖、域名、素材、二进制或可调用入口。
- 第三方素材/组件来源、许可证或商业再分发权不清楚。
- 发现未说明的网络请求、远程开关、热更新、凭据收集或敏感信息日志。
- `check:steam-distribution`、最终 ASAR/resources 检查、关键启动/本地播放 smoke 或打包验证失败。
- 当前工作树包含来源不明、与发布边界重叠且无法安全隔离的其他进程改动。
- 发布使用的 appId、产品名、更新通道、签名者或 Steam depot 目标与预期不一致。

代理不得仅凭静态扫描或工具通过就宣布“没有侵权”或“法律安全”。工具只能证明技术隔离和已检项；存在重大权利不确定时，由用户获取权利人或专业意见确认。

## Steam 发布校验

- 日常小改只做 focused test，不因为文案或小 UI 变动跑全量音频测试。
- 触及裁剪边界、路由、preload、IPC、生产依赖或打包配置时，至少运行快速构建和 `npm run check:steam-distribution`。
- `check:steam-distribution` 必须 fail-closed，同时检查主进程 bundle、preload、renderer chunks、`package.json` 生产依赖和已知禁止标记；不能只检查 UI 文字或某个类名。
- 只有在实际发布前，或改动了打包/依赖/资源边界时，才生成 Windows unpacked 包并检查最终 `app.asar`、`app.asar.unpacked` 和 `resources`；不为无关小改反复跑长时间完整打包。
- 未完成最终发布物检查时，只能报告“bundle 裁剪检查通过”，不得声称“Steam 包已确认无风险”。
- 正式上传前必须从预期提交生成发布物，记录版本、提交 SHA、构建时间、产物清单和 SHA-256；不得上传来源不明的旧 `dist` 产物。
- 发布审计至少覆盖：产物文件树、ASAR 内容、生产依赖、extraResources、可执行文件/DLL/Node addon、域名字符串、图片/字体/媒体资源、第三方 notices 和商店素材。
- 正式发布前要做一次可见启动、本地导入、本地播放、暂停/恢复、seek、切歌和退出 smoke，并确认未出现被禁止的页面、菜单或网络请求。不因此默认跑全量长测。
- 未获得用户明确的上传/发布指令时，只能构建和审计本地产物，不得上传 Steam depot、发布 GitHub Release、推送商店素材或切换公开分支。

