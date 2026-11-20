import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomers, updateCustomer } from '../customerController';
import Customer from '../../models/Customer';

vi.mock('../../models/Customer', () => {
  const mockFind = vi.fn();
  const mockFindOne = vi.fn();
  const mockFindById = vi.fn();
  const mockFindOneAndUpdate = vi.fn();
  const mockCountDocuments = vi.fn();
  return {
    default: {
      find: mockFind,
      findOne: mockFindOne,
      findById: mockFindById,
      findOneAndUpdate: mockFindOneAndUpdate,
      countDocuments: mockCountDocuments,
    },
  };
});

vi.mock('../../models/AMC', () => ({
  default: {
    updateMany: vi.fn().mockResolvedValue({}),
  },
}));

describe('Customer & Module Synchronization (TDL, TSS, Cloud)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('moduleType Query Filters', () => {
    it('queries TDL module including services with isTdl: true and tdlEnabled: true', async () => {
      const mockChain: any = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (Customer.find as any).mockReturnValue(mockChain);
      (Customer.countDocuments as any).mockResolvedValue(0);

      const req: any = { query: { moduleType: 'tdl' } };
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
                { services: { $elemMatch: { type: 'tdl', status: { $nin: ['none', 'expired'] } } } },
                { services: { $elemMatch: { isTdl: true } } },
                { services: { $elemMatch: { tdlEnabled: true } } },
                { 'serialNoInfo.tdlEnabled': true },
                { 'serialNoInfo.isTdl': true },
                { 'tdlDetails.status': 'active' },
              ]),
            }),
          ]),
        })
      );
    });

    it('queries TSS module including services with tssExpiryDate', async () => {
      const mockChain: any = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (Customer.find as any).mockReturnValue(mockChain);
      (Customer.countDocuments as any).mockResolvedValue(0);

      const req: any = { query: { moduleType: 'tss' } };
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
                { services: { $elemMatch: { type: 'tss', status: { $nin: ['none', 'expired'] } } } },
                { services: { $elemMatch: { tssExpiryDate: { $exists: true, $ne: null } } } },
                { 'serialNoInfo.tssExpiryDate': { $exists: true, $ne: null } },
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe('Bidirectional Updates', () => {
    it('automatically mirrors services -> tdlDetails when updating customer from customer edit', async () => {
      const updatedCustomer = {
        _id: 'cust-123',
        name: 'Tech Solutions LLC',
        services: [
          {
            type: 'tdl',
            status: 'active',
            licenseSerialNo: 'TDL-998877',
            product: 'TallyPrime Gold',
            currentPrice: 1500,
          },
        ],
      };

      (Customer.findOneAndUpdate as any).mockResolvedValue(updatedCustomer);

      const req: any = {
        params: { id: 'cust-123' },
        body: {
          name: 'Tech Solutions LLC',
          services: [
            {
              type: 'tdl',
              status: 'active',
              licenseSerialNo: 'TDL-998877',
              product: 'TallyPrime Gold',
              currentPrice: 1500,
            },
          ],
        },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateCustomer(req, res);

      expect(Customer.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'cust-123' },
        expect.objectContaining({
          tdlDetails: expect.objectContaining({
            status: 'active',
            licenseSerialNo: 'TDL-998877',
            currentPrice: 1500,
          }),
        }),
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('automatically mirrors tdlDetails -> services when saving directly from the TDL screen', async () => {
      const existingCustomer = {
        _id: 'cust-123',
        name: 'Tech Solutions LLC',
        services: [
          {
            type: 'amc',
            status: 'active',
            product: 'TallyPrime Gold',
          },
        ],
      };

      (Customer.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(existingCustomer),
        }),
      });

      (Customer.findOneAndUpdate as any).mockImplementation((_filter: any, payload: any) => {
        return Promise.resolve({ ...existingCustomer, ...payload });
      });

      const req: any = {
        params: { id: 'cust-123' },
        body: {
          tdlDetails: {
            status: 'active',
            licenseSerialNo: 'TDL-554433',
            product: 'TDL Add-on Pack',
            actualPrice: 800,
            currentPrice: 750,
          },
        },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateCustomer(req, res);

      expect(Customer.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'cust-123' },
        expect.objectContaining({
          services: expect.arrayContaining([
            expect.objectContaining({
              type: 'tdl',
              status: 'active',
              licenseSerialNo: 'TDL-554433',
              product: 'TDL Add-on Pack',
              currentPrice: 750,
            }),
          ]),
        }),
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('automatically mirrors cloudDetails -> services when saving directly from the Cloud screen', async () => {
      const existingCustomer = {
        _id: 'cust-456',
        name: 'Cloud Corp',
        services: [],
      };

      (Customer.findById as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(existingCustomer),
        }),
      });

      (Customer.findOneAndUpdate as any).mockImplementation((_filter: any, payload: any) => {
        return Promise.resolve({ ...existingCustomer, ...payload });
      });

      const req: any = {
        params: { id: 'cust-456' },
        body: {
          cloudDetails: {
            status: 'active',
            vendor: 'AWS',
            domainLinkSubId: 'app.cloudcorp.com',
            currentPrice: 3200,
          },
        },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateCustomer(req, res);

      expect(Customer.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'cust-456' },
        expect.objectContaining({
          services: expect.arrayContaining([
            expect.objectContaining({
              type: 'cloud',
              status: 'active',
              vendor: 'AWS',
              domainLinkSubId: 'app.cloudcorp.com',
              currentPrice: 3200,
            }),
          ]),
        }),
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
