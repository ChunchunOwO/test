import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';

const installRoot = app.isPackaged ? dirname(process.resourcesPath) : process.cwd();
const loaderHome = join(installRoot, 'ShinawaseLoader');
const modsHome = join(installRoot, 'Mods');
const loaderState = join(loaderHome, 'loader-state.json');
const loaderConfigPath = join(loaderHome, 'loader.config.json');
let loaderProcess: ChildProcess | null = null;
const debugLog = (message: string): void => {
  try { appendFileSync(join(loaderHome, 'loader-debug.log'), `${new Date().toISOString()} ${message}\n`, 'utf8'); } catch { /* diagnostics must not affect startup */ }
};

export const isExternalModLoaderInstalled = (): boolean => (
  existsSync(loaderState) && existsSync(join(loaderHome, 'ShinawaseLoader.mjs'))
);
const readLoaderConfig = (): { autoStart?: boolean; showConsole?: boolean; port?: number; debugPort?: number } => {
  try { return JSON.parse(readFileSync(loaderConfigPath, 'utf8')); } catch { return {}; }
};
export const isExternalModLoaderAutoStartEnabled = (): boolean => isExternalModLoaderInstalled() && readLoaderConfig().autoStart !== false;

const loaderScript = (): string | null => {
  const script = join(loaderHome, 'ShinawaseLoader.mjs');
  return existsSync(script) ? script : null;
};

export const startExternalModLoader = (): void => {
  debugLog(`start installed=${isExternalModLoaderInstalled()} existing=${Boolean(loaderProcess)} argv=${process.argv.join(' ')}`);
  if (!isExternalModLoaderInstalled() || loaderProcess) return;
  if (process.argv.includes('--no-mod-loader')) return debugLog('disabled by argv');
  const script = loaderScript();
  if (!script) return debugLog('loader script missing');
  const config = readLoaderConfig();
  const showConsole = process.argv.includes('--mod-loader-console') || config.showConsole === true;
  const port = process.env.ECHO_MOD_PORT ?? String(config.port ?? 17862);
  const debugPort = process.env.ECHO_MOD_DEBUG_PORT ?? String(config.debugPort ?? 9229);
  const bundledNode = join(installRoot, 'ShinawaseLoader', process.platform === 'win32' ? 'node.exe' : 'node');
  const nodeBinary = process.env.ECHO_NODE_PATH || (existsSync(bundledNode) ? bundledNode : (process.platform === 'win32' ? 'node.exe' : 'node'));
  const loaderArgs = [script, 'attach', '--port', port, '--debug-port', debugPort];
  const command = showConsole && process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : nodeBinary;
  const args = showConsole && process.platform === 'win32'
    ? ['/d', '/k', [nodeBinary, ...loaderArgs].map((value) => `"${value.replaceAll('"', '\\"')}"`).join(' ')]
    : loaderArgs;
  loaderProcess = spawn(command, args, {
    cwd: installRoot,
    env: { ...process.env, ECHO_WORKSPACE_ROOT: installRoot, ECHO_MOD_HOME: loaderHome, ECHO_MODS_HOME: modsHome },
    windowsHide: !showConsole,
    stdio: showConsole ? 'inherit' : 'ignore',
  });
  debugLog(`spawned pid=${loaderProcess.pid ?? 'none'} node=${nodeBinary} script=${script}`);
  loaderProcess.once('error', (error) => debugLog(`child error ${error.message}`));
  loaderProcess.once('exit', (code, signal) => { debugLog(`child exit code=${code ?? 'null'} signal=${signal ?? 'null'}`); loaderProcess = null; });
};

export const stopExternalModLoader = (): void => {
  if (!loaderProcess) return;
  if (process.platform === 'win32' && loaderProcess.pid) {
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'taskkill', '/pid', String(loaderProcess.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    loaderProcess.kill();
  }
  loaderProcess = null;
};
