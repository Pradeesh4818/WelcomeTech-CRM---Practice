import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ArrowRight
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  subDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWithinInterval,
  isAfter,
  parseISO
} from 'date-fns';
import { useDateFilter } from '../../context/DateFilterContext';

const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

const QUARTER_TAGS = ['Q1', 'Q1', 'Q1', 'Q2', 'Q2', 'Q2', 'Q3', 'Q3', 'Q3', 'Q4', 'Q4', 'Q4'];

export const DateFilterSelector: React.FC = () => {
  const {
    filterType,
    startDate,
    endDate,
    label,
    badgeText,
    isFiltered,
    selectedMonth,
    selectedYear,
    setMonthFilter,
    setQuarterFilter,
    setYearFilter,
    setDateRangeFilter,
    setAllDatesFilter,
    resetDateFilter,
  } = useDateFilter();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'date' | 'month' | 'year' | 'all'>('date');

  // Staged draft states for modal
  const [draftStart, setDraftStart] = useState<string>(startDate);
  const [draftEnd, setDraftEnd] = useState<string>(endDate);
  const [draftMonth, setDraftMonth] = useState<number>(selectedMonth);
  const [draftYear, setDraftYear] = useState<number>(selectedYear);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());

  // Double click detection ref
  const lastClickedMonthRef = useRef<{ month: number; time: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<React.CSSProperties>({});
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Sync draft states whenever popover opens
  useEffect(() => {
    if (isOpen) {
      setDraftStart(startDate);
      setDraftEnd(endDate);
      setDraftMonth(selectedMonth);
      setDraftYear(selectedYear);
      try {
        setCalendarViewDate(startDate ? parseISO(startDate) : new Date());
      } catch {
        setCalendarViewDate(new Date());
      }
      if (filterType === 'all') setActiveTab('all');
      else if (filterType === 'month' || filterType === 'quarter') setActiveTab('month');
      else if (filterType === 'year') setActiveTab('year');
      else setActiveTab('date');
    }
  }, [isOpen, startDate, endDate, selectedMonth, selectedYear, filterType]);

  // Position calculation & resize listeners
  const updatePosition = () => {
    const mobile = window.innerWidth < 640;
    setIsMobile(mobile);

    if (mobile) {
      setPopoverPos({
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      });
      return;
    }

    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 490;
    const screenWidth = window.innerWidth;

    let left = rect.right - popoverWidth;
    if (left < 16) left = 16;
    if (left + popoverWidth > screenWidth - 16) {
      left = screenWidth - popoverWidth - 16;
    }

    setPopoverPos({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: `${popoverWidth}px`,
      zIndex: 9999,
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleResize = () => updatePosition();
      const handleScroll = () => updatePosition();
      const handleOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (triggerRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setIsOpen(false);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('mousedown', handleOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  // ─── Actions ──────────────────────────────────
  const handleApply = () => {
    if (activeTab === 'all') {
      setAllDatesFilter();
    } else if (activeTab === 'month') {
      setMonthFilter(draftYear, draftMonth);
    } else if (activeTab === 'year') {
      setYearFilter(draftYear);
    } else {
      setDateRangeFilter(draftStart, draftEnd);
    }
    setIsOpen(false);
  };

  const handleQuickClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetDateFilter();
  };

  const handleMonthClick = (mIdx: number) => {
    const now = Date.now();
    if (
      lastClickedMonthRef.current &&
      lastClickedMonthRef.current.month === mIdx &&
      now - lastClickedMonthRef.current.time < 350
    ) {
      // Double click detected -> Instant Auto Apply
      setMonthFilter(draftYear, mIdx);
      setIsOpen(false);
      lastClickedMonthRef.current = null;
      return;
    }

    lastClickedMonthRef.current = { month: mIdx, time: now };
    setDraftMonth(mIdx);
  };

  const handleQuarterClick = (q: number) => {
    setQuarterFilter(draftYear, q);
    setIsOpen(false);
  };

  // ─── From / To Manual Date Changes ────────────
  const handleFromDateChange = (val: string) => {
    if (!val) return;
    setDraftStart(val);
    try {
      const sDate = parseISO(val);
      if (!isNaN(sDate.getTime())) {
        setCalendarViewDate(sDate);
        if (draftEnd) {
          const eDate = parseISO(draftEnd);
          if (!isNaN(eDate.getTime()) && isAfter(sDate, eDate)) {
            setDraftEnd(val);
          }
        }
      }
    } catch {}
  };

  const handleToDateChange = (val: string) => {
    if (!val) return;
    setDraftEnd(val);
    try {
      const eDate = parseISO(val);
      if (!isNaN(eDate.getTime())) {
        if (draftStart) {
          const sDate = parseISO(draftStart);
          if (!isNaN(sDate.getTime()) && isAfter(sDate, eDate)) {
            setDraftStart(val);
            setCalendarViewDate(eDate);
          }
        }
      }
    } catch {}
  };

  // ─── Scope String Computation ────────────────
  const scopeSummary = React.useMemo(() => {
    if (activeTab === 'all') return 'Scope: All historical records (No date restrictions active)';
    if (activeTab === 'month') {
      const targetDate = new Date(draftYear, draftMonth, 1);
      const s = format(startOfMonth(targetDate), 'dd/MM/yyyy');
      const e = format(endOfMonth(targetDate), 'dd/MM/yyyy');
      const days = format(endOfMonth(targetDate), 'dd');
      return `Scope: ${s} — ${e} · Full Calendar Month (${days} Days)`;
    }
    if (activeTab === 'year') {
      return `Scope: 01/01/${draftYear} — 31/12/${draftYear} · Full Calendar Year`;
    }
    try {
      const sD = parseISO(draftStart);
      const eD = parseISO(draftEnd);
      const s = format(sD, 'dd/MM/yyyy');
      const e = format(eD, 'dd/MM/yyyy');
      const diffDays = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return `Scope: ${s} — ${e} (${diffDays} ${diffDays === 1 ? 'Day' : 'Days'})`;
    } catch {
      return `Scope: ${draftStart} — ${draftEnd}`;
    }
  }, [activeTab, draftMonth, draftYear, draftStart, draftEnd]);

  // ─── Calendar Generation ─────────────────────
  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(calendarViewDate);
    const monthEnd = endOfMonth(calendarViewDate);
    const startDateGrid = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDateGrid = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: startDateGrid, end: endDateGrid });
  }, [calendarViewDate]);

  const handleDateClick = (day: Date) => {
    const dayIso = format(day, 'yyyy-MM-dd');
    if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
      setDraftStart(dayIso);
      setDraftEnd(dayIso);
    } else {
      if (isAfter(parseISO(draftStart), day)) {
        setDraftEnd(draftStart);
        setDraftStart(dayIso);
      } else {
        setDraftEnd(dayIso);
      }
    }
  };

  return (
    <>
      {/* ── Trigger Pill ────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        className={`topbar-date-trigger ${isFiltered ? 'active-filter' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Filter by date or month"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          height: '36px',
          padding: isFiltered ? '0 8px 0 12px' : '0 12px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          background: isFiltered ? 'var(--brand-light)' : 'var(--surface)',
          color: isFiltered ? 'var(--brand)' : 'var(--tx-2)',
          border: `1px solid ${isFiltered ? 'var(--brand)' : 'var(--border)'}`,
          boxShadow: isFiltered ? '0 0 0 1px var(--brand), 0 2px 8px rgba(109, 40, 217, 0.15)' : 'var(--sh-xs)',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          userSelect: 'none',
        }}
      >
        <CalendarIcon
          size={14}
          style={{
            color: isFiltered ? 'var(--brand)' : 'var(--tx-4)',
            flexShrink: 0
          }}
        />

        <span className="topbar-date-label" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
          {label}
        </span>

        {badgeText && (
          <span
            className="topbar-date-badge"
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: 'var(--brand)',
              color: '#ffffff',
              borderRadius: '9999px',
              lineHeight: 1.2,
            }}
          >
            {badgeText}
          </span>
        )}

        {isFiltered ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date filter"
            className="topbar-date-clear"
            onClick={handleQuickClear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleQuickClear(e as any);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '9999px',
              background: 'rgba(109, 40, 217, 0.18)',
              color: 'var(--brand)',
              cursor: 'pointer',
              marginLeft: '2px',
              transition: 'all 0.15s ease',
            }}
            title="Clear filter and reset to Today"
          >
            <X size={11} strokeWidth={2.5} />
          </span>
        ) : (
          <ChevronDown className="topbar-date-caret" size={14} style={{ color: 'var(--tx-4)', marginLeft: '2px' }} />
        )}
      </button>

      {/* ── Popover Modal Dialog ─────────────────────────────────── */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop overlay for mobile drawer */}
            {isMobile && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.45)',
                  backdropFilter: 'blur(3px)',
                  zIndex: 9998,
                }}
                onClick={() => setIsOpen(false)}
              />
            )}

            <div
              ref={popoverRef}
              role="dialog"
              aria-modal="true"
              aria-label="Date and Month Filter"
              className="topbar-date-picker-portal"
              style={{
                ...popoverPos,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: isMobile ? '24px 24px 0 0' : '20px',
                boxShadow: 'var(--sh-lg)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                animation: isMobile ? 'drawerSlideUp 0.25s ease-out' : 'popoverScaleFade 0.18s ease-out',
                color: 'var(--tx-1)',
              }}
            >
              {/* Mobile Drawer Pull Indicator */}
              {isMobile && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '4px',
                      borderRadius: '9999px',
                      background: 'var(--border-2)',
                    }}
                  />
                </div>
              )}

              {/* 1. Modal Header */}
              <div
                style={{
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'var(--brand-light)',
                      color: 'var(--brand)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CalendarIcon size={15} />
                  </div>
                  <h3
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--tx-1)',
                      margin: 0,
                    }}
                  >
                    Select Date Filter
                  </h3>
                </div>

                <button
                  type="button"
                  aria-label="Close date filter"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: 'var(--tx-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* 2. Segmented Navigation Tabs */}
              <div
                style={{
                  display: 'flex',
                  padding: '10px 16px',
                  gap: '6px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                {[
                  { id: 'all', label: 'All Dates' },
                  { id: 'date', label: 'From - To Date' },
                  { id: 'month', label: 'By Month' },
                  { id: 'year', label: 'By Year' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as any)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: activeTab === t.id ? 700 : 500,
                      background: activeTab === t.id ? 'var(--brand)' : 'var(--surface-2)',
                      color: activeTab === t.id ? '#ffffff' : 'var(--tx-3)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 3. Tab Body Container (Clean Full-Width Without Sidebar List) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '290px',
                  maxHeight: isMobile ? '70vh' : 'auto',
                  overflowY: isMobile ? 'auto' : 'visible',
                }}
              >
                {/* ── TAB: ALL DATES ───────────────────────────────── */}
                {activeTab === 'all' && (
                  <div
                    style={{
                      flex: 1,
                      padding: '40px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '16px',
                        background: 'var(--brand-light)',
                        color: 'var(--brand)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CalendarIcon size={24} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx-1)' }}>
                      View All Historical Records
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--tx-4)', maxWidth: '380px' }}>
                      Removes all date boundaries across all CRM modules (Dashboard, Invoices, Proposals, AMC, and Tasks).
                    </div>
                  </div>
                )}

                {/* ── TAB: FROM - TO DATE (NO SIDEBAR + TOP FROM-TO INPUTS) ── */}
                {activeTab === 'date' && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Top: From to To Date Filtration Controls */}
                    <div
                      style={{
                        padding: '16px 20px',
                        background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {/* From Date and To Date Input Fields */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        {/* From Date Box */}
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'var(--tx-3)',
                              letterSpacing: '0.04em',
                              marginBottom: '5px',
                            }}
                          >
                            From Date
                          </label>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              padding: '0 10px',
                              height: '38px',
                              transition: 'border-color 0.15s ease',
                            }}
                          >
                            <CalendarIcon size={14} style={{ color: 'var(--tx-4)', marginRight: '8px', flexShrink: 0 }} />
                            <input
                              type="date"
                              aria-label="From Date"
                              value={draftStart}
                              onChange={(e) => handleFromDateChange(e.target.value)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--tx-1)',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                        </div>

                        {/* Arrow Separator */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingTop: '20px',
                            color: 'var(--tx-4)',
                          }}
                        >
                          <ArrowRight size={16} />
                        </div>

                        {/* To Date Box */}
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'var(--tx-3)',
                              letterSpacing: '0.04em',
                              marginBottom: '5px',
                            }}
                          >
                            To Date
                          </label>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              padding: '0 10px',
                              height: '38px',
                              transition: 'border-color 0.15s ease',
                            }}
                          >
                            <CalendarIcon size={14} style={{ color: 'var(--tx-4)', marginRight: '8px', flexShrink: 0 }} />
                            <input
                              type="date"
                              aria-label="To Date"
                              value={draftEnd}
                              onChange={(e) => handleToDateChange(e.target.value)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--tx-1)',
                                fontSize: '13px',
                                fontWeight: 600,
                                outline: 'none',
                                fontFamily: 'inherit',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Calendar View Below */}
                    <div style={{ padding: '16px 20px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '14px',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Previous Month"
                          onClick={() => setCalendarViewDate(subMonths(calendarViewDate, 1))}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--tx-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--tx-1)' }}>
                          {format(calendarViewDate, 'MMMM yyyy')}
                        </div>
                        <button
                          type="button"
                          aria-label="Next Month"
                          onClick={() => setCalendarViewDate(addMonths(calendarViewDate, 1))}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--tx-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>

                      {/* Day Headers */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(7, 1fr)',
                          textAlign: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--tx-4)',
                          marginBottom: '6px',
                        }}
                      >
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                          <div key={d} style={{ padding: '4px' }}>
                            {d}
                          </div>
                        ))}
                      </div>

                      {/* Days Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(7, 1fr)',
                          gap: '2px',
                        }}
                      >
                        {calendarDays.map((d, idx) => {
                          const isoStr = format(d, 'yyyy-MM-dd');
                          const isStart = draftStart === isoStr;
                          const isEnd = draftEnd === isoStr;
                          const inRange =
                            draftStart &&
                            draftEnd &&
                            isWithinInterval(d, {
                              start: parseISO(draftStart),
                              end: parseISO(draftEnd),
                            });
                          const isCurrentMonth = d.getMonth() === calendarViewDate.getMonth();

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleDateClick(d)}
                              style={{
                                padding: '8px 0',
                                border: 'none',
                                background: isStart || isEnd
                                  ? 'var(--brand)'
                                  : inRange
                                  ? 'var(--brand-light)'
                                  : 'transparent',
                                color: isStart || isEnd
                                  ? '#ffffff'
                                  : !isCurrentMonth
                                  ? 'var(--tx-5)'
                                  : inRange
                                  ? 'var(--brand)'
                                  : 'var(--tx-2)',
                                fontWeight: isStart || isEnd ? 700 : 500,
                                fontSize: '12px',
                                borderRadius: isStart || isEnd ? '8px' : '4px',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease',
                              }}
                            >
                              {format(d, 'd')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB: BY MONTH (NO SIDEBAR + TOP SHORTCUTS) ─────── */}
                {activeTab === 'month' && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Top Horizontal Shortcuts Bar */}
                    <div
                      style={{
                        padding: '12px 20px',
                        background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        overflowX: 'auto',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setDraftYear(now.getFullYear());
                          setDraftMonth(now.getMonth());
                        }}
                        style={{
                          padding: '5px 11px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          background: 'var(--surface)',
                          color: 'var(--tx-2)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      >
                        Current Month
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const prev = subMonths(new Date(), 1);
                          setDraftYear(prev.getFullYear());
                          setDraftMonth(prev.getMonth());
                        }}
                        style={{
                          padding: '5px 11px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          background: 'var(--surface)',
                          color: 'var(--tx-2)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      >
                        Previous Month
                      </button>
                      {[
                        { q: 1, label: 'Q1 (Jan - Mar)' },
                        { q: 2, label: 'Q2 (Apr - Jun)' },
                        { q: 3, label: 'Q3 (Jul - Sep)' },
                        { q: 4, label: 'Q4 (Oct - Dec)' },
                      ].map((item) => (
                        <button
                          key={item.q}
                          type="button"
                          onClick={() => handleQuarterClick(item.q)}
                          style={{
                            padding: '5px 11px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            background: 'var(--surface)',
                            color: 'var(--tx-2)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* 12 Months Grid */}
                    <div style={{ padding: '16px 20px' }}>
                      {/* Year Selector */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '16px',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Previous Year"
                          onClick={() => setDraftYear((y) => y - 1)}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--tx-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-1)' }}>
                          YEAR {draftYear}
                        </div>
                        <button
                          type="button"
                          aria-label="Next Year"
                          onClick={() => setDraftYear((y) => y + 1)}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--tx-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>

                      {/* 12 Months Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '10px',
                        }}
                      >
                        {MONTH_NAMES.map((mName, mIdx) => {
                          const isSelected = draftMonth === mIdx;
                          const qTag = QUARTER_TAGS[mIdx];
                          return (
                            <button
                              key={mName}
                              type="button"
                              aria-label={mName}
                              onClick={() => handleMonthClick(mIdx)}
                              style={{
                                position: 'relative',
                                height: '52px',
                                borderRadius: '12px',
                                border: isSelected
                                  ? '2px solid var(--brand)'
                                  : '1px solid var(--border)',
                                background: isSelected
                                  ? 'var(--brand-light)'
                                  : 'var(--surface)',
                                color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                                fontWeight: isSelected ? 800 : 600,
                                fontSize: '13px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: isSelected ? '0 4px 12px rgba(109, 40, 217, 0.15)' : 'none',
                              }}
                            >
                              <span style={{ letterSpacing: '0.05em' }}>{mName}</span>
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '6px',
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: isSelected ? 'var(--brand)' : 'var(--tx-4)',
                                  opacity: 0.8,
                                }}
                              >
                                {qTag}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          marginTop: '12px',
                          fontSize: '11px',
                          color: 'var(--tx-4)',
                          textAlign: 'center',
                        }}
                      >
                        💡 Tip: Double-click any month to auto-apply immediately
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB: BY YEAR ─────────────────────────────────── */}
                {activeTab === 'year' && (
                  <div style={{ flex: 1, padding: '32px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: 'var(--tx-4)', marginBottom: '16px', fontWeight: 600 }}>
                      Select Full Calendar Year
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        maxWidth: '360px',
                        margin: '0 auto',
                      }}
                    >
                      {[2023, 2024, 2025, 2026, 2027, 2028].map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setDraftYear(yr)}
                          style={{
                            padding: '14px',
                            borderRadius: '12px',
                            border: draftYear === yr ? '2px solid var(--brand)' : '1px solid var(--border)',
                            background: draftYear === yr ? 'var(--brand-light)' : 'var(--surface)',
                            color: draftYear === yr ? 'var(--brand)' : 'var(--tx-1)',
                            fontWeight: draftYear === yr ? 800 : 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                          }}
                        >
                          {yr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Footer Bar */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: '11.5px',
                    color: 'var(--tx-3)',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {scopeSummary}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => {
                      resetDateFilter();
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--tx-3)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--tx-2)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleApply}
                    style={{
                      padding: '7px 18px',
                      borderRadius: '8px',
                      background: 'var(--brand)',
                      border: 'none',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(109, 40, 217, 0.3)',
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
};

export default DateFilterSelector;
