import { nativeImage, nativeTheme, type NativeImage } from 'electron';

export type TaskbarIconName = 'previous' | 'play' | 'pause' | 'next' | 'heart' | 'heartFilled';

type Rgb = readonly [number, number, number];
type ShapeTest = (x: number, y: number) => boolean;

const edgeSide = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number =>
  (bx - ax) * (py - ay) - (by - ay) * (px - ax);

const inTriangle = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean => {
  const d1 = edgeSide(ax, ay, bx, by, px, py);
  const d2 = edgeSide(bx, by, cx, cy, px, py);
  const d3 = edgeSide(cx, cy, ax, ay, px, py);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
};

const heartExpression = (x: number, y: number, inset: number): number => {
  const nx = (16 * x - 8) / 7;
  const ny = (7 - 16 * y) / 7;
  const base = nx * nx + ny * ny - inset;
  return base * base * base - nx * nx * ny * ny * ny;
};

const previousShape: ShapeTest = (x, y) =>
  (x >= 0.14 && x <= 0.27 && y >= 0.16 && y <= 0.84) || inTriangle(x, y, 0.86, 0.16, 0.86, 0.84, 0.33, 0.5);

// Shape tests use normalized [0, 1] icon coordinates so each DPI
// representation can be rendered with supersampled anti-aliasing.
const iconShapes: Record<TaskbarIconName, ShapeTest> = {
  previous: previousShape,
  next: (x, y) => previousShape(1 - x, y),
  play: (x, y) => inTriangle(x, y, 0.24, 0.14, 0.24, 0.86, 0.9, 0.5),
  pause: (x, y) => y >= 0.15 && y <= 0.85 && ((x >= 0.22 && x <= 0.42) || (x >= 0.58 && x <= 0.78)),
  heart: (x, y) => heartExpression(x, y, 0.45) <= 0 && heartExpression(x, y, 0.27) >= 0,
  heartFilled: (x, y) => heartExpression(x, y, 0.45) <= 0,
};

const iconRepresentations = [
  { size: 16, scaleFactor: 1 },
  { size: 24, scaleFactor: 1.5 },
  { size: 32, scaleFactor: 2 },
] as const;

export const isDarkTaskbarIconTheme = (): boolean => {
  try {
    return nativeTheme?.shouldUseDarkColors !== false;
  } catch {
    return true;
  }
};

export const getTaskbarIconThemeKey = (): string => (isDarkTaskbarIconTheme() ? 'dark' : 'light');

export const subscribeTaskbarIconTheme = (listener: () => void): (() => void) => {
  try {
    nativeTheme?.on?.('updated', listener);
    return () => {
      try {
        nativeTheme?.off?.('updated', listener);
      } catch {
        // Listener cleanup is best-effort during shutdown.
      }
    };
  } catch {
    return () => {};
  }
};

const resolveIconColor = (name: TaskbarIconName, darkTheme: boolean): Rgb => {
  if (name === 'heartFilled') {
    return darkTheme ? [255, 99, 122] : [214, 36, 68];
  }
  return darkTheme ? [242, 244, 247] : [32, 41, 67];
};

const renderIconPng = (shape: ShapeTest, size: number, color: Rgb): Buffer => {
  const samplesPerAxis = 4;
  const sampleCount = samplesPerAxis * samplesPerAxis;
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < samplesPerAxis; sy += 1) {
        for (let sx = 0; sx < samplesPerAxis; sx += 1) {
          const px = (x + (sx + 0.5) / samplesPerAxis) / size;
          const py = (y + (sy + 0.5) / samplesPerAxis) / size;
          if (shape(px, py)) hits += 1;
        }
      }
      const alpha = Math.round((hits * 255) / sampleCount);
      const offset = (y * size + x) * 4;
      // createFromBitmap expects premultiplied BGRA on Windows.
      raw[offset] = Math.round((color[2] * alpha) / 255);
      raw[offset + 1] = Math.round((color[1] * alpha) / 255);
      raw[offset + 2] = Math.round((color[0] * alpha) / 255);
      raw[offset + 3] = alpha;
    }
  }

  return nativeImage.createFromBitmap(raw, { width: size, height: size }).toPNG();
};

export const createTaskbarThumbarIcon = (name: TaskbarIconName): NativeImage | null => {
  try {
    const color = resolveIconColor(name, isDarkTaskbarIconTheme());
    const icon = nativeImage.createEmpty();
    for (const { size, scaleFactor } of iconRepresentations) {
      icon.addRepresentation({ scaleFactor, buffer: renderIconPng(iconShapes[name], size, color) });
    }
    return icon.isEmpty() ? null : icon;
  } catch {
    return null;
  }
};
