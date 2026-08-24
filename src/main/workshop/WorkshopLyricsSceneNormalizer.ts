import {
  workshopLyricsSceneDeclaresSlot,
  workshopLyricsSceneSchemaVersion,
  workshopLyricsSceneSlots,
  workshopLyricsSceneStyleProperties,
  type WorkshopLyricsScene,
  type WorkshopLyricsSceneHostChrome,
  type WorkshopLyricsSceneCondition,
  type WorkshopLyricsSceneGroupNode,
  type WorkshopLyricsSceneMotion,
  type WorkshopLyricsSceneNode,
  type WorkshopLyricsSceneResponsiveStyle,
  type WorkshopLyricsSceneSlot,
  type WorkshopLyricsSceneSlotOptions,
  type WorkshopLyricsSceneStyle,
  type WorkshopLyricsSceneStyleProperty,
  type WorkshopLyricsSceneStyleValue,
} from '../../shared/types/workshopLyricsScene';
import { normalizeWorkshopAssetPath } from './WorkshopAssetPolicy';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataBoolean,
  readWorkshopDataNumber,
  readWorkshopDataOptionalString,
  readWorkshopDataString,
} from './WorkshopDataValidation';

const maximumSceneNodes = 64;
const maximumSceneDepth = 8;
const maximumChildrenPerGroup = 24;
const maximumStyleProperties = 48;
const nodeIdPattern = /^[a-z][a-z0-9_-]{0,47}$/u;
const styleProperties = new Set<string>(workshopLyricsSceneStyleProperties);
const slots = new Set<string>(workshopLyricsSceneSlots);

