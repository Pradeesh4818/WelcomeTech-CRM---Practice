import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendBulkTemplateEmails, sendBulkWhatsApp } from '../broadcastController';
import EmailTemplate from '../../models/EmailTemplate';
import { Settings } from '../../models/Settings';
import { ProposalTemplate } from '../../models';
import * as mailer from '../../utils/mailer';
import * as whatsappUtils from '../../utils/whatsapp';
import * as templatePdfGenerator from '../../utils/templatePdfGenerator';

vi.mock('../../models/EmailTemplate');
vi.mock('../../models/Settings');
vi.mock('../../models', () => ({
  ProposalTemplate: {
    findOne: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../../utils/mailer');
vi.mock('../../utils/whatsapp');
vi.mock('../../utils/templatePdfGenerator', () => ({
  generateTemplatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  buildTemplateEmailHtml: vi.fn().mockReturnValue('<html>mock email</html>'),
}));

describe('broadcastController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendBulkTemplateEmails', () => {
    it('returns 400 if templateId or recipients are missing', async () => {
      const req: any = { body: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkTemplateEmails(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 404 if email template is not found', async () => {
      vi.mocked(EmailTemplate.findById).mockResolvedValue(null);
      const req: any = {
        body: {
          templateId: 'nonexistent',
          recipients: [{ to: 'test@example.com' }],
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkTemplateEmails(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Email template not found' }));
    });

    it('successfully dispatches bulk emails with token replacement', async () => {
      const mockTemplate = {
        _id: 'tmpl123',
        subject: 'Renewal Notice for {{customerName}}',
        body: 'Dear {{customerName}}, your AMC expires on {{expiryDate}}.',
      };
      vi.mocked(EmailTemplate.findById).mockResolvedValue(mockTemplate as any);

      const mockSettings = {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user@example.com',
        smtpPassword: 'secretpassword',
        senderEmail: 'sales@welcometech.qa',
        mailFromName: 'Welcome Tech',
        mailEncryption: 'tls',
      };
      vi.mocked(Settings.findOne).mockResolvedValue(mockSettings as any);
      vi.mocked(mailer.sendEmail).mockResolvedValue(undefined as any);

      const req: any = {
        body: {
          templateId: 'tmpl123',
          recipients: [
            {
              to: 'client1@example.com',
              customerName: 'Acme Corp',
              dynamicData: { customerName: 'Acme Corp', expiryDate: '31-Dec-2026' },
            },
            {
              to: 'client2@example.com',
              customerName: 'Beta LLC',
              dynamicData: { customerName: 'Beta LLC', expiryDate: '15-Jan-2027' },
            },
          ],
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkTemplateEmails(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            sentCount: 2,
            failedCount: 0,
          }),
        })
      );
      expect(mailer.sendEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendBulkWhatsApp', () => {
    it('returns 400 if recipients list is empty', async () => {
      const req: any = { body: { recipients: [] } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkWhatsApp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 400 because WhatsApp API is statically disabled in backend', async () => {
      const req: any = {
        body: {
          recipients: [{ phone: '55512260', customerName: 'Acme' }],
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkWhatsApp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'WhatsApp Business API is statically disabled in the backend.',
        })
      );
    });

    it('rejects sending bulk WhatsApp templates even if settings are active', async () => {
      vi.mocked(Settings.findOne).mockResolvedValue({
        whatsappBusinessStatus: 'active',
        whatsappPhoneNumberId: '1265794996623686',
        whatsappAccessToken: 'mock_token',
        whatsappApiVersion: 'v23.0',
        country: 'QA',
      } as any);

      const req: any = {
        body: {
          messageType: 'template',
          templateName: 'acuity_cencelschedule_ter',
          languageCode: 'en_US',
          recipients: [
            { phone: '55512260', customerName: 'Client 1' },
            { phone: '66623371', customerName: 'Client 2' },
          ],
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await sendBulkWhatsApp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'WhatsApp Business API is statically disabled in the backend.',
        })
      );
      expect(whatsappUtils.sendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });
});
