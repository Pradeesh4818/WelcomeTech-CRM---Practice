import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateProposal, getProposal } from '../crmController';
import { Proposal } from '../../models';
import Customer from '../../models/Customer';

vi.mock('../../models', async () => {
  const actual: any = await vi.importActual('../../models');
  return {
    ...actual,
    Proposal: {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
  };
});

vi.mock('../../models/Customer', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../models/Counter', () => ({
  nextSequence: vi.fn().mockResolvedValue(10),
  highestExistingNumber: vi.fn().mockResolvedValue(9),
}));

vi.mock('../../utils/mailer', () => ({
  sendProposalEmail: vi.fn(),
}));

describe('Legacy Proposal Compatibility & Normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes legacy proposal in getProposal with fallback proposalNo, total, customerName, and blocks', async () => {
    const legacyDoc = {
      _id: 'leg-001',
      proposalId: 'PR-0009',
      customer: 'Al Emadi Trading W.L.L.',
      title: 'AMC Renewal Proposal 2026',
      amount: 1700,
      createdAt: new Date('2026-04-20'),
      toObject: function () {
        return {
          _id: this._id,
          proposalId: this.proposalId,
          customer: this.customer,
          title: this.title,
          amount: this.amount,
          createdAt: this.createdAt,
        };
      },
    };

    const mockChain: any = {};
    mockChain.populate = vi.fn().mockImplementation(() => mockChain);
    mockChain.then = (resolve: any) => Promise.resolve(legacyDoc).then(resolve);

    (Proposal.findOne as any).mockReturnValue(mockChain);

    const req: any = {
      params: { id: 'leg-001' },
      user: { _id: 'u-1', role: 'admin' },
    };

    let responseData: any = null;
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((data) => {
        responseData = data;
      }),
    };

    await getProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(responseData?.success).toBe(true);
    expect(responseData?.data?.proposalNo).toBe('PR-0009');
    expect(responseData?.data?.total).toBe(1700);
    expect(responseData?.data?.subtotal).toBe(1700);
    expect(responseData?.data?.customerName).toBe('Al Emadi Trading W.L.L.');
    expect(Array.isArray(responseData?.data?.items)).toBe(true);
    expect(responseData?.data?.items[0].description).toBe('AMC Renewal Proposal 2026');
    expect(Array.isArray(responseData?.data?.blocks)).toBe(true);
    expect(responseData?.data?.blocks[0].type).toBe('table');
  });

  it('backfills proposalNo and createdBy and extracts items from blocks when updating a legacy proposal', async () => {
    const existingLegacyProposal: any = {
      _id: 'leg-002',
      proposalId: 'PR-0008',
      title: 'TallyPrime Enterprise Upgrade',
      amount: 4500,
      customer: 'Qatar Pharma LLC',
      revision: 0,
      revisionHistory: [],
    };

    (Proposal.findOne as any).mockResolvedValue(existingLegacyProposal);
    (Customer.findOne as any).mockResolvedValue({
      _id: 'cust-qatar',
      name: 'Qatar Pharma LLC',
      phone: '+974 4400 0000',
      email: 'info@qpharma.qa',
    });

    let capturedUpdates: any = null;
    const updatedResult = {
      _id: 'leg-002',
      proposalNo: 'PR-0008',
      customer: 'cust-qatar',
      total: 4800,
    };

    const mockChain: any = {};
    mockChain.populate = vi.fn().mockImplementation(() => mockChain);
    mockChain.then = (resolve: any) => Promise.resolve(updatedResult).then(resolve);

    (Proposal.findOneAndUpdate as any).mockImplementation((_filter: any, updates: any) => {
      capturedUpdates = updates;
      return mockChain;
    });

    const req: any = {
      params: { id: 'leg-002' },
      user: { _id: 'u-admin', role: 'admin', name: 'Admin' },
      body: {
        title: 'TallyPrime Enterprise Upgrade (PR-0008)',
        customer: 'Qatar Pharma LLC',
        blocks: [
          {
            id: 'block-1',
            type: 'table',
            title: 'Services',
            items: [
              {
                id: 1,
                description: 'TallyPrime Server License',
                qty: 1,
                unitPrice: 4800,
              },
            ],
          },
        ],
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(capturedUpdates).toBeDefined();
    // proposalNo should be preserved/backfilled as PR-0008, not deleted
    expect(capturedUpdates.proposalNo).toBe('PR-0008');
    // createdBy should be backfilled from req.user._id
    expect(capturedUpdates.createdBy).toBe('u-admin');
    // customer string should be resolved to matched customer ObjectId
    expect(capturedUpdates.customer).toBe('cust-qatar');
    expect(capturedUpdates.customerName).toBe('Qatar Pharma LLC');
    // Line items should be extracted from blocks table
    expect(capturedUpdates.items).toBeDefined();
    expect(capturedUpdates.items[0].description).toBe('TallyPrime Server License');
    expect(capturedUpdates.total).toBe(4800);
    expect(capturedUpdates.amount).toBe(4800);
  });

  it('normalizes legacy documents in MongoDB collection via normalizeLegacyProposals', async () => {
    const { normalizeLegacyProposals } = await import('../../models/ProposalMigration');
    const mongoose = (await import('mongoose')).default;

    const legacyDoc = {
      _id: 'leg-mongo-1',
      proposalId: 'PR-0007',
      customer: 'Raw Customer Name',
      title: 'Legacy Title',
      amount: 2500,
    };

    let updatedDocId: any = null;
    let updatedFields: any = null;

    const mockProposalsCollection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([legacyDoc]),
      }),
      updateOne: vi.fn().mockImplementation((filter, update) => {
        updatedDocId = filter._id;
        updatedFields = update.$set;
        return Promise.resolve({ modifiedCount: 1 });
      }),
    };

    const mockCustomersCollection = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'cust-mongo-1',
        name: 'Raw Customer Name',
        phone: '+974 5555 5555',
        email: 'raw@customer.qa',
      }),
    };

    const mockUsersCollection = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'admin-mongo-1',
        role: 'admin',
      }),
    };

    const origCollection = mongoose.connection.collection;
    (mongoose.connection as any).collection = vi.fn().mockImplementation((name: string) => {
      if (name === 'proposals') return mockProposalsCollection;
      if (name === 'customers') return mockCustomersCollection;
      if (name === 'users') return mockUsersCollection;
      return {};
    });

    try {
      await normalizeLegacyProposals();

      expect(updatedDocId).toBe('leg-mongo-1');
      expect(updatedFields.proposalNo).toBe('PR-0007');
      expect(updatedFields.total).toBe(2500);
      expect(updatedFields.subtotal).toBe(2500);
      expect(updatedFields.customer).toBe('cust-mongo-1');
      expect(updatedFields.customerName).toBe('Raw Customer Name');
      expect(updatedFields.customerEmail).toBe('raw@customer.qa');
      expect(updatedFields.createdBy).toBe('admin-mongo-1');
      expect(Array.isArray(updatedFields.items)).toBe(true);
      expect(Array.isArray(updatedFields.blocks)).toBe(true);
    } finally {
      (mongoose.connection as any).collection = origCollection;
    }
  });
});
