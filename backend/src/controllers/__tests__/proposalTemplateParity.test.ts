import { describe, it, expect } from 'vitest';
import { buildProposalEmailHtml } from '../crmController';
import { buildProposalFullHtml } from '../../utils/htmlPdfGenerator';

describe('Proposal Template Parity & Banner Fallback', () => {
  const settings = {
    companyName: 'Welcome Trading Co. W.L.L',
    currency: 'QAR',
    brandColor: '#6d28d9',
    proposalHeaderImage: 'https://cdn.example.com/settings-header.png',
    proposalFooterImage: 'https://cdn.example.com/settings-footer.png',
  };

  const entity = {
    name: 'Al Rayyan Construction',
    email: 'contact@alrayyan.test',
    phone: '+974 5555 1234',
    address: 'Doha, Qatar',
  };

  const templateTransport = {
    _id: 'template_transport_1',
    name: 'Transport Logistics',
    title: 'Heavy Haulage Proposal',
    templateImage: 'https://cdn.example.com/transport-header.png',
    templateFooterImage: 'https://cdn.example.com/transport-footer.png',
    validForDays: 14,
    terms: 'Payment 30 days net.',
    companyInfo: {
      name: 'Welcome Tech Transport Division',
      addressLine1: 'Industrial Area St 41',
      addressLine2: 'Doha, Qatar',
      contactNo: '+974 4400 9999',
      email: 'logistics@welcometech.qa',
    },
  };

  const defaultTemplate = {
    _id: 'template_general_default',
    name: 'General Commercial',
    title: 'Standard Commercial Quotation',
    templateImage: 'https://cdn.example.com/general-header.png',
    templateFooterImage: 'https://cdn.example.com/general-footer.png',
    validForDays: 10,
    terms: 'Standard commercial terms apply.',
  };

  it('TC1: Empty string templateImage on proposal does NOT blank out template header in PDF renderer', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-001',
      title: 'Transport Logistics Quotation',
      templateImage: '', // Mongoose default empty string
      templateFooterImage: '',
      items: [{ description: 'Heavy Vehicle Fleet Maintenance', qty: 2, unitPrice: 1500, total: 3000 }],
    };

    const pdfHtml = buildProposalFullHtml({
      proposal,
      entity,
      settings,
      defaultTemplate: templateTransport,
    });

    // Should inherit the template header and footer rather than blanking them
    expect(pdfHtml).toContain('https://cdn.example.com/transport-header.png');
    expect(pdfHtml).toContain('https://cdn.example.com/transport-footer.png');
    expect(pdfHtml).toContain('Heavy Vehicle Fleet Maintenance');
    expect(pdfHtml).toContain('Payment 30 days net.');
  });

  it('TC2: Populated proposal.template takes precedence over defaultTemplate in PDF renderer', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-002',
      title: 'Transport Quotation',
      template: templateTransport, // Populated template document
      items: [{ description: 'Freight Cargo', qty: 1, unitPrice: 5000, total: 5000 }],
    };

    const pdfHtml = buildProposalFullHtml({
      proposal,
      entity,
      settings,
      defaultTemplate, // Should not use General Commercial banners
    });

    expect(pdfHtml).toContain('https://cdn.example.com/transport-header.png');
    expect(pdfHtml).toContain('https://cdn.example.com/transport-footer.png');
    expect(pdfHtml).not.toContain('https://cdn.example.com/general-header.png');
  });

  it('TC3: Empty string templateImage on proposal does NOT blank out template banners in email HTML', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-003',
      title: 'Logistics Proposal',
      templateImage: '   ', // whitespace/empty
      templateFooterImage: '',
      items: [{ description: 'Courier Service', qty: 10, unitPrice: 50, total: 500 }],
    };

    const emailHtml = buildProposalEmailHtml(
      proposal,
      entity,
      settings,
      entity.email,
      'Quotation for your review',
      templateTransport,
      undefined,
      true, // includeProposalBody
      undefined
    );

    expect(emailHtml).toContain('https://cdn.example.com/transport-header.png');
    expect(emailHtml).toContain('https://cdn.example.com/transport-footer.png');
  });

  it('TC4: Proposal with only legacy items and terms synthesizes proper table and terms blocks in PDF', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-004',
      title: 'Legacy Proposal Migration Test',
      items: [
        { description: 'Civil Engineering Work', qty: 3, unitPrice: 2000, total: 6000 },
      ],
      terms: 'Strictly 50% advance upon contract signing.',
      blocks: [], // Empty blocks array
    };

    const pdfHtml = buildProposalFullHtml({
      proposal,
      entity,
      settings,
      defaultTemplate,
    });

    expect(pdfHtml).toContain('Civil Engineering Work');
    expect(pdfHtml).toContain('QAR 6,000.00');
    expect(pdfHtml).toContain('Strictly 50% advance upon contract signing.');
  });
});
