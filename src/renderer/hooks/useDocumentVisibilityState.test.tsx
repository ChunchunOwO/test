/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDocumentVisibilityState } from './useDocumentVisibilityState';

describe('useDocumentVisibilityState', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalDescriptor);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('tracks document visibility changes without a frame loop', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const { result } = renderHook(() => useDocumentVisibilityState());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe(false);
  });
});
