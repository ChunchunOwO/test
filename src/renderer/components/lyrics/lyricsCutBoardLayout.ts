export type LyricsCutBoardLayout = {
  accentColor: string;
  accentIndex: number;
  columns: readonly number[];
  sliceShades: readonly number[];
};

const sampleWidth = 96;
const sampleHeight = 54;
const panelBoundaries = [0.12, 0.32, 0.445, 0.555, 0.665, 0.9] as const;

export const fallbackLyricsCutBoardLayout: LyricsCutBoardLayout = {
  accentColor: 'rgb(255 112 94)',
  accentIndex: 3,
  columns: [12, 20, 12.5, 11, 11, 23.5, 10],
  sliceShades: [0.24, 0.12, 0.1, 0.08, 0.12, 0.14, 0.24],
};

const pixelLuminance = (pixels: Uint8ClampedArray, offset: number): number =>
  pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;

const sampleSliceShades = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  boundaries: readonly number[],
): number[] => {
  const stops = [0, ...boundaries, 1];
  return stops.slice(1).map((stop, segmentIndex) => {
    const startX = Math.max(0, Math.floor(stops[segmentIndex] * width));
    const endX = Math.min(width, Math.max(startX + 1, Math.ceil(stop * width)));
    let luminance = 0;
    let count = 0;

    for (let y = Math.floor(height * 0.08); y < Math.ceil(height * 0.88); y += 2) {
      for (let x = startX; x < endX; x += 2) {
        luminance += pixelLuminance(pixels, (y * width + x) * 4);
        count += 1;
      }
    }

    const normalizedLuminance = count > 0 ? luminance / count / 255 : 0.5;
    const edgeProtection = segmentIndex === 0 || segmentIndex === stops.length - 2 ? 0.08 : 0;
    return Number(Math.min(0.36, Math.max(0.08, 0.08 + normalizedLuminance * 0.22 + edgeProtection)).toFixed(3));
  });
};

const pickAccent = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  boundaries: readonly number[],
): Pick<LyricsCutBoardLayout, 'accentColor' | 'accentIndex'> => {
  const stops = [0, ...boundaries, 1];
  let bestIndex = fallbackLyricsCutBoardLayout.accentIndex;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestRgb = { r: 255, g: 112, b: 94 };

  for (let segmentIndex = 1; segmentIndex < Math.min(stops.length - 2, 6); segmentIndex += 1) {
    const startX = Math.max(0, Math.floor(stops[segmentIndex] * width));
    const endX = Math.min(width, Math.ceil(stops[segmentIndex + 1] * width));
    let r = 0;
    let g = 0;
    let b = 0;
    let saturation = 0;
    let count = 0;

    for (let y = Math.floor(height * 0.12); y < Math.ceil(height * 0.82); y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        r += red;
        g += green;
        b += blue;
        saturation += max === 0 ? 0 : (max - min) / max;
        count += 1;
      }
    }

    if (count === 0) {
      continue;
    }
    const center = (stops[segmentIndex] + stops[segmentIndex + 1]) / 2;
    const centerBias = 1 - Math.min(1, Math.abs(center - 0.52) * 1.35);
    const score = saturation / count + centerBias * 0.28;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = segmentIndex;
      bestRgb = { r: r / count, g: g / count, b: b / count };
    }
  }

  const lift = 0.28;
  const lifted = {
    r: Math.round(bestRgb.r * (1 - lift) + 255 * lift),
    g: Math.round(bestRgb.g * (1 - lift) + 102 * lift),
    b: Math.round(bestRgb.b * (1 - lift) + 88 * lift),
  };
  return {
    accentColor: `rgb(${lifted.r} ${lifted.g} ${lifted.b})`,
    accentIndex: fallbackLyricsCutBoardLayout.accentIndex,
  };
};

export const analyzeLyricsCutBoardPixels = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): LyricsCutBoardLayout => {
  if (width < 8 || height < 8 || pixels.length < width * height * 4) {
    return fallbackLyricsCutBoardLayout;
  }

  return {
    ...pickAccent(pixels, width, height, panelBoundaries),
    columns: fallbackLyricsCutBoardLayout.columns,
    sliceShades: sampleSliceShades(pixels, width, height, panelBoundaries),
  };
};

export const sampleLyricsCutBoardImage = (image: HTMLImageElement): LyricsCutBoardLayout => {
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return fallbackLyricsCutBoardLayout;
  }
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  canvas.width = 0;
  canvas.height = 0;
  return analyzeLyricsCutBoardPixels(pixels, sampleWidth, sampleHeight);
};
