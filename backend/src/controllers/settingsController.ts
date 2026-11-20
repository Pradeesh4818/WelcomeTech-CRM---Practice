import { Response } from 'express';
import crypto from 'crypto';
import { Settings } from '../models/Settings';
import { AuthRequest } from '../middleware/auth';
import { COUNTRY_PHONE_RULES, DEFAULT_COUNTRY, normalizePhone, toDigitsOnly, validatePhoneNumber } from '../utils/phoneValidation';
import { buildUploadUrl } from '../config/storage';
import { testSmtpConnection, sendTestEmail } from '../utils/mailer';
import {
  IS_WHATSAPP_STATICALLY_DISABLED,
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  normalizeGraphApiVersion,
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
} from '../utils/whatsapp';
import { peekNextProposalNo } from '../utils/proposalSequence';

// Server-side secrets that must never be sent back to the client. GET /settings
// returns them blanked (with a `<field>Set` boolean); PATCH /settings ignores
// blank values so a round-trip does not wipe a stored secret.
const SECRET_FIELDS = [
  'smtpPassword',
  'firebaseServerKey',
  'vpsPassword',
  'cloudinaryApiSecret',
  'razorpayKeySecret',
  'smsApiSecret',
  'whatsappAccessToken',
  'whatsappAppSecret',
  'whatsappWebhookVerifyToken',
] as const;

// Return a plain object with all secrets blanked and a `<field>Set` flag added.
const redactSecrets = (settings: any) => {
  const obj = typeof settings?.toObject === 'function' ? settings.toObject() : { ...settings };
  for (const field of SECRET_FIELDS) {
    obj[`${field}Set`] = Boolean(obj[field]);
    if (obj[field]) obj[field] = '';
  }
  return obj;
};

// Drop blank/undefined secret fields from an update payload so they are not
// overwritten with empty strings (blank means "keep the existing value").
const stripBlankSecrets = (payload: Record<string, any>): void => {
  for (const field of SECRET_FIELDS) {
    if (payload[field] === undefined) continue;
    if (typeof payload[field] !== 'string' || payload[field].trim() === '') {
      delete payload[field];
    }
  }
};

const getUploadedFile = (req: AuthRequest, field: string): Express.Multer.File | undefined => {
  if (req.file?.fieldname === field) return req.file;
  const files = req.files;
  if (!files || Array.isArray(files)) return undefined;
  return files[field]?.[0];
};

// @desc    Get settings
// @route   GET /api/v1/settings
// @access  Private/Admin
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    const data = redactSecrets(settings);
    if (data.theme === 'dark') {
      if (!data.sidebarColor || data.sidebarColor.toLowerCase() === '#ffffff' || data.sidebarColor.toLowerCase() === '#fff') {
        data.sidebarColor = '#0b1426';
      }
      if (!data.topbarColor || data.topbarColor.toLowerCase() === '#ffffff' || data.topbarColor.toLowerCase() === '#fff') {
        data.topbarColor = 'rgba(11, 20, 37, 0.88)';
      }
      if (!data.navbarColor || data.navbarColor.toLowerCase() === '#ffffff' || data.navbarColor.toLowerCase() === '#fff' || data.navbarColor.toLowerCase() === '#9a6851') {
        data.navbarColor = 'rgba(11, 20, 37, 0.9)';
      }
    } else {
      if (!data.navbarColor || data.navbarColor.toLowerCase() === '#9a6851') {
        data.navbarColor = '#ffffff';
      }
    }
    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      data.whatsappBusinessStatus = 'inactive';
    }
    if (!data.proposalNo) {
      data.proposalNo = 'WT-Q1001';
    }
    data.nextProposalNo = await peekNextProposalNo();
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

