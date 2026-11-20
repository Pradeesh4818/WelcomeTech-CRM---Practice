import { describe, it, expect } from 'vitest';
import {
  isTaskProposalCategoryOrStatus,
  isTaskProposalAlreadySent,
  filterProposalEligibleTasks,
  TaskProposalFilterItem,
  ProposalReferenceItem
} from '../../../utils/proposalTaskFilter';

describe('Quotation Generator - Select Task Proposal Dropdown Filtering', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. Category & Status Qualification Tests
  // ─────────────────────────────────────────────────────────────
  describe('isTaskProposalCategoryOrStatus', () => {
    it('TC-FRONT-FILTER-01: identifies tasks with taskType === "proposal"', () => {
      const task: TaskProposalFilterItem = {
        _id: 'task_001',
        taskNo: 'TASK-00101',
        title: 'ERP Customization',
        taskType: 'proposal',
        status: 'todo',
      };
      expect(isTaskProposalCategoryOrStatus(task)).toBe(true);
    });

    it('TC-FRONT-FILTER-02: identifies tasks with status === "proposal"', () => {
      const task: TaskProposalFilterItem = {
        _id: 'task_002',
        taskNo: 'TASK-00102',
        title: 'Tally License Requirement',
        taskType: 'lead',
        status: 'proposal',
      };
      expect(isTaskProposalCategoryOrStatus(task)).toBe(true);
    });

    it('TC-FRONT-FILTER-03: identifies tasks with proposal or quotation in tags (case-insensitive)', () => {
      const taskWithProposalTag: TaskProposalFilterItem = {
        _id: 'task_003',
        taskNo: 'TASK-00103',
        title: 'Annual Support',
        taskType: 'general',
        tags: ['urgent', 'Quotation', 'cloud'],
      };
      expect(isTaskProposalCategoryOrStatus(taskWithProposalTag)).toBe(true);

      const taskWithLowerTag: TaskProposalFilterItem = {
        _id: 'task_003b',
        title: 'Hardware quote',
        tags: ['proposal'],
      };
      expect(isTaskProposalCategoryOrStatus(taskWithLowerTag)).toBe(true);
    });

    it('TC-FRONT-FILTER-04: identifies tasks with "proposal" or "quotation" in title or description', () => {
      const taskTitle: TaskProposalFilterItem = {
        _id: 'task_004a',
        title: 'Submit Proposal for School Management System',
      };
      expect(isTaskProposalCategoryOrStatus(taskTitle)).toBe(true);

      const taskDesc: TaskProposalFilterItem = {
        _id: 'task_004b',
        title: 'Client Meeting Notes',
        description: 'Client asked for detailed quotation for 20 users',
      };
      expect(isTaskProposalCategoryOrStatus(taskDesc)).toBe(true);
    });

    it('TC-FRONT-FILTER-05: identifies tasks with proposal action in task history', () => {
      const taskWithHistory: TaskProposalFilterItem = {
        _id: 'task_005',
        taskNo: 'TASK-00105',
        title: 'Lead Follow-up',
        history: [{ action: 'created' }, { action: 'proposal' }],
      };
      expect(isTaskProposalCategoryOrStatus(taskWithHistory)).toBe(true);
    });

    it('TC-FRONT-FILTER-06: excludes lead tasks that have not yet been moved into Proposal status', () => {
      const taskWithLeadReq: TaskProposalFilterItem = {
        _id: 'task_006',
        taskNo: 'TASK-00106',
        title: 'Al Rayyan Trading Lead',
        taskType: 'lead',
        status: 'todo',
        lead: {
          _id: 'lead_001',
          name: 'Ahmed',
          companyName: 'Al Rayyan Trading',
          proposalRequested: true,
          status: 'Contacted',
        },
      };
      expect(isTaskProposalCategoryOrStatus(taskWithLeadReq)).toBe(false);
    });

    it('TC-FRONT-FILTER-07: identifies lead tasks once moved into Proposal status / taskType', () => {
      const taskLeadQuotationReq: TaskProposalFilterItem = {
        _id: 'task_007',
        taskNo: 'TASK-00107',
        title: 'Qatar Steel Support',
        taskType: 'proposal',
        status: 'todo',
        lead: {
          _id: 'lead_002',
          companyName: 'Qatar Steel',
          status: 'Quotation Requested',
        },
      };
      expect(isTaskProposalCategoryOrStatus(taskLeadQuotationReq)).toBe(true);
    });

    it('TC-FRONT-FILTER-08: excludes non-proposal tickets and generic customer tasks (from screenshot)', () => {
      const ticketTask1: TaskProposalFilterItem = {
        _id: 'task_00009',
        taskNo: 'TASK-00009',
        title: 'Ticket TKT-0003: Tally Service & Support',
        taskType: 'ticket',
        status: 'todo',
        tags: ['ticket', 'support'],
      };
      expect(isTaskProposalCategoryOrStatus(ticketTask1)).toBe(false);

      const ticketTask2: TaskProposalFilterItem = {
        _id: 'task_00014',
        taskNo: 'TASK-00014',
        title: 'Ticket TKT-0007: Accounts Work - Balance Issue',
        taskType: 'ticket',
        status: 'in_progress',
      };
      expect(isTaskProposalCategoryOrStatus(ticketTask2)).toBe(false);

      const customerTask: TaskProposalFilterItem = {
        _id: 'task_00286',
        taskNo: 'TASK-00286',
        title: 'Customer Task — AL ZARAR CONTRACTING',
        taskType: 'customer',
        status: 'todo',
      };
      expect(isTaskProposalCategoryOrStatus(customerTask)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Already Sent Exclusion Tests
  // ─────────────────────────────────────────────────────────────
  describe('isTaskProposalAlreadySent', () => {
    it('TC-FRONT-FILTER-09: marks task as already sent if task status is done, completed, or cancelled', () => {
      const doneTask: TaskProposalFilterItem = {
        _id: 'task_done_1',
        taskType: 'proposal',
        status: 'done',
      };
      expect(isTaskProposalAlreadySent(doneTask)).toBe(true);

      const completedTask: TaskProposalFilterItem = {
        _id: 'task_done_2',
        taskType: 'proposal',
        status: 'completed',
      };
      expect(isTaskProposalAlreadySent(completedTask)).toBe(true);

      const cancelledTask: TaskProposalFilterItem = {
        _id: 'task_canc',
        taskType: 'proposal',
        status: 'cancelled',
      };
      expect(isTaskProposalAlreadySent(cancelledTask)).toBe(true);
    });

    it('TC-FRONT-FILTER-10: marks task as already sent if present in sentTaskIds lookup', () => {
      const sentIds = new Set(['task_sent_100', 'task_sent_101']);
      const task: TaskProposalFilterItem = {
        _id: 'task_sent_100',
        taskType: 'proposal',
        status: 'todo',
      };
      expect(isTaskProposalAlreadySent(task, sentIds)).toBe(true);

      const taskNotSent: TaskProposalFilterItem = {
        _id: 'task_other_200',
        taskType: 'proposal',
        status: 'todo',
      };
      expect(isTaskProposalAlreadySent(taskNotSent, sentIds)).toBe(false);
    });

    it('TC-FRONT-FILTER-11: marks task as sent if linked lead is in terminal closed status "Won", "Lost", or "Converted", but NOT "Quotation Sent"', () => {
      // Leads with status 'Quotation Sent' are actively in quotation stage and must NOT be marked as already sent
      const taskWithQuotationSentLead: TaskProposalFilterItem = {
        _id: 'task_lead_quotation_sent',
        taskType: 'lead',
        status: 'todo',
        history: [{ action: 'proposal' }],
        lead: {
          _id: 'lead_quotation_sent_1',
          status: 'Quotation Sent',
        },
      };
      expect(isTaskProposalAlreadySent(taskWithQuotationSentLead)).toBe(false);

      // Terminal closed lead statuses (Won, Lost, Converted, etc.) are marked as terminal/sent
      const taskWithWonLead: TaskProposalFilterItem = {
        _id: 'task_lead_won',
        taskType: 'lead',
        status: 'todo',
        lead: {
          _id: 'lead_won_1',
          status: 'Won',
        },
      };
      expect(isTaskProposalAlreadySent(taskWithWonLead)).toBe(true);

      const taskWithLostLead: TaskProposalFilterItem = {
        _id: 'task_lead_lost',
        taskType: 'lead',
        status: 'todo',
        lead: {
          _id: 'lead_lost_1',
          status: 'Lost',
        },
      };
      expect(isTaskProposalAlreadySent(taskWithLostLead)).toBe(true);
    });

    it('TC-FRONT-FILTER-11B: ensures task like TASK-00637 (assigned to user with proposal action) appears in proposal eligible dropdown', () => {
      const task637: TaskProposalFilterItem = {
        _id: '6aec56c49dd7b764223a5b00',
        taskNo: 'TASK-00637',
        title: 'Lead LEAD-00064: Mr.Ratheesh',
        taskType: 'lead',
        status: 'todo',
        history: [{ action: 'proposal' }],
        lead: {
          _id: '6aec534d9dd7b764223a2a89',
          leadId: 'LEAD-00064',
          name: 'Mr.Ratheesh',
          companyName: 'Red link Trading and Contracting Wll',
          status: 'Quotation Sent',
        },
      };

      // 1. Qualifies as a proposal category task due to history.action === 'proposal'
      expect(isTaskProposalCategoryOrStatus(task637)).toBe(true);

      // 2. Not marked as already sent because no proposal was created yet
      expect(isTaskProposalAlreadySent(task637)).toBe(false);

      // 3. Successfully included in dropdown
      const result = filterProposalEligibleTasks({
        tasks: [task637],
        sentProposals: [],
        isEditMode: false,
      });
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('6aec56c49dd7b764223a5b00');
    });

    it('TC-FRONT-FILTER-12: returns false for active, unsent proposal tasks', () => {
      const activeTask: TaskProposalFilterItem = {
        _id: 'task_active_1',
        taskType: 'proposal',
        status: 'todo',
        lead: {
          _id: 'lead_active_1',
          status: 'Quotation Requested',
          proposalRequested: true,
        },
      };
      expect(isTaskProposalAlreadySent(activeTask, new Set())).toBe(false);
    });

    it('TC-FRONT-FILTER-12A: marks task as already sent if history contains comment that proposal was created & sent (e.g. TASK-00377) even when status is todo', () => {
      const taskLike377: TaskProposalFilterItem = {
        _id: '6ad710c7e5013acb4e256242',
        taskNo: 'TASK-00377',
        title: 'Lead LEAD-00046: saba — SAS ENTERPRISES',
        taskType: 'lead',
        status: 'todo',
        history: [
          {
            action: 'proposal',
            fromStatus: 'todo',
            toStatus: 'done',
            comment: 'Proposal IT/QT/8103/20-10-2026 created & sent to client'
          } as any,
          {
            action: 'proposal',
            fromStatus: 'todo',
            toStatus: 'todo',
            comment: 'Proposal (TallyPrime Single User) sent to sabarishthavamani@gmail.com. Follow up on client review.'
          } as any
        ],
      };
      expect(isTaskProposalAlreadySent(taskLike377)).toBe(true);
    });

    it('TC-FRONT-FILTER-12B: marks task as already sent if task lead ID is found in sentLeadIds', () => {
      const taskWithLead: TaskProposalFilterItem = {
        _id: 'task_with_lead_99',
        taskNo: 'TASK-00099',
        taskType: 'lead',
        status: 'todo',
        lead: {
          _id: 'lead_sent_already_88',
          status: 'Contacted',
        },
      };
      const sentLeadIds = new Set(['lead_sent_already_88']);
      expect(isTaskProposalAlreadySent(taskWithLead, new Set(), sentLeadIds)).toBe(true);
    });

    it('TC-FRONT-FILTER-12C: marks task as already sent if linked lead has proposalSent === true', () => {
      const taskWithFlag: TaskProposalFilterItem = {
        _id: 'task_with_lead_flag',
        taskType: 'lead',
        status: 'todo',
        lead: {
          _id: 'lead_flag_1',
          proposalSent: true,
        } as any,
      };
      expect(isTaskProposalAlreadySent(taskWithFlag)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Dropdown List Filtering & Retention Tests
  // ─────────────────────────────────────────────────────────────
  describe('filterProposalEligibleTasks', () => {
    const mockTasks: TaskProposalFilterItem[] = [
      // 1. Irrelevant Ticket Task (must be excluded)
      {
        _id: 'task_ticket_1',
        taskNo: 'TASK-00009',
        title: 'Ticket TKT-0003: Tally Service & Support',
        taskType: 'ticket',
        status: 'todo',
      },
      // 2. Irrelevant Customer Task (must be excluded)
      {
        _id: 'task_cust_1',
        taskNo: 'TASK-00286',
        title: 'Customer Task — AL ZARAR CONTRACTING',
        taskType: 'customer',
        status: 'todo',
      },
      // 3. Valid Proposal Task (not sent yet) -> MUST BE INCLUDED
      {
        _id: 'task_prop_pending_1',
        taskNo: 'TASK-00401',
        title: 'Prepare Quotation for AMC Renewal',
        taskType: 'proposal',
        status: 'todo',
      },
      // 4. Valid Lead Task moved into Proposal status (not sent yet) -> MUST BE INCLUDED
      {
        _id: 'task_lead_pending_2',
        taskNo: 'TASK-00402',
        title: 'Follow-up with Doha Medical Center',
        taskType: 'proposal',
        status: 'todo',
        lead: {
          _id: 'lead_dmc',
          companyName: 'Doha Medical Center',
          status: 'Quotation Requested',
          proposalRequested: true,
        },
      },
      // 4B. Assigned Lead Task still in progress / not moved to Proposal -> MUST BE EXCLUDED
      {
        _id: 'task_lead_unmoved_5',
        taskNo: 'TASK-00405',
        title: 'Follow-up with Qatar Airways Lead',
        taskType: 'lead',
        status: 'in_progress',
        lead: {
          _id: 'lead_qa',
          companyName: 'Qatar Airways',
          status: 'Quotation Requested',
          proposalRequested: true,
        },
      },
      // 5. Proposal Task where proposal has ALREADY been sent -> MUST BE EXCLUDED
      {
        _id: 'task_prop_sent_3',
        taskNo: 'TASK-00403',
        title: 'Quotation for Al Mana Group',
        taskType: 'proposal',
        status: 'done',
      },
      // 6. Proposal Task with an active sent proposal linked -> MUST BE EXCLUDED
      {
        _id: 'task_prop_sent_4',
        taskNo: 'TASK-00404',
        title: 'Quotation for Barwa Real Estate',
        taskType: 'proposal',
        status: 'todo',
      },
      // 7. Proposal Task with history showing created & sent (e.g. TASK-00377) -> MUST BE EXCLUDED
      {
        _id: '6ad710c7e5013acb4e256242',
        taskNo: 'TASK-00377',
        title: 'Lead LEAD-00046: saba — SAS ENTERPRISES',
        taskType: 'lead',
        status: 'todo',
        history: [
          {
            action: 'proposal',
            fromStatus: 'todo',
            toStatus: 'done',
            comment: 'Proposal IT/QT/8103/20-10-2026 created & sent to client'
          } as any
        ],
      },
    ];

    const mockSentProposals: ProposalReferenceItem[] = [
      {
        _id: 'prop_001',
        proposalNo: 'PROP-0001',
        task: 'task_prop_sent_4',
        status: 'sent',
      },
      {
        _id: 'prop_002',
        proposalNo: 'PROP-0002',
        task: { _id: 'task_prop_sent_3' },
        status: 'accepted',
      },
    ];

    it('TC-FRONT-FILTER-13 & 14: filters out tickets, customer tasks, and already sent proposal tasks', () => {
      const result = filterProposalEligibleTasks({
        tasks: mockTasks,
        sentProposals: mockSentProposals,
        isEditMode: false,
      });

      const resultIds = result.map((t) => t._id);

      // Must NOT contain ticket tasks
      expect(resultIds).not.toContain('task_ticket_1');
      // Must NOT contain general customer tasks
      expect(resultIds).not.toContain('task_cust_1');
      // Must NOT contain already done / sent proposal tasks
      expect(resultIds).not.toContain('task_prop_sent_3');
      expect(resultIds).not.toContain('task_prop_sent_4');
      // Must NOT contain TASK-00377 (already sent in history)
      expect(resultIds).not.toContain('6ad710c7e5013acb4e256242');
      // Must NOT contain lead tasks that have not been moved to Proposal status
      expect(resultIds).not.toContain('task_lead_unmoved_5');

      // MUST contain pending unsent proposal tasks
      expect(resultIds).toContain('task_prop_pending_1');
      expect(resultIds).toContain('task_lead_pending_2');
      expect(result).toHaveLength(2);
    });

    it('TC-FRONT-FILTER-15: preserves active currentTaskId even if completed or sent when in edit mode (edit mode safety)', () => {
      // User is editing proposal associated with task_prop_sent_4
      const result = filterProposalEligibleTasks({
        tasks: mockTasks,
        sentProposals: mockSentProposals,
        currentTaskId: 'task_prop_sent_4',
        isEditMode: true,
      });

      const resultIds = result.map((t) => t._id);
      expect(resultIds).toContain('task_prop_sent_4');
      expect(resultIds).toContain('task_prop_pending_1');
      expect(resultIds).toContain('task_lead_pending_2');
      // Still excludes unrelated tickets, customer tasks, and other sent tasks
      expect(resultIds).not.toContain('task_ticket_1');
      expect(resultIds).not.toContain('task_cust_1');
      expect(resultIds).not.toContain('task_lead_unmoved_5');
      expect(resultIds).not.toContain('6ad710c7e5013acb4e256242');
    });

    it('TC-FRONT-FILTER-15A: in new proposal mode (isEditMode = false), strictly excludes already sent tasks even if passed as currentTaskId', () => {
      const result = filterProposalEligibleTasks({
        tasks: mockTasks,
        sentProposals: mockSentProposals,
        currentTaskId: '6ad710c7e5013acb4e256242', // TASK-00377
        isEditMode: false,
      });

      const resultIds = result.map((t) => t._id);
      // Strictly excluded because proposal was already sent!
      expect(resultIds).not.toContain('6ad710c7e5013acb4e256242');
      expect(resultIds).toContain('task_prop_pending_1');
      expect(resultIds).toContain('task_lead_pending_2');
      expect(result).toHaveLength(2);
    });

    it('TC-FRONT-FILTER-16: de-duplicates tasks with identical _id', () => {
      const duplicates: TaskProposalFilterItem[] = [
        {
          _id: 'task_dup_1',
          taskNo: 'TASK-00999',
          title: 'Quotation for Tally Server',
          taskType: 'proposal',
          status: 'todo',
        },
        {
          _id: 'task_dup_1',
          taskNo: 'TASK-00999',
          title: 'Quotation for Tally Server',
          taskType: 'proposal',
          status: 'todo',
        },
      ];

      const result = filterProposalEligibleTasks({
        tasks: duplicates,
        sentProposals: [],
      });

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('task_dup_1');
    });
  });
});
