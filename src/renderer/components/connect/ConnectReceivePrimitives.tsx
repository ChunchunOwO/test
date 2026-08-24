import { AudioLines, Cast, Check, Copy, Smartphone, Square } from 'lucide-react';

export type ReceiveTone = 'off' | 'listen' | 'live' | 'error';

export type ConnectReceiveFactRow = {
  label: string;
  value: string;
};

export const ConnectReceiveFacts = ({ rows }: { rows: ConnectReceiveFactRow[] }): JSX.Element => (
  <dl className="connect-receive-facts">
    {rows.map((row) => (
      <div key={row.label} className="connect-receive-facts__row">
        <dt>{row.label}</dt>
        <dd title={row.value}>{row.value}</dd>
      </div>
    ))}
  </dl>
);

export const ConnectReceiveGuide = ({ title, steps, hint }: { title: string; steps: string[]; hint: string }): JSX.Element => (
  <div className="connect-receive-guide">
    <strong>{title}</strong>
    <ol>
      {steps.map((step, index) => (
        <li key={step}>
          <span>{index + 1}</span>
          <p>{step}</p>
        </li>
      ))}
    </ol>
    <em>{hint}</em>
  </div>
);

type NowPlayingProps = {
  cover: string | null;
  emptyIcon: 'phone' | 'airplay' | 'hqplayer';
  stateLabel: string;
  title: string;
  subtitle: string;
  progressPercent: number;
  progressAria: string;
  positionLabel: string;
  stopLabel?: string;
  stopDisabled?: boolean;
  onStop?: () => void;
};

export const ConnectReceiveNowPlaying = ({
  cover,
  emptyIcon,
  stateLabel,
  title,
  subtitle,
  progressPercent,
  progressAria,
  positionLabel,
  stopLabel,
  stopDisabled,
  onStop,
}: NowPlayingProps): JSX.Element => (
  <div className="connect-receive-now">
    <div className="connect-receive-now__art" data-empty={!cover}>
      {cover ? (
        <img alt="" src={cover} />
      ) : emptyIcon === 'phone' ? (
        <Smartphone size={22} />
      ) : emptyIcon === 'hqplayer' ? (
        <AudioLines size={22} />
      ) : (
        <Cast size={22} />
      )}
    </div>
    <div className="connect-receive-now__copy">
      <span>{stateLabel}</span>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <div className="connect-progress" aria-label={progressAria}>
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <small>{positionLabel}</small>
    </div>
    {onStop && stopLabel ? (
      <button className="settings-action-button" type="button" onClick={onStop} disabled={stopDisabled}>
        <Square size={15} />
        {stopLabel}
      </button>
    ) : null}
  </div>
);

type LogProps = {
  ariaLabel: string;
  title: string;
  countLabel: string;
  emptyLabel: string;
  lines: string[];
  extras?: string[];
  copyLabel?: string;
  copied?: boolean;
  copyDisabled?: boolean;
  onCopy?: () => void;
};

export const ConnectReceiveLog = ({
  ariaLabel,
  title,
  countLabel,
  emptyLabel,
  lines,
  extras,
  copyLabel,
  copied,
  copyDisabled,
  onCopy,
}: LogProps): JSX.Element => (
  <div className="connect-receive-log" aria-label={ariaLabel}>
    <header>
      <span>{title}</span>
      <div className="connect-receive-log__meta">
        <small>{countLabel}</small>
        {onCopy && copyLabel ? (
          <button
            className="connect-debug-copy-button"
            type="button"
            aria-label={copyLabel}
            title={copyLabel}
            disabled={copyDisabled}
            onClick={onCopy}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        ) : null}
      </div>
    </header>
    <div className="connect-receive-log__body">
      {extras?.map((line) => (
        <small key={line}>{line}</small>
      ))}
      {lines.length > 0 ? lines.map((line, index) => <code key={`${index}:${line}`}>{line}</code>) : <small>{emptyLabel}</small>}
    </div>
  </div>
);
