import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// The Steam build must be deterministic and may never pick up a developer-local
// or private overlay merely because it exists beside the checkout. The private
// implementations remain in source for non-Steam products, but this repository
// always resolves the runtime alias to the fail-closed public stub.
const privateOverlayRuntime = resolve(__dirname, 'src/main/plugins/privateOverlayRuntime.ts');

// The numeric Steam App ID is public product metadata, but it must be fixed at
// build time for packaged releases. A custom runtime environment variable is
// intentionally not trusted once the app is packaged.
const bundledSteamReleaseAppId = process.env.ECHO_STEAM_RELEASE_APP_ID?.trim() ?? '';
const bundledSteamProDlcAppId = process.env.ECHO_STEAM_PRO_DLC_APP_ID?.trim() ?? '';

export default defineConfig({
  main: {
    define: {
      'process.env.ECHO_STEAM_RELEASE_APP_ID_BUNDLED': JSON.stringify(bundledSteamReleaseAppId),
      'process.env.ECHO_STEAM_PRO_DLC_APP_ID_BUNDLED': JSON.stringify(bundledSteamProDlcAppId),
    },
    resolve: {
      alias: {
        '#echo-private-overlay-runtime': privateOverlayRuntime,
      },
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          libraryScanWorkerHost: resolve(__dirname, 'src/main/library/workers/LibraryScanWorkerHost.ts'),
          libraryIdentityWorkerHost: resolve(__dirname, 'src/main/library/workers/libraryIdentityWorkerHost.ts'),
          librarySearchWorkerHost: resolve(__dirname, 'src/main/library/workers/librarySearchWorkerHost.ts'),
        },
        output: {
          footer: '\nimport "node:module";\n',
        },
        onLog(level, log, handler) {
          if (
            level === 'warn' &&
            log.message.includes('dynamic import will not move module into another chunk')
          ) {
            return;
          }
          handler(level, log);
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          devConsole: resolve(__dirname, 'src/preload/devConsole.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    esbuild: {
      keepNames: true,
    },
    server: {
      fs: {
        allow: [resolve(__dirname)],
      },
    },
    build: {
      minify: 'esbuild',
      cssMinify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          auxiliary: resolve(__dirname, 'src/renderer/auxiliary.html'),
        },
      },
    },
  },
});
