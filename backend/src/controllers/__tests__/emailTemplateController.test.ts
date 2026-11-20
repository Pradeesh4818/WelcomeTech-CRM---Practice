import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { createEmailTemplate, updateEmailTemplate, sendTemplateEmail } from '../emailTemplateController';
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

describe('emailTemplateController - Dynamic Header & Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createEmailTemplate successfully persists custom headerImage and footerImage', async () => {
    const mockCreated = {
      _id: new mongoose.Types.ObjectId(),
      name: 'AMC Notice with Banners',
      subject: 'Important Renewal Notice',
      body: '# Renewal Letter',
      headerImage: '/uploads/media/header_amc.png',
      footerImage: '/uploads/media/footer_amc.png',
    };
    (EmailTemplate.create as any).mockResolvedValue(mockCreated);

    const req: any = {
      body: {
        name: 'AMC Notice with Banners',
        subject: 'Important Renewal Notice',
        body: '# Renewal Letter',
        headerImage: '/uploads/media/header_amc.png',
        footerImage: '/uploads/media/footer_amc.png',
      },
      user: { _id: new mongoose.Types.ObjectId() },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await createEmailTemplate(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: mockCreated,
    }));
    expect(EmailTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      headerImage: '/uploads/media/header_amc.png',
      footerImage: '/uploads/media/footer_amc.png',
    }));
  });

  it('updateEmailTemplate handles headerImage and footerImage updates', async () => {
    const templateId = new mongoose.Types.ObjectId().toString();
    const mockUpdated = {
      _id: templateId,
      name: 'Updated Template',
      subject: 'Updated Subject',
      body: 'Updated Body',
      headerImage: '/uploads/custom-header.png',
      footerImage: '/uploads/custom-footer.png',
    };
    (EmailTemplate.findByIdAndUpdate as any).mockResolvedValue(mockUpdated);

    const req: any = {
      params: { id: templateId },
      body: {
        headerImage: '/uploads/custom-header.png',
        footerImage: '/uploads/custom-footer.png',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateEmailTemplate(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(EmailTemplate.findByIdAndUpdate).toHaveBeenCalledWith(
      templateId,
      expect.objectContaining({
        headerImage: '/uploads/custom-header.png',
        footerImage: '/uploads/custom-footer.png',
      }),
      { new: true }
    );
  });

  it('sendTemplateEmail applies the email template dynamic header and footer images to PDF and HTML', async () => {
    const templateId = new mongoose.Types.ObjectId().toString();
    const mockTemplate = {
      _id: templateId,
      name: 'Custom Banners Template',
      subject: 'Renewal Notice for {{org_name}}',
      body: 'Dear {{contact_person}},\nYour license {{product}} is due.',
      headerImage: '/uploads/banners/vip_header.png',
      footerImage: '/uploads/banners/vip_footer.png',
    };
    (EmailTemplate.findById as any).mockResolvedValue(mockTemplate);

    (Settings.findOne as any).mockResolvedValue({
      smtpHost: 'smtp.mail.com',
      smtpPort: 587,
      smtpUser: 'user@mail.com',
      smtpPassword: 'password123',
      senderEmail: 'billing@welcometech.qa',
      companyName: 'Welcome Trading Co. W.L.L',
    });

    (ProposalTemplate.findOne as any).mockResolvedValue({
      templateImage: '/uploads/default_header.png',
      templateFooterImage: '/uploads/default_footer.png',
    });

    const req: any = {
      body: {
        to: 'client@example.com',
        templateId,
        dynamicData: {
          org_name: 'Acme Corp',
          contact_person: 'John Doe',
          product: 'TallyPrime',
        },
      },
      user: { _id: new mongoose.Types.ObjectId() },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await sendTemplateEmail(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Verify PDF generator was passed the template's custom headerImage and footerImage
    expect(templatePdfGenerator.generateTemplatePdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        headerImage: '/uploads/banners/vip_header.png',
        footerImage: '/uploads/banners/vip_footer.png',
      })
    );

    // Verify HTML email builder received the custom header and footer
    expect(templatePdfGenerator.buildTemplateEmailHtml).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      '/uploads/banners/vip_header.png',
      '/uploads/banners/vip_footer.png'
    );

    // Verify mailer was called
    expect(mailer.sendEmail).toHaveBeenCalled();
  });
});
