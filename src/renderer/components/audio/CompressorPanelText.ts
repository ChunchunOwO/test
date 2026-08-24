import type { Locale } from '../../i18n/locales';

export type CompressorPanelText = {
  aria: string;
  eyebrow: string;
  title: string;
  description: string;
  enabled: string;
  bypassed: string;
  nativeLive: string;
  curveTitle: string;
  curveDetail: string;
  input: string;
  output: string;
  gainReduction: string;
  headroom: string;
  peak: string;
  rms: string;
  left: string;
  right: string;
  historyTitle: string;
  historyWindow: string;
  basic: string;
  advanced: string;
  threshold: string;
  ratio: string;
  attack: string;
  release: string;
  knee: string;
  makeup: string;
  mix: string;
  detector: string;
  sidechainHighpass: string;
  sidechainHighpassFrequency: string;
  autoRelease: string;
  range: string;
  stereoLink: string;
  off: string;
  reset: string;
  apply: string;
  applyHint: string;
  bridgeUnavailable: string;
  clippingRisk: string;
};

const zhCN: CompressorPanelText = {
  aria: '压缩器工作台', eyebrow: 'ECHO Dynamics Workbench', title: '立体声动态压缩器',
  description: '原生峰值 / RMS 检测、软拐点与节目相关包络。所有动态计算和仪表事实都来自 Audio Core。',
  enabled: '已启用', bypassed: '已旁路', nativeLive: 'NATIVE LIVE', curveTitle: '动态传输曲线',
  curveDetail: '拖动阈值线，观察软拐点、压缩斜率与当前信号位置。', input: '输入', output: '输出',
  gainReduction: '增益衰减', headroom: '输出余量', peak: '峰值', rms: 'RMS', left: 'L', right: 'R',
  historyTitle: 'GR 历史', historyWindow: '最近 8 秒', basic: '基础控制', advanced: '高级检测与联动',
  threshold: '阈值', ratio: '压缩比', attack: '启动', release: '释放', knee: '拐点宽度',
  makeup: '补偿增益', mix: '并行混合', detector: '检测器', sidechainHighpass: '侧链高通',
  sidechainHighpassFrequency: '高通频率', autoRelease: '自动释放', range: '最大压缩范围',
  stereoLink: '立体声联动', off: '关闭', reset: '恢复默认', apply: '应用参数',
  applyHint: '编辑先进入草稿；点击应用后由原生主机平滑接管。', bridgeUnavailable: '压缩器控制桥不可用。',
  clippingRisk: '压缩器输出已触及 0 dBFS；请降低补偿增益或增加余量。',
};

const zhTW: CompressorPanelText = {
  aria: '壓縮器工作台', eyebrow: 'ECHO Dynamics Workbench', title: '立體聲動態壓縮器',
  description: '原生 Peak / RMS 偵測、軟拐點與節目相關包絡。所有動態計算和儀表事實都來自 Audio Core。',
  enabled: '已啟用', bypassed: '已旁路', nativeLive: 'NATIVE LIVE', curveTitle: '動態傳輸曲線',
  curveDetail: '拖曳閾值線，觀察軟拐點、壓縮斜率與目前訊號位置。', input: '輸入', output: '輸出',
  gainReduction: '增益衰減', headroom: '輸出餘量', peak: '峰值', rms: 'RMS', left: 'L', right: 'R',
  historyTitle: 'GR 歷史', historyWindow: '最近 8 秒', basic: '基礎控制', advanced: '進階偵測與聯動',
  threshold: '閾值', ratio: '壓縮比', attack: '啟動', release: '釋放', knee: '拐點寬度',
  makeup: '補償增益', mix: '平行混合', detector: '偵測器', sidechainHighpass: '側鏈高通',
  sidechainHighpassFrequency: '高通頻率', autoRelease: '自動釋放', range: '最大壓縮範圍',
  stereoLink: '立體聲聯動', off: '關閉', reset: '恢復預設', apply: '套用參數',
  applyHint: '編輯先進入草稿；點擊套用後由原生主機平滑接管。', bridgeUnavailable: '壓縮器控制橋無法使用。',
  clippingRisk: '壓縮器輸出已觸及 0 dBFS；請降低補償增益或增加餘量。',
};

