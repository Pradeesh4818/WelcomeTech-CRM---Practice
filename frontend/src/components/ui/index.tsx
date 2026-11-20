import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, X, Eye, EyeOff, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { STATUS_BADGE, STATUS_LABELS, getInitials, getAvatarColor, clsx, toAssetUrl } from '../../utils/helpers';
import { useThemeStore } from '../../store/themeStore';
import { 
  COUNTRY_PHONE_RULES, 
  getActiveDefaultCountry, 
  getPhoneDigitsOnly, 
  COUNTRY_OPTIONS, 
  PHONE_COUNTRY_OPTIONS,
  CountryCode, 
  parsePhoneNumber, 
  formatPhoneNumber 
} from '../../utils/phoneRules';

// ─── BADGE ─────────────────────────────────────
export const Badge: React.FC<{ status: string; label?: string; dot?: boolean }> = ({
  status, label, dot = false,
}) => (
  <span className={`badge ${STATUS_BADGE[status] || 'badge-gray'}`}>
    {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />}
    {label || STATUS_LABELS[status] || status}
  </span>
);

export const Avatar: React.FC<{
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}> = ({
  name = '',
  src,
  size = 'md',
  className,
  style,
}) => {
  const safeName = name || 'User';
  const fullSrc = src ? toAssetUrl(src) : null;
  const sizePx = size === 'sm' ? 28 : size === 'lg' ? 44 : size === 'xl' ? 84 : 34;

  return (
    <span
      className={`avatar avatar-${size} ${className || ''}`}
      style={{
        background: fullSrc ? 'transparent' : getAvatarColor(safeName),
        overflow: 'hidden',
        width: sizePx,
        height: sizePx,
        minWidth: sizePx,
        maxWidth: sizePx,
        minHeight: sizePx,
        maxHeight: sizePx,
        borderRadius: '50%',
        aspectRatio: '1 / 1',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
        ...style,
      }}
      title={safeName}
    >
      {fullSrc ? (
        <img
          src={fullSrc}
          alt={safeName}
          style={{
            width: '100%',
            height: '100%',
            minWidth: '100%',
            minHeight: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block',
            aspectRatio: '1 / 1',
          }}
        />
      ) : (
        getInitials(safeName)
      )}
    </span>
  );
};

// ─── SPINNER ───────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    className={className}
    style={{ animation: 'spin 0.7s linear infinite' }}
  >
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

// ─── MODAL ─────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  overlayClassName?: string;
  closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  headerActions,
  size = 'md',
  className,
  overlayClassName,
  closeOnBackdropClick = false,
}) => {
  const maxWidths = { sm: 400, md: 560, lg: 720, xl: 900, xxl: 1280 };
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [backdropPing, setBackdropPing] = useState(false);
  const pingTimeoutRef = useRef<number | null>(null);

  const triggerPing = () => {
    setBackdropPing(true);
    if (pingTimeoutRef.current) window.clearTimeout(pingTimeoutRef.current);
    pingTimeoutRef.current = window.setTimeout(() => setBackdropPing(false), 260);
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        const overlays = Array.from(document.querySelectorAll('.modal-overlay'));
        const topmost = overlays[overlays.length - 1];
        if (!topmost || topmost === overlayRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current?.();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.documentElement.classList.add('modal-open');

    const timer = window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(timer);
      if (pingTimeoutRef.current) window.clearTimeout(pingTimeoutRef.current);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      
      const overlays = document.querySelectorAll('.modal-overlay');
      if (overlays.length <= 1) {
        document.documentElement.classList.remove('modal-open');
      }
    };
  }, [open]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [open]);

  if (!open) return null;

  const modal = (
    <div
      ref={overlayRef}
      className={clsx('modal-overlay', overlayClassName || 'modal-form-overlay')}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) {
          if (closeOnBackdropClick) {
            onCloseRef.current?.();
          } else {
            triggerPing();
          }
        }
      }}
    >
      <div
        className={clsx('modal-box', `modal-size-${size}`, backdropPing && 'modal-box-ping', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: maxWidths[size] }}
      >
        <div className="modal-header modal-header-classic">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="modal-title" style={{ color: '#fff' }} id={titleId}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {headerActions}
            <button
              ref={closeBtnRef}
              className="btn-modal-close"
              onClick={onClose}
              title="Close (Esc)"
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// ─── EMPTY STATE ───────────────────────────────
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon}</div>
    <div style={{ fontWeight: 600, color: 'var(--tx-2)', marginBottom: 4 }}>{title}</div>
    {description && <div style={{ fontSize: 12, color: 'var(--tx-4)', marginBottom: 12 }}>{description}</div>}
    {action}
  </div>
);

