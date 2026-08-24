import { ArrowLeft, Hand, Sparkle } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Locale } from '../../../i18n/locales';
import '../../../styles/settings-contributors.css';
import { settingsLocaleCopy } from '../settingsSubsections';
import { createContributorConstellation } from './contributorConstellation';
import { contributorIds } from './contributors';
import { useContributorConstellationPan } from './useContributorConstellationPan';

const contributorsDeepSpace = new URL('../../../assets/contributors-deep-space.png', import.meta.url).href;
const contributorConstellation = createContributorConstellation(contributorIds);

type ContributorPlacementStyle = CSSProperties & {
  '--contributor-x': string;
  '--contributor-y': string;
};

type ContributorWorldStyle = CSSProperties & {
  '--contributors-world-width': string;
  '--contributors-world-height': string;
};

type ContributorsPageProps = {
  locale: Locale;
  onBack: () => void;
};

const copy = {
  back: {
    'zh-CN': '返回关于',
    'zh-TW': '返回關於',
    'ja-JP': '「このアプリについて」に戻る',
    'en-US': 'Back to About',
    'ko-KR': '정보로 돌아가기',
  },
  title: {
    'zh-CN': '贡献者',
    'zh-TW': '貢獻者',
    'ja-JP': 'コントリビューター',
    'en-US': 'Contributors',
    'ko-KR': '기여자',
  },
  description: {
    'zh-CN': '感谢每一位让 ECHO 发出回声的人。',
    'zh-TW': '感謝每一位讓 ECHO 發出回聲的人。',
    'ja-JP': 'ECHO に響きを与えてくれた、すべての人へ。',
    'en-US': 'Thank you to everyone who helps ECHO resonate.',
    'ko-KR': 'ECHO가 울려 퍼지도록 도와주신 모든 분께 감사드립니다.',
  },
  listLabel: {
    'zh-CN': 'ECHO 贡献者名单',
    'zh-TW': 'ECHO 貢獻者名單',
    'ja-JP': 'ECHO コントリビューター一覧',
    'en-US': 'ECHO contributor list',
    'ko-KR': 'ECHO 기여자 목록',
  },
  dragHint: {
    'zh-CN': '上下左右拖动星图',
    'zh-TW': '上下左右拖動星圖',
    'ja-JP': '上下左右にドラッグして星図を移動',
    'en-US': 'Drag in any direction',
    'ko-KR': '상하좌우로 드래그하여 별자리 탐색',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export const ContributorsPage = ({ locale, onBack }: ContributorsPageProps): JSX.Element => {
  const pan = useContributorConstellationPan();
  const countLabel = settingsLocaleCopy(locale, {
    'zh-CN': `${contributorIds.length} 位贡献者`,
    'zh-TW': `${contributorIds.length} 位貢獻者`,
    'ja-JP': `${contributorIds.length} 人のコントリビューター`,
    'en-US': `${contributorIds.length} contributors`,
    'ko-KR': `기여자 ${contributorIds.length}명`,
  });
  const worldStyle: ContributorWorldStyle = {
    '--contributors-world-width': `${contributorConstellation.worldWidth}%`,
    '--contributors-world-height': `${contributorConstellation.worldHeight}%`,
  };

  return (
    <main
      className="contributors-page no-drag"
      data-dragging={pan.isDragging ? 'true' : 'false'}
      aria-labelledby="contributors-title"
      onPointerCancel={pan.onPointerCancel}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
    >
      <img className="contributors-space-backdrop" src={contributorsDeepSpace} alt="" aria-hidden="true" />
      <div className="contributors-copy-shield" aria-hidden="true" />

      <button className="contributors-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        <span>{settingsLocaleCopy(locale, copy.back)}</span>
        <kbd aria-hidden="true">Esc</kbd>
      </button>

      <header className="contributors-header">
        <h1 id="contributors-title">{settingsLocaleCopy(locale, copy.title)}</h1>
        <p>{settingsLocaleCopy(locale, copy.description)}</p>
        <span>{countLabel}</span>
      </header>

      <div
        ref={pan.viewportRef}
        className="contributors-viewport"
        data-can-pan={pan.canPan ? 'true' : 'false'}
        role="region"
        tabIndex={pan.canPan ? 0 : -1}
        aria-label={settingsLocaleCopy(locale, copy.dragHint)}
        onKeyDown={pan.onKeyDown}
      >
        <div className="contributors-world" style={worldStyle}>
          <svg
            className="contributors-constellation-lines"
            viewBox={`0 0 ${contributorConstellation.worldWidth} ${contributorConstellation.worldHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {contributorConstellation.edges.map(({ from, to }) => {
              const start = contributorConstellation.nodes[from];
              const end = contributorConstellation.nodes[to];
              return (
                <line
                  key={`${from}-${to}`}
                  data-constellation-edge=""
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          <ul
            className="contributors-grid"
            data-density={contributorConstellation.density}
            aria-label={settingsLocaleCopy(locale, copy.listLabel)}
          >
            {contributorConstellation.nodes.map(({ id, x, y }) => {
              const style: ContributorPlacementStyle = {
                '--contributor-x': `${(x / contributorConstellation.worldWidth) * 100}%`,
                '--contributor-y': `${(y / contributorConstellation.worldHeight) * 100}%`,
              };

              return (
                <li key={id} style={style}>
                  <Sparkle className="contributors-star" size={20} strokeWidth={1.35} aria-hidden="true" />
                  <span>{id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {pan.canPan ? (
        <div className="contributors-drag-hint" aria-hidden="true">
          <Hand size={15} />
          <span>{settingsLocaleCopy(locale, copy.dragHint)}</span>
        </div>
      ) : null}
    </main>
  );
};