const enUS: CompressorPanelText = {
  aria: 'Compressor workbench', eyebrow: 'ECHO Dynamics Workbench', title: 'Stereo dynamics compressor',
  description: 'Native Peak / RMS detection, soft knee, and program-dependent envelopes. Audio Core owns every dynamics and meter fact.',
  enabled: 'Enabled', bypassed: 'Bypassed', nativeLive: 'NATIVE LIVE', curveTitle: 'Transfer curve',
  curveDetail: 'Drag the threshold line to inspect the knee, compression slope, and live signal position.', input: 'Input', output: 'Output',
  gainReduction: 'Gain reduction', headroom: 'Output headroom', peak: 'Peak', rms: 'RMS', left: 'L', right: 'R',
  historyTitle: 'GR history', historyWindow: 'Last 8 seconds', basic: 'Basic controls', advanced: 'Advanced detection and linking',
  threshold: 'Threshold', ratio: 'Ratio', attack: 'Attack', release: 'Release', knee: 'Knee width',
  makeup: 'Makeup gain', mix: 'Parallel mix', detector: 'Detector', sidechainHighpass: 'Sidechain high-pass',
  sidechainHighpassFrequency: 'High-pass frequency', autoRelease: 'Auto release', range: 'Maximum reduction range',
  stereoLink: 'Stereo link', off: 'Off', reset: 'Reset defaults', apply: 'Apply parameters',
  applyHint: 'Edits stay in the draft until Apply; the native host then ramps them smoothly.', bridgeUnavailable: 'The compressor control bridge is unavailable.',
  clippingRisk: 'Compressor output has reached 0 dBFS; lower makeup gain or add headroom.',
};

const jaJP: CompressorPanelText = {
  aria: 'コンプレッサーワークベンチ', eyebrow: 'ECHO Dynamics Workbench', title: 'ステレオ・ダイナミクス・コンプレッサー',
  description: 'ネイティブ Peak / RMS 検出、ソフトニー、プログラム依存エンベロープ。動作とメーターの事実は Audio Core が管理します。',
  enabled: '有効', bypassed: 'バイパス', nativeLive: 'NATIVE LIVE', curveTitle: 'トランスファーカーブ',
  curveDetail: 'しきい値線をドラッグして、ニー、圧縮勾配、現在の信号位置を確認します。', input: '入力', output: '出力',
  gainReduction: 'ゲインリダクション', headroom: '出力ヘッドルーム', peak: 'ピーク', rms: 'RMS', left: 'L', right: 'R',
  historyTitle: 'GR 履歴', historyWindow: '直近 8 秒', basic: '基本コントロール', advanced: '高度な検出とリンク',
  threshold: 'しきい値', ratio: 'レシオ', attack: 'アタック', release: 'リリース', knee: 'ニー幅',
  makeup: 'メイクアップゲイン', mix: 'パラレルミックス', detector: '検出方式', sidechainHighpass: 'サイドチェイン HPF',
  sidechainHighpassFrequency: 'HPF 周波数', autoRelease: 'オートリリース', range: '最大リダクション範囲',
  stereoLink: 'ステレオリンク', off: 'オフ', reset: '初期値に戻す', apply: 'パラメーターを適用',
  applyHint: '編集は適用まで下書きに保持され、適用後はネイティブホストが滑らかに追従します。', bridgeUnavailable: 'コンプレッサー制御ブリッジを利用できません。',
  clippingRisk: 'コンプレッサー出力が 0 dBFS に達しました。メイクアップゲインを下げるかヘッドルームを追加してください。',
};

const koKR: CompressorPanelText = {
  aria: '컴프레서 워크벤치', eyebrow: 'ECHO Dynamics Workbench', title: '스테레오 다이내믹스 컴프레서',
  description: '네이티브 Peak / RMS 감지, 소프트 니, 프로그램 종속 엔벌로프를 제공합니다. 모든 처리와 미터 값은 Audio Core가 관리합니다.',
  enabled: '활성화', bypassed: '바이패스', nativeLive: 'NATIVE LIVE', curveTitle: '트랜스퍼 커브',
  curveDetail: '임계값 선을 끌어 니, 압축 기울기와 현재 신호 위치를 확인하세요.', input: '입력', output: '출력',
  gainReduction: '게인 리덕션', headroom: '출력 헤드룸', peak: '피크', rms: 'RMS', left: 'L', right: 'R',
  historyTitle: 'GR 기록', historyWindow: '최근 8초', basic: '기본 제어', advanced: '고급 감지 및 링크',
  threshold: '임계값', ratio: '비율', attack: '어택', release: '릴리스', knee: '니 폭',
  makeup: '메이크업 게인', mix: '패럴렐 믹스', detector: '감지 방식', sidechainHighpass: '사이드체인 HPF',
  sidechainHighpassFrequency: 'HPF 주파수', autoRelease: '자동 릴리스', range: '최대 감쇄 범위',
  stereoLink: '스테레오 링크', off: '끄기', reset: '기본값 복원', apply: '파라미터 적용',
  applyHint: '편집 내용은 적용 전까지 초안으로 유지되며, 적용 후 네이티브 호스트가 부드럽게 전환합니다.', bridgeUnavailable: '컴프레서 제어 브리지를 사용할 수 없습니다.',
  clippingRisk: '컴프레서 출력이 0 dBFS에 도달했습니다. 메이크업 게인을 낮추거나 헤드룸을 추가하세요.',
};

const textByLocale: Record<Locale, CompressorPanelText> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
};

export const getCompressorPanelText = (locale: Locale): CompressorPanelText => textByLocale[locale] ?? enUS;
