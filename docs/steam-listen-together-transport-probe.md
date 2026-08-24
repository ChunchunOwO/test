# Steam 一起听传输实验

> 状态：仅用于双账号、双电脑的 Steam P2P 可行性验证。它不会读取、编码或发送歌曲，也不是已经完成的一起听功能。

## 验证目标

这个实验只回答第一阶段的问题：ECHO 能否在不部署自有服务器的前提下，通过同一 AppID 下的 Steam Lobby 与 P2P 接口建立双人房间，并持续发送接近高码率 Opus 音频负载的数据。

当前探针会：

- 创建仅好友可加入、上限 2 人的 Steam Lobby。
- 通过 Steam Overlay 邀请好友，或使用 Lobby ID 手动加入。
- 房主以约 `317 kbps` 发送合成二进制数据包。
- 听众统计接收速率、RTT、估算丢包、发送失败和最后收包时间。
- 只接受当前 Lobby 成员发起的 P2P session。
- 房主离开、P2P 建连失败或应用退出时停止传输并清理计时器和回调。

它不会：

- 读取、发送或保存歌曲、封面、标签、歌词和本地路径。
- 修改 AudioSession、Native Audio Host、播放队列或 DSP 状态。
- 上传 Steam depot、修改 Steamworks metadata 或切换分支。
- 证明连接一定经过 Valve Relay。当前 `steamworks.js 0.4.0` 使用旧 `ISteamNetworking` P2P 包装，未暴露 route/session diagnostics；真实传输可能是直连，也可能由 Steam 中继。

## 启用方式

实验入口默认关闭，避免进入普通发布体验。以下方式任选其一：

开发运行：

```powershell
$env:ECHO_LISTEN_TOGETHER_PROBE='1'
npm run dev
```

已打包的 Steam 私有测试构建：在两台电脑的 Steam 启动选项中加入：

```text
--echo-listen-together-probe
```

两边必须：

- 登录不同的 Steam 账号。
- 对 ECHO 正式 AppID 具有有效所有权或测试 package。
- 从 Steam 客户端启动同一兼容版本。

## 双电脑测试

1. 两台电脑都通过上述参数启动 ECHO。
2. 房主打开 `设置 -> 关于 -> 诊断 -> Steamworks`。
3. 点击“创建双人测试房”。
4. 点击“邀请 Steam 好友”，或者复制 Lobby ID 发给另一台电脑。
5. 听众接受 Steam 邀请；也可以在同一面板输入 Lobby ID 后点击“加入”。
6. 确认两边显示 `成员 2 / 2`。
7. 听众观察接收速率是否逐步接近 `317 kbps`；房主主要接收控制包，所以房主的接收速率会明显较低。
8. 连续运行至少 30 分钟，记录 RTT、估算丢包、发送失败，以及是否出现断流或退出。
9. 分别测试听众主动退出、房主退出、临时断网后恢复和 Steam 客户端离线。

通过标准：

- 好友邀请或 Lobby ID 能稳定加入。
- 听众的接收速率在连接稳定后持续接近目标负载，没有长时间归零。
- RTT 有持续样本，发送失败不会持续增长。
- 估算丢包处于可由音频 jitter buffer/FEC 处理的范围；具体阈值在真实网络样本后确定，不在静态测试中猜测。
- 房主退出后听众明确结束，而不是保留假连接。

## 后续边界

探针通过后，下一阶段才新增独立的实时音频模块：

```text
Native Host pre-DSP audio tap
  -> Opus encoder
  -> Steam networking transport
  -> bounded jitter buffer
  -> Native Host streaming input backend
  -> listener-owned DSP and output
```

正式版本不应继续依赖旧 `sendP2PPacket` API。需要先为新版 `ISteamNetworkingSockets` 或 `ISteamNetworkingMessages` 建立独立 native adapter，并补齐连接 route、队列压力、断线原因和 relay 初始化诊断。播放器事实仍由 Audio Core / Native Host 持有，Renderer 只展示房间与传输状态。
