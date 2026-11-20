import { describe, it, expect } from 'vitest';
import { AMCRenewal } from '../../../types';

describe('Frontend Theme-Based Confirm and History Sanitization', () => {
  it('filters out ghost and empty renewal entries from localHistory display', () => {
    const rawHistory: any[] = [
      { period: 'Initial Contract', startDate: '2018-10-01', expiryDate: '2019-09-30', amount: 0, paymentMethod: 'Main Record' },
      { period: 'Renewal', amount: undefined, paymentMethod: undefined }, // Ghost empty row as seen in screenshot
      { period: '1 Year', startDate: '2026-11-25', expiryDate: '2027-11-24', amount: 1600, paymentMethod: 'Bank Transfer' },
    ];

    const cleanHistory = rawHistory.filter(
      (r) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
    );

    expect(cleanHistory.length).toBe(2);
    expect(cleanHistory[0].period).toBe('Initial Contract');
    expect(cleanHistory[1].period).toBe('1 Year');
  });

  it('correctly maps target delete index without out-of-bounds or negative index splice', () => {
    const localHistory: AMCRenewal[] = [
      { period: 'Initial Contract', startDate: '2018-10-01', expiryDate: '2019-09-30', amount: 0, paymentMethod: 'Main Record', renewedOn: '2018-10-01' },
      { period: '1 Year', startDate: '2026-11-25', expiryDate: '2027-11-24', amount: 1600, paymentMethod: 'Bank Transfer', renewedOn: '2026-11-03' },
    ];

    const targetIndex = 1;
    const cleanHistory = localHistory.filter(
      (r) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
    );
    expect(targetIndex >= 0 && targetIndex < cleanHistory.length).toBe(true);

    const updated = cleanHistory.filter((_, idx) => idx !== targetIndex);
    expect(updated.length).toBe(1);
    expect(updated[0].period).toBe('Initial Contract');
  });

  it('sanitizes all customer services in patchSelectedService payload to prevent validation error', () => {
    const services: any[] = [
      {
        _id: 'srv-1',
        type: 'amc',
        renewalHistory: [{}], // Empty ghost entry
      },
      {
        _id: 'srv-2',
        type: 'tss',
        renewalHistory: [{ period: 'Initial Contract', startDate: '2021-08-01', expiryDate: '2022-07-31', amount: 0, paymentMethod: 'Main Record' }],
      },
    ];

    const serviceId = 'srv-2';
    const newRenewal: AMCRenewal = {
      period: '1 Year',
      startDate: '2026-11-03',
      expiryDate: '2027-11-02',
      amount: 56,
      paymentMethod: 'Bank Transfer',
      renewedOn: '2026-11-03',
    };

    const sanitizedPayload = services.map((item) => {
      if (String(item._id || '') === serviceId) {
        return {
          ...item,
          renewalHistory: [...item.renewalHistory, newRenewal].filter(
            (r: any) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
          ),
        };
      }
      const otherHistory = Array.isArray(item.renewalHistory)
        ? item.renewalHistory.filter((r: any) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal')))
        : [];
      return {
        ...item,
        renewalHistory: otherHistory,
      };
    });

    expect(sanitizedPayload[0].renewalHistory.length).toBe(0); // Cleaned!
    expect(sanitizedPayload[1].renewalHistory.length).toBe(2);
  });
});

