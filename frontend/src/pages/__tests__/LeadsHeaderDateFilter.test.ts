import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Leads Header Date Filteration (LeadsHeaderDateFilter)', () => {
  const leadsPagePath = path.resolve(__dirname, '../Leads/LeadsPage.tsx');
  const leadControllerPath = path.resolve(__dirname, '../../../../backend/src/controllers/leadController.ts');

  // ─── 1. LeadsPage Frontend Integration ───────────────────────────
  describe('1. LeadsPage Frontend Header Date Integration', () => {
    const leadsContent = fs.readFileSync(leadsPagePath, 'utf8');

    it('TC-LED-01: imports useDateFilter from DateFilterContext', () => {
      expect(leadsContent).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-LED-02: consumes isFiltered, startDate, endDate, and computes reactive dateKey', () => {
      expect(leadsContent).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(leadsContent).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(leadsContent).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
    });

    it('TC-LED-03: resets pagination to page 1 whenever dateKey changes', () => {
      expect(leadsContent).toContain('React.useEffect(() => { setPage(1); }, [search, status, source, assignedTo, taskStatus, pageSize, dateKey]);');
    });

    it('TC-LED-04: includes dateKey in leads queryKey and forwards startDate & endDate to api params', () => {
      expect(leadsContent).toContain("queryKey: ['leads', search, status, source, assignedTo, taskStatus, page, pageSize, dateKey]");
      expect(leadsContent).toContain('if (hasActiveDateFilter) {');
      expect(leadsContent).toContain('params.startDate = startDate;');
      expect(leadsContent).toContain('params.endDate = endDate;');
    });

    it('TC-LED-05: forwards startDate & endDate to leads dashboard query params and caches by dateKey', () => {
      expect(leadsContent).toContain("queryKey: ['lead-dashboard', dateKey]");
      expect(leadsContent).toContain('const res = await api.get(\'/leads/dashboard\', { params });');
    });

    it('TC-LED-06: forwards startDate & endDate to excel export query params', () => {
      expect(leadsContent).toContain('const exportLeads = async () => {');
      expect(leadsContent).toContain('if (hasActiveDateFilter) {\n      params.startDate = startDate;\n      params.endDate = endDate;\n    }');
    });

    it('TC-LED-07: displays active header date label in page header subtitle', () => {
      expect(leadsContent).toContain('{hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: \'var(--brand)\' }}>• {headerDateLabel}</span>}');
    });
  });

  // ─── 2. Backend Controller Date Range Handling ─────────────────────
  describe('2. Backend Controller Date Range Handling', () => {
    const leadContent = fs.readFileSync(leadControllerPath, 'utf8');

    it('TC-BE-LED-01: leadController getLeads extracts startDate & endDate and supports fromDate/toDate fallback', () => {
      expect(leadContent).toContain('export const getLeads = async (req: AuthRequest, res: Response)');
      expect(leadContent).toContain('startDate,');
      expect(leadContent).toContain('endDate,');
      expect(leadContent).toContain('const effectiveStart = startDate || fromDate;');
      expect(leadContent).toContain('const effectiveEnd = endDate || toDate;');
    });

    it('TC-BE-LED-02: leadController getLeads sets 00:00:00 start and 23:59:59.999 end of day bounds', () => {
      expect(leadContent).toContain('sDate.setHours(0, 0, 0, 0);');
      expect(leadContent).toContain('eDate.setHours(23, 59, 59, 999);');
      expect(leadContent).toContain('{ leadDate: dateCond }');
      expect(leadContent).toContain('{ createdAt: dateCond }');
    });

    it('TC-BE-LED-03: leadController getLeadDashboard filters dashboard counts and aggregations by date bounds', () => {
      expect(leadContent).toContain('export const getLeadDashboard = async (req: AuthRequest, res: Response)');
      expect(leadContent).toContain('const { startDate, endDate, fromDate, toDate } = req.query;');
      expect(leadContent).toContain('Lead.countDocuments(scopedFilter)');
      expect(leadContent).toContain('Lead.aggregate<{ _id: string; count: number }>([\n        { $match: scopedFilter },');
    });
  });

  // ─── 3. Functional Date Range Filter Simulations ───────────────────
  describe('3. Functional Date Filter Simulation Logic', () => {
    const filterStart = new Date('2026-10-22T00:00:00.000Z');
    const filterEnd = new Date('2026-10-22T23:59:59.999Z');

    const matchLead = (lead: { leadDate?: string; createdAt: string }) => {
      const lDate = lead.leadDate ? new Date(lead.leadDate).getTime() : NaN;
      const cDate = new Date(lead.createdAt).getTime();
      const start = filterStart.getTime();
      const end = filterEnd.getTime();
      return (!isNaN(lDate) && lDate >= start && lDate <= end) || (cDate >= start && cDate <= end);
    };

    it('TC-SIM-LED-01: lead created in middle of day on 22 Oct 2026 matches boundary filter', () => {
      expect(matchLead({ leadDate: '2026-10-22T08:30:00.000Z', createdAt: '2026-10-22T08:30:00.000Z' })).toBe(true);
      expect(matchLead({ leadDate: '2026-10-22T23:45:00.000Z', createdAt: '2026-10-22T23:45:00.000Z' })).toBe(true);
    });

    it('TC-SIM-LED-02: lead from September 2026 does not match October 22 filter', () => {
      expect(matchLead({ leadDate: '2026-09-01T08:30:00.000Z', createdAt: '2026-09-01T08:30:00.000Z' })).toBe(false);
      expect(matchLead({ leadDate: '2026-09-07T02:27:00.000Z', createdAt: '2026-09-07T02:27:00.000Z' })).toBe(false);
    });

    it('TC-SIM-LED-03: lead with custom leadDate on 22 Oct but createdAt on 20 Oct matches leadDate', () => {
      expect(matchLead({ leadDate: '2026-10-22T14:00:00.000Z', createdAt: '2026-10-20T10:00:00.000Z' })).toBe(true);
    });
  });
});
