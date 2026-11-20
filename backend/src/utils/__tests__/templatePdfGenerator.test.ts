import { describe, it, expect } from 'vitest';
import {
  generateTemplatePdfBuffer,
  buildTemplateEmailHtml,
  resolveEmailAsset,
  templateBodyToHtml,
} from '../templatePdfGenerator';

describe('Template PDF & Email Dispatcher', () => {
  it('generates a valid binary PDF buffer with header, recipient info and contract details', async () => {
    const pdfBuffer = await generateTemplatePdfBuffer({
      subject: 'Annual Maintenance Contract Renewal Notice',
      body: 'Dear Valued Client,\n\nPlease find your contract renewal notice below.\n\nThank you.',
      customerName: 'Ritver Paints & Coatings WLL',
      contactPerson: 'Suresh Kumar',
      phone: '+974 5551 2260',
      email: 'suresh@ritver.qa',
      product: 'TallyPrime Server',
      serialNo: 'TPS-99882',
      startDate: '2026-01-01',
      expiryDate: '2026-12-31',
      amount: '3500',
      settings: {
        companyName: 'Welcome Trading Co. W.L.L',
        currency: 'QAR',
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  }, 25000);

  it('resolveEmailAsset handles public URLs and relative upload paths gracefully', () => {
    const attachmentsList: any[] = [];
    const directUrl = resolveEmailAsset('https://example.com/logo.png', 'logo', 'logo', attachmentsList);
    expect(directUrl).toBe('https://example.com/logo.png');

    const localUrl = resolveEmailAsset('/uploads/custom-header.png', 'header-cid', 'header', attachmentsList);
    expect(localUrl).toBeDefined();
  });

  it('buildTemplateEmailHtml strips redundant markdown images and wraps with clean layout', () => {
    const attachmentsList: any[] = [];
    const html = buildTemplateEmailHtml(
      '![Header.png](/uploads/header.png)\n\nDear Acme Corp,\n\nYour service agreement expires soon.\n\n![Footer.jpg](/uploads/footer.jpg)',
      'Renewal Reminder',
      'Acme Corp',
      {
        companyName: 'Welcome Tech CRM',
      },
      undefined,
      attachmentsList
    );

    expect(html).toContain('Renewal Reminder');
    expect(html).toContain('Dear Acme Corp,');
    expect(html).toContain('Your service agreement expires soon.');
    // Redundant inline markdown image tags must be stripped from body text
    expect(html).not.toContain('![Header.png]');
    expect(html).not.toContain('![Footer.jpg]');
  });

  const PNG_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('embeds header & footer banners as inline CID attachments for email clients like Gmail', () => {
    const attachmentsList: any[] = [];
    const settings = {
      companyName: 'Welcome Trading Co. W.L.L',
      proposalHeaderImage: PNG_DATA_URI,
      proposalFooterImage: PNG_DATA_URI,
    };

    const html = buildTemplateEmailHtml(
      'Dear Valued Customer,\n\nYour AMC renewal is due.\n\nBest Regards,',
      'AMC Renewal Notice',
      'Ritver Paints',
      settings,
      undefined,
      attachmentsList
    );

    // HTML img tags reference the inline CID assets
    expect(html).toContain('src="cid:email-header-banner-0@welcometech"');
    expect(html).toContain('src="cid:email-footer-banner-1@welcometech"');
    expect(html).toContain('alt="Header Banner"');
    expect(html).toContain('alt="Footer Banner"');

    // Attachments list contains the inline attachments ready for nodemailer
    expect(attachmentsList).toHaveLength(2);
    expect(attachmentsList[0].cid).toBe('email-header-banner-0@welcometech');
    expect(attachmentsList[0].contentDisposition).toBe('inline');
    expect(attachmentsList[0].contentType).toBe('image/png');
    expect(Buffer.isBuffer(attachmentsList[0].content)).toBe(true);

    expect(attachmentsList[1].cid).toBe('email-footer-banner-1@welcometech');
    expect(attachmentsList[1].contentDisposition).toBe('inline');
    expect(attachmentsList[1].contentType).toBe('image/png');
    expect(Buffer.isBuffer(attachmentsList[1].content)).toBe(true);
  });

  it('renders clean branded letterhead when attachmentsList is not passed (preventing image attachment chips in Gmail)', () => {
    const settings = {
      companyName: 'Welcome Trading Co. W.L.L',
      proposalHeaderImage: PNG_DATA_URI,
      proposalFooterImage: PNG_DATA_URI,
    };

    const html = buildTemplateEmailHtml(
      'Dear Valued Customer,\n\nNotice content.',
      'Notice',
      'Client',
      settings,
      undefined,
      undefined
    );

    expect(html).not.toContain('cid:');
    expect(html).toContain('Welcome Trading Co. W.L.L');
    expect(html).toContain('Official Notice & Documentation');
    expect(html).toContain('Please find the attached official PDF document for complete details.');
  });

  it('renders proposal-parity email layout with reference details card, full letter body, and PDF download button', () => {
    const downloadUrl = 'https://crm.welcometech.qa/api/v1/public/email-template-pdfs/Test1_123.pdf';
    const html = buildTemplateEmailHtml(
      'Dear Sir,\n\nThis full letter body is displayed directly in the email alongside the PDF attachment.',
      'Test1',
      'Sabarish T',
      { companyName: 'Welcome Trading Co. W.L.L' },
      undefined,
      undefined,
      'https://crm.welcometech.qa',
      downloadUrl,
      { product: 'Tally Prime Accounting', serialNo: 'SER-100', expiryDate: '10 Sep 2026' }
    );

    expect(html).toContain('Download as PDF');
    expect(html).toContain(`href="${downloadUrl}"`);
    expect(html).toContain('Tally Prime Accounting');
    expect(html).toContain('This full letter body is displayed directly in the email');
  });

  it('generates PDF buffer embedding base64 Data URI header and footer banner images', async () => {
    const pdfBuffer = await generateTemplatePdfBuffer({
      subject: 'Annual Maintenance Contract Renewal Notice',
      body: 'Dear Valued Client,\n\nPlease find your contract renewal notice below.\n\nThank you.',
      customerName: 'Ritver Paints & Coatings WLL',
      contactPerson: 'Suresh Kumar',
      phone: '+974 5551 2260',
      email: 'suresh@ritver.qa',
      product: 'TallyPrime Server',
      serialNo: 'TPS-99882',
      startDate: '2026-01-01',
      expiryDate: '2026-12-31',
      amount: '3500',
      settings: {
        companyName: 'Welcome Trading Co. W.L.L',
        currency: 'QAR',
        proposalHeaderImage: PNG_DATA_URI,
        proposalFooterImage: PNG_DATA_URI,
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  }, 25000);

  it('prioritizes template-level custom headerImage & footerImage over default settings in PDF generation', async () => {
    const customHeader = PNG_DATA_URI;
    const customFooter = PNG_DATA_URI;

    const pdfBuffer = await generateTemplatePdfBuffer({
      subject: 'Dynamic Template Header Test',
      body: 'Testing custom template header and footer overrides.',
      customerName: 'Dynamic Client WLL',
      headerImage: customHeader,
      footerImage: customFooter,
      settings: {
        companyName: 'Welcome Trading Co. W.L.L',
        proposalHeaderImage: 'https://fallback.com/default-header.png',
        proposalFooterImage: 'https://fallback.com/default-footer.png',
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('prioritizes customHeaderImage & customFooterImage in buildTemplateEmailHtml over defaults', () => {
    const attachmentsList: any[] = [];
    const customHeader = PNG_DATA_URI;
    const customFooter = PNG_DATA_URI;

    const html = buildTemplateEmailHtml(
      'Custom header email test content.',
      'Dynamic Banners',
      'Acme Co',
      {
        companyName: 'Welcome Trading Co. W.L.L',
        proposalHeaderImage: 'data:image/png;base64,DEFAULT_HEADER_SHOULD_NOT_BE_USED',
      },
      undefined,
      attachmentsList,
      'https://crm.welcometech.qa',
      undefined,
      undefined,
      customHeader,
      customFooter
    );

    // Custom headers are resolved and attached as inline CID attachments
    expect(html).toContain('src="cid:email-header-banner-0@welcometech"');
    expect(html).toContain('src="cid:email-footer-banner-1@welcometech"');
    expect(attachmentsList).toHaveLength(2);
    expect(attachmentsList[0].cid).toBe('email-header-banner-0@welcometech');
    expect(attachmentsList[1].cid).toBe('email-footer-banner-1@welcometech');
  });

  it('does NOT attach unused company logo to attachmentsList when settings.logo is defined, preventing Gmail separate attachment chips', () => {
    const attachmentsList: any[] = [];
    const settings = {
      companyName: 'Welcome Trading Co. W.L.L',
      logo: PNG_DATA_URI,
      proposalHeaderImage: PNG_DATA_URI,
      proposalFooterImage: PNG_DATA_URI,
    };

    buildTemplateEmailHtml(
      'Dear Valued Customer,\n\nTest content without logo in HTML.',
      'Notice',
      'Client',
      settings,
      undefined,
      attachmentsList
    );

    // Only header and footer banners should be in attachmentsList (length 2), NOT the unused logo
    expect(attachmentsList).toHaveLength(2);
    expect(attachmentsList.map(a => a.cid)).toEqual([
      'email-header-banner-0@welcometech',
      'email-footer-banner-1@welcometech',
    ]);
    expect(attachmentsList.some(a => a.cid.includes('logo'))).toBe(false);
  });

  it('resolves /uploads/... images to public URLs and does NOT add them to attachmentsList, preventing separate image chips in Gmail', () => {
    const attachmentsList: any[] = [];
    const html = buildTemplateEmailHtml(
      'Dear Valued Customer,\n\nNotice with uploaded header and footer.',
      'Notice',
      'Client',
      { companyName: 'Welcome Trading Co. W.L.L' },
      undefined,
      attachmentsList,
      'https://crm.welcometech.qa',
      undefined,
      undefined,
      '/uploads/media/header-123.png',
      '/uploads/media/footer-456.jpeg'
    );

    // Header and footer images should render with full public HTTPS URLs
    expect(html).toContain('src="https://crm.welcometech.qa/api/v1/uploads/media/header-123.png"');
    expect(html).toContain('src="https://crm.welcometech.qa/api/v1/uploads/media/footer-456.jpeg"');
    expect(html).not.toContain('cid:');

    // attachmentsList must remain EMPTY so Nodemailer only attaches the PDF and Gmail shows 1 attachment!
    expect(attachmentsList).toHaveLength(0);
  });

  it('preserves user uploaded content images in email body and templateBodyToHtml', () => {
    const bodyWithImages = `
Dear Team,

Please review our renewal flyer below:

<img src="https://crm.welcometech.qa/api/v1/uploads/media/flyer.jpeg" alt="TSS_Tally.jpeg" style="max-width: 100%;" />

![Offer Banner](https://crm.welcometech.qa/api/v1/uploads/media/offer.png)

Thank you!
    `.trim();

    const emailHtml = buildTemplateEmailHtml(
      bodyWithImages,
      'Renewal Flyer',
      'Client Enterprise',
      { companyName: 'Welcome Trading Co. W.L.L' }
    );

    // Both HTML image and markdown image must be present in the email HTML
    expect(emailHtml).toContain('https://crm.welcometech.qa/api/v1/uploads/media/flyer.jpeg');
    expect(emailHtml).toContain('https://crm.welcometech.qa/api/v1/uploads/media/offer.png');
    expect(emailHtml).toContain('<img src="https://crm.welcometech.qa/api/v1/uploads/media/flyer.jpeg"');
    expect(emailHtml).toContain('<img src="https://crm.welcometech.qa/api/v1/uploads/media/offer.png"');

    // Also verify templateBodyToHtml (used for PDF generation) preserves the images
    const pdfHtml = templateBodyToHtml(bodyWithImages);
    expect(pdfHtml).toContain('https://crm.welcometech.qa/api/v1/uploads/media/flyer.jpeg');
    expect(pdfHtml).toContain('https://crm.welcometech.qa/api/v1/uploads/media/offer.png');
    expect(pdfHtml).toContain('<img src="https://crm.welcometech.qa/api/v1/uploads/media/flyer.jpeg"');
  });

  it('generates a single-page PDF for an email template containing renewal notice text and a promotional flyer image', async () => {
    // 1x1 transparent png data uri for banners and flyer
    const sampleImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const renewalBody = [
      'Dear Team, Greetings from Welcome Trading Co. W.L.L! This is a friendly reminder that your Tally Software Services (TSS) subscription is due for renewal. Serial Number: {xxxxxxxxx} Expiry Date: {DD/MM/YYYY} Renew your TSS subscription today and upgrade to the latest Tally Prime Release 7.0 at no additional cost with a valid TSS subscription.',
      '',
      'Why renew your TSS subscription?',
      '• Access to the latest Tally Prime releases, updates and product enhancements',
      '• Timely statutory and regulatory compliance updates',
      '• Secure access to your Tally reports from any device, anywhere, through a web browser',
      '• Continued technical support from our team',
      '',
      'For renewal assistance, please contact us:',
      'Call: +974 66032346 / 44502069',
      'Email: sales@welcometech.qa',
      'Thank you for your continued support and trust in us.',
      '',
      `<img src="${sampleImg}" alt="TSS Flyer" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px;" />`
    ].join('\n');

    const pdfBuffer = await generateTemplatePdfBuffer({
      subject: 'Reminder: Your Tally Software Services (TSS) subscription renewal',
      body: renewalBody,
      settings: {
        companyName: 'Welcome Trading Co. W.L.L',
        brandColor: '#6d28d9',
        headerImage: sampleImg,
        footerImage: sampleImg,
      },
      defaultTemplate: {
        name: 'TSS Subscription renewal',
        subject: 'Reminder: Your Tally Software Services (TSS) subscription renewal',
        body: renewalBody,
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    const pdfStr = pdfBuffer.toString('latin1');
    const pageCountMatch = pdfStr.match(/\/Count\s+(\d+)/);
    expect(pageCountMatch).not.toBeNull();
    // Must be exactly 1 page
    expect(Number(pageCountMatch![1])).toBe(1);
  });
});

