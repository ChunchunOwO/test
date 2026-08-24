import type { AppLocale } from '../../../shared/types/appSettings';
import type { AudioPlaybackState } from '../../../shared/types/audio';
import type { SteamRichPresenceSnapshot } from './SteamCapabilityServices';

export const steamPresenceDetailSeparator = ' · ';

export type SteamPresenceCopy = {
  unknownTrack: string;
  unknownArtist: string;
  unknownAlbum: string;
  listening: string;
  paused: string;
  cueing: string;
  listeningTo: (title: string, artist: string) => string;
  pausedOn: (title: string, artist: string) => string;
  cueingTrack: (title: string, artist: string) => string;
  playingLocal: string;
  playingLocalNight: string;
  loadingLocal: string;
  pausedLocal: string;
  idle: string;
  browsing: string;
  shuffle: string;
  repeatOne: string;
  repeatAll: string;
};

const copyByLocale: Record<AppLocale, SteamPresenceCopy> = {
  'en-US': {
    unknownTrack: 'Unknown track',
    unknownArtist: 'Unknown artist',
    unknownAlbum: 'Unknown album',
    listening: 'Listening',
    paused: 'Paused',
    cueing: 'Cueing',
    listeningTo: (title, artist) => `${title} — ${artist}`,
    pausedOn: (title, artist) => `Paused · ${title} — ${artist}`,
    cueingTrack: (title, artist) => `Cueing · ${title} — ${artist}`,
    playingLocal: 'Listening to local music',
    playingLocalNight: 'Listening after midnight',
    loadingLocal: 'Cueing a local track',
    pausedLocal: 'Paused in the listening room',
    idle: 'In the listening room',
    browsing: 'In the library',
    shuffle: 'Shuffle',
    repeatOne: 'Repeat one',
    repeatAll: 'Repeat all',
  },
  'zh-CN': {
    unknownTrack: '未知曲目',
    unknownArtist: '未知艺人',
    unknownAlbum: '未知专辑',
    listening: '正在听',
    paused: '已暂停',
    cueing: '正在准备',
    listeningTo: (title, artist) => `正在听 ${title} · ${artist}`,
    pausedOn: (title, artist) => `暂停于 ${title} · ${artist}`,
    cueingTrack: (title, artist) => `正在准备 ${title} · ${artist}`,
    playingLocal: '正在听本地音乐',
    playingLocalNight: '午夜还在听',
    loadingLocal: '正在准备本地音乐',
    pausedLocal: '在听音室暂停',
    idle: '在听音室',
    browsing: '在曲库里',
    shuffle: '随机播放',
    repeatOne: '单曲循环',
    repeatAll: '列表循环',
  },
  'zh-TW': {
    unknownTrack: '未知曲目',
    unknownArtist: '未知藝人',
    unknownAlbum: '未知專輯',
    listening: '正在聽',
    paused: '已暫停',
    cueing: '正在準備',
    listeningTo: (title, artist) => `正在聽 ${title} · ${artist}`,
    pausedOn: (title, artist) => `暫停於 ${title} · ${artist}`,
    cueingTrack: (title, artist) => `正在準備 ${title} · ${artist}`,
    playingLocal: '正在聽本機音樂',
    playingLocalNight: '午夜還在聽',
    loadingLocal: '正在準備本機音樂',
    pausedLocal: '在聽音室暫停',
    idle: '在聽音室',
    browsing: '在曲庫裡',
    shuffle: '隨機播放',
    repeatOne: '單曲循環',
    repeatAll: '列表循環',
  },
  'ja-JP': {
    unknownTrack: '不明な曲',
    unknownArtist: '不明なアーティスト',
    unknownAlbum: '不明なアルバム',
    listening: '再生中',
    paused: '一時停止',
    cueing: '準備中',
    listeningTo: (title, artist) => `${title} — ${artist} を聴いています`,
    pausedOn: (title, artist) => `${title} — ${artist} を一時停止中`,
    cueingTrack: (title, artist) => `${title} — ${artist} を準備中`,
    playingLocal: 'ローカル音楽を聴いています',
    playingLocalNight: '深夜に聴いています',
    loadingLocal: 'ローカル音楽を準備中',
    pausedLocal: 'リスニングルームで一時停止中',
    idle: 'リスニングルームにいます',
    browsing: 'ライブラリを眺めています',
    shuffle: 'シャッフル',
    repeatOne: '1曲リピート',
    repeatAll: '全曲リピート',
  },
  'ko-KR': {
    unknownTrack: '알 수 없는 곡',
    unknownArtist: '알 수 없는 아티스트',
    unknownAlbum: '알 수 없는 앨범',
    listening: '듣는 중',
    paused: '일시 정지',
    cueing: '준비 중',
    listeningTo: (title, artist) => `${title} — ${artist} 듣는 중`,
    pausedOn: (title, artist) => `${title} — ${artist} 일시 정지`,
    cueingTrack: (title, artist) => `${title} — ${artist} 준비 중`,
    playingLocal: '로컬 음악을 듣는 중',
    playingLocalNight: '한밤중에 듣는 중',
    loadingLocal: '로컬 음악을 준비하는 중',
    pausedLocal: '리스닝룸에서 일시 정지',
    idle: '리스닝룸에 있습니다',
    browsing: '라이브러리를 둘러보는 중',
    shuffle: '셔플',
    repeatOne: '한 곡 반복',
    repeatAll: '전체 반복',
  },
};

const midnightPresenceHours = new Set([0, 1, 2, 3, 4]);

export const isSteamMidnightListeningHour = (now: Date): boolean => midnightPresenceHours.has(now.getHours());

export const getSteamPresenceCopy = (locale: AppLocale | null | undefined): SteamPresenceCopy =>
  copyByLocale[locale ?? 'en-US'] ?? copyByLocale['en-US'];

export const formatSteamTrackHeadline = (
  copy: SteamPresenceCopy,
  state: 'playing' | 'paused' | 'loading',
  title: string,
  artist: string,
): string => {
  if (state === 'paused') return copy.pausedOn(title, artist);
  if (state === 'loading') return copy.cueingTrack(title, artist);
  return copy.listeningTo(title, artist);
};

export const joinSteamPresenceDetails = (parts: Array<string | null | undefined>): string | null => {
  const joined = parts.filter((value): value is string => Boolean(value)).join(steamPresenceDetailSeparator);
  return joined || null;
};

export const resolveSteamAmbientPresence = (
  state: AudioPlaybackState,
  now: Date,
  locale?: AppLocale | null,
): Pick<SteamRichPresenceSnapshot, 'display' | 'status'> => {
  const copy = getSteamPresenceCopy(locale);
  if (state === 'playing') {
    return isSteamMidnightListeningHour(now)
      ? { display: '#Status_PlayingLocalMusicNight', status: copy.playingLocalNight }
      : { display: '#Status_PlayingLocalMusic', status: copy.playingLocal };
  }
  if (state === 'loading') {
    return { display: '#Status_LoadingLocalMusic', status: copy.loadingLocal };
  }
  if (state === 'paused') {
    return { display: '#Status_PausedLocalMusic', status: copy.pausedLocal };
  }
  if (state === 'idle') {
    return { display: '#Status_Idle', status: copy.idle };
  }
  return { display: '#Status_BrowsingLibrary', status: copy.browsing };
};