const enumStyleValues: Partial<Record<WorkshopLyricsSceneStyleProperty, Set<string>>> = {
  position: new Set(['relative', 'absolute']),
  display: new Set(['block', 'flex', 'grid', 'none']),
  flexDirection: new Set(['row', 'row-reverse', 'column', 'column-reverse']),
  flexWrap: new Set(['nowrap', 'wrap', 'wrap-reverse']),
  alignItems: new Set(['stretch', 'flex-start', 'center', 'flex-end', 'baseline']),
  alignContent: new Set(['stretch', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']),
  alignSelf: new Set(['auto', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline']),
  justifyContent: new Set(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']),
  justifyItems: new Set(['stretch', 'start', 'center', 'end']),
  justifySelf: new Set(['auto', 'stretch', 'start', 'center', 'end']),
  placeContent: new Set(['stretch', 'start', 'center', 'end', 'space-between', 'space-around', 'space-evenly']),
  placeItems: new Set(['stretch', 'start', 'center', 'end']),
  placeSelf: new Set(['auto', 'stretch', 'start', 'center', 'end']),
  gridAutoFlow: new Set(['row', 'column', 'dense', 'row dense', 'column dense']),
  boxSizing: new Set(['content-box', 'border-box']),
  overflow: new Set(['visible', 'hidden', 'auto', 'scroll']),
  overflowX: new Set(['visible', 'hidden', 'auto', 'scroll']),
  overflowY: new Set(['visible', 'hidden', 'auto', 'scroll']),
  visibility: new Set(['visible', 'hidden']),
  backgroundRepeat: new Set(['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round']),
  backgroundBlendMode: new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']),
  borderStyle: new Set(['none', 'solid', 'dashed', 'dotted', 'double']),
  mixBlendMode: new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']),
  fontStyle: new Set(['normal', 'italic', 'oblique']),
  textAlign: new Set(['left', 'center', 'right', 'start', 'end']),
  textTransform: new Set(['none', 'uppercase', 'lowercase', 'capitalize']),
  textOverflow: new Set(['clip', 'ellipsis']),
  whiteSpace: new Set(['normal', 'nowrap', 'pre-line', 'break-spaces']),
  wordBreak: new Set(['normal', 'break-all', 'break-word', 'keep-all']),
  writingMode: new Set(['horizontal-tb', 'vertical-rl', 'vertical-lr']),
  objectFit: new Set(['contain', 'cover', 'fill', 'none', 'scale-down']),
  cursor: new Set(['auto', 'default', 'pointer', 'text']),
  pointerEvents: new Set(['none', 'auto']),
  userSelect: new Set(['auto', 'none', 'text']),
};

const numericStyleRanges: Partial<Record<WorkshopLyricsSceneStyleProperty, readonly [number, number]>> = {
  zIndex: [-100, 100],
  opacity: [0, 1],
  fontWeight: [100, 900],
  flexGrow: [0, 20],
  flexShrink: [0, 20],
  order: [-64, 64],
};

const colorStyleProperties = new Set<WorkshopLyricsSceneStyleProperty>([
  'color', 'background', 'backgroundColor', 'backgroundImage',
  'border', 'borderColor', 'outline', 'boxShadow', 'textShadow',
]);

const freeformStyleProperties = new Set<WorkshopLyricsSceneStyleProperty>([
  'flex',
  'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas',
  'gridAutoColumns', 'gridAutoRows',
  'gridColumn', 'gridColumnStart', 'gridColumnEnd',
  'gridRow', 'gridRowStart', 'gridRowEnd',
  'backgroundPosition', 'backgroundSize',
  'backdropFilter', 'filter', 'transform', 'transformOrigin', 'fontFamily',
  'clipPath', 'textDecoration', 'objectPosition', 'aspectRatio',
]);

const unsafeCssValuePattern = /(?:url\s*\(|expression\s*\(|javascript:|@import|[;{}])/iu;
const safeCssValuePattern = /^[#(),.%+\-/*\p{L}\p{N}_\s'"$]+$/u;
const lengthTokenPattern = /^(?:auto|min-content|max-content|fit-content|0|-?\d+(?:\.\d+)?(?:px|%|vw|vh|rem|em|fr|cqw|cqh|cqmin|cqmax)?)$/u;

const isSafeLengthValue = (value: string): boolean => {
  const tokens = value.trim().split(/\s+/u);
  if (tokens.length >= 1 && tokens.length <= 4 && tokens.every((token) => lengthTokenPattern.test(token))) {
    return true;
  }
  return /^(?:calc|clamp|min|max)\([#(),.%+\-/*\p{L}\p{N}_\s'"$]+\)$/u.test(value);
};

const normalizeStyleValue = (
  property: WorkshopLyricsSceneStyleProperty,
  value: unknown,
): WorkshopLyricsSceneStyleValue => {
  const enumValues = enumStyleValues[property];
  if (enumValues) {
    const normalized = readWorkshopDataString(value, `lyrics_scene_style_${property}`, 32);
    if (!enumValues.has(normalized)) {
      throw new Error(`workshop_data_lyrics_scene_style_${property}_invalid`);
    }
    return normalized;
  }

  const numericRange = numericStyleRanges[property];
  if (numericRange) {
    return readWorkshopDataNumber(
      value,
      `lyrics_scene_style_${property}`,
      numericRange[0],
      numericRange[1],
      { integer: property === 'zIndex' || property === 'fontWeight' || property === 'order' },
    );
  }

  if (typeof value === 'number') {
    return readWorkshopDataNumber(value, `lyrics_scene_style_${property}`, -4096, 4096);
  }
  const maximumLength = colorStyleProperties.has(property) ? 240 : 160;
  const normalized = readWorkshopDataString(value, `lyrics_scene_style_${property}`, maximumLength);
  if (unsafeCssValuePattern.test(normalized) || !safeCssValuePattern.test(normalized)) {
    throw new Error(`workshop_data_lyrics_scene_style_${property}_invalid`);
  }
  if (!colorStyleProperties.has(property) && !freeformStyleProperties.has(property)) {
    if (!isSafeLengthValue(normalized)) {
      throw new Error(`workshop_data_lyrics_scene_style_${property}_invalid`);
    }
  }
  return normalized;
};

const normalizeStyle = (inputValue: unknown, field: string): WorkshopLyricsSceneStyle => {
  const input = asWorkshopDataRecord(inputValue, `workshop_data_lyrics_scene_${field}_invalid`);
  const keys = Object.keys(input);
  if (keys.length > maximumStyleProperties || keys.some((key) => !styleProperties.has(key))) {
    throw new Error('workshop_data_lyrics_scene_style_unknown_field');
  }
  return Object.fromEntries(keys.map((key) => [
    key,
    normalizeStyleValue(key as WorkshopLyricsSceneStyleProperty, input[key]),
  ])) as WorkshopLyricsSceneStyle;
};

const normalizeResponsive = (inputValue: unknown): WorkshopLyricsSceneResponsiveStyle => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_responsive_invalid');
  assertWorkshopDataKeys(input, ['compact', 'wide'], 'workshop_data_lyrics_scene_responsive_unknown_field');
  return {
    ...(input.compact !== undefined ? { compact: normalizeStyle(input.compact, 'compact_style') } : {}),
    ...(input.wide !== undefined ? { wide: normalizeStyle(input.wide, 'wide_style') } : {}),
  };
};

const normalizeMotion = (inputValue: unknown): WorkshopLyricsSceneMotion => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_motion_invalid');
  assertWorkshopDataKeys(input, ['preset', 'durationMs', 'delayMs', 'intensity', 'loop'], 'workshop_data_lyrics_scene_motion_unknown_field');
  const preset = readWorkshopDataString(input.preset, 'lyrics_scene_motion_preset', 20);
  if (!['none', 'fade', 'slide-up', 'slide-left', 'scale', 'float', 'pulse'].includes(preset)) {
    throw new Error('workshop_data_lyrics_scene_motion_preset_invalid');
  }
  return {
    preset: preset as WorkshopLyricsSceneMotion['preset'],
    ...(input.durationMs !== undefined ? { durationMs: readWorkshopDataNumber(input.durationMs, 'lyrics_scene_motion_duration', 80, 30_000, { integer: true }) } : {}),
    ...(input.delayMs !== undefined ? { delayMs: readWorkshopDataNumber(input.delayMs, 'lyrics_scene_motion_delay', 0, 30_000, { integer: true }) } : {}),
    ...(input.intensity !== undefined ? { intensity: readWorkshopDataNumber(input.intensity, 'lyrics_scene_motion_intensity', 0, 2) } : {}),
    ...(input.loop !== undefined ? { loop: readWorkshopDataBoolean(input.loop, 'lyrics_scene_motion_loop') } : {}),
  };
};

const normalizeCondition = (inputValue: unknown): WorkshopLyricsSceneCondition => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_condition_invalid');
  assertWorkshopDataKeys(input, ['hasCover', 'hasLyrics', 'isPlaying'], 'workshop_data_lyrics_scene_condition_unknown_field');
  return {
    ...(input.hasCover !== undefined ? { hasCover: readWorkshopDataBoolean(input.hasCover, 'lyrics_scene_condition_cover') } : {}),
    ...(input.hasLyrics !== undefined ? { hasLyrics: readWorkshopDataBoolean(input.hasLyrics, 'lyrics_scene_condition_lyrics') } : {}),
    ...(input.isPlaying !== undefined ? { isPlaying: readWorkshopDataBoolean(input.isPlaying, 'lyrics_scene_condition_playing') } : {}),
  };
};

const normalizeSlotOptions = (inputValue: unknown): WorkshopLyricsSceneSlotOptions => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_slot_options_invalid');
  assertWorkshopDataKeys(input, [
    'showTranslation', 'showRomanization', 'showTimestamps', 'wordHighlightEnabled',
    'spectrumBars', 'spectrumGain', 'spectrumScale',
    'spectrumAttackMs', 'spectrumReleaseMs', 'emptyText',
  ], 'workshop_data_lyrics_scene_slot_options_unknown_field');
  const spectrumScale = input.spectrumScale === undefined
    ? undefined
    : readWorkshopDataString(input.spectrumScale, 'lyrics_scene_spectrum_scale', 16);
  if (spectrumScale !== undefined && spectrumScale !== 'linear' && spectrumScale !== 'perceptual') {
    throw new Error('workshop_data_lyrics_scene_spectrum_scale_invalid');
  }
  return {
    ...(input.showTranslation !== undefined ? { showTranslation: readWorkshopDataBoolean(input.showTranslation, 'lyrics_scene_show_translation') } : {}),
    ...(input.showRomanization !== undefined ? { showRomanization: readWorkshopDataBoolean(input.showRomanization, 'lyrics_scene_show_romanization') } : {}),
    ...(input.showTimestamps !== undefined ? { showTimestamps: readWorkshopDataBoolean(input.showTimestamps, 'lyrics_scene_show_timestamps') } : {}),
    ...(input.wordHighlightEnabled !== undefined ? { wordHighlightEnabled: readWorkshopDataBoolean(input.wordHighlightEnabled, 'lyrics_scene_word_highlight') } : {}),
    ...(input.spectrumBars !== undefined ? { spectrumBars: readWorkshopDataNumber(input.spectrumBars, 'lyrics_scene_spectrum_bars', 4, 128, { integer: true }) } : {}),
    ...(input.spectrumGain !== undefined ? { spectrumGain: readWorkshopDataNumber(input.spectrumGain, 'lyrics_scene_spectrum_gain', 0.25, 4) } : {}),
    ...(spectrumScale !== undefined ? { spectrumScale } : {}),
    ...(input.spectrumAttackMs !== undefined ? { spectrumAttackMs: readWorkshopDataNumber(input.spectrumAttackMs, 'lyrics_scene_spectrum_attack', 8, 600) } : {}),
    ...(input.spectrumReleaseMs !== undefined ? { spectrumReleaseMs: readWorkshopDataNumber(input.spectrumReleaseMs, 'lyrics_scene_spectrum_release', 8, 1200) } : {}),
    ...(input.emptyText !== undefined ? { emptyText: readWorkshopDataOptionalString(input.emptyText, 'lyrics_scene_empty_text', 120) } : {}),
  };
};

const normalizeHostChrome = (inputValue: unknown): WorkshopLyricsSceneHostChrome => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_host_chrome_invalid');
  assertWorkshopDataKeys(input, ['miniPlayer'], 'workshop_data_lyrics_scene_host_chrome_unknown_field');
  if (input.miniPlayer === undefined) {
    return {};
  }
  const miniPlayer = readWorkshopDataString(input.miniPlayer, 'lyrics_scene_host_chrome_mini_player', 16);
  if (miniPlayer !== 'visible' && miniPlayer !== 'hidden') {
    throw new Error('workshop_data_lyrics_scene_host_chrome_mini_player_invalid');
  }
  return { miniPlayer };
};

type NormalizeState = { count: number; ids: Set<string> };

const normalizeNode = (
  inputValue: unknown,
  depth: number,
  state: NormalizeState,
): WorkshopLyricsSceneNode => {
  if (depth > maximumSceneDepth || state.count >= maximumSceneNodes) {
    throw new Error('workshop_data_lyrics_scene_complexity_exceeded');
  }
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_node_invalid');
  assertWorkshopDataKeys(input, [
    'id', 'type', 'style', 'responsive', 'motion', 'when',
    'children', 'slot', 'options', 'text', 'asset',
  ], 'workshop_data_lyrics_scene_node_unknown_field');
  const id = readWorkshopDataString(input.id, 'lyrics_scene_node_id', 48);
  if (!nodeIdPattern.test(id) || state.ids.has(id)) {
    throw new Error('workshop_data_lyrics_scene_node_id_invalid');
  }
  state.ids.add(id);
  state.count += 1;
  const type = readWorkshopDataString(input.type, 'lyrics_scene_node_type', 16);
  const base = {
    id,
    ...(input.style !== undefined ? { style: normalizeStyle(input.style, 'style') } : {}),
    ...(input.responsive !== undefined ? { responsive: normalizeResponsive(input.responsive) } : {}),
    ...(input.motion !== undefined ? { motion: normalizeMotion(input.motion) } : {}),
    ...(input.when !== undefined ? { when: normalizeCondition(input.when) } : {}),
  };

  if (type === 'group') {
    if (!Array.isArray(input.children) || input.children.length > maximumChildrenPerGroup) {
      throw new Error('workshop_data_lyrics_scene_children_invalid');
    }
    return {
      ...base,
      type,
      children: input.children.map((child) => normalizeNode(child, depth + 1, state)),
    };
  }
  if (type === 'slot') {
    const slot = readWorkshopDataString(input.slot, 'lyrics_scene_slot', 32);
    if (!slots.has(slot)) {
      throw new Error('workshop_data_lyrics_scene_slot_invalid');
    }
    return {
      ...base,
      type,
      slot: slot as WorkshopLyricsSceneSlot,
      ...(input.options !== undefined ? { options: normalizeSlotOptions(input.options) } : {}),
    };
  }
  if (type === 'text') {
    return {
      ...base,
      type,
      text: readWorkshopDataString(input.text, 'lyrics_scene_text', 240),
    };
  }
  if (type === 'decoration') {
    return { ...base, type };
  }
  if (type === 'image') {
    return {
      ...base,
      type,
      asset: normalizeWorkshopAssetPath(input.asset, 'lyrics_scene_image_asset'),
    };
  }
  throw new Error('workshop_data_lyrics_scene_node_type_invalid');
};

export const normalizeWorkshopLyricsScene = (inputValue: unknown): WorkshopLyricsScene => {
  const input = asWorkshopDataRecord(inputValue, 'workshop_data_lyrics_scene_invalid');
  assertWorkshopDataKeys(input, ['schemaVersion', 'background', 'root', 'backgroundAsset', 'hostChrome'], 'workshop_data_lyrics_scene_unknown_field');
  if (input.schemaVersion !== workshopLyricsSceneSchemaVersion) {
    throw new Error('workshop_data_lyrics_scene_schema_invalid');
  }
  const background = readWorkshopDataString(input.background, 'lyrics_scene_background', 20);
  if (!['theme', 'cover', 'cover-blur', 'cover-color', 'transparent', 'asset'].includes(background)) {
    throw new Error('workshop_data_lyrics_scene_background_invalid');
  }
  if (background === 'asset' && input.backgroundAsset === undefined) {
    throw new Error('workshop_data_lyrics_scene_background_asset_missing');
  }
  const backgroundAsset = input.backgroundAsset === undefined
    ? undefined
    : normalizeWorkshopAssetPath(input.backgroundAsset, 'lyrics_scene_background_asset');
  const hostChrome = input.hostChrome === undefined ? undefined : normalizeHostChrome(input.hostChrome);
  const root = normalizeNode(input.root, 0, { count: 0, ids: new Set() });
  if (root.type !== 'group') {
    throw new Error('workshop_data_lyrics_scene_root_invalid');
  }
  if (hostChrome?.miniPlayer === 'hidden' && !workshopLyricsSceneDeclaresSlot(root, 'play-toggle')) {
    throw new Error('workshop_data_lyrics_scene_host_chrome_mini_player_requires_play_toggle');
  }
  return {
    schemaVersion: workshopLyricsSceneSchemaVersion,
    background: background as WorkshopLyricsScene['background'],
    ...(backgroundAsset ? { backgroundAsset } : {}),
    ...(hostChrome && Object.keys(hostChrome).length > 0 ? { hostChrome } : {}),
    root: root as WorkshopLyricsSceneGroupNode,
  };
};
