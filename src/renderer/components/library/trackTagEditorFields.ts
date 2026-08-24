import type { EditableTrackTags, LibraryTrack } from '../../../shared/types/library';

export type TagSection = 'basic' | 'album' | 'order';

export type TagFormState = {
  title: string;
  artist: string;
  composer: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: string;
  trackNo: string;
  trackTotal: string;
  discNo: string;
  discTotal: string;
  bpm: string;
  comment: string;
};

export type NumericField = 'trackNo' | 'trackTotal' | 'discNo' | 'discTotal' | 'year' | 'bpm';

export type FieldDefinition = {
  key: keyof TagFormState;
  label: string;
  group: TagSection;
  description: string;
  keywords?: string;
  inputMode?: 'numeric' | 'decimal';
  kind?: 'input' | 'textarea';
  maxLength?: number;
};

export const fieldDefinitions: FieldDefinition[] = [
  { key: 'title', label: '标题', group: 'basic', description: '歌曲显示名称', keywords: '歌名 曲名 title', maxLength: 512 },
  { key: 'artist', label: '艺术家', group: 'basic', description: '歌曲表演者', keywords: '歌手 作者 artist', maxLength: 512 },
  { key: 'composer', label: '作曲', group: 'basic', description: '音乐创作者', keywords: '作曲家 composer', maxLength: 512 },
  { key: 'genre', label: '流派', group: 'basic', description: '音乐风格分类', keywords: '类型 风格 genre', maxLength: 256 },
  { key: 'album', label: '专辑', group: 'album', description: '所属专辑名称', keywords: '唱片 album', maxLength: 512 },
  { key: 'albumArtist', label: '专辑艺术家', group: 'album', description: '专辑级别的艺术家', keywords: 'album artist', maxLength: 512 },
  { key: 'year', label: '年份', group: 'album', description: '发行年份', keywords: '日期 年代 year', inputMode: 'numeric', maxLength: 4 },
  { key: 'trackNo', label: '音轨号', group: 'order', description: '当前曲目在专辑中的顺序', keywords: '曲序 track number', inputMode: 'numeric', maxLength: 6 },
  { key: 'trackTotal', label: '总音轨数', group: 'order', description: '专辑包含的曲目总数', keywords: '总曲数 track total', inputMode: 'numeric', maxLength: 6 },
  { key: 'discNo', label: '碟片号', group: 'order', description: '当前碟片在套装中的顺序', keywords: '碟序 disc number', inputMode: 'numeric', maxLength: 4 },
  { key: 'discTotal', label: '总碟数', group: 'order', description: '套装包含的碟片总数', keywords: 'disc total', inputMode: 'numeric', maxLength: 4 },
  { key: 'bpm', label: 'BPM', group: 'order', description: '每分钟节拍数，可自动测量', keywords: '节拍 速度 tempo bpm 测量', inputMode: 'decimal', maxLength: 7 },
  { key: 'comment', label: '注释', group: 'order', description: '写入文件的备注文本', keywords: '备注 评论 comment', kind: 'textarea', maxLength: 512 },
];

const numberText = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : '';

export const stateFromTrack = (track: LibraryTrack | null): TagFormState => ({
  title: track?.title ?? '',
  artist: track?.artist ?? '',
  composer: '',
  album: track?.album ?? '',
  albumArtist: track?.albumArtist ?? '',
  genre: track?.genre ?? '',
  year: numberText(track?.year),
  trackNo: numberText(track?.trackNo),
  trackTotal: '',
  discNo: numberText(track?.discNo),
  discTotal: '',
  bpm: numberText(track?.bpm),
  comment: '',
});

export const stateFromEditableTags = (tags: EditableTrackTags, fallbackTrack: LibraryTrack | null): TagFormState => ({
  title: tags.title ?? fallbackTrack?.title ?? '',
  artist: tags.artist ?? fallbackTrack?.artist ?? '',
  composer: tags.composer ?? '',
  album: tags.album ?? fallbackTrack?.album ?? '',
  albumArtist: tags.albumArtist ?? fallbackTrack?.albumArtist ?? '',
  genre: tags.genre ?? '',
  year: numberText(tags.year),
  trackNo: numberText(tags.trackNo),
  trackTotal: numberText(tags.totalTracks),
  discNo: numberText(tags.discNo),
  discTotal: numberText(tags.totalDiscs),
  bpm: numberText(tags.bpm ?? fallbackTrack?.bpm),
  comment: tags.comment ?? '',
});

export const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
};

const validatePositiveInteger = (value: string, label: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
    return `${label}必须是正整数或留空`;
  }
  return null;
};

const validateYear = (value: string): string | null => {
  const positiveIntegerError = validatePositiveInteger(value, '年份');
  if (positiveIntegerError || !value.trim()) {
    return positiveIntegerError;
  }

  const year = Number(value);
  if (year < 1000 || year > new Date().getFullYear() + 1) {
    return `年份应在 1000–${new Date().getFullYear() + 1} 之间`;
  }
  return null;
};

const validateBpm = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const bpm = Number(trimmed);
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm >= 1000) {
    return 'BPM 必须是小于 1000 的正数或留空';
  }
  return null;
};

export const getValidationErrors = (form: TagFormState): Partial<Record<NumericField, string>> => {
  const errors: Partial<Record<NumericField, string>> = {
    trackNo: validatePositiveInteger(form.trackNo, '音轨号') ?? undefined,
    trackTotal: validatePositiveInteger(form.trackTotal, '总音轨数') ?? undefined,
    discNo: validatePositiveInteger(form.discNo, '碟片号') ?? undefined,
    discTotal: validatePositiveInteger(form.discTotal, '总碟数') ?? undefined,
    year: validateYear(form.year) ?? undefined,
    bpm: validateBpm(form.bpm) ?? undefined,
  };

  const trackNo = numberOrNull(form.trackNo);
  const trackTotal = numberOrNull(form.trackTotal);
  if (!errors.trackNo && !errors.trackTotal && trackNo !== null && trackTotal !== null && trackNo > trackTotal) {
    errors.trackNo = '音轨号不能大于总音轨数';
  }

  const discNo = numberOrNull(form.discNo);
  const discTotal = numberOrNull(form.discTotal);
  if (!errors.discNo && !errors.discTotal && discNo !== null && discTotal !== null && discNo > discTotal) {
    errors.discNo = '碟片号不能大于总碟数';
  }

  return errors;
};

export const hasValidationErrors = (errors: Partial<Record<NumericField, string>>): boolean =>
  Object.values(errors).some(Boolean);

export const editableTagsFromForm = (
  form: TagFormState,
  extendedTagsLoaded: boolean,
  editedFields: ReadonlySet<keyof TagFormState>,
): EditableTrackTags => {
  const tags: EditableTrackTags = {
    title: form.title,
    artist: form.artist,
    album: form.album,
    albumArtist: form.albumArtist,
    trackNo: numberOrNull(form.trackNo),
    discNo: numberOrNull(form.discNo),
    year: numberOrNull(form.year),
    genre: form.genre.trim() || null,
    bpm: numberOrNull(form.bpm),
  };

  if (extendedTagsLoaded || editedFields.has('composer')) {
    tags.composer = form.composer.trim() || null;
  }
  if (extendedTagsLoaded || editedFields.has('trackTotal')) {
    tags.totalTracks = numberOrNull(form.trackTotal);
  }
  if (extendedTagsLoaded || editedFields.has('discTotal')) {
    tags.totalDiscs = numberOrNull(form.discTotal);
  }
  if (extendedTagsLoaded || editedFields.has('comment')) {
    tags.comment = form.comment.trim() || null;
  }

  return tags;
};
