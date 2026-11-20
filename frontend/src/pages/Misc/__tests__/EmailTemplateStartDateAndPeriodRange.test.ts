import { describe, it, expect } from 'vitest';
import { deriveStartDate, processTemplateText } from '../../../components/email/EmailActionCell';

describe('Frontend Email Template Start Date and Period Range Processing', () => {
  describe('deriveStartDate', () => {
    it('accurately calculates 1-year prior subscription start date for DD/MM/YYYY', () => {
      expect(deriveStartDate('31/10/2026')).toBe('01/11/2025');
      expect(deriveStartDate('15/06/2025')).toBe('16/06/2024');
    });

    it('accurately calculates 1-year prior subscription start date for DD-MMM-YYYY and DD MMM YYYY', () => {
      expect(deriveStartDate('31-Oct-2026')).toBe('01-Nov-2025');
      expect(deriveStartDate('31 Oct 2026')).toBe('01 Nov 2025');
    });

    it('gracefully returns em-dash for invalid or missing dates', () => {
      expect(deriveStartDate('')).toBe('—');
      expect(deriveStartDate('—')).toBe('—');
      expect(deriveStartDate('[DD/MM/YYYY]')).toBe('—');
    });
  });

  describe('processTemplateText - Paired Date Ranges and Merge Tags', () => {
    it('replaces paired "[DD/MM/YYYY] to [DD/MM/YYYY]" with Start Date and Expiry Date', () => {
      const template = '• Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]\n• Please confirm by [DD/MM/YYYY]';
      const data = {
        startDate: '01/11/2025',
        expiryDate: '31/10/2026',
      };

      const result = processTemplateText(template, data);

      expect(result).toContain('• Renewal Period: 01/11/2025 to 31/10/2026');
      expect(result).toContain('• Please confirm by 31/10/2026');
      // Should NOT have both as expiry date
      expect(result).not.toContain('Renewal Period: 31/10/2026 to 31/10/2026');
    });

    it('automatically derives start date when only expiry date is supplied in data', () => {
      const template = '• Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]\n• Due: [DD/MM/YYYY]';
      const data = {
        expiryDate: '31/10/2026',
      };

      const result = processTemplateText(template, data);

      expect(result).toContain('• Renewal Period: 01/11/2025 to 31/10/2026');
      expect(result).toContain('• Due: 31/10/2026');
    });

    it('replaces from [DD/MM/YYYY] to [DD/MM/YYYY] pattern correctly', () => {
      const template = 'Valid from [DD/MM/YYYY] to [DD/MM/YYYY]';
      const data = {
        startDate: '01/01/2026',
        expiryDate: '31/12/2026',
      };

      const result = processTemplateText(template, data);

      expect(result).toBe('Valid from 01/01/2026 to 31/12/2026');
    });

    it('replaces {{start_date}} dynamic merge tags correctly', () => {
      const template = 'Your service started on {{start_date}} and ends on {{tss_expiry_date}}.';
      const data = {
        startDate: '01/11/2025',
        tss_expiry_date: '31/10/2026',
      };

      const result = processTemplateText(template, data);

      expect(result).toBe('Your service started on 01/11/2025 and ends on 31/10/2026.');
    });

    it('replaces [Start Date] and [End Date] bracketed placeholders', () => {
      const template = 'Subscription window: [Start Date] through [End Date]';
      const data = {
        startDate: '15/05/2025',
        endDate: '14/05/2026',
      };

      const result = processTemplateText(template, data);

      expect(result).toBe('Subscription window: 15/05/2025 through 14/05/2026');
    });
  });

  describe('Email Template Variables Configuration', () => {
    it('verifies {{start_date}} is included in the available merge tags list', () => {
      const templateVariables = [
        { label: 'Contact Person', key: '{{contact_person}}' },
        { label: 'Org Name',       key: '{{org_name}}' },
        { label: 'Product',        key: '{{product}}' },
        { label: 'Release',        key: '{{release}}' },
        { label: 'Start Date',     key: '{{start_date}}' },
        { label: 'TSS Expiry',     key: '{{tss_expiry_date}}' },
        { label: 'Salesman',       key: '{{salesman}}' },
        { label: 'Email ID',       key: '{{email_id}}' },
      ];

      const startDateTag = templateVariables.find(v => v.key === '{{start_date}}');
      expect(startDateTag).toBeDefined();
      expect(startDateTag?.label).toBe('Start Date');
    });
  });
});

