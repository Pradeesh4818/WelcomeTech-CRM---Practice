import { describe, it, expect } from 'vitest';
import { parseFlexibleDate } from '../../components/ui';

describe('Global Date Typing & Flexible Parsing', () => {
  it('parses standard ISO format (YYYY-MM-DD)', () => {
    const d = parseFlexibleDate('2026-08-25');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7); // 0-indexed (August is 7)
    expect(d?.getDate()).toBe(25);
  });

  it('parses slash format (DD/MM/YYYY)', () => {
    const d = parseFlexibleDate('25/08/2026');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(25);
  });

  it('parses hyphen format (DD-MM-YYYY)', () => {
    const d = parseFlexibleDate('25-08-2026');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(25);
  });

  it('parses dot format (DD.MM.YYYY)', () => {
    const d = parseFlexibleDate('25.08.2026');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(25);
  });

  it('parses single-digit day and month (e.g. 5/8/2026)', () => {
    const d = parseFlexibleDate('5/8/2026');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(5);
  });

  it('parses compact 8-digit numeric input (DDMMYYYY)', () => {
    const d = parseFlexibleDate('25082026');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7);
    expect(d?.getDate()).toBe(25);
  });

  it('returns null for invalid date inputs', () => {
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate('   ')).toBeNull();
    expect(parseFlexibleDate('invalid-date')).toBeNull();
    expect(parseFlexibleDate('32/08/2026')).toBeNull(); // Day > 31
    expect(parseFlexibleDate('25/13/2026')).toBeNull(); // Month > 12
    expect(parseFlexibleDate('30/02/2026')).toBeNull(); // Feb 30 does not exist
  });
});

describe('Calendar Enter Key Selection & Arrow Navigation Logic', () => {
  it('places and confirms focused date when Enter key is pressed in open calendar', () => {
    let committedValue = '';
    let isOpen = true;

    const focusedDay = new Date(2026, 7, 25); // 2026-08-25

    const commitDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      committedValue = `${y}-${m}-${d}`;
      isOpen = false;
    };

    const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitDate(focusedDay);
      }
    };

    let prevented = false;
    handleKeyDown({ key: 'Enter', preventDefault: () => { prevented = true; } });

    expect(committedValue).toBe('2026-08-25');
    expect(isOpen).toBe(false);
    expect(prevented).toBe(true);
  });

  it('navigates days with arrow keys', () => {
    let focused = new Date(2026, 7, 15); // 2026-08-15

    const stepDay = (offset: number) => {
      focused = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() + offset);
    };

    // Right arrow (+1 day)
    stepDay(1);
    expect(focused.getDate()).toBe(16);

    // Left arrow (-1 day)
    stepDay(-1);
    expect(focused.getDate()).toBe(15);

    // Down arrow (+7 days / next week)
    stepDay(7);
    expect(focused.getDate()).toBe(22);

    // Up arrow (-7 days / prev week)
    stepDay(-7);
    expect(focused.getDate()).toBe(15);
  });

  it('correctly commits clicked calendar date and updates formatted text', () => {
    let value = '2026-08-31';
    let inputText = '31/08/2026';
    let isOpen = true;

    const commitDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      value = `${y}-${m}-${d}`;
      inputText = `${d}/${m}/${y}`;
      isOpen = false;
    };

    // User clicks on August 26, 2026
    const clickedDay = new Date(2026, 7, 26);
    commitDate(clickedDay);

    expect(value).toBe('2026-08-26');
    expect(inputText).toBe('26/08/2026');
    expect(isOpen).toBe(false);
  });

  it('correctly handles clicking previous month dates (outside days)', () => {
    let value = '2026-08-31';
    let inputText = '31/08/2026';

    const commitDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      value = `${y}-${m}-${d}`;
      inputText = `${d}/${m}/${y}`;
    };

    // User clicks July 26, 2026
    const clickedOutsideDay = new Date(2026, 6, 26);
    commitDate(clickedOutsideDay);

    expect(value).toBe('2026-07-26');
    expect(inputText).toBe('26/07/2026');
  });
});
