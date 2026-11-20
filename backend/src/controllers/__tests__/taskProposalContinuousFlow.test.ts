import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { sendDirectProposalEmail } from '../crmController';
import { Proposal, ProposalTemplate } from '../../models/index';
import { Settings } from '../../models/Settings';
import Customer from '../../models/Customer';
import { Lead } from '../../models/Lead';
import Task from '../../models/Task';
import { sendEmail } from '../../utils/mailer';
import {
  getAndIncrementNextProposalNo,
  syncProposalNoSequence,
  buildProposalNumber,
} from '../../utils/proposalSequence';

vi.mock('../../utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'test-msg-123' }),
}));

vi.mock('../../utils/htmlPdfGenerator', () => ({
  generateUnifiedProposalPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  cleanWordArtifacts: vi.fn((s) => s),
  normalizeColonTableToTabular: vi.fn((s) => s),
}));

vi.mock('../../utils/proposalSequence', () => ({
  getAndIncrementNextProposalNo: vi.fn().mockResolvedValue('WT-Q1005'),
  peekNextProposalNo: vi.fn().mockResolvedValue('WT-Q1005'),
  syncProposalNoSequence: vi.fn().mockResolvedValue(undefined),
  buildProposalNumber: vi.fn((no: string, incDate: boolean, d: any) => {
    if (!incDate) return no;
    const dateObj = new Date(d);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${no}/${day}-${month}-${year}`;
  }),
  stripDateSuffix: vi.fn((no: string) => (no ? no.replace(/\/\d{2}-\d{2}-\d{4}$/, '') : no)),
}));

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn().mockResolvedValue({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user@example.com',
      smtpPassword: 'password',
      proposalIncludeDate: true,
      proposalNo: 'WT-Q1001',
    }),
  },
}));

vi.mock('../../models/Customer', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../models/Lead', () => ({
  Lead: {
    findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../models/Task', () => ({
  default: {
    findById: vi.fn().mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      title: 'Sales Followup',
      taskType: 'proposal',
    }),
    findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('../../models/index', () => {
  const mockFind = vi.fn();
  const mockCountDocuments = vi.fn();
  const mockAggregate = vi.fn();
  const mockCreate = vi.fn();
  const mockFindByIdAndUpdate = vi.fn();
  const mockFindById = vi.fn();
  return {
    Proposal: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      aggregate: mockAggregate,
      create: mockCreate,
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
    },
    ProposalTemplate: {
      findById: vi.fn(),
      findOne: vi.fn(),
    },
    AMC: {
      findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    },
    Ticket: {},
    Payment: {},
    TicketFollowUp: {},
    TicketActivity: {},
  };
});

describe('Continuous Invoice Flow - Task Proposal Direct Send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Settings.findOne as any).mockResolvedValue({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user@example.com',
      smtpPassword: 'password',
      proposalIncludeDate: true,
      proposalNo: 'WT-Q1001',
    });
  });

  it('TC-FLOW-01: Reuses existing proposal ID from Task, updates proposalNo with date suffix, updates quoteDate and status', async () => {
    const existingProposalId = new mongoose.Types.ObjectId();
    const existingDoc: any = {
      _id: existingProposalId,
      proposalNo: 'WT-Q1002/20-10-2026',
      quoteDate: new Date('2026-10-20'),
      total: 2500,
      subtotal: 2500,
      discount: 0,
      items: [{ description: 'Existing Service', qty: 1, unitPrice: 2500, total: 2500 }],
      status: 'draft',
      sentAt: null,
    };

    (Proposal.findById as any).mockResolvedValue(existingDoc);

    const updatedProposalDoc: any = {
      ...existingDoc,
      proposalNo: 'WT-Q1002/23-10-2026',
      quoteDate: new Date('2026-10-23'),
      status: 'sent',
      sentAt: new Date(),
      populate: vi.fn().mockImplementation(() => Promise.resolve(updatedProposalDoc)),
    };
    const mockPopulateChain: any = {
      populate: vi.fn().mockReturnThis(),
    };
    mockPopulateChain.then = (onfulfilled: any, onrejected: any) =>
      Promise.resolve(updatedProposalDoc).then(onfulfilled, onrejected);

    (Proposal.findByIdAndUpdate as any).mockReturnValue(mockPopulateChain);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin User' },
      body: {
        id: existingProposalId.toString(),
        to: 'client@company.com',
        cc: 'sales@welcometech.qa',
        proposalNo: 'WT-Q1002',
        quoteDate: '2026-10-23',
        proposalType: 'Standard Quotation',
      },
      get: vi.fn().mockReturnValue(undefined),
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await sendDirectProposalEmail(req, res);

    expect(Proposal.findByIdAndUpdate).toHaveBeenCalledWith(
      existingProposalId.toString(),
      expect.objectContaining({
        status: 'sent',
        proposalNo: 'WT-Q1002/23-10-2026',
        quoteDate: new Date('2026-10-23'),
      }),
      expect.any(Object)
    );

    expect(syncProposalNoSequence).toHaveBeenCalledWith('WT-Q1002/23-10-2026');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Proposal email sent successfully',
      })
    );
  });

  it('TC-FLOW-02: Creates new proposal with continuous auto-sequenced proposalNo and user quoteDate when no existing proposal', async () => {
    const templateId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    const leadId = new mongoose.Types.ObjectId();

    (ProposalTemplate.findById as any).mockResolvedValue({
      _id: templateId,
      name: 'Tally Prime AMC',
      items: [{ description: 'Annual AMC', qty: 1, unitPrice: 3000, total: 3000 }],
    });

    const mockCreatedProposal: any = {
      _id: new mongoose.Types.ObjectId(),
      proposalNo: 'WT-Q1003/24-10-2026',
      quoteDate: new Date('2026-10-24'),
      status: 'sent',
      populate: vi.fn().mockImplementation(() => Promise.resolve(mockCreatedProposal)),
    };
    (Proposal.create as any).mockResolvedValue(mockCreatedProposal);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin User' },
      body: {
        to: 'director@enterprise.com',
        proposalNo: 'WT-Q1003',
        quoteDate: '2026-10-24',
        template: templateId.toString(),
        proposalType: 'Tally Prime AMC',
        task: taskId.toString(),
        lead: leadId.toString(),
      },
      get: vi.fn().mockReturnValue(undefined),
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await sendDirectProposalEmail(req, res);

    expect(Proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalNo: 'WT-Q1003/24-10-2026',
        quoteDate: new Date('2026-10-24'),
        task: taskId.toString(),
        lead: leadId.toString(),
        status: 'sent',
      })
    );

    expect(syncProposalNoSequence).toHaveBeenCalledWith('WT-Q1003/24-10-2026');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TC-FLOW-03: When proposalNo is omitted, auto-increments via getAndIncrementNextProposalNo using quoteDate', async () => {
    const templateId = new mongoose.Types.ObjectId();
    (ProposalTemplate.findById as any).mockResolvedValue({
      _id: templateId,
      name: 'Standard Quotation',
      items: [{ description: 'Consulting', qty: 1, unitPrice: 1000, total: 1000 }],
    });

    const mockCreatedProposal: any = {
      _id: new mongoose.Types.ObjectId(),
      proposalNo: 'WT-Q1005',
      quoteDate: new Date('2026-10-25'),
      populate: vi.fn().mockImplementation(() => Promise.resolve(mockCreatedProposal)),
    };
    (Proposal.create as any).mockResolvedValue(mockCreatedProposal);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      body: {
        to: 'client@domain.com',
        quoteDate: '2026-10-25',
        template: templateId.toString(),
        proposalType: 'Standard Quotation',
      },
      get: vi.fn().mockReturnValue(undefined),
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await sendDirectProposalEmail(req, res);

    expect(getAndIncrementNextProposalNo).toHaveBeenCalledWith(new Date('2026-10-25'));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
