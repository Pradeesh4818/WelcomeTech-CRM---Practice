import { Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/auth';
import EmailTemplate from '../models/EmailTemplate';
import { Settings } from '../models/Settings';
import { ProposalTemplate, AMC } from '../models';
import Customer from '../models/Customer';
import { sendEmail } from '../utils/mailer';
import { generateTemplatePdfBuffer, buildTemplateEmailHtml } from '../utils/templatePdfGenerator';
import { ensureUploadDir } from '../config/storage';

export const getEmailTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await EmailTemplate.find().sort({ _id: 1 });
    res.status(200).json({ success: true, data: templates });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createEmailTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const createdBy = mongoose.isValidObjectId(userId) ? userId : undefined;
    const template = await EmailTemplate.create({
      ...req.body,
      headerImage: req.body.headerImage ?? req.body.templateImage ?? '',
      footerImage: req.body.footerImage ?? req.body.templateFooterImage ?? '',
      createdBy
    });
    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEmailTemplate = async (req: Request, res: Response) => {
  try {
    const updateData = { ...req.body };
    if (req.body.templateImage !== undefined && req.body.headerImage === undefined) {
      updateData.headerImage = req.body.templateImage;
    }
    if (req.body.templateFooterImage !== undefined && req.body.footerImage === undefined) {
      updateData.footerImage = req.body.templateFooterImage;
    }
    const template = await EmailTemplate.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.status(200).json({ success: true, data: template });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteEmailTemplate = async (req: Request, res: Response) => {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.status(200).json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const downloadTemplateEmailPdf = (req: Request, res: Response) => {
  const filename = path.basename(String(req.params.filename || ''));
  if (!/^[a-zA-Z0-9_.-]+\.pdf$/i.test(filename)) {
    return res.status(400).send('Invalid PDF filename');
  }

  const filePath = path.join(ensureUploadDir('documents'), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF not found');
  }

  res.download(filePath, filename);
};

const isTemplatePlaceholderValue = (value: unknown): boolean => {
  const text = String(value ?? '').trim();
  if (!text || text === '—') return true;
  return /^\[(?:x{4,}|DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD)\]$/i.test(text);
};

const firstTemplateValue = (...values: unknown[]): string => {
  for (const value of values) {
    if (isTemplatePlaceholderValue(value)) continue;
    return String(value).trim();
  }
  return '';
};

const formatTemplateDate = (...values: unknown[]): string => {
  const value = firstTemplateValue(...values);
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}|T\d{2}:/.test(value)) {
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return value;
};

export const deriveStartDate = (expiryStr: string): string => {
  if (!expiryStr || expiryStr === '—' || expiryStr.startsWith('[')) return '—';
  let d = new Date(expiryStr);
  if (isNaN(d.getTime()) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(expiryStr)) {
    const parts = expiryStr.split('/');
    d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  if (isNaN(d.getTime()) && /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(expiryStr)) {
    d = new Date(expiryStr.replace(/-/g, ' '));
  }
  if (isNaN(d.getTime())) return '—';
  const start = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(expiryStr)) {
    const day = String(start.getDate()).padStart(2, '0');
    const month = String(start.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${start.getFullYear()}`;
  }
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(expiryStr)) {
    const day = String(start.getDate()).padStart(2, '0');
    const month = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${day}-${month}-${start.getFullYear()}`;
  }
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(expiryStr)) {
    const day = String(start.getDate()).padStart(2, '0');
    const month = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${day} ${month} ${start.getFullYear()}`;
  }
  return start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const sendTemplateEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { to, cc, templateId, dynamicData } = req.body;

    if (!to || !templateId) {
      return res.status(400).json({ success: false, message: 'Recipient and template ID are required' });
    }
    const normalizeEmails = (value: unknown): string[] => {
      const raw = Array.isArray(value) ? value : String(value || '').split(',');
      return raw.map((item) => String(item || '').trim()).filter(Boolean);
    };
    const toList = normalizeEmails(to);
    const ccList = normalizeEmails(cc);
    if (!toList.length) {
      return res.status(400).json({ success: false, message: 'At least one recipient email is required' });
    }

    console.log(`[Email] Sending template ${templateId} to ${toList.join(', ')}`);

    // 1. Fetch Template
    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    // 2. Fetch SMTP Settings & Default Proposal Template
    const settings = await Settings.findOne();
    if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      return res.status(400).json({ success: false, message: 'SMTP settings are not configured. Please visit Settings > SMTP.' });
    }

    const defaultProposalTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});

    // 3. Interpolate Data
    let subject = template.subject;
    let rawBody = template.body;

    const customerId = firstTemplateValue(dynamicData?.customerId, dynamicData?._customerId);
    const templateCustomer = customerId && mongoose.isValidObjectId(customerId)
      ? await Customer.findById(customerId).lean()
      : null;
    const customerSerialInfo = Array.isArray((templateCustomer as any)?.serialNoInfo)
      ? (templateCustomer as any).serialNoInfo[0]
      : (templateCustomer as any)?.serialNoInfo;
    const customerService = Array.isArray((templateCustomer as any)?.services)
      ? (templateCustomer as any).services.find((service: any) => service?.type === 'tss' || service?.tssExpiryDate || service?.endDate || service?.licenseSerialNo)
      : null;

    const serialNo = firstTemplateValue(
      dynamicData?.serialNo,
      dynamicData?.serial_no,
      dynamicData?.licenseSerialNo,
      dynamicData?.licenceSerialNo,
      dynamicData?.reference,
      customerService?.licenseSerialNo,
      customerSerialInfo?.licenseSerialNo,
      customerSerialInfo?.licenses?.[0]?.licenceSerialNo,
      (templateCustomer as any)?.licenseSerialNo
    );
    const expiryDate = formatTemplateDate(
      dynamicData?.expiryDate,
      dynamicData?.expiry_date,
      dynamicData?.tssExpiryDate,
      dynamicData?.tss_expiry_date,
      dynamicData?.dueDate,
      dynamicData?.due_date,
      dynamicData?.endDate,
      dynamicData?.end_date,
      customerService?.tssExpiryDate,
      customerService?.endDate,
      customerSerialInfo?.tssExpiryDate,
      customerSerialInfo?.endDate,
      (templateCustomer as any)?.tssDetails?.tssExpiryDate,
      (templateCustomer as any)?.tssDetails?.endDate,
      (templateCustomer as any)?.amcDetails?.endDate,
      (templateCustomer as any)?.cloudDetails?.endDate,
      (templateCustomer as any)?.tdlDetails?.endDate
    );

    const rawStartDate = formatTemplateDate(
      dynamicData?.startDate,
      dynamicData?.start_date,
      dynamicData?.tssStartDate,
      dynamicData?.tss_start_date,
      dynamicData?.fromDate,
      dynamicData?.from_date,
      dynamicData?.serviceStartDate,
      dynamicData?.service_start_date,
      customerService?.startDate,
      customerSerialInfo?.startDate,
      (templateCustomer as any)?.tssDetails?.startDate,
      (templateCustomer as any)?.amcDetails?.startDate,
      (templateCustomer as any)?.cloudDetails?.startDate,
      (templateCustomer as any)?.tdlDetails?.startDate
    );
    const startDate = (rawStartDate && rawStartDate !== '—') ? rawStartDate : deriveStartDate(expiryDate);

    const normalizedData: Record<string, string> = {
      ...(dynamicData || {}),
      customerName: dynamicData?.customerName || dynamicData?.companyName || '',
      companyName: dynamicData?.companyName || dynamicData?.customerName || '',
      org_name: dynamicData?.org_name || dynamicData?.customerName || dynamicData?.companyName || '',
      company_name: dynamicData?.company_name || dynamicData?.customerName || dynamicData?.companyName || '',
      contactPerson: dynamicData?.contactPerson || dynamicData?.contact_person || dynamicData?.contactName || dynamicData?.contact_name || 'Valued Customer',
      contact_person: dynamicData?.contact_person || dynamicData?.contactPerson || dynamicData?.contactName || dynamicData?.contact_name || 'Valued Customer',
      contact_name: dynamicData?.contact_name || dynamicData?.contactPerson || dynamicData?.contact_person || dynamicData?.contactName || 'Valued Customer',
      product: dynamicData?.product || dynamicData?.productName || dynamicData?.serviceName || '',
      productName: dynamicData?.productName || dynamicData?.product || dynamicData?.serviceName || '',
      serviceName: dynamicData?.serviceName || dynamicData?.product || dynamicData?.productName || '',
      release: dynamicData?.release || dynamicData?.releaseVersion || '',
      releaseVersion: dynamicData?.releaseVersion || dynamicData?.release || '',
      serialNo,
      serial_no: serialNo,
      licenseSerialNo: serialNo,
      licenceSerialNo: serialNo,
      expiryDate,
      expiry_date: expiryDate,
      tssExpiryDate: expiryDate,
      tss_expiry_date: expiryDate,
      dueDate: firstTemplateValue(dynamicData?.dueDate, dynamicData?.due_date, expiryDate),
      due_date: firstTemplateValue(dynamicData?.due_date, dynamicData?.dueDate, expiryDate),
      startDate,
      start_date: startDate,
      tss_start_date: startDate,
      service_start_date: startDate,
      fromDate: startDate,
      from_date: startDate,
      endDate: firstTemplateValue(dynamicData?.endDate, dynamicData?.end_date, expiryDate),
      end_date: firstTemplateValue(dynamicData?.end_date, dynamicData?.endDate, expiryDate),
      toDate: firstTemplateValue(dynamicData?.endDate, dynamicData?.end_date, expiryDate),
      to_date: firstTemplateValue(dynamicData?.end_date, dynamicData?.endDate, expiryDate),
      phone: dynamicData?.phone || dynamicData?.mobile || '',
      mobile: dynamicData?.mobile || dynamicData?.phone || '',
      email: dynamicData?.email || dynamicData?.email_id || toList[0] || '',
      email_id: dynamicData?.email_id || dynamicData?.email || toList[0] || '',
    };

    // Standard {{key}} replacement
    Object.keys(normalizedData).forEach(key => {
      const value = normalizedData[key] || '';
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      rawBody = rawBody.replace(regex, value);
    });

    // Paired date range placeholders: e.g. "Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]", "from [DD/MM/YYYY] to [DD/MM/YYYY]"
    const startVal = normalizedData.startDate || '—';
    const expiryVal = normalizedData.expiryDate || normalizedData.dueDate || normalizedData.endDate || '—';

    const dateRangeRegex = /(from\s+)?(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])\s*(to|-|until|through|–|—)\s*(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi;
    subject = subject.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);
    rawBody = rawBody.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);

    // Standalone directional date placeholders
    subject = subject.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
    rawBody = rawBody.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
    subject = subject.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);
    rawBody = rawBody.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);

    // Bracketed [Placeholder] replacement (compatibility fallback)
    const serialVal = normalizedData.serialNo || '—';
    const replacements: Record<string, string> = {
      'Company Name': normalizedData.customerName,
      'Client Name': normalizedData.customerName || dynamicData?.clientName || '',
      'Client Organization': normalizedData.customerName,
      'Authorized Contact': normalizedData.contactPerson,
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
      'Amount': dynamicData?.amount || '',
      'Due Date': expiryVal,
      'Your Name': dynamicData?.senderName || '',
      'Designation': dynamicData?.designation || '',
      'Phone Number': normalizedData.phone,
      'Email Address': normalizedData.email,
    };

    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      subject = subject.replace(regex, value || '—');
      rawBody = rawBody.replace(regex, value || '—');
    });

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

    subject = subject.replace(/{{[^}]+}}/g, '—');
    rawBody = rawBody.replace(/{{[^}]+}}/g, '—');
    rawBody = rawBody.replace(/Dear\s*,/gi, 'Dear Valued Customer,');
    rawBody = rawBody.replace(/Dear\s*—\s*,/gi, 'Dear Valued Customer,');

    const customerName = normalizedData.customerName || 'Valued Customer';
    const emailAttachments: any[] = [];
    const backendOrigin = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/+$/, '');

    const cleanFilename = (subject || 'Official_Notice')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50);
    const pdfFilename = `${cleanFilename || 'Notice'}_${Date.now()}.pdf`;
    let pdfDownloadUrl = '';

    // Dynamic Header & Footer from Email Template or request overrides
    const templateHeader = req.body.headerImage || req.body.templateImage || template.headerImage || (template as any).templateImage || '';
    const templateFooter = req.body.footerImage || req.body.templateFooterImage || template.footerImage || (template as any).templateFooterImage || '';

    // 4. Generate Professional PDF Attachment (like Proposal) with Header/Footer
    try {
      const pdfBuffer = await generateTemplatePdfBuffer({
        subject,
        body: rawBody,
        customerName,
        contactPerson: normalizedData.contactPerson,
        phone: normalizedData.phone,
        email: normalizedData.email,
        product: normalizedData.product,
        serialNo: normalizedData.serialNo,
        release: normalizedData.release,
        startDate: normalizedData.startDate,
        expiryDate: normalizedData.expiryDate,
        amount: dynamicData?.amount,
        dynamicData: normalizedData,
        settings,
        defaultTemplate: defaultProposalTemplate,
        headerImage: templateHeader,
        footerImage: templateFooter,
      });

      const documentsDir = ensureUploadDir('documents');
      fs.writeFileSync(path.join(documentsDir, pdfFilename), pdfBuffer);
      pdfDownloadUrl = `${backendOrigin}/api/v1/public/email-template-pdfs/${encodeURIComponent(pdfFilename)}`;

      emailAttachments.push({
        filename: `${cleanFilename || 'Notice'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    } catch (pdfErr) {
      console.error('[Email] PDF generation error:', pdfErr);
    }

    // 5. Build short email body. The full content lives in the attached/downloadable PDF.
    const formattedHtml = buildTemplateEmailHtml(
      rawBody,
      subject,
      customerName,
      settings,
      defaultProposalTemplate,
      emailAttachments,
      backendOrigin,
      pdfDownloadUrl,
      normalizedData,
      templateHeader,
      templateFooter
    );

    // 6. Send Email with PDF Attachment and Inline Header/Footer Images
    await sendEmail({
      host: settings.smtpHost,
      port: Number(settings.smtpPort),
      user: settings.smtpUser,
      pass: settings.smtpPassword,
      secure: settings.mailEncryption === 'ssl',
      fromEmail: settings.senderEmail,
      fromName: settings.mailFromName || settings.companyName,
    }, toList, subject, formattedHtml, undefined, ccList.length ? ccList : undefined, emailAttachments);

    console.log(`[Email] Successfully sent email to ${toList.join(', ')} with PDF attachment (Subject: ${subject})`);

    // 7. Update Last Notified audit on AMC / Customer
    const now = new Date();
    const templateName = template.name || template.subject || 'Email Notice';
    try {
      let resolvedCustomerId = dynamicData?.customerId;
      let resolvedAmcId = dynamicData?.amcId;

      if (!resolvedCustomerId && !resolvedAmcId) {
        const matchCust = await Customer.findOne({
          $or: [
            { email: { $in: toList } },
            { 'primaryContactInfo.email': { $in: toList } },
            ...(dynamicData?.customerName ? [{ name: dynamicData.customerName }] : []),
          ],
        });
        if (matchCust) {
          resolvedCustomerId = matchCust._id;
        }
      }

      if (resolvedAmcId) {
        const amcDoc = await AMC.findByIdAndUpdate(resolvedAmcId, {
          lastNotifiedAt: now,
          lastNotifiedChannel: 'email',
          lastNotifiedTemplate: templateName,
        }, { new: true });
        if (amcDoc && amcDoc.customer && !resolvedCustomerId) {
          resolvedCustomerId = amcDoc.customer;
        }
      }

      if (resolvedCustomerId) {
        await Customer.findByIdAndUpdate(resolvedCustomerId, {
          lastNotifiedAt: now,
          lastNotifiedChannel: 'email',
          lastNotifiedTemplate: templateName,
          'amcDetails.lastNotifiedAt': now,
          'amcDetails.lastNotifiedChannel': 'email',
          'amcDetails.lastNotifiedTemplate': templateName,
          'tdlDetails.lastNotifiedAt': now,
          'tdlDetails.lastNotifiedChannel': 'email',
          'tdlDetails.lastNotifiedTemplate': templateName,
          'cloudDetails.lastNotifiedAt': now,
          'cloudDetails.lastNotifiedChannel': 'email',
          'cloudDetails.lastNotifiedTemplate': templateName,
          'tssDetails.lastNotifiedAt': now,
          'tssDetails.lastNotifiedChannel': 'email',
          'tssDetails.lastNotifiedTemplate': templateName,
        });

        await AMC.updateMany({ customer: resolvedCustomerId }, {
          lastNotifiedAt: now,
          lastNotifiedChannel: 'email',
          lastNotifiedTemplate: templateName,
        });
      }
    } catch (auditErr) {
      console.warn('[Email] Could not update lastNotified audit:', auditErr);
    }

    res.status(200).json({ success: true, message: 'Template email with PDF sent successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Failed to send email: ${error.message}` });
  }
};
