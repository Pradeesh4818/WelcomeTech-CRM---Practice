import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import EmailTemplate from '../models/EmailTemplate';
import { Settings } from '../models/Settings';
import { ProposalTemplate, AMC } from '../models';
import Customer from '../models/Customer';
import { deriveStartDate } from './emailTemplateController';
import { sendEmail } from '../utils/mailer';
import { generateTemplatePdfBuffer, buildTemplateEmailHtml } from '../utils/templatePdfGenerator';
import {
  IS_WHATSAPP_STATICALLY_DISABLED,
  normalizeWhatsAppPhone,
  normalizeGraphApiVersion,
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  sendWhatsAppMessage,
} from '../utils/whatsapp';

export interface BulkEmailRecipient {
  id?: string;
  customerId?: string;
  to: string;
  cc?: string;
  customerName?: string;
  templateId?: string;
  dynamicData?: Record<string, string>;
}

export interface BulkWhatsAppRecipient {
  id?: string;
  customerId?: string;
  phone: string;
  customerName?: string;
  customMessage?: string;
  dynamicData?: Record<string, string>;
}

// Rewrites relative image src URLs to absolute public backend URLs so they
// render in Gmail, Outlook, and Apple Mail (which block non-absolute URLs).
const rewriteImageUrls = (html: string, backendOrigin: string): string => {
  return html.replace(
    /(<img\s[^>]*?src=)(["'])([^"']+)(["'])([^>]*>)/gi,
    (_match: string, pre: string, q1: string, src: string, q2: string, post: string) => {
      if (/^https?:\/\//i.test(src)) return `${pre}${q1}${src}${q2}${post}`;
      const normalized = src.startsWith('/') ? src : `/${src}`;
      const uploadMatch = normalized.replace(/\\/g, '/').match(/(?:^\/)(uploads\/.+)$/);
      const absoluteSrc = uploadMatch
        ? `${backendOrigin}/api/v1/${uploadMatch[1]}`
        : `${backendOrigin}${normalized}`;
      return `${pre}${q1}${absoluteSrc}${q2}${post}`;
    }
  );
};

// Table-based email template — maximum compatibility with Gmail, Outlook, Apple Mail
const formatEmailBody = (body: string, logoUrl?: string, backendOrigin?: string): string => {
  let html = body.replace(/\r\n/g, '\n');

  // Rewrite any relative img src in the raw body first
  if (backendOrigin) {
    html = rewriteImageUrls(html, backendOrigin);
  }

  // Only apply markdown transforms if NOT already a full HTML document
  const isFullHtml = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html);
  if (!isFullHtml) {
    html = html
      .replace(/^[ \t]*# (.*$)/gim, '<h1 style="color:#0f172a;font-size:26px;font-weight:800;margin:0 0 20px;padding-bottom:14px;border-bottom:2px solid #e2e8f0;">$1</h1>')
      .replace(/^[ \t]*## (.*$)/gim, '<h2 style="color:#1e293b;font-size:20px;font-weight:700;margin:24px 0 10px;">$1</h2>')
      .replace(/^[ \t]*### (.*$)/gim, '<h3 style="color:#334155;font-size:16px;font-weight:700;margin:18px 0 8px;">$1</h3>');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a;font-weight:700;">$1</strong>');

    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs
      .map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (/^<(h[1-6]|img|div|table|ul|ol|blockquote)/i.test(trimmed)) {
          return trimmed.replace(/\n/g, '<br />');
        }
        return `<p style="margin-bottom:18px;margin-top:0;line-height:1.75;color:#334155;font-size:16px;">${trimmed.replace(/\n/g, '<br />')}</p>`;
      })
      .join('\n');
  }

  const logoRow = logoUrl
    ? `<tr><td align="left" style="padding:40px 48px 24px 48px;">
        <img src="${logoUrl}" alt="Company Logo" width="80" height="80"
          style="width:80px;height:80px;object-fit:contain;display:block;border:0;outline:0;" />
       </td></tr>`
    : `<tr><td style="padding:28px 0 0 0;"></td></tr>`;

  const year = new Date().getFullYear();

  // Full DOCTYPE + MSO conditionals ensure Outlook renders correctly
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<title>Email Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        ${logoRow}
        <tr>
          <td style="padding:0 48px 40px 48px;">
            ${html}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
};

export const sendBulkTemplateEmails = async (req: AuthRequest, res: Response) => {
  try {
    const { templateId, recipients } = req.body as {
      templateId: string;
      recipients: BulkEmailRecipient[];
    };

    if (!templateId) {
      return res.status(400).json({ success: false, message: 'Template ID is required' });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one recipient is required' });
    }

    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    const settings = await Settings.findOne();
    if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      return res.status(400).json({ success: false, message: 'SMTP settings are not configured in Admin Settings.' });
    }

    // Determine the absolute public backend URL for resolving image paths
    const backendOrigin = (
      process.env.BACKEND_PUBLIC_URL ||
      process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 8080}`
    ).replace(/\/+$/, '');

    // Resolve logo URL to an absolute public URL
    let logoUrl: string | undefined = settings.logo;
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      const normalizedLogo = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
      const uploadMatch = normalizedLogo.replace(/\\/g, '/').match(/(?:^\/)(uploads\/.+)$/);
      logoUrl = uploadMatch
        ? `${backendOrigin}/api/v1/${uploadMatch[1]}`
        : `${backendOrigin}${normalizedLogo}`;
    }
    const defaultProposalTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});

    const templateCache = new Map<string, any>();
    templateCache.set(templateId, template);

    const results: Array<{ to: string; customerName?: string; success: boolean; error?: string }> = [];
    let sentCount = 0;
    let failedCount = 0;

    for (let idx = 0; idx < recipients.length; idx++) {
      const recipient = recipients[idx];
      const toEmail = String(recipient.to || '').trim().toLowerCase();

      if (!toEmail || !toEmail.includes('@') || !toEmail.includes('.')) {
        results.push({ to: toEmail, customerName: recipient.customerName, success: false, error: 'Invalid recipient email' });
        failedCount++;
        continue;
      }

      try {
        // Support per-row template override
        const targetTemplateId = recipient.templateId || templateId;
        let currentTemplate = templateCache.get(targetTemplateId);
        if (!currentTemplate) {
          currentTemplate = await EmailTemplate.findById(targetTemplateId);
          if (currentTemplate) templateCache.set(targetTemplateId, currentTemplate);
        }
        if (!currentTemplate) {
          results.push({ to: toEmail, customerName: recipient.customerName, success: false, error: `Template ${targetTemplateId} not found` });
          failedCount++;
          continue;
        }

        let subject = currentTemplate.subject || 'Welcome Tech CRM Notification';
        let rawBody = currentTemplate.body || '';

        const dyn = recipient.dynamicData || {};
        const normalizedData: Record<string, string> = {
          ...dyn,
          customerName: dyn.customerName || dyn.companyName || recipient.customerName || '',
          companyName: dyn.companyName || dyn.customerName || recipient.customerName || '',
          org_name: dyn.org_name || dyn.customerName || dyn.companyName || recipient.customerName || '',
          company_name: dyn.company_name || dyn.customerName || dyn.companyName || recipient.customerName || '',
          contactPerson: dyn.contactPerson || dyn.contact_person || dyn.contactName || dyn.contact_name || '',
          contact_person: dyn.contact_person || dyn.contactPerson || dyn.contactName || dyn.contact_name || '',
          contact_name: dyn.contact_name || dyn.contactPerson || dyn.contact_person || dyn.contactName || '',
          product: dyn.product || dyn.productName || dyn.serviceName || '',
          productName: dyn.productName || dyn.product || dyn.serviceName || '',
          serviceName: dyn.serviceName || dyn.product || dyn.productName || '',
          release: dyn.release || dyn.releaseVersion || '',
          releaseVersion: dyn.releaseVersion || dyn.release || '',
          serialNo: dyn.serialNo || dyn.serial_no || '',
          serial_no: dyn.serial_no || dyn.serialNo || '',
          expiryDate: dyn.expiryDate || dyn.expiry_date || dyn.tss_expiry_date || dyn.endDate || dyn.end_date || '',
          expiry_date: dyn.expiry_date || dyn.expiryDate || dyn.tss_expiry_date || dyn.endDate || dyn.end_date || '',
          tss_expiry_date: dyn.tss_expiry_date || dyn.expiryDate || dyn.expiry_date || dyn.endDate || dyn.end_date || '',
          dueDate: dyn.dueDate || dyn.due_date || dyn.expiryDate || dyn.expiry_date || '',
          due_date: dyn.due_date || dyn.dueDate || dyn.expiryDate || dyn.expiry_date || '',
          startDate: dyn.startDate || dyn.start_date || dyn.tssStartDate || dyn.tss_start_date || dyn.fromDate || dyn.from_date || '',
          start_date: dyn.start_date || dyn.startDate || dyn.tssStartDate || dyn.tss_start_date || dyn.fromDate || dyn.from_date || '',
          tss_start_date: dyn.start_date || dyn.startDate || dyn.tssStartDate || dyn.tss_start_date || '',
          service_start_date: dyn.start_date || dyn.startDate || dyn.tssStartDate || dyn.tss_start_date || '',
          fromDate: dyn.startDate || dyn.start_date || dyn.fromDate || dyn.from_date || '',
          from_date: dyn.startDate || dyn.start_date || dyn.fromDate || dyn.from_date || '',
          endDate: dyn.endDate || dyn.end_date || dyn.expiryDate || dyn.expiry_date || '',
          end_date: dyn.end_date || dyn.endDate || dyn.expiryDate || dyn.expiry_date || '',
          toDate: dyn.endDate || dyn.end_date || dyn.expiryDate || dyn.expiry_date || '',
          to_date: dyn.end_date || dyn.endDate || dyn.expiryDate || dyn.expiry_date || '',
          amount: dyn.amount || '',
          phone: dyn.phone || dyn.mobile || '',
          mobile: dyn.mobile || dyn.phone || '',
          email: dyn.email || dyn.email_id || toEmail,
          email_id: dyn.email_id || dyn.email || toEmail,
        };

        const expiryVal = normalizedData.expiryDate || normalizedData.dueDate || normalizedData.endDate || '—';
        const rawStart = normalizedData.startDate || '';
        const startVal = (rawStart && rawStart !== '—') ? rawStart : deriveStartDate(expiryVal);
        normalizedData.startDate = startVal;
        normalizedData.start_date = startVal;
        normalizedData.tss_start_date = startVal;
        normalizedData.service_start_date = startVal;
        normalizedData.fromDate = startVal;
        normalizedData.from_date = startVal;

        // Replace {{token}} placeholders
        Object.keys(normalizedData).forEach(key => {
          const value = normalizedData[key] || '';
          const regex = new RegExp(`{{${key}}}`, 'g');
          subject = subject.replace(regex, value);
          rawBody = rawBody.replace(regex, value);
        });

        // Paired date range placeholders: e.g. "Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]"
        const dateRangeRegex = /(from\s+)?(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])\s*(to|-|until|through|–|—)\s*(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi;
        subject = subject.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);
        rawBody = rawBody.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);

        // Standalone directional date placeholders
        subject = subject.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
        rawBody = rawBody.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
        subject = subject.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);
        rawBody = rawBody.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);

        // Replace [Bracketed Placeholder] fallbacks
        const serialVal = normalizedData.serialNo || '—';

        const replacements: Record<string, string> = {
          'Company Name': normalizedData.customerName,
          'Client Name': normalizedData.customerName,
          'Contact Person': normalizedData.contactPerson,
          'Product/Service Name': normalizedData.product,
          'Product Name': normalizedData.product,
          'Release': normalizedData.release,
          'Serial No': serialVal,
          'Serial Number': serialVal,
          'Start Date': startVal,
          'From Date': startVal,
          'Expiry Date': expiryVal,
          'TSS Expiry Date': expiryVal,
          'End Date': normalizedData.endDate || expiryVal,
          'To Date': normalizedData.endDate || expiryVal,
          'Due Date': expiryVal,
          'Amount': normalizedData.amount,
          'Phone Number': normalizedData.phone,
          'Email Address': normalizedData.email,
        };
        Object.entries(replacements).forEach(([key, value]) => {
          const regex = new RegExp(`\\[${key}\\]`, 'gi');
          subject = subject.replace(regex, value || '—');
          rawBody = rawBody.replace(regex, value || '—');
        });

        // Common format placeholders like [DD/MM/YYYY] and [xxxxxxxxx]
        subject = subject
          .replace(/\[x{4,}\]/gi, serialVal)
          .replace(/\[DD\/MM\/YYYY\]/gi, expiryVal)
          .replace(/\[MM\/DD\/YYYY\]/gi, expiryVal)
          .replace(/\[YYYY-MM-DD\]/gi, expiryVal)
          .replace(/\[Date\]/gi, expiryVal);

        rawBody = rawBody
          .replace(/\[x{4,}\]/gi, serialVal)
          .replace(/\[DD\/MM\/YYYY\]/gi, expiryVal)
          .replace(/\[MM\/DD\/YYYY\]/gi, expiryVal)
          .replace(/\[YYYY-MM-DD\]/gi, expiryVal)
          .replace(/\[Date\]/gi, expiryVal);

        // Clear any remaining unreplaced tokens
        subject = subject.replace(/{{[^}]+}}/g, '—');
        rawBody = rawBody.replace(/{{[^}]+}}/g, '—');
        rawBody = rawBody.replace(/Dear\s*,/gi, 'Dear Valued Customer,');
        rawBody = rawBody.replace(/Dear\s*—\s*,/gi, 'Dear Valued Customer,');

        const customerName = recipient.customerName || normalizedData.customerName || 'Valued Customer';
        const emailAttachments: any[] = [];
        const templateHeader = currentTemplate.headerImage || (currentTemplate as any).templateImage || '';
        const templateFooter = currentTemplate.footerImage || (currentTemplate as any).templateFooterImage || '';

        const formattedHtml = buildTemplateEmailHtml(
          rawBody,
          subject,
          customerName,
          settings,
          defaultProposalTemplate,
          undefined,
          backendOrigin,
          undefined,
          undefined,
          templateHeader,
          templateFooter
        );

        // Generate PDF attachment with Header/Footer banners
        try {
          const pdfBuffer = await generateTemplatePdfBuffer({
            subject,
            body: rawBody,
            customerName,
            contactPerson: normalizedData.contactPerson,
            phone: normalizedData.phone,
            email: toEmail,
            product: normalizedData.product,
            serialNo: normalizedData.serialNo,
            release: normalizedData.release,
            startDate: normalizedData.startDate,
            expiryDate: normalizedData.expiryDate,
            amount: normalizedData.amount,
            dynamicData: normalizedData,
            settings,
            defaultTemplate: defaultProposalTemplate,
            headerImage: templateHeader,
            footerImage: templateFooter,
          });

          const cleanFilename = (subject || 'Official_Notice')
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 50);

          emailAttachments.push({
            filename: `${cleanFilename || 'Notice'}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        } catch (pdfErr) {
          console.error('[Bulk Email] PDF generation error:', pdfErr);
        }

        const ccList = recipient.cc ? recipient.cc.split(',').map(c => c.trim()).filter(Boolean) : undefined;

        // Generate a unique Message-ID per recipient so that:
        // 1. SMTP servers do NOT deduplicate messages to the same address
        // 2. Gmail / Yahoo treat each send as a distinct email (not a thread duplicate)
        const uniqueToken = crypto.randomBytes(12).toString('hex');
        const senderDomain = (settings.senderEmail || settings.smtpUser || 'welcometech.crm').split('@')[1] || 'welcometech.crm';
        const messageId = `<${uniqueToken}.${Date.now()}@${senderDomain}>`;

        console.log(`[Bulk Email] [${idx + 1}/${recipients.length}] → ${toEmail} | Subject: "${subject}" | MsgID: ${messageId}`);

        await sendEmail(
          {
            host: settings.smtpHost!,
            port: Number(settings.smtpPort) || 587,
            user: settings.smtpUser!,
            pass: settings.smtpPassword!,
            secure: settings.mailEncryption === 'ssl',
            fromEmail: settings.senderEmail,
            fromName: settings.mailFromName || settings.companyName,
          },
          [toEmail],
          subject,
          formattedHtml,
          undefined,
          ccList,
          emailAttachments,
          messageId
        );

        console.log(`[Bulk Email] [${idx + 1}/${recipients.length}] ✓ Sent to ${toEmail} with PDF attachment`);
        results.push({ to: toEmail, customerName: recipient.customerName, success: true });
        sentCount++;

        // Update notification audit on AMC / Customer
        const now = new Date();
        const tName = currentTemplate?.name || currentTemplate?.subject || 'Bulk Email';
        try {
          if (recipient.id) {
            await AMC.findByIdAndUpdate(recipient.id, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'email',
              lastNotifiedTemplate: tName,
            });
            await Customer.findByIdAndUpdate(recipient.id, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'email',
              lastNotifiedTemplate: tName,
              'amcDetails.lastNotifiedAt': now,
              'amcDetails.lastNotifiedChannel': 'email',
              'amcDetails.lastNotifiedTemplate': tName,
              'tdlDetails.lastNotifiedAt': now,
              'tdlDetails.lastNotifiedChannel': 'email',
              'tdlDetails.lastNotifiedTemplate': tName,
              'cloudDetails.lastNotifiedAt': now,
              'cloudDetails.lastNotifiedChannel': 'email',
              'cloudDetails.lastNotifiedTemplate': tName,
              'tssDetails.lastNotifiedAt': now,
              'tssDetails.lastNotifiedChannel': 'email',
              'tssDetails.lastNotifiedTemplate': tName,
            });
          }
          if (recipient.customerId) {
            await Customer.findByIdAndUpdate(recipient.customerId, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'email',
              lastNotifiedTemplate: tName,
              'amcDetails.lastNotifiedAt': now,
              'amcDetails.lastNotifiedChannel': 'email',
              'amcDetails.lastNotifiedTemplate': tName,
              'tdlDetails.lastNotifiedAt': now,
              'tdlDetails.lastNotifiedChannel': 'email',
              'tdlDetails.lastNotifiedTemplate': tName,
              'cloudDetails.lastNotifiedAt': now,
              'cloudDetails.lastNotifiedChannel': 'email',
              'cloudDetails.lastNotifiedTemplate': tName,
              'tssDetails.lastNotifiedAt': now,
              'tssDetails.lastNotifiedChannel': 'email',
              'tssDetails.lastNotifiedTemplate': tName,
            });
          }
        } catch (auditErr) {
          console.warn('[Bulk Email] Failed to update notification audit:', auditErr);
        }

        // Small delay to avoid SMTP rate limiting
        if (idx < recipients.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (err: any) {
        console.error(`[Bulk Email] [${idx + 1}/${recipients.length}] ✗ Failed ${toEmail}:`, err?.message || err);
        results.push({ to: toEmail, customerName: recipient.customerName, success: false, error: err?.message || 'Send error' });
        failedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk email complete: ${sentCount} sent, ${failedCount} failed`,
      data: {
        total: recipients.length,
        sentCount,
        failedCount,
        results,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Bulk email error: ${error.message}` });
  }
};

