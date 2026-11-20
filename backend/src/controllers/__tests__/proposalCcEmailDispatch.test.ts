import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  buildProposalEmailHtml,
  sendDirectProposalEmail,
  updateProposal,
  createProposal,
} from '../crmController';
import { Proposal, ProposalTemplate } from '../../models/index';
import { Settings } from '../../models/Settings';
import Customer from '../../models/Customer';
import { Lead } from '../../models/Lead';
import Task from '../../models/Task';
import { sendEmail } from '../../utils/mailer';

vi.mock('../../utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-mail-cc-test' }),
}));

vi.mock('../../utils/htmlPdfGenerator', () => ({
  generateUnifiedProposalPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 Mock PDF')),
  cleanWordArtifacts: vi.fn((s) => s),
  normalizeColonTableToTabular: vi.fn((s) => s),
}));

vi.mock('../../utils/proposalSequence', () => ({
  getAndIncrementNextProposalNo: vi.fn().mockResolvedValue('PROP-1005'),
  peekNextProposalNo: vi.fn().mockResolvedValue('PROP-1005'),
  syncProposalNoSequence: vi.fn().mockResolvedValue(undefined),
  buildProposalNumber: vi.fn((no) => no),
  stripDateSuffix: vi.fn((no) => no),
}));

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
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
    findById: vi.fn().mockResolvedValue(null),
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

