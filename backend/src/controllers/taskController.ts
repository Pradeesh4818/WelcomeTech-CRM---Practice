import { Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Customer from '../models/Customer';
import { Lead, ILead, LeadActivity, LeadFollowUp, LeadNotification, LeadStatusHistory } from '../models/Lead';
import { Ticket, ITicket, Proposal } from '../models/index';
import Task, { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TaskPriority, TaskStatus, TaskType } from '../models/Task';
import { AuthRequest, isAdminUser, getRoleName } from '../middleware/auth';
import { sendPushToUser } from '../utils/fcm';

const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review'];
let leadTaskSyncPromise: Promise<void> | null = null;
let ticketTaskSyncPromise: Promise<void> | null = null;

const toStringOrUndefined = (value: unknown): string | undefined => {
  const s = String(value ?? '').trim();
  return s ? s : undefined;
};

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
};

const parseDateOrUndefined = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const sanitizePriority = (value: unknown, fallback: TaskPriority = 'medium'): TaskPriority => {
  const s = String(value || '').toLowerCase();
  return TASK_PRIORITIES.includes(s as TaskPriority) ? (s as TaskPriority) : fallback;
};

const sanitizeStatus = (value: unknown, fallback: TaskStatus = 'todo'): TaskStatus => {
  const s = String(value || '').toLowerCase();
  return TASK_STATUSES.includes(s as TaskStatus) ? (s as TaskStatus) : fallback;
};

const sanitizeTaskType = (value: unknown, fallback: TaskType = 'general'): TaskType => {
  const s = String(value || '').toLowerCase();
  return TASK_TYPES.includes(s as TaskType) ? (s as TaskType) : fallback;
};

const isObjectId = (value: string | undefined): boolean => !!value && mongoose.Types.ObjectId.isValid(value);

const getDayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const populateTask = (query: ReturnType<typeof Task.findById>) =>
  query
    .populate('customer', 'name phone email companyName companyInfo address location')
    .populate('lead', 'leadId name companyName phone email status priority')
    .populate('ticket', 'ticketNo title status priority category')
    .populate('assignedTo', 'name email role department')
    .populate('createdBy', 'name email role')
    .populate('forwardedBy', 'name email role')
    .populate('completedBy', 'name email role')
    .populate('history.performedBy', 'name email role')
    .populate('history.fromAssignee', 'name email role')
    .populate('history.toAssignee', 'name email role');

let lastLeadTaskSync = 0;
let lastTicketTaskSync = 0;
const TASK_SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes

const syncAssignedLeadTasks = async (force = false): Promise<void> => {
  if (!force && Date.now() - lastLeadTaskSync < TASK_SYNC_INTERVAL) {
    return;
  }
  if (leadTaskSyncPromise) {
    await leadTaskSyncPromise;
    return;
  }

  leadTaskSyncPromise = syncAssignedLeadTasksNow();
  try {
    await leadTaskSyncPromise;
    lastLeadTaskSync = Date.now();
  } finally {
    leadTaskSyncPromise = null;
  }
};

const syncAssignedLeadTasksNow = async (): Promise<void> => {
  const leads = await Lead.find({
    isActive: true,
    assignedTo: { $exists: true, $ne: null },
  }).select(
    '_id leadId name companyName phone email requirementDescription notes leadType priority expectedClosingDate nextFollowupDate assignedTo createdBy customerId'
  );

  const leadIds = leads.map((l) => l._id);

  // Clean up any stale/orphaned lead tasks whose lead is deleted or unassigned
  await Task.deleteMany({
    taskType: 'lead',
    $or: [
      { lead: { $nin: leadIds } },
      { lead: { $exists: false } },
      { lead: null },
    ],
  });

  // Bulk-fetch existing tasks, latest activities, and follow-ups once
  const [existingLeadTasks, latestActivities, latestFollowUps] = await Promise.all([
    Task.find({ lead: { $in: leadIds } }),
    LeadActivity.find({ lead: { $in: leadIds } }).sort({ createdAt: -1 }),
    LeadFollowUp.find({ lead: { $in: leadIds }, remarks: { $exists: true, $ne: '' } }).sort({ scheduledAt: -1, createdAt: -1 }),
  ]);

  const tasksByLead = new Map(existingLeadTasks.map((t) => [String(t.lead), t]));

  const activityByLead = new Map<string, string>();
  for (const act of latestActivities) {
    const leadKey = String(act.lead);
    if (!activityByLead.has(leadKey)) {
      if (
        [
          'lead_created',
          'lead_updated',
          'assigned',
          'reassigned',
          'follow_up_added',
          'follow_up_updated',
          'follow_up_deleted',
          'status_changed',
          'task_completed',
        ].includes(act.type)
      ) {
        continue;
      }
      const desc = (act.metadata?.description as string) || (act.metadata?.remarks as string) || '';
      const isSystemLog =
        !desc ||
        desc.toLowerCase().includes('follow-up scheduled') ||
        desc.toLowerCase().includes('follow-up deleted') ||
        desc.toLowerCase().includes('lead assigned') ||
        desc.toLowerCase().includes('lead created') ||
        desc.toLowerCase().includes('task-');
      if (!isSystemLog) {
        activityByLead.set(leadKey, desc);
      }
    }
  }

  const followUpByLead = new Map<string, string>();
  for (const f of latestFollowUps) {
    const leadKey = String(f.lead);
    if (!followUpByLead.has(leadKey) && f.remarks) {
      followUpByLead.set(leadKey, f.remarks);
    }
  }

  await Promise.all(leads.map(async (lead: ILead) => {
    if (!lead.assignedTo) return;

    const title = `Lead ${lead.leadId}: ${lead.name}`;
    const cleanDescription =
      followUpByLead.get(String(lead._id)) ||
      activityByLead.get(String(lead._id)) ||
      lead.requirementDescription ||
      (lead as any).notes ||
      (lead.leadType ? `Lead for ${lead.leadType}` : `Lead ${lead.leadId}`);

    const dueDate = lead.nextFollowupDate || undefined;
    const existingTask = tasksByLead.get(String(lead._id));

    if (existingTask) {
      if (!existingTask.isActive) {
        // Task was explicitly deleted by user; do NOT resurrect or recreate it
        return;
      }
      existingTask.title = title;
      existingTask.description = cleanDescription;
      existingTask.assignedTo = lead.assignedTo;
      existingTask.priority = lead.priority || existingTask.priority;
      existingTask.dueDate = dueDate;
      existingTask.taskType = 'lead';
      existingTask.tags = Array.from(new Set([...(existingTask.tags || []), 'lead', lead.leadId].filter(Boolean)));
      if ((lead as any).customerId) existingTask.customer = (lead as any).customerId;
      await existingTask.save();
      return;
    }

    await Task.create({
      title,
      description: cleanDescription,
      lead: lead._id,
      customer: (lead as any).customerId || undefined,
      assignedTo: lead.assignedTo,
      taskType: 'lead',
      status: 'todo',
      priority: lead.priority || 'medium',
      dueDate,
      tags: ['lead', lead.leadId],
      createdBy: lead.createdBy,
    });
  }));
};

