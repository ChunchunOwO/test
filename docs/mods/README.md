# ECHOSteam 模组开发

ECHOSteam 的本地模组运行在受控沙盒中，不需要覆盖 `app.asar` 或重新安装 ECHO。模组是一个 JSON 文件，文件后缀固定为 `.echomod`。

## 最小目录

```text
my-mod/
  echo.plugin.json
  plugin.js
  panel.html       # 可选，面板在 sandbox iframe 中运行
  icon.svg         # 可选，模组列表和详情页显示
```

先复制 [`template`](./template) 目录，然后修改 `echo.plugin.json` 中的 `id`、`name`、`version`、`description`、`permissions` 和 `contributes`。

模组脚本只能通过 `echo` 宿主 API 工作。权限需要在 ECHO 的模组页启用时逐项确认；不要使用 Node、Electron、`require` 或直接读写任意文件。网络请求使用 `echo.net.fetchJson`，播放使用 `echo.playback`，模组数据使用 `echo.storage`。

## 打包与安装

开发期间可以直接把目录放入 ECHO 的插件目录测试。发布单文件时运行：

```powershell
node scripts/pack-echomod.mjs .\my-mod .\my-mod.echomod
```

也可以在 ECHO 的“模组”页面选择“导出模组包”。把 `.echomod` 拖入页面或点击“导入模组包”，确认权限后启用即可。停用不会删除文件；删除模组只删除它自己的目录，不会删除音乐库。

## Manifest 字段

- `id`: 小写字母、数字、`.`、`-`、`_`，例如 `com.example.visualizer`。
- `name` / `description`: 列表和详情显示的名称与简介。
- `icon`: 模组目录内的 SVG 文件名，例如 `icon.svg`。
- `entry`: JavaScript 入口，默认 `plugin.js`。
- `panel`: 可选 HTML 面板，必须通过 postMessage bridge 请求宿主。
- `permissions`: 只声明确实使用的权限；高风险权限会在启用时提示。
- `contributes`: 命令、面板、设置和提供器声明。

API 版本 2 支持受宿主控制的网络 API，最低兼容版本用 `minEchoVersion` 声明。
