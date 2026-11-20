import { describe, it, expect } from 'vitest';
import { Customer } from '../../types';

describe('Customer Group of Company Helpers & Filtering', () => {
  const getCustomerGroupList = (c: Partial<Customer>): string[] => {
    const explicit = (c.groupCompanies || [])
      .map((g) => g.name?.trim())
      .filter((n): n is string => Boolean(n));
    const legacyGroup = c.companyInfo?.groupOfCompany?.trim();
    const isLegacyValid =
      legacyGroup &&
      legacyGroup !== '—' &&
      legacyGroup.toUpperCase() !== 'NO' &&
      legacyGroup.toUpperCase() !== 'NONE';
    return explicit.length > 0 ? explicit : isLegacyValid ? [legacyGroup] : [];
  };

  it('correctly resolves single group from legacy companyInfo.groupOfCompany', () => {
    const customer: Partial<Customer> = {
      name: 'Al-Maha Subsidiary',
      companyInfo: {
        customerName: 'Al-Maha Subsidiary',
        groupOfCompany: 'AL MAHA GROUP HOLDING W.L.L',
      } as any,
    };
    const groups = getCustomerGroupList(customer);
    expect(groups).toEqual(['AL MAHA GROUP HOLDING W.L.L']);
  });

  it('correctly resolves multiple groups from groupCompanies array', () => {
    const customer: Partial<Customer> = {
      name: 'Enterprise Client',
      groupCompanies: [
        { name: 'Apex Holdings' },
        { name: 'Apex Technologies Ltd' },
      ],
    };
    const groups = getCustomerGroupList(customer);
    expect(groups).toEqual(['Apex Holdings', 'Apex Technologies Ltd']);
    expect(groups.length).toBe(2);
  });

  it('returns empty array when customer is not part of any group', () => {
    const customer: Partial<Customer> = {
      name: 'Individual Business',
      companyInfo: {
        customerName: 'Individual Business',
        groupOfCompany: 'NO',
      } as any,
      groupCompanies: [],
    };
    const groups = getCustomerGroupList(customer);
    expect(groups).toEqual([]);
  });

  it('filters customers by group filter option', () => {
    const customerList: Partial<Customer>[] = [
      { name: 'C1', companyInfo: { groupOfCompany: 'Group Alpha' } as any },
      { name: 'C2', groupCompanies: [{ name: 'Group Beta' }] },
      { name: 'C3', companyInfo: { groupOfCompany: 'NO' } as any },
    ];

    const groupOnly = customerList.filter((c) => getCustomerGroupList(c).length > 0);
    const nonGroup = customerList.filter((c) => getCustomerGroupList(c).length === 0);

    expect(groupOnly.length).toBe(2);
    expect(groupOnly.map((c) => c.name)).toEqual(['C1', 'C2']);
    expect(nonGroup.length).toBe(1);
    expect(nonGroup[0].name).toBe('C3');
  });
});
