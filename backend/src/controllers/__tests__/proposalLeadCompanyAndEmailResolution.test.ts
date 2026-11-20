import { describe, it, expect } from 'vitest';
import { buildProposalEmailHtml } from '../crmController';
import { buildProposalFullHtml } from '../../utils/htmlPdfGenerator';

describe('Proposal PDF & Email Recipient Resolution — Lead & Customer parity', () => {
  const settings = {
    companyName: 'Welcome Trading Co. W.L.L',
    currency: 'QAR',
    brandColor: '#722580',
    country: 'QA',
  };

  it('TC1: For a Lead entity, companyName is used as the company and name is used as contact person', () => {
    const leadEntity = {
      _id: 'lead-123',
      name: 'Mr. Hilal', // Contact person
      companyName: 'Al Hilal Limousine', // Company name
      email: 'hilkha@gmail.com',
      phone: '+97433655453',
      fullAddress: 'Doha, Qatar',
    };

    const proposal: any = {
      proposalNo: 'IT/QT/8105/02-11-2026',
      title: 'Limousine IT Services',
      customerName: 'Al Hilal Limousine',
      customerContactPerson: 'Mr. Hilal',
      customerEmail: 'hilkha@gmail.com',
      customerPhone: '+97433655453',
      items: [{ description: 'GPS Tracking System', qty: 1, unitPrice: 1500, total: 1500 }],
      total: 1500,
    };

    const pdfHtml = buildProposalFullHtml({ proposal, entity: leadEntity, settings });

    // PDF Recipient Information Card must display company name, NOT the contact person's name as the company
    expect(pdfHtml).toContain('Al Hilal Limousine');
    expect(pdfHtml).toContain('Mr. Hilal');
    expect(pdfHtml).toContain('hilkha@gmail.com');
    expect(pdfHtml).toContain('+97433655453');

    // Email HTML must also display the company name as recipient
    const emailHtml = buildProposalEmailHtml(proposal, leadEntity, settings, 'hilkha@gmail.com');
    expect(emailHtml).toContain('Al Hilal Limousine');
    expect(emailHtml).toContain('Mr. Hilal');
    expect(emailHtml).toContain('hilkha@gmail.com');
  });

  it('TC2: When proposal.customerName is set, it takes precedence over entity.name', () => {
    const leadEntity = {
      name: 'Mr. Hilal',
      companyName: 'Al Hilal Limousine',
      email: 'hilkha@gmail.com',
    };

    const proposal: any = {
      proposalNo: 'IT/QT/8105/02-11-2026',
      customerName: 'Al Hilal Limousine W.L.L',
      customerEmail: 'hilkha@gmail.com',
      items: [{ description: 'Software', qty: 1, unitPrice: 1000, total: 1000 }],
      total: 1000,
    };

    const pdfHtml = buildProposalFullHtml({ proposal, entity: leadEntity, settings });
    expect(pdfHtml).toContain('Al Hilal Limousine W.L.L');
    expect(pdfHtml).toContain('hilkha@gmail.com');

    const emailHtml = buildProposalEmailHtml(proposal, leadEntity, settings);
    expect(emailHtml).toContain('Al Hilal Limousine W.L.L');
    expect(emailHtml).toContain('hilkha@gmail.com');
  });

  it('TC3: For an existing Customer entity, customer.name is the company name and customer.contact is the contact person', () => {
    const customerEntity = {
      _id: 'cust-456',
      name: 'Arabian Print Co.',
      contact: 'Ahmed Al-Mansoor',
      email: 'contact@arabianprint.qa',
      phone: '+974 5511 2233',
      address: 'Industrial Area, Doha',
    };

    const proposal: any = {
      proposalNo: 'WT-Q2026-999',
      title: 'Tally Prime Renewal',
      customer: customerEntity._id,
      items: [{ description: 'TSS 1 Year', qty: 1, unitPrice: 1500, total: 1500 }],
      total: 1500,
    };

    const pdfHtml = buildProposalFullHtml({ proposal, entity: customerEntity, settings });
    expect(pdfHtml).toContain('Arabian Print Co.');
    expect(pdfHtml).toContain('Ahmed Al-Mansoor');
    expect(pdfHtml).toContain('contact@arabianprint.qa');

    const emailHtml = buildProposalEmailHtml(proposal, customerEntity, settings);
    expect(emailHtml).toContain('Arabian Print Co.');
    expect(emailHtml).toContain('Ahmed Al-Mansoor');
    expect(emailHtml).toContain('contact@arabianprint.qa');
  });

  it('TC4: Email is correctly populated from proposal.customerEmail or recipientEmail when entity.email is missing', () => {
    const leadWithoutEmail = {
      name: 'John Doe',
      companyName: 'NoEmail Corp',
      phone: '+974 1122 3344',
    };

    const proposal: any = {
      proposalNo: 'WT-Q2026-000',
      customerName: 'NoEmail Corp',
      customerEmail: 'manual@noemail.qa',
      items: [{ description: 'Service', qty: 1, unitPrice: 500, total: 500 }],
      total: 500,
    };

    const pdfHtml = buildProposalFullHtml({ proposal, entity: leadWithoutEmail, settings });
    expect(pdfHtml).toContain('NoEmail Corp');
    expect(pdfHtml).toContain('manual@noemail.qa');

    const emailHtml = buildProposalEmailHtml(proposal, leadWithoutEmail, settings, 'fallback@recipient.qa');
    expect(emailHtml).toContain('NoEmail Corp');
    expect(emailHtml).toContain('manual@noemail.qa');
  });
});

