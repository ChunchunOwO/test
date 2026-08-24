import { X } from 'lucide-react';

type EchoSearchFieldToolsProps = {
  clearLabel: string;
  count?: string | number | null;
  onClear: () => void;
};

export const EchoSearchFieldTools = ({
  clearLabel,
  count,
  onClear,
}: EchoSearchFieldToolsProps): JSX.Element => (
  <span className="echo-search-tools">
    {count != null && count !== '' ? (
      <span className="echo-search-count" role="status" aria-live="polite">
        {count}
      </span>
    ) : null}
    <button
      className="echo-search-clear"
      type="button"
      aria-label={clearLabel}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
    >
      <X size={14} aria-hidden="true" />
    </button>
  </span>
);
