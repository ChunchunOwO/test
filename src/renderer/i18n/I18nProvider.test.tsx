// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localeMocks = vi.hoisted(() => {
  let resolveEnglish: ((translations: Record<string, string>) => void) | undefined;
  let englishPromise = new Promise<Record<string, string>>((resolve) => {
    resolveEnglish = resolve;
  });
  const fallback = { greeting: '你好' };

  return {
    fallback,
    getEnglishPromise: () => englishPromise,
    reset: () => {
      resolveEnglish = undefined;
      englishPromise = new Promise<Record<string, string>>((resolve) => {
        resolveEnglish = resolve;
      });
    },
    resolveEnglish: () => resolveEnglish?.({ greeting: 'Hello' }),
  };
});

vi.mock('./locales', () => ({
  fallbackTranslations: localeMocks.fallback,
  getLoadedTranslations: (locale: string) => locale === 'zh-CN' ? localeMocks.fallback : undefined,
  isLocale: (locale: unknown) => locale === 'zh-CN' || locale === 'en-US',
  loadTranslations: (locale: string) => locale === 'zh-CN'
    ? Promise.resolve(localeMocks.fallback)
    : localeMocks.getEnglishPromise(),
  localeOptions: [
    { locale: 'zh-CN', label: '简体中文' },
    { locale: 'en-US', label: 'English' },
  ],
  resolveTranslationText: (_locale: string, translations: Record<string, string> | undefined, key: string) =>
    translations?.[key] ?? localeMocks.fallback[key as keyof typeof localeMocks.fallback] ?? key,
}));

vi.mock('../utils/echoBridge', () => ({
  getAppBridge: () => undefined,
}));

import { I18nProvider, useI18n } from './I18nProvider';

const LocaleHarness = (): JSX.Element => {
  const { locale, setLocale, t } = useI18n();
  const [, setRenderCount] = useState(0);

  return (
    <>
      <span data-testid="locale">{locale}</span>
      <span data-testid="greeting">{t('greeting' as never)}</span>
      <button type="button" onClick={() => setLocale('en-US')}>English</button>
      <button type="button" onClick={() => setRenderCount((count) => count + 1)}>Rerender</button>
    </>
  );
};

describe('I18nProvider locale switching', () => {
  beforeEach(() => {
    localeMocks.reset();
    window.localStorage.clear();
    window.localStorage.setItem('echo.locale', 'zh-CN');
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the current language visible until the target dictionary is loaded', async () => {
    render(<I18nProvider><LocaleHarness /></I18nProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rerender' }));

    expect(screen.getByTestId('locale').textContent).toBe('zh-CN');
    expect(screen.getByTestId('greeting').textContent).toBe('你好');

    localeMocks.resolveEnglish();

    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en-US'));
    expect(screen.getByTestId('greeting').textContent).toBe('Hello');
  });
});
