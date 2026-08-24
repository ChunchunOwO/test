export const crashGuardStickerSpriteSize = {
  width: 960,
  height: 512,
} as const;

type CrashGuardStickerCrop = {
  baseWidth: number;
  baseMotionDurationMs: number;
  cropHeight: number;
  cropWidth: number;
  cropX: number;
  cropY: number;
  id: string;
  motion: CrashGuardStickerMotion;
};

type CrashGuardStickerSlot = {
  leftPercent: number;
  topPercent: number;
};

export type CrashGuardStickerPlacement = CrashGuardStickerCrop & {
  delayMs: number;
  displayHeight: number;
  displayWidth: number;
  leftPercent: number;
  motionDelayMs: number;
  motionDurationMs: number;
  rotationDeg: number;
  slotIndex: number;
  spriteScale: number;
  topPercent: number;
};

export type CrashGuardStickerMotion = 'sway' | 'bob' | 'bounce' | 'pulse' | 'twinkle' | 'drift';

export type CrashGuardStickerStyle = {
  animationDelay: string;
  height: string;
  left: string;
  top: string;
  transform: string;
  width: string;
};

export type CrashGuardStickerArtStyle = {
  animationDelay: string;
  animationDuration: string;
  backgroundPosition: string;
  backgroundSize: string;
};

const stickerCrops: readonly CrashGuardStickerCrop[] = [
  { id: 'bandage', cropX: 0, cropY: 0, cropWidth: 308, cropHeight: 250, baseWidth: 92, motion: 'sway', baseMotionDurationMs: 4200 },
  { id: 'care-charm', cropX: 320, cropY: 0, cropWidth: 186, cropHeight: 240, baseWidth: 64, motion: 'bob', baseMotionDurationMs: 3800 },
  { id: 'music-note', cropX: 640, cropY: 0, cropWidth: 193, cropHeight: 202, baseWidth: 66, motion: 'bounce', baseMotionDurationMs: 3000 },
  { id: 'pulse-heart', cropX: 0, cropY: 256, cropWidth: 290, cropHeight: 250, baseWidth: 86, motion: 'pulse', baseMotionDurationMs: 2400 },
  { id: 'sparkle', cropX: 320, cropY: 256, cropWidth: 175, cropHeight: 193, baseWidth: 58, motion: 'twinkle', baseMotionDurationMs: 2700 },
  { id: 'capsule', cropX: 640, cropY: 256, cropWidth: 173, cropHeight: 174, baseWidth: 58, motion: 'drift', baseMotionDurationMs: 4600 },
] as const;

// These anchors keep the random field in the visual rail and away from the
// recovery controls. A shuffled subset creates variety without unsafe overlap.
const safeStickerSlots: readonly CrashGuardStickerSlot[] = [
  { leftPercent: 63, topPercent: 7 },
  { leftPercent: 76, topPercent: 7 },
  { leftPercent: 89, topPercent: 7 },
  { leftPercent: 96, topPercent: 20 },
  { leftPercent: 95, topPercent: 36 },
  { leftPercent: 95, topPercent: 53 },
  { leftPercent: 95, topPercent: 70 },
  { leftPercent: 90, topPercent: 84 },
  { leftPercent: 79, topPercent: 89 },
  { leftPercent: 68, topPercent: 87 },
  { leftPercent: 59, topPercent: 78 },
  { leftPercent: 61, topPercent: 58 },
] as const;

const readRandom = (random: () => number): number => {
  const value = random();
  return Number.isFinite(value) ? Math.min(0.999_999, Math.max(0, value)) : 0.5;
};

const shuffledSlotIndexes = (random: () => number): number[] => {
  const indexes = safeStickerSlots.map((_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(readRandom(random) * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
};

const rounded = (value: number): number => Math.round(value * 100) / 100;

export const createCrashGuardStickerPlacements = (
  random: () => number = Math.random,
): CrashGuardStickerPlacement[] => {
  const slotIndexes = shuffledSlotIndexes(random);
  return stickerCrops.map((sticker, index) => {
    const slotIndex = slotIndexes[index];
    const slot = safeStickerSlots[slotIndex];
    const sizeFactor = 0.9 + readRandom(random) * 0.2;
    const displayWidth = sticker.baseWidth * sizeFactor;
    const spriteScale = displayWidth / sticker.cropWidth;
    const motionDurationMs = Math.round(sticker.baseMotionDurationMs * (0.9 + readRandom(random) * 0.2));
    return {
      ...sticker,
      slotIndex,
      leftPercent: rounded(slot.leftPercent + (readRandom(random) - 0.5) * 2.4),
      topPercent: rounded(slot.topPercent + (readRandom(random) - 0.5) * 2.4),
      rotationDeg: rounded((readRandom(random) - 0.5) * 18),
      displayWidth: rounded(displayWidth),
      displayHeight: rounded(sticker.cropHeight * spriteScale),
      spriteScale,
      delayMs: Math.round(170 + index * 48 + readRandom(random) * 70),
      motionDurationMs,
      motionDelayMs: -Math.round(readRandom(random) * motionDurationMs),
    };
  });
};

export const crashGuardStickerStyle = (
  placement: CrashGuardStickerPlacement,
): CrashGuardStickerStyle => ({
  left: `${placement.leftPercent}%`,
  top: `${placement.topPercent}%`,
  width: `${placement.displayWidth}px`,
  height: `${placement.displayHeight}px`,
  transform: `translate(-50%, -50%) rotate(${placement.rotationDeg}deg)`,
  animationDelay: `${placement.delayMs}ms`,
});

export const crashGuardStickerArtStyle = (
  placement: CrashGuardStickerPlacement,
): CrashGuardStickerArtStyle => ({
  backgroundSize: `${rounded(crashGuardStickerSpriteSize.width * placement.spriteScale)}px ${rounded(crashGuardStickerSpriteSize.height * placement.spriteScale)}px`,
  backgroundPosition: `${rounded(-placement.cropX * placement.spriteScale)}px ${rounded(-placement.cropY * placement.spriteScale)}px`,
  animationDuration: `${placement.motionDurationMs}ms`,
  animationDelay: `${placement.motionDelayMs}ms`,
});

export const crashGuardStickerStyleText = (
  placement: CrashGuardStickerPlacement,
): string => {
  const style = crashGuardStickerStyle(placement);
  return [
    `left:${style.left}`,
    `top:${style.top}`,
    `width:${style.width}`,
    `height:${style.height}`,
    `transform:${style.transform}`,
    `animation-delay:${style.animationDelay}`,
  ].join(';');
};

export const crashGuardStickerArtStyleText = (
  placement: CrashGuardStickerPlacement,
): string => {
  const style = crashGuardStickerArtStyle(placement);
  return [
    `background-size:${style.backgroundSize}`,
    `background-position:${style.backgroundPosition}`,
    `animation-duration:${style.animationDuration}`,
    `animation-delay:${style.animationDelay}`,
  ].join(';');
};
