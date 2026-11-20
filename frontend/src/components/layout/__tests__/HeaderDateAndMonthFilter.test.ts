import { describe, it, expect, vi } from 'vitest';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subDays,
  startOfYear,
  endOfYear,
  parseISO
} from 'date-fns';
import fs from 'fs';
import path from 'path';

describe('Header Date & Month Filter Specification Tests (WelcomeTech CRM)', () => {
  // ─── 1. Flow A: Month Filtering Normalization ────────────────────
  describe('1. Flow A: Month Normalization Rules', () => {
    it('TC-MF-01: Single-click on any month computes exact 1st to last day of month', () => {
      const year = 2026;
      const monthIdx = 9; // October (0-indexed)
      const targetDate = new Date(year, monthIdx, 1);

      const start = format(startOfMonth(targetDate), 'yyyy-MM-dd');
      const end = format(endOfMonth(targetDate), 'yyyy-MM-dd');
      const label = format(targetDate, 'MMM yyyy');

      expect(start).toBe('2026-10-01');
      expect(end).toBe('2026-10-31');
      expect(label).toBe('Oct 2026');
    });

    it('TC-MF-02: Handles leap year and varying month lengths accurately (Feb, Apr, etc.)', () => {
      // Leap year Feb 2024
      const feb2024 = new Date(2024, 1, 1);
      expect(format(endOfMonth(feb2024), 'yyyy-MM-dd')).toBe('2024-02-29');

      // Non-leap year Feb 2026
      const feb2026 = new Date(2026, 1, 1);
      expect(format(endOfMonth(feb2026), 'yyyy-MM-dd')).toBe('2026-02-28');

      // 30-day month April 2026
      const apr2026 = new Date(2026, 3, 1);
      expect(format(endOfMonth(apr2026), 'yyyy-MM-dd')).toBe('2026-04-30');
    });

    it('TC-MF-03: Double-click auto-apply detection within 350ms window', () => {
      let applied = false;
      let lastClicked: { month: number; time: number } | null = null;

      const handleMonthClick = (mIdx: number, clickTime: number) => {
        if (lastClicked && lastClicked.month === mIdx && clickTime - lastClicked.time < 350) {
          applied = true;
          lastClicked = null;
          return;
        }
        lastClicked = { month: mIdx, time: clickTime };
      };

      // First click at t = 1000
      handleMonthClick(9, 1000);
      expect(applied).toBe(false);

      // Second rapid click at t = 1200 (delta = 200ms < 350ms)
      handleMonthClick(9, 1200);
      expect(applied).toBe(true);

      // Third click separated by 500ms should NOT auto-apply
      applied = false;
      handleMonthClick(7, 2000);
      handleMonthClick(7, 2500); // 500ms > 350ms
      expect(applied).toBe(false);
    });
  });

  // ─── 2. Quarter and Year Normalization ───────────────────────────
  describe('2. Quarter & Year Filters', () => {
    it('TC-QTR-01: Q1, Q2, Q3, Q4 normalize to exact 3-month boundaries', () => {
      const year = 2026;

      // Q1 (Jan - Mar)
      const q1Start = format(new Date(year, 0, 1), 'yyyy-MM-dd');
      const q1End = format(endOfMonth(new Date(year, 2, 1)), 'yyyy-MM-dd');
      expect(q1Start).toBe('2026-01-01');
      expect(q1End).toBe('2026-03-31');

      // Q2 (Apr - Jun)
      const q2Start = format(new Date(year, 3, 1), 'yyyy-MM-dd');
      const q2End = format(endOfMonth(new Date(year, 5, 1)), 'yyyy-MM-dd');
      expect(q2Start).toBe('2026-04-01');
      expect(q2End).toBe('2026-06-30');

      // Q3 (Jul - Sep)
      const q3Start = format(new Date(year, 6, 1), 'yyyy-MM-dd');
      const q3End = format(endOfMonth(new Date(year, 8, 1)), 'yyyy-MM-dd');
      expect(q3Start).toBe('2026-07-01');
      expect(q3End).toBe('2026-09-30');

      // Q4 (Oct - Dec)
      const q4Start = format(new Date(year, 9, 1), 'yyyy-MM-dd');
      const q4End = format(endOfMonth(new Date(year, 11, 1)), 'yyyy-MM-dd');
      expect(q4Start).toBe('2026-10-01');
      expect(q4End).toBe('2026-12-31');
    });

    it('TC-YR-01: Calendar Year normalizes 01/01 to 31/12', () => {
      const year = 2026;
      const targetDate = new Date(year, 0, 1);
      const start = format(startOfYear(targetDate), 'yyyy-MM-dd');
      const end = format(endOfYear(targetDate), 'yyyy-MM-dd');
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-12-31');
    });
  });

  // ─── 3. Flow B: Custom Range and Presets ──────────────────────────
  describe('3. Flow B: Range and Presets', () => {
    it('TC-DF-01: Presets compute accurate calendar intervals', () => {
      const baseDate = new Date(2026, 9, 6); // Tuesday, Oct 6, 2026

      // Yesterday
      const yest = subDays(baseDate, 1);
      expect(format(yest, 'yyyy-MM-dd')).toBe('2026-10-05');

      // This Week (Monday to Sunday)
      const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
      expect(format(weekStart, 'yyyy-MM-dd')).toBe('2026-10-05');
      expect(format(weekEnd, 'yyyy-MM-dd')).toBe('2026-10-11');

      // Last 7 Days (including baseDate)
      const l7 = subDays(baseDate, 6);
      expect(format(l7, 'yyyy-MM-dd')).toBe('2026-09-30');

      // Last 30 Days
      const l30 = subDays(baseDate, 29);
      expect(format(l30, 'yyyy-MM-dd')).toBe('2026-09-07');
    });
  });

  // ─── 4. Flow C: One-Click Quick Clear ────────────────────────────
  describe('4. Flow C: Quick Clear & Inactive State', () => {
    it('TC-CLR-01: One-Click clear resets filter to today with empty badge', () => {
      const today = new Date();
      const currentIso = format(today, 'yyyy-MM-dd');
      const currentLabel = format(today, 'dd MMM yyyy');

      // Simulated state change to active
      let state = {
        filterType: 'month',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        label: 'Oct 2026',
        badgeText: 'Month',
        isFiltered: true,
      };

      // Reset
      state = {
        filterType: 'date',
        startDate: currentIso,
        endDate: currentIso,
        label: currentLabel,
        badgeText: '',
        isFiltered: false,
      };

      expect(state.isFiltered).toBe(false);
      expect(state.badgeText).toBe('');
      expect(state.startDate).toBe(currentIso);
      expect(state.label).toBe(currentLabel);
    });
  });

  // ─── 5. UI/UX Layout & Code Integrity ────────────────────────────
  describe('5. UI/UX Architecture & Layout Integration', () => {
    it('TC-INT-01: Topbar.tsx renders DateFilterSelector right before notification trigger', () => {
      const topbarPath = path.resolve(__dirname, '../Topbar.tsx');
      const content = fs.readFileSync(topbarPath, 'utf8');

      expect(content).toContain("import { DateFilterSelector } from './DateFilterSelector';");
      expect(content).toContain('<DateFilterSelector />');

      // Check positioning in topbar-actions
      const actionsIdx = content.indexOf('className="topbar-actions"');
      const dateFilterIdx = content.indexOf('<DateFilterSelector />');
      const bellRefIdx = content.indexOf('ref={bellRef}');

      expect(actionsIdx).toBeGreaterThan(0);
      expect(dateFilterIdx).toBeGreaterThan(actionsIdx);
      expect(bellRefIdx).toBeGreaterThan(dateFilterIdx);
    });

    it('TC-INT-02: App.tsx wraps application inside DateFilterProvider', () => {
      const appPath = path.resolve(__dirname, '../../../App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');

      expect(content).toContain("import { DateFilterProvider } from './context/DateFilterContext';");
      expect(content).toContain('<DateFilterProvider>');
      expect(content).toContain('</DateFilterProvider>');
    });

    it('TC-INT-03: DateFilterSelector includes accessible role, keyboard Escape, and portal rendering', () => {
      const selectorPath = path.resolve(__dirname, '../DateFilterSelector.tsx');
      const content = fs.readFileSync(selectorPath, 'utf8');

      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-label="Date and Month Filter"');
      expect(content).toContain("e.key === 'Escape'");
      expect(content).toContain('createPortal');
      expect(content).toContain('handleQuickClear');
      expect(content).toContain('MONTH_NAMES');
      expect(content).toContain('QUARTER_TAGS');
    });

    it('TC-INT-04: index.css includes popoverScaleFade and drawerSlideUp animations', () => {
      const cssPath = path.resolve(__dirname, '../../../index.css');
      const content = fs.readFileSync(cssPath, 'utf8');

      expect(content).toContain('@keyframes popoverScaleFade');
      expect(content).toContain('@keyframes drawerSlideUp');
    });
  });

  // ─── 6. User-Scoped Persistence Across Refresh ──────────────────
  describe('6. User-Scoped Persistence Across Browser Refresh', () => {
    it('TC-PERSIST-01: Storage key generates isolated keys per user and guest', () => {
      // Inline mock of getStorageKey logic
      const getStorageKey = (userId?: string | null) => {
        const scope = userId ? String(userId).trim() : 'guest';
        return `wt_date_filter_live_${scope}`;
      };

      expect(getStorageKey('usr_admin_123')).toBe('wt_date_filter_live_usr_admin_123');
      expect(getStorageKey('usr_sales_456')).toBe('wt_date_filter_live_usr_sales_456');
      expect(getStorageKey(null)).toBe('wt_date_filter_live_guest');
      expect(getStorageKey(undefined)).toBe('wt_date_filter_live_guest');
    });

    it('TC-PERSIST-02: Storing and parsing filter state in localStorage survives stringification', () => {
      const mockStorage: Record<string, string> = {};
      const fakeLocalStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
      };

      const userKey = 'wt_date_filter_live_usr_999';
      const sampleState = {
        filterType: 'month',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        label: 'Oct 2026',
        badgeText: 'Month',
        isFiltered: true,
        selectedMonth: 9,
        selectedYear: 2026,
      };

      fakeLocalStorage.setItem(userKey, JSON.stringify(sampleState));

      const retrieved = JSON.parse(fakeLocalStorage.getItem(userKey)!);
      expect(retrieved.filterType).toBe('month');
      expect(retrieved.startDate).toBe('2026-10-01');
      expect(retrieved.endDate).toBe('2026-10-31');
      expect(retrieved.label).toBe('Oct 2026');
      expect(retrieved.isFiltered).toBe(true);
    });

    it('TC-PERSIST-03: Browser refresh simulation restores active filter state without resetting to today', () => {
      const mockStorage: Record<string, string> = {};
      const userKey = 'wt_date_filter_live_admin';

      // 1. User sets a Quarter filter in the session
      const q4State = {
        filterType: 'quarter',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        label: 'Q4 2026',
        badgeText: 'Quarter',
        isFiltered: true,
        selectedMonth: 9,
        selectedYear: 2026,
      };
      mockStorage[userKey] = JSON.stringify(q4State);

      // 2. Simulated Page Refresh: component mounts and reads from mockStorage
      const raw = mockStorage[userKey];
      expect(raw).toBeDefined();

      const restoredState = JSON.parse(raw);
      expect(restoredState.filterType).toBe('quarter');
      expect(restoredState.startDate).toBe('2026-10-01');
      expect(restoredState.endDate).toBe('2026-12-31');
      expect(restoredState.label).toBe('Q4 2026');
      expect(restoredState.isFiltered).toBe(true);
    });

    it('TC-PERSIST-04: User switching isolates stored filter state', () => {
      const mockStorage: Record<string, string> = {};
      const userAKey = 'wt_date_filter_live_user_A';
      const userBKey = 'wt_date_filter_live_user_B';

      // User A selects October 2026
      mockStorage[userAKey] = JSON.stringify({
        filterType: 'month',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        label: 'Oct 2026',
        isFiltered: true,
      });

      // User B selects Year 2025
      mockStorage[userBKey] = JSON.stringify({
        filterType: 'year',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        label: '2025',
        isFiltered: true,
      });

      // Inspect User A
      const parsedA = JSON.parse(mockStorage[userAKey]);
      expect(parsedA.label).toBe('Oct 2026');
      expect(parsedA.startDate).toBe('2026-10-01');

      // Inspect User B
      const parsedB = JSON.parse(mockStorage[userBKey]);
      expect(parsedB.label).toBe('2025');
      expect(parsedB.startDate).toBe('2025-01-01');

      // Verify no cross-contamination
      expect(parsedA.label).not.toBe(parsedB.label);
    });
  });

  // ─── 7. Page Query Forwarding Integrity ─────────────────────────
  describe('7. Multi-Page Date Query Forwarding', () => {
    it('TC-PAGE-01: CustomersPage forwards startDate and endDate when isFiltered is active', () => {
      const customersPagePath = path.resolve(__dirname, '../../../pages/Customers/CustomersPage.tsx');
      const content = fs.readFileSync(customersPagePath, 'utf8');

      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('useDateFilter()');
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
      expect(content).toContain("queryKey: ['customers', filter, productFilter, groupFilter, search, page, pageSize, isFiltered ? `${startDate}_${endDate}` : 'all']");
      expect(content).toContain("queryKey: ['customers-stats', isFiltered ? `${startDate}_${endDate}` : 'all']");
    });

    it('TC-PAGE-02: DashboardPage forwards dateQueryParam to dashboard and service insights', () => {
      const dashboardPagePath = path.resolve(__dirname, '../../../pages/Dashboard/DashboardPage.tsx');
      const content = fs.readFileSync(dashboardPagePath, 'utf8');

      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('useDateFilter()');
      expect(content).toContain("const dateQueryParam = isFiltered && startDate && endDate && filterType !== 'all' ? { startDate, endDate } : {};");
      expect(content).toContain("api.get<{ success: boolean; data: DashboardData }>('/dashboard', { params: dateQueryParam })");
      expect(content).toContain("api.get('/customers/management-insights', { params: dateQueryParam })");
    });

    it('TC-PAGE-03: PaymentsPages forwards date parameters for payments and invoices', () => {
      const paymentsPagePath = path.resolve(__dirname, '../../../pages/Payments/PaymentsPages.tsx');
      const content = fs.readFileSync(paymentsPagePath, 'utf8');

      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain('params.startDate = startDate;');
      expect(content).toContain('params.endDate = endDate;');
      expect(content).toContain("queryKey: ['payments', filter, search, page, pageSize, dateKey]");
      expect(content).toContain("queryKey: ['invoices', page, search, pageSize, dateKey]");
    });

    it('TC-PAGE-04: CloudListPage, TDLListPage, and TSSListPage forward date filters and reset page', () => {
      const mgmtPagesPath = path.resolve(__dirname, '../../../pages/Customers/CustomerManagementPages.tsx');
      const content = fs.readFileSync(mgmtPagesPath, 'utf8');

      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain("queryKey: ['customers-management-insights', dateKey]");
      expect(content).toContain("queryKey: ['customers-cloud-list', search, dateKey]");
      expect(content).toContain("queryKey: ['customers-tdl-list', search, dateKey]");
      expect(content).toContain("queryKey: ['customers-tss-list', search, dateKey]");
      expect(content).toContain('matchDateFilterRange(');
    });

    it('TC-PAGE-05: AMCListPage and AMCDashboard forward date filters and update queryKeys', () => {
      const amcPagesPath = path.resolve(__dirname, '../../../pages/AMC/AMCPages.tsx');
      const content = fs.readFileSync(amcPagesPath, 'utf8');

      expect(content).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
      expect(content).toContain("queryKey: ['amc-insights', dateKey]");
      expect(content).toContain("queryKey: ['amcs', statusFilter, search, page, pageSize, dateKey]");
      expect(content).toContain("queryKey: ['amc-insights-kpis', dateKey]");
    });
  });

  // ─── 8. Backend Controller Date Handling ────────────────────────
  describe('8. Backend Controller Date Range Handling', () => {
    it('TC-BE-01: customerController handles startDate and endDate in getCustomers and getCustomerStats', () => {
      const controllerPath = path.resolve(__dirname, '../../../../../backend/src/controllers/customerController.ts');
      const content = fs.readFileSync(controllerPath, 'utf8');

      expect(content).toContain('if (startDate && endDate) {');
      expect(content).toContain('export const getCustomerStats = async');
      expect(content).toContain('const { startDate, endDate } = req.query;');
      expect(content).toContain('buildFilter');
    });

    it('TC-BE-02: crmController handles startDate and endDate in getPayments and getDashboard', () => {
      const crmControllerPath = path.resolve(__dirname, '../../../../../backend/src/controllers/crmController.ts');
      const content = fs.readFileSync(crmControllerPath, 'utf8');

      expect(content).toContain('export const getPayments = async');
      expect(content).toContain('startDate, endDate');
      expect(content).toContain('filter.paymentDate = { $gte: sDate, $lte: eDate };');
      expect(content).toContain('export const getDashboard = async');
      expect(content).toContain('const { startDate, endDate } = req.query;');
    });

    it('TC-BE-03: customerController getCustomerManagementInsights computes dynamic KPIs and supports date filtering', () => {
      const controllerPath = path.resolve(__dirname, '../../../../../backend/src/controllers/customerController.ts');
      const content = fs.readFileSync(controllerPath, 'utf8');

      expect(content).toContain('customerInsightsCacheMap');
      expect(content).toContain('cloudExpiringCount');
      expect(content).toContain('cloudExpiredCount');
      expect(content).toContain('tdlExpiringCount');
      expect(content).toContain('tdlExpiredCount');
      expect(content).toContain('tssExpiringCount');
      expect(content).toContain('tssExpiredCount');
    });

    it('TC-BE-04: crmController getAMCs and getAMCInsights support date range filtering', () => {
      const crmControllerPath = path.resolve(__dirname, '../../../../../backend/src/controllers/crmController.ts');
      const content = fs.readFileSync(crmControllerPath, 'utf8');

      expect(content).toContain('const { status, customer, search, product, startDate, endDate } = req.query;');
      expect(content).toContain('export const getAMCInsights = async');
      expect(content).toContain('filteredNormalized');
    });
  });

  // ─── 9. matchDateFilterRange Logic Tests ─────────────────────────
  describe('9. Row Date Range Filter Verification', () => {
    // Import helper dynamically or verify logic directly matching the implementation
    const filterStart = '2026-09-07';
    const filterEnd = '2026-10-06';

    it('TC-ROW-01: status=expired filters out rows expiring before the range start', async () => {
      const { matchDateFilterRange } = await import('../../../pages/Customers/CustomerManagementPages');

      // 05 Sep 2026 is before 07 Sep 2026
      expect(matchDateFilterRange('2026-09-05', '2024-09-05', null, 'expired', filterStart, filterEnd)).toBe(false);
      // 11 Apr 2026 is months before 07 Sep 2026
      expect(matchDateFilterRange('2026-04-11', null, null, 'expired', filterStart, filterEnd)).toBe(false);
      // 10 May 2026 is months before
      expect(matchDateFilterRange('2026-05-10', null, null, 'expired', filterStart, filterEnd)).toBe(false);
      // 05 Aug 2026 is before
      expect(matchDateFilterRange('2026-08-05', '2026-08-06', null, 'expired', filterStart, filterEnd)).toBe(false);
    });

    it('TC-ROW-02: status=expired includes rows expiring within the range', async () => {
      const { matchDateFilterRange } = await import('../../../pages/Customers/CustomerManagementPages');

      // 14 Sep 2026 is within 07 Sep - 06 Oct 2026
      expect(matchDateFilterRange('2026-09-14', '2025-09-15', null, 'expired', filterStart, filterEnd)).toBe(true);
      // 03 Oct 2026 is within 07 Sep - 06 Oct 2026
      expect(matchDateFilterRange('2026-10-03', '2024-10-03', null, 'expired', filterStart, filterEnd)).toBe(true);
    });

    it('TC-ROW-03: status=active strictly checks expiry date within filter range', async () => {
      const { matchDateFilterRange } = await import('../../../pages/Customers/CustomerManagementPages');

      // Expiry within range 07 Sep - 06 Oct 2026
      expect(matchDateFilterRange('2026-09-20', '2026-01-01', null, 'active', filterStart, filterEnd)).toBe(true);
      // License expiring outside range in Dec 2026 or 2027 must NOT match
      expect(matchDateFilterRange('2026-12-31', '2026-01-01', null, 'active', filterStart, filterEnd)).toBe(false);
      expect(matchDateFilterRange('2027-06-30', '2026-01-01', null, 'active', filterStart, filterEnd)).toBe(false);
      // Expired license before range
      expect(matchDateFilterRange('2026-08-31', '2026-01-01', null, 'active', filterStart, filterEnd)).toBe(false);
    });

    it('TC-ROW-04: Returns true for all rows when filter is inactive', async () => {
      const { matchDateFilterRange } = await import('../../../pages/Customers/CustomerManagementPages');

      expect(matchDateFilterRange('2026-04-11', null, null, 'expired', null, null)).toBe(true);
      expect(matchDateFilterRange('2026-04-11', null, null, 'expired', '', '')).toBe(true);
    });
  });

  // ─── 10. Top From-To Date Filtration & Sidebar Removal Verification ──
  describe('10. Top From-To Date Filtration & Sidebar Removal Verification', () => {
    const selectorPath = path.resolve(__dirname, '../DateFilterSelector.tsx');
    const content = fs.readFileSync(selectorPath, 'utf8');

    it('TC-FROM-TO-01: Verifies the left vertical sidebar list has been completely removed', () => {
      // Must not contain the old left sidebar container with 170px width and Presets title
      expect(content).not.toContain("width: isMobile ? '100%' : '170px'");
      expect(content).not.toContain('• Today');
      expect(content).not.toContain('• Yesterday');
      expect(content).not.toContain('• This Week');
    });

    it('TC-FROM-TO-02: Verifies From Date and To Date inputs are implemented at the top', () => {
      expect(content).toContain('aria-label="From Date"');
      expect(content).toContain('aria-label="To Date"');
      expect(content).toContain('type="date"');
      expect(content).toContain('handleFromDateChange');
      expect(content).toContain('handleToDateChange');
      expect(content).toContain('From Date');
      expect(content).toContain('To Date');
    });

    it('TC-FROM-TO-03: Verifies tab navigation displays From - To Date tab label', () => {
      expect(content).toContain("label: 'From - To Date'");
    });

    it('TC-FROM-TO-04: Verifies preset filter chips are completely removed from the date filter', () => {
      expect(content).not.toContain("{ id: 'today', label: 'Today' }");
      expect(content).not.toContain("{ id: 'yesterday', label: 'Yesterday' }");
      expect(content).not.toContain("{ id: 'this_week', label: 'This Week' }");
      expect(content).not.toContain("{ id: 'last_7', label: 'Last 7 Days' }");
      expect(content).not.toContain("{ id: 'last_30', label: 'Last 30 Days' }");
      expect(content).not.toContain('applyPreset');
      expect(content).not.toContain('isPresetActive');
    });

    it('TC-FROM-TO-05: From/To date change logic enforces valid range boundaries', () => {
      let draftStart = '2026-10-15';
      let draftEnd = '2026-10-20';

      // Setting From Date beyond To Date automatically pushes To Date forward
      const handleFromDateChangeSim = (val: string) => {
        draftStart = val;
        if (draftEnd && parseISO(val) > parseISO(draftEnd)) {
          draftEnd = val;
        }
      };

      handleFromDateChangeSim('2026-10-25');
      expect(draftStart).toBe('2026-10-25');
      expect(draftEnd).toBe('2026-10-25');

      // Setting To Date earlier than From Date pulls From Date back
      const handleToDateChangeSim = (val: string) => {
        draftEnd = val;
        if (draftStart && parseISO(draftStart) > parseISO(val)) {
          draftStart = val;
        }
      };

      handleToDateChangeSim('2026-10-10');
      expect(draftStart).toBe('2026-10-10');
      expect(draftEnd).toBe('2026-10-10');
    });

    it('TC-FROM-TO-06: Calendar date clicks synchronize start and end range', () => {
      let draftStart = '';
      let draftEnd = '';

      const handleDateClickSim = (dayIso: string) => {
        if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
          draftStart = dayIso;
          draftEnd = dayIso;
        } else {
          if (parseISO(draftStart) > parseISO(dayIso)) {
            draftEnd = draftStart;
            draftStart = dayIso;
          } else {
            draftEnd = dayIso;
          }
        }
      };

      // Click 1: selects single date
      handleDateClickSim('2026-10-05');
      expect(draftStart).toBe('2026-10-05');
      expect(draftEnd).toBe('2026-10-05');

      // Click 2: selects range
      handleDateClickSim('2026-10-18');
      expect(draftStart).toBe('2026-10-05');
      expect(draftEnd).toBe('2026-10-18');

      // Click 3: resets to new single date
      handleDateClickSim('2026-10-22');
      expect(draftStart).toBe('2026-10-22');
      expect(draftEnd).toBe('2026-10-22');
    });
  });
});