// ─── DETAIL ITEM ────────────────────────────────
export const DetailItem: React.FC<{
  label: string;
  value?: React.ReactNode;
  subvalue?: React.ReactNode;
}> = ({ label, value, subvalue }) => (
  <div className="details-item">
    <div className="details-label">{label}</div>
    <div className="details-value">{value ?? '—'}</div>
    {subvalue != null && subvalue !== '' ? <div className="details-subvalue">{subvalue}</div> : null}
  </div>
);

// ─── SKELETON ──────────────────────────────────
export const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} style={{ padding: '11px 14px' }}>
        <div className="skeleton" style={{ height: 14, width: `${60 + Math.random() * 30}%` }} />
      </td>
    ))}
  </tr>
);

// ─── CONFIRM DIALOG ────────────────────────────
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  variant?: 'danger' | 'warning';
}> = ({ open, title, message, onConfirm, onCancel, loading, variant = 'danger' }) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    size="sm"
    className={clsx('confirm-dialog-modal', variant === 'danger' ? 'confirm-dialog-danger' : 'confirm-dialog-warning')}
    overlayClassName="confirm-dialog-overlay"
    footer={
      <>
        <button
          type="button"
          className="btn btn-cancel"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm} disabled={loading}
        >
          {loading ? <Spinner size={14} /> : null}
          {loading ? 'Processing...' : 'Confirm'}
        </button>
      </>
    }
  >
    <div className="confirm-dialog-content">
      <div className="confirm-dialog-icon">
        <AlertTriangle size={22} />
      </div>
      <p>{message}</p>
    </div>
  </Modal>
);

// ─── SELECT (CUSTOM) ────────────────────────────
export type SelectOption = { value: string; label: string; disabled?: boolean };

