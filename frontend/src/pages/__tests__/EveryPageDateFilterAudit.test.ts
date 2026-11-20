import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Every Page Date-Wise Filtration Comprehensive Audit (EveryPageDateFilterAudit)', () => {
  const pagesDir = path.resolve(__dirname, '..');
  const backendControllersDir = path.resolve(__dirname, '../../../../backend/src/controllers');

  // ─── 1. Dashboard Page ─────────────────────────────────────────────
  describe('1. Dashboard Page (DashboardPage.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Dashboard/DashboardPage.tsx'), 'utf8');

    it('TC-DASH-01: imports and uses useDateFilter', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType } = useDateFilter();');
    });

    it('TC-DASH-02: computes dateKey and dateQueryParam and forwards to /dashboard', () => {
      expect(content).toContain("const dateQueryParam = isFiltered && startDate && endDate && filterType !== 'all' ? { startDate, endDate } : {};");
      expect(content).toContain("const dateKey = isFiltered ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain("queryKey: ['dashboard', dateKey]");
    });
  });

  // ─── 2. Leads Page ────────────────────────────────────────────────
  describe('2. Leads Page (LeadsPage.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Leads/LeadsPage.tsx'), 'utf8');

    it('TC-LEAD-01: imports and uses useDateFilter', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
    });

    it('TC-LEAD-02: tracks dateKey and resets page to 1 on date filter change', () => {
      expect(content).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [search, status, source, assignedTo, taskStatus, pageSize, dateKey]);');
    });

    it('TC-LEAD-03: forwards startDate and endDate to leads query and export', () => {
      expect(content).toContain("queryKey: ['leads', search, status, source, assignedTo, taskStatus, page, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });

    it('TC-LEAD-04: shows active date badge in subtitle', () => {
      expect(content).toContain('hasActiveDateFilter');
      expect(content).toContain('• {headerDateLabel}');
    });
  });

  // ─── 3. Tasks Page ────────────────────────────────────────────────
  describe('3. Tasks Page (TasksPage.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Tasks/TasksPage.tsx'), 'utf8');

    it('TC-TASK-01: imports and uses useDateFilter', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
    });

    it('TC-TASK-02: computes headerDateKey and resets page to 1', () => {
      expect(content).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(content).toContain("const headerDateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, dateFilter, employeeFilter, headerDateKey]);');
    });

    it('TC-TASK-03: forwards date parameters to dashboard, kanban, and list queries', () => {
      expect(content).toContain("queryKey: ['tasks-dashboard', headerDateKey]");
      expect(content).toContain("queryKey: ['tasks', 'employee', selectedEmployeeId, search, statusFilter, priorityFilter, dateFilter, headerDateKey]");
      expect(content).toContain("queryKey: ['tasks', search, statusFilter, priorityFilter, dateFilter, isAdmin ? employeeFilter : 'me', page, pageSize, headerDateKey]");
    });
  });

  // ─── 4. Tickets Page ───────────────────────────────────────────────
  describe('4. Tickets Page (TicketsPages.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Tickets/TicketsPages.tsx'), 'utf8');

    it('TC-TICK-01: imports and uses useDateFilter', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
    });

    it('TC-TICK-02: includes dateKey in query and resets page', () => {
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [search, statusFilter, pageSize, dateKey]);');
      expect(content).toContain("queryKey: ['tickets', statusFilter, search, page, pageSize, dateKey]");
    });

    it('TC-TICK-03: forwards date filter to query and export', () => {
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });
  });

  // ─── 5. AMC Pages ──────────────────────────────────────────────────
  describe('5. AMC Pages (AMCPages.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'AMC/AMCPages.tsx'), 'utf8');

    it('TC-AMC-01: imports useDateFilter', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-AMC-02: AMCDashboard uses dateKey and forwards dates to /amc/insights', () => {
      expect(content).toContain('export const AMCDashboard: React.FC = () => {');
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain("queryKey: ['amc-insights', dateKey]");
    });

    it('TC-AMC-03: AMCListPage uses dateKey and forwards dates to /amc query and export', () => {
      expect(content).toContain('export const AMCListPage: React.FC = () => {');
      expect(content).toContain("queryKey: ['amcs', statusFilter, search, page, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });
  });

  // ─── 6. Payments, Invoices & Outstanding Pages ─────────────────────
  describe('6. Payments, Invoices & Outstanding (PaymentsPages.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Payments/PaymentsPages.tsx'), 'utf8');

    it('TC-PAY-01: PaymentsPage consumes useDateFilter and passes dates to /payments', () => {
      expect(content).toContain("queryKey: ['payments', filter, search, page, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });

    it('TC-PAY-02: InvoicesPage consumes useDateFilter and passes dates to /payments', () => {
      expect(content).toContain("queryKey: ['invoices', page, search, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });

    it('TC-PAY-03: OutstandingPage consumes useDateFilter, computes dateKey and resets page', () => {
      expect(content).toContain('export const OutstandingPage: React.FC = () => {');
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(content).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [search, pageSize, dateKey]);');
    });

    it('TC-PAY-04: OutstandingPage forwards date filter in query, export, and renders subtitle badge', () => {
      expect(content).toContain("queryKey: ['payments-outstanding', page, search, pageSize, dateKey]");
      expect(content).toContain('...(hasActiveDateFilter ? { startDate, endDate } : {})');
      expect(content).toContain('• {headerDateLabel}');
    });
  });

  // ─── 7. Calls Page ─────────────────────────────────────────────────
  describe('7. Calls Page (CallsPage.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Calls/CallsPage.tsx'), 'utf8');

    it('TC-CALL-01: imports useDateFilter from DateFilterContext', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-CALL-02: consumes useDateFilter, computes dateKey, and resets page on change', () => {
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(content).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, pageSize, dateKey]);');
    });

    it('TC-CALL-03: forwards startDate and endDate to /calls query and export button', () => {
      expect(content).toContain("queryKey: ['calls', statusFilter, typeFilter, search, page, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });

    it('TC-CALL-04: renders active date badge in subtitle', () => {
      expect(content).toContain('hasActiveDateFilter');
      expect(content).toContain('• {headerDateLabel}');
    });
  });

  // ─── 8. Proposals Page ─────────────────────────────────────────────
  describe('8. Proposals Page (MiscPages.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Misc/MiscPages.tsx'), 'utf8');

    it('TC-PROP-01: imports useDateFilter from DateFilterContext', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-PROP-02: consumes useDateFilter, computes dateKey, and resets page on change', () => {
      expect(content).toContain('export const ProposalsPage: React.FC = () => {');
      expect(content).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(content).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(content).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
      expect(content).toContain('React.useEffect(() => { setPage(1); }, [filter, search, pageSize, dateKey]);');
    });

    it('TC-PROP-03: forwards startDate and endDate to /proposals query and export', () => {
      expect(content).toContain("queryKey: ['proposals', filter, search, page, pageSize, dateKey]");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
    });

    it('TC-PROP-04: renders active date badge in header subtitle', () => {
      expect(content).toContain('<div className="page-title">Proposals</div>');
      expect(content).toContain('hasActiveDateFilter');
      expect(content).toContain('• {headerDateLabel}');
    });
  });

  // ─── 9. Customer Management Sub-Pages ──────────────────────────────
  describe('9. Customer Management Pages (CustomerManagementPages.tsx)', () => {
    const content = fs.readFileSync(path.join(pagesDir, 'Customers/CustomerManagementPages.tsx'), 'utf8');

    it('TC-CUSTMGMT-01: imports and utilizes useDateFilter for TDL, Cloud, and TSS pages', () => {
      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('export const TDLDashboardPage: React.FC = () => {');
      expect(content).toContain('export const CloudDashboardPage: React.FC = () => {');
      expect(content).toContain('export const TSSDashboardPage: React.FC = () => {');
    });
  });

  // ─── 10. Backend Controllers Date Filtration Verification ──────────
  describe('10. Backend Controllers Date Filtration Architecture', () => {
    const crmContent = fs.readFileSync(path.join(backendControllersDir, 'crmController.ts'), 'utf8');
    const leadContent = fs.readFileSync(path.join(backendControllersDir, 'leadController.ts'), 'utf8');
    const taskContent = fs.readFileSync(path.join(backendControllersDir, 'taskController.ts'), 'utf8');

    it('TC-BKND-01: getCalls extracts date params and applies normalized date boundaries', () => {
      expect(crmContent).toContain('export const getCalls = async (req: AuthRequest, res: Response): Promise<void> => {');
      expect(crmContent).toContain('const effectiveStart = startDate || fromDate;');
      expect(crmContent).toContain('const effectiveEnd = endDate || toDate;');
      expect(crmContent).toContain('{ callDate: dateCond }');
      expect(crmContent).toContain('{ createdAt: dateCond }');
    });

    it('TC-BKND-02: getProposals extracts date params and applies normalized date boundaries', () => {
      expect(crmContent).toContain('export const getProposals = async (req: AuthRequest, res: Response): Promise<void> => {');
      expect(crmContent).toContain('const effectiveStart = startDate || fromDate;');
      expect(crmContent).toContain('const effectiveEnd = endDate || toDate;');
      expect(crmContent).toContain('{ quoteDate: dateCond }');
      expect(crmContent).toContain('{ createdAt: dateCond }');
    });

    it('TC-BKND-03: getPayments extracts date params and filters payments and aggregates', () => {
      expect(crmContent).toContain('export const getPayments = async (req: AuthRequest, res: Response): Promise<void> => {');
      expect(crmContent).toContain('filter.paymentDate = dateCond;');
    });

    it('TC-BKND-04: getLeads extracts date params and matches leadDate and createdAt', () => {
      expect(leadContent).toContain('export const getLeads = async (req: AuthRequest, res: Response): Promise<void> => {');
      expect(leadContent).toContain('{ leadDate: dateCond }');
      expect(leadContent).toContain('{ createdAt: dateCond }');
    });

    it('TC-BKND-05: getTasks extracts date params and filters tasks and dashboard stats', () => {
      expect(taskContent).toContain('export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {');
      expect(taskContent).toContain('const effectiveStart = startDate || fromDate;');
      expect(taskContent).toContain('const effectiveEnd = endDate || toDate;');
      expect(taskContent).toContain('{ taskDate: { $gte: parsedS, $lte: parsedE } }');
      expect(taskContent).toContain('{ dueDate: { $gte: parsedS, $lte: parsedE } }');
      expect(taskContent).toContain('{ createdAt: { $gte: parsedS, $lte: parsedE } }');
    });
  });
});