// @desc    Get public branding settings used before login
// @route   GET /api/v1/public/branding
// @access  Public
export const getPublicBranding = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne().select(
      'companyName logo proposalWatermark country theme brandColor secondaryColor sidebarColor topbarColor navbarColor appFont headingFont contentFont headingFontName headingFontUrl contentFontName contentFontUrl'
    );
    if (!settings) {
      settings = await Settings.create({});
    }

    const isDark = settings.theme === 'dark';
    const isLegacyBrown = (c?: string) => Boolean(c && (c.toLowerCase() === '#9a6851' || c.toLowerCase() === '#9c674a'));
    const sidebarColor = isDark && (!settings.sidebarColor || settings.sidebarColor.toLowerCase() === '#ffffff' || settings.sidebarColor.toLowerCase() === '#fff')
      ? '#0b1426'
      : settings.sidebarColor;
    const topbarColor = isDark && (!settings.topbarColor || settings.topbarColor.toLowerCase() === '#ffffff' || settings.topbarColor.toLowerCase() === '#fff')
      ? 'rgba(11, 20, 37, 0.88)'
      : settings.topbarColor;
    const navbarColor = isDark
      ? ((!settings.navbarColor || settings.navbarColor.toLowerCase() === '#ffffff' || settings.navbarColor.toLowerCase() === '#fff' || isLegacyBrown(settings.navbarColor))
        ? 'rgba(11, 20, 37, 0.9)'
        : settings.navbarColor)
      : (isLegacyBrown(settings.navbarColor) || !settings.navbarColor ? '#ffffff' : settings.navbarColor);

    res.status(200).json({
      success: true,
      data: {
        companyName: settings.companyName,
        logo: settings.logo || '',
        proposalWatermark: settings.proposalWatermark || '',
        country: settings.country,
        theme: settings.theme,
        brandColor: settings.brandColor,
        secondaryColor: settings.secondaryColor || '#a855f7',
        sidebarColor,
        topbarColor,
        navbarColor,
        appFont: settings.appFont,
        headingFont: settings.headingFont,
        contentFont: settings.contentFont,
        headingFontName: settings.headingFontName || '',
        headingFontUrl: settings.headingFontUrl || '',
        contentFontName: settings.contentFontName || '',
        contentFontUrl: settings.contentFontUrl || '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

// @desc    Update settings
// @route   PATCH /api/v1/settings
// @access  Private/Admin
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = { ...req.body };
    // A blank secret means "keep existing" (the client never receives real secrets).
    stripBlankSecrets(payload);
    const logoFile = getUploadedFile(req, 'logo');
    const proposalWatermarkFile = getUploadedFile(req, 'proposalWatermark');
    const headingFontFile = getUploadedFile(req, 'headingFontFile');
    const contentFontFile = getUploadedFile(req, 'contentFontFile');

    // Prevent bad multipart/body values (e.g. logo: {}) from failing schema cast.
    if (!logoFile && typeof payload.logo !== 'string') {
      delete payload.logo;
    }

    if (!proposalWatermarkFile && typeof payload.proposalWatermark !== 'string') {
      delete payload.proposalWatermark;
    }


    if (payload.country && !COUNTRY_PHONE_RULES[payload.country]) {
        // Optional: you could return an error here if the country is invalid
        // or just let the model validation handle it. 
        // Let's keep it safe.
    }

    if (typeof payload.companyPhone === 'string' && payload.companyPhone.trim()) {
      if (!validatePhoneNumber(payload.companyPhone)) {
        res.status(400).json({
          success: false,
          message: `Invalid company phone format or length for the provided country code.`,
        });
        return;
      }
      payload.companyPhone = normalizePhone(payload.companyPhone);
    }

    if (payload.googleMapsDefaultCenterLat !== undefined) {
      const lat = Number(payload.googleMapsDefaultCenterLat);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        res.status(400).json({ success: false, message: 'Google Maps default latitude must be between -90 and 90.' });
        return;
      }
      payload.googleMapsDefaultCenterLat = lat;
    }

    if (payload.googleMapsDefaultCenterLng !== undefined) {
      const lng = Number(payload.googleMapsDefaultCenterLng);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        res.status(400).json({ success: false, message: 'Google Maps default longitude must be between -180 and 180.' });
        return;
      }
      payload.googleMapsDefaultCenterLng = lng;
    }

    if (payload.googleMapsDefaultZoom !== undefined) {
      const zoom = Number(payload.googleMapsDefaultZoom);
      if (!Number.isFinite(zoom) || zoom < 1 || zoom > 22) {
        res.status(400).json({ success: false, message: 'Google Maps default zoom must be between 1 and 22.' });
        return;
      }
      payload.googleMapsDefaultZoom = zoom;
    }

    if (payload.whatsappApiVersion !== undefined) {
      payload.whatsappApiVersion = normalizeGraphApiVersion(payload.whatsappApiVersion);
    }

    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      payload.whatsappBusinessStatus = 'inactive';
    } else if (payload.whatsappBusinessStatus !== undefined && !['active', 'inactive'].includes(payload.whatsappBusinessStatus)) {
      res.status(400).json({ success: false, message: 'WhatsApp Business status must be active or inactive.' });
      return;
    }
    
    // Handle logo upload
    if (logoFile) {
      payload.logo = buildUploadUrl('settings', logoFile.filename);
    }

    if (proposalWatermarkFile) {
      payload.proposalWatermark = buildUploadUrl('settings', proposalWatermarkFile.filename);
    }

    if (headingFontFile) {
      payload.headingFont = 'custom';
      payload.headingFontName = payload.headingFontName || headingFontFile.originalname.replace(/\.[^.]+$/, '');
      payload.headingFontUrl = buildUploadUrl('settings', headingFontFile.filename);
    }

    if (contentFontFile) {
      payload.contentFont = 'custom';
      payload.contentFontName = payload.contentFontName || contentFontFile.originalname.replace(/\.[^.]+$/, '');
      payload.contentFontUrl = buildUploadUrl('settings', contentFontFile.filename);
    }

    if (payload.proposalNo !== undefined) {
      if (typeof payload.proposalNo === 'string') {
        const cleanStartingNo = payload.proposalNo.trim() || 'WT-Q1001';
        payload.proposalNo = cleanStartingNo;
        payload.proposalCurrentSeq = cleanStartingNo;
      }
    }
    if (payload.proposalIncludeDate !== undefined) {
      payload.proposalIncludeDate = payload.proposalIncludeDate === true || payload.proposalIncludeDate === 'true';
    }

    // Atomic upsert avoids a race where two concurrent first-time saves each
    // find no document and both create one (duplicate Settings docs).
    const settings = await Settings.findOneAndUpdate({}, payload, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });

    res.status(200).json({ success: true, data: redactSecrets(settings) });
  } catch (err: any) {
    const isValidationError = err?.name === 'ValidationError' || err?.name === 'CastError';
    const status = isValidationError ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Server error' });
  }
};