export const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  menuMaxHeight?: number;
  loading?: boolean;
  onSearchChange?: (query: string) => void;
  filterLocally?: boolean;
}> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  style,
  menuMaxHeight = 320,
  loading,
  onSearchChange,
  filterLocally = true,
}) => {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isKeyboardNavRef = useRef(false);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const displayLabel = selected?.label || '';
  const filteredOptions = useMemo(() => {
    if (!filterLocally) return options;
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query));
  }, [options, search, filterLocally]);
  const inputValue = open ? search : displayLabel;

  const findFirstEnabled = (items = filteredOptions) => {
    const idx = items.findIndex((o) => !o.disabled);
    return idx >= 0 ? idx : -1;
  };

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 12;
    const width = Math.round(rect.width);
    let left = Math.round(rect.left);

    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpwards = spaceBelow < 180 && spaceAbove > spaceBelow;

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (openUpwards) {
      maxHeight = Math.min(menuMaxHeight, Math.max(120, spaceAbove - 8));
      bottom = Math.round(window.innerHeight - rect.top + 6);
      top = undefined;
    } else {
      maxHeight = Math.min(menuMaxHeight, Math.max(120, spaceBelow - 8));
      top = Math.round(rect.bottom + 6);
      bottom = undefined;
    }

    setMenuStyle({
      top: top !== undefined ? `${top}px` : undefined,
      bottom: bottom !== undefined ? `${bottom}px` : undefined,
      left: `${left}px`,
      width: `${Math.max(width, 120)}px`,
      minWidth: `${Math.max(width, 120)}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 99999,
      overflowY: 'auto',
      overflowX: 'hidden',
    });
  };

  const close = () => {
    setOpen(false);
    setSearch('');
    onSearchChange?.('');
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    const selectedIndex = filteredOptions.findIndex((o) => o.value === value);
    if (selectedIndex >= 0 && !filteredOptions[selectedIndex]?.disabled) {
      setHighlightedIndex(selectedIndex);
    } else {
      setHighlightedIndex(findFirstEnabled());
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(findFirstEnabled(filteredOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === 'Tab') {
        close();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setHighlightedIndex((prev) => {
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          let next = prev;
          for (let i = 0; i < filteredOptions.length; i++) {
            next = (next + dir + filteredOptions.length) % filteredOptions.length;
            const opt = filteredOptions[next];
            if (opt && !opt.disabled) return next;
          }
          return prev;
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const opt = filteredOptions[highlightedIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          close();
        }
      }
    };

    const onScroll = (e: Event) => {
      // Ignore scroll events originating from inside the dropdown menu itself so scrolling the options
      // does not trigger updatePosition(), re-render the component, or fight smooth scroll momentum
      const target = e.target;
      if (target === menuRef.current || (target instanceof Node && menuRef.current?.contains(target))) {
        return;
      }
      updatePosition();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlightedIndex, filteredOptions, onChange]);

  useEffect(() => {
    if (!open) return;
    // Only scroll option into view when navigating via keyboard arrow keys (not when scrolling or hovering with mouse)
    if (!isKeyboardNavRef.current) return;
    isKeyboardNavRef.current = false;
    const idx = highlightedIndex;
    if (idx < 0) return;
    const el = menuRef.current?.querySelector(`[data-opt-idx="${idx}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightedIndex, open]);

  return (
    <>
      <div
        ref={triggerRef}
        className={clsx('form-control wt-select-trigger', className)}
        style={style}
        onClick={() => {
          if (!open) openMenu();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.target === inputRef.current && e.key === ' ') return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!open) openMenu();
          }
        }}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-disabled={disabled}
      >
        {loading ? (
          <div className="wt-select-loading">
            <Spinner size={12} className="text-brand" />
            <span style={{ opacity: 0.7 }}>Loading...</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            className={clsx('wt-select-input', !selected && !search ? 'is-placeholder' : undefined)}
            value={inputValue}
            placeholder={placeholder || 'Select...'}
            disabled={disabled}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={listboxId}
            onFocus={openMenu}
            onChange={(e) => {
              if (!open) setOpen(true);
              const val = e.target.value;
              setSearch(val);
              onSearchChange?.(val);
            }}
          />
        )}
        <button
          type="button"
          className="wt-select-icon-btn"
          disabled={disabled}
          aria-label={open ? 'Close options' : 'Open options'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (open) close();
            else openMenu();
          }}
        >
          {open ? <X size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="wt-select-menu"
          role="listbox"
          style={menuStyle}
          onWheel={(e) => {
            // Stop wheel events from propagating to and scrolling the background window
            e.stopPropagation();
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className="wt-select-empty">No matches found</div>
          ) : filteredOptions.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            const isDisabled = !!opt.disabled;
            return (
              <button
                key={`${opt.value}-${idx}`}
                type="button"
                className={clsx(
                  'wt-select-option',
                  isSelected ? 'is-selected' : undefined,
                  isHighlighted ? 'is-highlighted' : undefined
                )}
                role="option"
                aria-selected={isSelected}
                disabled={isDisabled}
                data-opt-idx={idx}
                onMouseEnter={() => {
                  isKeyboardNavRef.current = false;
                  if (!isDisabled) setHighlightedIndex(idx);
                }}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(opt.value);
                  close();
                }}
              >
                <span className="wt-select-option-label">{opt.label}</span>
                {isSelected ? <Check size={15} className="wt-select-check" /> : <span style={{ width: 15 }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

// ─── SELECT FIELD ──────────────────────────────
export const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onSearchChange?: (query: string) => void;
  filterLocally?: boolean;
}> = ({ label, value, onChange, options, required, placeholder, disabled, loading, className, style, onSearchChange, filterLocally }) => (
  <div className={clsx('form-group', className)} style={style}>
    <label className="form-label">
      {label}{required && <span className="req"> *</span>}
    </label>
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled || loading}
      loading={loading}
      onSearchChange={onSearchChange}
      filterLocally={filterLocally}
    />
  </div>
);

export const parseFlexibleDate = (raw: string): Date | null => {
  const text = String(raw || '').trim();
  if (!text) return null;

  // 1. Standard ISO / YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const parts = text.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (y >= 1900 && y <= 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        return date;
      }
    }
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (y >= 1900 && y <= 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        return date;
      }
    }
  }

  // 3. Compact 8-digits DDMMYYYY or YYYYMMDD
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8) {
    // Try DDMMYYYY
    const d = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2, 4), 10) - 1;
    const y = parseInt(digits.slice(4, 8), 10);
    if (y >= 1900 && y <= 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        return date;
      }
    }
    // Try YYYYMMDD
    const y2 = parseInt(digits.slice(0, 4), 10);
    const m2 = parseInt(digits.slice(4, 6), 10) - 1;
    const d2 = parseInt(digits.slice(6, 8), 10);
    if (y2 >= 1900 && y2 <= 2100 && m2 >= 0 && m2 <= 11 && d2 >= 1 && d2 <= 31) {
      const date = new Date(y2, m2, d2);
      if (date.getFullYear() === y2 && date.getMonth() === m2 && date.getDate() === d2) {
        return date;
      }
    }
  }

  // Fallback to parseISO
  try {
    const d = parseISO(text);
    if (!Number.isNaN(d.getTime())) return d;
  } catch {}

  return null;
};

