import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './dsp-select.css';

export type DspSelectOption<T extends string> = {
  value: T;
  label: string;
  detail?: string;
  disabled?: boolean;
};

type DspSelectProps<T extends string> = {
  ariaLabel: string;
  value: T;
  options: Array<DspSelectOption<T>>;
  disabled?: boolean;
  describedBy?: string;
  onChange: (value: T) => void;
};

export const DspSelect = <T extends string,>({
  ariaLabel,
  value,
  options,
  disabled = false,
  describedBy,
  onChange,
}: DspSelectProps<T>): JSX.Element => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const choose = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }

    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1): void => {
    if (enabledIndexes.length === 0) {
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(activeIndex);
    const selectedEnabledIndex = enabledIndexes.indexOf(selectedIndex);
    const start = currentEnabledIndex >= 0 ? currentEnabledIndex : Math.max(0, selectedEnabledIndex);
    const next = (start + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) {
      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else {
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      const boundaryIndex = event.key === 'Home' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
      if (boundaryIndex !== undefined) {
        setActiveIndex(boundaryIndex);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) {
        choose(activeIndex);
      } else {
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
    }
  };

  return (
    <div className="dsp-select" data-open={open} data-disabled={disabled} ref={rootRef}>
      <button
        ref={triggerRef}
        className="dsp-select__trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-describedby={describedBy}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label ?? value}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open ? (
        <div className="dsp-select__menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              className="dsp-select__option"
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === activeIndex}
              data-selected={option.value === value}
              disabled={option.disabled}
              tabIndex={-1}
              key={option.value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="dsp-select__check">
                {option.value === value ? <Check size={13} aria-hidden="true" /> : null}
              </span>
              <span className="dsp-select__option-copy">
                <strong>{option.label}</strong>
                {option.detail ? <small>{option.detail}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