vi.mock('../../models/index', async () => {
  const actual: any = await vi.importActual('../../models/index');
  return {
    ...actual,
    Proposal: {
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOneAndUpdate: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
    ProposalTemplate: {
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
    },
  };
});

describe('Proposal CC Email Dispatch & Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSettings = {
    smtpHost: 'smtp.relay.welcometech.qa',
    smtpPort: 587,
    smtpUser: 'sales@welcometech.qa',
    smtpPassword: 'secretpassword',
    senderEmail: 'sales@welcometech.qa',
    companyName: 'Welcome Trading Co. W.L.L',
    brandColor: '#6d28d9',
    currency: 'QAR',
  };

  describe('buildProposalEmailHtml - CC Display Parity', () => {
    const proposal = {
      proposalNo: 'WT-Q1005',
      title: 'IT Infrastructure Setup',
      subtotal: 1000,
      total: 1000,
      discount: 0,
      items: [{ description: 'Network switch setup', qty: 1, unitPrice: 1000, total: 1000 }],
    };
    const entity = {
      name: 'Gulf Trading LLC',
      email: 'procurement@gulftrading.qa',
      phone: '+974 4400 1122',
      address: 'Doha, Qatar',
    };

    it('renders CC in recipient card when ccEmail string is supplied', () => {
      const html = buildProposalEmailHtml(
        proposal,
        entity,
        baseSettings,
        entity.email,
        '',
        undefined,
        [],
        true,
        undefined,
        'finance@gulftrading.qa, manager@gulftrading.qa'
      );

      expect(html).toContain('procurement@gulftrading.qa');
      expect(html).toContain('>CC<');
      expect(html).toContain('finance@gulftrading.qa, manager@gulftrading.qa');
    });

    it('renders CC in recipient card when ccEmail array is supplied', () => {
      const html = buildProposalEmailHtml(
        proposal,
        entity,
        baseSettings,
        entity.email,
        '',
        undefined,
        [],
        true,
        undefined,
        ['director@gulftrading.qa', 'auditor@gulftrading.qa']
      );

      expect(html).toContain('>CC<');
      expect(html).toContain('director@gulftrading.qa, auditor@gulftrading.qa');
    });

    it('falls back to proposal.cc if ccEmail argument is omitted', () => {
      const proposalWithCc = {
        ...proposal,
        cc: 'cfo@gulftrading.qa',
      };
      const html = buildProposalEmailHtml(
        proposalWithCc,
        entity,
        baseSettings,
        entity.email
      );

      expect(html).toContain('>CC<');
      expect(html).toContain('cfo@gulftrading.qa');
    });

    it('does not render CC table row if no CC is present', () => {
      const html = buildProposalEmailHtml(
        proposal,
        entity,
        baseSettings,
        entity.email
      );

      expect(html).not.toContain('>CC<');
    });
  });

  describe('sendDirectProposalEmail - Persist and Dispatch CC', () => {
    it('saves CC in Proposal.create and dispatches to CC via sendEmail for new proposals', async () => {
      (Settings.findOne as any).mockResolvedValue(baseSettings);

      const createdDoc: any = {
        _id: new mongoose.Types.ObjectId(),
        proposalNo: 'PROP-1005',
        title: 'New Service Proposal - Qatar Energy',
        customerEmail: 'primary@qatarenergy.qa',
        cc: 'dept-head@qatarenergy.qa, ops@qatarenergy.qa',
        items: [{ description: 'Consulting', qty: 1, unitPrice: 5000, total: 5000 }],
        subtotal: 5000,
        total: 5000,
        populate: vi.fn().mockImplementation(() => Promise.resolve(createdDoc)),
      };
      (Proposal.create as any).mockResolvedValue(createdDoc);

      const req: any = {
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Sales Exec' },
        body: {
          to: 'primary@qatarenergy.qa',
          cc: 'dept-head@qatarenergy.qa, ops@qatarenergy.qa',
          title: 'New Service Proposal - Qatar Energy',
          customerName: 'Qatar Energy',
          customerEmail: 'primary@qatarenergy.qa',
          items: [{ description: 'Consulting', qty: 1, unitPrice: 5000, total: 5000 }],
        },
        get: vi.fn().mockReturnValue('crm.welcometech.qa'),
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendDirectProposalEmail(req, res);

      // Verify CC was stored in Proposal document
      expect(Proposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerEmail: 'primary@qatarenergy.qa',
          cc: 'dept-head@qatarenergy.qa, ops@qatarenergy.qa',
          status: 'sent',
        })
      );

      // Verify sendEmail was called with CC
      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(Object),
        'primary@qatarenergy.qa',
        expect.any(String),
        expect.stringContaining('dept-head@qatarenergy.qa, ops@qatarenergy.qa'),
        undefined,
        'dept-head@qatarenergy.qa, ops@qatarenergy.qa',
        expect.any(Array)
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Proposal email sent successfully',
        })
      );
    });

    it('persists CC in Proposal.findByIdAndUpdate on revision/resend without stripping it', async () => {
      (Settings.findOne as any).mockResolvedValue(baseSettings);
      const existingId = new mongoose.Types.ObjectId().toString();

      const existingProposalDoc = {
        _id: new mongoose.Types.ObjectId(existingId),
        proposalNo: 'PROP-1002',
        sentAt: new Date('2026-10-01'),
        resendCount: 1,
        revision: 1,
        total: 3000,
        subtotal: 3000,
      };
      (Proposal.findById as any).mockResolvedValue(existingProposalDoc);

      const updatedProposalDoc: any = {
        ...existingProposalDoc,
        cc: 'partner@qatarenergy.qa',
        populate: vi.fn().mockImplementation(() => Promise.resolve(updatedProposalDoc)),
      };
      (Proposal.findByIdAndUpdate as any).mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockResolvedValue(updatedProposalDoc),
            }),
          }),
        }),
      });

      const req: any = {
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Sales Exec' },
        body: {
          id: existingId,
          to: 'primary@qatarenergy.qa',
          cc: 'partner@qatarenergy.qa',
          customerEmail: 'primary@qatarenergy.qa',
        },
        get: vi.fn().mockReturnValue('crm.welcometech.qa'),
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendDirectProposalEmail(req, res);

      // Verify updates object passed to findByIdAndUpdate has cc preserved!
      expect(Proposal.findByIdAndUpdate).toHaveBeenCalledWith(
        existingId,
        expect.objectContaining({
          cc: 'partner@qatarenergy.qa',
          status: 'sent',
          resendCount: 2,
        }),
        expect.any(Object)
      );

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(Object),
        'primary@qatarenergy.qa',
        expect.any(String),
        expect.any(String),
        undefined,
        'partner@qatarenergy.qa',
        expect.any(Array)
      );
    });
  });

  describe('updateProposal - Status sent dispatches with CC', () => {
    it('updates cc in database and passes cc to sendProposalEmail when status is sent', async () => {
      (Settings.findOne as any).mockResolvedValue(baseSettings);
      const existingId = new mongoose.Types.ObjectId().toString();

      const existingDoc = {
        _id: new mongoose.Types.ObjectId(existingId),
        proposalNo: 'PROP-1003',
        customer: new mongoose.Types.ObjectId(),
        total: 2000,
        subtotal: 2000,
        save: vi.fn().mockResolvedValue(true),
      };
      (Proposal.findOne as any).mockResolvedValue(existingDoc);

      const updatedDoc: any = {
        ...existingDoc,
        cc: 'cc-updated@client.com',
        customer: {
          name: 'Client Co',
          email: 'client@client.com',
        },
        populate: vi.fn().mockImplementation(() => Promise.resolve(updatedDoc)),
      };
      (Proposal.findOneAndUpdate as any).mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                populate: vi.fn().mockResolvedValue(updatedDoc),
              }),
            }),
          }),
        }),
      });

      const req: any = {
        params: { id: existingId },
        user: { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin' },
        body: {
          status: 'sent',
          customerEmail: 'client@client.com',
          cc: 'cc-updated@client.com',
        },
        get: vi.fn().mockReturnValue('crm.welcometech.qa'),
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateProposal(req, res);

      // Verify updates passed to findOneAndUpdate include cc
      expect(Proposal.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: existingId }),
        expect.objectContaining({
          status: 'sent',
          cc: 'cc-updated@client.com',
        }),
        expect.any(Object)
      );

      // Verify sendEmail was called with CC
      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(Object),
        'client@client.com',
        expect.any(String),
        expect.stringContaining('cc-updated@client.com'),
        undefined,
        'cc-updated@client.com',
        expect.any(Array)
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
