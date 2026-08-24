const eqFrequenciesHz = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
  12500, 16000, 20000,
];

export const workshopTemplateKinds = [
  'theme',
  'lyrics-style',
  'visualizer-preset',
  'dsp-preset',
  'audio-plugin-profile',
  'plugin-package',
];

const entryByKind = {
  theme: 'theme.json',
  'lyrics-style': 'lyrics-style.json',
  'visualizer-preset': 'visualizer.json',
  'dsp-preset': 'dsp.json',
  'audio-plugin-profile': 'audio-plugin-profile.json',
  'plugin-package': 'community.echo',
};

const tagByKind = {
  theme: 'Theme',
  'lyrics-style': 'Lyrics Scene',
  'visualizer-preset': 'Visualizer',
  'dsp-preset': 'DSP Preset',
  'audio-plugin-profile': 'Audio Plugin Profile',
  'plugin-package': 'Sandboxed Plugin',
};

export const templateEntryForKind = (kind) => entryByKind[kind];
export const templateTagForKind = (kind) => tagByKind[kind];

export const createTemplateEntry = (kind, id, title) => {
  if (kind === 'theme') {
    return {
      type: 'echo-workshop-theme-preset', schemaVersion: 1, id, title,
      description: 'A complete light and dark appearance preset for ECHO.',
      basePreset: 'classic',
      dark: {
        appBg: '#10131a', panel: '#182231', accent: '#66ccff', heading: '#f5fbff',
        text: '#d8e8f3', muted: '#91a7b8', border: '#30465a', panelOpacityPercent: 74,
        glassPercent: 28, cornerRadiusPx: 18, panelBlurPx: 18, motionEnabled: true,
      },
      light: {
        appBg: '#eef8fc', panel: '#f8fdff', accent: '#0b78d0', heading: '#132938',
        text: '#254252', muted: '#607b8a', border: '#b8d3df', panelOpacityPercent: 90,
        glassPercent: 16, cornerRadiusPx: 18, panelBlurPx: 14,
      },
      swatches: ['#10131a', '#182231', '#66ccff', '#eef8fc'],
    };
  }
  if (kind === 'lyrics-style') {
    return {
      type: 'echo-workshop-lyrics-style', schemaVersion: 1, id, title,
      description: 'A responsive declarative lyrics scene.',
      settings: {
        lyricsPageStyle: 'editorial', lyricsWordHighlightEnabled: true,
        lyricsMusicReactiveVisualsEnabled: true, lyricsFontSizePx: 42,
      },
      scene: {
        schemaVersion: 1, background: 'cover-blur',
        root: {
          id: 'stage', type: 'group',
          style: { display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.2fr)', gap: '40px', padding: '32px', height: '100%' },
          responsive: { compact: { gridTemplateColumns: '1fr', padding: '20px' } },
          children: [
            { id: 'cover', type: 'slot', slot: 'cover', style: { width: '100%', aspectRatio: '1 / 1', borderRadius: '28px' } },
            { id: 'lyrics', type: 'slot', slot: 'lyrics', options: { showTranslation: true, wordHighlightEnabled: true } },
          ],
        },
      },
    };
  }
  if (kind === 'visualizer-preset') {
    return {
      type: 'echo-workshop-visualizer-preset', schemaVersion: 1, id, title,
      description: 'A mirrored high-resolution spectrum preset.', style: 'bars',
      palette: ['#66ccff', '#99ffcc'], barCount: 48, smoothing: 0.75,
      sensitivity: 1.2, decay: 0.4, mirror: true,
    };
  }
  if (kind === 'dsp-preset') {
    return {
      type: 'echo-workshop-dsp-preset', schemaVersion: 1, id, title,
      description: 'A conservative ten-band EQ starting point.', preampDb: -6,
      bands: eqFrequenciesHz.map((frequencyHz) => ({ frequencyHz, gainDb: 0, q: 1, filterType: 'peaking', enabled: true })),
    };
  }
  if (kind === 'audio-plugin-profile') {
    return {
      type: 'echo-workshop-audio-plugin-profile', schemaVersion: 1, id, title,
      description: 'A binary-free mapping for a VST3 installed by the subscriber.',
      format: 'vst3', role: 'effect',
      plugin: { classId: '00000000000000000000000000000000', name: 'Replace with local plug-in name', vendor: 'Replace with plug-in vendor' },
      adapter: { api: 'echo.audio-plugin-adapter', minimumVersion: 1 },
      routing: { placement: 'post-dsp' },
      parameters: [{ id: 0, title: 'Mix', kind: 'continuous', defaultValue: 1 }],
      presets: [{ id: 'default', title: 'Default', values: { 0: 1 } }],
    };
  }
  return {
    type: 'echo-plugin-package', version: 1, exportedAt: new Date().toISOString(),
    manifest: {
      id, name: title, version: '1.0.0', apiVersion: 2, entry: 'plugin.js',
      permissions: ['playback:read'],
      contributes: { commands: [{ id: 'hello-echo', title: 'Hello ECHO' }] },
    },
    files: [],
  };
};