// @desc    Get current proposal number setting (Read)
// @route   GET /api/v1/settings/proposal-no
// @access  Private
export const getProposalNoSetting = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await Settings.findOne();
    const startingNo = settings?.proposalNo?.trim() || 'WT-Q1001';
    const nextNo = await peekNextProposalNo();
    const includeDate = Boolean(settings?.proposalIncludeDate);
    res.status(200).json({
      success: true,
      data: {
        proposalNo: startingNo,
        startingProposalNo: startingNo,
        nextProposalNo: nextNo,
        proposalIncludeDate: includeDate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

// @desc    Update proposal number setting (Update)
// @route   PATCH /api/v1/settings/proposal-no
// @access  Private/Admin
export const updateProposalNoSetting = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const raw = req.body.proposalNo;
    const cleanNo = typeof raw === 'string' && raw.trim() ? raw.trim() : 'WT-Q1001';
    const updatePayload: Record<string, any> = {
      proposalNo: cleanNo,
      proposalCurrentSeq: cleanNo,
    };
    if (req.body.proposalIncludeDate !== undefined) {
      updatePayload.proposalIncludeDate = req.body.proposalIncludeDate === true || req.body.proposalIncludeDate === 'true';
    }
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: updatePayload },
      { new: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      data: {
        proposalNo: settings.proposalNo,
        startingProposalNo: settings.proposalNo,
        proposalIncludeDate: settings.proposalIncludeDate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update proposal number' });
  }
};

// @desc    Reset proposal number setting to default (Delete/Reset)
// @route   DELETE /api/v1/settings/proposal-no
// @access  Private/Admin
export const resetProposalNoSetting = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const defaultNo = 'WT-Q1001';
    const settings = await Settings.findOneAndUpdate(
      {},
      {
        $set: {
          proposalNo: defaultNo,
          proposalCurrentSeq: defaultNo,
          proposalIncludeDate: false,
        },
      },
      { new: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Proposal number reset to default successfully',
      data: {
        proposalNo: settings.proposalNo,
        startingProposalNo: settings.proposalNo,
        proposalIncludeDate: settings.proposalIncludeDate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to reset proposal number' });
  }
};

// @desc    Verify WhatsApp webhook
// @route   GET /api/v1/webhooks/whatsapp
// @access  Public
export const verifyWhatsappWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const challenge = req.query['hub.challenge'] || req.query['challenge'] || req.query['hub_challenge'];
    const mode = String(req.query['hub.mode'] || req.query['mode'] || '');
    const token = String(req.query['hub.verify_token'] || req.query['verify_token'] || '');

    // Never log the actual token — only whether one was supplied.
    console.log(`[Meta Webhook GET] mode=${mode} tokenProvided=${token ? 'yes' : 'no'} challenge=${challenge ? 'yes' : 'no'}`);

    if (challenge) {
      const settings = await Settings.findOne();
      const expected = String(settings?.whatsappWebhookVerifyToken || '').trim();

      if (!expected) {
        console.warn('[Meta Webhook] Rejected: no verify token configured in Admin Settings.');
        res.status(403).type('text/plain').send('Forbidden');
        return;
      }
      if (mode !== 'subscribe' || token !== expected) {
        console.warn('[Meta Webhook] Rejected: verify token mismatch.');
        res.status(403).type('text/plain').send('Forbidden');
        return;
      }

      res.status(200).type('text/plain').send(String(challenge).trim());
      return;
    }

    res.status(200).type('text/plain').send('WhatsApp Webhook Active');
  } catch (err: any) {
    console.error('[Meta Webhook Error]', err);
    res.status(500).type('text/plain').send('Error');
  }
};

// @desc    Receive WhatsApp webhook events
// @route   POST /api/v1/webhooks/whatsapp
// @access  Public
export const receiveWhatsappWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await Settings.findOne();
    const appSecret = String(settings?.whatsappAppSecret || '').trim();
    const signature = String(req.header('x-hub-signature-256') || '');
    const rawBody: Buffer | undefined = (req as any).rawBody;

    if (appSecret) {
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret)
        .update(rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})))
        .digest('hex');

      const valid =
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

      if (!valid) {
        console.warn('[WhatsApp Webhook] Rejected: invalid or missing X-Hub-Signature-256.');
        res.status(401).json({ success: false });
        return;
      }
    } else {
      console.warn('[WhatsApp Webhook] whatsappAppSecret not configured — skipping signature verification. Set it in Admin Settings to secure this endpoint.');
    }

    console.log('[WhatsApp Webhook Event]:', JSON.stringify(req.body));
    // TODO: persist inbound messages and delivery/read statuses here.

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[WhatsApp Webhook Error]', err);
    // Always ack with 200 so Meta does not disable the subscription on transient errors.
    res.status(200).json({ success: true });
  }
};



