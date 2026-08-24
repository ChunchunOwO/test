# ECHO SDM Quality Lab

这套工具用于比较 ECHO 自己的 PCM -> SDM 调制链。它只证明软件输出，不证明 DAC 已收到 Native DSD，也不等价于听感结论。

## 跑基线

```powershell
npm run sdm:quality-lab
```

命令会生成两份报告：

- `out/sdm-quality-lab/sdm-quality-baseline.json`：覆盖 DSD64、DSD128、DSD256、DSD512，以及 Safe、HiFi、Reference、Insane 四个调制档。
- `out/sdm-quality-lab/sdm-sound-profiles.json`：覆盖 44.1/48 kHz 到 DSD512 carrier 的五段 FIR，比较 ECHO Linear、Transient、Smooth 的脉冲峰值、前后振铃能量和 10/15/18/20 kHz 幅频。

主要字段：

- `inBandResidualDb`：固定 1 kHz、-20 dBFS 激励在 20 kHz 带宽内的残差，越低越好。
- `realtimeRatio`：处理时间 / 音频时长，小于 1 才具备单线程实时余量。
- `stabilityRecoveries`：反馈状态越界后的恢复次数，稳定输入基线应为 0。
- `peakFeedbackState`：最接近稳定保护边界的反馈峰值。
- `idlePatternRatio`：数字静音稳定后进入标准 DSD idle pattern 的比例。
- `checksumFnv1a64` 与 `deterministic`：用于发现同一输入的非预期位流漂移。

报告同时测量默认 `linear` 和候选 `smoothstep-experimental`。候选不会自动进入正式输出。

声音风格和 Quality 是两条独立轴：声音风格选择实际 FIR 相位/滚降组合，Quality 选择有界 NTF、dither 与经满幅压力测试确定的安全余量。Safe 使用 3 dB，HiFi / Reference 使用 4.5 dB，Insane 使用 6 dB；高阶调制器不会为了追求响度而牺牲稳定性。`sdm-sound-profiles.json` 会 fail-closed 检查 Transient 的前置振铃必须显著低于 Linear，Smooth 的 20 kHz 滚降必须比 Linear 更早；这只证明算法不同，不直接替代等响 A/B。

## 实验性 smoothstep 插值

默认构建保持线性末级插值。只有显式设置编译开关才启用 smoothstep：

```powershell
$env:ECHO_ENABLE_EXPERIMENTAL_SDM_SMOOTHSTEP='ON'
npm run build:audio-host
```

该候选目前强制使用 CPU 调制器。CUDA 内核仍保持线性插值，因此 host 会拒绝把实验档误报成 CUDA 生效。

## 生成型 Native ASIO DSD

PCM -> SDM 的 DSD64/128/256 默认仍通过 DoP 传输；DSD512 在 ASIO 输出下会自动请求真正的 `dsd-native-raw`，不再依赖开发环境变量。原有 `ECHO_EXPERIMENTAL_GENERATED_NATIVE_ASIO_DSD=1` 仅保留为开发环境下强制低倍率目标走 Native DSD 的覆盖开关。

DSD512 下，44.1 kHz 家族由五段 2x FIR 升至 1.4112 MHz byte-carrier，再向 ASIO 驱动请求 22.5792 MHz Native DSD；48 kHz 家族对应 1.536 MHz 与 24.576 MHz。启动失败会 fail closed，不会改成 PCM 继续播放。

DSD512 仍只允许 ASIO Native DSD 链路。WASAPI Exclusive/DoP 不会把 1.4112/1.536 MHz PCM 伪装成 DSD512；不满足条件时状态会明确报告 `sdm_pcm_to_dsd_target_unsupported:dsd512`。

## Matrix DAC 实机验收

软件测试通过后仍需逐项确认：

1. 选择 Matrix ASIO 驱动并关闭系统混音链路。
2. 分别播放 44.1 kHz 和 48 kHz 家族的已知 PCM 测试文件。
3. 确认 ECHO 状态显示 `Native DSD`，并记录 `sdmNativeSampleRate` 与 `sdmTransportSampleRate`。
4. 确认 DAC 面板显示对应 DSD64/128/256/512，而不是 176.4/352.8/705.6/1411.2 kHz PCM。
5. 保存 native host 日志、驱动格式、缓冲大小、欠载计数和 DAC 面板照片。
6. 关闭实验开关后以相同音量、相同滤波和相同曲目复测 DoP；不要用输出启动失败后得到的 PCM 作为 A/B 样本。

只有上述设备证据齐全，才能把结果称为 Native ASIO DSD 硬件验证。

## 声音轮廓的绝对频率目标

声音轮廓不能直接复用相对 Nyquist 的 cutoff 比例。否则同一个预设在 44.1 kHz 与 48 kHz 家族会变成两个完全不同的低通：旧版 Smooth 在 44.1 kHz 下 18 kHz 已衰减约 33 dB，但在 48 kHz 下几乎不衰减。

当前 DSD512 轮廓使用统一的绝对频率设计：

- Linear：保持原有线性相位中性基准，10-20 kHz 基本平直。
- Transient：首段目标 cutoff 为 20.5 kHz，保持 18-20 kHz 基本平直；差异来自最小相位、约 0.14 ms 的脉冲峰值和显著减少的前振铃。
- Smooth：首段使用 127 taps Gaussian apodizing，目标 cutoff 为 20 kHz；典型响应约为 -0.1 dB @ 18 kHz、-1.1 dB @ 19 kHz、-2.9 dB @ 19.5 kHz、-6 dB @ 20 kHz，同时在第一镜像频率维持约 100 dB 抑制。

`sdm-sound-profiles.json` 会 fail-closed 检查上述范围以及 44.1/48 kHz 家族一致性。它证明滤波设计达到目标，不等于证明所有听众都能辨认。

## 同片段听音验收

DSP 页的声音风格 A/B 只更换 FIR pair，不更改 DSD 目标、调制器、headroom、音量或输出设备。播放中第一次进入 A/B 时，控制面从 Audio Core 获取真实播放位置，记录向前 3 秒的锚点；每次切换完成后都回到同一锚点，避免拿不同乐句做比较。

建议至少使用三类 10-20 秒片段：

1. 鼓点、拨弦或钢琴起音，用于 Linear / Transient。
2. 镲片、齿音和高频空气感，用于 Linear / Smooth。
3. 已知带有数字前振铃的旧母带，用于验证 Smooth 的 apodizing 方向。

正式主观验收至少做 10 次随机盲测，达到 9/10 才记录为“可稳定辨认”。低于该结果不能通过增大音量差、切换不同片段或显示预设名称来补判。
