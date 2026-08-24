import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { isImeComposingKeyEvent } from '../../utils/imeInput';
import {
  isSettingsEscapeBackEditableTarget,
  resolveSettingsEscapeAction,
  settingsBackNavigationEvent,
} from './settingsNavigation';
import type { SettingsNavKey } from './settingsTypes';

type SettingsAboutPage = 'overview' | 'contributors';

export const useSettingsEscapeNavigation = ({
  aboutPage,
  activeSection,
  scrollSettingsSectionIntoView,
  searchInputRef,
  searchQuery,
  setAboutPage,
  setSettingsQuery,
}: {
  aboutPage: SettingsAboutPage;
  activeSection: SettingsNavKey;
  scrollSettingsSectionIntoView: (key: SettingsNavKey) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setAboutPage: Dispatch<SetStateAction<SettingsAboutPage>>;
  setSettingsQuery: Dispatch<SetStateAction<string>>;
}): void => {
  useEffect(() => {
    const handleSettingsEscapeBack = (event: KeyboardEvent): void => {
      if (
        document.body.dataset.echoShortcutRecording === 'true' ||
        isImeComposingKeyEvent(event) ||
        event.key !== 'Escape'
      ) {
        return;
      }

      const action = resolveSettingsEscapeAction({
        defaultPrevented: event.defaultPrevented,
        isContributorsPage: activeSection === 'about' && aboutPage === 'contributors',
        isEditableTarget: isSettingsEscapeBackEditableTarget(event.target),
        isSearchInput: event.target === searchInputRef.current,
        searchQuery,
      });

      if (action === 'none') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (action === 'clear-search') {
        setSettingsQuery('');
        return;
      }
      if (action === 'leave-contributors') {
        setAboutPage('overview');
        scrollSettingsSectionIntoView('about');
        return;
      }
      window.dispatchEvent(new Event(settingsBackNavigationEvent));
    };

    window.addEventListener('keydown', handleSettingsEscapeBack);
    return () => {
      window.removeEventListener('keydown', handleSettingsEscapeBack);
    };
  }, [
    aboutPage,
    activeSection,
    scrollSettingsSectionIntoView,
    searchInputRef,
    searchQuery,
    setAboutPage,
    setSettingsQuery,
  ]);
};
