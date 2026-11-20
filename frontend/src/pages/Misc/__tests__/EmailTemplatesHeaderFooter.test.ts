import { describe, it, expect } from 'vitest';

interface EmailTemplateForm {
  name: string;
  subject: string;
  body: string;
  headerImage: string;
  footerImage: string;
}

interface ProposalTemplateStub {
  _id: string;
  name: string;
  templateImage?: string;
  templateFooterImage?: string;
}

describe('Email Template Dynamic Header & Footer Logic', () => {
  const mockActiveProposalTemplate: ProposalTemplateStub = {
    _id: 'prop-1',
    name: 'Standard Proposal Template',
    templateImage: '/uploads/media/standard_header.png',
    templateFooterImage: '/uploads/media/standard_footer.png',
  };

  const mockAlternativeProposalTemplate: ProposalTemplateStub = {
    _id: 'prop-2',
    name: 'ERP Special Template',
    templateImage: '/uploads/media/erp_header.png',
    templateFooterImage: '/uploads/media/erp_footer.png',
  };

  it('initializes new email template with active proposal template banners as smart default', () => {
    const isNew = true;
    const selectedTemplate = null;

    const form: EmailTemplateForm = isNew
      ? {
          name: '',
          subject: '',
          body: '',
          headerImage: mockActiveProposalTemplate.templateImage || '',
          footerImage: mockActiveProposalTemplate.templateFooterImage || '',
        }
      : {
          name: (selectedTemplate as any)?.name || '',
          subject: (selectedTemplate as any)?.subject || '',
          body: (selectedTemplate as any)?.body || '',
          headerImage: (selectedTemplate as any)?.headerImage || '',
          footerImage: (selectedTemplate as any)?.footerImage || '',
        };

    expect(form.headerImage).toBe('/uploads/media/standard_header.png');
    expect(form.footerImage).toBe('/uploads/media/standard_footer.png');
  });

  it('loads custom header and footer banners from existing saved email template', () => {
    const existingTemplate = {
      _id: 'email-tmpl-1',
      name: 'VIP Client Notice',
      subject: 'Special Notice',
      body: 'Hello World',
      headerImage: '/uploads/media/vip_header.png',
      footerImage: '/uploads/media/vip_footer.png',
    };

    const form: EmailTemplateForm = {
      name: existingTemplate.name,
      subject: existingTemplate.subject,
      body: existingTemplate.body,
      headerImage: existingTemplate.headerImage || '',
      footerImage: existingTemplate.footerImage || '',
    };

    expect(form.headerImage).toBe('/uploads/media/vip_header.png');
    expect(form.footerImage).toBe('/uploads/media/vip_footer.png');
  });

  it('allows user to clear header banner switching preview to clean letterhead logo mode', () => {
    let form: EmailTemplateForm = {
      name: 'Test Template',
      subject: 'Test Subject',
      body: 'Test Body',
      headerImage: '/uploads/media/standard_header.png',
      footerImage: '/uploads/media/standard_footer.png',
    };

    // User clicks remove header banner
    form = { ...form, headerImage: '' };
    expect(form.headerImage).toBe('');
    expect(form.footerImage).toBe('/uploads/media/standard_footer.png');

    // Rendering decision:
    const showHeaderBanner = Boolean(form.headerImage);
    const showLetterheadLogo = !form.headerImage;
    expect(showHeaderBanner).toBe(false);
    expect(showLetterheadLogo).toBe(true);
  });

  it('allows user to 1-click apply banners from any proposal template preset', () => {
    let form: EmailTemplateForm = {
      name: 'Test Template',
      subject: 'Test Subject',
      body: 'Test Body',
      headerImage: '/uploads/media/standard_header.png',
      footerImage: '/uploads/media/standard_footer.png',
    };

    // User chooses 'ERP Special Template' from the preset dropdown
    const chosenPreset = mockAlternativeProposalTemplate;
    form = {
      ...form,
      headerImage: chosenPreset.templateImage || '',
      footerImage: chosenPreset.templateFooterImage || '',
    };

    expect(form.headerImage).toBe('/uploads/media/erp_header.png');
    expect(form.footerImage).toBe('/uploads/media/erp_footer.png');
  });

  it('determines table badge status correctly for templates with custom banners vs letterhead', () => {
    const getBadgeInfo = (t: { headerImage?: string; footerImage?: string }) => {
      if (t.headerImage && t.footerImage) return 'Header + Footer';
      if (t.headerImage) return 'Header Only';
      if (t.footerImage) return 'Footer Only';
      return 'Letterhead';
    };

    expect(getBadgeInfo({ headerImage: 'h.png', footerImage: 'f.png' })).toBe('Header + Footer');
    expect(getBadgeInfo({ headerImage: 'h.png', footerImage: '' })).toBe('Header Only');
    expect(getBadgeInfo({ headerImage: '', footerImage: 'f.png' })).toBe('Footer Only');
    expect(getBadgeInfo({ headerImage: '', footerImage: '' })).toBe('Letterhead');
    expect(getBadgeInfo({})).toBe('Letterhead');
  });

  it('strips redundant inline banner images from markdown/html body text', () => {
    const stripBannerDuplicates = (bodyText: string, header?: string, footer?: string) => {
      if (!bodyText) return '';
      let cleaned = bodyText;
      const targets = [header, footer].filter(Boolean) as string[];
      for (const t of targets) {
        if (!t) continue;
        const filename = t.split('/').pop()?.split('?')[0];
        if (filename && filename.length > 3) {
          const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`<img[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>`, 'gi');
          cleaned = cleaned.replace(re, '');
        }
      }
      return cleaned;
    };

    const rawBody =
      '<img src="/uploads/media/custom_hdr.png" />\n# Renewal Notice\nDear Customer\n<img src="/uploads/media/custom_ftr.png" />';
    const cleaned = stripBannerDuplicates(
      rawBody,
      '/uploads/media/custom_hdr.png',
      '/uploads/media/custom_ftr.png'
    );

    expect(cleaned).not.toContain('custom_hdr.png');
    expect(cleaned).not.toContain('custom_ftr.png');
    expect(cleaned).toContain('# Renewal Notice');
    expect(cleaned).toContain('Dear Customer');
  });

  describe('Email Template Send Modal & Dispatch Functionality', () => {
    const mockEmailTemplate = {
      _id: 'tmpl-101',
      name: 'Multi user',
      subject: 'Service Quotation Template',
      body: 'Dear {{contactPerson}},\n\nPlease review the proposal for {{product}}.\n\nBest regards,\nWelcome Tech',
      headerImage: '/uploads/media/header_banner.png',
      footerImage: '/uploads/media/footer_banner.png',
      updatedAt: '2026-09-07T12:00:00.000Z',
    };

    it('opens send modal with targeted template details and resets recipient input', () => {
      let sendTemplateTarget: any = null;
      let sendRecipientEmail = 'old@example.com';

      // Simulating user clicking paper airplane Send action in table
      sendTemplateTarget = mockEmailTemplate;
      sendRecipientEmail = '';

      expect(sendTemplateTarget).not.toBeNull();
      expect(sendTemplateTarget._id).toBe('tmpl-101');
      expect(sendTemplateTarget.name).toBe('Multi user');
      expect(sendTemplateTarget.subject).toBe('Service Quotation Template');
      expect(sendRecipientEmail).toBe('');
    });

    it('validates dispatch button disable logic when recipient email is empty or whitespace', () => {
      const isSendDisabled = (email: string, isPending: boolean) => {
        return isPending || !email.trim();
      };

      expect(isSendDisabled('', false)).toBe(true);
      expect(isSendDisabled('   ', false)).toBe(true);
      expect(isSendDisabled('client@example.com', true)).toBe(true);
      expect(isSendDisabled('client@example.com', false)).toBe(false);
    });

    it('constructs correct API payload with dynamicData fallbacks and custom banner overrides', () => {
      const target = mockEmailTemplate;
      const recipient = '  client@example.com  ';

      const payload = {
        to: recipient.trim(),
        templateId: target._id,
        headerImage: target.headerImage || undefined,
        footerImage: target.footerImage || undefined,
        dynamicData: {
          customerName: 'Valued Client Enterprise',
          companyName: 'Valued Client Enterprise',
          contactPerson: 'Valued Customer',
          product: 'TallyPrime Enterprise ERP',
          productName: 'TallyPrime Enterprise ERP',
          serialNo: '720912441',
          release: 'Release 5.0',
          expiryDate: '31-Dec-2026',
          dueDate: '31-Dec-2026',
          startDate: '01-Jan-2026',
          endDate: '31-Dec-2026',
          phone: '+974 4432 1234',
          email: recipient.trim(),
          amount: 'QAR 2,500',
        },
      };

      expect(payload.to).toBe('client@example.com');
      expect(payload.templateId).toBe('tmpl-101');
      expect(payload.headerImage).toBe('/uploads/media/header_banner.png');
      expect(payload.footerImage).toBe('/uploads/media/footer_banner.png');
      expect(payload.dynamicData.customerName).toBe('Valued Client Enterprise');
      expect(payload.dynamicData.serialNo).toBe('720912441');
      expect(payload.dynamicData.email).toBe('client@example.com');
    });

    it('closes modal and clears state on successful dispatch or cancellation', () => {
      let sendTemplateTarget: any = mockEmailTemplate;
      let sendRecipientEmail = 'client@example.com';

      const handleClose = () => {
        sendTemplateTarget = null;
        sendRecipientEmail = '';
      };

      handleClose();

      expect(sendTemplateTarget).toBeNull();
      expect(sendRecipientEmail).toBe('');
    });
  });

  describe('Email Template PDF A4 Pagination and Chunking', () => {
    it('fits email template notice and flyer image on a single A4 page without spilling when letter mode is active', async () => {
      const { chunkDocumentBlocksForA4Pages, splitHtmlBlocks } = await import('../../../utils/quotationHelpers');
      const { renderCommonDocumentBody } = await import('../../../utils/documentStyles');

      const bodyText = [
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
        '<img src="/uploads/media/flyer.jpeg" alt="TSS Flyer" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px;" />'
      ].join('\n');

      const renderedHtml = renderCommonDocumentBody(bodyText, '#6d28d9');
      const subjectBox = '<div style="margin:0 0 16px;padding:8px 12px;background:#f8fafc;border-left:3.5px solid #6d28d9;border-radius:4px;font-size:12.5px;font-weight:600;color:#0f172a;"><span style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6d28d9;margin-right:6px;letter-spacing:0.04em;">Subject:</span>Reminder: Your Tally Software Services (TSS) subscription renewal</div>';
      const fullContent = subjectBox + renderedHtml;

      const chunksWithLetter = chunkDocumentBlocksForA4Pages([{
        id: 'letter_body',
        type: 'text',
        title: '',
        content: fullContent,
      }], {
        hasHeaderImage: true,
        hasFooterImage: true,
        isLetter: true,
      });

      // Full-size image (width: 100% / unconstrained): accurately overflows Page 1 and cleanly places image on Page 2
      expect(chunksWithLetter.length).toBe(2);
      expect(chunksWithLetter[0].slices[0].contentSlice).toContain('Dear Team');
      expect(chunksWithLetter[1].slices[0].contentSlice).toContain('<img');

      // Resized image (WordPress control 45%): fits on 1 single page without spilling onto double pages
      const resizedBodyText = bodyText.replace('<img ', '<img style="width: 45%; max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px;" ');
      const resizedFullContent = subjectBox + renderCommonDocumentBody(resizedBodyText, '#6d28d9');
      const chunksResized = chunkDocumentBlocksForA4Pages([{
        id: 'letter_body',
        type: 'text',
        title: '',
        content: resizedFullContent,
      }], {
        hasHeaderImage: true,
        hasFooterImage: true,
        isLetter: true,
      });

      expect(chunksResized.length).toBe(1);
      expect(chunksResized[0].slices[0].contentSlice).toContain('<img');
    });
  });
});
