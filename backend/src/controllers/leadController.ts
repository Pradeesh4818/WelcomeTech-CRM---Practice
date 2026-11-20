import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, isAdminUser } from '../middleware/auth';
import { omitKeys } from '../utils/controllerHelpers';
import User from '../models/User';
import Role from '../models/Role';
import Customer from '../models/Customer';
import { Settings } from '../models/Settings';
import Task from '../models/Task';
import {
  Lead,
  LeadActivity,
  LeadFollowUp,
  LeadNote,
  LeadNotification,
  LeadStatus,
  LEAD_PRIORITIES,
  LeadStatusHistory,
} from '../models/Lead';
import { COUNTRY_PHONE_RULES, DEFAULT_COUNTRY, normalizePhone, toDigitsOnly, validatePhoneNumber } from '../utils/phoneValidation';
import { buildUploadUrl } from '../config/storage';
import { canonicalLeadStatusName, getDefaultLeadStatusName, getFollowUpLeadStatusName, isActiveLeadStatus } from './leadStatusController';
import { sendPushToUser } from '../utils/fcm';

const STAFF_ROLES = ['manager', 'sales_executive', 'engineer'];
const ADMIN_ROLES = ['admin'];

type LeadActivityType =
  | 'lead_created'
  | 'lead_updated'
  | 'status_changed'
  | 'assigned'
  | 'reassigned'
  | 'note_added'
  | 'follow_up_added'
  | 'follow_up_updated'
  | 'communication_logged';

const getRoleName = (role: unknown): string => {
  if (!role) return '';
  if (typeof role === 'string') return role.toLowerCase();
  const maybeRole = role as { name?: string };
  return (maybeRole.name || '').toLowerCase();
};

const canViewAllLeads = (req: AuthRequest): boolean => {
  if (isAdminUser(req.user)) return true;
  const role = getRoleName(req.user?.role);
  return ADMIN_ROLES.includes(role) || role === 'manager' || role === 'superadmin';
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const trimOrUndefined = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const FOLLOW_UP_TYPES = ['call', 'email', 'whatsapp', 'meeting', 'visit', 'sms', 'task'] as const;
const isFollowUpType = (value: unknown): value is typeof FOLLOW_UP_TYPES[number] =>
  typeof value === 'string' && FOLLOW_UP_TYPES.includes(value as typeof FOLLOW_UP_TYPES[number]);

const followUpTypeLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const toDateOrUndefined = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
  }
  return [];
};

const isWonStatus = (status: string): boolean => ['converted', 'won'].includes(status.toLowerCase());
const isLostStatus = (status: string): boolean => ['rejected', 'lost', 'junk'].includes(status.toLowerCase());

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const leadServiceType = (lead: any): 'amc' | 'tdl' | 'tss' | 'cloud' => {
  const source = `${lead.interestedProduct || ''} ${lead.requirementDescription || ''}`.toLowerCase();
  if (source.includes('cloud')) return 'cloud';
  if (source.includes('tss')) return 'tss';
  if (source.includes('tdl')) return 'tdl';
  return 'amc';
};

const leadSegmentLabel = (serviceType: 'amc' | 'tdl' | 'tss' | 'cloud') => {
  if (serviceType === 'tdl') return 'TDL Add-on';
  if (serviceType === 'tss') return 'TSS Premium';
  if (serviceType === 'cloud') return 'Cloud Hub';
  return 'Product & License';
};

const leadProductService = (lead: any) => {
  const product = trimOrUndefined(lead.interestedProduct);
  const price = toNumberOrUndefined(lead.pricing);
  if (!product && price === undefined && !trimOrUndefined(lead.requirementDescription)) return null;
  const serviceType = leadServiceType(lead);
  const startDate = toDateOrUndefined(lead.leadDate) || new Date();

  return {
    type: serviceType,
    quantity: 1,
    status: 'active' as const,
    companyType: 'head_office' as const,
    companyName: trimOrUndefined(lead.companyName) || lead.name,
    address: trimOrUndefined(lead.fullAddress) || trimOrUndefined(lead.locationArea),
    product: product || leadSegmentLabel(serviceType),
    vendor: serviceType === 'cloud' ? product : undefined,
    currentPrice: price,
    actualPrice: price,
    showPricing: price !== undefined,
    contactPerson: lead.name,
    mobile: lead.phone,
    email: lead.email,
    startDate,
    details: trimOrUndefined(lead.requirementDescription),
    notesRemarks: `Converted from lead ${lead.leadId}`,
    renewalHistory: [],
  };
};

const appendLeadProductToCustomer = async (customer: any, lead: any) => {
  const service = leadProductService(lead);
  const product = trimOrUndefined(lead.interestedProduct);
  const price = toNumberOrUndefined(lead.pricing);
  const startDate = toDateOrUndefined(lead.leadDate) || new Date();

  if (product) {
    const products = Array.isArray(customer.products) ? customer.products : [];
    if (!products.some((item: string) => item.toLowerCase() === product.toLowerCase())) {
      customer.products = [...products, product];
    }

    const serialNoInfo = Array.isArray(customer.serialNoInfo) ? customer.serialNoInfo : [];
    if (!serialNoInfo.some((s: any) => String(s.product || '').toLowerCase() === product.toLowerCase())) {
      customer.serialNoInfo = [
        ...serialNoInfo,
        {
          product,
          licenceType: 'Silver – Single User',
          noOfUsers: 1,
          startDate,
          licenceStatus: 'active',
          pricingDetails: price !== undefined ? {
            actualPrice: price,
            currentPrice: price,
            remainingTotal: price,
          } : undefined,
          notes: trimOrUndefined(lead.requirementDescription),
          contactDetails: {
            branchName: customer.name,
            locationArea: trimOrUndefined(lead.locationArea),
            contactPerson: lead.name,
            mobile: lead.phone,
          },
        },
      ];
    }
  }
  if (service) {
    customer.services = Array.isArray(customer.services) ? customer.services : [];
    customer.services.push(service);
  }
  await customer.save({ validateModifiedOnly: true });
};

const createLeadActivity = async (
  leadId: mongoose.Types.ObjectId | string,
  actor: mongoose.Types.ObjectId | string,
  type: LeadActivityType,
  message: string,
  metadata?: Record<string, unknown>,
  activityDate?: Date
): Promise<void> => {
  const payload: Record<string, unknown> = {
    lead: leadId,
    actor,
    type,
    message,
    metadata,
  };
  if (activityDate) {
    payload.createdAt = activityDate;
    payload.updatedAt = activityDate;
  }
  await LeadActivity.create(payload);
};

