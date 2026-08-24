import { useEffect, type RefObject } from 'react';
import { isImeComposingKeyEvent } from '../../utils/imeInput';
import { isShortcutTextTarget } from '../../utils/shortcutAccelerator';

export type SettingsWasdDirection = 'up' | 'left' | 'down' | 'right';

export const resolveSettingsWasdDirection = (key: string): SettingsWasdDirection | null => {
  switch (key.toLowerCase()) {
    case 'w': return 'up';
    case 'a': return 'left';
    case 's': return 'down';
    case 'd': return 'right';
    default: return null;
  }
};

const interactiveTargetSelector = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest(interactiveTargetSelector));

export const shouldHandleSettingsWasd = (
  event: KeyboardEvent,
  { allowInteractiveTarget = false }: { allowInteractiveTarget?: boolean } = {},
): boolean => Boolean(
  resolveSettingsWasdDirection(event.key)
  && !event.defaultPrevented
  && !event.ctrlKey
  && !event.metaKey
  && !event.altKey
  && !event.shiftKey
  && document.body.dataset.echoShortcutRecording !== 'true'
  && !isImeComposingKeyEvent(event)
  && !isShortcutTextTarget(event)
  && (allowInteractiveTarget || !isInteractiveTarget(event.target))
  && !document.querySelector('dialog[open], [role="dialog"]'),
);

const wasdScrollStep = 88;
const selectableControlSelector = 'button:not(:disabled), a[href]';

const findSelectableControl = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>(selectableControlSelector) : null;

const getSelectableControls = (scrollShell: HTMLDivElement): HTMLElement[] =>
  Array.from(scrollShell.querySelectorAll<HTMLElement>(
    '.settings-section[data-visible="true"] button:not(:disabled), .settings-section[data-visible="true"] a[href]',
  )).filter((control) => !control.closest('[hidden], [aria-hidden="true"]'));

const handleEnterActivation = (event: KeyboardEvent, scrollShell: HTMLDivElement): boolean => {
  if (
    event.key !== 'Enter'
    || event.defaultPrevented
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || event.shiftKey
    || document.body.dataset.echoShortcutRecording === 'true'
    || isImeComposingKeyEvent(event)
    || isShortcutTextTarget(event)
    || document.querySelector('dialog[open], [role="dialog"]')
  ) {
    return false;
  }

  const action = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>('button[aria-pressed]:not(:disabled), .settings-nav-item:not(:disabled)')
    : null;
  const isSettingsAction = Boolean(action && (scrollShell.contains(action) || action.closest('.settings-nav')));
  if (!action || !isSettingsAction) {
    return false;
  }

  event.preventDefault();
  action.click();
  return true;
};

const focusActiveNavigationItem = (): boolean => {
  const navigation = document.querySelector<HTMLElement>('.settings-nav');
  const target = navigation?.querySelector<HTMLElement>('.settings-nav-item[aria-current="page"]')
    ?? navigation?.querySelector<HTMLElement>('.settings-nav-item:not(:disabled)');
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return Boolean(target);
};

const focusFirstContentControl = (scrollShell: HTMLDivElement): boolean => {
  const target = getSelectableControls(scrollShell)[0];
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return Boolean(target);
};

export const useSettingsWasdNavigation = (
  scrollShellRef: RefObject<HTMLDivElement | null>,
): void => {
  useEffect(() => {
    const handleWasdNavigation = (event: KeyboardEvent): void => {
      const scrollShell = scrollShellRef.current;
      if (!scrollShell || handleEnterActivation(event, scrollShell)) {
        return;
      }

      const actionTarget = findSelectableControl(event.target);
      const actionTargetInContent = Boolean(actionTarget && scrollShell.contains(actionTarget));
      const actionTargetInNavigation = Boolean(actionTarget?.closest('.settings-nav'));
      if (!shouldHandleSettingsWasd(event, { allowInteractiveTarget: actionTargetInContent || actionTargetInNavigation })) {
        return;
      }

      const direction = resolveSettingsWasdDirection(event.key);
      if (!direction) {
        return;
      }

      if (direction === 'left') {
        event.preventDefault();
        focusActiveNavigationItem();
        return;
      }

      if (direction === 'right') {
        event.preventDefault();
        focusFirstContentControl(scrollShell);
        return;
      }

      if (direction === 'up' || direction === 'down') {
        const controls = getSelectableControls(scrollShell);
        if (controls.length > 0) {
          const focusedControl = findSelectableControl(document.activeElement);
          const currentIndex = focusedControl ? controls.indexOf(focusedControl) : -1;
          const nextIndex = currentIndex < 0
            ? direction === 'down' ? 0 : controls.length - 1
            : (currentIndex + (direction === 'down' ? 1 : -1) + controls.length) % controls.length;
          event.preventDefault();
          controls[nextIndex]?.focus({ preventScroll: true });
          controls[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return;
        }
      }

      if (actionTargetInContent || actionTargetInNavigation) {
        return;
      }

      event.preventDefault();
      scrollShell.scrollBy({
        behavior: 'auto',
        left: 0,
        top: direction === 'up' ? -wasdScrollStep : direction === 'down' ? wasdScrollStep : 0,
      });
    };

    window.addEventListener('keydown', handleWasdNavigation);
    return () => window.removeEventListener('keydown', handleWasdNavigation);
  }, [scrollShellRef]);
};
