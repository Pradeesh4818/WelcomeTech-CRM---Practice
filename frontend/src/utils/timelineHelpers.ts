import { Task } from '../types';

export interface TimelineActivityRow {
  id: string;
  date: string | Date;
  actorName: string;
  followUpType?: string;
  nextDueDate?: string | Date;
  description: string;
  actionLabel: string;
  badgeStatus: string;
  statusUpdatedAt?: string | Date;
}

/**
 * Single source of truth for building the Task Audit & Lifecycle History timeline.
 * Used across TasksPage, MiscPages (Proposals), and LeadsPage.
 */
export const buildTaskAuditTimeline = (task?: Task | null): TimelineActivityRow[] => {
  if (!task) return [];

  const rows: TimelineActivityRow[] = [];
  const currentAssigneeName =
    typeof task.assignedTo === 'object' && task.assignedTo
      ? (task.assignedTo as any).name
      : 'Caleb';
  const createdActorName =
    typeof task.createdBy === 'object' && task.createdBy
      ? (task.createdBy as any).name
      : 'WelcomeTech Admin';

  const historyList = Array.isArray(task.history) ? task.history : [];
  const initialCreatedHistory = historyList.find((h) => h.action === 'created');
  const initialDate = (initialCreatedHistory && initialCreatedHistory.createdAt) || task.taskDate || task.createdAt || new Date();
  const initialActor =
    (typeof initialCreatedHistory?.toAssignee === 'object' && (initialCreatedHistory?.toAssignee as any)?.name) ||
    (typeof task.assignedTo === 'object' && (task.assignedTo as any)?.name) ||
    'Caleb';

  // 1. LIVE CURRENT STAGE / SCHEDULED FOLLOW-UP (Row 1)
  const isDone = task.status === 'done' || task.status === ('completed' as any);
  if (task.description && task.description !== '—') {
    const liveDate = task.updatedAt || task.taskDate || task.createdAt || new Date();
    const liveStatusLabel =
      isDone ? 'COMPLETED'
      : task.status === 'review' ? 'REVIEW'
      : task.status === 'in_progress' ? 'IN PROGRESS'
      : task.status === 'blocked' ? 'BLOCKED'
      : task.status === 'forwarded' ? 'REASSIGNED'
      : 'FOLLOW-UP';

    const liveBadgeStatus =
      isDone ? 'badge-green'
      : task.status === 'review' ? 'badge-purple'
      : task.status === 'in_progress' ? 'badge-blue'
      : task.status === 'blocked' ? 'badge-red'
      : task.status === 'forwarded' ? 'badge-amber'
      : 'badge-amber';

    rows.push({
      id: 'live-current-stage',
      date: liveDate,
      actorName: currentAssigneeName,
      followUpType: 'Task',
      nextDueDate: isDone ? undefined : (task.dueDate || undefined),
      description: task.description,
      actionLabel: liveStatusLabel,
      badgeStatus: liveBadgeStatus,
      statusUpdatedAt: liveDate,
    });
  }

  // 2. BASELINE TODO ROW (Row 2)
  rows.push({
    id: 'initial-creation-baseline',
    date: initialDate,
    actorName: initialActor,
    followUpType: undefined,
    nextDueDate: undefined,
    description: '—',
    actionLabel: 'TODO',
    badgeStatus: 'badge-teal',
    statusUpdatedAt: initialDate,
  });

  // 3. CHRONOLOGICAL HISTORY ACTIONS (Rows 3 onwards)
  const nonCreatedHistory = historyList.filter((h) => h.action !== 'created');
  nonCreatedHistory.forEach((h, idx) => {
    // If this history item is identical in description and date to the live stage, skip duplicate
    if (h.comment && h.comment === task.description && idx === nonCreatedHistory.length - 1) {
      return;
    }

    const toName = typeof h.toAssignee === 'object' && h.toAssignee ? (h.toAssignee as any).name : '';
    const performerName = typeof h.performedBy === 'object' && h.performedBy ? (h.performedBy as any).name : '';
    const fromName = typeof h.fromAssignee === 'object' && h.fromAssignee ? (h.fromAssignee as any).name : '';

    const isLost =
      h.action === ('lost' as any) ||
      (h.comment && /not[\s_-]?interested|lost|rejected|budget constraints|went with competitor/i.test(h.comment));
    const isProposal = !isLost && h.action === 'proposal';
    const isComplete = !isLost && !isProposal && (h.action === 'completed' || h.toStatus === 'done' || (h.comment && /completed|closed/i.test(h.comment)));

    // If the task is currently NOT completed (e.g. marked complete by mistake and changed to Review),
    // suppress the outdated / superseded completion entry so only the updated active stage is shown
    if (isComplete && !isDone) {
      return;
    }

    const isForward = !isLost && ((h.action as string) === 'forwarded' || (h.action as string) === 'reassigned' || (fromName && toName && fromName !== toName));
    const isStatusChange = h.action === 'status_change';
    const toStatus = h.toStatus || (isComplete ? 'done' : undefined);

    const actionLabel =
      isLost ? 'NOT INTERESTED'
      : isComplete ? 'COMPLETED'
      : isProposal ? 'PROPOSAL'
      : isForward ? 'REASSIGNED'
      : toStatus === 'in_progress' ? 'IN PROGRESS'
      : toStatus === 'review' ? 'REVIEW'
      : toStatus === 'blocked' ? 'BLOCKED'
      : toStatus === 'todo' ? 'TO DO'
      : isStatusChange ? 'STATUS UPDATED'
      : 'REASSIGNED';

    const badgeStatus =
      isLost ? 'badge-red'
      : isComplete ? 'badge-green'
      : isProposal ? 'badge-blue'
      : isForward ? 'badge-amber'
      : toStatus === 'in_progress' ? 'badge-blue'
      : toStatus === 'review' ? 'badge-purple'
      : toStatus === 'blocked' ? 'badge-red'
      : toStatus === 'todo' ? 'badge-teal'
      : 'badge-amber';

    const actorName = isLost
      ? (performerName || fromName || initialActor)
      : (toName || performerName || fromName || currentAssigneeName);

    const itemDate = h.createdAt || task.updatedAt || new Date();

    rows.push({
      id: `hist-${idx}`,
      date: itemDate,
      actorName,
      followUpType: isLost ? 'Lead / Deal' : 'Task',
      nextDueDate: undefined,
      description: h.comment || '—',
      actionLabel,
      badgeStatus,
      statusUpdatedAt: itemDate,
    });
  });

  return rows;
};
