import nodemailer from 'nodemailer';
import crypto from 'crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
  fromEmail?: string;
  fromName?: string;
}

// Validate the server's TLS certificate by default. Only skip validation when
// explicitly opted in (SMTP_ALLOW_SELF_SIGNED=true) or in non-production, so
// production never silently accepts a MITM/self-signed cert while sending creds.
const buildSmtpTls = () => ({
  rejectUnauthorized: !(process.env.SMTP_ALLOW_SELF_SIGNED === 'true' || process.env.NODE_ENV !== 'production'),
});

const normalizeRecipientList = (input?: string | string[]): string | string[] => {
  if (!input) return '';
  if (Array.isArray(input)) {
    const list = input
      .flatMap((item) => String(item || '').split(/[,;]+/))
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length === 1 ? list[0] : list;
  }
  const list = String(input)
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length === 1 ? list[0] : list.join(', ');
};

export const resolveSmtpSecure = (port: number, explicitSecure?: boolean): boolean => {
  if (port === 465) return true;
  if (port === 587 || port === 25 || port === 2525) return false;
  return explicitSecure ?? false;
};

export const formatSmtpError = (error: any): Error => {
  const msg = String(error?.message || '');
  if (msg.includes('525') || msg.includes('Unauthorized IP')) {
    return new Error('SMTP Error: 525 5.7.1 Unauthorized IP address. Your IP is not whitelisted on your SMTP relay (Brevo). Please add your current IP to Authorized IPs in your Brevo account dashboard or update Settings > SMTP.');
  }
  return error instanceof Error ? error : new Error(msg);
};

export const testSmtpConnection = async (config: SmtpConfig): Promise<boolean> => {
  const isSecure = resolveSmtpSecure(Number(config.port), config.secure);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: buildSmtpTls(),
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('SMTP Verification Error:', error);
    throw formatSmtpError(error);
  }
};

export const sendTestEmail = async (config: SmtpConfig, to: string): Promise<any> => {
  const isSecure = resolveSmtpSecure(Number(config.port), config.secure);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: buildSmtpTls(),
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const senderAddress = config.fromEmail || config.user;
  const senderDisplayName = config.fromName && !config.fromName.includes('@') ? config.fromName : 'Welcome Tech CRM';

  const mailOptions = {
    from: `"${senderDisplayName.replace(/"/g, '')}" <${senderAddress}>`,
    to: normalizeRecipientList(to),
    replyTo: senderAddress,
    subject: 'SMTP Test Email - Welcome Tech CRM',
    text: 'This is a test email from your CRM settings. If you received this, your SMTP configuration is working correctly!',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #6d28d9; margin-top: 0;">SMTP Test Successful!</h2>
        <p style="color: #475569; line-height: 1.6;">This is a test email from your CRM settings.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #64748b; font-size: 14px;">If you received this message, your SMTP configuration is working correctly!</p>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Sent at: ${new Date().toLocaleString()}</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Send Test Email Error:', error);
    throw formatSmtpError(error);
  }
};

export const convertHtmlToPlainText = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n$1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
};

export const sendEmail = async (
  config: SmtpConfig,
  to: string | string[],
  subject: string,
  html: string,
  text?: string,
  cc?: string | string[],
  attachments?: any[],
  messageId?: string
): Promise<any> => {
  const isSecure = resolveSmtpSecure(Number(config.port), config.secure);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: buildSmtpTls(),
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const senderAddress = config.fromEmail || config.user;
  const senderDisplayName = config.fromName && !config.fromName.includes('@') ? config.fromName : 'Welcome Tech CRM';
  const cleanText = text || convertHtmlToPlainText(html);

  const cleanTo = normalizeRecipientList(to);
  const normalizedCc = cc ? normalizeRecipientList(cc) : undefined;
  const cleanCc = (normalizedCc && (Array.isArray(normalizedCc) ? normalizedCc.length > 0 : String(normalizedCc).trim().length > 0))
    ? normalizedCc
    : undefined;

  const senderDomain = (senderAddress.includes('@') ? senderAddress.split('@')[1] : 'welcometech.qa').toLowerCase().trim();
  const effectiveMessageId = messageId || `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${senderDomain}>`;

  const mailOptions: any = {
    from: `"${senderDisplayName.replace(/"/g, '')}" <${senderAddress}>`,
    to: cleanTo,
    cc: cleanCc,
    replyTo: senderAddress,
    subject: subject.trim(),
    text: cleanText,
    html,
    messageId: effectiveMessageId,
    headers: {
      'X-Mailer': 'Welcome Tech CRM',
      'X-Priority': '3',
    },
  };

  if (Array.isArray(attachments) && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  console.log('[Mailer] Dispatching email:', { from: mailOptions.from, to: mailOptions.to, cc: mailOptions.cc, subject: mailOptions.subject });

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[Mailer] Email delivered to SMTP server:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    });
    return info;
  } catch (error) {
    console.error('Send Email Error:', error);
    throw formatSmtpError(error);
  }
};
