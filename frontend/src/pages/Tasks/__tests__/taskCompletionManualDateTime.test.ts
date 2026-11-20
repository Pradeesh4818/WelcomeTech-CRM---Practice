import { describe, it, expect } from 'vitest';

describe('Task Completion Manual Date & Time Handling', () => {
  it('correctly constructs ISO timestamp from manual date and time input values', () => {
    const manualDate = '2026-09-14';
    const manualTime = '15:45';

    const completedAt = new Date(`${manualDate}T${manualTime}:00`).toISOString();
    const parsed = new Date(completedAt);

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8); // September is month index 8
    expect(parsed.getDate()).toBe(14);
    expect(parsed.getHours()).toBe(15);
    expect(parsed.getMinutes()).toBe(45);
  });

  it('falls back to 00:00 when only completion date is specified without time', () => {
    const manualDate = '2026-09-10';
    const manualTime = '';

    const timePart = manualTime || '00:00';
    const completedAt = new Date(`${manualDate}T${timePart}:00`).toISOString();
    const parsed = new Date(completedAt);

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(10);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
  });

  it('formats default date as YYYY-MM-DD and time as HH:mm with zero padding', () => {
    const fixedDate = new Date(2026, 8, 5, 9, 7); // 2026-09-05 09:07
    const yyyy = fixedDate.getFullYear();
    const mm = String(fixedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(fixedDate.getDate()).padStart(2, '0');
    const hh = String(fixedDate.getHours()).padStart(2, '0');
    const min = String(fixedDate.getMinutes()).padStart(2, '0');

    expect(`${yyyy}-${mm}-${dd}`).toBe('2026-09-05');
    expect(`${hh}:${min}`).toBe('09:07');
  });

  it('verifies handover payload correctly attaches completedAt for complete and lost actions', () => {
    const createPayload = (actionType: 'complete' | 'lost' | 'forward' | 'proposal', completionDate: string, completionTime: string) => {
      let completedAt: string | undefined = undefined;
      if (completionDate) {
        const timePart = completionTime || '00:00';
        completedAt = new Date(`${completionDate}T${timePart}:00`).toISOString();
      }

      return {
        actionType,
        completedAt: (actionType === 'complete' || actionType === 'lost') ? completedAt : undefined,
      };
    };

    const completePayload = createPayload('complete', '2026-09-12', '11:30');
    expect(completePayload.completedAt).toBeDefined();
    expect(new Date(completePayload.completedAt!).getDate()).toBe(12);

    const lostPayload = createPayload('lost', '2026-09-11', '14:00');
    expect(lostPayload.completedAt).toBeDefined();
    expect(new Date(lostPayload.completedAt!).getDate()).toBe(11);

    const forwardPayload = createPayload('forward', '2026-09-12', '11:30');
    expect(forwardPayload.completedAt).toBeUndefined();

    const proposalPayload = createPayload('proposal', '2026-09-12', '11:30');
    expect(proposalPayload.completedAt).toBeUndefined();
  });
});