// @desc    Send WhatsApp Business API test message
// @route   POST /api/v1/settings/test-whatsapp
// @access  Private/Admin
export const testWhatsapp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      res.status(400).json({
        success: false,
        message: 'WhatsApp Business API is statically disabled in the backend. Testing and sending messages are not allowed.',
      });
      return;
    }

    const {
      to,
      messageType = 'text',
      message,
      templateName,
      languageCode,
      whatsappApiVersion,
      whatsappPhoneNumberId,
      whatsappAccessToken,
    } = req.body;

    const settings = await Settings.findOne();
    const apiVersion = normalizeGraphApiVersion(whatsappApiVersion || settings?.whatsappApiVersion);
    const phoneNumberId = String(whatsappPhoneNumberId || settings?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(whatsappAccessToken || settings?.whatsappAccessToken || '').trim();
    const recipient = normalizeWhatsAppPhone(to, settings?.country);

    if (!phoneNumberId || !accessToken) {
      res.status(400).json({ success: false, message: 'WhatsApp Phone Number ID and Access Token are required.' });
      return;
    }

    if (!recipient || recipient.length < 8 || recipient.length > 15) {
      res.status(400).json({ success: false, message: 'Enter a valid recipient phone number with country code.' });
      return;
    }

    let payload: Record<string, unknown>;

    if (messageType === 'template') {
      const resolvedTemplate = String(templateName || settings?.whatsappDefaultTemplateName || '').trim();
      const resolvedLanguage = String(languageCode || settings?.whatsappDefaultLanguageCode || 'en_US').trim();
      if (!resolvedTemplate) {
        res.status(400).json({ success: false, message: 'Template name is required for template test messages.' });
        return;
      }
      payload = buildWhatsAppTemplatePayload(recipient, resolvedTemplate, resolvedLanguage);
    } else {
      const text = String(message || 'WelcomeTech CRM WhatsApp Business API test message.').trim();
      if (!text) {
        res.status(400).json({ success: false, message: 'Message text is required.' });
        return;
      }
      payload = buildWhatsAppTextPayload(recipient, text);
    }

    const data = await sendWhatsAppMessage({
      apiVersion,
      phoneNumberId,
      accessToken,
      payload,
    });

    console.log('[Meta API Direct Response]:', JSON.stringify(data, null, 2));

    res.status(200).json({ success: true, message: 'WhatsApp test message sent successfully', data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `WhatsApp test failed: ${err.message}`, metaStatus: err?.status });
  }
};

