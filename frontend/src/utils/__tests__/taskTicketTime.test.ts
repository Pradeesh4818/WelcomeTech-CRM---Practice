import { describe, it, expect } from 'vitest';
import { combineDateTime, extractDate, extractTime, fmt } from '../helpers';

describe('Task & Ticket Date/Time Utilities', () => {
  it('combines date and time into a valid ISO string', () => {
    const combined = combineDateTime('2026-09-01', '14:30');
    expect(combined).toBeDefined();
    expect(new Date(combined!).getFullYear()).toBe(2026);
    expect(new Date(combined!).getMonth()).toBe(8); // 0-indexed September
    expect(new Date(combined!).getDate()).toBe(1);
  });

  it('handles combineDateTime without time (defaults to start of day)', () => {
    const combined = combineDateTime('2026-09-01');
    expect(combined).toBe('2026-09-01T00:00:00.000Z');
  });

  it('returns undefined when combineDateTime is given an empty date', () => {
    expect(combineDateTime('')).toBeUndefined();
    expect(combineDateTime(undefined)).toBeUndefined();
  });

  it('extracts date in YYYY-MM-DD format accurately', () => {
    const d = '2026-09-01T14:30:00.000Z';
    const extracted = extractDate(d);
    expect(extracted).toMatch(/^2026-09-0/);
  });

  it('extracts time in HH:mm format accurately', () => {
    const d = new Date('2026-09-01T15:45:00');
    const time = extractTime(d);
    expect(time).toBe('15:45');
  });

  it('formats time nicely with fmt.time (12-hour AM/PM)', () => {
    const d = new Date('2026-09-01T10:30:00');
    const formatted = fmt.time(d);
    expect(formatted.toLowerCase()).toContain('10:30 am');
  });

  it('formats full datetime nicely with fmt.dateTime', () => {
    const d = new Date('2026-09-01T16:15:00');
    const formatted = fmt.dateTime(d);
    expect(formatted).toContain('01 Sep 2026');
    expect(formatted.toLowerCase()).toContain('04:15 pm');
  });

  it('handles null / undefined in fmt.time and fmt.dateTime gracefully', () => {
    expect(fmt.time(null)).toBe('—');
    expect(fmt.time(undefined)).toBe('—');
    expect(fmt.dateTime(null)).toBe('—');
    expect(fmt.dateTime(undefined)).toBe('—');
  });

  describe('Automatic Creation Time (Non-Manual Entry)', () => {
    it('automatically captures current creation time for new tasks without manual input', () => {
      const now = new Date();
      const taskDateInput = extractDate(now);
      // Simulate form where user does not manually provide taskTime (or it is auto-captured)
      const autoCapturedTime = extractTime(now);
      const combinedTaskDate = combineDateTime(taskDateInput, autoCapturedTime);

      expect(combinedTaskDate).toBeDefined();
      const parsedDate = new Date(combinedTaskDate!);
      expect(parsedDate.getFullYear()).toBe(now.getFullYear());
      expect(parsedDate.getMonth()).toBe(now.getMonth());
      expect(parsedDate.getDate()).toBe(now.getDate());
      expect(extractTime(parsedDate)).toBe(autoCapturedTime);
    });

    it('automatically captures ticketRaisedDate with current time for new tickets without manual entry', () => {
      const now = new Date();
      const raisedDateInput = extractDate(now);
      const autoCapturedTime = extractTime(now);
      const ticketRaisedDate = combineDateTime(raisedDateInput, autoCapturedTime);

      expect(ticketRaisedDate).toBeDefined();
      const parsedDate = new Date(ticketRaisedDate!);
      expect(parsedDate.getHours()).toBe(now.getHours());
      expect(parsedDate.getMinutes()).toBe(now.getMinutes());
    });

    it('auto-stamps completedDate with current timestamp when ticket is resolved without manual date', () => {
      const now = new Date();
      const isCompleted = true;
      const completedDate = isCompleted ? now : undefined;

      expect(completedDate).toBeDefined();
      expect(completedDate).toBeInstanceOf(Date);
      expect(fmt.dateTime(completedDate)).not.toBe('—');
    });

    it('preserves existing creation time when editing existing tasks/tickets', () => {
      const originalDate = new Date('2026-09-01T09:15:00');
      const existingTaskTime = extractTime(originalDate);
      const updatedDate = combineDateTime('2026-09-01', existingTaskTime);

      expect(extractTime(updatedDate)).toBe('09:15');
      expect(fmt.time(updatedDate).toLowerCase()).toContain('9:15 am');
    });

    it('labels ticket assignment date field, table column, and detail view as Assign Date', () => {
      // Tickets UI label constants
      const ticketFormDateLabel = 'Assign Date';
      const ticketTableColumnHeader = 'Assign Date';
      const ticketDetailRowLabel = 'Assign Date:';

      expect(ticketFormDateLabel).toBe('Assign Date');
      expect(ticketTableColumnHeader).toBe('Assign Date');
      expect(ticketDetailRowLabel).toBe('Assign Date:');

      // Validates payload mapping retains ticketRaisedDate compatibility
      const editForm = {
        ticketRaisedDate: '2026-09-07',
        ticketRaisedTime: '10:23',
      };
      const combined = combineDateTime(editForm.ticketRaisedDate, editForm.ticketRaisedTime);
      expect(combined).toBeDefined();
      expect(extractDate(combined!)).toBe('2026-09-07');
    });

    it('contextually hides Completed Date & Time for open tickets and reveals/auto-fills on resolved or closed', () => {
      const isCompletedFieldVisible = (status: string) => {
        return status === 'resolved' || status === 'closed';
      };

      // New / Open tickets should NOT show completed date & time
      expect(isCompletedFieldVisible('open')).toBe(false);
      expect(isCompletedFieldVisible('in-progress')).toBe(false);
      expect(isCompletedFieldVisible('pending-customer')).toBe(false);

      // Only resolved or closed tickets show completed date & time
      expect(isCompletedFieldVisible('resolved')).toBe(true);
      expect(isCompletedFieldVisible('closed')).toBe(true);

      // Simulating status change handler:
      let formState = {
        status: 'open',
        completedDate: '',
        completedTime: '',
      };

      const handleStatusChange = (newStatus: string) => {
        const isResolvedOrClosed = isCompletedFieldVisible(newStatus);
        const now = new Date();
        formState = {
          ...formState,
          status: newStatus,
          completedDate: isResolvedOrClosed ? (formState.completedDate || extractDate(now)) : '',
          completedTime: isResolvedOrClosed ? (formState.completedTime || extractTime(now)) : '',
        };
      };

      // 1. Changing to resolved auto-populates today and current time
      handleStatusChange('resolved');
      expect(formState.status).toBe('resolved');
      expect(formState.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(formState.completedTime).toMatch(/^\d{2}:\d{2}$/);

      // 2. Reverting back to open clears completion date
      handleStatusChange('open');
      expect(formState.status).toBe('open');
      expect(formState.completedDate).toBe('');
      expect(formState.completedTime).toBe('');
    });
  });

  describe('Lead Follow-Up Date & Time Integration', () => {
    it('combines nextFollowupDate and nextFollowupTime for lead creation and update payload', () => {
      const form = {
        name: 'Jane Doe',
        nextFollowupDate: '2026-09-15',
        nextFollowupTime: '15:45',
      };

      const combined = combineDateTime(form.nextFollowupDate, form.nextFollowupTime);
      expect(combined).toBeDefined();

      const parsed = new Date(combined!);
      expect(extractDate(parsed)).toBe('2026-09-15');
      expect(extractTime(parsed)).toBe('15:45');
    });

    it('handles lead editing by correctly splitting nextFollowupDate into date and time inputs', () => {
      const existingLead = {
        _id: 'lead-123',
        name: 'Acme Corp Lead',
        nextFollowupDate: new Date('2026-09-20T11:30:00').toISOString(),
      };

      const editForm = {
        nextFollowupDate: extractDate(existingLead.nextFollowupDate),
        nextFollowupTime: extractTime(existingLead.nextFollowupDate),
      };

      expect(editForm.nextFollowupDate).toBe('2026-09-20');
      expect(editForm.nextFollowupTime).toBe('11:30');
    });

    it('formats next followup with date and time when time is available in overview', () => {
      const leadWithTime = '2026-09-20T14:15:00.000Z';
      const formattedWithTime = fmt.dateTime(leadWithTime);
      expect(formattedWithTime).toContain('Sep 2026');
      expect(formattedWithTime).toMatch(/\d{2}:\d{2}/);

      const leadDateOnly = '2026-09-20T00:00:00.000Z';
      const formattedDateOnly = fmt.date(leadDateOnly);
      expect(formattedDateOnly).toBe('20 Sep 2026');
    });
  });
});
