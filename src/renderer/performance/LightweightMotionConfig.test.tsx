// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion/react', () => ({
  MotionConfig: ({
    children,
    reducedMotion,
  }: {
    children: ReactNode;
    reducedMotion?: string;
  }): JSX.Element => <div data-reduced-motion={reducedMotion}>{children}</div>,
}));

import { LightweightMotionConfig } from './LightweightMotionConfig';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'echo');
});

describe('LightweightMotionConfig', () => {
  it('forces reduced motion while lightweight mode is enabled', async () => {
    window.echo = {
      app: {
        getSettings: vi.fn().mockResolvedValue({ lowSpecModeEnabled: true }),
      },
    } as unknown as Window['echo'];

    const { container } = render(
      <LightweightMotionConfig>
        <span>ok</span>
      </LightweightMotionConfig>,
    );

    await waitFor(() => expect(container.firstElementChild?.getAttribute('data-reduced-motion')).toBe('always'));
  });
});
