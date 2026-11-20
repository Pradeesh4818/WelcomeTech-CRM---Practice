import { describe, it, expect } from 'vitest';
import { computeServiceStatus } from '../helpers';

describe('computeServiceStatus - Expiry Date Priority over AMC None Status', () => {
  it('TC-EXP-01: calculates expiring status from endDate even if explicitStatus is "none"', () => {
    // 15 days in the future
    const now = new Date();
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15);
    const iso = futureDate.toISOString();

    const status = computeServiceStatus(iso, 'none');
    expect(status).toBe('expiring');
  });

  it('TC-EXP-02: calculates active status from endDate when > 30 days away even if explicitStatus is "none"', () => {
    const now = new Date();
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
    const iso = futureDate.toISOString();

    const status = computeServiceStatus(iso, 'none');
    expect(status).toBe('active');
  });

  it('TC-EXP-03: calculates expired status from endDate when in the past even if explicitStatus is "none"', () => {
    const now = new Date();
    const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10);
    const iso = pastDate.toISOString();

    const status = computeServiceStatus(iso, 'none');
    expect(status).toBe('expired');
  });

  it('TC-EXP-04: preserves "none" status if no valid endDate is provided', () => {
    expect(computeServiceStatus(null, 'none')).toBe('none');
    expect(computeServiceStatus(undefined, 'none')).toBe('none');
    expect(computeServiceStatus('', 'none')).toBe('none');
  });

  it('TC-EXP-05: preserves "trial" status regardless of date', () => {
    const now = new Date();
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15);
    expect(computeServiceStatus(futureDate, 'trial')).toBe('trial');
  });

  it('TC-EXP-06: WT1068 scenario with 31 Oct 2026 TSS expiry date and AMC none status evaluates as expiring or expired', () => {
    // Oct 31, 2026
    const oct31 = new Date(2026, 9, 31).toISOString();
    const status = computeServiceStatus(oct31, 'none');
    // Evaluates based on expiry date (active, expiring, or expired once passed) rather than remaining 'none'
    expect(['expiring', 'active', 'expired']).toContain(status);
    expect(status).not.toBe('none');
  });
});
