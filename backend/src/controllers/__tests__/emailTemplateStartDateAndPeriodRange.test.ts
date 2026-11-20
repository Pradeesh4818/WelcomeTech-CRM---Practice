import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { deriveStartDate, sendTemplateEmail } from '../emailTemplateController';
import EmailTemplate from '../../models/EmailTemplate';
import { Settings } from '../../models/Settings';
import { ProposalTemplate } from '../../models';
import * as templatePdfGenerator from '../../utils/templatePdfGenerator';
import * as mailer from '../../utils/mailer';

vi.mock('../../models/EmailTemplate', () => {
  const mockModel: any = {
    find: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  };
  return {
    default: mockModel,
  };
});

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../models', () => ({
  ProposalTemplate: {
    findOne: vi.fn(),
  },
  AMC: {
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../models/Customer', () => ({
  default: {
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    findOne: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-mail-id' }),
}));

vi.mock('../../utils/templatePdfGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/templatePdfGenerator')>();
  return {
    ...actual,
    generateTemplatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-mock-binary')),
    buildTemplateEmailHtml: vi.fn().mockReturnValue('<html><body>Mock Email Content</body></html>'),
  };
});

describe('deriveStartDate', () => {
  it('correctly calculates 1-year prior subscription start date for DD/MM/YYYY', () => {
    expect(deriveStartDate('31/10/2026')).toBe('01/11/2025');
    expect(deriveStartDate('15/05/2027')).toBe('16/05/2026');
  });

  it('correctly calculates 1-year prior subscription start date for DD-MMM-YYYY and DD MMM YYYY', () => {
    expect(deriveStartDate('31-Oct-2026')).toBe('01-Nov-2025');
    expect(deriveStartDate('31 Oct 2026')).toBe('01 Nov 2025');
  });

  it('handles invalid or empty dates gracefully', () => {
    expect(deriveStartDate('')).toBe('—');
    expect(deriveStartDate('—')).toBe('—');
    expect(deriveStartDate('[DD/MM/YYYY]')).toBe('—');
    expect(deriveStartDate('invalid-date')).toBe('—');
  });
});

describe('sendTemplateEmail - Date Range and Start Date Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Settings.findOne as any).mockResolvedValue({
      smtpHost: 'smtp.mail.test',
      smtpUser: 'notify@welcometech.qa',
      smtpPassword: 'secretpassword',
      smtpPort: 587,
      smtpSecure: false,
      companyEmail: 'admin@welcometech.qa',
    });
    (ProposalTemplate.findOne as any).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      title: 'Standard Proposal',
      headerImage: 'uploads/header.png',
      footerImage: 'uploads/footer.png',
    });
  });

  it('correctly replaces [DD/MM/YYYY] to [DD/MM/YYYY] with start date and expiry date in body and subject', async () => {
    const mockTemplate = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Cloud Subscription Renewal',
      subject: 'Renewal: [DD/MM/YYYY] to [DD/MM/YYYY]',
      body: '<p>• Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]</p><p>Kindly confirm on or before [DD/MM/YYYY]</p>',
    };
    (EmailTemplate.findById as any).mockResolvedValue(mockTemplate);

    const req: any = {
      body: {
        to: 'client@example.com',
        templateId: mockTemplate._id.toString(),
        dynamicData: {
          customerName: 'Qatar National Cement',
          startDate: '01/11/2025',
          expiryDate: '31/10/2026',
        },
      },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await sendTemplateEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(templatePdfGenerator.generateTemplatePdfBuffer).toHaveBeenCalled();
    const pdfArg = (templatePdfGenerator.generateTemplatePdfBuffer as any).mock.calls[0][0];

    // Subject has range replaced
    expect(pdfArg.subject).toBe('Renewal: 01/11/2025 to 31/10/2026');
    // Body has first date as startDate, second as expiryDate, and standalone confirmation date as expiryDate
    expect(pdfArg.body).toContain('• Renewal Period: 01/11/2025 to 31/10/2026');
    expect(pdfArg.body).toContain('Kindly confirm on or before 31/10/2026');
    expect(pdfArg.body).not.toContain('Renewal Period: 31/10/2026 to 31/10/2026');
  });

  it('automatically derives start date when only expiry date is provided', async () => {
    const mockTemplate = {
      _id: new mongoose.Types.ObjectId(),
      name: 'TSS Renewal',
      subject: 'TSS Expiry Notice',
      body: '<p>• Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]</p><p>Valid until [DD/MM/YYYY]</p>',
    };
    (EmailTemplate.findById as any).mockResolvedValue(mockTemplate);

    const req: any = {
      body: {
        to: 'client@example.com',
        templateId: mockTemplate._id.toString(),
        dynamicData: {
          customerName: 'Al Rayyan Logistics',
          expiryDate: '31/10/2026',
        },
      },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await sendTemplateEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const pdfArg = (templatePdfGenerator.generateTemplatePdfBuffer as any).mock.calls[0][0];

    // Derived start date is 01/11/2025
    expect(pdfArg.body).toContain('• Renewal Period: 01/11/2025 to 31/10/2026');
    expect(pdfArg.body).toContain('Valid until 31/10/2026');
  });

  it('correctly replaces {{start_date}} and {{tss_expiry_date}} dynamic tokens', async () => {
    const mockTemplate = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Token Template',
      subject: 'Period: {{start_date}} - {{tss_expiry_date}}',
      body: '<p>Coverage begins {{start_date}} and expires {{tss_expiry_date}}.</p>',
    };
    (EmailTemplate.findById as any).mockResolvedValue(mockTemplate);

    const req: any = {
      body: {
        to: 'client@example.com',
        templateId: mockTemplate._id.toString(),
        dynamicData: {
          customerName: 'Apex Trading',
          startDate: '15/01/2026',
          tssExpiryDate: '14/01/2027',
        },
      },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await sendTemplateEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const pdfArg = (templatePdfGenerator.generateTemplatePdfBuffer as any).mock.calls[0][0];

    expect(pdfArg.subject).toBe('Period: 15/01/2026 - 14/01/2027');
    expect(pdfArg.body).toContain('Coverage begins 15/01/2026 and expires 14/01/2027.');
  });
});

