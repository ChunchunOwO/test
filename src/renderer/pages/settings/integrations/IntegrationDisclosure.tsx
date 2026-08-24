import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import { StatusText } from '../components/SettingsPrimitives';
import './integration-disclosure.css';

export const IntegrationDisclosure = ({
  children,
  description,
  highlighted,
  status,
  statusTone = 'muted',
  title,
}: {
  children: ReactNode;
  description: string;
  highlighted: boolean;
  status: string;
  statusTone?: 'neutral' | 'good' | 'muted';
  title: string;
}): JSX.Element => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (highlighted) {
      setOpen(true);
    }
  }, [highlighted]);

  return (
    <details
      className="settings-integration-disclosure"
      data-search-highlight={highlighted ? 'true' : undefined}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="settings-integration-disclosure__icon" aria-hidden="true"><Radio size={20} /></span>
        <span className="settings-integration-disclosure__copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <StatusText tone={statusTone}>{status}</StatusText>
        <ChevronDown className="settings-integration-disclosure__chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="settings-integration-disclosure__body">{children}</div>
    </details>
  );
};
