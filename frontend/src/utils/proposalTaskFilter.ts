export interface TaskProposalFilterItem {
  _id: string;
  taskNo?: string;
  title?: string;
  description?: string;
  taskType?: string;
  status?: string;
  tags?: string[];
  history?: Array<{ action?: string }>;
  lead?: {
    _id?: string;
    leadId?: string;
    name?: string;
    companyName?: string;
    status?: string;
    proposalRequested?: boolean;
  } | string | null;
  customer?: any;
  ticket?: any;
  assignedTo?: any;
}

export interface ProposalReferenceItem {
  _id?: string;
  proposalNo?: string;
  task?: string | { _id?: string };
  status?: string;
}

const PROPOSAL_REGEX = /proposal|quotation/i;
const TERMINAL_SENT_LEAD_STATUSES = new Set([
  'won',
  'converted',
  'lost',
  'not interested',
  'junk'
]);

/**
 * Validates if a task belongs to the proposal category or status.
 * Matches:
 * 1. taskType === 'proposal' (e.g. created as proposal task or moved to proposal)
 * 2. status === 'proposal' (e.g. moved into Proposal status)
 * 3. tags containing 'proposal' or 'quotation'
 * 4. title or description containing 'proposal' or 'quotation'
 * 5. history log containing a 'proposal' action
 */
export const isTaskProposalCategoryOrStatus = (task?: TaskProposalFilterItem | null): boolean => {
  if (!task) return false;

  // 1. Direct taskType match
  if (task.taskType === 'proposal') return true;

  // 2. Direct task status match
  if (task.status === 'proposal') return true;

  // 3. Task tags match
  if (Array.isArray(task.tags) && task.tags.some((tg) => PROPOSAL_REGEX.test(String(tg)))) {
    return true;
  }

  // 4. Task title or description match
  if (typeof task.title === 'string' && PROPOSAL_REGEX.test(task.title)) {
    return true;
  }
  if (typeof task.description === 'string' && PROPOSAL_REGEX.test(task.description)) {
    return true;
  }

  // 5. Task history action match
  if (Array.isArray(task.history) && task.history.some((h) => h?.action === 'proposal')) {
    return true;
  }

  return false;
};

const PROPOSAL_SENT_HISTORY_REGEX = /created & sent|sent to client|sent to customer|proposal .* sent to/i;

/**
 * Checks whether a proposal has already been sent for this task,
 * or if the task history indicates a proposal was sent,
 * or if the task is already completed/cancelled or lead is in terminal/sent state.
 */
export const isTaskProposalAlreadySent = (
  task?: TaskProposalFilterItem | null,
  sentTaskIds?: Set<string>,
  sentLeadIds?: Set<string>
): boolean => {
  if (!task) return false;

  const tid = String(task._id || '');

  // 1. If task status is done, completed, or cancelled, proposal was already concluded/sent
  if (['done', 'completed', 'cancelled'].includes(String(task.status || '').toLowerCase())) {
    return true;
  }

  // 2. If task ID is present in known sent/accepted proposals set
  if (sentTaskIds && tid && sentTaskIds.has(tid)) {
    return true;
  }

  // 3. If task's lead ID is present in known sent/accepted proposals set
  const leadId = typeof task.lead === 'object' && task.lead ? String(task.lead._id || '') : (typeof task.lead === 'string' ? task.lead : '');
  if (sentLeadIds && leadId && sentLeadIds.has(leadId)) {
    return true;
  }

  // 4. If task history contains an entry where a proposal was sent to client / customer
  if (Array.isArray(task.history) && task.history.some((h: any) =>
    PROPOSAL_SENT_HISTORY_REGEX.test(h?.comment || '') ||
    (h?.action === 'proposal' && (h?.toStatus === 'done' || /sent/i.test(h?.comment || '')))
  )) {
    return true;
  }

  // 5. If linked lead already had proposal sent flag or is in closed/sent stage
  if (task.lead && typeof task.lead === 'object') {
    if ((task.lead as any).proposalSent === true) {
      return true;
    }
    if (task.lead.status) {
      const leadStatusLower = String(task.lead.status).trim().toLowerCase();
      if (TERMINAL_SENT_LEAD_STATUSES.has(leadStatusLower)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Filters the list of tasks for the "SELECT TASK PROPOSAL" dropdown:
 * - Only includes tasks in proposal category/status.
 * - Excludes tasks where a proposal has already been sent.
 * - Always preserves the currently active taskId (e.g. when editing an existing proposal or opened with ?taskId=).
 */
export const filterProposalEligibleTasks = (params: {
  tasks?: TaskProposalFilterItem[] | null;
  sentProposals?: ProposalReferenceItem[] | null;
  currentTaskId?: string | null;
  isEditMode?: boolean;
}): TaskProposalFilterItem[] => {
  const { tasks = [], sentProposals = [], currentTaskId, isEditMode = false } = params;
  const activeId = currentTaskId ? String(currentTaskId).trim() : '';

  // Build lookup of task IDs and lead IDs whose proposal has already been sent or accepted
  const sentTaskIds = new Set<string>();
  const sentLeadIds = new Set<string>();
  (sentProposals || []).forEach((p: any) => {
    const isSent = p.status === 'sent' || p.status === 'accepted' || Boolean(p.sentAt);
    if (!isSent) return;

    const pTaskId = typeof p.task === 'object' && p.task ? p.task._id : p.task;
    if (pTaskId) {
      sentTaskIds.add(String(pTaskId));
    }
    const pLeadId = typeof p.lead === 'object' && p.lead ? p.lead._id : p.lead;
    if (pLeadId) {
      sentLeadIds.add(String(pLeadId));
    }
  });

  const seenIds = new Set<string>();
  const filtered: TaskProposalFilterItem[] = [];

  (tasks || []).forEach((t) => {
    if (!t || !t._id) return;
    const tid = String(t._id);
    if (seenIds.has(tid)) return;

    const isAlreadySent = isTaskProposalAlreadySent(t, sentTaskIds, sentLeadIds);
    const isCategoryEligible = isTaskProposalCategoryOrStatus(t);

    // In create mode (new list), if already sent, NEVER include it under any circumstance
    if (!isEditMode && isAlreadySent) {
      return;
    }

    // In edit mode, allow preserving the active proposal's current task
    const isActive = Boolean(isEditMode && activeId && tid === activeId);

    // Keep if it is the actively selected/edited task, or if it matches proposal category and has NOT been sent
    if (isActive || (isCategoryEligible && !isAlreadySent)) {
      seenIds.add(tid);
      filtered.push(t);
    }
  });

  return filtered;
};
