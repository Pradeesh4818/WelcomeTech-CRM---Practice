import { describe, it, expect } from 'vitest';
import { buildProposalUnifiedData, buildQuotationDocumentHtml } from '../MiscPages';

describe('Proposal Contact Name Integration', () => {
  it('extracts customerContactPerson from proposal.customerContactPerson', () => {
    const proposal = {
      proposalNo: 'WT-Q1001',
      customerName: 'Acme Corporation',
      customerContactPerson: 'John Doe',
      customerEmail: 'john@acme.com',
      customerPhone: '+974 5555 1234',
    };

    const unified = buildProposalUnifiedData(proposal);
    expect(unified.customerContactPerson).toBe('John Doe');
    expect(unified.customerDetails.contactName).toBe('John Doe');
    expect(unified.customerDetails.contactPerson).toBe('John Doe');
  });

  it('extracts customerContactPerson from customer.contact or primaryContactInfo', () => {
    const proposalWithCustomer = {
      proposalNo: 'WT-Q1002',
      customer: {
        _id: 'cust-123',
        name: 'Tech Solutions LLC',
        contact: 'Sarah Jenkins',
        primaryContactInfo: {
          contactName1: 'Sarah Jenkins',
          email: 'sarah@techsolutions.qa',
          mobile: '+974 6666 4321',
        },
      },
    };

    const unified = buildProposalUnifiedData(proposalWithCustomer);
    expect(unified.customerContactPerson).toBe('Sarah Jenkins');
    expect(unified.customerDetails.contactName).toBe('Sarah Jenkins');
  });

  it('extracts customerContactPerson from lead (lead.name when companyName is present)', () => {
    const proposalWithLead = {
      proposalNo: 'WT-Q1003',
      lead: {
        _id: 'lead-456',
        companyName: 'Fix It Auto Repair',
        name: 'Abdulla',
        email: 'fixitauto.qa@gmail.com',
        phone: '+974 5554 5526',
      },
    };

    const unified = buildProposalUnifiedData(proposalWithLead);
    expect(unified.customerContactPerson).toBe('Abdulla');
    expect(unified.customerDetails.contactName).toBe('Abdulla');
    expect(unified.customerDetails.companyName).toBe('Fix It Auto Repair');
  });

  it('renders Contact Name row in buildQuotationDocumentHtml when present', () => {
    const proposal = {
      proposalNo: 'WT-Q1004',
      customerName: 'Namachivayam Welcometech',
      customerContactPerson: 'Namachivayam',
      customerEmail: 'namachivayam.welcometech@gmail.com',
      customerPhone: '+974 6603 2346',
      blocks: [],
      items: [],
    };

    const unified = buildProposalUnifiedData(proposal);
    const html = buildQuotationDocumentHtml(unified);

    expect(html).toContain('Recipient Information');
    expect(html).toContain('Contact Name');
    expect(html).toContain('Namachivayam');
    expect(html).toContain('grid-template-columns:100px 12px 1fr');
  });

  it('omits Contact Name row in buildQuotationDocumentHtml when not provided', () => {
    const proposal = {
      proposalNo: 'WT-Q1005',
      customerName: 'Acme Corp',
      customerEmail: 'contact@acme.com',
      customerPhone: '+974 1234 5678',
      blocks: [],
      items: [],
    };

    const unified = buildProposalUnifiedData(proposal);
    const html = buildQuotationDocumentHtml(unified);

    expect(html).toContain('Recipient Information');
    expect(html).not.toContain('Contact Name');
    expect(html).toContain('contact@acme.com');
  });
});