const ticketTaskStatus = (status: string): TaskStatus => {
  if (status === 'in-progress') return 'in_progress';
  if (status === 'pending-customer') return 'blocked';
  if (status === 'resolved' || status === 'closed') return 'done';
  return 'todo';
};

const syncAssignedTicketTasks = async (force = false): Promise<void> => {
  if (!force && Date.now() - lastTicketTaskSync < TASK_SYNC_INTERVAL) {
    return;
  }
  if (ticketTaskSyncPromise) {
    await ticketTaskSyncPromise;
    return;
  }

  ticketTaskSyncPromise = syncAssignedTicketTasksNow();
  try {
    await ticketTaskSyncPromise;
    lastTicketTaskSync = Date.now();
  } finally {
    ticketTaskSyncPromise = null;
  }
};

const syncAssignedTicketTasksNow = async (): Promise<void> => {
  const tickets = await Ticket.find({
    assignedTo: { $exists: true, $ne: null },
  }).select(
    '_id ticketNo customer contactPerson mailId phoneNumber assignedTo subject description category subCategory status priority createdBy'
  ).populate('customer', 'name phone');

  // Bulk-fetch existing tasks once (avoids an N+1 findOne per ticket).
  const existingTicketTasks = await Task.find({ ticket: { $in: tickets.map((t: any) => t._id) } });
  const tasksByTicket = new Map(existingTicketTasks.map((t) => [String(t.ticket), t]));

  await Promise.all(tickets.map(async (ticket: ITicket | any) => {
    if (!ticket.assignedTo) return;

    const title = `Ticket ${ticket.ticketNo}: ${ticket.subject}`;
    const customerName = typeof ticket.customer === 'object' ? ticket.customer?.name : '';
    const description = [
      customerName ? `Company: ${customerName}` : '',
      ticket.contactPerson ? `Contact: ${ticket.contactPerson}` : '',
      ticket.phoneNumber ? `Phone: ${ticket.phoneNumber}` : '',
      ticket.mailId ? `Email: ${ticket.mailId}` : '',
      ticket.category ? `Category: ${ticket.category}${ticket.subCategory ? ` / ${ticket.subCategory}` : ''}` : '',
      ticket.description ? `Issue: ${ticket.description}` : '',
    ].filter(Boolean).join('\n');
    const status = ticketTaskStatus(ticket.status);
    const existingTask = tasksByTicket.get(String(ticket._id));

    if (existingTask) {
      if (!existingTask.isActive) {
        // Task was explicitly deleted by user; do NOT resurrect or recreate it
        return;
      }
      existingTask.title = title;
      existingTask.description = description || existingTask.description;
      existingTask.customer = ticket.customer?._id || ticket.customer || existingTask.customer;
      existingTask.assignedTo = ticket.assignedTo;
      existingTask.status = status;
      existingTask.priority = ticket.priority || existingTask.priority;
      existingTask.completedAt = status === 'done' ? existingTask.completedAt || new Date() : undefined;
      existingTask.tags = Array.from(new Set([...(existingTask.tags || []), 'ticket', ticket.ticketNo, ticket.category].filter(Boolean)));
      await existingTask.save();
      return;
    }

    await Task.create({
      title,
      description,
      customer: ticket.customer?._id || ticket.customer,
      ticket: ticket._id,
      assignedTo: ticket.assignedTo,
      status,
      priority: ticket.priority || 'medium',
      tags: ['ticket', ticket.ticketNo, ticket.category].filter(Boolean),
      createdBy: ticket.createdBy,
      completedAt: status === 'done' ? new Date() : undefined,
    });
  }));
};