const syncLeadAssignmentTask = async (
  lead: any,
  assignedTo?: mongoose.Types.ObjectId | string,
  actor?: mongoose.Types.ObjectId | string,
  customDescription?: string,
  customDueDate?: Date
): Promise<void> => {
  if (!assignedTo) return;

  const title = `Lead ${lead.leadId}: ${lead.name}`;
  const cleanDescription = customDescription || lead.requirementDescription || lead.notes || (lead.leadType ? `Lead for ${lead.leadType}` : `Follow up with ${lead.name}`);
  const dueDate = customDueDate || lead.nextFollowupDate || lead.expectedClosingDate || undefined;
  const existingTask = await Task.findOne({ lead: lead._id, isActive: true });

  if (existingTask) {
    existingTask.title = title;
    if (cleanDescription || (existingTask.description && existingTask.description.startsWith('Company:'))) {
      existingTask.description = cleanDescription;
    }
    existingTask.assignedTo = new mongoose.Types.ObjectId(String(assignedTo));
    existingTask.priority = lead.priority || existingTask.priority;
    existingTask.dueDate = dueDate;
    existingTask.taskType = 'lead';
    existingTask.tags = Array.from(new Set([...(existingTask.tags || []), 'lead', lead.leadId].filter(Boolean)));
    if (lead.customerId) existingTask.customer = lead.customerId;
    if (['done', 'cancelled'].includes(existingTask.status)) existingTask.status = 'todo';
    await existingTask.save();
    return;
  }

  await Task.create({
    title,
    description: cleanDescription,
    lead: lead._id,
    customer: lead.customerId || undefined,
    assignedTo,
    taskType: 'lead',
    status: 'todo',
    priority: lead.priority || 'medium',
    dueDate,
    tags: ['lead', lead.leadId],
    createdBy: actor,
  });
};

const createLeadNotification = async (
  userId: mongoose.Types.ObjectId | string | undefined,
  leadId: mongoose.Types.ObjectId | string,
  type: 'assignment' | 'follow_up_reminder' | 'status_change',
  message: string
): Promise<void> => {
  if (!userId) return;
  await LeadNotification.create({ user: userId, lead: leadId, type, message });

  const title =
    type === 'assignment'
      ? 'New Lead Assigned'
      : type === 'follow_up_reminder'
      ? 'Lead Follow-Up Reminder'
      : 'Lead Status Update';

  void sendPushToUser(userId, {
    title,
    body: message,
    url: '/leads',
    data: { type: `lead_${type}`, leadId: String(leadId) },
  });
};


const getCountryFromSettings = async (countryCode?: string): Promise<string> => {
  if (countryCode) return countryCode.toUpperCase();
  const settings = await Settings.findOne().select('country');
  return (settings?.country || DEFAULT_COUNTRY).toUpperCase();
};

let leadDuplicateIndexesChecked = false;

const removeLegacyLeadDuplicateIndexes = async (): Promise<void> => {
  if (leadDuplicateIndexesChecked) return;
  leadDuplicateIndexesChecked = true;

  for (const indexName of ['email_1', 'phone_1']) {
    try {
      const indexes = await Lead.collection.indexes();
      const index = indexes.find((idx) => idx.name === indexName);
      if (index?.unique) await Lead.collection.dropIndex(indexName);
    } catch {
      // The index may not exist in fresh databases.
    }
  }
};

const getEligibleStaff = async (): Promise<Array<{ _id: mongoose.Types.ObjectId; name: string; email: string }>> => {
  const users = await User.find({ isActive: true }).select('name email role').lean();
  const roleIds = users.filter((u) => typeof u.role !== 'string').map((u) => u.role as mongoose.Types.ObjectId);
  const roles = roleIds.length ? await Role.find({ _id: { $in: roleIds } }).select('name').lean() : [];
  const roleMap = new Map(roles.map((r) => [String(r._id), (r.name || '').toLowerCase()]));

  return users
    .filter((u) => {
      const roleName = typeof u.role === 'string' ? u.role.toLowerCase() : roleMap.get(String(u.role)) || '';
      return STAFF_ROLES.includes(roleName);
    })
    .map((u) => ({ _id: u._id, name: u.name, email: u.email }));
};

