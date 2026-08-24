# ECHO Workshop 音频插件接入配置

`audio-plugin-profile` 让工坊作者分享“怎样接入某个音频插件”，而不是分享插件二进制。它同时覆盖 VST3 效果器与 VST3i 音源：工坊项目记录插件身份、参数表、便携预设和建议路由；订阅者自行安装具有对应 Class ID 的插件。

## 边界

- 工坊包不得包含 `.dll`、`.vst3` bundle、安装器、native addon、命令脚本、许可证文件、破解补丁或下载器。
- `plugin.classId` 是匹配依据。插件名称和厂商只用于显示，不能代替 Class ID。
- 参数值统一使用 VST3 的 `0..1` 归一化值。工坊配置不能假定插件内部的物理单位。
- 启用配置只会把经过验证的映射放入 ECHO 的 Workshop 数据目录，不代表效果器已经参与音频处理。
- 真正的插件枚举、实例化、参数确认、故障隔离和声音处理必须由用户另外安装的 `echo.audio-plugin-adapter` 与 Audio Core 完成。Renderer 和沙箱 frame 不能直接加载插件。
- 插件自身的许可、购买、激活、安装与兼容性由订阅者和插件厂商负责。配置作者只能上传自己有权发布的参数说明、预设名称和原创设置。

## 创建项目

```powershell
npm run workshop:author -- init misc/workshop/my-vst-profile `
  --kind audio-plugin-profile `
  --id echo.my-vst-profile `
  --title "My VST Profile" `
  --holder "Workshop Author"
```

生成后编辑 `content/audio-plugin-profile.json`，再运行：

```powershell
npm run workshop:author -- prepare misc/workshop/my-vst-profile
npm run workshop:author -- validate misc/workshop/my-vst-profile
```

## Schema

```json
{
  "type": "echo-workshop-audio-plugin-profile",
  "schemaVersion": 1,
  "id": "echo.my-vst-profile",
  "title": "My VST Profile",
  "description": "Portable settings for a locally installed plug-in.",
  "format": "vst3",
  "role": "effect",
  "plugin": {
    "classId": "0123456789abcdef0123456789abcdef",
    "name": "Example Effect",
    "vendor": "Example Vendor"
  },
  "adapter": {
    "api": "echo.audio-plugin-adapter",
    "minimumVersion": 1
  },
  "routing": {
    "placement": "post-dsp"
  },
  "parameters": [
    {
      "id": 7,
      "title": "Mix",
      "kind": "continuous",
      "defaultValue": 0.5
    },
    {
      "id": 9,
      "title": "Mode",
      "kind": "choice",
      "defaultValue": 0,
      "choices": ["Clean", "Wide"]
    }
  ],
  "presets": [
    {
      "id": "wide",
      "title": "Wide",
      "values": {
        "7": 0.8,
        "9": 1
      }
    }
  ]
}
```

## 字段规则

| 字段 | 规则 |
| --- | --- |
| `format` | 当前仅允许 `vst3`。 |
| `role` | `effect` 或 `instrument`。后者用于 VST3i 音源描述。 |
| `plugin.classId` | 32 位小写或大写十六进制，保存时规范为小写。 |
| `adapter.api` | 固定为 `echo.audio-plugin-adapter`。 |
| `adapter.minimumVersion` | `1..1000` 的整数。 |
| `routing.placement` | `pre-dsp` 或 `post-dsp`。它是建议值，最终路由由 Audio Core 确认。 |
| `parameters` | 最多 256 项；`id` 是唯一的 VST3 参数 ID，范围 `0..4294967295`。 |
| `kind` | `continuous`、`toggle` 或 `choice`；只有 `choice` 可声明 2–128 个 `choices`。 |
| `defaultValue` | `0..1`。 |
| `presets` | 最多 64 项；每项只能引用已声明参数，值必须为 `0..1`。 |

## 订阅者看到什么

启用后，创意工坊列表会显示插件厂商/名称、效果器或音源角色、参数数、预设数和所需适配器版本。若本机没有匹配插件或适配器，状态保持为依赖未满足；不会静默绕过后再显示“已生效”。未来适配器接通后，Audio Core 仍是实例状态、旁路、延迟、崩溃恢复和实际处理链的唯一事实源。