export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await syncAssignedLeadTasks();
    await syncAssignedTicketTasks();

    const { status, priority, assignedTo, customer, due, dateFilter, date, fromDate, toDate, startDate, endDate, search, taskType, proposalOnly, notSentOnly, excludeSent, page = 1, limit = 10 } = req.query;
    const filter: Record<string, unknown> = { isActive: true };
    const andClauses: Record<string, unknown>[] = [];
    const { start, end } = getDayBounds();
    const currentUserId = isObjectId(String(req.user?._id || '')) ? req.user?._id : undefined;

    if (typeof status === 'string' && status !== 'all') filter.status = status;
    const isAdmin = isAdminUser(req.user);
    if (!isAdmin) {
      if (currentUserId && isObjectId(String(currentUserId))) {
        const empObjectId = new mongoose.Types.ObjectId(String(currentUserId));
        andClauses.push({
          $or: [
            { assignedTo: empObjectId },
            { forwardedBy: empObjectId, isActive: true },
          ],
        });
      }
    } else if (typeof assignedTo === 'string' && assignedTo !== 'all') {
      const requestedId = assignedTo === 'me' ? currentUserId : assignedTo;
      if (isObjectId(String(requestedId || ''))) {
        const empObjectId = new mongoose.Types.ObjectId(String(requestedId));
        andClauses.push({
          $or: [
            { assignedTo: empObjectId },
            { forwardedBy: empObjectId, isActive: true },
          ],
        });
      }
    }
    if (typeof customer === 'string' && customer !== 'all') filter.customer = customer;

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;
    const hasExplicitDateRange = Boolean(effectiveStart && effectiveEnd);

    if (hasExplicitDateRange) {
      const parsedS = new Date(String(effectiveStart));
      parsedS.setHours(0, 0, 0, 0);
      const parsedE = new Date(String(effectiveEnd));
      parsedE.setHours(23, 59, 59, 999);
      if (!isNaN(parsedS.getTime()) && !isNaN(parsedE.getTime())) {
        andClauses.push({
          $or: [
            { taskDate: { $gte: parsedS, $lte: parsedE } },
            { dueDate: { $gte: parsedS, $lte: parsedE } },
            { createdAt: { $gte: parsedS, $lte: parsedE } },
          ],
        });
      }
    }

    const effectiveDateFilter = (typeof dateFilter === 'string' && dateFilter !== 'all') ? dateFilter : (typeof due === 'string' && due !== 'all' ? due : undefined);

    if (effectiveDateFilter) {
      if (effectiveDateFilter === 'overdue') {
        filter.status = { $in: OPEN_STATUSES };
        filter.dueDate = { $lt: start };
      } else if (effectiveDateFilter === 'upcoming') {
        filter.status = { $in: OPEN_STATUSES };
        filter.dueDate = { $gte: end };
      } else if (effectiveDateFilter === 'unscheduled') {
        filter.dueDate = { $exists: false };
      } else if (!hasExplicitDateRange) {
        if (effectiveDateFilter === 'today') {
          andClauses.push({
            $or: [
              { dueDate: { $gte: start, $lt: end } },
              { taskDate: { $gte: start, $lt: end } },
              { createdAt: { $gte: start, $lt: end } },
            ],
          });
        } else if (effectiveDateFilter === 'yesterday') {
          const yStart = new Date(start);
          yStart.setDate(yStart.getDate() - 1);
          const yEnd = new Date(end);
          yEnd.setDate(yEnd.getDate() - 1);
          andClauses.push({
            $or: [
              { dueDate: { $gte: yStart, $lt: yEnd } },
              { taskDate: { $gte: yStart, $lt: yEnd } },
              { createdAt: { $gte: yStart, $lt: yEnd } },
            ],
          });
        } else if (effectiveDateFilter === 'this_week') {
          const now = new Date();
          const firstDay = new Date(now);
          firstDay.setDate(now.getDate() - now.getDay());
          firstDay.setHours(0, 0, 0, 0);
          const lastDay = new Date(firstDay);
          lastDay.setDate(lastDay.getDate() + 7);
          andClauses.push({
            $or: [
              { dueDate: { $gte: firstDay, $lt: lastDay } },
              { taskDate: { $gte: firstDay, $lt: lastDay } },
              { createdAt: { $gte: firstDay, $lt: lastDay } },
            ],
          });
        } else if (effectiveDateFilter === 'this_month') {
          const now = new Date();
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
          andClauses.push({
            $or: [
              { dueDate: { $gte: firstDay, $lt: lastDay } },
              { taskDate: { $gte: firstDay, $lt: lastDay } },
              { createdAt: { $gte: firstDay, $lt: lastDay } },
            ],
          });
        }
      }
    }

    if (typeof date === 'string' && date.trim()) {
      const targetDate = new Date(date.trim());
      if (!isNaN(targetDate.getTime())) {
        const dStart = new Date(targetDate);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(targetDate);
        dEnd.setHours(23, 59, 59, 999);
        andClauses.push({
          $or: [
            { taskDate: { $gte: dStart, $lte: dEnd } },
            { dueDate: { $gte: dStart, $lte: dEnd } },
            { createdAt: { $gte: dStart, $lte: dEnd } },
          ],
        });
      }
    }

    if (String(proposalOnly) === 'true' || taskType === 'proposal') {
      andClauses.push({
        $or: [
          { taskType: 'proposal' },
          { status: 'proposal' },
          { tags: { $in: ['proposal', 'Proposal', 'quotation', 'Quotation'] } },
          { title: { $regex: 'proposal|quotation', $options: 'i' } },
          { description: { $regex: 'proposal|quotation', $options: 'i' } },
          { 'history.action': 'proposal' },
        ],
      });
    } else if (typeof taskType === 'string' && taskType !== 'all') {
      filter.taskType = taskType;
    }

    if (String(notSentOnly) === 'true' || String(excludeSent) === 'true') {
      andClauses.push({ status: { $nin: ['done', 'completed', 'cancelled'] } });

      // Exclude tasks whose history indicates a proposal was already created & sent
      andClauses.push({
        'history.comment': {
          $not: /created & sent|sent to client|sent to customer|proposal .* sent to/i,
        },
      });

      const sentProposals = await Proposal.find({
        $or: [
          { status: { $in: ['sent', 'accepted'] } },
          { sentAt: { $exists: true, $ne: null } },
        ],
      }).select('task lead').lean();

      const sentTaskIds = sentProposals.map((p: any) => p.task).filter(Boolean);
      const sentPropLeadIds = sentProposals.map((p: any) => p.lead).filter(Boolean);

      if (sentTaskIds.length > 0) {
        andClauses.push({ _id: { $nin: sentTaskIds } });
      }
      if (sentPropLeadIds.length > 0) {
        andClauses.push({
          $or: [
            { lead: { $exists: false } },
            { lead: null },
            { lead: { $nin: sentPropLeadIds } },
          ],
        });
      }

      const sentLeads = await Lead.find({
        isActive: true,
        $or: [
          { proposalSent: true },
          { status: { $in: ['Won', 'Converted', 'won', 'converted', 'Lost', 'lost', 'Not Interested', 'Junk', 'junk'] } },
        ],
      }).select('_id').lean();
      const sentLeadIds = sentLeads.map((l: any) => l._id);
      if (sentLeadIds.length > 0) {
        andClauses.push({
          $or: [
            { lead: { $exists: false } },
            { lead: null },
            { lead: { $nin: sentLeadIds } },
          ],
        });
      }
    }

    if (typeof search === 'string' && search.trim()) {
      const value = search.trim();
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      const [matchedCustomers, matchedLeads] = await Promise.all([
        Customer.find({
          isActive: true,
          $or: [
            { name: rx },
            { 'companyInfo.customerName': rx },
            { companyName: rx },
            { contact: rx },
            { phone: rx },
            { email: rx },
            { 'primaryContactInfo.mobile': rx },
            { 'primaryContactInfo.contactName1': rx },
          ],
        }).select('_id'),
        Lead.find({
          isActive: true,
          $or: [
            { name: rx },
            { company: rx },
            { contact: rx },
            { phone: rx },
            { email: rx },
          ],
        }).select('_id'),
      ]);
      const customerIds = matchedCustomers.map((c) => c._id);
      const leadIds = matchedLeads.map((l) => l._id);
      andClauses.push({
        $or: [
          { taskNo: rx },
          { title: rx },
          { description: rx },
          { tags: rx },
          ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
          ...(leadIds.length ? [{ lead: { $in: leadIds } }] : []),
        ],
      });
    }

    if (andClauses.length === 1) {
      Object.assign(filter, andClauses[0]);
    } else if (andClauses.length > 1) {
      filter.$and = andClauses;
    }

    const isAll = limit === 'all' || limit === '0' || Number(limit) === 0;
    const limitNum = isAll ? 0 : Number(limit);
    const skip = isAll ? 0 : (Number(page) - 1) * limitNum;

    const sortField = typeof req.query.sort === 'string' && req.query.sort.trim() ? req.query.sort.trim() : '_id';
    const sortDirection = req.query.sortDirection === 'asc' || req.query.order === 'asc' ? 1 : -1;
    const sortObj: Record<string, 1 | -1> = { [sortField]: sortDirection };
    if (sortField !== '_id') {
      sortObj._id = sortDirection;
    }

    let taskQuery = Task.find(filter)
      .populate('customer', 'name phone email address companyName companyInfo location primaryContactInfo avatar')
      .populate('lead', 'leadId name companyName phone email status priority requirementDescription fullAddress locationArea budget interestedProduct')
      .populate('ticket', 'ticketNo title subject status priority category contactPerson mailId phoneNumber')
      .populate('assignedTo', 'name email role avatar')
      .populate('createdBy', 'name email role')
      .populate('forwardedBy', 'name')
      .sort(sortObj);

    if (!isAll) {
      taskQuery = taskQuery.skip(skip).limit(limitNum);
    }
    if (typeof (taskQuery as any).lean === 'function') {
      taskQuery = (taskQuery as any).lean();
    }

    const [tasks, total] = await Promise.all([
      taskQuery,
      Task.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: tasks,
      total,
      page: Number(page),
      pages: isAll ? 1 : Math.ceil(total / limitNum) || 1,
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const getTaskById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      res.status(400).json({ success: false, message: 'Invalid task ID' });
      return;
    }

    const task = await Task.findOne({ _id: id, isActive: true })
      .populate('customer', 'name phone email companyName companyInfo address location')
      .populate('lead', 'leadId name companyName phone email status priority requirementDescription fullAddress locationArea budget')
      .populate('ticket', 'ticketNo title subject status priority category contactPerson mailId phoneNumber')
      .populate('assignedTo', 'name email role department')
      .populate('createdBy', 'name email role')
      .populate('forwardedBy', 'name');

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    res.status(200).json({ success: true, data: task });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const getTaskDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await syncAssignedLeadTasks();
    await syncAssignedTicketTasks();

    const { start, end } = getDayBounds();
    const { startDate, endDate, fromDate, toDate } = req.query;
    const currentUserId = isObjectId(String(req.user?._id || '')) ? req.user?._id : undefined;
    const activeFilter: Record<string, unknown> = { isActive: true };
    if (!isAdminUser(req.user)) {
      const targetEmpId = currentUserId || new mongoose.Types.ObjectId();
      activeFilter.$or = [
        { assignedTo: targetEmpId },
        { forwardedBy: targetEmpId, isActive: true },
        { createdBy: targetEmpId },
      ];
    }

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;
    if (effectiveStart && effectiveEnd) {
      const parsedS = new Date(String(effectiveStart));
      parsedS.setHours(0, 0, 0, 0);
      const parsedE = new Date(String(effectiveEnd));
      parsedE.setHours(23, 59, 59, 999);
      if (!isNaN(parsedS.getTime()) && !isNaN(parsedE.getTime())) {
        const dateCond = {
          $or: [
            { taskDate: { $gte: parsedS, $lte: parsedE } },
            { dueDate: { $gte: parsedS, $lte: parsedE } },
            { createdAt: { $gte: parsedS, $lte: parsedE } },
          ],
        };
        if (activeFilter.$or) {
          activeFilter.$and = [{ $or: activeFilter.$or }, dateCond];
          delete activeFilter.$or;
        } else {
          Object.assign(activeFilter, dateCond);
        }
      }
    }

    const openFilter = { ...activeFilter, status: { $in: OPEN_STATUSES } };

    const [
      total,
      open,
      completed,
      overdue,
      dueToday,
      myTasks,
      critical,
      byStatus,
      byPriority,
      upcoming,
    ] = await Promise.all([
      Task.countDocuments(activeFilter),
      Task.countDocuments(openFilter),
      Task.countDocuments({ ...activeFilter, status: 'done' }),
      Task.countDocuments({ ...openFilter, dueDate: { $lt: start } }),
      Task.countDocuments({ ...activeFilter, dueDate: { $gte: start, $lt: end } }),
      currentUserId ? Task.countDocuments({ ...activeFilter, assignedTo: currentUserId, status: { $in: OPEN_STATUSES } }) : Promise.resolve(0),
      Task.countDocuments({ ...openFilter, priority: 'critical' }),
      Task.aggregate([{ $match: activeFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.aggregate([{ $match: activeFilter }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Task.find(openFilter)
        .populate('assignedTo', 'name email role avatar')
        .populate('customer', 'name phone avatar')
        .populate('lead', 'leadId name companyName status')
        .populate('ticket', 'ticketNo subject status priority')
        .sort({ _id: -1 })
        .limit(10),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        open,
        completed,
        overdue,
        dueToday,
        myTasks,
        critical,
        byStatus,
        byPriority,
        upcoming,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = req.body as Record<string, unknown>;
    const title = toStringOrUndefined(payload.title);
    const assignedTo = toStringOrUndefined(payload.assignedTo);
    const customer = toStringOrUndefined(payload.customer);
    const status = (toStringOrUndefined(payload.status) || 'todo') as TaskStatus;
    const priority = (toStringOrUndefined(payload.priority) || 'medium') as TaskPriority;
    const taskType = (toStringOrUndefined(payload.taskType) || 'general') as TaskType;
    const now = new Date();
    let taskDate = parseDateOrUndefined(payload.taskDate);
    if (!taskDate) {
      taskDate = now;
    } else if (taskDate.getUTCHours() === 0 && taskDate.getUTCMinutes() === 0 && taskDate.getUTCSeconds() === 0) {
      taskDate.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
    }
    const dueDate = parseDateOrUndefined(payload.dueDate);

    if (!title || !assignedTo) {
      res.status(400).json({ success: false, message: 'Task title and assignee are required' });
      return;
    }
    if (!TASK_STATUSES.includes(status) || !TASK_PRIORITIES.includes(priority) || !TASK_TYPES.includes(taskType)) {
      res.status(400).json({ success: false, message: 'Invalid task status, priority, or type' });
      return;
    }
    if (!isObjectId(assignedTo) || (customer && !isObjectId(customer))) {
      res.status(400).json({ success: false, message: 'Invalid assignee or customer' });
      return;
    }

    const task = await Task.create({
      title,
      description: toStringOrUndefined(payload.description),
      taskDate,
      taskType,
      customer: customer || undefined,
      assignedTo,
      status,
      priority,
      dueDate,
      tags: parseTags(payload.tags),
      createdBy: isObjectId(String(req.user?._id || '')) ? req.user?._id : undefined,
      completedAt: status === 'done' ? new Date() : undefined,
      history: [
        {
          action: 'created',
          toStatus: status,
          toAssignee: new mongoose.Types.ObjectId(assignedTo),
          performedBy: isObjectId(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(req.user?._id) : undefined,
          comment: toStringOrUndefined(payload.description) || 'Task created',
          createdAt: new Date(),
        },
      ],
    });

    const populated = await populateTask(Task.findById(task._id));
    if (task.assignedTo && String(task.assignedTo) !== String(req.user?._id)) {
      void sendPushToUser(task.assignedTo, {
        title: 'New Task Assigned',
        body: `You have been assigned: ${task.title}`,
        url: '/tasks',
        data: { type: 'task_assigned', taskId: String(task._id) },
      });
    }
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {

    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task || !task.isActive) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    const isElevated = isAdminUser(req.user) || getRoleName(req.user?.role) === 'manager';

    const payload = req.body as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
      const title = toStringOrUndefined(payload.title);
      if (!title) {
        res.status(400).json({ success: false, message: 'Task title is required' });
        return;
      }
      task.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      task.description = toStringOrUndefined(payload.description);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'taskDate')) {
      task.taskDate = parseDateOrUndefined(payload.taskDate);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'taskType')) {
      const taskType = toStringOrUndefined(payload.taskType) as TaskType | undefined;
      if (!taskType || !TASK_TYPES.includes(taskType)) {
        res.status(400).json({ success: false, message: 'Invalid task type' });
        return;
      }
      task.taskType = taskType;
    }
    const isHandoverOnCompletion = ['done', 'review'].includes(String(payload.status || ''));

    if (Object.prototype.hasOwnProperty.call(payload, 'assignedTo')) {
      const assignedTo = toStringOrUndefined(payload.assignedTo);
      if (String(task.assignedTo || '') !== String(assignedTo || '')) {
        if (!isObjectId(assignedTo)) {
          res.status(400).json({ success: false, message: 'Valid assignee is required' });
          return;
        }

        // If it's a direct task reassignment / assignment, update original task's assignee
        if (!isHandoverOnCompletion) {
          const prevAssignee = task.assignedTo ? String(task.assignedTo) : null;
          task.assignedTo = new mongoose.Types.ObjectId(assignedTo);

          if (task.ticket) {
            await Ticket.findByIdAndUpdate(task.ticket, { assignedTo: task.assignedTo });
          }
          if (task.lead) {
            const lead = await Lead.findById(task.lead);
            if (lead) {
              lead.assignedTo = task.assignedTo;
              await lead.save();

              const handoverDesc = String(payload.description || task.description || '').trim();
              await LeadActivity.create({
                lead: lead._id,
                actor: req.user?._id,
                type: prevAssignee ? 'reassigned' : 'assigned',
                message: handoverDesc || `Lead ${prevAssignee ? 'reassigned' : 'assigned'} via Task ${task.taskNo || ''}`,
                metadata: {
                  from: prevAssignee,
                  to: String(assignedTo),
                  taskId: task._id,
                  description: handoverDesc,
                  followUpType: 'task',
                },
              });

              await LeadNotification.create({
                user: task.assignedTo,
                lead: lead._id,
                type: 'assignment',
                message: `You have been assigned lead ${lead.leadId} via Task ${task.taskNo || ''}`,
              });
            }
          }
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'customer')) {
      const customer = toStringOrUndefined(payload.customer);
      if (customer && !isObjectId(customer)) {
        res.status(400).json({ success: false, message: 'Invalid customer' });
        return;
      }
      task.customer = customer ? new mongoose.Types.ObjectId(customer) : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
      const status = toStringOrUndefined(payload.status) as TaskStatus | undefined;
      if (!status || !TASK_STATUSES.includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid task status' });
        return;
      }
      if (task.status === 'done' && status !== 'done' && !isElevated) {
        res.status(403).json({ success: false, message: 'Completed tasks cannot be reopened by staff. Please contact an administrator.' });
        return;
      }
      const prevStatus = task.status;
      const isProposalAction = payload.actionType === 'proposal';
      const isForwardAction = payload.actionType === 'forward' || status === 'forwarded';
      const isLostAction = payload.actionType === 'lost' || payload.leadOutcome === 'lost';
      const historyComment = String(payload.comment || payload.remarks || payload.description || payload.completionRemarks || payload.handoverNotes || '').trim();

      if (status === 'done' && !isForwardAction && !isProposalAction && !isLostAction && !historyComment) {
        res.status(400).json({ success: false, message: 'Completion Remarks are mandatory to complete a task.' });
        return;
      }
      if (isLostAction && !historyComment) {
        res.status(400).json({ success: false, message: 'Reason and Remarks are mandatory to mark a task as not interested.' });
        return;
      }

      let customCompletedAt: Date | undefined = undefined;
      if (payload.completedAt) {
        const parsed = new Date(String(payload.completedAt));
        if (!isNaN(parsed.getTime())) {
          customCompletedAt = parsed;
        }
      }

      const previousAssignee = task.assignedTo;
      
      if ((isForwardAction || isProposalAction) && payload.assignedTo && isObjectId(String(payload.assignedTo))) {
        const nextAssigneeId = new mongoose.Types.ObjectId(String(payload.assignedTo));
        let forwarderId: mongoose.Types.ObjectId = req.user?._id as any;
        if (payload.forwardedFrom && isObjectId(String(payload.forwardedFrom))) {
          forwarderId = new mongoose.Types.ObjectId(String(payload.forwardedFrom));
        } else if (previousAssignee && String(previousAssignee) !== String(nextAssigneeId) && isObjectId(String(previousAssignee))) {
          forwarderId = previousAssignee;
        } else if (req.user?._id) {
          forwarderId = new mongoose.Types.ObjectId(String(req.user._id));
        }
        task.forwardedBy = forwarderId;
        task.assignedTo = nextAssigneeId;
        task.status = 'todo';
        if (isProposalAction) task.taskType = 'proposal';
        task.completedAt = undefined;
        task.completedBy = undefined;
      } else {
        task.status = status;
        task.completedAt = status === 'done' ? (customCompletedAt || task.completedAt || new Date()) : undefined;
        if (status === 'done' && !task.completedBy && req.user?._id) {
          task.completedBy = req.user._id as any;
        }
      }

      if (isLostAction) {
        task.tags = Array.from(new Set([...(task.tags || []), 'lost', 'not_interested']));
      }

      if (task.lead) {
        if (isLostAction) {
          void Lead.findByIdAndUpdate(task.lead, { status: 'Lost' });
        } else if (isProposalAction) {
          void Lead.findByIdAndUpdate(task.lead, { status: 'Proposal Sent' });
        } else if (status === 'done') {
          void Lead.findByIdAndUpdate(task.lead, { status: 'Completed' });
        } else if (status === 'in_progress') {
          void Lead.findByIdAndUpdate(task.lead, { status: 'In Progress' });
        } else if (status === 'review') {
          void Lead.findByIdAndUpdate(task.lead, { status: 'Review' });
        } else if (isForwardAction) {
          void Lead.findByIdAndUpdate(task.lead, { status: 'Forwarded' });
        }
      }

      if (!task.history) task.history = [];
      if (historyComment) {
        task.description = historyComment;
      }
      const historyAction = isLostAction ? 'lost' : isProposalAction ? 'proposal' : isForwardAction ? 'forwarded' : status === 'done' ? 'completed' : 'status_change';
      task.history.push({
        action: historyAction,
        fromStatus: prevStatus,
        toStatus: isForwardAction || isProposalAction ? 'todo' : status,
        performedBy: req.user?._id,
        fromAssignee: (isForwardAction || isProposalAction) ? task.forwardedBy : previousAssignee,
        toAssignee: (isForwardAction || isProposalAction) && payload.assignedTo ? new mongoose.Types.ObjectId(String(payload.assignedTo)) : undefined,
        comment: historyComment || undefined,
        createdAt: customCompletedAt || new Date(),
      });

      // Sync status back to Ticket
      if (task.ticket) {
        const ticketStatusMap: Record<TaskStatus, string> = {
          todo: 'open',
          in_progress: 'in-progress',
          blocked: 'pending-customer',
          review: 'pending-customer',
          forwarded: 'in-progress',
          done: 'resolved',
          cancelled: 'closed',
        };
        const ticketStatus = ticketStatusMap[status];
        if (ticketStatus) {
          await Ticket.findByIdAndUpdate(task.ticket, { status: ticketStatus });
        }
      }

      // Sync task completion & handover back to Lead workflow
      if (task.lead && (status === 'done' || status === 'review' || payload.assignedTo || payload.description)) {
        const lead = await Lead.findById(task.lead);
        if (lead && lead.isActive) {
          const actorName = req.user?.name || 'Assigned employee';
          const completionRemarks = String(payload.description || task.description || 'Task handover & update').trim();
          const nextFollowUpDate = payload.dueDate ? new Date(String(payload.dueDate)) : (task.dueDate || new Date());
          const completionTimestamp = customCompletedAt || new Date();

          if (payload.actionType === 'lost' || payload.leadOutcome === 'lost') {
            const prevStatus = lead.status;
            lead.status = 'Lost';
            lead.rejectedAt = completionTimestamp;
            lead.notes = completionRemarks || 'Deal marked as Not Interested';
            lead.lastFollowupDate = completionTimestamp;
            lead.nextFollowupDate = undefined;

            task.description = completionRemarks || 'Deal marked as Not Interested';
            if (!task.tags.includes('lost')) {
              task.tags.push('lost');
            }

            await LeadFollowUp.updateMany({ lead: lead._id, status: 'pending' }, { status: 'completed', completedAt: completionTimestamp });

            await Proposal.updateMany(
              { lead: lead._id, status: { $in: ['draft', 'sent'] } },
              { status: 'rejected' }
            );

            await LeadStatusHistory.create({
              lead: lead._id,
              fromStatus: prevStatus,
              toStatus: 'Lost',
              changedBy: req.user?._id,
              changedAt: completionTimestamp,
              remarks: completionRemarks || 'Marked as Not Interested via task completion',
            });

            await LeadActivity.create({
              lead: lead._id,
              actor: req.user?._id,
              type: 'lead_lost',
              message: `Deal marked as Not Interested (${completionRemarks || 'Client Not Interested'}) by ${actorName}`,
              metadata: {
                taskId: task._id,
                taskNo: task.taskNo,
                status: 'Not Interested',
                description: completionRemarks || 'Client Not Interested',
                to: String(task.assignedTo || ''),
                completedAt: completionTimestamp,
              },
              createdAt: completionTimestamp,
            });
          } else if (status === 'done') {
            // Mark all previous pending follow-ups for this lead as completed
            await LeadFollowUp.updateMany({ lead: lead._id, status: 'pending' }, { status: 'completed', completedAt: completionTimestamp });

            // Create completion activity record
            await LeadActivity.create({
              lead: lead._id,
              actor: req.user?._id,
              type: 'task_completed',
              message: payload.assignedTo && String(payload.assignedTo) !== String(task.assignedTo)
                ? `Task ${task.taskNo || ''} forwarded by ${actorName}`
                : `Task ${task.taskNo || ''} completed by ${actorName}`,
              metadata: {
                taskId: task._id,
                taskNo: task.taskNo,
                completedBy: req.user?._id,
                completedAt: completionTimestamp,
                actionType: payload.actionType || 'complete',
                description: completionRemarks,
                to: String(payload.assignedTo || ''),
                scheduledAt: payload.assignedTo ? nextFollowUpDate : undefined,
                followUpType: 'task',
              },
              createdAt: completionTimestamp,
            });
            lead.lastFollowupDate = completionTimestamp;

            // If task was forwarded to another assignee:
            if (payload.actionType === 'forward' && payload.assignedTo && String(payload.assignedTo) !== String(task.assignedTo)) {
              const nextAssignee = new mongoose.Types.ObjectId(String(payload.assignedTo));
              
              // Maintain same Task ID: update existing task for next assignee's TO DO queue
              task.assignedTo = nextAssignee;
              task.status = 'todo';
              task.completedAt = undefined;
              task.forwardedBy = req.user?._id as any;
              task.completedBy = undefined;
              task.dueDate = nextFollowUpDate;
              if (completionRemarks) {
                task.description = completionRemarks;
              }

              // Create pending LeadFollowUp for next assignee
              await LeadFollowUp.create({
                lead: lead._id,
                assignedTo: nextAssignee,
                followUpType: 'task',
                scheduledAt: nextFollowUpDate,
                remarks: completionRemarks || `Forwarded from ${actorName}`,
                status: 'pending',
                createdBy: req.user?._id,
              });

              await LeadNotification.create({
                user: nextAssignee,
                lead: lead._id,
                type: 'assignment',
                message: `Task ${task.taskNo || ''} has been forwarded to you by ${actorName}`,
              });

              lead.assignedTo = nextAssignee;
              lead.nextFollowupDate = nextFollowUpDate;
            } else if (payload.scheduleFollowUp && payload.nextDueDate) {
              // Complete current task and schedule next follow-up / task
              const nextAssigneeId = payload.nextAssignee && isObjectId(String(payload.nextAssignee))
                ? new mongoose.Types.ObjectId(String(payload.nextAssignee))
                : (task.assignedTo || req.user?._id);
              const nextDate = new Date(String(payload.nextDueDate));
              const nextType = String(payload.nextType || 'call');
              const nextNotes = String(payload.nextDescription || '').trim();

              // 1. Create next LeadFollowUp
              await LeadFollowUp.create({
                lead: lead._id,
                assignedTo: nextAssigneeId,
                followUpType: nextType,
                scheduledAt: nextDate,
                remarks: nextNotes || `Follow-up scheduled after task ${task.taskNo || ''}`,
                status: 'pending',
                createdBy: req.user?._id,
              });

              // 2. Create next follow-up Task
              const nextTaskCount = await Task.countDocuments();
              const nextTaskNo = `TASK-${String(nextTaskCount + 1).padStart(5, '0')}`;
              await Task.create({
                taskNo: nextTaskNo,
                title: `Follow-up: ${lead.name || lead.companyName || task.title || 'Lead'}`,
                description: nextNotes || `Follow-up scheduled after task ${task.taskNo || ''}`,
                assignedTo: nextAssigneeId,
                lead: lead._id,
                customer: lead.customerId || task.customer,
                dueDate: nextDate,
                priority: task.priority || 'medium',
                status: 'todo',
                tags: [nextType],
                createdBy: req.user?._id,
              });

              if (String(nextAssigneeId) !== String(req.user?._id)) {
                await LeadNotification.create({
                  user: nextAssigneeId,
                  lead: lead._id,
                  type: 'assignment',
                  message: `New follow-up task ${nextTaskNo} scheduled for you by ${actorName}`,
                });
              }

              lead.assignedTo = nextAssigneeId;
              lead.nextFollowupDate = nextDate;
            } else {
              const nextPending = await LeadFollowUp.findOne({ lead: lead._id, status: 'pending' }).sort({ scheduledAt: 1 });
              lead.nextFollowupDate = nextPending ? nextPending.scheduledAt : undefined;
            }
          } else if (status === 'review') {
            // Update existing pending follow-ups with review remarks and date
            await LeadFollowUp.updateMany(
              { lead: lead._id, assignedTo: task.assignedTo, status: 'pending' },
              { remarks: completionRemarks, scheduledAt: nextFollowUpDate }
            );

            if (payload.assignedTo && String(payload.assignedTo) !== String(task.assignedTo)) {
              const nextAssignee = new mongoose.Types.ObjectId(String(payload.assignedTo));
              task.assignedTo = nextAssignee;
              lead.assignedTo = nextAssignee;
            }

            if (payload.dueDate) {
              task.dueDate = nextFollowUpDate;
              lead.nextFollowupDate = nextFollowUpDate;
            }

            // Create activity record for Review
            await LeadActivity.create({
              lead: lead._id,
              actor: req.user?._id,
              type: 'status_changed',
              message: `Task ${task.taskNo || ''} submitted for review by ${actorName}`,
              metadata: {
                taskId: task._id,
                taskNo: task.taskNo,
                status: 'review',
                description: completionRemarks,
                to: String(task.assignedTo || ''),
                scheduledAt: nextFollowUpDate,
                followUpType: 'task',
              },
            });
          } else if (payload.description) {
            // Sync remarks to pending follow-up for other status updates
            await LeadFollowUp.updateMany(
              { lead: lead._id, assignedTo: task.assignedTo, status: 'pending' },
              { remarks: completionRemarks }
            );
          }

          await lead.save();

          const isTerminal = ['won', 'converted', 'lost', 'junk'].includes(lead.status.toLowerCase());
          if (!isTerminal) {
            // Find all Admins & Managers to notify
            const staffUsers = await User.find({ isActive: true }).select('_id role name').populate('role').lean();
            const recipientIds = staffUsers
              .filter((u: any) => {
                const r = getRoleName(u.role);
                const isFull = u.role && typeof u.role === 'object' && (u.role.hasFullAccess === true || u.role.name?.toLowerCase() === 'admin');
                return (r === 'admin' || r === 'manager' || isFull) && String(u._id) !== String(req.user?._id);
              })
              .map((u: any) => u._id);

            await Promise.all(
              recipientIds.map((userId: mongoose.Types.ObjectId) =>
                LeadNotification.create({
                  user: userId,
                  lead: lead._id,
                  type: 'status_change',
                  message: `Task ${task.taskNo || ''} updated by ${actorName} for Lead ${lead.leadId} (${lead.name})`,
                })
              )
            );
          }
        }
      }

      // Handle forwarding for tasks WITHOUT a lead (general, customer, ticket tasks)
      if (!task.lead && (status === 'done' || status === 'review' || status === 'forwarded') && payload.assignedTo && payload.actionType === 'forward') {
        const nextAssigneeId = String(payload.assignedTo);
        if (nextAssigneeId && mongoose.Types.ObjectId.isValid(nextAssigneeId) && nextAssigneeId !== String(task.assignedTo)) {
          const completionRemarks = String(payload.description || task.description || '').trim();
          const nextFollowUpDate = payload.dueDate ? new Date(String(payload.dueDate)) : (task.dueDate || new Date());
          const nextAssignee = new mongoose.Types.ObjectId(nextAssigneeId);

          // Maintain same Task ID: update existing task for next assignee's Forwarded queue
          task.assignedTo = nextAssignee;
          task.status = 'forwarded';
          task.completedAt = undefined;
          task.forwardedBy = req.user?._id as any;
          task.dueDate = nextFollowUpDate;
          if (completionRemarks) task.description = completionRemarks;
          if (task.ticket) {
            await Ticket.findByIdAndUpdate(task.ticket, { assignedTo: nextAssignee });
          }
        }
      } else if (!task.lead && status === 'done' && payload.scheduleFollowUp && payload.nextDueDate) {
        const nextAssigneeId = payload.nextAssignee && isObjectId(String(payload.nextAssignee))
          ? new mongoose.Types.ObjectId(String(payload.nextAssignee))
          : (task.assignedTo || req.user?._id);
        const nextDate = new Date(String(payload.nextDueDate));
        const nextType = String(payload.nextType || 'task');
        const nextNotes = String(payload.nextDescription || '').trim();

        const nextTaskCount = await Task.countDocuments();
        const nextTaskNo = `TASK-${String(nextTaskCount + 1).padStart(5, '0')}`;
        await Task.create({
          taskNo: nextTaskNo,
          title: `Follow-up: ${task.title || 'Task'}`,
          description: nextNotes || `Follow-up after task ${task.taskNo || ''}`,
          assignedTo: nextAssigneeId,
          customer: task.customer,
          ticket: task.ticket,
          dueDate: nextDate,
          priority: task.priority || 'medium',
          status: 'todo',
          tags: [nextType],
          createdBy: req.user?._id,
        });
      }

      // Update description / remarks on the task if provided
      const commentStr = String(payload.remarks || payload.comment || payload.description || '').trim();
      if (commentStr) {
        task.description = commentStr;
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'priority')) {
      const priority = toStringOrUndefined(payload.priority) as TaskPriority | undefined;
      if (!priority || !TASK_PRIORITIES.includes(priority)) {
        res.status(400).json({ success: false, message: 'Invalid task priority' });
        return;
      }
      task.priority = priority;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'dueDate')) {
      task.dueDate = parseDateOrUndefined(payload.dueDate);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
      task.tags = parseTags(payload.tags);
    }

    await task.save();
    const populated = await populateTask(Task.findById(task._id));
    res.status(200).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const assignTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const assignedTo = toStringOrUndefined(req.body.assignedTo);
    if (!isObjectId(assignedTo)) {
      res.status(400).json({ success: false, message: 'Valid assignee is required' });
      return;
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { assignedTo },
      { new: true, runValidators: true }
    )
      .populate('customer', 'name phone avatar')
      .populate('lead', 'leadId name companyName status')
      .populate('ticket', 'ticketNo subject status priority')
      .populate('assignedTo', 'name email role avatar')
      .populate('createdBy', 'name email role');

    if (!task || !task.isActive) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    if (task.ticket) {
      await Ticket.findByIdAndUpdate(task.ticket, { assignedTo });
    }
    if (task.lead) {
      const lead = await Lead.findById(task.lead);
      if (lead) {
        const prevLeadAssigned = lead.assignedTo ? String(lead.assignedTo) : null;
        lead.assignedTo = new mongoose.Types.ObjectId(assignedTo);
        await lead.save();

        await LeadActivity.create({
          lead: lead._id,
          actor: req.user?._id,
          type: prevLeadAssigned ? 'reassigned' : 'assigned',
          message: `Lead ${prevLeadAssigned ? 'reassigned' : 'assigned'} via Task ${task.taskNo || ''}`,
          metadata: { from: prevLeadAssigned, to: String(assignedTo), taskId: task._id },
        });

        await LeadNotification.create({
          user: new mongoose.Types.ObjectId(assignedTo),
          lead: lead._id,
          type: 'assignment',
          message: `You have been assigned lead ${lead.leadId} via Task ${task.taskNo || ''}`,
        });
      }
    }

    if (assignedTo && String(assignedTo) !== String(req.user?._id)) {
      void sendPushToUser(assignedTo, {
        title: 'Task Assigned',
        body: `You have been assigned: ${task.title}`,
        url: '/tasks',
        data: { type: 'task_assigned', taskId: String(task._id) },
      });
    }

    res.status(200).json({ success: true, data: task });
  } catch (err: unknown) {

    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id };
    if (!isAdminUser(req.user) && getRoleName(req.user?.role) !== 'manager') {
      filter.createdBy = req.user?._id;
    }
    const task = await Task.findOneAndUpdate(filter, { isActive: false, status: 'cancelled' }, { new: true });
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found or you do not have permission to delete it' });
      return;
    }
    res.status(200).json({ success: true, message: 'Task deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};
