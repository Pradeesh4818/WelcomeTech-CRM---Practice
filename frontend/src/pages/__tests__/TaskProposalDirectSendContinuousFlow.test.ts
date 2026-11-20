import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  stripDateSuffix,
  buildProposalNumber,
  formatProposalSendingDate,
  parseProposalNo,
  incrementProposalNo,
} from '../../utils/quotationHelpers';

describe('Task Proposal Continuous Invoice Flow (TaskProposalDirectSendContinuousFlow)', () => {
  const tasksPagePath = path.resolve(__dirname, '../Tasks/TasksPage.tsx');
  const quoteGenPagePath = path.resolve(__dirname, '../Misc/QuotationGeneratorPage.tsx');
  const crmControllerPath = path.resolve(__dirname, '../../../../backend/src/controllers/crmController.ts');

  const tasksContent = fs.readFileSync(tasksPagePath, 'utf8');
  const quoteGenContent = fs.readFileSync(quoteGenPagePath, 'utf8');
  const crmControllerContent = fs.readFileSync(crmControllerPath, 'utf8');

  // ─── 1. Pure Quotation Helpers & Serial Formatting ───────────────
  describe('1. Quotation Helpers Pure Function Tests', () => {
    it('TC-HLP-01: stripDateSuffix strips various date suffix formats', () => {
      expect(stripDateSuffix('WT-Q1001/23-10-2026')).toBe('WT-Q1001');
      expect(stripDateSuffix('WT-Q1001/23/10/2026')).toBe('WT-Q1001');
      expect(stripDateSuffix('WT-Q1001/2026-10-23')).toBe('WT-Q1001');
      expect(stripDateSuffix('WT-Q1001')).toBe('WT-Q1001');
      expect(stripDateSuffix('')).toBe('');
    });

    it('TC-HLP-02: formatProposalSendingDate outputs DD-MM-YYYY format', () => {
      const fixedDate = new Date('2026-10-23T00:00:00.000Z');
      const formatted = formatProposalSendingDate(fixedDate);
      expect(formatted).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    });

    it('TC-HLP-03: buildProposalNumber appends /DD-MM-YYYY when includeDate is true', () => {
      const formatted = buildProposalNumber('WT-Q1001', true, '2026-10-23');
      expect(formatted).toBe('WT-Q1001/23-10-2026');
    });

    it('TC-HLP-04: buildProposalNumber strips old date suffix before appending new date suffix', () => {
      const formatted = buildProposalNumber('WT-Q1001/20-10-2026', true, '2026-10-23');
      expect(formatted).toBe('WT-Q1001/23-10-2026');
    });

    it('TC-HLP-05: buildProposalNumber preserves base serial without date when includeDate is false', () => {
      const formatted = buildProposalNumber('WT-Q1001/20-10-2026', false, '2026-10-23');
      expect(formatted).toBe('WT-Q1001');
    });

    it('TC-HLP-06: parseProposalNo and incrementProposalNo correctly calculate consecutive invoice numbers', () => {
      expect(incrementProposalNo('WT-Q1001')).toBe('WT-Q1002');
      expect(incrementProposalNo('WT-Q1001/23-10-2026')).toBe('WT-Q1002');
      expect(incrementProposalNo('PROP-0099')).toBe('PROP-0100');
    });
  });

  // ─── 2. TasksPage Frontend Integration ───────────────────────────
  describe('2. TasksPage Frontend Integration', () => {
    it('TC-TSK-01: imports Hash and quotation helper functions', () => {
      expect(tasksContent).toContain('Hash,');
      expect(tasksContent).toContain("import { stripDateSuffix, buildProposalNumber } from '../../utils/quotationHelpers';");
    });

    it('TC-TSK-02: handoverForm state defines proposalNo, quoteDate, and existingProposalId', () => {
      expect(tasksContent).toContain("proposalNo: '',");
      expect(tasksContent).toContain("quoteDate: '',");
      expect(tasksContent).toContain('existingProposalId: null as string | null,');
    });

    it('TC-TSK-03: openHandover initializes proposalNo, quoteDate to defaultDate, and existingProposalId to null', () => {
      expect(tasksContent).toContain("proposalNo: '',");
      expect(tasksContent).toContain('quoteDate: defaultDate,');
      expect(tasksContent).toContain('existingProposalId: null,');
    });

    it('TC-TSK-04: queries next-number peek endpoint for active task and quoteDate', () => {
      expect(tasksContent).toContain("queryKey: ['next-proposal-number', handoverForm.quoteDate],");
      expect(tasksContent).toContain("const res = await api.get('/proposals/next-number', {");
      expect(tasksContent).toContain('params: handoverForm.quoteDate ? { date: handoverForm.quoteDate } : {},');
    });

    it('TC-TSK-05: synchronizes existing proposal ID, proposalNo, and quoteDate when draft/sent proposal exists for task', () => {
      expect(tasksContent).toContain('if (latestProposal) {');
      expect(tasksContent).toContain('existingProposalId: latestProposal._id ? String(latestProposal._id) : null,');
      expect(tasksContent).toContain('proposalNo: prev.proposalNo || latestProposal.proposalNo || \'\',');
      expect(tasksContent).toContain('quoteDate: prev.quoteDate || existingQuoteDate || getNowDateTimeStrings().date,');
    });

    it('TC-TSK-06: pre-fills proposalNo from nextProposalData when no prior proposal exists', () => {
      expect(tasksContent).toContain('else if (nextProposalData?.nextProposalNo && !handoverForm.proposalNo) {');
      expect(tasksContent).toContain('proposalNo: nextProposalData.nextProposalNo,');
    });

    it('TC-TSK-07: handleQuoteDateChange dynamically recalculates proposal number date suffix', () => {
      expect(tasksContent).toContain('const handleQuoteDateChange = (newDate: string) => {');
      expect(tasksContent).toContain('const includeDate = Boolean(nextProposalData?.proposalIncludeDate);');
      expect(tasksContent).toContain("const baseNo = stripDateSuffix(prev.proposalNo || nextProposalData?.nextProposalNo || 'WT-Q1001');");
      expect(tasksContent).toContain('const updatedNo = includeDate ? buildProposalNumber(baseNo, true, newDate) : prev.proposalNo;');
      expect(tasksContent).toContain('quoteDate: newDate,');
      expect(tasksContent).toContain('proposalNo: updatedNo,');
    });

    it('TC-TSK-08: handleSendProposal includes id, proposalNo, and quoteDate in /proposals/send-direct payload', () => {
      expect(tasksContent).toContain('id: handoverForm.existingProposalId || undefined,');
      expect(tasksContent).toContain('proposalNo: handoverForm.proposalNo.trim() || undefined,');
      expect(tasksContent).toContain('quoteDate: handoverForm.quoteDate || undefined,');
      expect(tasksContent).toContain("const res = await api.post('/proposals/send-direct', payload);");
    });

    it('TC-TSK-09: updates existingProposalId, proposalNo, and invalidates next-number queries on successful send', () => {
      expect(tasksContent).toContain('existingProposalId: createdProposal?._id ? String(createdProposal._id) : prev.existingProposalId,');
      expect(tasksContent).toContain('proposalNo: createdProposal?.proposalNo || prev.proposalNo,');
      expect(tasksContent).toContain("queryClient.invalidateQueries({ queryKey: ['next-proposal-number'] });");
      expect(tasksContent).toContain("queryClient.invalidateQueries({ queryKey: ['proposals-next-number'] });");
    });

    it('TC-TSK-10: renders INVOICE / PROPOSAL NO and QUOTATION DATE form controls in handover modal', () => {
      expect(tasksContent).toContain('<span>INVOICE / PROPOSAL NO</span>');
      expect(tasksContent).toContain('Existing Draft');
      expect(tasksContent).toContain('Continuous Auto-Seq');
      expect(tasksContent).toContain('value={handoverForm.proposalNo}');
      expect(tasksContent).toContain('<span>QUOTATION DATE</span>');
      expect(tasksContent).toContain('value={handoverForm.quoteDate}');
    });

    it('TC-TSK-11: Full Proposal Editor button passes proposalNo and quoteDate in query parameters', () => {
      expect(tasksContent).toContain("if (handoverForm.proposalNo) qp.set('proposalNo', handoverForm.proposalNo);");
      expect(tasksContent).toContain("if (handoverForm.quoteDate) qp.set('quoteDate', handoverForm.quoteDate);");
      expect(tasksContent).toContain("navigate(`/proposals/new?${qp.toString()}`);");
    });
  });

  // ─── 3. QuotationGeneratorPage Seamless Handover ─────────────────
  describe('3. QuotationGeneratorPage Query Parameter Handover', () => {
    it('TC-GEN-01: extracts paramProposalNo and paramQuoteDate from searchParams', () => {
      expect(quoteGenContent).toContain("const paramProposalNo = searchParams.get('proposalNo');");
      expect(quoteGenContent).toContain("const paramQuoteDate = searchParams.get('quoteDate');");
    });

    it('TC-GEN-02: initializes quotationDetails with paramProposalNo and paramQuoteDate', () => {
      expect(quoteGenContent).toContain('quoteNo: paramProposalNo\n      ? paramProposalNo');
      expect(quoteGenContent).toContain('quoteDate: paramQuoteDate');
    });

    it('TC-GEN-03: retains paramProposalNo in useEffect instead of overwriting with default peek', () => {
      expect(quoteGenContent).toContain('if (paramProposalNo) {\n        return;\n      }');
    });
  });

  // ─── 4. Backend crmController Direct Send Sequence Handling ───────
  describe('4. Backend sendDirectProposalEmail Sequence Handling', () => {
    it('TC-BE-01: preserves, formats, and syncs proposalNo when updating existing proposal', () => {
      expect(crmControllerContent).toContain("if (req.body.proposalNo && typeof req.body.proposalNo === 'string' && req.body.proposalNo.trim()) {");
      expect(crmControllerContent).toContain('updates.proposalNo = buildProposalNumber(req.body.proposalNo.trim(), includeDate, targetDate);');
      expect(crmControllerContent).toContain('await syncProposalNoSequence(updates.proposalNo);');
    });

    it('TC-BE-02: creates new proposal with continuous auto-sequencing when proposalNo is provided or omitted', () => {
      expect(crmControllerContent).toContain('safeBody.proposalNo = buildProposalNumber(req.body.proposalNo.trim(), includeDate, quoteDate);');
      expect(crmControllerContent).toContain('safeBody.proposalNo = await getAndIncrementNextProposalNo(quoteDate);');
      expect(crmControllerContent).toContain('await syncProposalNoSequence(safeBody.proposalNo);');
    });

    it('TC-BE-03: updates quoteDate to Date instance on both update and create paths', () => {
      expect(crmControllerContent).toContain('if (updates.quoteDate) updates.quoteDate = new Date(updates.quoteDate);');
      expect(crmControllerContent).toContain('const quoteDate = req.body.quoteDate ? new Date(req.body.quoteDate) : (req.body.proposalDate ? new Date(req.body.proposalDate) : new Date());');
    });
  });
});
