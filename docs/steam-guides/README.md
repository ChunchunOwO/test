# ECHO Steam Community Guide publication sources

These files are the auditable source of the public Steam Community guides for release AppID `5105090`.

| Guide | Steam title | Language | Categories | Brand image |
| --- | --- | --- | --- | --- |
| `ECHO_WORKSHOP_USER_GUIDE.zh-CN.bbcode` | ECHO 创意工坊使用指南：订阅、权限、一起听与故障排查 | Simplified Chinese | Modding or Configuration; Workshop | `assets/workshop-creator-guide.png` |
| `ECHO_WORKSHOP_CREATOR_GUIDE.zh-CN.bbcode` | ECHO 创意工坊创作者入门：主题、可视化与沙箱插件 | Simplified Chinese | Modding or Configuration; Workshop | `assets/workshop-creator-guide.png` |
| `ECHO_WORKSHOP_PLUGIN_API.zh-CN.bbcode` | ECHO 创意工坊插件 API：可搜索音源、Agent 与完整示例 | Simplified Chinese | Modding or Configuration; Workshop | `assets/workshop-plugin-api.png` |
| `ECHO_WORKSHOP_AUDIO_PLUGIN_PROFILE.zh-CN.bbcode` | ECHO 创意工坊 VST3 / VST3i 接入配置：Schema、预设与本地依赖 | Simplified Chinese | Modding or Configuration; Workshop | `assets/workshop-creator-guide.png` |

Steam descriptions:

- User guide: `从订阅到启用，逐类了解主题、歌词场景、可视化、DSP、VST3/VST3i 与沙箱插件的使用入口、权限确认、生效判断、恢复和故障排查。`
- Creator guide: `从零创建 ECHO Workshop 主题、歌词场景、可视化、DSP 预设、VST3/VST3i 接入配置与沙箱插件，完成校验、私有测试和真实订阅验收。`
- Plugin API: `ECHO Workshop 沙箱插件的完整能力参考：可搜索音源、一起听、本地歌曲分享任务、作者 Agent、直链音源、曲库、队列、导航、频谱、事件与私有状态。`
- Audio plug-in profile: `用 ECHO Workshop 分享不含二进制的 VST3/VST3i 接入配置：Class ID、参数映射、便携预设、本地插件与可选 Audio Core 适配器。`

Planned visibility: Public.

Publication rules:

- Steam guide publication is separate from Steamworks metadata publication, Workshop item publication, depot upload and branch assignment.
- Update the matching source file before editing a live Steam guide.
- Record the resulting guide URL and publication date in this file after the live page is confirmed.
- These guides describe the Workshop sandbox and binary-free audio-plugin profile API only. They must not imply that legacy main-process/Node/native plugins or third-party VST binaries ship in the Steam build.

## Publication record

Not published yet.
