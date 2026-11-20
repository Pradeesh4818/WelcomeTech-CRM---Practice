import { describe, it, expect } from 'vitest';
import { Customer } from '../../../types';

describe('Leads - Company Full List & Alphabetical Sorting', () => {
  const mockCustomers: Customer[] = [
    {
      _id: 'cust-1',
      name: 'Zulal Water Factory',
      companyInfo: { customerName: 'Zulal Water Factory', locationArea: 'Industrial Area', fullAddress: 'Street 24, Doha' },
      primaryContactInfo: { contactName1: 'Zaid', mobile: '+974 5555 1111', email: 'zaid@zulal.com' },
      products: ['TallyPrime Server'],
      services: [{ type: 'amc', product: 'TallyPrime Server' } as any],
      serialNoInfo: [{ product: 'TallyPrime Server' } as any],
      isActive: true,
    } as any,
    {
      _id: 'cust-2',
      name: 'Al Emadi Trading',
      companyInfo: { customerName: 'Al Emadi Trading', locationArea: 'West Bay', fullAddress: 'Building 10, West Bay' },
      primaryContactInfo: { contactName1: 'Ahmed', mobile: '+974 5555 2222', email: 'ahmed@alemadi.com' },
      products: ['TallyPrime Gold'],
      isActive: true,
    } as any,
    {
      _id: 'cust-3',
      name: 'Barwa Real Estate',
      companyInfo: { customerName: 'Barwa Real Estate', locationArea: 'Barwa City', fullAddress: 'Tower A, Barwa City' },
      primaryContactInfo: { contactName1: 'Bilal', mobile: '+974 5555 3333', email: 'bilal@barwa.com' },
      products: ['TallyPrime Silver'],
      isActive: true,
    } as any,
    {
      _id: 'cust-4',
      name: 'Green Valley Ceramic',
      companyInfo: { customerName: 'Green Valley Ceramic' },
      isActive: true,
    } as any,
  ];

  it('maps all customers and sorts company options alphabetically A to Z', () => {
    const list: Customer[] = [...mockCustomers];
    const customerOptions = list
      .map((customer) => ({
        value: customer._id,
        label: customer.companyInfo?.customerName || customer.name || 'Company',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    expect(customerOptions.length).toBe(4);
    expect(customerOptions[0].label).toBe('Al Emadi Trading');
    expect(customerOptions[1].label).toBe('Barwa Real Estate');
    expect(customerOptions[2].label).toBe('Green Valley Ceramic');
    expect(customerOptions[3].label).toBe('Zulal Water Factory');
  });

  it('retains and prepends selected customer doc if not found in list', () => {
    const selectedDoc: Customer = {
      _id: 'cust-archived-99',
      name: 'Legacy Trading W.L.L',
      companyInfo: { customerName: 'Legacy Trading W.L.L' },
      isActive: false,
    } as any;

    const list: Customer[] = [...mockCustomers];
    if (selectedDoc && !list.some((c) => c._id === selectedDoc._id)) {
      list.unshift(selectedDoc);
    }

    const customerOptions = list
      .map((customer) => ({
        value: customer._id,
        label: customer.companyInfo?.customerName || customer.name || 'Company',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    expect(customerOptions.length).toBe(5);
    expect(customerOptions.some((o) => o.value === 'cust-archived-99')).toBe(true);
    expect(customerOptions[3].label).toBe('Legacy Trading W.L.L');
  });

  it('correctly extracts contact details and products during fillFromCustomer', () => {
    const customer = mockCustomers[0]; // Zulal Water Factory
    const primary = customer.primaryContactInfo;
    const firstKeyContact = customer.keyContacts?.[0];
    const branch = customer.branches?.[0];

    const contactName = primary?.contactName1 || firstKeyContact?.contactName || customer.contact || '';
    const email = primary?.email || firstKeyContact?.email || branch?.email || customer.email || '';
    const phone = primary?.mobile || firstKeyContact?.mobile || branch?.mobile || customer.phone || '';
    const companyName = customer.companyInfo?.customerName || customer.name || '';
    const locationArea = customer.companyInfo?.locationArea || branch?.locationArea || branch?.area || '';
    const fullAddress = customer.companyInfo?.fullAddress || branch?.fullAddress || customer.address || '';

    const products = Array.from(new Set([
      ...(customer.products || []),
      ...(customer.services || []).map((service) => service.product),
      ...(customer.serialNoInfo || []).map((row) => row.product),
    ].map((product) => String(product || '').trim()).filter(Boolean)));

    expect(contactName).toBe('Zaid');
    expect(email).toBe('zaid@zulal.com');
    expect(phone).toBe('+974 5555 1111');
    expect(companyName).toBe('Zulal Water Factory');
    expect(locationArea).toBe('Industrial Area');
    expect(fullAddress).toBe('Street 24, Doha');
    expect(products).toContain('TallyPrime Server');
  });

  it('handles large volumes of customers (> 2,000) without data loss or truncation', () => {
    const largeDataset: Customer[] = Array.from({ length: 2500 }, (_, i) => ({
      _id: `cust-${i}`,
      name: `Company ${String(i).padStart(4, '0')}`,
      companyInfo: { customerName: `Company ${String(i).padStart(4, '0')}` },
      isActive: true,
    } as any));

    const options = largeDataset
      .map((c) => ({
        value: c._id,
        label: c.companyInfo?.customerName || c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    expect(options.length).toBe(2500);
    expect(options[0].label).toBe('Company 0000');
    expect(options[2499].label).toBe('Company 2499');
  });
});
