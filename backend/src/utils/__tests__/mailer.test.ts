import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { sendEmail, sendTestEmail, convertHtmlToPlainText } from '../mailer';

vi.mock('nodemailer');

describe('Mailer Utility & Deliverability', () => {
  let mockSendMail: any;
  let mockVerify: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail = vi.fn().mockResolvedValue({
      messageId: 'mock-msg-12345',
      response: '250 OK: message queued',
      accepted: ['client@example.com'],
      rejected: [],
    });
    mockVerify = vi.fn().mockResolvedValue(true);

    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    } as any);
  });

  it('converts rich HTML to clean plain text fallback without HTML tags', () => {
    const html = `
      <style>body { color: red; }</style>
      <h1>Welcome Tech CRM</h1>
      <p>Hello <strong>Acme Corp</strong>,<br />Your AMC contract expires soon.</p>
      <div>&quot;Special Offer&quot; &amp; Details &lt;here&gt;</div>
    `;

    const plain = convertHtmlToPlainText(html);
    expect(plain).not.toContain('<style>');
    expect(plain).not.toContain('<h1>');
    expect(plain).not.toContain('<strong>');
    expect(plain).toContain('Welcome Tech CRM');
    expect(plain).toContain('Hello Acme Corp');
    expect(plain).toContain('Your AMC contract expires soon.');
    expect(plain).toContain('"Special Offer" & Details <here>');
  });

  it('constructs anti-spam headers and matching sender/reply-to identity', async () => {
    const config = {
      host: 'smtp.welcometech.qa',
      port: 587,
      user: 'billing@welcometech.qa',
      pass: 'securePassword123',
      fromEmail: 'billing@welcometech.qa',
      fromName: 'Welcome Tech Accounts',
    };

    await sendEmail(
      config,
      'client@example.com',
      'Contract Renewal Confirmation',
      '<h2>Hello!</h2><p>Your contract has been renewed successfully.</p>',
      undefined,
      'accounts@welcometech.qa'
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.welcometech.qa',
        port: 587,
        auth: {
          user: 'billing@welcometech.qa',
          pass: 'securePassword123',
        },
      })
    );

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Welcome Tech Accounts" <billing@welcometech.qa>',
        to: 'client@example.com',
        cc: 'accounts@welcometech.qa',
        replyTo: 'billing@welcometech.qa',
        subject: 'Contract Renewal Confirmation',
        headers: expect.objectContaining({
          'X-Mailer': 'Welcome Tech CRM',
          'X-Priority': '3',
        }),
      })
    );
  });

  it('defaults fromName to Welcome Tech CRM if not provided in config', async () => {
    const config = {
      host: 'smtp.welcometech.qa',
      port: 465,
      user: 'notifications@welcometech.qa',
      pass: 'secret',
    };

    await sendEmail(
      config,
      ['user1@example.com', 'user2@example.com'],
      'Important System Notice',
      '<p>Service update completed.</p>'
    );

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Welcome Tech CRM" <notifications@welcometech.qa>',
        replyTo: 'notifications@welcometech.qa',
      })
    );
  });

  it('handles attachments array when provided', async () => {
    const config = {
      host: 'smtp.welcometech.qa',
      port: 587,
      user: 'billing@welcometech.qa',
      pass: 'secret',
    };

    const attachments = [
      { filename: 'Invoice-1001.pdf', content: Buffer.from('pdf-data') },
    ];

    await sendEmail(
      config,
      'client@example.com',
      'Your Invoice #1001',
      '<p>Please find attached invoice.</p>',
      undefined,
      undefined,
      attachments
    );

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: 'Invoice-1001.pdf' }),
        ]),
      })
    );
  });
});
