import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { getProposals, sendDirectProposalEmail } from '../crmController';
import { Proposal, ProposalTemplate } from '../../models/index';
import { Settings } from '../../models/Settings';
import Customer from '../../models/Customer';
import { Lead } from '../../models/Lead';
import Task from '../../models/Task';
import { sendEmail } from '../../utils/mailer';

vi.mock('../../utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'test-123' }),
}));

vi.mock('../../utils/htmlPdfGenerator', () => ({
  generateUnifiedProposalPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  cleanWordArtifacts: vi.fn((s) => s),
  normalizeColonTableToTabular: vi.fn((s) => s),
}));

vi.mock('../../utils/proposalSequence', () => ({
  getAndIncrementNextProposalNo: vi.fn().mockResolvedValue('PROP-0099'),
  peekNextProposalNo: vi.fn().mockResolvedValue('PROP-0099'),
  syncProposalNoSequence: vi.fn().mockResolvedValue(undefined),
  buildProposalNumber: vi.fn((no) => no),
  stripDateSuffix: vi.fn((no) => no),
}));

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn(),
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
    findById: vi.fn().mockResolvedValue(null),
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
  return {
    Proposal: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      aggregate: mockAggregate,
      create: mockCreate,
      findById: vi.fn(),
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

describe('crmController - getProposals query filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters proposals specifically by task ObjectId when task param is supplied', async () => {
    const taskId = new mongoose.Types.ObjectId().toString();
    const mockChain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { _id: 'prop_1', proposalNo: 'PROP-001', task: taskId, status: 'sent' },
      ]),
    };
    (Proposal.find as any).mockReturnValue(mockChain);
    (Proposal.countDocuments as any).mockResolvedValue(1);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { task: taskId },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getProposals(req, res);

    expect(Proposal.find).toHaveBeenCalledWith(
      expect.objectContaining({
        task: new mongoose.Types.ObjectId(taskId),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ proposalNo: 'PROP-001' }),
        ]),
      })
    );
  });

  it('filters proposals specifically by lead ObjectId when lead param is supplied', async () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const mockChain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { _id: 'prop_2', proposalNo: 'PROP-002', lead: leadId, task: { taskNo: 'TASK-002' }, status: 'sent' },
      ]),
    };
    (Proposal.find as any).mockReturnValue(mockChain);
    (Proposal.countDocuments as any).mockResolvedValue(1);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { lead: leadId },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getProposals(req, res);

    expect(Proposal.find).toHaveBeenCalledWith(
      expect.objectContaining({
        lead: new mongoose.Types.ObjectId(leadId),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('crmController - sendDirectProposalEmail with template & CC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves template items, populates recipient and CC emails, and dispatches email', async () => {
    const templateId = new mongoose.Types.ObjectId().toString();
    const leadId = new mongoose.Types.ObjectId().toString();
    const taskId = new mongoose.Types.ObjectId().toString();

    (Settings.findOne as any).mockResolvedValue({
      smtpHost: 'smtp.mail.com',
      smtpPort: 587,
      smtpUser: 'user@mail.com',
      smtpPassword: 'password',
      senderEmail: 'sales@welcometech.qa',
      companyName: 'Welcome Trading Co. W.L.L',
    });

    const mockTemplate = {
      _id: new mongoose.Types.ObjectId(templateId),
      name: 'Tally on Cloud Service',
      title: 'Service Quotation Template',
      items: [
        { description: 'Cloud Setup', qty: 1, unitPrice: 1500, total: 1500 },
      ],
      discount: 0,
      validForDays: 14,
      terms: 'Standard Terms',
    };
    (ProposalTemplate.findById as any).mockResolvedValue(mockTemplate);

    const mockCreatedProposal: any = {
      _id: new mongoose.Types.ObjectId(),
      proposalNo: 'PROP-0099',
      title: 'Tally on Cloud Service - saba',
      customerEmail: 'client@company.com',
      items: mockTemplate.items,
      subtotal: 1500,
      total: 1500,
      lead: new mongoose.Types.ObjectId(leadId),
      task: new mongoose.Types.ObjectId(taskId),
      populate: vi.fn().mockImplementation(() => Promise.resolve(mockCreatedProposal)),
    };
    (Proposal.create as any).mockResolvedValue(mockCreatedProposal);

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Agent Admin' },
      body: {
        to: 'client@company.com',
        cc: 'cc1@company.com, cc2@company.com',
        template: templateId,
        templateName: 'Tally on Cloud Service',
        proposalType: 'Tally on Cloud Service',
        lead: leadId,
        task: taskId,
        customerEmail: 'client@company.com',
        customerName: 'saba',
        pdfBase64: 'data:application/pdf;base64,JVBERi0xLjQK',
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
        title: expect.stringContaining('Tally on Cloud Service'),
        items: expect.arrayContaining([
          expect.objectContaining({ description: 'Cloud Setup' }),
        ]),
        customerEmail: 'client@company.com',
      })
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.any(Object),
      'client@company.com',
      expect.any(String),
      expect.any(String),
      undefined,
      'cc1@company.com, cc2@company.com',
      expect.any(Array)
    );

    expect(Lead.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'Quotation Sent',
        proposalRequested: true,
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Proposal email sent successfully',
      })
    );
  });
});
