import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface ThemeDropdownOption<T extends string = string> {
  value: T;
  label: string;
  dotColor?: string;
  description?: string;
}

export interface ThemeDropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: ThemeDropdownOption<T>[];
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
  menuStyle?: React.CSSProperties;
  menuClassName?: string;
  minMenuWidth?: number;
  'aria-label'?: string;
  disabled?: boolean;
}

export function ThemeDropdown<T extends string = string>({
  value,
  onChange,
  options,
  align = 'left',
  size = 'md',
  triggerStyle,
  triggerClassName,
  menuStyle: customMenuStyle,
  menuClassName,
  minMenuWidth,
  'aria-label': ariaLabel,
  disabled = false,
}: ThemeDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 8;
    const triggerWidth = Math.round(rect.width);
    const resolvedMinWidth = minMenuWidth ?? Math.max(triggerWidth, size === 'sm' ? 90 : 130);

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpwards = spaceBelow < 160 && spaceAbove > spaceBelow;

    let top: number | undefined;
    let bottom: number | undefined;

    if (openUpwards) {
      bottom = Math.round(window.innerHeight - rect.top + 5);
      top = undefined;
    } else {
      top = Math.round(rect.bottom + 5);
      bottom = undefined;
    }

    let left: number;
    if (align === 'right') {
      left = Math.round(rect.right - resolvedMinWidth);
      if (left < margin) left = margin;
    } else {
      left = Math.round(rect.left);
      if (left + resolvedMinWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - margin - resolvedMinWidth);
      }
    }

    setMenuPosition({
      position: 'fixed',
      top: top !== undefined ? `${top}px` : undefined,
      bottom: bottom !== undefined ? `${bottom}px` : undefined,
      left: `${left}px`,
      minWidth: `${resolvedMinWidth}px`,
      zIndex: 99999,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isSmall = size === 'sm';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        className={triggerClassName}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isSmall ? 4 : 7,
          background: 'var(--surface-2, #f8fafc)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: isSmall ? 6 : 7,
          padding: isSmall ? '2px 7px' : '4px 9px',
          fontSize: isSmall ? 12 : 12.5,
          fontWeight: 700,
          color: selectedOption?.dotColor ? selectedOption.dotColor : 'var(--tx-1, #0f172a)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'all 0.15s ease',
          boxShadow: open ? '0 0 0 2px var(--brand-light, rgba(109, 40, 217, 0.15))' : 'none',
          ...triggerStyle,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {selectedOption?.dotColor && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: selectedOption.dotColor,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          )}
          <span>{selectedOption?.label}</span>
        </span>
        <ChevronDown
          size={isSmall ? 12 : 13}
          style={{
            color: 'var(--tx-3, #94a3b8)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0,
          }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className={menuClassName}
            style={{
              ...menuPosition,
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 10,
              boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.16), 0 4px 10px -2px rgba(0, 0, 0, 0.08)',
              padding: 4,
              overflow: 'hidden',
              animation: 'themeDropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              ...customMenuStyle,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--brand-surface, rgba(109, 40, 217, 0.08))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: isSmall ? '5px 8px' : '7px 11px',
                    borderRadius: 6,
                    fontSize: isSmall ? 11.5 : 12.5,
                    fontWeight: isSelected ? 700 : 550,
                    color: isSelected ? 'var(--brand, #6d28d9)' : 'var(--tx-1, #0f172a)',
                    background: isSelected ? 'var(--brand-surface, rgba(109, 40, 217, 0.1))' : 'transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.12s ease',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {opt.dotColor && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: opt.dotColor,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span>{opt.label}</span>
                  </div>
                  {isSelected && <Check size={13} color="var(--brand, #6d28d9)" strokeWidth={2.5} />}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

export default ThemeDropdown;