const pickAutoAssignee = async (mode: 'round_robin' | 'workload'): Promise<mongoose.Types.ObjectId | undefined> => {
  const staff = await getEligibleStaff();
  if (!staff.length) return undefined;

  if (mode === 'workload') {
    const staffIds = staff.map((s) => s._id);
    const openStatuses: LeadStatus[] = ['New', 'Assigned', 'Contacted', 'Followup', 'Interested', 'Quotation Sent', 'Negotiation'];
    const counts = await Lead.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { assignedTo: { $in: staffIds }, status: { $in: openStatuses } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const sorted = [...staff].sort((a, b) => (countMap.get(String(a._id)) || 0) - (countMap.get(String(b._id)) || 0));
    return sorted[0]?._id;
  }

  const latestAssigned = await Lead.findOne({ assignedTo: { $exists: true } }).sort({ _id: -1 }).select('assignedTo').lean();
  if (!latestAssigned?.assignedTo) return staff[0]?._id;
  const idx = staff.findIndex((s) => String(s._id) === String(latestAssigned.assignedTo));
  if (idx === -1 || idx === staff.length - 1) return staff[0]?._id;
  return staff[idx + 1]?._id;
};

const buildLeadAccessFilter = (req: AuthRequest): Record<string, unknown> => {
  const filter: Record<string, any> = { isActive: { $ne: false } };
  if (canViewAllLeads(req)) {
    return filter;
  }
  filter.$or = [
    { assignedTo: req.user?._id },
    { createdBy: req.user?._id },
  ];
  return filter;
};

// ─── LEADS ───────────────────────────────────────
export const getLeads = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      status,
      source,
      assignedTo,
      priority,
      search,
      fromDate,
      toDate,
      startDate,
      endDate,
      proposalOnly,
      taskStatus,
      page = 1,
      limit = 10,
    } = req.query;

    const filter: Record<string, unknown> = { ...buildLeadAccessFilter(req) };

    if (taskStatus && taskStatus !== 'all') {
      const matchingTasks = await Task.find({ status: taskStatus, isActive: true, lead: { $exists: true } }).select('lead').lean();
      const leadIds = matchingTasks.map((t: any) => t.lead).filter(Boolean);
      filter._id = { $in: leadIds };
    }

    if (String(proposalOnly) === 'true') {
      filter.$or = [
        { proposalRequested: true },
        { status: { $regex: 'proposal|quotation', $options: 'i' } },
      ];
    }

    if (status && status !== 'all') {
      const s = String(status).trim();
      if (s.toLowerCase() === 'lost' || s.toLowerCase() === 'not interested') {
        filter.status = { $in: ['Lost', 'Not Interested', 'lost', 'not interested'] };
      } else {
        filter.status = status;
      }
    }
    if (source) filter.source = source;
    if (canViewAllLeads(req) && assignedTo && assignedTo !== 'all') {
      filter.assignedTo = assignedTo;
    }
    if (priority) filter.priority = priority;

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;

    if (effectiveStart || effectiveEnd) {
      let sDate: Date | null = null;
      let eDate: Date | null = null;
      if (effectiveStart) {
        sDate = new Date(String(effectiveStart));
        sDate.setHours(0, 0, 0, 0);
      }
      if (effectiveEnd) {
        eDate = new Date(String(effectiveEnd));
        eDate.setHours(23, 59, 59, 999);
      }

      const dateCond: Record<string, Date> = {};
      if (sDate && !isNaN(sDate.getTime())) dateCond.$gte = sDate;
      if (eDate && !isNaN(eDate.getTime())) dateCond.$lte = eDate;

      if (Object.keys(dateCond).length > 0) {
        if (!filter.$and) {
          filter.$and = [];
        }
        (filter.$and as any[]).push({
          $or: [
            { leadDate: dateCond },
            { createdAt: dateCond },
          ],
        });
      }
    }

    if (search) {
      const q = String(search).trim();
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }, { companyName: re }];
    }

    const isAll = limit === 'all' || limit === '0' || Number(limit) === 0;
    const limitNum = isAll ? 0 : Number(limit);
    const skip = isAll ? 0 : (Number(page) - 1) * limitNum;

    const sortDirection: 1 | -1 = req.query.sortOrder === 'asc' || req.query.sortOrder === '1' ? 1 : -1;

    let leadQuery = Lead.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .sort({ _id: sortDirection });

    if (!isAll) {
      leadQuery = leadQuery.skip(skip).limit(limitNum);
    }
    if (typeof (leadQuery as any).lean === 'function') {
      leadQuery = (leadQuery as any).lean();
    }

    let activityQuery: any = LeadActivity.find({
      ...(canViewAllLeads(req) ? {} : { actor: req.user?._id }),
    }).sort({ _id: 1 }).populate('actor', 'name email');

    if (!isAll) {
      activityQuery = activityQuery.limit(limitNum);
    }
    if (typeof activityQuery.lean === 'function') {
      activityQuery = activityQuery.lean();
    }

    const [leads, total, activities] = await Promise.all([
      leadQuery,
      Lead.countDocuments(filter),
      activityQuery,
    ]);

    res.status(200).json({
      success: true,
      data: leads,
      total,
      page: Number(page),
      pages: isAll ? 1 : Math.ceil(total / limitNum) || 1,
      recentActivities: activities,
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('customerId', 'name contact phone email companyInfo');
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    const leadAssigneeId = String((lead.assignedTo as any)?._id || lead.assignedTo || '');
    const leadCreatorId = String((lead.createdBy as any)?._id || lead.createdBy || '');
    const currentUserId = String(req.user?._id || '');

    if (!canViewAllLeads(req) && leadAssigneeId !== currentUserId && leadCreatorId !== currentUserId) {
      const hasFollowUp = await LeadFollowUp.exists({ lead: lead._id, assignedTo: req.user?._id });
      if (!hasFollowUp) {
        res.status(403).json({ success: false, message: 'Access denied' });
        return;
      }
    }

    const [statusHistory, followUps, activities, notes, tasks] = await Promise.all([
      LeadStatusHistory.find({ lead: lead._id }).sort({ _id: 1 }).populate('changedBy', 'name email'),
      LeadFollowUp.find({ lead: lead._id }).sort({ _id: 1 }).populate('assignedTo', 'name email').populate('createdBy', 'name email'),
      LeadActivity.find({ lead: lead._id }).sort({ _id: 1 }).populate('actor', 'name email'),
      LeadNote.find({ lead: lead._id }).sort({ _id: 1 }).populate('createdBy', 'name email'),
      Task.find({ lead: lead._id, isActive: true }).sort({ createdAt: 1 }).populate('assignedTo', 'name email').populate('createdBy', 'name email'),
    ]);

    res.status(200).json({ success: true, data: lead, statusHistory, followUps, activities, notes, tasks });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const createLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      leadDate,
      leadType,
      customerId,
      email,
      phone,
      countryCode,
      companyName,
      locationArea,
      fullAddress,
      source,
      status,
      interestedProduct,
      requirementDescription,
      pricing,
      priority = 'medium',
      expectedClosingDate,
      lastFollowupDate,
      nextFollowupDate,
      notes,
      assignedTo,
      autoAssignMode,
    } = req.body;

    if (!name || !phone) {
      res.status(400).json({ success: false, message: 'Name and phone are required' });
      return;
    }
    const requestedStatus = trimOrUndefined(status) || await getDefaultLeadStatusName(req.user?._id);
    const effectiveStatus = await canonicalLeadStatusName(requestedStatus, req.user?._id);
    if (!effectiveStatus) {
      res.status(400).json({ success: false, message: 'Invalid lead status' });
      return;
    }
    if (!LEAD_PRIORITIES.includes(priority)) {
      res.status(400).json({ success: false, message: 'Invalid lead priority' });
      return;
    }

    const normalizedEmail = email ? normalizeEmail(String(email)) : '';
    if (!validatePhoneNumber(String(phone))) {
      res.status(400).json({ success: false, message: `Invalid phone format or length for the provided country code.` });
      return;
    }
    const normalizedPhone = normalizePhone(String(phone));
    const effectiveCountry = (await getCountryFromSettings(countryCode)).toUpperCase();
    await removeLegacyLeadDuplicateIndexes();

    let assigneeId = trimOrUndefined(assignedTo) as unknown as mongoose.Types.ObjectId | undefined;
    if (!assigneeId && autoAssignMode && ['round_robin', 'workload'].includes(String(autoAssignMode))) {
      assigneeId = await pickAutoAssignee(autoAssignMode as 'round_robin' | 'workload');
    }

    const now = new Date();
    let effectiveLeadDate: Date;
    if (leadDate) {
      if (req.body.leadTime && typeof req.body.leadTime === 'string') {
        const [h = '0', m = '0'] = req.body.leadTime.split(':');
        const datePart = String(leadDate).slice(0, 10);
        const combined = new Date(`${datePart}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
        effectiveLeadDate = isNaN(combined.getTime()) ? (toDateOrUndefined(leadDate) || now) : combined;
      } else {
        const parsed = toDateOrUndefined(leadDate) || now;
        if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
          parsed.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
        }
        effectiveLeadDate = parsed;
      }
    } else {
      effectiveLeadDate = now;
    }

    const lead = await Lead.create({
      name: String(name).trim(),
      leadDate: effectiveLeadDate,
      leadType: leadType === 'existing' ? 'existing' : 'new',
      customerId: leadType === 'existing' ? trimOrUndefined(customerId) : undefined,
      email: normalizedEmail,
      phone: normalizedPhone,
      countryCode: effectiveCountry,
      companyName: trimOrUndefined(companyName),
      locationArea: trimOrUndefined(locationArea),
      fullAddress: trimOrUndefined(fullAddress),
      existingProducts: leadType === 'existing' ? toStringArray((req.body as any).existingProducts) : [],
      source: trimOrUndefined(source) || 'manual',
      interestedProduct: trimOrUndefined(interestedProduct),
      requirementDescription: trimOrUndefined(requirementDescription),
      pricing: toNumberOrUndefined(pricing),
      status: effectiveStatus,
      priority,
      expectedClosingDate: toDateOrUndefined(expectedClosingDate),
      lastFollowupDate: toDateOrUndefined(lastFollowupDate),
      nextFollowupDate: toDateOrUndefined(nextFollowupDate),
      notes: trimOrUndefined(notes),
      assignedTo: assigneeId,
      createdBy: req.user?._id, // always server-derived; never trusted from the client
    });

    await LeadStatusHistory.create({
      lead: lead._id,
      toStatus: lead.status,
      changedBy: req.user?._id,
      changedAt: new Date(),
      remarks: 'Lead created',
    });

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'lead_created', `Lead ${lead.leadId} created`, {
      status: lead.status,
      from: String(req.user?._id || ''),
      to: lead.assignedTo ? String(lead.assignedTo) : null,
      assignedTo: lead.assignedTo,
    });

    if (assigneeId) {
      await syncLeadAssignmentTask(
        lead,
        assigneeId,
        req.user?._id as mongoose.Types.ObjectId,
        lead.notes || lead.requirementDescription || '',
        toDateOrUndefined(nextFollowupDate)
      );
      await createLeadActivity(
        lead._id,
        req.user?._id as mongoose.Types.ObjectId,
        'assigned',
        'Lead assigned',
        {
          from: String(req.user?._id || ''),
          to: String(assigneeId),
          assignedAt: lead.createdAt || new Date(),
          description: lead.notes || lead.requirementDescription || '',
          scheduledAt: toDateOrUndefined(nextFollowupDate),
        }
      );
      await createLeadNotification(assigneeId, lead._id, 'assignment', `You have been assigned lead ${lead.leadId}`);
    }

    if (toDateOrUndefined(nextFollowupDate)) {
      await LeadFollowUp.create({
        lead: lead._id,
        assignedTo: assigneeId || undefined,
        followUpType: 'call',
        scheduledAt: toDateOrUndefined(nextFollowupDate),
        status: 'pending',
        remarks: trimOrUndefined(notes) || '',
        createdBy: req.user?._id,
      });
    }

    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name email role').populate('createdBy', 'name email role');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 11000) {
      res.status(409).json({ success: false, message: 'Duplicate value already exists' });
      return;
    }
    res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
};

export const updateLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    // Mass-assignment guard: server-controlled / immutable fields must never come from the client.
    const updates = omitKeys({ ...req.body }, ['createdBy', 'leadId', 'convertedAt', 'rejectedAt', 'isActive', '_id', 'createdAt', 'updatedAt']) as Record<string, unknown>;
    // Reassignment is an admin-only action handled by the dedicated assign endpoint.
    if (!canViewAllLeads(req)) delete updates.assignedTo;

    if (typeof updates.email === 'string') updates.email = normalizeEmail(updates.email);
    if (typeof updates.phone === 'string') updates.phone = updates.phone.trim();
    if (typeof updates.countryCode === 'string') updates.countryCode = updates.countryCode.toUpperCase();
    if (typeof updates.status === 'string') {
      const canonical = await canonicalLeadStatusName(updates.status, req.user?._id);
      if (!canonical) {
        res.status(400).json({ success: false, message: 'Invalid lead status' });
        return;
      }
      updates.status = canonical;
    }
    if (updates.leadDate !== undefined || req.body.leadTime !== undefined) {
      const targetDate = updates.leadDate !== undefined ? updates.leadDate : lead.leadDate;
      if (req.body.leadTime && typeof req.body.leadTime === 'string') {
        const [h = '0', m = '0'] = req.body.leadTime.split(':');
        const datePart = (targetDate instanceof Date ? targetDate.toISOString() : String(targetDate || '')).slice(0, 10);
        const combined = new Date(`${datePart}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`);
        if (!isNaN(combined.getTime())) {
          updates.leadDate = combined;
        }
      } else if (updates.leadDate !== undefined) {
        const parsedLeadDate = toDateOrUndefined(updates.leadDate);
        if (parsedLeadDate && parsedLeadDate.getUTCHours() === 0 && parsedLeadDate.getUTCMinutes() === 0 && parsedLeadDate.getUTCSeconds() === 0) {
          const now = new Date();
          parsedLeadDate.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
        }
        updates.leadDate = parsedLeadDate;
      }
      delete (updates as Record<string, unknown>).leadTime;
    }
    if (updates.pricing !== undefined) updates.pricing = toNumberOrUndefined(updates.pricing);
    if (updates.expectedClosingDate !== undefined) updates.expectedClosingDate = toDateOrUndefined(updates.expectedClosingDate);
    if (updates.lastFollowupDate !== undefined) updates.lastFollowupDate = toDateOrUndefined(updates.lastFollowupDate);
    if (updates.nextFollowupDate !== undefined) updates.nextFollowupDate = toDateOrUndefined(updates.nextFollowupDate);
    if (updates.existingProducts !== undefined) updates.existingProducts = lead.leadType === 'existing' || updates.leadType === 'existing'
      ? toStringArray(updates.existingProducts)
      : [];

    const effectiveCountry = await getCountryFromSettings(
      typeof updates.countryCode === 'string' ? updates.countryCode : lead.countryCode
    );

    if (typeof updates.phone === 'string' && updates.phone) {
      if (!validatePhoneNumber(updates.phone)) {
        res.status(400).json({ success: false, message: `Invalid phone format or length for the provided country code.` });
        return;
      }
      updates.phone = normalizePhone(updates.phone);
    }

    await removeLegacyLeadDuplicateIndexes();

    const prevStatus = lead.status;
    const prevAssigned = lead.assignedTo ? String(lead.assignedTo) : '';

    Object.assign(lead, updates);
    if (isWonStatus(lead.status) && !lead.convertedAt) lead.convertedAt = new Date();
    if (isLostStatus(lead.status) && !lead.rejectedAt) lead.rejectedAt = new Date();
    await lead.save();

    if (prevStatus !== lead.status) {
      await LeadStatusHistory.create({
        lead: lead._id,
        fromStatus: prevStatus,
        toStatus: lead.status,
        changedBy: req.user?._id,
        changedAt: new Date(),
        remarks: 'Updated via edit',
      });
      await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'status_changed', `Status changed from ${prevStatus} to ${lead.status}`);
    }

    const nextAssigned = lead.assignedTo ? String(lead.assignedTo) : '';
    if (prevAssigned !== nextAssigned && nextAssigned) {
      await syncLeadAssignmentTask(lead, nextAssigned, req.user?._id as mongoose.Types.ObjectId, lead.requirementDescription || lead.notes);
      await createLeadActivity(
        lead._id,
        req.user?._id as mongoose.Types.ObjectId,
        prevAssigned ? 'reassigned' : 'assigned',
        prevAssigned ? 'Lead reassigned' : 'Lead assigned',
        { from: prevAssigned || null, to: nextAssigned }
      );
      await createLeadNotification(lead.assignedTo, lead._id, 'assignment', `You have been assigned lead ${lead.leadId}`);
    } else if (nextAssigned && updates.nextFollowupDate !== undefined) {
      // Sync task dueDate when follow-up date changes without reassignment
      await syncLeadAssignmentTask(lead, nextAssigned, req.user?._id as mongoose.Types.ObjectId, lead.requirementDescription || lead.notes);
    }

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'lead_updated', `Lead ${lead.leadId} updated`);

    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name email role').populate('createdBy', 'name email role');
    res.status(200).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const updateLeadStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, remarks } = req.body as { status: LeadStatus; remarks?: string };
    if (!status || !(await isActiveLeadStatus(status, req.user?._id))) {
      res.status(400).json({ success: false, message: 'Invalid lead status' });
      return;
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }
    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const fromStatus = lead.status;
    lead.status = status;
    if (status.toLowerCase() === 'contacted') lead.lastContactedAt = new Date();
    if (isWonStatus(status)) lead.convertedAt = new Date();
    if (isLostStatus(status)) lead.rejectedAt = new Date();
    await lead.save();

    await LeadStatusHistory.create({
      lead: lead._id,
      fromStatus,
      toStatus: status,
      changedBy: req.user?._id,
      changedAt: new Date(),
      remarks: trimOrUndefined(remarks),
    });

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'status_changed', `Status changed from ${fromStatus} to ${status}`);
    if (lead.assignedTo) {
      await createLeadNotification(lead.assignedTo, lead._id, 'status_change', `Lead ${lead.leadId} moved to ${status}`);
    }

    res.status(200).json({ success: true, data: lead });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const convertLeadToCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }
    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    let customer: any = null;
    let mode: 'linked_existing' | 'created' = 'created';
    let productAttached = false;

    const companyName = trimOrUndefined(lead.companyName) || lead.name;
    const phone = trimOrUndefined(lead.phone);
    const email = trimOrUndefined(lead.email);

    if (lead.customerId) {
      customer = await Customer.findOne({ _id: lead.customerId, isActive: true });
      if (customer) {
        mode = 'linked_existing';
      }
    }

    if (!customer && companyName) {
      const companyRegex = new RegExp(`^${escapeRe(companyName)}$`, 'i');
      customer = await Customer.findOne({
        isActive: true,
        $or: [{ name: companyRegex }, { 'companyInfo.customerName': companyRegex }],
      });
      if (customer) {
        mode = 'linked_existing';
      }
    }

    if (!customer) {
      const service = leadProductService(lead);
      const product = trimOrUndefined(lead.interestedProduct);
      const price = toNumberOrUndefined(lead.pricing);
      const startDate = toDateOrUndefined(lead.leadDate) || new Date();
      const serviceType = leadServiceType(lead);

      customer = await Customer.create({
          name: companyName,
          contact: lead.name,
          phone: lead.phone,
          email: lead.email,
          address: lead.fullAddress || lead.locationArea || '',
          products: product ? [product] : [],
          licenceType: 'Silver – Single User',
          users: 1,
          amcStatus: 'none',
          notes: lead.notes || lead.requirementDescription || undefined,
          companyInfo: {
            customerName: companyName,
            locationArea: lead.locationArea || undefined,
            fullAddress: lead.fullAddress || undefined,
          },
          primaryContactInfo: {
            contactName1: lead.name,
            mobile: lead.phone,
            email: lead.email,
          },
          serialNoInfo: product ? [{
            product,
            licenceType: 'Silver – Single User',
            noOfUsers: 1,
            startDate,
            licenceStatus: 'active',
            pricingDetails: price !== undefined ? {
              actualPrice: price,
              currentPrice: price,
              remainingTotal: price,
            } : undefined,
            notes: trimOrUndefined(lead.requirementDescription),
            contactDetails: {
              branchName: companyName,
              locationArea: trimOrUndefined(lead.locationArea),
              contactPerson: lead.name,
              mobile: lead.phone,
            },
          }] : [],
          amcDetails: serviceType === 'amc' && service ? {
            status: 'none',
            companyType: 'head_office',
            companyName,
            address: trimOrUndefined(lead.fullAddress) || trimOrUndefined(lead.locationArea),
            contactPerson: lead.name,
            mobile: lead.phone,
            email: lead.email,
            actualPrice: price,
            currentPrice: price,
            startDate,
            notesRemarks: `Converted from lead ${lead.leadId}`,
          } : undefined,
          services: service ? [service] : [],
          createdBy: req.user?._id,
        });
        productAttached = !!service;
        mode = 'created';
      }

    if (mode === 'linked_existing') {
      await appendLeadProductToCustomer(customer, lead);
      productAttached = !!leadProductService(lead);
    }

    const previousStatus = lead.status;
    lead.status = 'Won';
    lead.convertedAt = lead.convertedAt || new Date();
    lead.leadType = 'existing';
    lead.customerId = customer._id as mongoose.Types.ObjectId;
    if (!lead.countryCode) lead.countryCode = 'QA';
    await lead.save();

    // Close the linked task when a lead is converted to a customer
    await Task.updateOne(
      { lead: lead._id, isActive: true, status: { $nin: ['done', 'cancelled'] } },
      { status: 'done', completedAt: new Date() }
    );

    if (previousStatus !== lead.status) {
      await LeadStatusHistory.create({
        lead: lead._id,
        fromStatus: previousStatus,
        toStatus: lead.status,
        changedBy: req.user?._id,
        changedAt: new Date(),
        remarks: mode === 'created' ? 'Converted to new customer' : 'Linked to existing customer',
      });
    }

    await createLeadActivity(
      lead._id,
      req.user?._id as mongoose.Types.ObjectId,
      'status_changed',
      mode === 'created'
        ? `Lead ${lead.leadId} converted to customer`
        : `Lead ${lead.leadId} linked to existing customer${productAttached ? ' and product added' : ''}`,
      { customerId: customer._id, conversionMode: mode, productAttached, product: lead.interestedProduct }
    );

    const populated = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('customerId', 'name contact phone email companyInfo');

    res.status(200).json({
      success: true,
      data: {
        lead: populated,
        customer,
        mode,
      },
      message: mode === 'created' ? 'Customer created from lead' : 'Lead linked to existing customer',
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const assignLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canViewAllLeads(req)) {
      res.status(403).json({ success: false, message: 'Only admin/manager can assign leads' });
      return;
    }

    const { assignedTo, autoAssignMode } = req.body as {
      assignedTo?: string;
      autoAssignMode?: 'round_robin' | 'workload';
      assignedAt?: string;
      description?: string;
    };
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    const from = lead.assignedTo ? String(lead.assignedTo) : undefined;
    let nextAssignee: mongoose.Types.ObjectId | undefined;

    if (assignedTo) {
      nextAssignee = new mongoose.Types.ObjectId(assignedTo);
    } else if (autoAssignMode && ['round_robin', 'workload'].includes(autoAssignMode)) {
      nextAssignee = await pickAutoAssignee(autoAssignMode);
    }

    if (!nextAssignee) {
      res.status(400).json({ success: false, message: 'No assignee selected' });
      return;
    }

    let assignedAt = req.body.assignedAt ? new Date(String(req.body.assignedAt)) : new Date();
    if (Number.isNaN(assignedAt.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid assigned date' });
      return;
    }
    if (assignedAt.getUTCHours() === 0 && assignedAt.getUTCMinutes() === 0 && assignedAt.getUTCSeconds() === 0) {
      const now = new Date();
      assignedAt.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
    }

    const assignmentDescription = String(req.body.description || '').trim();
    const activityMessage = assignmentDescription || (from ? 'Lead reassigned' : 'Lead assigned');

    const nextFollowUp = req.body.dueDate || req.body.nextFollowupDate ? new Date(String(req.body.dueDate || req.body.nextFollowupDate)) : undefined;
    if (nextFollowUp && !Number.isNaN(nextFollowUp.getTime())) {
      lead.nextFollowupDate = nextFollowUp;
      lead.lastFollowupDate = assignedAt;
    }

    const isProposal =
      req.body.actionType === 'proposal' ||
      req.body.action === 'proposal' ||
      req.body.proposalRequested === true ||
      assignmentDescription.toLowerCase().includes('proposal');

    lead.assignedTo = nextAssignee;
    if (isProposal) {
      lead.proposalRequested = true;
      lead.proposalRequestedAt = assignedAt;
    }
    await lead.save();
    await syncLeadAssignmentTask(lead, nextAssignee, req.user?._id as mongoose.Types.ObjectId, assignmentDescription || lead.requirementDescription || lead.notes, nextFollowUp);

    await createLeadActivity(
      lead._id,
      req.user?._id as mongoose.Types.ObjectId,
      from ? 'reassigned' : 'assigned',
      activityMessage,
      { from, to: String(nextAssignee), assignedAt: assignedAt.toISOString(), scheduledAt: nextFollowUp ? nextFollowUp.toISOString() : undefined, description: assignmentDescription || undefined },
      assignedAt
    );

    await createLeadNotification(nextAssignee, lead._id, 'assignment', `You have been assigned lead ${lead.leadId}`);

    // Hook for email notification integration.
    // TODO: trigger email to assignee using your SMTP service provider.

    const populated = await Lead.findById(lead._id).populate('assignedTo', 'name email role').populate('createdBy', 'name email role');
    res.status(200).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const addLeadNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }
    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const text = trimOrUndefined(req.body.text);
    if (!text) {
      res.status(400).json({ success: false, message: 'Note text is required' });
      return;
    }

    const note = await LeadNote.create({
      lead: lead._id,
      text,
      communicationType: req.body.communicationType || 'internal',
      attachment: req.file ? buildUploadUrl('leads', req.file.filename) : undefined,
      createdBy: req.user?._id,
    });

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'note_added', 'Lead note added', {
      communicationType: note.communicationType,
      hasAttachment: !!note.attachment,
    });

    res.status(201).json({ success: true, data: note });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const scheduleLeadFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }
    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const scheduledAt = new Date(String(req.body.scheduledAt || ''));
    if (isNaN(scheduledAt.getTime())) {
      res.status(400).json({ success: false, message: 'Valid scheduledAt is required' });
      return;
    }
    const followUpType = isFollowUpType(req.body.followUpType) ? req.body.followUpType : 'call';
    const followUpLabel = followUpTypeLabel(followUpType);

    const followUp = await LeadFollowUp.create({
      lead: lead._id,
      assignedTo: req.body.assignedTo || lead.assignedTo,
      followUpType,
      scheduledAt,
      remarks: trimOrUndefined(req.body.remarks),
      createdBy: req.user?._id,
    });

    const previousStatus = lead.status;
    const followUpStatus = await getFollowUpLeadStatusName(req.user?._id);
    lead.status = followUpStatus;
    lead.lastFollowupDate = new Date();
    lead.nextFollowupDate = scheduledAt;
    await lead.save();

    await LeadStatusHistory.create({
      lead: lead._id,
      fromStatus: previousStatus,
      toStatus: followUpStatus,
      changedBy: req.user?._id,
      changedAt: new Date(),
      remarks: `${followUpLabel} follow-up scheduled`,
    });

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'follow_up_added', `${followUpLabel} follow-up scheduled`, {
      scheduledAt: followUp.scheduledAt,
      assignedTo: followUp.assignedTo,
      followUpType: followUp.followUpType,
    });

    await createLeadNotification(
      followUp.assignedTo as mongoose.Types.ObjectId | undefined,
      lead._id,
      'follow_up_reminder',
      `${followUpLabel} follow-up scheduled for ${lead.leadId} at ${scheduledAt.toISOString()}`
    );

    await syncLeadAssignmentTask(lead, followUp.assignedTo || lead.assignedTo, req.user?._id as mongoose.Types.ObjectId, followUp.remarks || lead.requirementDescription || lead.notes);

    // Hook for email reminders.
    // TODO: send email reminder via your SMTP service.

    res.status(201).json({ success: true, data: followUp });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const updateLeadFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const followUp = await LeadFollowUp.findById(req.params.followUpId);
    if (!followUp) {
      res.status(404).json({ success: false, message: 'Follow-up not found' });
      return;
    }

    const lead = await Lead.findById(followUp.lead);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    if (req.body.scheduledAt) {
      const d = new Date(String(req.body.scheduledAt));
      if (isNaN(d.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid scheduledAt value' });
        return;
      }
      followUp.scheduledAt = d;
    }
    if (req.body.status && ['pending', 'completed', 'missed'].includes(req.body.status)) {
      followUp.status = req.body.status;
      if (req.body.status === 'completed') {
        const customDate = req.body.completedAt ? new Date(String(req.body.completedAt)) : null;
        followUp.completedAt = customDate && !isNaN(customDate.getTime()) ? customDate : new Date();
      }
    }
    if (isFollowUpType(req.body.followUpType)) followUp.followUpType = req.body.followUpType;
    if (typeof req.body.remarks === 'string') followUp.remarks = req.body.remarks;
    await followUp.save();

    await createLeadActivity(lead._id, req.user?._id as mongoose.Types.ObjectId, 'follow_up_updated', 'Follow-up updated', {
      followUpId: followUp._id,
      status: followUp.status,
      scheduledAt: followUp.scheduledAt,
      followUpType: followUp.followUpType,
    });

    res.status(200).json({ success: true, data: followUp });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const deleteLeadFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const followUp = await LeadFollowUp.findById(req.params.followUpId);
    if (!followUp) {
      res.status(404).json({ success: false, message: 'Follow-up not found' });
      return;
    }

    const lead = await Lead.findById(followUp.lead);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await followUp.deleteOne();

    const nextFollowUp = await LeadFollowUp.findOne({
      lead: lead._id,
      status: 'pending',
    }).sort({ scheduledAt: 1 });

    const lastFollowUp = await LeadFollowUp.findOne({ lead: lead._id }).sort({ scheduledAt: -1, createdAt: -1 });

    const remainingFollowUpsCount = await LeadFollowUp.countDocuments({ lead: lead._id });
    const remainingAssignActivities = await LeadActivity.find({ lead: lead._id, type: { $in: ['assigned', 'reassigned'] } }).sort({ createdAt: -1 });

    if (remainingFollowUpsCount === 0 && remainingAssignActivities.length === 0) {
      lead.assignedTo = undefined;
      lead.status = 'New';
      lead.nextFollowupDate = undefined;
      lead.lastFollowupDate = undefined;
      await lead.save();
      await Task.deleteMany({ lead: lead._id });
    } else {
      lead.nextFollowupDate = nextFollowUp ? nextFollowUp.scheduledAt : undefined;
      lead.lastFollowupDate = lastFollowUp ? (lastFollowUp.scheduledAt || lastFollowUp.createdAt) : undefined;
      await lead.save();

      const taskUpdates: Record<string, any> = {
        $set: {
          description: nextFollowUp?.remarks || lead.requirementDescription || lead.notes || `Lead ${lead.leadId}: ${lead.name}`,
        },
      };
      if (lead.nextFollowupDate) {
        taskUpdates.$set.dueDate = lead.nextFollowupDate;
      } else {
        taskUpdates.$unset = { dueDate: 1 };
      }
      await Task.updateMany({ lead: lead._id }, taskUpdates);
    }

    res.status(200).json({ success: true, message: 'Follow-up deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const deleteLeadActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activity = await LeadActivity.findById(req.params.activityId);
    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    const lead = await Lead.findById(activity.lead);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const taskId = activity.metadata?.taskId;
    if (taskId) {
      await Task.findByIdAndDelete(taskId);
    }

    await activity.deleteOne();

    const remainingFollowUpsCount = await LeadFollowUp.countDocuments({ lead: lead._id });
    const remainingAssignActivities = await LeadActivity.find({ lead: lead._id, type: { $in: ['assigned', 'reassigned'] } }).sort({ createdAt: -1 });

    if (remainingFollowUpsCount === 0 && remainingAssignActivities.length === 0) {
      lead.assignedTo = undefined;
      lead.status = 'New';
      lead.nextFollowupDate = undefined;
      lead.lastFollowupDate = undefined;
      await lead.save();
      await Task.deleteMany({ lead: lead._id });
    } else if (remainingAssignActivities.length > 0 && typeof remainingAssignActivities[0].metadata?.to === 'string') {
      lead.assignedTo = new mongoose.Types.ObjectId(remainingAssignActivities[0].metadata.to as string);
      await lead.save();
    }

    res.status(200).json({ success: true, message: 'Activity deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getLeadDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, fromDate, toDate } = req.query;
    const accessFilter = buildLeadAccessFilter(req);

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;
    let sDate: Date | null = null;
    let eDate: Date | null = null;
    if (effectiveStart) {
      sDate = new Date(String(effectiveStart));
      sDate.setHours(0, 0, 0, 0);
    }
    if (effectiveEnd) {
      eDate = new Date(String(effectiveEnd));
      eDate.setHours(23, 59, 59, 999);
    }

    const dateCond: Record<string, Date> = {};
    if (sDate && !isNaN(sDate.getTime())) dateCond.$gte = sDate;
    if (eDate && !isNaN(eDate.getTime())) dateCond.$lte = eDate;

    const hasDateFilter = Object.keys(dateCond).length > 0;
    const scopedFilter: Record<string, any> = { ...accessFilter };
    if (hasDateFilter) {
      if (!scopedFilter.$and) {
        scopedFilter.$and = [];
      }
      scopedFilter.$and.push({
        $or: [
          { leadDate: dateCond },
          { createdAt: dateCond },
        ],
      });
    }

    // Only sweep overdue follow-ups for leads this user can access — never
    // mutate other users' records from one user's dashboard load.
    const accessibleLeadIds = (await Lead.find(accessFilter).select('_id').lean()).map((l) => l._id);
    await LeadFollowUp.updateMany(
      { lead: { $in: accessibleLeadIds }, status: 'pending', scheduledAt: { $lt: new Date() } },
      { $set: { status: 'missed' } }
    );

    const scopedLeadIds = hasDateFilter
      ? (await Lead.find(scopedFilter).select('_id').lean()).map((l) => l._id)
      : accessibleLeadIds;

    const [totalLeads, byStatus, perStaff, convertedCount, recentActivities, missedFollowUps] = await Promise.all([
      Lead.countDocuments(scopedFilter),
      Lead.aggregate<{ _id: string; count: number }>([
        { $match: scopedFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Lead.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: scopedFilter },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Lead.countDocuments({ ...scopedFilter, status: { $regex: /^(converted|won)$/i } }),
      LeadActivity.find({
        ...(canViewAllLeads(req) ? {} : { actor: req.user?._id }),
        ...(hasDateFilter ? { createdAt: dateCond } : {}),
      })
        .sort({ _id: 1 })
        .limit(10)
        .populate('lead', 'leadId name status')
        .populate('actor', 'name'),
      // Scope to the leads this user can access in the active filtered period
      LeadFollowUp.countDocuments({ lead: { $in: scopedLeadIds }, status: 'missed' }),
    ]);

    const staffIds = perStaff.map((s) => s._id).filter(Boolean);
    const users = staffIds.length ? await User.find({ _id: { $in: staffIds } }).select('name email') : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const conversionRate = totalLeads ? Number(((convertedCount / totalLeads) * 100).toFixed(2)) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalLeads,
        byStatus,
        perStaff: perStaff
          .filter((s) => s._id)
          .map((s) => ({
            user: userMap.get(String(s._id)) || null,
            count: s.count,
          })),
        conversionRate,
        missedFollowUps,
        recentActivities,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getLeadReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { range = 'daily' } = req.query as { range?: 'daily' | 'weekly' | 'monthly' };
    const accessFilter = buildLeadAccessFilter(req);

    const now = new Date();
    let startDate = new Date(now);
    if (range === 'daily') startDate.setDate(now.getDate() - 1);
    if (range === 'weekly') startDate.setDate(now.getDate() - 7);
    if (range === 'monthly') startDate.setMonth(now.getMonth() - 1);

    const reportFilter = { ...accessFilter, createdAt: { $gte: startDate, $lte: now } };

    const [createdInPeriod, convertedInPeriod, rejectedInPeriod, staffPerformance, sourceBreakdown] = await Promise.all([
      Lead.countDocuments(reportFilter),
      Lead.countDocuments({ ...reportFilter, status: { $regex: /^(converted|won)$/i } }),
      Lead.countDocuments({ ...reportFilter, status: { $regex: /^(rejected|lost|junk)$/i } }),
      Lead.aggregate<{ _id: mongoose.Types.ObjectId; total: number; converted: number }>([
        { $match: reportFilter },
        {
          $group: {
            _id: '$assignedTo',
            total: { $sum: 1 },
            converted: { $sum: { $cond: [{ $in: [{ $toLower: '$status' }, ['converted', 'won']] }, 1, 0] } },
          },
        },
      ]),
      Lead.aggregate<{ _id: string; count: number }>([
        { $match: reportFilter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const userIds = staffPerformance.map((s) => s._id).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('name email') : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    res.status(200).json({
      success: true,
      data: {
        range,
        from: startDate,
        to: now,
        createdInPeriod,
        convertedInPeriod,
        rejectedInPeriod,
        conversionRate: createdInPeriod ? Number(((convertedInPeriod / createdInPeriod) * 100).toFixed(2)) : 0,
        staffPerformance: staffPerformance
          .filter((s) => s._id)
          .map((s) => ({
            user: userMap.get(String(s._id)) || null,
            total: s.total,
            converted: s.converted,
            conversionRate: s.total ? Number(((s.converted / s.total) * 100).toFixed(2)) : 0,
          })),
        sourceBreakdown,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getLeadActivities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { leadId, page = 1, limit = 10 } = req.query;
    const filter: Record<string, unknown> = {};
    if (leadId) filter.lead = leadId;
    if (!canViewAllLeads(req)) {
      const assignedLeadIds = (await Lead.find({ assignedTo: req.user?._id }).select('_id').lean()).map((l) => l._id);
      if (leadId) {
        // Honour the requested lead, but only if it belongs to this user.
        const permitted = assignedLeadIds.some((id) => String(id) === String(leadId));
        filter.lead = permitted ? leadId : { $in: [] as unknown[] };
      } else {
        filter.lead = { $in: assignedLeadIds };
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      LeadActivity.find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('lead', 'leadId name status')
        .populate('actor', 'name email'),
      LeadActivity.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, data: items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getLeadNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await LeadNotification.find({ user: req.user?._id, isRead: false })
      .sort({ createdAt: -1, _id: -1 })
      .limit(30)
      .populate('lead', 'leadId name status companyName');
    res.status(200).json({ success: true, data: notifications });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const item = await LeadNotification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user?._id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!item) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.status(200).json({ success: true, data: item });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await LeadNotification.updateMany(
      { user: req.user?._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const deleteLead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ success: false, message: 'Lead not found' });
      return;
    }

    if (!canViewAllLeads(req) && String(lead.assignedTo || '') !== String(req.user?._id)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    // 1. Completely delete all associated tasks
    await Task.deleteMany({
      $or: [
        { lead: lead._id },
        { 'metadata.leadId': lead.leadId },
        { tags: lead.leadId },
        { title: { $regex: `Lead ${lead.leadId}`, $options: 'i' } },
      ],
    });

    // 2. Completely delete all associated activities
    await LeadActivity.deleteMany({ lead: lead._id });

    // 3. Completely delete all associated follow-ups
    await LeadFollowUp.deleteMany({ lead: lead._id });

    // 4. Completely delete all associated notes
    await LeadNote.deleteMany({ lead: lead._id });

    // 5. Completely delete all associated status histories
    await LeadStatusHistory.deleteMany({ lead: lead._id });

    // 6. Completely delete all associated notifications
    await LeadNotification.deleteMany({ lead: lead._id });

    // 7. Delete the lead itself
    await Lead.findByIdAndDelete(lead._id);

    res.status(200).json({ success: true, message: 'Lead, activities, follow-ups, and associated tasks deleted completely' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// ─── STAFF MANAGEMENT ───────────────────────────
export const getStaffUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staff = await getEligibleStaff();
    res.status(200).json({ success: true, data: staff });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const createStaffUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isAdminUser(req.user) && getRoleName(req.user?.role) !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admin can create staff' });
      return;
    }
    const { name, email, password, role = 'sales_executive' } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }

    const roleName = String(role).toLowerCase();
    if (!['admin', 'manager', 'sales_executive', 'engineer'].includes(roleName)) {
      res.status(400).json({ success: false, message: 'Invalid role' });
      return;
    }

    const newUser = await User.create({
      name: String(name).trim(),
      email: normalizeEmail(String(email)),
      password: String(password),
      role: roleName,
      isActive: true,
    });

    res.status(201).json({ success: true, data: newUser });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 11000) {
      res.status(409).json({ success: false, message: 'Email already exists' });
      return;
    }
    res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
};

export const updateStaffUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isAdminUser(req.user) && getRoleName(req.user?.role) !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admin can update staff' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof req.body.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body.role === 'string') updates.role = req.body.role.toLowerCase();
    if (typeof req.body.isActive === 'boolean') updates.isActive = req.body.isActive;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) {
      res.status(404).json({ success: false, message: 'Staff user not found' });
      return;
    }
    res.status(200).json({ success: true, data: user });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const purgeDeletedLeadsAndOrphans = async (): Promise<void> => {
  try {
    const inactiveLeads = await Lead.find({ isActive: false }).select('_id leadId');
    const inactiveIds = inactiveLeads.map((l) => l._id);
    const inactiveLeadIds = inactiveLeads.map((l) => l.leadId).filter(Boolean);

    if (inactiveIds.length > 0) {
      await Promise.all([
        Task.deleteMany({
          $or: [
            { lead: { $in: inactiveIds } },
            { tags: { $in: inactiveLeadIds } },
            { 'metadata.leadId': { $in: inactiveLeadIds } },
          ],
        }),
        LeadActivity.deleteMany({ lead: { $in: inactiveIds } }),
        LeadFollowUp.deleteMany({ lead: { $in: inactiveIds } }),
        LeadNote.deleteMany({ lead: { $in: inactiveIds } }),
        LeadStatusHistory.deleteMany({ lead: { $in: inactiveIds } }),
        LeadNotification.deleteMany({ lead: { $in: inactiveIds } }),
        Lead.deleteMany({ _id: { $in: inactiveIds } }),
      ]);
    }

    const allActiveLeads = await Lead.find({ isActive: { $ne: false } }).select('_id assignedTo');
    const allActiveLeadIds = allActiveLeads.map((l) => l._id);
    const allAssignedLeadIds = allActiveLeads.filter((l) => l.assignedTo).map((l) => l._id);

    await Task.deleteMany({
      taskType: 'lead',
      $or: [
        { lead: { $nin: allAssignedLeadIds } },
        { lead: { $exists: false } },
        { lead: null },
      ],
    });

    await Promise.all([
      LeadActivity.deleteMany({ lead: { $nin: allActiveLeadIds } }),
      LeadFollowUp.deleteMany({ lead: { $nin: allActiveLeadIds } }),
      LeadNote.deleteMany({ lead: { $nin: allActiveLeadIds } }),
      LeadStatusHistory.deleteMany({ lead: { $nin: allActiveLeadIds } }),
      LeadNotification.deleteMany({ lead: { $nin: allActiveLeadIds } }),
    ]);
  } catch (err) {
    console.error('Error in purgeDeletedLeadsAndOrphans:', err);
  }
};
