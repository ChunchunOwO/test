import type { ReactNode } from 'react';
import { ShieldCheck, type LucideIcon } from 'lucide-react';

type DangerActionCardProps = {
  action: ReactNode;
  description: string;
  icon: LucideIcon;
  keep?: string;
  title: string;
  tone?: 'neutral' | 'caution' | 'danger';
};

export const DangerActionCard = ({
  action,
  description,
  icon: Icon,
  keep,
  title,
  tone = 'caution',
}: DangerActionCardProps): JSX.Element => (
  <article className="danger-action-card" data-tone={tone}>
    <span className="danger-action-card__icon" aria-hidden="true">
      <Icon size={17} />
    </span>
    <div className="danger-action-card__copy">
      <h3>{title}</h3>
      <p>{description}</p>
      {keep ? (
        <small>
          <ShieldCheck size={12} aria-hidden="true" />
          {keep}
        </small>
      ) : null}
    </div>
    <div className="danger-action-card__action">{action}</div>
  </article>
);
