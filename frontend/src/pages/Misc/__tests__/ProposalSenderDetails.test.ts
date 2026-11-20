import { describe, it, expect } from 'vitest';

describe('Proposal Sender Details in Signoff (Thanks & Best Regards)', () => {
  const formatSenderSignoff = (user?: { name?: string; phone?: string; email?: string; role?: string }, companyFallback = 'Welcome Tech CRM') => {
    const senderName = user?.name || companyFallback;
    const senderPhone = user?.phone || '';
    const senderEmail = user?.email || '';

    return [
      'Thanks & Best Regards',
      senderName,
      senderPhone ? `Phone: ${senderPhone}` : '',
      senderEmail ? `Email: ${senderEmail}` : '',
    ].filter(Boolean).join('\n');
  };

  it('formats Thanks & Best Regards with sender name, phone number and email', () => {
    const user = {
      name: 'Ahmed Al-Kuwari',
      phone: '+974 5512 3456',
      email: 'ahmed@welcometech.qa',
      role: 'sales_executive'
    };

    const signoff = formatSenderSignoff(user);
    expect(signoff).toContain('Thanks & Best Regards');
    expect(signoff).toContain('Ahmed Al-Kuwari');
    expect(signoff).toContain('Phone: +974 5512 3456');
    expect(signoff).toContain('Email: ahmed@welcometech.qa');
  });

  it('handles optional phone number gracefully without empty Phone line', () => {
    const user = {
      name: 'Sara Khan',
      email: 'sara@welcometech.qa',
    };

    const signoff = formatSenderSignoff(user);
    expect(signoff).toContain('Thanks & Best Regards');
    expect(signoff).toContain('Sara Khan');
    expect(signoff).toContain('Email: sara@welcometech.qa');
    expect(signoff).not.toContain('Phone:');
  });

  it('falls back to company name if user name is missing', () => {
    const signoff = formatSenderSignoff(undefined, 'Welcome Trading Co. W.L.L');
    expect(signoff).toBe('Thanks & Best Regards\nWelcome Trading Co. W.L.L');
  });

  it('formats complete proposal email message body with customer greeting and sender details', () => {
    const customerName = 'Qatar Petrochemical Co.';
    const quoteNo = 'WT-Q2026-088';
    const user = {
      name: 'Mohammed Ali',
      phone: '+974 3344 5566',
      email: 'm.ali@welcometech.qa'
    };

    const signoff = formatSenderSignoff(user);
    const emailBody = [
      `Dear ${customerName},`,
      '',
      `Please find attached our quotation proposal ${quoteNo} for your review. Please feel free to reach out if you have any questions or require any clarification.`,
      '',
      signoff
    ].join('\n');

    expect(emailBody).toContain(`Dear ${customerName},`);
    expect(emailBody).toContain(quoteNo);
    expect(emailBody).toContain('Thanks & Best Regards');
    expect(emailBody).toContain('Mohammed Ali');
    expect(emailBody).toContain('Phone: +974 3344 5566');
    expect(emailBody).toContain('Email: m.ali@welcometech.qa');
  });

  it('formats Proposal Form terms signoff with user designation, phone and email', () => {
    const user = {
      name: 'John Doe',
      role: 'sales_executive',
      phone: '+974 7788 9900',
      email: 'john@welcometech.qa'
    };

    const designation = 'Sales Executive';
    const termsSignoff = [
      'Thanks & Best Regards',
      user.name,
      designation,
      user.phone ? `Phone: ${user.phone}` : '',
      user.email ? `Email: ${user.email}` : ''
    ].filter(Boolean).join('\n');

    expect(termsSignoff).toContain('Thanks & Best Regards');
    expect(termsSignoff).toContain('John Doe');
    expect(termsSignoff).toContain('Sales Executive');
    expect(termsSignoff).toContain('Phone: +974 7788 9900');
    expect(termsSignoff).toContain('Email: john@welcometech.qa');
  });

  it('TC-DOC-SPEC-01: QuotationGeneratorPage contains Sender Email and Contact No input fields in Document Specifications card', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const code = fs.readFileSync(path.resolve(__dirname, '../QuotationGeneratorPage.tsx'), 'utf-8');

    // Verify Sender Email and Contact No state variables exist
    expect(code).toContain('const [senderEmail, setSenderEmail] = useState');
    expect(code).toContain('const [senderPhone, setSenderPhone] = useState');

    // Verify Document Specifications contains Sender Email & Contact No rows
    expect(code).toContain('Sender Email:');
    expect(code).toContain('Contact No:');
    expect(code).toContain('setSenderEmail(e.target.value)');
    expect(code).toContain('setSenderPhone(e.target.value)');

    // Verify inclusion in save payloads
    expect(code).toContain('senderEmail: senderEmail.trim()');
    expect(code).toContain('senderPhone: senderPhone.trim()');
  });

  it('TC-DOC-SPEC-02: Proposal types and backend PDF/HTML support senderEmail and senderPhone in Document Specifications', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const typesCode = fs.readFileSync(path.resolve(__dirname, '../../../types/index.ts'), 'utf-8');
    const pdfCode = fs.readFileSync(path.resolve(__dirname, '../../../../../backend/src/utils/htmlPdfGenerator.ts'), 'utf-8');
    const emailCode = fs.readFileSync(path.resolve(__dirname, '../../../../../backend/src/controllers/crmController.ts'), 'utf-8');

    expect(typesCode).toContain('senderEmail?: string');
    expect(typesCode).toContain('senderPhone?: string');

    expect(pdfCode).toContain('${senderEmail ? `');
    expect(pdfCode).toContain('<span class="meta-label">Sender Email</span>');
    expect(pdfCode).toContain('${senderPhone ? `');
    expect(pdfCode).toContain('<span class="meta-label">Contact No</span>');

    expect(emailCode).toContain('proposal.senderEmail');
    expect(emailCode).toContain('Sender Email');
    expect(emailCode).toContain('proposal.senderPhone');
    expect(emailCode).toContain('Contact No');
  });

  it('TC-DOC-SPEC-03: buildProposalUnifiedData populates senderEmail, senderPhone, and quotationDetails with fallbacks', async () => {
    const { buildProposalUnifiedData } = await import('../MiscPages');
    const legacyProposal = {
      proposalNo: 'IT/QT/8103/20-10-2026',
      total: 5000,
      customerName: 'SAS ENTERPRISES',
      // No senderEmail or senderPhone
    };
    const unified = buildProposalUnifiedData(legacyProposal as any);
    expect(unified.senderEmail).toBeDefined();
    expect(unified.senderEmail).toContain('@');
    expect(unified.senderPhone).toBeDefined();
    expect(unified.senderPhone.length).toBeGreaterThan(0);
    expect(unified.quotationDetails.senderEmail).toBe(unified.senderEmail);
    expect(unified.quotationDetails.senderPhone).toBe(unified.senderPhone);
  });

  it('TC-DOC-SPEC-04: buildQuotationDocumentHtml renders Sender Email and Contact No for legacy proposal preview', async () => {
    const { buildProposalUnifiedData, buildQuotationDocumentHtml } = await import('../MiscPages');
    const legacyProposal = {
      proposalNo: 'IT/QT/8103/20-10-2026',
      total: 5000,
      customerName: 'SAS ENTERPRISES',
    };
    const unified = buildProposalUnifiedData(legacyProposal as any);
    const html = buildQuotationDocumentHtml(unified, unified, { isPrintAutoTrigger: false });
    expect(html).toContain('<span class="meta-label">Sender Email</span>');
    expect(html).toContain('<span class="meta-label">Contact No</span>');
    expect(html).toContain(unified.senderEmail);
    expect(html).toContain(unified.senderPhone);
  });
});
