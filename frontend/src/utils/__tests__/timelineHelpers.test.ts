import { describe, it, expect } from 'vitest';
import { buildTaskAuditTimeline } from '../timelineHelpers';
import { Task } from '../../types';

describe('buildTaskAuditTimeline', () => {
  it('correctly maps the exact 5-row flow matching Lead Status Overview', () => {
    const mockTask: Task = {
      _id: 'task-123',
      taskNo: 'TASK-00071',
      title: 'Lead Follow-up',
      description: 'get requirements',
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-08-29T10:00:00.000Z',
      createdAt: '2026-08-29T08:00:00.000Z',
      updatedAt: '2026-08-29T09:30:00.000Z',
      assignedTo: { _id: 'caleb-1', name: 'Caleb' } as any,
      createdBy: { _id: 'admin-1', name: 'WelcomeTech Admin' } as any,
      tags: [],
      history: [
        {
          action: 'created',
          comment: 'call morning at 11 AM',
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-08-29T08:00:00.000Z',
        },
        {
          action: 'forwarded',
          comment: 'send proposal',
          fromAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          toAssignee: { _id: 'admin-1', name: 'WelcomeTech Admin' } as any,
          createdAt: '2026-08-29T08:30:00.000Z',
        },
        {
          action: 'forwarded',
          comment: 'call morning at 11 AM',
          fromAssignee: { _id: 'admin-1', name: 'WelcomeTech Admin' } as any,
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-08-29T09:00:00.000Z',
        },
        {
          action: 'lost',
          comment: 'he was not interested in this',
          performedBy: { _id: 'admin-1', name: 'WelcomeTech Admin' } as any,
          createdAt: '2026-08-29T09:30:00.000Z',
        },
      ],
    } as unknown as Task;

    const rows = buildTaskAuditTimeline(mockTask);

    expect(rows.length).toBe(5);

    // Row 1: Live Current Stage / Scheduled Follow-Up
    expect(rows[0].actorName).toBe('Caleb');
    expect(rows[0].description).toBe('get requirements');
    expect(rows[0].actionLabel).toBe('FOLLOW-UP');
    expect(rows[0].followUpType).toBe('Task');

    // Row 2: Baseline TODO
    expect(rows[1].actorName).toBe('Caleb');
    expect(rows[1].actionLabel).toBe('TODO');
    expect(rows[1].description).toBe('—');

    // Row 3: Send proposal handover
    expect(rows[2].actorName).toBe('WelcomeTech Admin');
    expect(rows[2].description).toBe('send proposal');
    expect(rows[2].actionLabel).toBe('REASSIGNED');

    // Row 4: Call morning at 11 AM handover
    expect(rows[3].actorName).toBe('Caleb');
    expect(rows[3].description).toBe('call morning at 11 AM');
    expect(rows[3].actionLabel).toBe('REASSIGNED');

    // Row 5: Lost / Not Interested
    expect(rows[4].actorName).toBe('WelcomeTech Admin');
    expect(rows[4].description).toBe('he was not interested in this');
    expect(rows[4].actionLabel).toBe('NOT INTERESTED');
    expect(rows[4].followUpType).toBe('Lead / Deal');
  });

  it('returns empty array when task is null or undefined', () => {
    expect(buildTaskAuditTimeline(null)).toEqual([]);
    expect(buildTaskAuditTimeline(undefined)).toEqual([]);
  });

  it('only shows the updated status (e.g. REVIEW) and suppresses accidental completion entry when task is changed to review', () => {
    const taskChangedToReview: Task = {
      _id: 'task-00073',
      taskNo: 'TASK-00073',
      title: 'Customer Task',
      description: 'Testing',
      status: 'review',
      priority: 'low',
      dueDate: '2026-09-01T10:00:00.000Z',
      createdAt: '2026-09-01T03:09:00.000Z',
      updatedAt: '2026-09-02T10:15:00.000Z',
      assignedTo: { _id: 'caleb-1', name: 'Caleb' } as any,
      history: [
        {
          action: 'created',
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-09-01T03:09:00.000Z',
        },
        {
          action: 'proposal',
          comment: 'Generate Proposal',
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-09-01T03:10:00.000Z',
        },
        // Accidental complete at 10:13 AM
        {
          action: 'completed',
          comment: 'completed',
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-09-02T10:13:00.000Z',
        },
        // Corrected to Review at 10:15 AM
        {
          action: 'status_change',
          toStatus: 'review',
          fromStatus: 'done',
          comment: 'Testing',
          toAssignee: { _id: 'caleb-1', name: 'Caleb' } as any,
          createdAt: '2026-09-02T10:15:00.000Z',
        },
      ],
    } as unknown as Task;

    const rows = buildTaskAuditTimeline(taskChangedToReview);

    // Should NOT contain a COMPLETED row because the task is currently in REVIEW
    const completedRows = rows.filter((r) => r.actionLabel === 'COMPLETED');
    expect(completedRows.length).toBe(0);

    // Row 1 MUST show the active updated stage: REVIEW with comment "Testing"
    expect(rows[0].actionLabel).toBe('REVIEW');
    expect(rows[0].badgeStatus).toBe('badge-purple');
    expect(rows[0].description).toBe('Testing');

    // Baseline TODO and Proposal remain in chronological history
    expect(rows.some((r) => r.actionLabel === 'TODO')).toBe(true);
    expect(rows.some((r) => r.actionLabel === 'PROPOSAL')).toBe(true);
  });
});
