import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { win32 as pathWin32 } from 'node:path';

type TouchKeyboardDependencies = {
  exists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  programFiles?: string;
  systemRoot?: string;
  spawnProcess?: (file: string) => ChildProcess;
};

const launchDetached = (
  file: string,
  spawnProcess: NonNullable<TouchKeyboardDependencies['spawnProcess']>,
  onError: () => void,
): boolean => {
  try {
    const child = spawnProcess(file);
    // spawn permission and launch failures are reported asynchronously through
    // ChildProcess#error, so a try/catch alone would let them crash the app.
    child.once?.('error', onError);
    child.unref?.();
    return true;
  } catch {
    return false;
  }
};

export const getWindowsTouchKeyboardCandidates = (dependencies: TouchKeyboardDependencies = {}): string[] => {
  const programFiles = dependencies.programFiles ?? process.env.ProgramFiles ?? 'C:\\Program Files';
  const systemRoot = dependencies.systemRoot ?? process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';

  return [
    pathWin32.join(programFiles, 'Common Files', 'microsoft shared', 'ink', 'TabTip.exe'),
    pathWin32.join(systemRoot, 'System32', 'osk.exe'),
  ];
};

export const showWindowsTouchKeyboard = (dependencies: TouchKeyboardDependencies = {}): boolean => {
  if ((dependencies.platform ?? process.platform) !== 'win32') {
    return false;
  }

  const exists = dependencies.exists ?? existsSync;
  const spawnProcess =
    dependencies.spawnProcess ??
    ((file: string): ChildProcess => spawn(file, [], { detached: true, stdio: 'ignore', windowsHide: false }));

  const candidates = getWindowsTouchKeyboardCandidates(dependencies);
  const launchFrom = (startIndex: number): boolean => {
    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (exists(candidate) && launchDetached(candidate, spawnProcess, () => {
        launchFrom(index + 1);
      })) {
        return true;
      }
    }

    return false;
  };

  return launchFrom(0);
};