// @desc    Test SMTP settings
// @route   POST /api/v1/settings/test-smtp
// @access  Private/Admin
export const testSmtp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { smtpHost, smtpPort, smtpUser, mailEncryption } = req.body;
    // The client never receives the stored password; fall back to it when blank.
    let { smtpPassword } = req.body;
    if (!smtpPassword) {
      const stored = await Settings.findOne();
      smtpPassword = stored?.smtpPassword || '';
    }

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      res.status(400).json({ success: false, message: 'SMTP Host, Port, User, and Password are required' });
      return;
    }

    await testSmtpConnection({
      host: smtpHost,
      port: Number(smtpPort),
      user: smtpUser,
      pass: smtpPassword,
      secure: mailEncryption === 'ssl',
    });

    res.status(200).json({ success: true, message: 'SMTP connection successful' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `SMTP connection failed: ${err.message}` });
  }
};

// @desc    Send test SMTP email
// @route   POST /api/v1/settings/test-smtp-email
// @access  Private/Admin
export const testSmtpEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { smtpHost, smtpPort, smtpUser, mailEncryption, senderEmail, mailFromName, testEmail } = req.body;
    // The client never receives the stored password; fall back to it when blank.
    let { smtpPassword } = req.body;
    if (!smtpPassword) {
      const stored = await Settings.findOne();
      smtpPassword = stored?.smtpPassword || '';
    }

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !testEmail) {
      res.status(400).json({ success: false, message: 'All SMTP details and recipient email are required' });
      return;
    }

    await sendTestEmail({
      host: smtpHost,
      port: Number(smtpPort),
      user: smtpUser,
      pass: smtpPassword,
      secure: mailEncryption === 'ssl',
      fromEmail: senderEmail,
      fromName: mailFromName,
    }, testEmail);

    res.status(200).json({ success: true, message: 'Test email sent successfully' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `Failed to send test email: ${err.message}` });
  }
};

// @desc    Get public Firebase Web Config for client push registration
// @route   GET /api/v1/settings/firebase-public-config
// @access  Private (any authenticated employee)
export const getFirebasePublicConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await Settings.findOne();
    if (!settings || settings.firebaseServiceStatus !== 'active') {
      res.status(200).json({
        success: true,
        data: {
          active: false,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        active: true,
        apiKey: settings.firebaseApiKey || '',
        authDomain: settings.firebaseAuthDomain || '',
        projectId: settings.firebaseProjectId || '',
        storageBucket: settings.firebaseStorageBucket || '',
        messagingSenderId: settings.firebaseMessagingSenderId || '',
        appId: settings.firebaseAppId || '',
        measurementId: settings.firebaseMeasurementId || '',
        vapidKey: settings.firebaseVapidKey || '',
      },
    });

  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

