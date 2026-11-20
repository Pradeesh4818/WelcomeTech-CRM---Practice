import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseProposalNo,
  formatProposalNo,
  incrementProposalNo,
  stripDateSuffix,
  formatProposalSendingDate,
  buildProposalNumber,
  getNextQuotationNumber,
} from '../../../utils/quotationHelpers';
import { useThemeStore } from '../../../store/themeStore';
import { buildQuotationDocumentHtml } from '../MiscPages';

describe('Proposal No Settings, Date Option & Dynamic Quotation Generation', () => {
  describe('1. Frontend Proposal Number Helpers & Date Formatting', () => {
    it('parses and increments pure numeric values', () => {
      const parsed = parseProposalNo('1001');
      expect(parsed).toEqual({ prefix: '', num: 1001, padLength: 4 });
      expect(formatProposalNo(parsed)).toBe('1001');
      expect(incrementProposalNo('1001')).toBe('1002');
      expect(incrementProposalNo('500')).toBe('501');
      expect(incrementProposalNo('0099')).toBe('0100');
    });

    it('parses and increments prefixed proposal numbers (e.g. IT/QT/8101)', () => {
      expect(incrementProposalNo('IT/QT/8101')).toBe('IT/QT/8102');
      expect(incrementProposalNo('WT-Q1001')).toBe('WT-Q1002');
      expect(incrementProposalNo('PROP-0001')).toBe('PROP-0002');
      expect(incrementProposalNo('WT-2026-009')).toBe('WT-2026-010');
    });

    it('strips date suffixes cleanly from proposal numbers', () => {
      expect(stripDateSuffix('IT/QT/8101/15-10-2026')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101/15/10/2026')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101/2026-10-15')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101')).toBe('IT/QT/8101');
    });

    it('formats proposal sending date as DD-MM-YYYY', () => {
      const testDate = new Date(2026, 9, 15);
      expect(formatProposalSendingDate(testDate)).toBe('15-10-2026');
    });

    it('buildProposalNumber correctly handles includeDate option', () => {
      const testDate = new Date(2026, 9, 15);
      expect(buildProposalNumber('IT/QT/8101', false, testDate)).toBe('IT/QT/8101');
      expect(buildProposalNumber('IT/QT/8101', true, testDate)).toBe('IT/QT/8101/15-10-2026');
      expect(buildProposalNumber('IT/QT/8101/01-01-2025', true, testDate)).toBe('IT/QT/8101/15-10-2026');
    });

    it('getNextQuotationNumber uses baseProposalNo and handles includeDate', () => {
      const testDate = new Date(2026, 9, 15);
      expect(getNextQuotationNumber(false, 'IT/QT/8101', false, testDate)).toBe('IT/QT/8101');
      expect(getNextQuotationNumber(false, 'IT/QT/8101', true, testDate)).toBe('IT/QT/8101/15-10-2026');
      expect(getNextQuotationNumber(true, 'IT/QT/8101', false, testDate)).toBe('IT/QT/8102');
      expect(getNextQuotationNumber(true, 'IT/QT/8101', true, testDate)).toBe('IT/QT/8102/15-10-2026');
    });

    it('getNextQuotationNumber defaults to monthly sequence if baseProposalNo is omitted', () => {
      const result = getNextQuotationNumber(false);
      expect(result).toMatch(/^WT-Q\d{6}\d{2,}$/);
    });
  });

  describe('2. Admin Settings General Section UI Verification', () => {
    const settingsPagePath = path.resolve(__dirname, '../SettingsPage.tsx');
    const settingsCode = fs.readFileSync(settingsPagePath, 'utf8');

    it('TC-FE-SETTINGS-01: Contains proposalNo and proposalIncludeDate state in GeneralSettings', () => {
      expect(settingsCode).toContain("proposalNo: settings?.proposalNo || 'WT-Q1001'");
      expect(settingsCode).toContain('proposalNo: settings.proposalNo ?? p.proposalNo');
      expect(settingsCode).toContain('proposalIncludeDate: Boolean(settings?.proposalIncludeDate)');
      expect(settingsCode).toContain('proposalIncludeDate: settings.proposalIncludeDate !== undefined ? Boolean(settings.proposalIncludeDate) : p.proposalIncludeDate');
    });

    it('TC-FE-SETTINGS-02: Renders PROPOSAL NO label, input, and Reset Default button', () => {
      expect(settingsCode).toContain('PROPOSAL NO');
      expect(settingsCode).toContain('Reset Default');
      expect(settingsCode).toContain('Clear Proposal No');
      expect(settingsCode).toContain('value={formData.proposalNo}');
      expect(settingsCode).toContain("onChange={(e) => setFormData(p => ({ ...p, proposalNo: e.target.value }))}");
    });

    it('TC-FE-SETTINGS-03: Renders Append Proposal Sending Date option and Live Format Preview', () => {
      expect(settingsCode).toContain('Append Proposal Sending Date (/DD-MM-YYYY)');
      expect(settingsCode).toContain('Format Preview:');
      expect(settingsCode).toContain('checked={Boolean(formData.proposalIncludeDate)}');
      expect(settingsCode).toContain('onChange={(e) => setFormData(p => ({ ...p, proposalIncludeDate: e.target.checked }))}');
    });

    it('TC-FE-SETTINGS-04: Explains dynamic sequence protocol to administrator', () => {
      expect(settingsCode).toContain('DYNAMIC PROPOSAL NUMBER: New proposals sent to clients will generate sequentially starting from this value onwards.');
    });
  });

  describe('3. Quotation Generator Dynamic Sync Verification', () => {
    const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
    const generatorCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

    it('TC-FE-GEN-01: Initial state and useEffect dynamically read proposalNo and proposalIncludeDate from settings and store', () => {
      expect(generatorCode).toContain('systemSettings?.proposalNo');
      expect(generatorCode).toContain('storeProposalNo');
      expect(generatorCode).toContain('systemSettings?.proposalIncludeDate');
      expect(generatorCode).toContain('storeProposalIncludeDate');
      expect(generatorCode).toContain('buildProposalNumber(effectiveProposalNo, effectiveIncludeDate, todayStr)');
    });

    it('TC-FE-GEN-02: Resolves quoteNo using buildProposalNumber with date option for saving and direct client sending', () => {
      expect(generatorCode).toContain('buildProposalNumber(');
      expect(generatorCode).toContain('activeIncludeDate');
      expect(generatorCode).toContain('quotationDetails.quoteDate');
    });

    it('TC-FE-GEN-03: Synchronizes emailSubject and emailBody with dynamic quote number', () => {
      expect(generatorCode).toContain('setEmailSubject(`Quotation Proposal ${quotationDetails.quoteNo}`);');
      expect(generatorCode).toContain('quotation proposal ${quotationDetails.quoteNo}');
    });
  });

  describe('4. Direct Proposal Template Download & Document HTML Dynamic Rendering', () => {
    const miscPagesPath = path.resolve(__dirname, '../MiscPages.tsx');
    const miscPagesCode = fs.readFileSync(miscPagesPath, 'utf8');

    beforeEach(() => {
      useThemeStore.getState().setProposalSettings({
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: true,
      });
    });

    it('TC-FE-DOC-01: buildQuotationDocumentHtml dynamically uses storeProposalNo when template has no quoteNo (replaces static WT-Q fallback)', () => {
      const dummyTemplate: any = {
        name: 'Enterprise IT Quotation Template',
        blocks: [
          {
            id: 'b1',
            type: 'text',
            title: 'Scope of Work',
            content: '<p>Complete IT infrastructure deployment.</p>',
          },
        ],
      };

      const htmlWithDate = buildQuotationDocumentHtml(dummyTemplate, undefined, { isPrintAutoTrigger: false });
      expect(htmlWithDate).toContain('IT/QT/8100/');
      expect(htmlWithDate).not.toContain('WT-Q20261001');
    });

    it('TC-FE-DOC-02: buildQuotationDocumentHtml omits date suffix when proposalIncludeDate is false', () => {
      useThemeStore.getState().setProposalSettings({
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: false,
      });

      const dummyTemplate: any = {
        name: 'Enterprise IT Quotation Template',
        blocks: [],
      };

      const htmlWithoutDate = buildQuotationDocumentHtml(dummyTemplate, undefined, { isPrintAutoTrigger: false });
      expect(htmlWithoutDate).toContain('IT/QT/8100');
      expect(htmlWithoutDate).not.toContain('IT/QT/8100/');
    });

    it('TC-FE-DOC-03: downloadTemplatePDF refreshes settings from api before writing document', () => {
      expect(miscPagesCode).toContain("api.get('/settings').then((res) => {");
      expect(miscPagesCode).toContain('setProposalSettings({');
      expect(miscPagesCode).toContain('proposalNo: res.data.data.proposalNo');
      expect(miscPagesCode).toContain('proposalIncludeDate: res.data.data.proposalIncludeDate');
    });
  });

  describe('5. Invoice / Quotation Checkbox Date Display Verification', () => {
    it('TC-FE-INV-01: When checkbox is checked, generated invoice displays base serial + sending date', () => {
      useThemeStore.getState().setProposalSettings({
        proposalNo: 'WT/INV/5000',
        proposalIncludeDate: true,
      });

      const invoiceForm: any = {
        quotationDetails: {
          quoteNo: 'WT/INV/5000',
          quoteDate: '2026-10-15',
          proposalIncludeDate: true,
        },
      };

      const html = buildQuotationDocumentHtml({} as any, invoiceForm, { isPrintAutoTrigger: false });
      expect(html).toContain('WT/INV/5000/15-10-2026');
    });

    it('TC-FE-INV-02: When checkbox is unchecked, generated invoice displays base serial only', () => {
      useThemeStore.getState().setProposalSettings({
        proposalNo: 'WT/INV/5000',
        proposalIncludeDate: false,
      });

      const invoiceForm: any = {
        quotationDetails: {
          quoteNo: 'WT/INV/5000',
          quoteDate: '2026-10-15',
          proposalIncludeDate: false,
        },
      };

      const html = buildQuotationDocumentHtml({} as any, invoiceForm, { isPrintAutoTrigger: false });
      expect(html).toContain('WT/INV/5000');
      expect(html).not.toContain('WT/INV/5000/15-10-2026');
    });
  });
});