const parseDateValue = (raw: string): Date | null => {
  return parseFlexibleDate(raw);
};

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ThemedDateInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}> = ({ value, onChange, placeholder, disabled, readOnly }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const selectedDate = parseDateValue(value);
  const [inputText, setInputText] = useState(() => (selectedDate ? format(selectedDate, 'dd/MM/yyyy') : ''));
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(selectedDate || new Date()));
  const [focusedDay, setFocusedDay] = useState<Date>(() => selectedDate || new Date());
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [yearRangeStart, setYearRangeStart] = useState<number>(() => {
    const y = (selectedDate || new Date()).getFullYear();
    return Math.floor(y / 12) * 12;
  });

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const dayCells = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 }),
  });

  // Sync external value changes to input display text
  useEffect(() => {
    const parsed = parseDateValue(value);
    setInputText(parsed ? format(parsed, 'dd/MM/yyyy') : '');
    if (parsed) {
      setViewMonth(startOfMonth(parsed));
      setFocusedDay(parsed);
    }
  }, [value]);

  const updatePosition = () => {
    const el = containerRef.current || triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    let left = Math.round(rect.left);
    const width = 296;
    const popoverHeight = 325;

    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    let top: number;
    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      top = Math.max(margin, Math.round(rect.top - popoverHeight - 8));
    } else {
      top = Math.round(rect.bottom + 8);
    }

    setPopoverStyle({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onWindowChange = () => updatePosition();
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [open]);

  const commitDate = (date: Date) => {
    const iso = format(date, 'yyyy-MM-dd');
    onChange(iso);
    setInputText(format(date, 'dd/MM/yyyy'));
    setFocusedDay(date);
    setViewMonth(startOfMonth(date));
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || readOnly) return;
    const raw = e.target.value;
    setInputText(raw);

    if (!raw.trim()) {
      onChange('');
      return;
    }

    const parsed = parseFlexibleDate(raw);
    if (parsed) {
      onChange(format(parsed, 'yyyy-MM-dd'));
      setViewMonth(startOfMonth(parsed));
      setFocusedDay(parsed);
    }
  };

  const handleInputBlur = () => {
    if (disabled || readOnly) return;
    if (!inputText.trim()) {
      onChange('');
      setInputText('');
      return;
    }
    const parsed = parseFlexibleDate(inputText);
    if (parsed) {
      const iso = format(parsed, 'yyyy-MM-dd');
      onChange(iso);
      setInputText(format(parsed, 'dd/MM/yyyy'));
      setFocusedDay(parsed);
      setViewMonth(startOfMonth(parsed));
    } else if (value) {
      const existing = parseDateValue(value);
      setInputText(existing ? format(existing, 'dd/MM/yyyy') : '');
    } else {
      setInputText('');
      onChange('');
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        if (viewMode !== 'day') setViewMode('day');
        else setOpen(false);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (open) {
        // If calendar popover is open, confirm the focused/highlighted day or selected day
        const target = focusedDay || selectedDate || viewMonth || new Date();
        commitDate(target);
      } else {
        // If closed, parse the typed text
        if (inputText.trim()) {
          const parsed = parseFlexibleDate(inputText);
          if (parsed) {
            commitDate(parsed);
          }
        }
      }
      return;
    }

    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
      setViewMode('day');
      return;
    }

    if (open && viewMode === 'day') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = addDays(focusedDay, -1);
        setFocusedDay(next);
        if (!isSameMonth(next, viewMonth)) setViewMonth(startOfMonth(next));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = addDays(focusedDay, 1);
        setFocusedDay(next);
        if (!isSameMonth(next, viewMonth)) setViewMonth(startOfMonth(next));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = addDays(focusedDay, -7);
        setFocusedDay(next);
        if (!isSameMonth(next, viewMonth)) setViewMonth(startOfMonth(next));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = addDays(focusedDay, 7);
        setFocusedDay(next);
        if (!isSameMonth(next, viewMonth)) setViewMonth(startOfMonth(next));
      }
    }
  };

  const handlePrev = () => {
    if (viewMode === 'day') setViewMonth((m) => addMonths(m, -1));
    else if (viewMode === 'month') setViewMonth((m) => new Date(m.getFullYear() - 1, m.getMonth(), 1));
    else setYearRangeStart((y) => y - 12);
  };

  const handleNext = () => {
    if (viewMode === 'day') setViewMonth((m) => addMonths(m, 1));
    else if (viewMode === 'month') setViewMonth((m) => new Date(m.getFullYear() + 1, m.getMonth(), 1));
    else setYearRangeStart((y) => y + 12);
  };

  const openYearView = () => {
    setYearRangeStart(Math.floor(viewMonth.getFullYear() / 12) * 12);
    setViewMode('year');
  };

  return (
    <>
      <div ref={containerRef} className="wt-date-input-container">
        <input
          ref={inputRef}
          type="text"
          className="form-control wt-date-input"
          value={inputText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder || 'dd/mm/yyyy'}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete="off"
        />
        <button
          ref={triggerRef}
          type="button"
          className="wt-date-toggle-btn"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled || readOnly) return;
            setOpen((p) => !p);
            if (!open) {
              setViewMode('day');
              const current = parseFlexibleDate(inputText) || selectedDate || new Date();
              setFocusedDay(current);
              setViewMonth(startOfMonth(current));
            }
            inputRef.current?.focus();
          }}
          disabled={disabled}
          tabIndex={-1}
          title="Toggle Calendar"
        >
          <Calendar size={16} className="wt-date-icon" />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="wt-date-popover"
          style={popoverStyle}
          tabIndex={-1}
          onMouseDown={(e) => {
            // Prevent stealing focus from input and premature blur on click
            e.preventDefault();
          }}
        >
          <div className="wt-date-header">
            <button type="button" className="wt-date-nav" onClick={handlePrev}>
              <ChevronLeft size={16} />
            </button>

            <div className="wt-date-header-labels">
              {viewMode === 'year' ? (
                <span className="wt-date-header-range">
                  {yearRangeStart} – {yearRangeStart + 11}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className="wt-date-header-btn"
                    onClick={() => setViewMode(viewMode === 'month' ? 'day' : 'month')}
                  >
                    {format(viewMonth, 'MMMM')}
                  </button>
                  <button
                    type="button"
                    className="wt-date-header-btn"
                    onClick={openYearView}
                  >
                    {format(viewMonth, 'yyyy')}
                  </button>
                </>
              )}
            </div>

            <button type="button" className="wt-date-nav" onClick={handleNext}>
              <ChevronRight size={16} />
            </button>
          </div>

          {viewMode === 'month' && (
            <div className="wt-date-month-grid">
              {MONTH_NAMES_SHORT.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  className={clsx('wt-date-month-btn', i === viewMonth.getMonth() && 'is-selected')}
                  onClick={() => {
                    const newMonth = new Date(viewMonth.getFullYear(), i, 1);
                    setViewMonth(newMonth);
                    setFocusedDay(new Date(viewMonth.getFullYear(), i, Math.min(focusedDay.getDate(), 28)));
                    setViewMode('day');
                    inputRef.current?.focus();
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {viewMode === 'year' && (
            <div className="wt-date-year-grid">
              {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((year) => (
                <button
                  key={year}
                  type="button"
                  className={clsx('wt-date-year-btn', year === viewMonth.getFullYear() && 'is-selected')}
                  onClick={() => {
                    const newMonth = new Date(year, viewMonth.getMonth(), 1);
                    setViewMonth(newMonth);
                    setFocusedDay(new Date(year, viewMonth.getMonth(), Math.min(focusedDay.getDate(), 28)));
                    setViewMode('month');
                    inputRef.current?.focus();
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          {viewMode === 'day' && (
            <>
              <div className="wt-date-weekdays">
                {weekDays.map((d, i) => <span key={i}>{d}</span>)}
              </div>

              <div className="wt-date-grid">
                {dayCells.map((day) => {
                  const isCurrentMonth = isSameMonth(day, viewMonth);
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const isFocused = isSameDay(day, focusedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      className={clsx(
                        'wt-date-day',
                        !isCurrentMonth && 'is-outside',
                        isSelected && 'is-selected',
                        !isSelected && isFocused && 'is-focused'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        commitDate(day);
                      }}
                      onMouseEnter={() => setFocusedDay(day)}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>

              <div className="wt-date-actions">
                <button
                  type="button"
                  className="wt-date-action"
                  onClick={() => {
                    onChange('');
                    setInputText('');
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="wt-date-action"
                  onClick={() => {
                    const today = new Date();
                    commitDate(today);
                  }}
                >
                  Today
                </button>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

// ─── PHONE INPUT FIELD ──────────────────────────
export const PhoneInputField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}> = ({ value, onChange, placeholder, disabled, readOnly }) => {
  const parsed = useMemo(() => parsePhoneNumber(value), [value]);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(parsed.countryCode);

  useEffect(() => {
    if (parsed.digits || value) {
      setSelectedCountry(parsed.countryCode);
    }
  }, [parsed.countryCode, parsed.digits, value]);

  const activeCountry = (parsed.digits ? parsed.countryCode : selectedCountry) || getActiveDefaultCountry();
  const activeRule = COUNTRY_PHONE_RULES[activeCountry] || COUNTRY_PHONE_RULES[getActiveDefaultCountry()];

  const handleCountryChange = (newCode: string) => {
    if (disabled || readOnly) return;
    const nextCode = newCode as CountryCode;
    setSelectedCountry(nextCode);
    if (parsed.digits) {
      onChange(formatPhoneNumber(nextCode, parsed.digits));
    } else {
      onChange('');
    }
  };

  const handleDigitsChange = (newDigits: string) => {
    if (disabled || readOnly) return;
    const cleaned = getPhoneDigitsOnly(newDigits).slice(0, activeRule.digits);
    if (!cleaned) {
      onChange('');
    } else {
      onChange(formatPhoneNumber(activeCountry, cleaned));
    }
  };

  return (
    <div className="wt-phone-input-container">
      <Select
        value={activeCountry}
        onChange={handleCountryChange}
        options={PHONE_COUNTRY_OPTIONS}
        disabled={disabled || readOnly}
        className="wt-phone-country-select"
        style={{ width: '98px', flexShrink: 0, borderRadius: '14px 0 0 14px', borderRight: 'none' }}
      />
      <input
        className="form-control wt-phone-digits-input"
        type="tel"
        value={parsed.digits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder={placeholder || '— — — — — — — —'}
        disabled={disabled}
        readOnly={readOnly}
        style={{ borderRadius: '0 14px 14px 0' }}
      />
    </div>
  );
};

// ─── INPUT FIELD ───────────────────────────────
export const InputField: React.FC<{
  label: string;
  value: string | number;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  list?: string;
}> = ({ label, value, onChange, type = 'text', placeholder, required, readOnly, disabled, className, style, autoFocus, list }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isTel = type === 'tel';
  const isPassword = type === 'password';
  const isDate = type === 'date';

  return (
    <div className={clsx('form-group', className)} style={style}>
      <label className="form-label">
        {label}{required && <span className="req"> *</span>}
      </label>
      {isDate ? (
        <ThemedDateInput
          value={String(value || '')}
          onChange={(val) => {
            if (readOnly || disabled) return;
            onChange?.(val);
          }}
          placeholder={placeholder || 'dd/mm/yyyy'}
          readOnly={readOnly}
          disabled={disabled}
        />
      ) : isTel ? (
        <PhoneInputField
          value={String(value || '')}
          onChange={(val) => {
            if (readOnly || disabled) return;
            onChange?.(val);
          }}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
        />
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            className="form-control"
            type={isPassword ? (showPassword ? 'text' : 'password') : type}
            value={value}
            list={list}
            readOnly={readOnly}
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(e) => {
              if (readOnly || disabled) return;
              onChange?.(e.target.value);
            }}
            placeholder={placeholder}
            style={{ paddingRight: isPassword ? 40 : undefined }}
          />
          {isPassword && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--tx-4)',
                padding: 4,
                height: 'auto'
              }}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── STAT ROW ──────────────────────────────────
export const StatRow: React.FC<{
  rank: number;
  name: string;
  value: number | string;
  maxValue?: number;
  color?: string;
}> = ({ rank, name, value, maxValue = 100, color = 'var(--brand)' }) => {
  const pct = maxValue > 0 ? (Number(value) / maxValue) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--tx-4)', width: 20, textAlign: 'right', flexShrink: 0 }}>
        {rank}
      </span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ width: 90, height: 4, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', width: 32, textAlign: 'right', flexShrink: 0, color }}>
        {value}
      </span>
    </div>
  );
};

export { Pagination } from './Pagination/Pagination';