export const sendBulkWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const {
      messageType = 'template',
      message,
      templateName,
      languageCode = 'en_US',
      recipients,
    } = req.body as {
      messageType: 'template' | 'text';
      message?: string;
      templateName?: string;
      languageCode?: string;
      recipients: BulkWhatsAppRecipient[];
    };

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one recipient is required' });
    }

    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      return res.status(400).json({ success: false, message: 'WhatsApp Business API is statically disabled in the backend.' });
    }

    const settings = await Settings.findOne();
    if (settings?.whatsappBusinessStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'WhatsApp Business API is inactive in Admin Settings.' });
    }

    const phoneNumberId = String(settings?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(settings?.whatsappAccessToken || '').trim();
    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ success: false, message: 'WhatsApp Phone Number ID and Access Token are required.' });
    }

    const apiVersion = normalizeGraphApiVersion(settings?.whatsappApiVersion);
    const resolvedTemplate = String(templateName || settings?.whatsappDefaultTemplateName || '').trim();
    const resolvedLanguage = String(languageCode || settings?.whatsappDefaultLanguageCode || 'en_US').trim();

    if (messageType === 'template' && !resolvedTemplate) {
      return res.status(400).json({ success: false, message: 'Template name is required for WhatsApp templates.' });
    }

    const results: Array<{ phone: string; customerName?: string; success: boolean; error?: string }> = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const rawPhone = recipient.phone || '';
      const normalizedPhone = normalizeWhatsAppPhone(rawPhone, settings?.country);

      if (!normalizedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
        results.push({ phone: rawPhone, customerName: recipient.customerName, success: false, error: 'Invalid phone number / country code' });
        failedCount++;
        continue;
      }

      try {
        let payload: Record<string, unknown>;

        if (messageType === 'template') {
          payload = buildWhatsAppTemplatePayload(normalizedPhone, resolvedTemplate, resolvedLanguage);
        } else {
          const bodyText = String(recipient.customMessage || message || '').trim();
          if (!bodyText) {
            results.push({ phone: normalizedPhone, customerName: recipient.customerName, success: false, error: 'Missing message body for text mode' });
            failedCount++;
            continue;
          }
          payload = buildWhatsAppTextPayload(normalizedPhone, bodyText);
        }

        await sendWhatsAppMessage({ apiVersion, phoneNumberId, accessToken, payload });
        results.push({ phone: normalizedPhone, customerName: recipient.customerName, success: true });
        sentCount++;

        // Update notification audit on AMC / Customer
        const now = new Date();
        const waTemplate = resolvedTemplate || 'WhatsApp Message';
        try {
          if (recipient.id) {
            await AMC.findByIdAndUpdate(recipient.id, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'whatsapp',
              lastNotifiedTemplate: waTemplate,
            });
            await Customer.findByIdAndUpdate(recipient.id, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'whatsapp',
              lastNotifiedTemplate: waTemplate,
              'amcDetails.lastNotifiedAt': now,
              'amcDetails.lastNotifiedChannel': 'whatsapp',
              'amcDetails.lastNotifiedTemplate': waTemplate,
              'tdlDetails.lastNotifiedAt': now,
              'tdlDetails.lastNotifiedChannel': 'whatsapp',
              'tdlDetails.lastNotifiedTemplate': waTemplate,
              'cloudDetails.lastNotifiedAt': now,
              'cloudDetails.lastNotifiedChannel': 'whatsapp',
              'cloudDetails.lastNotifiedTemplate': waTemplate,
              'tssDetails.lastNotifiedAt': now,
              'tssDetails.lastNotifiedChannel': 'whatsapp',
              'tssDetails.lastNotifiedTemplate': waTemplate,
            });
          }
          if (recipient.customerId) {
            await Customer.findByIdAndUpdate(recipient.customerId, {
              lastNotifiedAt: now,
              lastNotifiedChannel: 'whatsapp',
              lastNotifiedTemplate: waTemplate,
              'amcDetails.lastNotifiedAt': now,
              'amcDetails.lastNotifiedChannel': 'whatsapp',
              'amcDetails.lastNotifiedTemplate': waTemplate,
              'tdlDetails.lastNotifiedAt': now,
              'tdlDetails.lastNotifiedChannel': 'whatsapp',
              'tdlDetails.lastNotifiedTemplate': waTemplate,
              'cloudDetails.lastNotifiedAt': now,
              'cloudDetails.lastNotifiedChannel': 'whatsapp',
              'cloudDetails.lastNotifiedTemplate': waTemplate,
              'tssDetails.lastNotifiedAt': now,
              'tssDetails.lastNotifiedChannel': 'whatsapp',
              'tssDetails.lastNotifiedTemplate': waTemplate,
            });
          }
        } catch (auditErr) {
          console.warn('[Bulk WhatsApp] Failed to update notification audit:', auditErr);
        }
      } catch (err: any) {
        results.push({ phone: normalizedPhone, customerName: recipient.customerName, success: false, error: err?.message || 'WhatsApp dispatch failed' });
        failedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk WhatsApp complete: ${sentCount} sent, ${failedCount} failed`,
      data: { total: recipients.length, sentCount, failedCount, results },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Bulk WhatsApp error: ${error.message}` });
  }
};
