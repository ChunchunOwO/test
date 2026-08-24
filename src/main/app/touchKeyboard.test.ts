import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { getWindowsTouchKeyboardCandidates, showWindowsTouchKeyboard } from './touchKeyboard';

const makeChild = (): ChildProcess => {
  const child = new EventEmitter() as ChildProcess;
  child.unref = vi.fn();
  return child;
};

describe('Windows touch keyboard launcher', () => {
  it('builds the touch keyboard and OSK fallback paths', () => {
    expect(getWindowsTouchKeyboardCandidates({
      programFiles: 'C:\\Programs',
      systemRoot: 'D:\\Windows',
    })).toEqual([
      'C:\\Programs\\Common Files\\microsoft shared\\ink\\TabTip.exe',
      'D:\\Windows\\System32\\osk.exe',
    ]);
  });

  it('does not launch outside Windows', () => {
    const spawnProcess = vi.fn(() => makeChild());

    expect(showWindowsTouchKeyboard({ platform: 'linux', spawnProcess })).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('launches TabTip first when available', () => {
    const spawnProcess = vi.fn(() => makeChild());

    expect(showWindowsTouchKeyboard({
      platform: 'win32',
      programFiles: 'C:\\Programs',
      systemRoot: 'D:\\Windows',
      exists: (path) => path.endsWith('TabTip.exe'),
      spawnProcess,
    })).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith('C:\\Programs\\Common Files\\microsoft shared\\ink\\TabTip.exe');
  });

  it('falls back to OSK when TabTip is missing', () => {
    const spawnProcess = vi.fn(() => makeChild());

    expect(showWindowsTouchKeyboard({
      platform: 'win32',
      programFiles: 'C:\\Programs',
      systemRoot: 'D:\\Windows',
      exists: (path) => path.endsWith('osk.exe'),
      spawnProcess,
    })).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith('D:\\Windows\\System32\\osk.exe');
  });

  it('does not crash and falls back to OSK when TabTip emits an asynchronous launch error', () => {
    const tabTip = makeChild();
    const osk = makeChild();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(tabTip)
      .mockReturnValueOnce(osk);

    expect(showWindowsTouchKeyboard({
      platform: 'win32',
      programFiles: 'C:\\Programs',
      systemRoot: 'D:\\Windows',
      exists: () => true,
      spawnProcess,
    })).toBe(true);

    expect(() => tabTip.emit('error', Object.assign(new Error('EACCES'), { code: 'EACCES' }))).not.toThrow();
    expect(spawnProcess).toHaveBeenNthCalledWith(2, 'D:\\Windows\\System32\\osk.exe');
    expect(osk.unref).toHaveBeenCalledOnce();
  });
});
