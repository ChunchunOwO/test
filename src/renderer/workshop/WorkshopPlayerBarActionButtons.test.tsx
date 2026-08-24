// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkshopPlayerBarActionButtons } from './WorkshopPlayerBarActionButtons';
import {
  clearWorkshopPlayerBarActionsForTests,
  publishWorkshopPlayerBarActions,
} from './WorkshopPlayerBarActions';

afterEach(() => {
  cleanup();
  clearWorkshopPlayerBarActionsForTests();
});

describe('WorkshopPlayerBarActionButtons', () => {
  it('renders ready declared actions and invokes the Workshop command adapter', () => {
    const run = vi.fn(async () => undefined);
    publishWorkshopPlayerBarActions([{
      key: 'steam:123:inspect',
      title: '检查歌曲',
      description: '运行插件检查器',
      pluginName: '社区工具',
      icon: 'sparkles',
      ready: true,
      run,
    }]);

    render(<WorkshopPlayerBarActionButtons />);
    const button = screen.getByRole('button', { name: '社区工具：检查歌曲' });
    expect(button.getAttribute('title')).toContain('运行插件检查器');
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps an action disabled until its declared command registers', () => {
    publishWorkshopPlayerBarActions([{
      key: 'steam:123:loading',
      title: '稍后运行',
      description: null,
      pluginName: '社区工具',
      icon: 'blocks',
      ready: false,
      run: vi.fn(async () => undefined),
    }]);

    render(<WorkshopPlayerBarActionButtons />);
    expect((screen.getByRole('button', { name: '社区工具：稍后运行' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
