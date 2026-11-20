import { describe, it, expect } from 'vitest';
import { mergeModuleServicesBySerial } from '../helpers';

describe('Global Service Serial Merger & History Preservation (mergeModuleServicesBySerial)', () => {
  it('deduplicates identical serial numbers into a single entry without data loss', () => {
    const directServices: any[] = [
      {
        licenseSerialNo: '715326102',
        product: 'TallyERP9 - Multi User',
        endDate: '2012-12-23',
        status: 'expired',
        vendorCategory: 'Welcome Tech',
      },
    ];

    const amcServices: any[] = [
      {
        licenseSerialNo: '715326102',
        product: 'TallyERP9 - Multi User',
        endDate: '2018-05-31',
        status: 'active',
        vendorCategory: 'Inox Qatar',
        notes: 'Renewed via AMC',
      },
    ];

    const result = mergeModuleServicesBySerial(directServices, amcServices);

    // Should collapse to 1 single display row
    expect(result).toHaveLength(1);

    const merged = result[0];
    // Active entry should have the newer date: 2018-05-31
    expect(merged.endDate).toBe('2018-05-31');
    expect(merged.licenseSerialNo).toBe('715326102');

    // Historical record 2012-12-23 MUST be preserved in renewalHistory
    expect(merged.renewalHistory).toBeDefined();
    expect(merged.renewalHistory?.length).toBe(1);
    expect(merged.renewalHistory?.[0].endDate).toBe('2012-12-23');
    expect(merged.renewalHistory?.[0].status).toBe('expired');
  });

  it('handles multiple historical records and orders them by date correctly', () => {
    const listA: any[] = [
      { licenseSerialNo: '725326101', endDate: '2024-12-31', status: 'active', renewalHistory: [{ endDate: '2022-12-31' }] },
    ];
    const listB: any[] = [
      { licenseSerialNo: '725326101', endDate: '2020-07-31', status: 'expired' },
      { licenseSerialNo: '725326101', endDate: '2015-01-01', status: 'expired' },
    ];

    const result = mergeModuleServicesBySerial(listA, listB);

    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.endDate).toBe('2024-12-31');

    // All 3 past dates must exist in renewalHistory
    const archivedEndDates = row.renewalHistory?.map((h: any) => h.endDate);
    expect(archivedEndDates).toContain('2022-12-31');
    expect(archivedEndDates).toContain('2020-07-31');
    expect(archivedEndDates).toContain('2015-01-01');
  });

  it('keeps entries with missing or empty serial numbers distinct', () => {
    const directServices: any[] = [
      { product: 'Cloud Hosting Basic', endDate: '2025-12-31' },
      { product: 'Cloud Hosting Dedicated', endDate: '2026-06-30' },
    ];
    const amcServices: any[] = [
      { product: 'Cloud Addon', endDate: '2025-08-31' },
    ];

    const result = mergeModuleServicesBySerial(directServices, amcServices);
    expect(result).toHaveLength(3);
  });

  it('merges secondary metadata (vendorCategory, notes, remarks) from superseded records', () => {
    const directServices: any[] = [
      {
        licenseSerialNo: '99887766',
        endDate: '2023-01-01',
        vendorCategory: 'Partner Alpha',
        notes: 'Initial purchase from Alpha',
      },
    ];
    const amcServices: any[] = [
      {
        licenseSerialNo: '99887766',
        endDate: '2026-01-01',
        product: 'TallyPrime Gold',
      },
    ];

    const result = mergeModuleServicesBySerial(directServices, amcServices);
    expect(result).toHaveLength(1);
    // Active date is 2026-01-01
    expect(result[0].endDate).toBe('2026-01-01');
    // Retained vendorCategory & notes from superseded record
    expect(result[0].vendorCategory).toBe('Partner Alpha');
    expect(result[0].notes).toBe('Initial purchase from Alpha');
  });

  it('WT0009 real-world scenario: exactly 4 licenses with historical TSS preserved', () => {
    const directServices: any[] = [
      { licenseSerialNo: '715326102', endDate: '2012-12-23', product: 'TallyERP9 - Multi User' },
      { licenseSerialNo: '725326101', endDate: '2024-12-31', product: 'TallyERP9 - Multi User' },
    ];

    const amcServices: any[] = [
      { licenseSerialNo: '715326102', endDate: '2018-05-31', product: 'TallyERP9 - Multi User' },
      { licenseSerialNo: '725326101', endDate: '2020-07-31', product: 'TallyERP9 - Multi User' },
      { licenseSerialNo: '725120703', endDate: '2016-12-31', product: 'TallyERP9 - Multi User' },
      { licenseSerialNo: '755326107', endDate: '2025-06-30', product: 'TallyERP9 - Single User' },
    ];

    const result = mergeModuleServicesBySerial(directServices, amcServices);

    expect(result).toHaveLength(4);
    const serials = result.map((r) => r.licenseSerialNo).sort();
    expect(serials).toEqual(['715326102', '725120703', '725326101', '755326107']);

    // Check 715326102
    const s715 = result.find((r) => r.licenseSerialNo === '715326102');
    expect(s715?.endDate).toBe('2018-05-31');
    expect(s715?.renewalHistory?.some((h: any) => h.endDate === '2012-12-23')).toBe(true);

    // Check 725326101
    const s725 = result.find((r) => r.licenseSerialNo === '725326101');
    expect(s725?.endDate).toBe('2024-12-31');
    expect(s725?.renewalHistory?.some((h: any) => h.endDate === '2020-07-31')).toBe(true);
  });
});
