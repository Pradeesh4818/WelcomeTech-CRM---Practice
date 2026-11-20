import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomerLookup, getCustomers } from '../customerController';
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

describe('customerController - Lookup and Global List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCustomerLookup', () => {
    it('returns all active customers sorted alphabetically by name', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        collation: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          { _id: '1', name: 'Alpha Tech', contact: 'Alice' },
          { _id: '2', name: 'DREAM LAND INTERNATIONAL CLEANING CO', contact: 'Bob' },
        ]),
      };

      (Customer.find as any).mockReturnValue(mockChain);

      const req: any = { query: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCustomerLookup(req, res);

      expect(Customer.find).toHaveBeenCalledWith({ isActive: true });
      expect(mockChain.select).toHaveBeenCalledWith(
        'name contact email phone primaryContactInfo keyContacts companyInfo branchInfo branches address isActive products'
      );
      expect(mockChain.sort).toHaveBeenCalledWith({ name: 1 });
      expect(mockChain.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Alpha Tech' }),
          expect.objectContaining({ name: 'DREAM LAND INTERNATIONAL CLEANING CO' }),
        ]),
        total: 2,
      });
    });

    it('filters by search keyword when provided', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        collation: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          { _id: '2', name: 'DREAM LAND INTERNATIONAL CLEANING CO' },
        ]),
      };

      (Customer.find as any).mockReturnValue(mockChain);

      const req: any = { query: { search: 'dream' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCustomerLookup(req, res);

      expect(Customer.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          $or: expect.arrayContaining([
            expect.objectContaining({ name: expect.any(RegExp) }),
          ]),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          total: 1,
        })
      );
    });
  });

  describe('getCustomers in all / unpaginated mode', () => {
    it('returns unpaginated results when all=true is passed', async () => {
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        collation: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          { _id: '1', name: 'Company A' },
          { _id: '2', name: 'Company B' },
        ]),
      };

      (Customer.find as any).mockReturnValue(mockChain);

      const req: any = { query: { all: 'true', lookup: 'true' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Array),
        total: 2,
        page: 1,
        pages: 1,
      });
    });
  });
});
