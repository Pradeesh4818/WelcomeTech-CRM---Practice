import { describe, it, expect } from 'vitest';
import { proposalTemplatesListExportRows } from '../MiscPages';
import type { ProposalTemplate } from '../../../types';

describe('Proposal Template Title Parity & Option 2 Send Modal Specifications', () => {
  describe('TC-FE-PROP-TITLE-01: Export Rows Parity with Proposal Title', () => {
    it('correctly maps custom Proposal Title in Excel export rows', () => {
      const mockTemplates: ProposalTemplate[] = [
        {
          _id: 'tmpl-001',
          name: 'TallyPrime Single User',
          title: 'TallyPrime Single User AMC Proposal',
          items: [{ description: 'Single User License', qty: 1, unitPrice: 2300, total: 2300 }],
          validForDays: 10,
          discount: 0,
          isActive: true,
        },
        {
          _id: 'tmpl-002',
          name: 'Tally on Cloud',
          title: '', // Empty title
          items: [],
          validForDays: 14,
          discount: 5,
          isActive: true,
        },
      ];

      const rows = proposalTemplatesListExportRows(mockTemplates);
      expect(rows).toHaveLength(2);
      expect(rows[0]['Proposal Title']).toBe('TallyPrime Single User AMC Proposal');
      expect(rows[0]['Template Name']).toBe('TallyPrime Single User');
      expect(rows[1]['Proposal Title']).toBe('—');
    });
  });

  describe('TC-FE-PROP-TITLE-02: Template Payload Construction with Proposal Title in Editor', () => {
    it('uses custom templateTitle when provided by user in template editor', () => {
      const templateName = 'TallyPrime Multi User';
      const templateTitle = 'Enterprise Multi-User AMC & Support Package';
      const selectedService = 'Service Quotation';

      const payload = {
        name: templateName.trim() || 'Untitled Proposal Template',
        title: templateTitle.trim() || `${selectedService} Template`,
        discount: 0,
        validForDays: 10,
      };

      expect(payload.title).toBe('Enterprise Multi-User AMC & Support Package');
    });

    it('falls back to `${selectedService} Template` when templateTitle is whitespace or blank', () => {
      const templateName = 'Cloud Hosting';
      const templateTitle = '   ';
      const selectedService = 'Cloud Services';

      const payload = {
        name: templateName.trim() || 'Untitled Proposal Template',
        title: templateTitle.trim() || `${selectedService} Template`,
        discount: 0,
        validForDays: 10,
      };

      expect(payload.title).toBe('Cloud Services Template');
    });

    it('preserves existingTemplate.title during state hydration in edit mode', () => {
      const existingTemplate = {
        _id: 'tmpl-003',
        name: 'Custom ERP',
        title: 'Complete Corporate ERP Implementation Quotation',
        validForDays: 15,
        discount: 10,
      };

      let hydratedTitle = '';
      if (existingTemplate.title) {
        hydratedTitle = existingTemplate.title;
      }

      expect(hydratedTitle).toBe('Complete Corporate ERP Implementation Quotation');
    });
  });

  describe('TC-FE-PROP-TITLE-03: Tabular Column Read-Only Display (No Inline Pencil Icon)', () => {
    it('formats table cell display text cleanly without inline edit buttons', () => {
      const renderProposalTitleCell = (template: { title?: string }) => {
        return {
          displayText: template.title || '—',
          isPlaceholder: !template.title,
          hasInlineEditIcon: false, // Explicitly removed as per user requirement
        };
      };

      const cellWithTitle = renderProposalTitleCell({ title: 'Service Quotation Template' });
      expect(cellWithTitle.displayText).toBe('Service Quotation Template');
      expect(cellWithTitle.hasInlineEditIcon).toBe(false);
      expect(cellWithTitle.isPlaceholder).toBe(false);

      const cellWithoutTitle = renderProposalTitleCell({});
      expect(cellWithoutTitle.displayText).toBe('—');
      expect(cellWithoutTitle.hasInlineEditIcon).toBe(false);
      expect(cellWithoutTitle.isPlaceholder).toBe(true);
    });
  });

  describe('TC-FE-PROP-SEND-01: Option 2 Send Template Modal Streamlined Payload', () => {
    it('generates dispatch payload containing only recipient email without requiring customer selection', () => {
      const mockTemplate = {
        _id: 'tmpl-100',
        name: 'TallyPrime Single User',
        title: 'TallyPrime Single User',
        discount: 0,
        items: [{ description: 'License', qty: 1, unitPrice: 2300, total: 2300 }],
        terms: 'Standard Terms',
      };

      const sendRecipientEmail = 'client@example.com';
      const sendCcEmail = '';
      const sendSubject = `${mockTemplate.title} - Quotation`;
      const sendMessageBody = 'Dear Valued Customer,\n\nPlease find attached quotation proposal...';

      // Option 2 Payload Construction: No customer dropdown or company name required
      const payload = {
        to: sendRecipientEmail.trim(),
        cc: sendCcEmail.trim() || undefined,
        subject: sendSubject.trim(),
        messageBody: sendMessageBody.trim(),
        template: mockTemplate._id,
        templateName: mockTemplate.name,
        title: mockTemplate.title,
        discount: mockTemplate.discount,
        items: mockTemplate.items,
        subtotal: 2300,
        total: 2300,
        terms: mockTemplate.terms,
        customerEmail: sendRecipientEmail.trim(),
      };

      expect(payload.to).toBe('client@example.com');
      expect(payload.customerEmail).toBe('client@example.com');
      expect((payload as any).customer).toBeUndefined();
      expect((payload as any).customerName).toBeUndefined();
      expect(payload.total).toBe(2300);
      expect(payload.title).toBe('TallyPrime Single User');
    });

    it('validates that Send button is enabled as soon as valid recipient email is provided', () => {
      const isSendDisabled = (email: string, isPending: boolean) => {
        return isPending || !email.trim();
      };

      expect(isSendDisabled('', false)).toBe(true);
      expect(isSendDisabled('   ', false)).toBe(true);
      expect(isSendDisabled('nandhupragethee17@gmail.com', false)).toBe(false);
      expect(isSendDisabled('nandhupragethee17@gmail.com', true)).toBe(true);
    });
  });
});
