import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Tickets & Tasks Header Date Filteration (TicketsTasksHeaderDateFilter)', () => {
  const ticketsPagePath = path.resolve(__dirname, '../Tickets/TicketsPages.tsx');
  const tasksPagePath = path.resolve(__dirname, '../Tasks/TasksPage.tsx');
  const crmControllerPath = path.resolve(__dirname, '../../../../backend/src/controllers/crmController.ts');
  const taskControllerPath = path.resolve(__dirname, '../../../../backend/src/controllers/taskController.ts');

  // ─── 1. TicketsPage Frontend Integration ───────────────────────────
  describe('1. TicketsPage Frontend Header Date Integration', () => {
    const ticketsContent = fs.readFileSync(ticketsPagePath, 'utf8');

    it('TC-TKT-01: imports useDateFilter from DateFilterContext', () => {
      expect(ticketsContent).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-TKT-02: consumes isFiltered, startDate, endDate, and computes reactive dateKey', () => {
      expect(ticketsContent).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(ticketsContent).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(ticketsContent).toContain("const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
    });

    it('TC-TKT-03: resets pagination to page 1 whenever dateKey changes', () => {
      expect(ticketsContent).toContain('React.useEffect(() => { setPage(1); }, [search, statusFilter, pageSize, dateKey]);');
    });

    it('TC-TKT-04: includes dateKey in tickets queryKey and forwards startDate & endDate to api params', () => {
      expect(ticketsContent).toContain("queryKey: ['tickets', statusFilter, search, page, pageSize, dateKey]");
      expect(ticketsContent).toContain('if (hasActiveDateFilter) {');
      expect(ticketsContent).toContain('params.startDate = startDate;');
      expect(ticketsContent).toContain('params.endDate = endDate;');
    });

    it('TC-TKT-05: forwards startDate & endDate to excel export query params', () => {
      expect(ticketsContent).toContain('const exportTickets = async () => {');
      expect(ticketsContent).toContain('if (hasActiveDateFilter) {\n      params.startDate = startDate;\n      params.endDate = endDate;\n    }');
    });

    it('TC-TKT-06: displays active header date label in page header subtitle', () => {
      expect(ticketsContent).toContain('{hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: \'var(--brand)\' }}>• {headerDateLabel}</span>}');
    });
  });

  // ─── 2. TasksPage Frontend Integration ─────────────────────────────
  describe('2. TasksPage Frontend Header Date Integration', () => {
    const tasksContent = fs.readFileSync(tasksPagePath, 'utf8');

    it('TC-TSK-01: imports useDateFilter from DateFilterContext', () => {
      expect(tasksContent).toContain("import { useDateFilter } from '../../context/DateFilterContext';");
    });

    it('TC-TSK-02: consumes isFiltered, startDate, endDate, and computes headerDateKey', () => {
      expect(tasksContent).toContain('const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();');
      expect(tasksContent).toContain("const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';");
      expect(tasksContent).toContain("const headerDateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';");
    });

    it('TC-TSK-03: resets pagination to page 1 whenever headerDateKey changes', () => {
      expect(tasksContent).toContain('React.useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, dateFilter, employeeFilter, headerDateKey]);');
    });

    it('TC-TSK-04: passes header date parameters to tasks-dashboard query', () => {
      expect(tasksContent).toContain("queryKey: ['tasks-dashboard', headerDateKey]");
      expect(tasksContent).toContain('if (hasActiveDateFilter) {\n        params.startDate = startDate;\n        params.endDate = endDate;\n      }');
    });

    it('TC-TSK-05: passes header date parameters to employee tasks (Kanban) query', () => {
      expect(tasksContent).toContain("queryKey: ['tasks', 'employee', selectedEmployeeId, search, statusFilter, priorityFilter, dateFilter, headerDateKey]");
      expect(tasksContent).toContain('if (hasActiveDateFilter) {\n        params.startDate = startDate;\n        params.endDate = endDate;\n      }');
    });

    it('TC-TSK-06: passes header date parameters to list view tasks query', () => {
      expect(tasksContent).toContain("queryKey: ['tasks', search, statusFilter, priorityFilter, dateFilter, isAdmin ? employeeFilter : 'me', page, pageSize, headerDateKey]");
      expect(tasksContent).toContain('if (hasActiveDateFilter) {\n        params.startDate = startDate;\n        params.endDate = endDate;\n      }');
    });

    it('TC-TSK-07: passes header date parameters to exportTasks', () => {
      expect(tasksContent).toContain('const exportTasks = async () => {');
      expect(tasksContent).toContain('if (hasActiveDateFilter) {\n      params.startDate = startDate;\n      params.endDate = endDate;\n    }');
    });

    it('TC-TSK-08: dynamically labels local date select option with active header date', () => {
      expect(tasksContent).toContain('const taskDateOptions = useMemo(() => {');
      expect(tasksContent).toContain("label: `Header: ${headerDateLabel}`");
      expect(tasksContent).toContain('options={taskDateOptions}');
    });

    it('TC-TSK-09: displays active header date label in page header subtitle', () => {
      expect(tasksContent).toContain('{hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: \'var(--brand)\' }}>• {headerDateLabel}</span>}');
    });
  });

  // ─── 3. Backend Controller Date Range Handling ─────────────────────
  describe('3. Backend Controllers Date Range Handling', () => {
    it('TC-BE-TKT-01: crmController getTickets extracts startDate & endDate and filters by ticketRaisedDate/createdAt', () => {
      const crmContent = fs.readFileSync(crmControllerPath, 'utf8');
      expect(crmContent).toContain('export const getTickets = async (req: AuthRequest, res: Response)');
      expect(crmContent).toContain('startDate, endDate, fromDate, toDate');
      expect(crmContent).toContain('ticketRaisedDate: { $gte: sDate, $lte: eDate }');
      expect(crmContent).toContain('createdAt: { $gte: sDate, $lte: eDate }');
    });

    it('TC-BE-TKT-02: crmController getTickets synchronizes KPI stats aggregation with date bounds', () => {
      const crmContent = fs.readFileSync(crmControllerPath, 'utf8');
      expect(crmContent).toContain('if (sDate && eDate) {');
      expect(crmContent).toContain('statsAnd.push({');
      expect(crmContent).toContain('statsMatch.$and = statsAnd;');
    });

    it('TC-BE-TSK-01: taskController getTasks supports startDate & endDate query parameters', () => {
      const taskContent = fs.readFileSync(taskControllerPath, 'utf8');
      expect(taskContent).toContain('export const getTasks = async (req: AuthRequest, res: Response)');
      expect(taskContent).toContain('startDate, endDate, search');
      expect(taskContent).toContain('taskDate: { $gte: parsedS, $lte: parsedE }');
      expect(taskContent).toContain('dueDate: { $gte: parsedS, $lte: parsedE }');
      expect(taskContent).toContain('createdAt: { $gte: parsedS, $lte: parsedE }');
    });

    it('TC-BE-TSK-02: taskController getTaskDashboard filters dashboard counts by startDate & endDate', () => {
      const taskContent = fs.readFileSync(taskControllerPath, 'utf8');
      expect(taskContent).toContain('export const getTaskDashboard = async (req: AuthRequest, res: Response)');
      expect(taskContent).toContain('const { startDate, endDate, fromDate, toDate } = req.query;');
      expect(taskContent).toContain('Object.assign(activeFilter, dateCond);');
    });
  });

  // ─── 4. Functional Date Range Filter Simulations ───────────────────
  describe('4. Date Filter Simulation Logic', () => {
    const filterStart = new Date('2026-10-01T00:00:00.000Z');
    const filterEnd = new Date('2026-10-31T23:59:59.999Z');

    it('TC-SIM-01: ticket within range matches ticketRaisedDate or createdAt', () => {
      const matchTicket = (t: { ticketRaisedDate?: string; createdAt: string }) => {
        const raised = t.ticketRaisedDate ? new Date(t.ticketRaisedDate).getTime() : NaN;
        const created = new Date(t.createdAt).getTime();
        const start = filterStart.getTime();
        const end = filterEnd.getTime();
        return (raised >= start && raised <= end) || (created >= start && created <= end);
      };

      expect(matchTicket({ ticketRaisedDate: '2026-10-06T10:30:00.000Z', createdAt: '2026-10-06T10:30:00.000Z' })).toBe(true);
      expect(matchTicket({ ticketRaisedDate: undefined, createdAt: '2026-10-15T08:00:00.000Z' })).toBe(true);
      expect(matchTicket({ ticketRaisedDate: '2026-09-28T12:00:00.000Z', createdAt: '2026-09-28T12:00:00.000Z' })).toBe(false);
    });

    it('TC-SIM-02: task within range matches taskDate, dueDate, or createdAt', () => {
      const matchTask = (task: { taskDate?: string; dueDate?: string; createdAt: string }) => {
        const tDate = task.taskDate ? new Date(task.taskDate).getTime() : NaN;
        const dDate = task.dueDate ? new Date(task.dueDate).getTime() : NaN;
        const cDate = new Date(task.createdAt).getTime();
        const start = filterStart.getTime();
        const end = filterEnd.getTime();
        return (tDate >= start && tDate <= end) || (dDate >= start && dDate <= end) || (cDate >= start && cDate <= end);
      };

      expect(matchTask({ taskDate: '2026-10-06T09:00:00.000Z', createdAt: '2026-10-06T09:00:00.000Z' })).toBe(true);
      expect(matchTask({ dueDate: '2026-10-20T17:00:00.000Z', createdAt: '2026-09-15T00:00:00.000Z' })).toBe(true);
      expect(matchTask({ taskDate: '2026-08-01T00:00:00.000Z', dueDate: '2026-08-05T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' })).toBe(false);
    });
  });
});
