export const workshopLyricsSceneSchemaVersion = 1 as const;

export const workshopLyricsSceneSlots = [
  'cover',
  'title',
  'artist',
  'album',
  'lyrics',
  'current-line',
  'previous-line',
  'next-line',
  'translation',
  'progress',
  'seek-bar',
  'time-current',
  'time-duration',
  'spectrum',
  'status',
  'track-tech',
  'play-toggle',
  'previous-track',
  'next-track',
  'volume-slider',
] as const;

export type WorkshopLyricsSceneSlot = (typeof workshopLyricsSceneSlots)[number];

/**
 * Slots the host renders as interactive transport controls. A scene only
 * declares placement and styling; the host owns the button markup and the
 * playback commands behind it.
 */
export const workshopLyricsSceneTransportSlots = [
  'seek-bar',
  'play-toggle',
  'previous-track',
  'next-track',
  'volume-slider',
] as const;

export const workshopLyricsSceneStyleProperties = [
  'position', 'inset', 'top', 'right', 'bottom', 'left', 'zIndex', 'boxSizing',
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'alignContent',
  'alignSelf', 'justifyContent', 'justifyItems', 'justifySelf',
  'placeContent', 'placeItems', 'placeSelf',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'order',
  'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas',
  'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow',
  'gridColumn', 'gridColumnStart', 'gridColumnEnd',
  'gridRow', 'gridRowStart', 'gridRowEnd',
  'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'overflow', 'overflowX', 'overflowY', 'visibility',
  'color', 'background', 'backgroundColor', 'backgroundImage',
  'backgroundPosition', 'backgroundSize', 'backgroundRepeat', 'backgroundBlendMode',
  'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'outline',
  'boxShadow', 'backdropFilter', 'filter', 'mixBlendMode', 'opacity',
  'clipPath', 'transform', 'transformOrigin',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'textAlign', 'textTransform', 'textDecoration', 'textOverflow', 'textShadow',
  'whiteSpace', 'wordBreak', 'writingMode',
  'objectFit', 'objectPosition', 'aspectRatio',
  'cursor', 'pointerEvents', 'userSelect',
] as const;

export type WorkshopLyricsSceneStyleProperty =
  (typeof workshopLyricsSceneStyleProperties)[number];

export type WorkshopLyricsSceneStyleValue = string | number;
export type WorkshopLyricsSceneStyle = Partial<Record<
  WorkshopLyricsSceneStyleProperty,
  WorkshopLyricsSceneStyleValue
>>;

export type WorkshopLyricsSceneResponsiveStyle = {
  compact?: WorkshopLyricsSceneStyle;
  wide?: WorkshopLyricsSceneStyle;
};

export type WorkshopLyricsSceneMotion = {
  preset: 'none' | 'fade' | 'slide-up' | 'slide-left' | 'scale' | 'float' | 'pulse';
  durationMs?: number;
  delayMs?: number;
  intensity?: number;
  loop?: boolean;
};

export type WorkshopLyricsSceneCondition = {
  hasCover?: boolean;
  hasLyrics?: boolean;
  isPlaying?: boolean;
};

export type WorkshopLyricsSceneNodeBase = {
  id: string;
  style?: WorkshopLyricsSceneStyle;
  responsive?: WorkshopLyricsSceneResponsiveStyle;
  motion?: WorkshopLyricsSceneMotion;
  when?: WorkshopLyricsSceneCondition;
};

export type WorkshopLyricsSceneGroupNode = WorkshopLyricsSceneNodeBase & {
  type: 'group';
  children: WorkshopLyricsSceneNode[];
};

export type WorkshopLyricsSceneSlotOptions = {
  showTranslation?: boolean;
  showRomanization?: boolean;
  showTimestamps?: boolean;
  wordHighlightEnabled?: boolean;
  spectrumBars?: number;
  spectrumGain?: number;
  spectrumScale?: 'linear' | 'perceptual';
  spectrumAttackMs?: number;
  spectrumReleaseMs?: number;
  emptyText?: string;
};

export type WorkshopLyricsSceneSlotNode = WorkshopLyricsSceneNodeBase & {
  type: 'slot';
  slot: WorkshopLyricsSceneSlot;
  options?: WorkshopLyricsSceneSlotOptions;
};

export type WorkshopLyricsSceneTextNode = WorkshopLyricsSceneNodeBase & {
  type: 'text';
  text: string;
};

export type WorkshopLyricsSceneDecorationNode = WorkshopLyricsSceneNodeBase & {
  type: 'decoration';
};

export type WorkshopLyricsSceneImageNode = WorkshopLyricsSceneNodeBase & {
  type: 'image';
  asset: string;
  src?: string;
};

export type WorkshopLyricsSceneNode =
  | WorkshopLyricsSceneGroupNode
  | WorkshopLyricsSceneSlotNode
  | WorkshopLyricsSceneTextNode
  | WorkshopLyricsSceneDecorationNode
  | WorkshopLyricsSceneImageNode;

export type WorkshopLyricsSceneHostChrome = {
  miniPlayer?: 'visible' | 'hidden';
};

export type WorkshopLyricsScene = {
  schemaVersion: typeof workshopLyricsSceneSchemaVersion;
  background: 'theme' | 'cover' | 'cover-blur' | 'cover-color' | 'transparent' | 'asset';
  backgroundAsset?: string;
  backgroundSrc?: string;
  hostChrome?: WorkshopLyricsSceneHostChrome;
  root: WorkshopLyricsSceneGroupNode;
};

export const workshopLyricsSceneDeclaresSlot = (
  node: WorkshopLyricsSceneNode,
  slot: WorkshopLyricsSceneSlot,
): boolean => (node.type === 'slot'
  ? node.slot === slot
  : node.type === 'group' && node.children.some((child) => workshopLyricsSceneDeclaresSlot(child, slot)));

/**
 * A scene may only replace the host mini player when it declares its own
 * play/pause control, so a malformed scene can never leave the page without a
 * way to resume playback.
 */
export const workshopLyricsSceneHidesHostMiniPlayer = (scene: WorkshopLyricsScene): boolean =>
  scene.hostChrome?.miniPlayer === 'hidden'
  && workshopLyricsSceneDeclaresSlot(scene.root, 'play-toggle');

export type WorkshopActiveLyricsScene = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  title: string;
  scene: WorkshopLyricsScene;
};
