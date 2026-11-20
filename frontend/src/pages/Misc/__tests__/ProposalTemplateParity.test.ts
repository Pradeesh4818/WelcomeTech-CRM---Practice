import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveProposalTemplate,
  buildProposalUnifiedData,
} from '../MiscPages';

describe('Frontend Proposal Template Parity & Unified Document Data', () => {
  const defaultTemplate = {
    _id: 'default_template_id',
    name: 'General Commercial',
    title: 'Standard Commercial Quotation',
    templateImage: 'https://cdn.example.com/default-header.png',
    templateFooterImage: 'https://cdn.example.com/default-footer.png',
    validForDays: 10,
    terms: 'Default terms and conditions.',
  };

  const transportTemplate = {
    _id: 'transport_template_id',
    name: 'Transport Logistics',
    title: 'Heavy Transport Logistics',
    templateImage: 'https://cdn.example.com/transport-header.png',
    templateFooterImage: 'https://cdn.example.com/transport-footer.png',
    validForDays: 15,
    terms: 'Transport terms: fuel surcharge applies.',
    companyInfo: {
      name: 'Welcome Tech Logistics',
      addressLine1: 'St 41, Industrial Area',
      contactNo: '+974 4411 2233',
    },
  };

  const templatesList = [defaultTemplate, transportTemplate];

  describe('resolveEffectiveProposalTemplate', () => {
    it('TC1: resolves when proposal.template is a populated object', () => {
      const p = { template: transportTemplate };
      const resolved = resolveEffectiveProposalTemplate(p, templatesList, defaultTemplate);
      expect(resolved).toEqual(transportTemplate);
    });

    it('TC2: resolves when proposal.template is an ObjectId string matching a template', () => {
      const p = { template: 'transport_template_id' };
      const resolved = resolveEffectiveProposalTemplate(p, templatesList, defaultTemplate);
      expect(resolved).toEqual(transportTemplate);
    });

    it('TC3: resolves when proposal.templateName matches a template name', () => {
      const p = { templateName: 'Transport Logistics' };
      const resolved = resolveEffectiveProposalTemplate(p, templatesList, defaultTemplate);
      expect(resolved).toEqual(transportTemplate);
    });

    it('TC4: falls back to defaultTemplate when no template is matched', () => {
      const p = {};
      const resolved = resolveEffectiveProposalTemplate(p, templatesList, defaultTemplate);
      expect(resolved).toEqual(defaultTemplate);
    });
  });

  describe('buildProposalUnifiedData', () => {
    it('TC5: inherits templateImage and templateFooterImage from effective template when proposal.templateImage is empty string', () => {
      const p: any = {
        proposalNo: 'WT-Q2026-101',
        title: 'Haulage Service',
        template: 'transport_template_id',
        templateImage: '', // Mongoose default empty string
        templateFooterImage: '',
        items: [{ description: 'Trailer Flatbed', qty: 2, unitPrice: 1200, total: 2400 }],
      };

      const unified = buildProposalUnifiedData(p, templatesList, defaultTemplate);
      expect(unified.templateImage).toBe('https://cdn.example.com/transport-header.png');
      expect(unified.templateFooterImage).toBe('https://cdn.example.com/transport-footer.png');
      expect(unified.companyInfo?.name).toBe('Welcome Tech Logistics');
    });

    it('TC6: synthesizes table and terms blocks when proposal only has legacy items and terms', () => {
      const p: any = {
        proposalNo: 'WT-Q2026-102',
        title: 'Crane Rental',
        discount: 5,
        items: [
          { description: '50-ton Mobile Crane', qty: 1, unitPrice: 3500, total: 3500 },
        ],
        terms: 'Site inspection required 24 hours prior.',
        blocks: [], // Empty blocks
      };

      const unified = buildProposalUnifiedData(p, templatesList, defaultTemplate);
      expect(unified.blocks).toBeDefined();
      expect(unified.blocks.length).toBe(2);

      const tableBlock = unified.blocks.find((b: any) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock.items[0].description).toBe('50-ton Mobile Crane');
      expect(tableBlock.discountPercent).toBe(5);

      const termsBlock = unified.blocks.find((b: any) => b.type === 'text');
      expect(termsBlock).toBeDefined();
      expect(termsBlock.title).toBe('Terms & Conditions');
      expect(termsBlock.content).toBe('Site inspection required 24 hours prior.');
    });

    it('TC7: normalizes revision number in quoteNo', () => {
      const p: any = {
        proposalNo: 'WT-Q2026-103',
        revision: 2,
        items: [{ description: 'Service Item', qty: 1, unitPrice: 100 }],
      };

      const unified = buildProposalUnifiedData(p, templatesList, defaultTemplate);
      expect(unified.quotationDetails.quoteNo).toBe('WT-Q2026-103 (Rev 2)');
    });

    it('TC8: customer details resolved correctly from customer object or flat properties', () => {
      const p: any = {
        proposalNo: 'WT-Q2026-104',
        customer: {
          name: 'Qatar Industrial Corp',
          companyInfo: { fullAddress: 'Ras Laffan' },
          primaryContactInfo: { phone: '+974 4455 6677', email: 'procurement@qic.qa' },
        },
        items: [{ description: 'Supply Contract', qty: 1, unitPrice: 1000 }],
      };

      const unified = buildProposalUnifiedData(p, templatesList, defaultTemplate);
      expect(unified.customerDetails.companyName).toBe('Qatar Industrial Corp');
      expect(unified.customerDetails.addressLine1).toBe('Ras Laffan');
      expect(unified.customerDetails.phone).toBe('+974 4455 6677');
      expect(unified.customerDetails.email).toBe('procurement@qic.qa');
    });
  });
});
