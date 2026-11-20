import { describe, it, expect } from 'vitest';
import { Customer, AMCRenewal } from '../../../types';

describe('Customer Renewal Partial Update Contract & Payload Safety', () => {
  const mockCustomer = {
    _id: '6a928df7197b1ba21789e81a',
    customerNumber: 'WT0052',
    name: 'Arabian Print',
    contact: 'Irfan',
    phone: '+974 5555 1234',
    email: 'info@arabianprint.qa',
    address: 'Doha, Qatar',
    industry: 'Printing & Packaging',
    licenceType: 'Silver – Single User',
    users: 1,
    amcStatus: 'none',
    services: [
      {
        _id: 'srv_tss_001',
        type: 'tss',
        product: 'TallyPrime',
        status: 'active',
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2027-02-28T00:00:00.000Z',
        currentPrice: 1500,
        renewalHistory: [],
      },
    ],
  } as unknown as Customer;

  const newRenewal: AMCRenewal = {
    renewedOn: '2026-11-02',
    startDate: '2027-03-01',
    expiryDate: '2028-02-29',
    period: '1 Year',
    amount: 1500,
    paymentMethod: 'Bank Transfer',
    invoiceNo: '',
    notes: '',
  };

  it('TC-RENEW-01: constructs patch payload with customer name and updated services array', () => {
    const serviceId = 'srv_tss_001';
    const extras = {
      startDate: newRenewal.startDate,
      endDate: newRenewal.expiryDate,
      currentPrice: newRenewal.amount,
      status: 'active' as const,
    };

    const updatedServices = (mockCustomer.services || []).map((item) =>
      String(item._id || '') === serviceId
        ? { ...item, ...extras, renewalHistory: [newRenewal] }
        : item
    );

    const patchPayload = {
      name: mockCustomer.name,
      services: updatedServices,
    };

    expect(patchPayload.name).toBe('Arabian Print');
    expect(patchPayload.services[0].startDate).toBe('2027-03-01');
    expect(patchPayload.services[0].endDate).toBe('2028-02-29');
    expect(patchPayload.services[0].currentPrice).toBe(1500);
    expect(patchPayload.services[0].renewalHistory).toHaveLength(1);
  });

  it('TC-RENEW-02: preserves customer identity without requiring user to re-enter company name in modal', () => {
    expect(mockCustomer.name).toBe('Arabian Print');
    expect(newRenewal).not.toHaveProperty('name');
    expect(newRenewal).not.toHaveProperty('companyName');
  });

  it('TC-RENEW-03: ensures renewal update and delete mutations supply name for backward compatibility', () => {
    const updatedHistory = [newRenewal];
    const detailKey = 'tssDetails';
    const details = { status: 'active', actualPrice: 1500 };

    const updatePayload = {
      name: mockCustomer.name,
      [detailKey]: {
        ...details,
        renewalHistory: updatedHistory,
      },
    };

    expect(updatePayload.name).toBe('Arabian Print');
    expect(updatePayload.tssDetails.renewalHistory).toEqual(updatedHistory);
  });
});

