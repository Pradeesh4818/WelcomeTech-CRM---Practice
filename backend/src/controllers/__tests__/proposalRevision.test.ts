import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateProposal } from '../crmController';
import { Proposal } from '../../models';

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

vi.mock('../../utils/mailer', () => ({
  sendProposalEmail: vi.fn(),
}));

describe('Proposal Revision & Alteration Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments revision to Rev 1 and records entry in revisionHistory when proposal is altered', async () => {
    const existingProposal: any = {
      _id: 'prop-123',
      proposalNo: 'WT-Q20260101',
      title: 'Initial Proposal',
      total: 5000,
      subtotal: 5000,
      discount: 0,
      revision: 0,
      revisionHistory: [],
    };

    (Proposal.findOne as any).mockResolvedValue(existingProposal);

    const updatedProposal: any = {
      ...existingProposal,
      revision: 1,
      total: 4500,
      discount: 10,
      revisionHistory: [
        {
          revision: 1,
          revisedAt: new Date(),
          reason: 'Client requested 10% discount',
          previousTotal: 5000,
          newTotal: 4500,
          revisedByName: 'Sales Agent',
        },
      ],
    };

    const mockChain: any = {};
    mockChain.populate = vi.fn().mockImplementation(() => mockChain);
    mockChain.then = (resolve: any) => Promise.resolve(updatedProposal).then(resolve);

    (Proposal.findOneAndUpdate as any).mockReturnValue(mockChain);

    const req: any = {
      params: { id: 'prop-123' },
      user: { _id: 'user-1', name: 'Sales Agent', role: 'admin' },
      body: {
        discount: 10,
        revisionReason: 'Client requested 10% discount',
        items: [{ description: 'Tally License', qty: 1, unitPrice: 5000, total: 5000 }],
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Proposal.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'prop-123' }),
      expect.objectContaining({
        revision: 1,
        revisionHistory: expect.arrayContaining([
          expect.objectContaining({
            revision: 1,
            reason: 'Client requested 10% discount',
            previousTotal: 5000,
            newTotal: 4500,
          }),
        ]),
      }),
      { new: true }
    );
  });

  it('does NOT increment revision if only status is updated (e.g. accepted)', async () => {
    const existingProposal: any = {
      _id: 'prop-456',
      proposalNo: 'WT-Q20260102',
      title: 'Quotation',
      total: 6000,
      revision: 1,
      revisionHistory: [{ revision: 1, reason: 'First edit' }],
    };

    (Proposal.findOne as any).mockResolvedValue(existingProposal);

    const mockChain: any = {};
    mockChain.populate = vi.fn().mockImplementation(() => mockChain);
    mockChain.then = (resolve: any) => Promise.resolve({ ...existingProposal, status: 'accepted' }).then(resolve);

    (Proposal.findOneAndUpdate as any).mockReturnValue(mockChain);

    const req: any = {
      params: { id: 'prop-456' },
      user: { _id: 'user-1', name: 'Admin', role: 'admin' },
      body: {
        status: 'accepted',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Verify that updates passed to findOneAndUpdate did NOT set revision: 2
    const updateCallArg = (Proposal.findOneAndUpdate as any).mock.calls[0][1];
    expect(updateCallArg.revision).toBeUndefined();
  });
});
