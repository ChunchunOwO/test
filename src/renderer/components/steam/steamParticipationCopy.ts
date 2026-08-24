export type SteamParticipationLocaleCopy = Record<'zh-CN' | 'zh-TW' | 'ja-JP' | 'en-US' | 'ko-KR', string>;

export const extendedStatsConsentCopy: SteamParticipationLocaleCopy = {
  'zh-CN': 'Steam 成就所需的六项累计进度会自动同步。开启扩展统计后，还会同步“最长单次聆听”和“重逢旧歌”两个整数汇总。不会上传歌曲名、艺人、专辑名、文件路径、逐条播放记录、设备或时间线；这些统计与当前 Steam 账号关联，并非匿名数据。确认开启扩展统计？',
  'zh-TW': 'Steam 成就所需的六項累計進度會自動同步。開啟擴充統計後，還會同步「最長單次聆聽」與「重逢舊歌」兩個整數彙總。不會上傳歌曲名稱、藝人、專輯名稱、檔案路徑、逐條播放記錄、裝置或時間軸；這些統計與目前 Steam 帳號關聯，並非匿名資料。確認開啟擴充統計？',
  'ja-JP': 'Steam実績に必要な6つの累積進捗は自動同期されます。拡張統計を有効にすると、最長セッションと再発見した曲の2つの整数集計値も同期します。曲名、アーティスト、アルバム名、パス、個別の再生履歴、デバイス、時系列は送信しません。統計はSteamアカウントに紐づき、匿名ではありません。拡張統計を有効にしますか？',
  'en-US': 'Six cumulative values required for Steam achievement progress sync automatically. Enabling extended stats also syncs two integer aggregates: longest session and rediscovered tracks. Track names, artists, album names, paths, individual playback records, devices, and timelines are excluded. These stats are account-linked, not anonymous. Enable extended stats?',
  'ko-KR': 'Steam 도전 과제에 필요한 누적 진행도 6개는 자동으로 동기화됩니다. 확장 통계를 켜면 최장 세션과 다시 발견한 트랙의 정수 집계값 2개도 동기화합니다. 곡명, 아티스트, 앨범명, 경로, 개별 재생 기록, 장치 및 시간선은 업로드하지 않습니다. 통계는 Steam 계정에 연결되며 익명 데이터가 아닙니다. 확장 통계를 켤까요?',
};

export const leaderboardConsentCopy: SteamParticipationLocaleCopy = {
  'zh-CN': '参与 Steam 排行榜会提交五项与当前 Steam 账号关联的聚合成绩：累计播放、完播曲目、最长连续天数、最长会话和重逢旧歌数，并附带会话数、深夜时长等整数摘要。排行榜可以显示你的 Steam 公开昵称和排名；不会上传歌曲名、艺人、专辑、文件路径、逐条播放记录或设备信息。确认开启？',
  'zh-TW': '參與 Steam 排行榜會提交五項與目前 Steam 帳號關聯的彙總成績：累計播放、完整播放曲目、最長連續天數、最長工作階段與重逢舊歌數，並附帶工作階段數、深夜時長等整數摘要。排行榜可以顯示你的 Steam 公開暱稱與排名；不會上傳歌曲名稱、藝人、專輯、檔案路徑、逐條播放記錄或裝置資訊。確定開啟？',
  'ja-JP': 'Steamランキングには、現在のSteamアカウントに紐づく5つの集計スコア（総再生時間、完了トラック数、最長連続日数、最長セッション、再発見トラック数）と整数の補足値を送信します。ランキングにはSteamの公開名と順位が表示される場合があります。曲名、アーティスト、アルバム、パス、個別の再生履歴、デバイス情報は送信しません。有効にしますか？',
  'en-US': 'Joining submits five account-linked aggregate scores: listening time, completed tracks, longest streak, longest session, and rediscovered tracks, plus integer-only summaries such as session count and night listening time. Your public Steam persona and rank may appear on the board. Track names, artists, albums, paths, individual playback records, and device information are excluded. Enable participation?',
  'ko-KR': 'Steam 순위표에는 현재 Steam 계정에 연결된 집계 점수 5개(총 감상 시간, 완료 트랙 수, 최장 연속 일수, 최장 세션, 다시 발견한 트랙 수)와 정수 요약을 제출합니다. 순위표에 Steam 공개 이름과 순위가 표시될 수 있습니다. 곡명, 아티스트, 앨범, 경로, 개별 재생 기록 및 장치 정보는 업로드하지 않습니다. 참여할까요?',
};
