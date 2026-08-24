import {
  ArrowRight,
  BookOpen,
  Bug,
  ExternalLink,
  Globe2,
  HeartHandshake,
  MessageCircleMore,
  MessagesSquare,
  Newspaper,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import {
  bugFeedbackUrl,
  discordInviteUrl,
  officialWebsiteUrl,
  qqGroupUrl,
  userDocumentationUrl,
} from './settings/general/generalSettingsModel';
import { CommunityWorkshopOverview } from '../community/CommunityWorkshopOverview';
import { navigateToWorkshopPane } from '../workshop/workshopNavigation';
import '../styles/community-page.css';

const steamCommunityUrl = 'https://steamcommunity.com/app/5105090';
const steamDiscussionsUrl = `${steamCommunityUrl}/discussions/`;
const steamNewsUrl = 'https://store.steampowered.com/news/app/5105090';

type CommunityLink = {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  metaKey: TranslationKey;
  url: string;
  icon: LucideIcon;
};

const communityLinks: CommunityLink[] = [
  {
    titleKey: 'communityPage.link.steam.title',
    descriptionKey: 'communityPage.link.steam.description',
    metaKey: 'communityPage.link.steam.meta',
    url: steamDiscussionsUrl,
    icon: MessageCircleMore,
  },
  {
    titleKey: 'communityPage.link.discord.title',
    descriptionKey: 'communityPage.link.discord.description',
    metaKey: 'communityPage.link.discord.meta',
    url: discordInviteUrl,
    icon: Globe2,
  },
  {
    titleKey: 'communityPage.link.qq.title',
    descriptionKey: 'communityPage.link.qq.description',
    metaKey: 'communityPage.link.qq.meta',
    url: qqGroupUrl,
    icon: UsersRound,
  },
  {
    titleKey: 'communityPage.link.feedback.title',
    descriptionKey: 'communityPage.link.feedback.description',
    metaKey: 'communityPage.link.feedback.meta',
    url: bugFeedbackUrl,
    icon: Bug,
  },
];

export const CommunityPage = (): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const [linkError, setLinkError] = useState<string | null>(null);
  const openExternal = useCallback(async (url: string): Promise<void> => {
    setLinkError(null);
    try {
      const openExternalUrl = window.echo?.app?.openExternalUrl;
      if (!openExternalUrl) {
        throw new Error('external-url-bridge-unavailable');
      }
      await openExternalUrl(url);
    } catch {
      setLinkError(t('communityPage.error.openLink'));
    }
  }, [t]);

  return (
    <main className="community-page page-stack">
      <section className="community-hero" aria-labelledby="community-title">
        <div className="community-hero__copy">
          <span className="community-eyebrow"><Sparkles size={14} aria-hidden="true" /> {t('communityPage.hero.eyebrow')}</span>
          <h1 id="community-title">{t('communityPage.hero.titleLead')}<br />{t('communityPage.hero.titleEmphasis')}</h1>
          <p>
            {t('communityPage.hero.description')}
          </p>
          <div className="community-hero__actions">
            <button className="community-button community-button--primary" type="button" onClick={() => navigateToWorkshopPane('discover')}>
              <PackageOpen size={18} aria-hidden="true" />
              {t('communityPage.action.enterWorkshop')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button className="community-button" type="button" onClick={() => void openExternal(steamCommunityUrl)}>
              <MessagesSquare size={18} aria-hidden="true" />
              {t('communityPage.action.openSteamCommunity')}
              <ExternalLink size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="community-hero__mark" aria-hidden="true">
          <span className="community-hero__orbit community-hero__orbit--outer" />
          <span className="community-hero__orbit community-hero__orbit--inner" />
          <span className="community-hero__pulse" />
          <HeartHandshake size={58} strokeWidth={1.35} />
          <span className="community-hero__note community-hero__note--one">{t('communityPage.note.create')}</span>
          <span className="community-hero__note community-hero__note--two">{t('communityPage.note.converse')}</span>
          <span className="community-hero__note community-hero__note--three">{t('communityPage.note.resonate')}</span>
        </div>
      </section>

      {linkError ? <p className="community-link-error" role="alert">{linkError}</p> : null}

      <CommunityWorkshopOverview />

      <section className="community-feature-grid" aria-label={t('communityPage.features.aria')}>
        <button className="community-feature community-feature--workshop" type="button" onClick={() => navigateToWorkshopPane('discover')}>
          <span className="community-feature__icon"><PackageOpen size={25} aria-hidden="true" /></span>
          <span className="community-feature__meta">{t('communityPage.feature.workshop.meta')}</span>
          <strong>{t('communityPage.feature.workshop.title')}</strong>
          <span>{t('communityPage.feature.workshop.description')}</span>
          <em>{t('communityPage.feature.workshop.action')} <ArrowRight size={15} aria-hidden="true" /></em>
        </button>

        <button className="community-feature" type="button" onClick={() => void openExternal(steamDiscussionsUrl)}>
          <span className="community-feature__icon"><MessageCircleMore size={25} aria-hidden="true" /></span>
          <span className="community-feature__meta">{t('communityPage.feature.discuss.meta')}</span>
          <strong>{t('communityPage.feature.discuss.title')}</strong>
          <span>{t('communityPage.feature.discuss.description')}</span>
          <em>{t('communityPage.feature.discuss.action')} <ExternalLink size={14} aria-hidden="true" /></em>
        </button>

        <button className="community-feature" type="button" onClick={() => void openExternal(steamNewsUrl)}>
          <span className="community-feature__icon"><Newspaper size={25} aria-hidden="true" /></span>
          <span className="community-feature__meta">{t('communityPage.feature.news.meta')}</span>
          <strong>{t('communityPage.feature.news.title')}</strong>
          <span>{t('communityPage.feature.news.description')}</span>
          <em>{t('communityPage.feature.news.action')} <ExternalLink size={14} aria-hidden="true" /></em>
        </button>
      </section>

      <section className="community-section" aria-labelledby="community-connect-title">
        <header className="community-section__header">
          <div>
            <span>{t('communityPage.connect.kicker')}</span>
            <h2 id="community-connect-title">{t('communityPage.connect.title')}</h2>
          </div>
          <button type="button" onClick={() => void openExternal(officialWebsiteUrl)}>
            {t('communityPage.connect.website')} <ExternalLink size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="community-link-grid">
          {communityLinks.map(({ titleKey, descriptionKey, metaKey, url, icon: Icon }) => (
            <button className="community-link-card" type="button" key={titleKey} onClick={() => void openExternal(url)}>
              <span className="community-link-card__icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="community-link-card__copy">
                <small>{t(metaKey)}</small>
                <strong>{t(titleKey)}</strong>
                <span>{t(descriptionKey)}</span>
              </span>
              <ExternalLink className="community-link-card__arrow" size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="community-guidance" aria-labelledby="community-guidance-title">
        <div className="community-guidance__intro">
          <span className="community-guidance__icon"><ShieldCheck size={24} aria-hidden="true" /></span>
          <div>
            <span>{t('communityPage.guidance.kicker')}</span>
            <h2 id="community-guidance-title">{t('communityPage.guidance.title')}</h2>
            <p>{t('communityPage.guidance.description')}</p>
          </div>
        </div>
        <ul>
          <li><strong>{t('communityPage.guidance.respect.title')}</strong><span>{t('communityPage.guidance.respect.description')}</span></li>
          <li><strong>{t('communityPage.guidance.privacy.title')}</strong><span>{t('communityPage.guidance.privacy.description')}</span></li>
          <li><strong>{t('communityPage.guidance.feedback.title')}</strong><span>{t('communityPage.guidance.feedback.description')}</span></li>
        </ul>
        <button type="button" onClick={() => void openExternal(userDocumentationUrl)}>
          <BookOpen size={17} aria-hidden="true" />
          {t('communityPage.guidance.docs')}
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </section>
    </main>
  );
};
