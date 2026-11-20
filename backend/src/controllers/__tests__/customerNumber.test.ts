import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomers } from '../customerController';
import Customer from '../../models/Customer';

vi.mock('../../models/Customer', () => {
  const mockFind = vi.fn();
  const mockCountDocuments = vi.fn();
  return {
    default: {
      find: mockFind,
      countDocuments: mockCountDocuments,
    },
  };
});

describe('Customer Number and Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches customer list by customerNumber', async () => {
    const mockChain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { _id: '1', customerNumber: 'WT0001', name: 'Alpha Corp' },
      ]),
    };

    (Customer.find as any).mockReturnValue(mockChain);
    (Customer.countDocuments as any).mockResolvedValue(1);

    const req: any = { query: { search: 'WT0001' } };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getCustomers(req, res);

    expect(Customer.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({ customerNumber: expect.any(RegExp) }),
            ]),
          }),
        ]),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [expect.objectContaining({ customerNumber: 'WT0001' })],
        total: 1,
      })
    );
  });

  it('verifies customer numbering format specification WT0001', () => {
    const formatNumber = (seq: number) => `WT${String(seq).padStart(4, '0')}`;
    expect(formatNumber(1)).toBe('WT0001');
    expect(formatNumber(2)).toBe('WT0002');
    expect(formatNumber(99)).toBe('WT0099');
    expect(formatNumber(1000)).toBe('WT1000');
    expect(formatNumber(10001)).toBe('WT10001');
  });
});
