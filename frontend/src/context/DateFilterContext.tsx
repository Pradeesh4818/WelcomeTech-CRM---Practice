import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subDays,
  startOfYear,
  endOfYear,
  parseISO
} from 'date-fns';

import { useAuthStore } from '../store/authStore';

export type DateFilterType = 'all' | 'date' | 'date_range' | 'month' | 'quarter' | 'year';

export interface DateFilterState {
  filterType: DateFilterType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;     // e.g. "Today", "Oct 2026", "09 Oct – 13 Oct"
  badgeText: string; // e.g. "Month", "Range", "Date", "Quarter", "Year"
  isFiltered: boolean;
  selectedMonth: number; // 0 = Jan, 9 = Oct, 11 = Dec
  selectedYear: number;  // e.g. 2026
}

export interface DateFilterContextType extends DateFilterState {
  setMonthFilter: (year: number, monthIndex: number) => void;
  setQuarterFilter: (year: number, quarterNumber: number) => void;
  setYearFilter: (year: number) => void;
  setDateRangeFilter: (start: string, end: string, customLabel?: string, type?: DateFilterType) => void;
  setAllDatesFilter: () => void;
  resetDateFilter: () => void;
  clearDateFilter: () => void;
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined);

const toLocalISO = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const appScope = (import.meta as any).env?.VITE_APP_SCOPE || 'live';

export const getStorageKey = (userId?: string | null): string => {
  const scope = userId ? String(userId).trim() : 'guest';
  return `wt_date_filter_${appScope}_${scope}`;
};

export const getDefaultDateFilterState = (): DateFilterState => {
  const now = new Date();
  const currentIso = toLocalISO(now);
  const currentLabel = format(now, 'dd MMM yyyy');
  return {
    filterType: 'date',
    startDate: currentIso,
    endDate: currentIso,
    label: currentLabel,
    badgeText: '',
    isFiltered: false,
    selectedMonth: now.getMonth(),
    selectedYear: now.getFullYear(),
  };
};

export const getStoredDateFilter = (storageKey: string): DateFilterState | null => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.filterType && parsed.label) {
      return parsed as DateFilterState;
    }
  } catch (err) {
    console.error('Failed to parse persisted date filter:', err);
  }
  return null;
};

export const DateFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userId = user?._id || (user as any)?.id || user?.email || null;
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);

  const [state, setState] = useState<DateFilterState>(() => {
    return getStoredDateFilter(storageKey) || getDefaultDateFilterState();
  });

  // Restore user's specific filter when user login changes or on mount
  useEffect(() => {
    const saved = getStoredDateFilter(storageKey);
    if (saved) {
      setState(saved);
    } else {
      setState(getDefaultDateFilterState());
    }
  }, [storageKey]);

  const updateStateAndPersist = (nextState: DateFilterState) => {
    setState(nextState);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(nextState));
      }
    } catch (err) {
      console.error('Failed to persist date filter:', err);
    }
  };

  // 1. Single Month Filter (Flow A: Normalizes to full calendar month 01 to 31/30)
  const setMonthFilter = (year: number, monthIndex: number) => {
    const targetDate = new Date(year, monthIndex, 1);
    const start = toLocalISO(startOfMonth(targetDate));
    const end = toLocalISO(endOfMonth(targetDate));
    const monthLabel = format(targetDate, 'MMM yyyy');

    updateStateAndPersist({
      filterType: 'month',
      startDate: start,
      endDate: end,
      label: monthLabel,
      badgeText: 'Month',
      isFiltered: true,
      selectedMonth: monthIndex,
      selectedYear: year,
    });
  };

  // 2. Quarter Filter (Q1..Q4)
  const setQuarterFilter = (year: number, quarterNumber: number) => {
    const startMonth = (quarterNumber - 1) * 3;
    const endMonth = startMonth + 2;
    const start = toLocalISO(new Date(year, startMonth, 1));
    const end = toLocalISO(endOfMonth(new Date(year, endMonth, 1)));
    const qLabel = `Q${quarterNumber} ${year}`;

    updateStateAndPersist({
      filterType: 'quarter',
      startDate: start,
      endDate: end,
      label: qLabel,
      badgeText: 'Quarter',
      isFiltered: true,
      selectedMonth: startMonth,
      selectedYear: year,
    });
  };

  // 3. Calendar Year Filter
  const setYearFilter = (year: number) => {
    const targetDate = new Date(year, 0, 1);
    const start = toLocalISO(startOfYear(targetDate));
    const end = toLocalISO(endOfYear(targetDate));
    const yearLabel = String(year);

    updateStateAndPersist({
      filterType: 'year',
      startDate: start,
      endDate: end,
      label: yearLabel,
      badgeText: 'Year',
      isFiltered: true,
      selectedMonth: 0,
      selectedYear: year,
    });
  };

  // 4. Custom Date or Date Range Filter (Flow B)
  const setDateRangeFilter = (start: string, end: string, customLabel?: string, type: DateFilterType = 'date_range') => {
    const isSingleDay = start === end;
    let label = customLabel;

    if (!label) {
      try {
        const sD = parseISO(start);
        const eD = parseISO(end);
        if (isSingleDay) {
          label = format(sD, 'dd MMM yyyy');
        } else {
          label = `${format(sD, 'dd MMM')} – ${format(eD, 'dd MMM yyyy')}`;
        }
      } catch {
        label = `${start} – ${end}`;
      }
    }

    const currentIso = toLocalISO(new Date());

    updateStateAndPersist({
      filterType: isSingleDay ? 'date' : type,
      startDate: start,
      endDate: end,
      label,
      badgeText: isSingleDay ? 'Date' : 'Range',
      isFiltered: true,
      selectedMonth: parseISO(start).getMonth(),
      selectedYear: parseISO(start).getFullYear(),
    });
  };

  // 5. All Dates (No restriction)
  const setAllDatesFilter = () => {
    const now = new Date();
    updateStateAndPersist({
      filterType: 'all',
      startDate: '',
      endDate: '',
      label: 'All Dates',
      badgeText: 'All',
      isFiltered: true,
      selectedMonth: now.getMonth(),
      selectedYear: now.getFullYear(),
    });
  };

  // 6. Reset / Clear to Default (Flow C: One-Click Quick Clear)
  const resetDateFilter = () => {
    updateStateAndPersist(getDefaultDateFilterState());
  };

  const contextValue = useMemo<DateFilterContextType>(
    () => ({
      ...state,
      setMonthFilter,
      setQuarterFilter,
      setYearFilter,
      setDateRangeFilter,
      setAllDatesFilter,
      resetDateFilter,
      clearDateFilter: resetDateFilter,
    }),
    [state]
  );

  return (
    <DateFilterContext.Provider value={contextValue}>
      {children}
    </DateFilterContext.Provider>
  );
};

export const useDateFilter = (): DateFilterContextType => {
  const context = useContext(DateFilterContext);
  if (!context) {
    throw new Error('useDateFilter must be used within a DateFilterProvider');
  }
  return context;
};

export default DateFilterContext;
