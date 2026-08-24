import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const assetsDirectory = join(root, 'out', 'renderer', 'assets');

const findAsset = (pattern) => {
  const matches = readdirSync(assetsDirectory).filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one asset matching ${pattern}, found: ${matches.join(', ') || 'none'}`);
  }
  return join(assetsDirectory, matches[0]);
};

const findRendererEntryAsset = (htmlFileName) => {
  const html = readFileSync(join(root, 'out', 'renderer', htmlFileName), 'utf8');
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc="\.\/assets\/([^"]+\.js)"[^>]*>/gu)]
    .map((match) => match[1]);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one renderer entry in ${htmlFileName}, found: ${matches.join(', ') || 'none'}`);
  }
  return join(assetsDirectory, matches[0]);
};

const budgets = [
  {
    label: 'main process',
    assets: [{ label: 'main process', path: join(root, 'out', 'main', 'index.js') }],
    maxBytes: 5_350_000,
  },
  {
    label: 'renderer entry',
    assets: [{ label: 'renderer entry', path: findRendererEntryAsset('index.html') }],
    maxBytes: 660_000,
  },
  {
    label: 'app shell',
    assets: [{ label: 'app shell', path: findAsset(/^App-[^.]+\.js$/u) }],
    maxBytes: 645_000,
  },
  {
    label: 'settings route',
    assets: [{ label: 'settings route', path: findAsset(/^SettingsPage-[^.]+\.js$/u) }],
    maxBytes: 643_000,
  },
  {
    label: 'main-window startup styles',
    // Vite currently splits the main-window CSS across the App chunk, the
    // explicit mainWindowStyles entry, and a shared auxiliary-window chunk.
    // Budget the complete startup set so CSS code splitting cannot hide growth.
    assets: [
      { label: 'app styles', path: findAsset(/^App-[^.]+\.css$/u) },
      { label: 'main-window styles', path: findAsset(/^mainWindowStyles-[^.]+\.css$/u) },
      { label: 'shared styles', path: findAsset(/^accessibility-[^.]+\.css$/u) },
    ],
    maxBytes: 1_825_000,
  },
];

let failed = false;
for (const budget of budgets) {
  const assetSizes = budget.assets.map((asset) => ({
    ...asset,
    bytes: statSync(asset.path).size,
  }));
  const actualBytes = assetSizes.reduce((total, asset) => total + asset.bytes, 0);
  const status = actualBytes <= budget.maxBytes ? 'PASS' : 'FAIL';
  failed ||= status === 'FAIL';
  console.log(`${status} ${budget.label}: ${actualBytes.toLocaleString()} / ${budget.maxBytes.toLocaleString()} bytes`);
  if (assetSizes.length > 1) {
    for (const asset of assetSizes) {
      console.log(`  ${asset.label}: ${asset.bytes.toLocaleString()} bytes`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
