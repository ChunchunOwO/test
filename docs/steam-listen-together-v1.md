# Steam 好友一起听 V1

> 状态：本地实现已接入；尚未完成双账号、双电脑的真实 Steam 客户端验收。它同步控制与经过清理的曲目信息，不传输歌曲音频。

## 产品行为

- 房主创建仅 Steam 好友可加入、最多 4 人的 Lobby。
- 房主可打开 Steam Overlay 邀请；好友也可使用 Lobby ID 或 Rich Presence 的 `+connect_lobby` 入口加入。
- 房主的播放、暂停、停止、进度和切歌状态来自 `AudioSession` 的 host-backed `AudioStatus`。
- 客人只在自己的本地曲库中匹配标题、艺人和时长都一致的文件。严格匹配成功后，播放控制通过现有类型化控制链路执行；匹配失败会明确显示“本地没有匹配歌曲”。
- 房间支持四种短时表情反应：爱心、火焰、耳机和闪光。
- Lobby 房主发生变化时，新房主成为播放状态来源。

## 隐私与权利边界

Steam P2P 数据只包含：

- 播放状态、位置、时长和播放速率；
- 经过长度限制与控制字符清理的曲名、艺人和专辑；
- 房间内的短时表情及 Steam 显示名。

不会发送本地路径、曲库 ID、设备、封面、歌词、文件内容、认证票据或音频数据。每台电脑只播放自己已经拥有并导入 ECHO 的本地文件。V1 不应宣传为“向没有歌曲的好友传歌”。

## 架构边界

```text
AudioSession host-backed status
  -> SteamListenTogetherService (main)
  -> Steam Lobby + reliable P2P control packet
  -> strict local-library resolver
  -> typed MainWindow playback control
  -> AudioSession / native host
```

Renderer 只显示房间状态并发起创建、加入、邀请、离开、重试和表情操作；它不持有远端连接或播放事实。

## 真实 Steam 验收

正式宣称可用前，至少使用两个不同 Steam 账号和两台电脑完成：

1. 从同一兼容 BuildID 的 Steam 客户端启动 ECHO。
2. 创建房间，通过 Overlay 邀请加入，再分别验证 Lobby ID 与好友列表“加入”入口。
3. 两边导入元数据一致的同一首合法本地歌曲，验证自动匹配、播放、暂停、seek 和切歌。
4. 验证客人缺少歌曲、同名不同艺人、时长相差超过 4 秒时不会误播。
5. 验证四种表情、成员进出、房主退出后的房主迁移、临时断网和重连。
6. 连续运行至少 30 分钟，确认没有 P2P 会话泄漏、控制回环、队列异常或 Rich Presence 残留。

当前静态与 focused 测试不能替代上述真实 Steam 客户端验收。
