import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Response } from 'express';
import Call from '../models/Call';
import Customer from '../models/Customer';
import { AMC, Ticket, Payment, Proposal, ProposalTemplate, TicketFollowUp, TicketActivity } from '../models/index';
import { Lead, LeadActivity, LeadStatusHistory } from '../models/Lead';
import Task, { TaskStatus } from '../models/Task';
import { nextSequence, highestExistingNumber } from '../models/Counter';
import { AuthRequest } from '../middleware/auth';
import { isAdminUser, getRoleName } from '../middleware/auth';
import { escapeRegExp, omitKeys, computeProposalTotals, calculateRemainingDays, toCalendarUtcMidnight } from '../utils/controllerHelpers';
import { Settings } from '../models/Settings';
import { getAndIncrementNextProposalNo, peekNextProposalNo, syncProposalNoSequence, buildProposalNumber, stripDateSuffix, computeNextProposalSerial } from '../utils/proposalSequence';
import { sendEmail } from '../utils/mailer';
import { generateUnifiedProposalPdf, cleanWordArtifacts, normalizeColonTableToTabular } from '../utils/htmlPdfGenerator';
import { amountToWords } from '../utils/amountToWords';
import { UPLOAD_ROOT_DIR } from '../config/storage';
import {
  IS_WHATSAPP_STATICALLY_DISABLED,
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  normalizeGraphApiVersion,
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
  resolveCustomerWhatsappNumber,
} from '../utils/whatsapp';

const userAccessFilter = (req: AuthRequest, field = 'createdBy'): Record<string, unknown> => {
  // Shared company records (Customers, AMCs, Payments, Invoices, Proposals, Templates)
  // are accessible to all authenticated staff members who have module permission.
  // Only individual user assignments (like Calls assigned to an engineer or Tickets assigned to a user)
  // use field-level scoping when not admin.
  if (isAdminUser(req.user)) return {};
  if (field === 'engineer' || field === 'assignedTo') {
    return { [field]: req.user?._id };
  }
  return {};
};

const ensureAccess = (req: AuthRequest, doc: any, field = 'createdBy'): boolean =>
  isAdminUser(req.user) || String(doc?.[field] || '') === String(req.user?._id || '');

const roleLabel = (role: unknown): string => {
  if (!role) return 'user';
  if (typeof role === 'string') return role;
  return String((role as { name?: string }).name || 'user');
};

const actorName = (req: AuthRequest): string =>
  String(req.user?.name || req.user?.email || 'System User');

const actorRole = (req: AuthRequest): string => roleLabel(req.user?.role);

const normalizeTicketThread = (ticket: any, req: AuthRequest): void => {
  if (!Array.isArray(ticket?.thread)) return;
  const fallbackName = actorName(req);
  const fallbackRole = actorRole(req);
  for (const item of ticket.thread) {
    if (!item.author && req.user?._id) item.author = req.user._id;
    if (!item.authorName) item.authorName = fallbackName;
    if (!item.authorRole) item.authorRole = fallbackRole;
    if (!item.message) item.message = '[No message]';
    if (item.isInternal === undefined) item.isInternal = false;
    if (!item.createdAt) item.createdAt = new Date();
  }
};

// ─── CALLS ────────────────────────────────────────
export const getCalls = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, engineer, customer, search, startDate, endDate, fromDate, toDate, page = 1, limit = 10 } = req.query as Record<string, any>;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (engineer) filter.engineer = engineer;
    if (customer) filter.customer = customer;
    if (!isAdminUser(req.user)) filter.engineer = req.user?._id;

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
            { callDate: dateCond },
            { createdAt: dateCond },
          ],
        });
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const rx = new RegExp(escapeRegExp(search.trim()), 'i');
      const matchedCustomers = await Customer.find({
        isActive: true,
        $or: [{ name: rx }, { 'companyInfo.customerName': rx }],
      }).select('_id');
      const customerIds = matchedCustomers.map((c) => c._id);
      filter.$or = [
        { subject: rx },
        { issueType: rx },
        { description: rx },
        { resolution: rx },
        ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
      ];
    }

    const isAll = limit === 'all' || limit === '0' || Number(limit) === 0;
    const limitNum = isAll ? 0 : Number(limit);
    const skip = isAll ? 0 : (Number(page) - 1) * limitNum;

    let callQuery = Call.find(filter)
      .populate('customer', 'name phone')
      .populate('engineer', 'name')
      .sort({ callDate: -1, createdAt: -1, _id: -1 });

    if (!isAll) {
      callQuery = callQuery.skip(skip).limit(limitNum);
    }
    if (typeof (callQuery as any).lean === 'function') {
      callQuery = (callQuery as any).lean();
    }

    const [calls, total] = await Promise.all([
      callQuery,
      Call.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: calls, total, page: Number(page), pages: isAll ? 1 : Math.ceil(total / limitNum) || 1 });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const createCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = req.body as Record<string, unknown>;
    const customer = toStringOrUndefined(payload.customer);
    const engineer = isAdminUser(req.user) ? toStringOrUndefined(payload.engineer) : String(req.user?._id || '');
    const subject = toStringOrUndefined(payload.subject);
    const issueType = toStringOrUndefined(payload.issueType);
    const description = toStringOrUndefined(payload.description);
    const resolution = toStringOrUndefined(payload.resolution);
    const chargeApplicable = toBoolean(payload.chargeApplicable);
    const chargeAmount = toNumberOrUndefined(payload.chargeAmount);
    const callDateInput = payload.callDate;

    if (!customer || !engineer || !subject || !issueType) {
      res.status(400).json({ success: false, message: 'Customer, engineer, subject and issue type are required' });
      return;
    }
    if (callDateInput !== undefined && callDateInput !== null && callDateInput !== '' && !isValidDateInput(callDateInput)) {
      res.status(400).json({ success: false, message: 'A valid call date is required' });
      return;
    }
    if (chargeApplicable && (chargeAmount === undefined || chargeAmount < 0)) {
      res.status(400).json({ success: false, message: 'Charge amount must be a valid non-negative number when charge is applicable' });
      return;
    }

    const call = await Call.create({
      ...payload,
      customer,
      engineer,
      subject,
      issueType,
      description,
      resolution,
      chargeApplicable,
      chargeAmount: chargeApplicable ? chargeAmount : undefined,
      callDate: callDateInput ? new Date(String(callDateInput)) : undefined,
      createdBy: req.user?._id,
    });
    const populated = await call.populate([{ path: 'customer', select: 'name phone' }, { path: 'engineer', select: 'name' }]);
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const updateCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(updates, 'subject')) {
      const subject = toStringOrUndefined(updates.subject);
      if (!subject) { res.status(400).json({ success: false, message: 'Subject is required' }); return; }
      updates.subject = subject;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'issueType')) {
      const issueType = toStringOrUndefined(updates.issueType);
      if (!issueType) { res.status(400).json({ success: false, message: 'Issue type is required' }); return; }
      updates.issueType = issueType;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
      updates.description = toStringOrUndefined(updates.description);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'resolution')) {
      updates.resolution = toStringOrUndefined(updates.resolution);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'callDate')) {
      if (updates.callDate === '' || updates.callDate === null) {
        delete updates.callDate;
      } else if (!isValidDateInput(updates.callDate)) {
        res.status(400).json({ success: false, message: 'A valid call date is required' });
        return;
      } else {
        updates.callDate = new Date(String(updates.callDate));
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'chargeApplicable')) {
      updates.chargeApplicable = toBoolean(updates.chargeApplicable);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'chargeAmount')) {
      const normalizedAmount = toNumberOrUndefined(updates.chargeAmount);
      if (normalizedAmount === undefined || normalizedAmount < 0) {
        res.status(400).json({ success: false, message: 'Charge amount must be a valid non-negative number' });
        return;
      }
      updates.chargeAmount = normalizedAmount;
    }
    let clearChargeAmount = false;
    if (updates.chargeApplicable === false && !Object.prototype.hasOwnProperty.call(updates, 'chargeAmount')) {
      delete updates.chargeAmount;
      clearChargeAmount = true;
    }
    if (updates.status === 'resolved' && !updates.resolvedDate) updates.resolvedDate = new Date();
    const callFilter: Record<string, unknown> = { _id: req.params.id };
    if (!isAdminUser(req.user)) callFilter.engineer = req.user?._id;
    // $unset actually removes the field; assigning undefined is silently dropped by Mongoose.
    const callUpdateOp = clearChargeAmount ? { ...updates, $unset: { chargeAmount: 1 } } : updates;
    const call = await Call.findOneAndUpdate(callFilter, callUpdateOp, { new: true, runValidators: true })
      .populate('customer', 'name phone')
      .populate('engineer', 'name');
    if (!call) { res.status(404).json({ success: false, message: 'Call not found' }); return; }
    res.status(200).json({ success: true, data: call });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const deleteCall = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id };
    if (!isAdminUser(req.user)) filter.engineer = req.user?._id;
    const call = await Call.findOneAndDelete(filter);
    if (!call) { res.status(404).json({ success: false, message: 'Call not found' }); return; }
    res.status(200).json({ success: true, message: 'Call deleted' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

// ─── AMC ─────────────────────────────────────────
// escapeRegExp / omitKeys / computeProposalTotals now imported from ../utils/controllerHelpers

const computeAMCStatus = (
  expiryDate: any,
  now: Date,
  soon: Date
): 'active' | 'expired' | 'expiring' => {
  const expMs = toCalendarUtcMidnight(expiryDate);
  if (expMs === null) return 'active';
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (expMs < todayMs) return 'expired';

  const soonMs = toCalendarUtcMidnight(soon) ?? (todayMs + 30 * DAY_MS);
  if (expMs <= soonMs) return 'expiring';
  return 'active';
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const computeRemainingTotal = (
  currentPrice: number | undefined,
  advance1: number | undefined,
  advance2: number | undefined
): number | undefined => {
  if (currentPrice === undefined && advance1 === undefined && advance2 === undefined) return undefined;
  return (currentPrice || 0) - (advance1 || 0) - (advance2 || 0);
};

const toStringOrUndefined = (value: unknown): string | undefined => {
  const s = String(value ?? '').trim();
  return s ? s : undefined;
};
const isValidDateInput = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return false;
  const d = new Date(String(value));
  return !Number.isNaN(d.getTime());
};
const toBoolean = (value: unknown): boolean => value === true || String(value || '').toLowerCase() === 'true';
const normalizeRenewalData = (raw: any, amountFallback?: unknown) => {
  const amount = toNumberOrUndefined(raw?.amount ?? amountFallback);
  return {
    renewedOn: raw?.renewedOn && isValidDateInput(raw.renewedOn) ? new Date(raw.renewedOn) : new Date(),
    period: toStringOrUndefined(raw?.period),
    startDate: parseDateOrUndefined(raw?.startDate),
    expiryDate: parseDateOrUndefined(raw?.expiryDate),
    amount,
    paymentMethod: toStringOrUndefined(raw?.paymentMethod),
    invoiceNo: toStringOrUndefined(raw?.invoiceNo),
    notes: toStringOrUndefined(raw?.notes),
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateInput = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const addDays = (dateInput: string, days: number): string => {
  const d = new Date(`${dateInput}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInput(d);
};
const addYears = (dateInput: string, years: number): string => {
  const d = new Date(`${dateInput}T00:00:00`);
  d.setFullYear(d.getFullYear() + years);
  return toDateInput(d);
};
export const calculateStartDateFromExpiry = (expiryDateInput: unknown, period = '1 Year'): string => {
  if (!expiryDateInput) return '';
  const rawStr = String(expiryDateInput instanceof Date ? expiryDateInput.toISOString() : expiryDateInput).split('T')[0].trim();
  const parts = rawStr.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + 1);
  if (period === '6 Months') dt.setMonth(dt.getMonth() - 6);
  else if (period === '2 Years') dt.setFullYear(dt.getFullYear() - 2);
  else if (period === '3 Years') dt.setFullYear(dt.getFullYear() - 3);
  else dt.setFullYear(dt.getFullYear() - 1);

  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const daysUntilDate = (value: unknown, startValue?: unknown, asOf?: Date): number | null => {
  return calculateRemainingDays(value, startValue, asOf);
};

const normalizeCompanyType = (value: unknown): 'head_office' | 'branch' | undefined => {
  const v = String(value || '').toLowerCase();
  if (v === 'head_office' || v === 'branch') return v;
  return undefined;
};

const normalizeModuleDetails = (raw: any) => {
  if (!raw || typeof raw !== 'object') return {};
  const currentPrice = toNumberOrUndefined(raw.currentPrice);
  const advance1 = toNumberOrUndefined(raw.advance1);
  const advance2 = toNumberOrUndefined(raw.advance2);
  return {
    companyType: normalizeCompanyType(raw.companyType),
    companyName: toStringOrUndefined(raw.companyName),
    address: toStringOrUndefined(raw.address),
    details: toStringOrUndefined(raw.details),
    actualPrice: toNumberOrUndefined(raw.actualPrice),
    discount: toNumberOrUndefined(raw.discount),
    currentPrice,
    advance1,
    advance2,
    // Backend enforces financial derived fields.
    remainingTotal: computeRemainingTotal(currentPrice, advance1, advance2),
    others: toStringOrUndefined(raw.others),
  };
};

const parseDateOrUndefined = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const deriveAMCContractFromCustomer = (
  customer: any,
  now: Date,
  soon: Date,
  actorId?: unknown
) => {
  const createdBy = customer?.createdBy || actorId;
  if (!createdBy) return null;

  const product =
    (Array.isArray(customer?.products) && customer.products.length
      ? String(customer.products[0] || '').trim()
      : '') ||
    String((Array.isArray(customer?.serialNoInfo) ? customer.serialNoInfo[0]?.product : (customer?.serialNoInfo as any)?.software) || '').trim() ||
    'AMC';

  const licenceType =
    String(customer?.licenceType || '').trim() ||
    String((Array.isArray(customer?.serialNoInfo) ? customer.serialNoInfo[0]?.licenceType : (customer?.serialNoInfo as any)?.licenceType) || '').trim() ||
    'Standard';

  const startDate =
    parseDateOrUndefined(customer?.amcDetails?.startDate) ||
    parseDateOrUndefined(customer?.createdAt) ||
    now;

  const expiryDate =
    parseDateOrUndefined(customer?.amcExpiry) ||
    parseDateOrUndefined(customer?.amcDetails?.endDate) ||
    new Date(addYears(toDateInput(startDate), 1));

  const amount =
    toNumberOrUndefined(customer?.amcDetails?.value) ??
    toNumberOrUndefined(customer?.amcDetails?.currentPrice) ??
    toNumberOrUndefined(customer?.amcDetails?.actualPrice) ??
    0;

  return {
    customer: customer._id,
    product,
    licenceType,
    startDate,
    expiryDate,
    amount,
    status: computeAMCStatus(expiryDate, now, soon),
    notes: toStringOrUndefined(customer?.notes) || toStringOrUndefined(customer?.amcDetails?.notesRemarks),
    renewalHistory: [],
    createdBy,
  };
};

const ensureAMCContractsFromCustomers = async (actorId?: unknown): Promise<void> => {
  const customers = await Customer.find({
    isActive: true,
    amcStatus: { $in: ['active', 'expiring', 'expired'] },
  }).select('_id products serialNoInfo licenceType amcStatus amcExpiry amcDetails notes createdBy createdAt');

  if (!customers.length) return;

  const customerIds = customers.map((c) => c._id);
  const existing = await AMC.find({ customer: { $in: customerIds } }).select('customer');
  const customersWithContracts = new Set(existing.map((a) => String(a.customer)));
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * DAY_MS);

  const contractsToCreate = customers
    .filter((c) => !customersWithContracts.has(String(c._id)))
    .map((c) => deriveAMCContractFromCustomer(c, now, soon, actorId))
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (!contractsToCreate.length) return;

  await AMC.insertMany(contractsToCreate, { ordered: false });
};

let lastAMCEnsureTime = 0;
const AMC_ENSURE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const getAMCs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (Date.now() - lastAMCEnsureTime > AMC_ENSURE_INTERVAL) {
      try {
        await ensureAMCContractsFromCustomers(req.user?._id);
        lastAMCEnsureTime = Date.now();
      } catch {
        // Best effort only; list should still load existing contracts.
      }
    }

    const { status, customer, search, product, startDate, endDate } = req.query;
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(5000, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
    const skip = (page - 1) * limit;

    const andClauses: any[] = [{ ...userAccessFilter(req) }];
    if (customer) andClauses.push({ customer });
    if (product) andClauses.push({ product });

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDaySoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);

    const hasDateRange = !!(startDate && endDate);
    const sDate = hasDateRange ? new Date(String(startDate)) : null;
    if (sDate) sDate.setHours(0, 0, 0, 0);
    const eDate = hasDateRange ? new Date(String(endDate)) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);
    const isDateValid = !!(sDate && eDate && !isNaN(sDate.getTime()) && !isNaN(eDate.getTime()));

    if (isDateValid && sDate && eDate) {
      if (status === 'expired') {
        const expiredEnd = eDate < startOfToday ? eDate : new Date(startOfToday.getTime() - 1);
        andClauses.push({ expiryDate: { $gte: sDate, $lte: expiredEnd } });
      } else if (status === 'expiring') {
        const expiringStart = sDate > startOfToday ? sDate : startOfToday;
        andClauses.push({ expiryDate: { $gte: expiringStart, $lte: eDate } });
      } else if (status === 'active') {
        andClauses.push({ expiryDate: { $gte: sDate, $lte: eDate } });
      } else {
        andClauses.push({ expiryDate: { $gte: sDate, $lte: eDate } });
      }
    } else {
      if (status === 'expired') {
        andClauses.push({ $or: [{ expiryDate: { $lt: startOfToday } }, { status: 'expired' }] });
      } else if (status === 'expiring') {
        andClauses.push({ $or: [{ expiryDate: { $gte: startOfToday, $lte: endOfDaySoon } }, { status: 'expiring' }] });
      } else if (status === 'active') {
        andClauses.push({ $or: [{ expiryDate: { $gt: endOfDaySoon } }, { status: 'active' }] });
      }
    }

    const searchValue = typeof search === 'string' ? search.trim() : '';
    if (searchValue) {
      const re = new RegExp(escapeRegExp(searchValue), 'i');
      const matchedCustomers = await Customer.find({
        $or: [{ name: re }, { contact: re }, { email: re }, { phone: re }, { customerNumber: re }],
        isActive: true,
      }).select('_id');

      const customerIds = matchedCustomers.map((c) => c._id);
      andClauses.push({
        $or: [
          { product: re },
          { licenceType: re },
          { notes: re },
          ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
        ],
      });
    }

    const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

    let amcQuery: any = AMC.find(filter)
      .populate('customer', 'customerNumber name email contact phone avatar address branchInfo customerType users companyInfo serialNoInfo partnerDetails amcDetails licenseSerialNo primaryContactInfo lastNotifiedAt lastNotifiedChannel lastNotifiedTemplate')
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit);
    if (typeof amcQuery.lean === 'function') {
      amcQuery = amcQuery.lean();
    }

    const [amcs, total] = await Promise.all([
      amcQuery,
      AMC.countDocuments(filter),
    ]);

    const updates = amcs
      .map((amc: any) => ({ id: amc._id, status: computeAMCStatus(amc.expiryDate, now, soon), current: amc.status }))
      .filter((u: any) => u.current !== u.status)
      .map((u: any) => ({ updateOne: { filter: { _id: u.id }, update: { $set: { status: u.status } } } }));
    if (updates.length) await AMC.bulkWrite(updates);

    const payload = amcs.map((amc: any) => {
      const computed = computeAMCStatus(amc.expiryDate, now, soon);
      const daysLeft = daysUntilDate(amc.expiryDate, amc.startDate, now);
      const statusText =
        daysLeft === null ? 'Unknown' : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`;
      const base = typeof amc.toObject === 'function' ? amc.toObject() : amc;
      return { ...base, status: computed, daysLeft, statusText };
    });

    res.status(200).json({
      success: true,
      data: payload,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getAMCStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const accessFilter = userAccessFilter(req);
    const [total, active, expiring, expired, totalRevenue] = await Promise.all([
      AMC.countDocuments(accessFilter),
      AMC.countDocuments({ ...accessFilter, expiryDate: { $gt: soon } }),
      AMC.countDocuments({ ...accessFilter, expiryDate: { $gte: now, $lte: soon } }),
      AMC.countDocuments({ ...accessFilter, expiryDate: { $lt: now } }),
      AMC.aggregate([
        { $match: accessFilter },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        active,
        expiring,
        expired,
        totalRevenue: totalRevenue[0]?.total || 0,
        renewalRate: total ? Math.round((active / total) * 100) : 0,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAMCInsights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const hasDateRange = !!(startDate && endDate);
    const sDate = hasDateRange ? new Date(String(startDate)) : null;
    if (sDate) sDate.setHours(0, 0, 0, 0);
    const eDate = hasDateRange ? new Date(String(endDate)) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);
    const isDateValid = !!(sDate && eDate && !isNaN(sDate.getTime()) && !isNaN(eDate.getTime()));

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * DAY_MS);
    // .lean() returns plain objects, avoiding the memory/CPU cost of hydrating
    // every AMC as a full Mongoose document on this insights endpoint.
    const amcs = await AMC.find(userAccessFilter(req))
      .populate('customer', 'customerNumber name contact phone email avatar address branchInfo customerType users companyInfo serialNoInfo partnerDetails amcDetails licenseSerialNo primaryContactInfo')
      .sort({ _id: 1 })
      .lean();

    const normalized = amcs.map((amc: any) => {
      const status = computeAMCStatus(amc.expiryDate, now, soon);
      const daysLeft = daysUntilDate(amc.expiryDate, amc.startDate, now);
      return { ...amc, status, daysLeft };
    });

    const filteredNormalized = isDateValid && sDate && eDate
      ? normalized.filter((amc: any) => {
          const exp = amc.expiryDate ? new Date(amc.expiryDate) : null;
          return exp && exp >= sDate && exp <= eDate;
        })
      : normalized;

    const riskRows = [...filteredNormalized]
      .sort((a, b) => (a.daysLeft ?? 999999) - (b.daysLeft ?? 999999))
      .slice(0, 8);
    const recentRows = [...filteredNormalized]
      .sort((a, b) => {
        const bt = new Date(String((b as any).createdAt || '')).getTime();
        const at = new Date(String((a as any).createdAt || '')).getTime();
        return bt - at;
      })
      .slice(0, 8);

    const allRenewals = normalized
      .flatMap((amc) =>
        (amc.renewalHistory || []).map((rh: any) => ({
          ...rh,
          customer: typeof amc.customer === 'object' ? amc.customer : null,
          product: amc.product,
          status: amc.status,
          startDate: amc.startDate,
          expiryDate: amc.expiryDate,
          amcValue: amc.amount,
          amcId: amc._id,
        }))
      )
      .sort((a, b) => new Date(String(b.renewedOn || '')).getTime() - new Date(String(a.renewedOn || '')).getTime());

    const totalRevenue = allRenewals.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const renewalsThisMonth = allRenewals.filter((r) => {
      const d = new Date(String(r.renewedOn || ''));
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const renewedContracts = new Set(allRenewals.map((r) => String(r.amcId || '')).filter(Boolean)).size;
    const renewalRate = normalized.length ? Math.round((renewedContracts / normalized.length) * 100) : 0;

    const activeCount = isDateValid && sDate && eDate
      ? filteredNormalized.filter((x: any) => {
          const exp = x.expiryDate ? new Date(x.expiryDate) : null;
          return exp && exp >= now;
        }).length
      : normalized.filter((x) => x.status === 'active').length;

    const expiringCount = isDateValid && sDate && eDate
      ? filteredNormalized.filter((x: any) => {
          const exp = x.expiryDate ? new Date(x.expiryDate) : null;
          const soonDate = new Date(now.getTime() + 30 * DAY_MS);
          return exp && exp >= now && exp <= soonDate;
        }).length
      : normalized.filter((x) => x.status === 'expiring').length;

    const expiredCount = isDateValid && sDate && eDate
      ? filteredNormalized.filter((x: any) => {
          const exp = x.expiryDate ? new Date(x.expiryDate) : null;
          return exp && exp < now;
        }).length
      : normalized.filter((x) => x.status === 'expired').length;

    res.status(200).json({
      success: true,
      data: {
        dashboard: {
          total: filteredNormalized.length,
          active: activeCount,
          expiring: expiringCount,
          expired: expiredCount,
          renewalRate,
          riskRows,
          recentRows,
        },
        history: {
          allRenewals,
          totalRevenue,
          renewalsThisMonth,
          renewalRate,
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const calculatePeriodExpiry = (dateInput: string, years = 1): string => {
  const d = new Date(`${dateInput}T00:00:00`);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return toDateInput(d);
};

export const getRenewalPrefill = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const module = String(req.params.module || '').toLowerCase();
    const customerId = String(req.params.customerId || '').trim();
    if (!['tdl', 'cloud', 'tss'].includes(module)) {
      res.status(400).json({ success: false, message: 'Invalid module' });
      return;
    }
    const customerFilter: Record<string, unknown> = { _id: customerId };
    if (!isAdminUser(req.user)) customerFilter.createdBy = req.user?._id;
    const customer = await Customer.findOne(customerFilter);
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    const today = toDateInput(new Date());

    let latestExpiryDate: Date | null = null;
    const considerDate = (dVal: any) => {
      if (!dVal) return;
      const parsed = new Date(dVal);
      if (!isNaN(parsed.getTime())) {
        if (!latestExpiryDate || parsed > latestExpiryDate) {
          latestExpiryDate = parsed;
        }
      }
    };

    if (module === 'tss') {
      considerDate(customer.tssDetails?.endDate);
      (customer.tssDetails?.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
      (customer.serialNoInfo || []).forEach((row: any) => {
        considerDate(row.tssExpiryDate);
        considerDate(row.endDate);
      });
      (customer.services || []).forEach((s: any) => {
        if (s.type === 'tss') {
          considerDate(s.endDate);
          considerDate(s.tssExpiryDate);
          (s.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
        }
      });
    } else if (module === 'tdl') {
      considerDate(customer.tdlDetails?.endDate);
      (customer.tdlDetails?.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
      (customer.serialNoInfo || []).forEach((row: any) => considerDate(row.endDate));
      (customer.services || []).forEach((s: any) => {
        if (s.type === 'tdl') {
          considerDate(s.endDate);
          (s.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
        }
      });
    } else if (module === 'cloud') {
      considerDate(customer.cloudDetails?.cloudExpiryDate);
      considerDate(customer.cloudDetails?.endDate);
      (customer.cloudDetails?.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
      (customer.services || []).forEach((s: any) => {
        if (s.type === 'cloud') {
          considerDate(s.endDate);
          considerDate(s.cloudExpiryDate);
          (s.renewalHistory || []).forEach((rh: any) => considerDate(rh.expiryDate));
        }
      });
    }

    const start = latestExpiryDate
      ? addDays(toDateInput(latestExpiryDate), 1)
      : today;
    const end = calculatePeriodExpiry(start, 1);
    const detailsSource =
      module === 'tdl'
        ? customer.tdlDetails
        : module === 'cloud'
          ? customer.cloudDetails
          : customer.tssDetails;

    res.status(200).json({
      success: true,
      data: {
        customerId: customer._id,
        companyType: customer.branchInfo?.isBranch ? 'branch' : 'head_office',
        companyName: customer.name || '',
        address: customer.address || '',
        newStartDate: start,
        newExpiryDate: end,
        moduleDetails: {
          details: detailsSource?.details || '',
          actualPrice: detailsSource?.actualPrice ?? null,
          discount: detailsSource?.discount ?? null,
          currentPrice: detailsSource?.currentPrice ?? null,
          advance1: detailsSource?.advance1 ?? null,
          advance2: detailsSource?.advance2 ?? null,
          remainingTotal: detailsSource?.remainingTotal ?? null,
          others: detailsSource?.others || '',
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


export const sendReminder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { targetType, targetId, method, template, payload } = req.body as {
      targetType?: 'amc' | 'customer';
      targetId?: string;
      method?: 'whatsapp' | 'email' | 'both';
      template?: string;
      payload?: Record<string, unknown>;
    };
    if (!targetType || !targetId || !method) {
      res.status(400).json({ success: false, message: 'targetType, targetId and method are required' });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        delivered: true,
        method,
        targetType,
        targetId,
        template: template || null,
        payload: payload || null,
        sentAt: new Date().toISOString(),
      },
      message: 'Reminder queued successfully',
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const sendBulkReminders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { target, method, template } = req.body as {
      target?: 'expiring_30' | 'expiring_7' | 'expired';
      method?: 'whatsapp' | 'email' | 'both';
      template?: string;
    };
    if (!target || !method) {
      res.status(400).json({ success: false, message: 'target and method are required' });
      return;
    }
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * DAY_MS);
    const in30 = new Date(now.getTime() + 30 * DAY_MS);
    const filter =
      target === 'expired'
        ? { expiryDate: { $lt: now } }
        : target === 'expiring_7'
          ? { expiryDate: { $gte: now, $lte: in7 } }
          : { expiryDate: { $gte: now, $lte: in30 } };
    const count = await AMC.countDocuments({ ...filter, ...userAccessFilter(req) });
    res.status(200).json({
      success: true,
      data: {
        queued: count,
        target,
        method,
        template: template || null,
      },
      message: `Queued ${count} reminder(s)`,
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAMC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, ...userAccessFilter(req) };
    const amc = await AMC.findOne(filter).populate('customer', 'name phone avatar companyInfo branchInfo amcDetails serialNoInfo services primaryContactInfo');
    if (!amc) { res.status(404).json({ success: false, message: 'AMC not found' }); return; }

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const computed = computeAMCStatus(amc.expiryDate, now, soon);
    if (amc.status !== computed) await AMC.updateOne({ _id: amc._id }, { $set: { status: computed } });

    res.status(200).json({ success: true, data: { ...amc.toObject(), status: computed } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const createAMC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // renewalHistory must only be appended via the renew* endpoints — never trusted from the client at creation.
    const { renewalHistory: _ignoredRenewalHistory, ...amcBody } = (req.body || {}) as Record<string, unknown>;
    const amc = await AMC.create({ ...amcBody, createdBy: req.user?._id });
    const populated = await amc.populate('customer', 'name phone avatar branchInfo');

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const computed = computeAMCStatus(populated.expiryDate, now, soon);
    if (populated.status !== computed) {
      populated.status = computed;
      await populated.save();
    }

    // Keep customer summary fields in sync (best-effort).
    try {
      const customerId = typeof populated.customer === 'object' ? populated.customer._id : populated.customer;
      const moduleDetails = normalizeModuleDetails((req.body as any).moduleDetails);
      await Customer.updateOne(
        { _id: customerId },
        {
          $set: {
            amcStatus: computed,
            amcExpiry: populated.expiryDate,
            'amcDetails.status': computed,
            'amcDetails.startDate': populated.startDate,
            'amcDetails.endDate': populated.expiryDate,
            'amcDetails.value': toNumberOrUndefined((req.body as any).amount),
            'amcDetails.companyType': moduleDetails.companyType,
            'amcDetails.companyName': moduleDetails.companyName,
            'amcDetails.address': moduleDetails.address,
            'amcDetails.details': moduleDetails.details,
            'amcDetails.actualPrice': moduleDetails.actualPrice,
            'amcDetails.discount': moduleDetails.discount,
            'amcDetails.currentPrice': moduleDetails.currentPrice,
            'amcDetails.advance1': moduleDetails.advance1,
            'amcDetails.advance2': moduleDetails.advance2,
            'amcDetails.remainingTotal': moduleDetails.remainingTotal,
            'amcDetails.others': moduleDetails.others,
          },
        }
      );
    } catch { /* ignore sync errors */ }

    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const renewAMC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { renewalData, newStartDate, newExpiryDate, amount, moduleDetails: rawModuleDetails } = req.body as Record<string, any>;
    if (!isValidDateInput(newStartDate) || !isValidDateInput(newExpiryDate)) {
      res.status(400).json({ success: false, message: 'Valid renewal start and expiry dates are required' });
      return;
    }
    const renewalAmount = toNumberOrUndefined(amount);
    if (renewalAmount === undefined || renewalAmount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const normalizedRenewalData = normalizeRenewalData(
      { ...renewalData, startDate: newStartDate, expiryDate: newExpiryDate },
      renewalAmount
    );
    if (normalizedRenewalData.amount === undefined || normalizedRenewalData.amount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const moduleDetails = normalizeModuleDetails(rawModuleDetails);
    const amcToRenew = await AMC.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!amcToRenew) { res.status(404).json({ success: false, message: 'AMC not found' }); return; }

    const existingHistory = Array.isArray(amcToRenew.renewalHistory) ? amcToRenew.renewalHistory : [];
    const hasInitial = existingHistory.some((rh: any) => rh.period === 'Initial Contract');

    const updateOps: any = {
      $set: {
        startDate: newStartDate,
        expiryDate: newExpiryDate,
        amount: renewalAmount,
        status: 'active',
      },
    };

    if (!hasInitial) {
      let initialStart = amcToRenew.initialStartDate || amcToRenew.startDate;
      let initialExpiry = amcToRenew.initialExpiryDate || amcToRenew.expiryDate;
      let initialAmount = amcToRenew.initialAmount ?? amcToRenew.amount ?? 0;

      // In case amcToRenew had already been renewed earlier without an Initial Contract entry:
      if (existingHistory.length > 0) {
        const custDoc = await Customer.findById(amcToRenew.customer).lean();
        const originalService = (custDoc?.services || []).find((s: any) => s.type === 'amc' && s.startDate && s.endDate);
        const originalSerial = (custDoc?.serialNoInfo || []).find((s: any) => s.startDate && s.endDate);
        if (originalService?.startDate && originalService?.endDate) {
          initialStart = originalService.startDate;
          initialExpiry = originalService.endDate;
        } else if (originalSerial?.startDate && originalSerial?.endDate) {
          initialStart = originalSerial.startDate;
          initialExpiry = originalSerial.endDate;
        }
      }

      if (initialExpiry && (!initialStart || new Date(initialStart) > new Date(initialExpiry))) {
        initialStart = new Date(calculateStartDateFromExpiry(initialExpiry, '1 Year'));
      }

      const initialEntry = {
        period: 'Initial Contract',
        renewedOn: initialStart || (amcToRenew as any).createdAt || new Date(),
        startDate: initialStart,
        expiryDate: initialExpiry,
        amount: initialAmount,
        paymentMethod: 'Main Contract',
        notes: amcToRenew.notes || 'Main Contract',
      };

      updateOps.$set.initialStartDate = initialStart;
      updateOps.$set.initialExpiryDate = initialExpiry;
      updateOps.$set.initialAmount = initialAmount;
      updateOps.$push = {
        renewalHistory: {
          $each: [initialEntry, normalizedRenewalData]
        }
      };
    } else {
      let wasHealed = false;
      const healedHistory = existingHistory.map((rh: any) => {
        if (rh.period === 'Initial Contract' && rh.expiryDate && (!rh.startDate || new Date(rh.startDate) > new Date(rh.expiryDate))) {
          wasHealed = true;
          const healedStart = new Date(calculateStartDateFromExpiry(rh.expiryDate, rh.period || '1 Year'));
          return {
            ...rh,
            startDate: healedStart,
            renewedOn: rh.renewedOn && new Date(rh.renewedOn) > new Date(rh.expiryDate) ? healedStart : rh.renewedOn,
          };
        }
        return rh;
      });
      if (wasHealed) {
        updateOps.$set.renewalHistory = [...healedHistory, normalizedRenewalData];
      } else {
        updateOps.$push = { renewalHistory: normalizedRenewalData };
      }
    }

    const amc = await AMC.findOneAndUpdate(
      { _id: req.params.id, ...userAccessFilter(req) },
      updateOps,
      { new: true }
    ).populate('customer', 'name phone email avatar companyInfo branchInfo amcDetails serialNoInfo services primaryContactInfo');
    if (!amc) { res.status(404).json({ success: false, message: 'AMC not found' }); return; }

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const computed = computeAMCStatus(amc.expiryDate, now, soon);
    const prevStatus = amc.status;
    amc.status = computed;
    if (prevStatus !== computed) await AMC.updateOne({ _id: amc._id }, { $set: { status: computed } });

    // Keep customer summary fields in sync (best-effort).
    try {
      const customerId = typeof amc.customer === 'object' ? amc.customer._id : amc.customer;
      await Customer.updateOne(
        { _id: customerId },
        {
          $set: {
            amcStatus: computed,
            amcExpiry: amc.expiryDate,
            'amcDetails.status': computed,
            'amcDetails.startDate': newStartDate,
            'amcDetails.endDate': newExpiryDate,
            'amcDetails.value': renewalAmount,
            'amcDetails.companyType': moduleDetails.companyType,
            'amcDetails.companyName': moduleDetails.companyName,
            'amcDetails.address': moduleDetails.address,
            'amcDetails.details': moduleDetails.details,
            'amcDetails.actualPrice': moduleDetails.actualPrice,
            'amcDetails.discount': moduleDetails.discount,
            'amcDetails.currentPrice': moduleDetails.currentPrice,
            'amcDetails.advance1': moduleDetails.advance1,
            'amcDetails.advance2': moduleDetails.advance2,
            'amcDetails.remainingTotal': moduleDetails.remainingTotal,
            'amcDetails.others': moduleDetails.others,
          },
        }
      );
    } catch { /* ignore sync errors */ }

    res.status(200).json({ success: true, data: amc });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const updateAMC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const whitelist = ['product', 'licenceType', 'startDate', 'expiryDate', 'amount', 'status', 'notes', 'renewalHistory', 'location'];
    const updates: Record<string, any> = {};
    for (const key of whitelist) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }
    const amc = await AMC.findOneAndUpdate({ _id: req.params.id, ...userAccessFilter(req) }, updates, { new: true, runValidators: true }).populate('customer', 'name phone avatar branchInfo');
    if (!amc) { res.status(404).json({ success: false, message: 'AMC not found' }); return; }

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const computed = computeAMCStatus(amc.expiryDate, now, soon);
    if (amc.status !== computed) {
      amc.status = computed;
      await amc.save();
    }

    // Keep customer summary fields in sync (best-effort).
    try {
      const customerId = typeof amc.customer === 'object' ? amc.customer._id : amc.customer;
      const moduleDetails = normalizeModuleDetails((req.body as any).moduleDetails);
      await Customer.updateOne(
        { _id: customerId },
        {
          $set: {
            amcStatus: computed,
            amcExpiry: amc.expiryDate,
            'amcDetails.status': computed,
            'amcDetails.startDate': amc.startDate,
            'amcDetails.endDate': amc.expiryDate,
            'amcDetails.value': toNumberOrUndefined((req.body as any).amount),
            'amcDetails.companyType': moduleDetails.companyType,
            'amcDetails.companyName': moduleDetails.companyName,
            'amcDetails.address': moduleDetails.address,
            'amcDetails.details': moduleDetails.details,
            'amcDetails.actualPrice': moduleDetails.actualPrice,
            'amcDetails.discount': moduleDetails.discount,
            'amcDetails.currentPrice': moduleDetails.currentPrice,
            'amcDetails.advance1': moduleDetails.advance1,
            'amcDetails.advance2': moduleDetails.advance2,
            'amcDetails.remainingTotal': moduleDetails.remainingTotal,
            'amcDetails.others': moduleDetails.others,
          },
        }
      );
    } catch { /* ignore sync errors */ }

    res.status(200).json({ success: true, data: amc });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const deleteAMC = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const amc = await AMC.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!amc) { res.status(404).json({ success: false, message: 'AMC not found' }); return; }
    
    const customerId = amc.customer;
    await amc.deleteOne();

    try {
      if (customerId) {
        // Only wipe the customer's AMC summary if NO other contracts remain; otherwise
        // resync the summary to the most recent surviving contract.
        const remainingAmc = await AMC.findOne({ customer: customerId }).sort({ expiryDate: -1 });
        if (remainingAmc) {
          const now = new Date();
          const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          const remStatus = computeAMCStatus(remainingAmc.expiryDate, now, soon);
          await Customer.updateOne(
            { _id: customerId },
            {
              $set: {
                amcStatus: remStatus,
                amcExpiry: remainingAmc.expiryDate,
                'amcDetails.status': remStatus,
                'amcDetails.startDate': remainingAmc.startDate,
                'amcDetails.endDate': remainingAmc.expiryDate,
                'amcDetails.value': remainingAmc.amount,
              },
            }
          );
        } else {
          await Customer.updateOne(
            { _id: customerId },
            {
              $set: {
                amcStatus: 'none',
                amcExpiry: null,
                'amcDetails.status': 'none',
                'amcDetails.startDate': null,
                'amcDetails.endDate': null,
                'amcDetails.value': null,
                'amcDetails.companyType': null,
                'amcDetails.companyName': null,
                'amcDetails.address': null,
                'amcDetails.details': null,
                'amcDetails.actualPrice': null,
                'amcDetails.discount': null,
                'amcDetails.currentPrice': null,
                'amcDetails.advance1': null,
                'amcDetails.advance2': null,
                'amcDetails.remainingTotal': null,
                'amcDetails.others': null,
              },
            }
          );
        }
      }
    } catch { /* ignore sync errors */ }

    res.status(200).json({ success: true, message: 'AMC contract deleted' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const renewTDL = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { renewalData, newStartDate, newExpiryDate, amount, moduleDetails: rawModuleDetails } = req.body as Record<string, any>;
    if (!isValidDateInput(newStartDate) || !isValidDateInput(newExpiryDate)) {
      res.status(400).json({ success: false, message: 'Valid renewal start and expiry dates are required' });
      return;
    }
    const renewalAmount = toNumberOrUndefined(amount);
    if (renewalAmount === undefined || renewalAmount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const normalizedRenewalData = normalizeRenewalData({
      ...renewalData,
      startDate: newStartDate,
      expiryDate: newExpiryDate
    }, renewalAmount);
    if (normalizedRenewalData.amount === undefined || normalizedRenewalData.amount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const moduleDetails = normalizeModuleDetails(rawModuleDetails);
    const existingCustomer = await Customer.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!existingCustomer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }

    const tdlHistory = existingCustomer.tdlDetails?.renewalHistory || [];
    const hasInitial = tdlHistory.some((rh: any) => rh.period === 'Initial Contract');

    const updateSet: Record<string, any> = {
      'tdlDetails.companyType': moduleDetails.companyType,
      'tdlDetails.companyName': moduleDetails.companyName,
      'tdlDetails.address': moduleDetails.address,
      'tdlDetails.details': moduleDetails.details,
      'tdlDetails.actualPrice': moduleDetails.actualPrice,
      'tdlDetails.discount': moduleDetails.discount,
      'tdlDetails.currentPrice': renewalAmount,
      'tdlDetails.advance1': moduleDetails.advance1,
      'tdlDetails.advance2': moduleDetails.advance2,
      'tdlDetails.remainingTotal': moduleDetails.remainingTotal,
      'tdlDetails.others': moduleDetails.others,
      'tdlDetails.startDate': newStartDate,
      'tdlDetails.endDate': newExpiryDate,
      'tdlDetails.status': 'active',
    };

    const updateOps: any = { $set: updateSet };

    if (!hasInitial) {
      let initialStart = existingCustomer.tdlDetails?.initialStartDate || existingCustomer.tdlDetails?.startDate;
      let initialEnd = existingCustomer.tdlDetails?.initialEndDate || existingCustomer.tdlDetails?.endDate;
      const initialPrice = existingCustomer.tdlDetails?.initialPrice ?? existingCustomer.tdlDetails?.currentPrice ?? existingCustomer.tdlDetails?.actualPrice ?? 0;

      if (initialEnd && (!initialStart || new Date(initialStart) > new Date(initialEnd))) {
        initialStart = new Date(calculateStartDateFromExpiry(initialEnd, '1 Year'));
      }

      const initialEntry = {
        period: 'Initial Contract',
        renewedOn: initialStart || (existingCustomer as any).createdAt || new Date(),
        startDate: initialStart,
        expiryDate: initialEnd,
        amount: initialPrice,
        paymentMethod: 'Main Record',
        notes: existingCustomer.tdlDetails?.details || 'Initial Record',
      };
      updateOps.$set['tdlDetails.initialStartDate'] = initialStart;
      updateOps.$set['tdlDetails.initialEndDate'] = initialEnd;
      updateOps.$set['tdlDetails.initialPrice'] = initialPrice;
      updateOps.$push = {
        'tdlDetails.renewalHistory': {
          $each: [initialEntry, normalizedRenewalData]
        }
      };
    } else {
      let wasHealed = false;
      const healedHistory = tdlHistory.map((rh: any) => {
        if (rh.period === 'Initial Contract' && rh.expiryDate && (!rh.startDate || new Date(rh.startDate) > new Date(rh.expiryDate))) {
          wasHealed = true;
          const healedStart = new Date(calculateStartDateFromExpiry(rh.expiryDate, rh.period || '1 Year'));
          return {
            ...rh,
            startDate: healedStart,
            renewedOn: rh.renewedOn && new Date(rh.renewedOn) > new Date(rh.expiryDate) ? healedStart : rh.renewedOn,
          };
        }
        return rh;
      });
      if (wasHealed) {
        updateOps.$set['tdlDetails.renewalHistory'] = [...healedHistory, normalizedRenewalData];
      } else {
        updateOps.$push = { 'tdlDetails.renewalHistory': normalizedRenewalData };
      }
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...userAccessFilter(req) },
      updateOps,
      { new: true }
    );
    if (!customer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }
    res.status(200).json({ success: true, data: customer });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const renewCloud = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { renewalData, newStartDate, newExpiryDate, amount, moduleDetails: rawModuleDetails } = req.body as Record<string, any>;
    if (!isValidDateInput(newStartDate) || !isValidDateInput(newExpiryDate)) {
      res.status(400).json({ success: false, message: 'Valid renewal start and expiry dates are required' });
      return;
    }
    const renewalAmount = toNumberOrUndefined(amount);
    if (renewalAmount === undefined || renewalAmount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const normalizedRenewalData = normalizeRenewalData({
      ...renewalData,
      startDate: newStartDate,
      expiryDate: newExpiryDate
    }, renewalAmount);
    if (normalizedRenewalData.amount === undefined || normalizedRenewalData.amount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const moduleDetails = normalizeModuleDetails(rawModuleDetails);
    const existingCustomer = await Customer.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!existingCustomer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }

    const cloudHistory = existingCustomer.cloudDetails?.renewalHistory || [];
    const hasInitial = cloudHistory.some((rh: any) => rh.period === 'Initial Contract');

    const updateSet: Record<string, any> = {
      'cloudDetails.companyType': moduleDetails.companyType,
      'cloudDetails.companyName': moduleDetails.companyName,
      'cloudDetails.address': moduleDetails.address,
      'cloudDetails.details': moduleDetails.details,
      'cloudDetails.actualPrice': moduleDetails.actualPrice,
      'cloudDetails.discount': moduleDetails.discount,
      'cloudDetails.currentPrice': renewalAmount,
      'cloudDetails.advance1': moduleDetails.advance1,
      'cloudDetails.advance2': moduleDetails.advance2,
      'cloudDetails.remainingTotal': moduleDetails.remainingTotal,
      'cloudDetails.others': moduleDetails.others,
      'cloudDetails.startDate': newStartDate,
      'cloudDetails.endDate': newExpiryDate,
      'cloudDetails.cloudStartDate': newStartDate,
      'cloudDetails.cloudExpiryDate': newExpiryDate,
      'cloudDetails.status': 'active',
    };

    const updateOps: any = { $set: updateSet };

    if (!hasInitial) {
      let initialStart = existingCustomer.cloudDetails?.initialStartDate || existingCustomer.cloudDetails?.startDate || existingCustomer.cloudDetails?.cloudStartDate;
      let initialEnd = existingCustomer.cloudDetails?.initialEndDate || existingCustomer.cloudDetails?.endDate || existingCustomer.cloudDetails?.cloudExpiryDate;
      const initialPrice = existingCustomer.cloudDetails?.initialPrice ?? existingCustomer.cloudDetails?.currentPrice ?? existingCustomer.cloudDetails?.actualPrice ?? 0;

      if (initialEnd && (!initialStart || new Date(initialStart) > new Date(initialEnd))) {
        initialStart = new Date(calculateStartDateFromExpiry(initialEnd, '1 Year'));
      }

      const initialEntry = {
        period: 'Initial Contract',
        renewedOn: initialStart || (existingCustomer as any).createdAt || new Date(),
        startDate: initialStart,
        expiryDate: initialEnd,
        amount: initialPrice,
        paymentMethod: 'Main Record',
        notes: existingCustomer.cloudDetails?.details || 'Initial Record',
      };
      updateOps.$set['cloudDetails.initialStartDate'] = initialStart;
      updateOps.$set['cloudDetails.initialEndDate'] = initialEnd;
      updateOps.$set['cloudDetails.initialPrice'] = initialPrice;
      updateOps.$push = {
        'cloudDetails.renewalHistory': {
          $each: [initialEntry, normalizedRenewalData]
        }
      };
    } else {
      let wasHealed = false;
      const healedHistory = cloudHistory.map((rh: any) => {
        if (rh.period === 'Initial Contract' && rh.expiryDate && (!rh.startDate || new Date(rh.startDate) > new Date(rh.expiryDate))) {
          wasHealed = true;
          const healedStart = new Date(calculateStartDateFromExpiry(rh.expiryDate, rh.period || '1 Year'));
          return {
            ...rh,
            startDate: healedStart,
            renewedOn: rh.renewedOn && new Date(rh.renewedOn) > new Date(rh.expiryDate) ? healedStart : rh.renewedOn,
          };
        }
        return rh;
      });
      if (wasHealed) {
        updateOps.$set['cloudDetails.renewalHistory'] = [...healedHistory, normalizedRenewalData];
      } else {
        updateOps.$push = { 'cloudDetails.renewalHistory': normalizedRenewalData };
      }
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...userAccessFilter(req) },
      updateOps,
      { new: true }
    );
    if (!customer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }
    res.status(200).json({ success: true, data: customer });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const renewTSS = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { renewalData, newStartDate, newExpiryDate, amount, moduleDetails: rawModuleDetails } = req.body as Record<string, any>;
    if (!isValidDateInput(newStartDate) || !isValidDateInput(newExpiryDate)) {
      res.status(400).json({ success: false, message: 'Valid renewal start and expiry dates are required' });
      return;
    }
    const renewalAmount = toNumberOrUndefined(amount);
    if (renewalAmount === undefined || renewalAmount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const normalizedRenewalData = normalizeRenewalData({
      ...renewalData,
      startDate: newStartDate,
      expiryDate: newExpiryDate
    }, renewalAmount);
    if (normalizedRenewalData.amount === undefined || normalizedRenewalData.amount <= 0) {
      res.status(400).json({ success: false, message: 'A positive renewal amount is required' });
      return;
    }
    const moduleDetails = normalizeModuleDetails(rawModuleDetails);
    const existingCustomer = await Customer.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!existingCustomer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }

    const tssHistory = existingCustomer.tssDetails?.renewalHistory || [];
    const hasInitial = tssHistory.some((rh: any) => rh.period === 'Initial Contract');

    const updateSet: Record<string, any> = {
      'tssDetails.companyType': moduleDetails.companyType,
      'tssDetails.companyName': moduleDetails.companyName,
      'tssDetails.address': moduleDetails.address,
      'tssDetails.details': moduleDetails.details,
      'tssDetails.actualPrice': moduleDetails.actualPrice,
      'tssDetails.discount': moduleDetails.discount,
      'tssDetails.currentPrice': renewalAmount,
      'tssDetails.advance1': moduleDetails.advance1,
      'tssDetails.advance2': moduleDetails.advance2,
      'tssDetails.remainingTotal': moduleDetails.remainingTotal,
      'tssDetails.others': moduleDetails.others,
      'tssDetails.startDate': newStartDate,
      'tssDetails.endDate': newExpiryDate,
      'tssDetails.status': 'active',
      'serialNoInfo.0.tssExpiryDate': newExpiryDate, // Sync with first instance
      'serialNoInfo.0.endDate': newExpiryDate,
    };

    const updateOps: any = { $set: updateSet };

    if (!hasInitial) {
      let initialStart = existingCustomer.tssDetails?.initialStartDate || existingCustomer.tssDetails?.startDate;
      let initialEnd = existingCustomer.tssDetails?.initialEndDate || existingCustomer.tssDetails?.endDate;
      const initialPrice = existingCustomer.tssDetails?.initialPrice ?? existingCustomer.tssDetails?.currentPrice ?? existingCustomer.tssDetails?.actualPrice ?? 0;

      if (initialEnd && (!initialStart || new Date(initialStart) > new Date(initialEnd))) {
        initialStart = new Date(calculateStartDateFromExpiry(initialEnd, '1 Year'));
      }

      const initialEntry = {
        period: 'Initial Contract',
        renewedOn: initialStart || (existingCustomer as any).createdAt || new Date(),
        startDate: initialStart,
        expiryDate: initialEnd,
        amount: initialPrice,
        paymentMethod: 'Main Record',
        notes: existingCustomer.tssDetails?.details || 'Initial Record',
      };
      updateOps.$set['tssDetails.initialStartDate'] = initialStart;
      updateOps.$set['tssDetails.initialEndDate'] = initialEnd;
      updateOps.$set['tssDetails.initialPrice'] = initialPrice;
      updateOps.$push = {
        'tssDetails.renewalHistory': {
          $each: [initialEntry, normalizedRenewalData]
        }
      };
    } else {
      let wasHealed = false;
      const healedHistory = tssHistory.map((rh: any) => {
        if (rh.period === 'Initial Contract' && rh.expiryDate && (!rh.startDate || new Date(rh.startDate) > new Date(rh.expiryDate))) {
          wasHealed = true;
          const healedStart = new Date(calculateStartDateFromExpiry(rh.expiryDate, rh.period || '1 Year'));
          return {
            ...rh,
            startDate: healedStart,
            renewedOn: rh.renewedOn && new Date(rh.renewedOn) > new Date(rh.expiryDate) ? healedStart : rh.renewedOn,
          };
        }
        return rh;
      });
      if (wasHealed) {
        updateOps.$set['tssDetails.renewalHistory'] = [...healedHistory, normalizedRenewalData];
      } else {
        updateOps.$push = { 'tssDetails.renewalHistory': normalizedRenewalData };
      }
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ...userAccessFilter(req) },
      updateOps,
      { new: true }
    );
    if (!customer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }
    res.status(200).json({ success: true, data: customer });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const updateAMCLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { location } = req.body as {
      location?: { lat?: number; lng?: number; address?: string; accuracy?: number; capturedAt?: string };
    };

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      res.status(400).json({ success: false, message: 'Valid location with lat/lng is required' });
      return;
    }
    if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
      res.status(400).json({ success: false, message: 'Latitude/Longitude out of range' });
      return;
    }

    const amc = await AMC.findOneAndUpdate(
      { _id: req.params.id, ...userAccessFilter(req) },
      {
        $set: {
          location: {
            lat: location.lat,
            lng: location.lng,
            address: location.address || undefined,
            accuracy: typeof location.accuracy === 'number' ? location.accuracy : undefined,
            capturedAt: location.capturedAt ? new Date(location.capturedAt) : new Date(),
          },
        },
      },
      { new: true }
    ).populate('customer', 'name phone avatar branchInfo');

    if (!amc) {
      res.status(404).json({ success: false, message: 'AMC not found' });
      return;
    }

    res.status(200).json({ success: true, data: amc });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

const ticketTaskStatus = (status: string): TaskStatus => {
  if (status === 'in-progress') return 'in_progress';
  if (status === 'pending-customer') return 'blocked';
  if (status === 'resolved' || status === 'closed') return 'done';
  return 'todo';
};

const syncTicketAssignmentTask = async (ticket: any, actor?: unknown): Promise<void> => {
  if (!ticket?.assignedTo) return;

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
  const existingTask = await Task.findOne({ ticket: ticket._id });

  if (existingTask) {
    if (!existingTask.isActive) {
      // Task was explicitly deleted by user; do NOT resurrect or recreate it
      return;
    }
    existingTask.title = title;
    existingTask.description = description || existingTask.description;
    existingTask.customer = ticket.customer?._id || ticket.customer || existingTask.customer;
    existingTask.assignedTo = ticket.assignedTo?._id || ticket.assignedTo;
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
    assignedTo: ticket.assignedTo?._id || ticket.assignedTo,
    status,
    priority: ticket.priority || 'medium',
    tags: ['ticket', ticket.ticketNo, ticket.category].filter(Boolean),
    createdBy: actor || ticket.createdBy,
    completedAt: status === 'done' ? new Date() : undefined,
  });
};

const ticketAccessFilter = (req: AuthRequest, ticketId: string | mongoose.Types.ObjectId): Record<string, unknown> => {
  const filter: Record<string, unknown> = { _id: ticketId };
  const canManage = isAdminUser(req.user) || getRoleName(req.user?.role) === 'manager';
  if (!canManage) {
    filter.$or = [{ assignedTo: req.user?._id }, { createdBy: req.user?._id }];
  }
  return filter;
};

export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, priority, assignedTo, customer, search, startDate, endDate, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (customer) filter.customer = customer;
    const canViewAll = isAdminUser(req.user) || getRoleName(req.user?.role) === 'manager';
    const andConditions: any[] = [];
    if (!canViewAll) {
      andConditions.push({
        $or: [{ assignedTo: req.user?._id }, { createdBy: req.user?._id }],
      });
    }

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;
    let sDate: Date | null = null;
    let eDate: Date | null = null;
    if (effectiveStart && effectiveEnd) {
      const parsedS = new Date(String(effectiveStart));
      parsedS.setHours(0, 0, 0, 0);
      const parsedE = new Date(String(effectiveEnd));
      parsedE.setHours(23, 59, 59, 999);
      if (!isNaN(parsedS.getTime()) && !isNaN(parsedE.getTime())) {
        sDate = parsedS;
        eDate = parsedE;
        andConditions.push({
          $or: [
            { ticketRaisedDate: { $gte: sDate, $lte: eDate } },
            { createdAt: { $gte: sDate, $lte: eDate } },
          ],
        });
      }
    }

    if (typeof search === 'string' && search.trim()) {
      const value = escapeRegExp(search.trim());
      const matchedCustomers = await Customer.find({
        isActive: true,
        $or: [{ name: { $regex: value, $options: 'i' } }],
      }).select('_id');
      const customerIds = matchedCustomers.map((c) => c._id);
      andConditions.push({
        $or: [
          { ticketNo: { $regex: value, $options: 'i' } },
          { subject: { $regex: value, $options: 'i' } },
          { category: { $regex: value, $options: 'i' } },
          { subCategory: { $regex: value, $options: 'i' } },
          { contactPerson: { $regex: value, $options: 'i' } },
          { mailId: { $regex: value, $options: 'i' } },
          { phoneNumber: { $regex: value, $options: 'i' } },
          ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
        ],
      });
    }
    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    // KPI stats over the whole access-scoped set (not just the current page).
    const statsMatch: Record<string, unknown> = {};
    const statsAnd: any[] = [];
    if (!canViewAll) {
      statsAnd.push({
        $or: [{ assignedTo: req.user?._id }, { createdBy: req.user?._id }],
      });
    }
    if (sDate && eDate) {
      statsAnd.push({
        $or: [
          { ticketRaisedDate: { $gte: sDate, $lte: eDate } },
          { createdAt: { $gte: sDate, $lte: eDate } },
        ],
      });
    }
    if (statsAnd.length === 1) {
      Object.assign(statsMatch, statsAnd[0]);
    } else if (statsAnd.length > 1) {
      statsMatch.$and = statsAnd;
    }

    const isAll = limit === 'all' || limit === '0' || Number(limit) === 0;
    const limitNum = isAll ? 0 : Number(limit);
    const skip = isAll ? 0 : (Number(page) - 1) * limitNum;

    let ticketQuery = Ticket.find(filter)
      .populate('customer', 'name phone')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1, _id: -1 });

    if (!isAll) {
      ticketQuery = ticketQuery.skip(skip).limit(limitNum);
    }
    if (typeof (ticketQuery as any).lean === 'function') {
      ticketQuery = (ticketQuery as any).lean();
    }

    const [tickets, total, statsAgg] = await Promise.all([
      ticketQuery,
      Ticket.countDocuments(filter),
      Ticket.aggregate([
        { $match: statsMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            critical: { $sum: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const s = (statsAgg[0] || {}) as { total?: number; open?: number; critical?: number; resolved?: number };
    const pages = isAll ? 1 : Math.ceil(total / limitNum) || 1;
    res.status(200).json({
      success: true,
      data: tickets,
      total,
      page: Number(page),
      pages,
      stats: {
        total: s.total || 0,
        open: s.open || 0,
        critical: s.critical || 0,
        resolved: s.resolved || 0,
      },
    });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const createTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = { ...req.body } as Record<string, unknown>;
    const customer = String(payload.customer || '').trim();
    const assignedTo = String(payload.assignedTo || req.user?._id || '').trim();
    const subject = String(payload.subject || '').trim();
    const category = String(payload.category || '').trim();
    if (!customer || !assignedTo || !subject || !category) {
      res.status(400).json({ success: false, message: 'Company name, assignee, subject and category are required' });
      return;
    }
    const now = new Date();
    const rawAssignDate = payload.assignDate || payload.ticketRaisedDate;
    let ticketRaisedDate = rawAssignDate ? parseDateOrUndefined(rawAssignDate) : now;
    const completedDate = payload.completedDate ? parseDateOrUndefined(payload.completedDate) : undefined;
    if (rawAssignDate && !ticketRaisedDate) {
      res.status(400).json({ success: false, message: 'A valid assign date is required' });
      return;
    }
    if (ticketRaisedDate && ticketRaisedDate.getUTCHours() === 0 && ticketRaisedDate.getUTCMinutes() === 0 && ticketRaisedDate.getUTCSeconds() === 0) {
      ticketRaisedDate.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
    }
    if (payload.completedDate && !completedDate) {
      res.status(400).json({ success: false, message: 'A valid completed date is required' });
      return;
    }
    const normalizedTags = Array.isArray(payload.tags)
      ? payload.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(payload.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
    const ticket = await Ticket.create({
      ...payload,
      customer,
      assignedTo,
      subject,
      category,
      subCategory: toStringOrUndefined(payload.subCategory),
      contactPerson: toStringOrUndefined(payload.contactPerson),
      mailId: toStringOrUndefined(payload.mailId),
      phoneNumber: toStringOrUndefined(payload.phoneNumber),
      ticketRaisedDate,
      completedDate,
      tags: normalizedTags,
      createdBy: req.user?._id,
    });
    await syncTicketAssignmentTask(ticket, req.user?._id);
    await createTicketActivity(ticket._id, req.user?._id as mongoose.Types.ObjectId, 'ticket_created', `Ticket ${ticket.ticketNo} registered`);
    res.status(201).json({ success: true, data: ticket });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Mass-assignment guard: never let the client overwrite server-controlled / immutable fields.
    const updates = omitKeys({ ...req.body }, ['ticketNo', 'createdBy', 'customer', '_id', 'createdAt', 'updatedAt']) as Record<string, unknown>;
    // Reassignment is an admin/manager action via the dedicated assign endpoint or ticket update.
    if (!isAdminUser(req.user) && getRoleName(req.user?.role) !== 'manager') delete updates.assignedTo;
    if (updates.tags !== undefined) {
      updates.tags = Array.isArray(updates.tags)
        ? updates.tags.map((t) => String(t).trim()).filter(Boolean)
        : String(updates.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
    }
    if (typeof updates.subject === 'string') updates.subject = updates.subject.trim();
    if (typeof updates.category === 'string') updates.category = updates.category.trim();
    if (typeof updates.subCategory === 'string') updates.subCategory = updates.subCategory.trim();
    if (typeof updates.contactPerson === 'string') updates.contactPerson = updates.contactPerson.trim();
    if (typeof updates.mailId === 'string') updates.mailId = updates.mailId.trim();
    if (typeof updates.phoneNumber === 'string') updates.phoneNumber = updates.phoneNumber.trim();
    if (Object.prototype.hasOwnProperty.call(updates, 'ticketRaisedDate') || Object.prototype.hasOwnProperty.call(updates, 'assignDate')) {
      const rawDate = updates.assignDate !== undefined ? updates.assignDate : updates.ticketRaisedDate;
      if (!rawDate) {
        updates.ticketRaisedDate = null;
      } else {
        const date = parseDateOrUndefined(rawDate);
        if (!date) { res.status(400).json({ success: false, message: 'A valid assign date is required' }); return; }
        updates.ticketRaisedDate = date;
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'completedDate')) {
      if (!updates.completedDate) {
        updates.completedDate = null;
      } else {
        const date = parseDateOrUndefined(updates.completedDate);
        if (!date) { res.status(400).json({ success: false, message: 'A valid completed date is required' }); return; }
        updates.completedDate = date;
      }
    }
    if (updates.status === 'resolved') updates.resolvedAt = new Date();
    if (updates.status === 'closed') updates.closedAt = new Date();
    const ticketFilter = ticketAccessFilter(req, req.params.id);
    const ticket = await Ticket.findOne(ticketFilter);
    if (!ticket) { res.status(404).json({ success: false, message: 'Ticket not found' }); return; }
    
    const prevStatus = ticket.status;
    const prevAssigned = ticket.assignedTo ? String(ticket.assignedTo) : '';

    Object.assign(ticket, updates);
    normalizeTicketThread(ticket, req);
    await ticket.save();

    if (prevStatus !== ticket.status) {
      await createTicketActivity(ticket._id, req.user?._id as mongoose.Types.ObjectId, 'status_changed', `Status changed from ${prevStatus} to ${ticket.status}`);
    }

    const nextAssigned = ticket.assignedTo ? String(ticket.assignedTo) : '';
    if (prevAssigned !== nextAssigned && nextAssigned) {
      await createTicketActivity(
        ticket._id,
        req.user?._id as mongoose.Types.ObjectId,
        prevAssigned ? 'reassigned' : 'assigned',
        prevAssigned ? 'Ticket reassigned' : 'Ticket assigned',
        { from: prevAssigned || null, to: nextAssigned }
      );
    }
    
    await createTicketActivity(ticket._id, req.user?._id as mongoose.Types.ObjectId, 'ticket_updated', `Ticket ${ticket.ticketNo} updated`);

    await syncTicketAssignmentTask(ticket, req.user?._id);
    const populated = await Ticket.findById(ticket._id)
      .populate('customer', 'name phone')
      .populate('assignedTo', 'name');
    res.status(200).json({ success: true, data: populated });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const addTicketReply = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      res.status(400).json({ success: false, message: 'Reply message is required' });
      return;
    }

    const reply = {
      author: req.user?._id,
      authorName: actorName(req),
      authorRole: actorRole(req),
      message,
      isInternal: req.body?.isInternal === true || String(req.body?.isInternal || '').toLowerCase() === 'true',
      createdAt: new Date(),
    };

    const ticketFilter = ticketAccessFilter(req, req.params.id);
    const ticket = await Ticket.findOneAndUpdate(
      ticketFilter,
      { $push: { thread: reply } },
      { new: true, runValidators: true }
    ).populate('customer', 'name').populate('assignedTo', 'name');
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }
    await createTicketActivity(ticket._id, req.user?._id as mongoose.Types.ObjectId, 'reply_added', `Reply added by ${reply.authorName}`);
    res.status(200).json({ success: true, data: ticket });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const deleteTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const canManage = isAdminUser(req.user) || getRoleName(req.user?.role) === 'manager';
    const ticketFilter: Record<string, unknown> = { _id: req.params.id };
    if (!canManage) ticketFilter.createdBy = req.user?._id;
    const ticket = await Ticket.findOneAndDelete(ticketFilter);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }
    await Task.updateMany({ ticket: ticket._id }, { isActive: false });
    await TicketFollowUp.deleteMany({ ticket: ticket._id });
    await TicketActivity.deleteMany({ ticket: ticket._id });
    res.status(200).json({ success: true, message: 'Ticket deleted' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

// Helper for Ticket Activities
const createTicketActivity = async (
  ticketId: mongoose.Types.ObjectId | string,
  actor: mongoose.Types.ObjectId | string,
  type: string,
  message: string,
  metadata?: Record<string, any>,
  activityDate?: Date
): Promise<void> => {
  const payload: Record<string, any> = {
    ticket: ticketId,
    actor,
    type,
    message,
    metadata,
  };
  if (activityDate) {
    payload.createdAt = activityDate;
    payload.updatedAt = activityDate;
  }
  await TicketActivity.create(payload);
};

// Ticket details with Activities and Follow-ups
export const getTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticketFilter = ticketAccessFilter(req, req.params.id);
    const ticket = await Ticket.findOne(ticketFilter)
      .populate('customer', 'name phone avatar branchInfo')
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role');
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    const [followUps, activities] = await Promise.all([
      TicketFollowUp.find({ ticket: ticket._id }).sort({ scheduledAt: 1 }).populate('assignedTo', 'name email').populate('createdBy', 'name email'),
      TicketActivity.find({ ticket: ticket._id }).sort({ createdAt: -1 }).populate('actor', 'name email'),
    ]);

    res.status(200).json({ success: true, data: ticket, followUps, activities });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// Schedule Ticket Follow-up
export const scheduleTicketFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticketFilter = ticketAccessFilter(req, req.params.id);
    const ticket = await Ticket.findOne(ticketFilter);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    const scheduledAt = new Date(String(req.body.scheduledAt || ''));
    if (isNaN(scheduledAt.getTime())) {
      res.status(400).json({ success: false, message: 'Valid scheduledAt date is required' });
      return;
    }
    const followUpType = req.body.followUpType || 'call';

    const followUp = await TicketFollowUp.create({
      ticket: ticket._id,
      assignedTo: req.body.assignedTo || ticket.assignedTo,
      followUpType,
      scheduledAt,
      remarks: req.body.remarks ? String(req.body.remarks).trim() : undefined,
      createdBy: req.user?._id,
    });

    ticket.lastFollowupDate = new Date();
    ticket.nextFollowupDate = scheduledAt;
    normalizeTicketThread(ticket, req);
    await ticket.save();

    await createTicketActivity(
      ticket._id,
      req.user?._id as mongoose.Types.ObjectId,
      'follow_up_added',
      `${followUpType.charAt(0).toUpperCase() + followUpType.slice(1)} follow-up scheduled`,
      {
        scheduledAt: followUp.scheduledAt,
        assignedTo: followUp.assignedTo,
        followUpType: followUp.followUpType,
      }
    );

    res.status(201).json({ success: true, data: followUp });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// Delete Ticket Follow-up
export const deleteTicketFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const followUp = await TicketFollowUp.findById(req.params.followUpId);
    if (!followUp) {
      res.status(404).json({ success: false, message: 'Follow-up not found' });
      return;
    }

    const ticketFilter = ticketAccessFilter(req, followUp.ticket);
    const ticket = await Ticket.findOne(ticketFilter);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    await followUp.deleteOne();

    const nextFollowUp = await TicketFollowUp.findOne({
      ticket: ticket._id,
      status: 'pending',
      scheduledAt: { $gte: new Date() },
    }).sort({ scheduledAt: 1 });
    ticket.nextFollowupDate = nextFollowUp ? nextFollowUp.scheduledAt : undefined;

    const lastFollowUp = await TicketFollowUp.findOne({ ticket: ticket._id }).sort({ scheduledAt: -1, createdAt: -1 });
    ticket.lastFollowupDate = lastFollowUp ? lastFollowUp.createdAt : undefined;
    normalizeTicketThread(ticket, req);
    await ticket.save();

    await createTicketActivity(
      ticket._id,
      req.user?._id as mongoose.Types.ObjectId,
      'follow_up_deleted',
      'Follow-up deleted'
    );

    res.status(200).json({ success: true, message: 'Follow-up deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// Assign/Reassign Ticket
export const assignTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { assignedTo, description } = req.body as { assignedTo?: string; assignedAt?: string; description?: string };
    const ticketFilter: Record<string, unknown> = { _id: req.params.id };
    if (!isAdminUser(req.user) && getRoleName(req.user?.role) !== 'manager') {
      res.status(403).json({ success: false, message: 'Only admin/manager can assign tickets' });
      return;
    }
    const ticket = await Ticket.findOne(ticketFilter);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    if (!assignedTo) {
      res.status(400).json({ success: false, message: 'No assignee selected' });
      return;
    }

    let assignedAt = req.body.assignedAt ? new Date(String(req.body.assignedAt)) : new Date();
    if (isNaN(assignedAt.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid assigned date' });
      return;
    }
    if (assignedAt.getUTCHours() === 0 && assignedAt.getUTCMinutes() === 0 && assignedAt.getUTCSeconds() === 0) {
      const now = new Date();
      assignedAt.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
    }

    const from = ticket.assignedTo ? String(ticket.assignedTo) : undefined;
    const nextAssignee = new mongoose.Types.ObjectId(assignedTo);

    ticket.assignedTo = nextAssignee;
    normalizeTicketThread(ticket, req);
    await ticket.save();
    await syncTicketAssignmentTask(ticket, req.user?._id);

    await createTicketActivity(
      ticket._id,
      req.user?._id as mongoose.Types.ObjectId,
      from ? 'reassigned' : 'assigned',
      description ? String(description).trim() : (from ? 'Ticket reassigned' : 'Ticket assigned'),
      { from, to: String(nextAssignee), assignedAt: assignedAt.toISOString() },
      assignedAt
    );

    res.status(200).json({ success: true, data: ticket });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// Delete Ticket Activity
export const deleteTicketActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const activity = await TicketActivity.findById(req.params.activityId);
    if (!activity) {
      res.status(404).json({ success: false, message: 'Activity not found' });
      return;
    }

    const ticketFilter = ticketAccessFilter(req, activity.ticket);
    const ticket = await Ticket.findOne(ticketFilter);
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' });
      return;
    }

    await activity.deleteOne();
    res.status(200).json({ success: true, message: 'Activity deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// ─── PAYMENTS ────────────────────────────────────
export const getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type, customer, search, startDate, endDate, fromDate, toDate, page = 1, limit = 10 } = req.query as Record<string, any>;
    const filter: Record<string, unknown> = { ...userAccessFilter(req) };
    if (status) {
      if (Array.isArray(status)) {
        filter.status = { $in: status };
      } else {
        filter.status = status;
      }
    }
    if (type) filter.paymentType = type;
    if (customer) filter.customer = customer;
    if (search && String(search).trim()) {
      const s = escapeRegExp(String(search).trim());
      filter.$or = [
        { invoiceNo: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { paymentType: { $regex: s, $options: 'i' } },
        { method: { $regex: s, $options: 'i' } },
        { transactionRef: { $regex: s, $options: 'i' } },
      ];
    }

    const effectiveStart = startDate || fromDate;
    const effectiveEnd = endDate || toDate;
    let sDate: Date | null = null;
    let eDate: Date | null = null;
    if (effectiveStart) {
      const parsedS = new Date(String(effectiveStart));
      parsedS.setHours(0, 0, 0, 0);
      if (!isNaN(parsedS.getTime())) sDate = parsedS;
    }
    if (effectiveEnd) {
      const parsedE = new Date(String(effectiveEnd));
      parsedE.setHours(23, 59, 59, 999);
      if (!isNaN(parsedE.getTime())) eDate = parsedE;
    }
    if (sDate && eDate) {
      filter.paymentDate = { $gte: sDate, $lte: eDate };
    } else if (sDate || eDate) {
      const dateCond: Record<string, Date> = {};
      if (sDate) dateCond.$gte = sDate;
      if (eDate) dateCond.$lte = eDate;
      filter.paymentDate = dateCond;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('customer', 'name phone avatar branchInfo')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Payment.countDocuments(filter),
    ]);

    const [monthlyRevenue, ytdRevenue, outstandingStats, statusAgg] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            ...userAccessFilter(req),
            status: 'paid',
            paymentDate: sDate || eDate
              ? { ...(sDate ? { $gte: sDate } : {}), ...(eDate ? { $lte: eDate } : {}) }
              : { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { ...userAccessFilter(req), status: 'paid', paymentDate: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            ...userAccessFilter(req),
            status: { $in: ['pending', 'overdue', 'partial'] },
            ...(sDate || eDate ? { paymentDate: { ...(sDate ? { $gte: sDate } : {}), ...(eDate ? { $lte: eDate } : {}) } } : {}),
          },
        },
        {
          $group: {
            _id: null,
            // For partial payments, only the unpaid remainder is outstanding.
            total: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'partial'] },
                  { $subtract: ['$amount', { $ifNull: ['$partialAmount', 0] }] },
                  '$amount',
                ],
              },
            },
            customers: { $addToSet: '$customer' },
          },
        },
        { $project: { _id: 0, total: 1, outstandingCustomers: { $size: '$customers' } } },
      ]),
      // Global counts/value per status so KPI cards reflect the whole dataset,
      // not just the current page.
      Payment.aggregate([
        {
          $match: {
            ...userAccessFilter(req),
            ...(sDate || eDate ? { paymentDate: { ...(sDate ? { $gte: sDate } : {}), ...(eDate ? { $lte: eDate } : {}) } } : {}),
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$amount' } } },
      ]),
    ]);

    const statusCounts: Record<string, number> = {};
    let totalValue = 0;
    let totalInvoices = 0;
    for (const row of statusAgg as Array<{ _id: string; count: number; value: number }>) {
      statusCounts[row._id] = row.count;
      totalValue += row.value || 0;
      totalInvoices += row.count || 0;
    }

    res.status(200).json({
      success: true, data: payments, total,
      stats: {
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        totalOutstanding: outstandingStats[0]?.total || 0,
        revenueYtd: ytdRevenue[0]?.total || 0,
        outstandingCustomers: outstandingStats[0]?.outstandingCustomers || 0,
        totalInvoices,
        totalValue,
        paidCount: statusCounts.paid || 0,
        pendingCount: statusCounts.pending || 0,
        overdueCount: statusCounts.overdue || 0,
        partialCount: statusCounts.partial || 0,
      },
    });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const createPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = { ...req.body } as Record<string, unknown>;
    const customer = String(payload.customer || '').trim();
    const amount = Number(payload.amount);
    const paymentType = String(payload.paymentType || '').trim();
    const method = String(payload.method || '').trim();
    if (!customer || !Number.isFinite(amount) || amount <= 0 || !paymentType || !method) {
      res.status(400).json({ success: false, message: 'Customer, payment type, method and positive amount are required' });
      return;
    }
    const partialAmount =
      payload.partialAmount === undefined || payload.partialAmount === null || payload.partialAmount === ''
        ? undefined
        : Number(payload.partialAmount);
    const normalized = {
      ...payload,
      customer,
      amount,
      paymentType,
      method,
      description: String(payload.description || '').trim() || undefined,
      transactionRef: String(payload.transactionRef || '').trim() || undefined,
      remarks: String(payload.remarks || '').trim() || undefined,
      partialAmount: Number.isFinite(partialAmount as number) ? partialAmount : undefined,
      paymentDate: payload.paymentDate ? new Date(String(payload.paymentDate)) : new Date(),
      dueDate: payload.dueDate ? new Date(String(payload.dueDate)) : undefined,
    };
    const payment = await Payment.create({ ...normalized, createdBy: req.user?._id });
    res.status(201).json({ success: true, data: payment });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const updatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (updates.amount !== undefined) {
      const amount = Number(updates.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: 'Amount must be a positive number' });
        return;
      }
      updates.amount = amount;
    }
    if (updates.partialAmount !== undefined) {
      const partialAmount =
        updates.partialAmount === null || updates.partialAmount === ''
          ? undefined
          : Number(updates.partialAmount);
      updates.partialAmount = Number.isFinite(partialAmount as number) ? partialAmount : undefined;
    }
    if (typeof updates.paymentType === 'string') updates.paymentType = updates.paymentType.trim();
    if (typeof updates.method === 'string') updates.method = updates.method.trim();
    if (typeof updates.description === 'string') updates.description = updates.description.trim();
    if (typeof updates.transactionRef === 'string') updates.transactionRef = updates.transactionRef.trim();
    if (typeof updates.remarks === 'string') updates.remarks = updates.remarks.trim();
    if (updates.paymentDate) updates.paymentDate = new Date(String(updates.paymentDate));
    if (updates.dueDate) updates.dueDate = new Date(String(updates.dueDate));

    const payment = await Payment.findOneAndUpdate({ _id: req.params.id, ...userAccessFilter(req) }, updates, { new: true }).populate('customer', 'name');
    if (!payment) { res.status(404).json({ success: false, message: 'Payment not found' }); return; }
    res.status(200).json({ success: true, data: payment });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

// ─── PROPOSALS ───────────────────────────────────
export const getProposals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, lead, task, customer, startDate, endDate, fromDate, toDate, sortOrder } = req.query as Record<string, any>;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(5000, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
    const skip = (page - 1) * limit;
    const sortDirection: 1 | -1 = sortOrder === 'asc' || sortOrder === '1' ? 1 : -1;

    const filter: Record<string, unknown> = { ...userAccessFilter(req) };
    if (status && status !== 'all') filter.status = status;
    if (lead && mongoose.Types.ObjectId.isValid(String(lead))) {
      filter.lead = new mongoose.Types.ObjectId(String(lead));
    }
    if (task && mongoose.Types.ObjectId.isValid(String(task))) {
      filter.task = new mongoose.Types.ObjectId(String(task));
    }
    if (customer && mongoose.Types.ObjectId.isValid(String(customer))) {
      filter.customer = new mongoose.Types.ObjectId(String(customer));
    }

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
            { quoteDate: dateCond },
            { createdAt: dateCond },
          ],
        });
      }
    }

    // Build aggregation to support search across populated customer name
    let proposals: any[];
    let total: number;

    if (search) {
      const searchStr = escapeRegExp(String(search).trim());
      const pipeline: any[] = [
        {
          $lookup: {
            from: 'customers',
            localField: 'customer',
            foreignField: '_id',
            as: 'customerData',
          },
        },
        {
          $lookup: {
            from: 'leads',
            localField: 'lead',
            foreignField: '_id',
            as: 'leadData',
          },
        },
        {
          $lookup: {
            from: 'tasks',
            localField: 'task',
            foreignField: '_id',
            as: 'taskData',
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdUserData',
          },
        },
        {
          $addFields: {
            customerObj: { $arrayElemAt: ['$customerData', 0] },
            leadObj: { $arrayElemAt: ['$leadData', 0] },
            taskObj: { $arrayElemAt: ['$taskData', 0] },
            createdByObj: { $arrayElemAt: ['$createdUserData', 0] },
          },
        },
        {
          $match: {
            ...filter,
            $or: [
              { proposalNo: { $regex: searchStr, $options: 'i' } },
              { proposalId: { $regex: searchStr, $options: 'i' } },
              { title: { $regex: searchStr, $options: 'i' } },
              { customerName: { $regex: searchStr, $options: 'i' } },
              { customerEmail: { $regex: searchStr, $options: 'i' } },
              { customer: { $regex: searchStr, $options: 'i' } },
              { 'customerObj.name': { $regex: searchStr, $options: 'i' } },
              { 'customerObj.companyName': { $regex: searchStr, $options: 'i' } },
              { 'customerObj.email': { $regex: searchStr, $options: 'i' } },
              { 'leadObj.name': { $regex: searchStr, $options: 'i' } },
              { 'leadObj.companyName': { $regex: searchStr, $options: 'i' } },
              { 'leadObj.email': { $regex: searchStr, $options: 'i' } },
            ],
          },
        },
        { $sort: { _id: sortDirection } },
      ];

      const countPipeline = [...pipeline, { $count: 'total' }];
      const [countResult] = await Proposal.aggregate(countPipeline);
      total = countResult?.total || 0;

      const dataPipeline = [
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            proposalNo: { $ifNull: ['$proposalNo', '$proposalId'] },
            proposalId: 1,
            title: 1,
            subtotal: { $ifNull: ['$subtotal', '$amount'] },
            discount: 1,
            total: { $ifNull: ['$total', '$amount'] },
            amount: 1,
            validUntil: 1, status: 1, sentAt: 1, createdAt: 1, updatedAt: 1,
            revision: 1, revisedAt: 1, revisionReason: 1, revisionHistory: 1,
            resentAt: 1, lastSentAt: 1, resendCount: 1,
            template: 1, templateName: 1,
            items: 1,
            blocks: 1,
            terms: 1,
            templateImage: 1,
            templateFooterImage: 1,
            quoteDate: 1,
            validForDays: 1,
            companyInfo: 1,
            quotationDetails: 1,
            senderName: 1,
            senderEmail: 1,
            senderPhone: 1,
            createdBy: {
              _id: '$createdByObj._id',
              name: '$createdByObj.name',
              email: '$createdByObj.email',
              phone: '$createdByObj.phone',
            },
            customerName: {
              $ifNull: [
                '$customerName',
                {
                  $ifNull: [
                    '$customerObj.name',
                    {
                      $cond: [
                        { $eq: [{ $type: '$customer' }, 'string'] },
                        '$customer',
                        null
                      ]
                    }
                  ]
                }
              ]
            },
            customerPhone: 1, customerEmail: 1, customerAddress: 1,
            customer: {
              _id: '$customerObj._id',
              name: {
                $ifNull: [
                  '$customerObj.name',
                  {
                    $cond: [
                      { $eq: [{ $type: '$customer' }, 'string'] },
                      '$customer',
                      null
                    ]
                  }
                ]
              },
              companyName: '$customerObj.companyName',
              contact: '$customerObj.contact',
              phone: '$customerObj.phone',
              email: '$customerObj.email',
            },
            lead: {
              _id: '$leadObj._id',
              leadId: '$leadObj.leadId',
              name: '$leadObj.name',
              companyName: '$leadObj.companyName',
              phone: '$leadObj.phone',
              email: '$leadObj.email',
              status: '$leadObj.status',
              priority: '$leadObj.priority',
            },
            task: '$taskObj',
          },
        },
      ];
      proposals = await Proposal.aggregate(dataPipeline);
    } else {
      total = await Proposal.countDocuments(filter);
      proposals = await Proposal.find(filter)
        .populate('customer', 'name contact companyName phone email address')
        .populate('lead', 'leadId name companyName phone email fullAddress status priority')
        .populate('template', 'name title items templateImage templateFooterImage validForDays discount terms companyInfo blocks senderName senderEmail senderPhone')
        .populate('createdBy', 'name email phone')
        .populate({
          path: 'task',
          select: 'taskNo title description taskDate taskType customer lead assignedTo status priority dueDate history createdBy createdAt updatedAt',
          populate: [
            { path: 'createdBy', select: 'name email' },
            { path: 'assignedTo', select: 'name email' },
            { path: 'history.fromAssignee', select: 'name email' },
            { path: 'history.toAssignee', select: 'name email' },
            { path: 'history.performedBy', select: 'name email' },
            { path: 'customer', select: 'name companyName phone email' },
            { path: 'lead', select: 'leadId name companyName phone email' },
          ],
        })
        .sort({ _id: sortDirection })
        .skip(skip)
        .limit(limit);
    }

    // Enrich proposals with task details or associated lead tasks if missing
    const leadIdsToResolve = proposals
      .filter((p: any) => (!p.task || !p.task.taskNo) && p.lead)
      .map((p: any) => (typeof p.lead === 'object' && p.lead ? p.lead._id : p.lead))
      .filter(Boolean);

    if (leadIdsToResolve.length > 0) {
      const relatedTasks = await Task.find({ lead: { $in: leadIdsToResolve }, isActive: true })
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .populate('history.fromAssignee', 'name email')
        .populate('history.toAssignee', 'name email')
        .populate('history.performedBy', 'name email')
        .populate('customer', 'name companyName phone email')
        .populate('lead', 'leadId name companyName phone email')
        .sort({ createdAt: -1 });

      const taskByLeadMap = new Map<string, any>();
      for (const t of relatedTasks) {
        const lId = String((t.lead as any)?._id || t.lead);
        if (!taskByLeadMap.has(lId)) {
          taskByLeadMap.set(lId, t);
        }
      }

      proposals = proposals.map((p: any) => {
        const pObj = typeof p.toObject === 'function' ? p.toObject() : { ...p };
        if ((!pObj.task || !pObj.task.taskNo) && pObj.lead) {
          const lId = String(typeof pObj.lead === 'object' ? pObj.lead._id : pObj.lead);
          if (taskByLeadMap.has(lId)) {
            pObj.task = taskByLeadMap.get(lId);
          }
        }
        return pObj;
      });
    }

    // Also populate any tasks from aggregation that need sub-relations populated
    const unpopulatedTaskIds = proposals
      .filter((p: any) => p.task && typeof p.task === 'object' && (!p.task.assignedTo || typeof p.task.assignedTo !== 'object'))
      .map((p: any) => p.task._id)
      .filter(Boolean);

    if (unpopulatedTaskIds.length > 0) {
      const fullyPopulatedTasks = await Task.find({ _id: { $in: unpopulatedTaskIds } })
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .populate('history.fromAssignee', 'name email')
        .populate('history.toAssignee', 'name email')
        .populate('history.performedBy', 'name email')
        .populate('customer', 'name companyName phone email')
        .populate('lead', 'leadId name companyName phone email');

      const taskMap = new Map<string, any>();
      for (const t of fullyPopulatedTasks) {
        taskMap.set(String(t._id), t);
      }

      proposals = proposals.map((p: any) => {
        const pObj = typeof p.toObject === 'function' ? p.toObject() : { ...p };
        if (pObj.task && pObj.task._id && taskMap.has(String(pObj.task._id))) {
          pObj.task = taskMap.get(String(pObj.task._id));
        }
        return pObj;
      });
    }

    // Normalize any legacy proposals returned from find/aggregate
    proposals = proposals.map((p: any) => {
      const pObj = typeof p.toObject === 'function' ? p.toObject() : { ...p };
      if (!pObj.proposalNo && pObj.proposalId) {
        pObj.proposalNo = pObj.proposalId;
      }
      if ((pObj.total === undefined || pObj.total === null) && pObj.amount !== undefined) {
        pObj.total = Number(pObj.amount) || 0;
        pObj.subtotal = Number(pObj.amount) || 0;
      }
      if (!pObj.customerName && typeof pObj.customer === 'string') {
        pObj.customerName = pObj.customer;
      }
      return pObj;
    });

    const pages = Math.max(1, Math.ceil(total / limit));
    res.status(200).json({ success: true, data: proposals, total, pages, page });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findOne({ _id: req.params.id, ...userAccessFilter(req) })
      .populate('customer', 'name phone email address primaryContactInfo companyInfo')
      .populate('lead', 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription status priority')
      .populate('template', 'name title items templateImage templateFooterImage validForDays discount terms companyInfo blocks senderName senderEmail senderPhone')
      .populate('createdBy', 'name email phone')
      .populate({
        path: 'task',
        select: 'taskNo title description taskDate taskType customer lead assignedTo status priority dueDate history createdBy createdAt updatedAt',
        populate: [
          { path: 'createdBy', select: 'name email' },
          { path: 'assignedTo', select: 'name email' },
          { path: 'history.fromAssignee', select: 'name email' },
          { path: 'history.toAssignee', select: 'name email' },
          { path: 'history.performedBy', select: 'name email' },
          { path: 'customer', select: 'name companyName phone email' },
          { path: 'lead', select: 'leadId name companyName phone email' },
        ],
      });
    if (!proposal) {
      res.status(404).json({ success: false, message: 'Proposal not found' });
      return;
    }

    const pObj: any = proposal.toObject();
    if (!pObj.proposalNo && pObj.proposalId) {
      pObj.proposalNo = pObj.proposalId;
    }
    if ((pObj.total === undefined || pObj.total === null) && pObj.amount !== undefined) {
      pObj.total = Number(pObj.amount) || 0;
      pObj.subtotal = Number(pObj.amount) || 0;
    }
    if (!pObj.customerName && typeof pObj.customer === 'string') {
      pObj.customerName = pObj.customer;
    }
    if ((!pObj.blocks || pObj.blocks.length === 0) && (!pObj.items || pObj.items.length === 0)) {
      const itemAmount = Number(pObj.total) || Number(pObj.amount) || 0;
      pObj.items = [
        {
          description: pObj.title || 'Professional Services & Deliverables',
          qty: 1,
          unitPrice: itemAmount,
          total: itemAmount,
        },
      ];
      pObj.blocks = [
        {
          id: 'proposal_items_block',
          type: 'table',
          title: 'Scope of Work & Pricing',
          discountPercent: 0,
          items: [
            {
              id: Date.now(),
              type: 'item',
              no: 1,
              description: pObj.title || 'Professional Services & Deliverables',
              qty: 1,
              unitPrice: itemAmount,
            },
          ],
        },
      ];
    } else if (!pObj.blocks || pObj.blocks.length === 0) {
      pObj.blocks = [
        {
          id: 'proposal_items_block',
          type: 'table',
          title: 'Scope of Work & Pricing',
          discountPercent: 0,
          items: (pObj.items || []).map((it: any, idx: number) => ({
            id: Date.now() + idx,
            type: 'item',
            no: idx + 1,
            description: it.description || '',
            qty: Number(it.qty) || 1,
            unitPrice: Number(it.unitPrice) || 0,
          })),
        },
      ];
    }
    if ((!pObj.task || !pObj.task.taskNo) && pObj.lead) {
      const lId = (proposal.lead as any)._id || proposal.lead;
      if (mongoose.Types.ObjectId.isValid(String(lId))) {
        const taskDoc = await Task.findOne({ lead: lId, isActive: true })
          .populate('createdBy', 'name email')
          .populate('assignedTo', 'name email')
          .populate('history.fromAssignee', 'name email')
          .populate('history.toAssignee', 'name email')
          .populate('history.performedBy', 'name email')
          .populate('customer', 'name companyName phone email')
          .populate('lead', 'leadId name companyName phone email')
          .sort({ createdAt: -1 });
        if (taskDoc) {
          pObj.task = taskDoc;
        }
      }
    } else if ((!pObj.task || !pObj.task.taskNo) && pObj.customer) {
      const custId = (proposal.customer as any)._id || proposal.customer;
      if (mongoose.Types.ObjectId.isValid(String(custId))) {
        const taskDoc = await Task.findOne({ customer: custId, isActive: true, taskType: 'proposal' })
          || await Task.findOne({ customer: custId, isActive: true })
          .populate('createdBy', 'name email')
          .populate('assignedTo', 'name email')
          .populate('customer', 'name companyName phone email')
          .sort({ createdAt: -1 });
        if (taskDoc) {
          pObj.task = taskDoc;
        }
      }
    }

    res.status(200).json({ success: true, data: pObj });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

const normalizeProposalTemplateItems = (rawItems: unknown): Array<{ description: string; qty: number; unitPrice: number; total: number }> =>
  (Array.isArray(rawItems) ? rawItems : [])
    .map((item: any) => {
      const qty = Number(item?.qty) || 1;
      const unitPrice = Number(item?.unitPrice) || 0;
      return {
        description: toStringOrUndefined(item?.description) || '',
        qty,
        unitPrice,
        total: Number(item?.total) || qty * unitPrice,
      };
    })
    .filter((item) => item.description);

let proposalTemplateIndexReady: Promise<void> | null = null;
const ensureProposalTemplateIndexes = () => {
  if (!proposalTemplateIndexReady) {
    proposalTemplateIndexReady = (async () => {
      const indexes = await ProposalTemplate.collection.indexes();
      const sameKeyIndexes = indexes.filter((index) => {
        const key = (index as any).key || {};
        return key.createdBy === 1 && key.name === 1 && Object.keys(key).length === 2;
      });

      const usableIndex = sameKeyIndexes.find((index) => {
        const partial = (index as any).partialFilterExpression;
        return (index as any).unique === true && partial?.isActive === true;
      });

      if (usableIndex) return;

      await Promise.all(
        indexes
          .filter((index) => {
            if (index.name === '_id_') return false;
            const key = (index as any).key || {};
            const isLegacyNameUnique = index.name === 'name_1' && (index as any).unique;
            const isSameKey = key.createdBy === 1 && key.name === 1 && Object.keys(key).length === 2;
            return isLegacyNameUnique || isSameKey;
          })
          .map((index) => ProposalTemplate.collection.dropIndex(String(index.name)).catch(() => undefined))
      );

      await ProposalTemplate.collection.createIndex(
        { createdBy: 1, name: 1 },
        {
          name: 'createdBy_1_name_1_active_unique',
          unique: true,
          partialFilterExpression: { isActive: true },
        }
      );
    })();
  }
  return proposalTemplateIndexReady;
};

export const getProposalTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureProposalTemplateIndexes();
    const { search } = req.query;
    const filter: Record<string, unknown> = { isActive: true, ...userAccessFilter(req) };
    if (typeof search === 'string' && search.trim()) {
      const s = escapeRegExp(search.trim());
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
      ];
    }

    const templates = await ProposalTemplate.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ _id: 1 });
    res.status(200).json({ success: true, data: templates });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

export const getProposalTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureProposalTemplateIndexes();
    const template = await ProposalTemplate.findOne({
      _id: req.params.id,
      isActive: true,
      ...userAccessFilter(req),
    }).populate('createdBy', 'name email role');

    if (!template) {
      res.status(404).json({ success: false, message: 'Proposal template not found' });
      return;
    }
    res.status(200).json({ success: true, data: template });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};


export const createProposalTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureProposalTemplateIndexes();
    const name = toStringOrUndefined(req.body.name);
    const items = normalizeProposalTemplateItems(req.body.items);
    if (!name) {
      res.status(400).json({ success: false, message: 'Template name is required' });
      return;
    }
    // Allow blank templates (items.length === 0) as described in the UI helper text.

    await ProposalTemplate.deleteMany({
      name,
      isActive: { $ne: true },
      ...userAccessFilter(req),
    });

    const template = await ProposalTemplate.create({
      name,
      title: toStringOrUndefined(req.body.title),
      companyInfo: req.body.companyInfo && typeof req.body.companyInfo === 'object' ? req.body.companyInfo : undefined,
      items,
      discount: Number(req.body.discount) || 0,
      terms: toStringOrUndefined(req.body.terms),
      templateImage: toStringOrUndefined(req.body.templateImage),
      templateFooterImage: toStringOrUndefined(req.body.templateFooterImage),
      validForDays: Math.max(1, Number(req.body.validForDays) || 10),
      senderName: toStringOrUndefined(req.body.senderName),
      senderEmail: toStringOrUndefined(req.body.senderEmail),
      senderPhone: toStringOrUndefined(req.body.senderPhone),
      blocks: Array.isArray(req.body.blocks) ? req.body.blocks : undefined,
      overallTotal: req.body.overallTotal && typeof req.body.overallTotal === 'object' ? req.body.overallTotal : undefined,
      status: toStringOrUndefined(req.body.status) || 'active',
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : (req.body.status !== 'inactive'),
      createdBy: req.user?._id,
    });
    res.status(201).json({ success: true, data: template });
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(400).json({ success: false, message: 'A template with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
};

export const updateProposalTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureProposalTemplateIndexes();
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) updates.name = toStringOrUndefined(req.body.name);
    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) updates.title = toStringOrUndefined(req.body.title);
    if (Object.prototype.hasOwnProperty.call(req.body, 'companyInfo')) {
      updates.companyInfo = req.body.companyInfo && typeof req.body.companyInfo === 'object' ? req.body.companyInfo : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'items')) {
      const items = normalizeProposalTemplateItems(req.body.items);
      // Allow blank templates (items.length === 0) as described in the UI helper text.
      updates.items = items;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'discount')) updates.discount = Number(req.body.discount) || 0;
    if (Object.prototype.hasOwnProperty.call(req.body, 'terms')) updates.terms = toStringOrUndefined(req.body.terms);
    if (Object.prototype.hasOwnProperty.call(req.body, 'templateImage')) {
      const val = req.body.templateImage;
      updates.templateImage = (val === null || val === undefined || val === '') ? '' : String(val).trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'templateFooterImage')) {
      const val = req.body.templateFooterImage;
      updates.templateFooterImage = (val === null || val === undefined || val === '') ? '' : String(val).trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'validForDays')) updates.validForDays = Math.max(1, Number(req.body.validForDays) || 10);
    if (Object.prototype.hasOwnProperty.call(req.body, 'senderName')) updates.senderName = toStringOrUndefined(req.body.senderName);
    if (Object.prototype.hasOwnProperty.call(req.body, 'senderEmail')) updates.senderEmail = toStringOrUndefined(req.body.senderEmail);
    if (Object.prototype.hasOwnProperty.call(req.body, 'senderPhone')) updates.senderPhone = toStringOrUndefined(req.body.senderPhone);
    if (Object.prototype.hasOwnProperty.call(req.body, 'blocks')) updates.blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'overallTotal')) updates.overallTotal = req.body.overallTotal;
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const st = toStringOrUndefined(req.body.status) || 'active';
      updates.status = st;
      if (!Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
        updates.isActive = st !== 'inactive';
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
      updates.isActive = Boolean(req.body.isActive);
    }

    const template = await ProposalTemplate.findOneAndUpdate({ _id: req.params.id, ...userAccessFilter(req) }, updates, { new: true, runValidators: true });
    if (!template) {
      res.status(404).json({ success: false, message: 'Proposal template not found' });
      return;
    }
    res.status(200).json({ success: true, data: template });
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(400).json({ success: false, message: 'A template with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
};

export const deleteProposalTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureProposalTemplateIndexes();
    const template = await ProposalTemplate.findOneAndDelete({ _id: req.params.id, ...userAccessFilter(req) });
    if (!template) {
      res.status(404).json({ success: false, message: 'Proposal template not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Proposal template deleted' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const moneyQar = (value: unknown): string => `QAR ${Number(value || 0).toLocaleString('en-US')}`;

const absoluteAssetUrl = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
  const backendOrigin = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/+$/, '');
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const uploadMatch = normalized.replace(/\\/g, '/').match(/(?:^|\/)(uploads\/.+)$/);
  return uploadMatch ? `${backendOrigin}/api/v1/${uploadMatch[1]}` : `${backendOrigin}${normalized}`;
};

const requestBackendOrigin = (req?: AuthRequest): string => {
  const configuredOrigin = process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL;
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/, '');

  const forwardedHost = req?.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = req?.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = forwardedHost || req?.get('host');
  if (host) {
    return `${forwardedProto || req?.protocol || 'http'}://${host}`.replace(/\/+$/, '');
  }
  return `http://localhost:${process.env.PORT || 8080}`;
};

const publicProposalPdfUrl = (proposal: any, backendOrigin = requestBackendOrigin()): string => {
  const proposalId = String(proposal?._id || proposal?.id || '').trim();
  const apiPrefix = process.env.API_PREFIX || (process.env.APP_ENV === 'staging' ? '/staging/api/v1' : '/api/v1');
  const cleanPrefix = apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`;
  return proposalId ? `${backendOrigin}${cleanPrefix}/public/proposals/${encodeURIComponent(proposalId)}/pdf?download=1` : '';
};

// Resolve an uploads reference (path or remote URL) to an on-disk file, mirroring the
// path candidates used by the PDF renderer's base64 resolver.
const resolveLocalUploadPath = (rawPath: string): string | null => {
  try {
    let clean = rawPath;
    if (/^https?:\/\//i.test(rawPath)) {
      try { clean = new URL(rawPath).pathname; } catch { clean = rawPath; }
    }
    clean = clean.replace(/^[/\\]+/, '').replace(/^api\/v1\//, '');
    const uploadRel = clean.match(/(?:^|\/)(uploads\/.+)$/);
    const relativeTarget = uploadRel ? uploadRel[1] : clean;
    const uploadRoot = (process.env.UPLOAD_ROOT_DIR || UPLOAD_ROOT_DIR || '').replace(/[\\/]+$/, '');
    const uploadRootTarget = relativeTarget.replace(/^uploads[\\/]/, '');
    const candidates = [
      ...(uploadRoot ? [
        path.join(uploadRoot, uploadRootTarget),
        path.join(uploadRoot, path.basename(clean)),
        path.join(uploadRoot, 'settings', path.basename(clean)),
        path.join(uploadRoot, 'templates', path.basename(clean)),
      ] : []),
      path.resolve(clean),
      path.resolve(relativeTarget),
      path.join(process.cwd(), clean),
      path.join(process.cwd(), relativeTarget),
      path.join(process.cwd(), 'backend', relativeTarget),
      path.join(process.cwd(), '..', relativeTarget),
      path.join(__dirname, '..', '..', relativeTarget),
      path.join(__dirname, '..', '..', 'uploads', path.basename(clean)),
      path.join(process.cwd(), 'uploads', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', path.basename(clean)),
      path.join(__dirname, '..', '..', 'uploads', 'settings', path.basename(clean)),
      path.join(process.cwd(), 'uploads', 'settings', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', 'settings', path.basename(clean)),
      path.join(__dirname, '..', '..', 'uploads', 'templates', path.basename(clean)),
      path.join(process.cwd(), 'uploads', 'templates', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', 'templates', path.basename(clean)),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  } catch { /* ignore */ }
  return null;
};

// Turn an image reference into a value usable in an email body. When an attachments list
// is supplied we embed the image as an inline CID attachment (the only reliable way to show
// banners across clients — Gmail blocks both unreachable/localhost URLs and data: URIs in the
// body). Falls back to an absolute URL when the file cannot be found locally.
const resolveEmailAsset = (
  rawPath?: string,
  cidName = 'asset',
  defaultFilename = 'banner',
  attachmentsList?: any[]
): string => {
  if (!rawPath) return '';
  const str = String(rawPath).trim();
  if (!str) return '';

  if (Array.isArray(attachmentsList)) {
    const dataMatch = str.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (dataMatch) {
      const mime = dataMatch[1].toLowerCase();
      const ext = mime.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      const cid = `${cidName}-${attachmentsList.length}@welcometech`;
      attachmentsList.push({
        filename: `${defaultFilename}.${ext}`,
        content: Buffer.from(dataMatch[2], 'base64'),
        cid,
        contentDisposition: 'inline',
        contentType: mime,
      });
      return `cid:${cid}`;
    }
    const localPath = resolveLocalUploadPath(str);
    if (localPath) {
      const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'png';
      const cid = `${cidName}-${attachmentsList.length}@welcometech`;
      attachmentsList.push({ filename: `${defaultFilename}.${ext}`, path: localPath, cid, contentDisposition: 'inline' });
      return `cid:${cid}`;
    }
  }

  if (str.startsWith('data:')) return str;
  if (/^https?:\/\//i.test(str)) return str;
  return absoluteAssetUrl(str);
};

const dateLabel = (value: unknown): string => {
  const d = new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const proposalRecipientEmail = (entity: any, fallback?: string): string => {
  const email = String(
    fallback ||
    entity?.email ||
    entity?.primaryContactInfo?.email ||
    ''
  ).trim();
  return email;
};

const cleanMsoJunk = (val?: string): string => {
  if (!val) return '';
  let s = String(val);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?o:[^>]*>/gi, '');
  s = s.replace(/<\/?mso:[^>]*>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<xml[\s\S]*?<\/xml>/gi, '');
  if (/<(table|tr|td|th|tbody|thead)[^>]*>/i.test(s)) {
    s = s
      .replace(/<\/td>\s*<td[^>]*>/gi, ' | ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  } else {
    s = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  return s;
};

const sanitizeEmailRichContent = (htmlContent: string): string => {
  if (!htmlContent) return '';
  let s = cleanWordArtifacts(String(htmlContent));
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?o:[^>]*>/gi, '');
  s = s.replace(/<\/?mso:[^>]*>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<xml[\s\S]*?<\/xml>/gi, '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Normalize colon pseudo-tables into structured tabular column tables
  s = normalizeColonTableToTabular(s);

  // Grid tables already carry their full inline styling (brand header, zebra rows) – keep them exactly as in the PDF
  const gridTables: string[] = [];
  s = s.replace(/<table\b[^>]*quote-grid-table[^>]*>[\s\S]*?<\/table>/gi, (m) => {
    gridTables.push(m);
    return `__GRID_TABLE_${gridTables.length - 1}__`;
  });

  // 1. Style specs-table with fixed table layout and colgroup for email
  s = s.replace(/<table([^>]*?(?:specs-table|data-type=["']specs["'])[^>]*)>/gi, (m, attrs) => {
    return `<table style="width:100%;table-layout:fixed;border-collapse:collapse;margin:8px 0;font-size:12.5px;text-align:left;" ${attrs}><colgroup><col style="width:190px;"><col style="width:25px;"><col></colgroup>`;
  });

  // 2. Non-specs tables & quote-grid-table
  s = s.replace(/<table(?![^>]*?(?:specs-table|data-type=["']specs["']))\b([^>]*)>/gi, '<table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:12.5px; border:1px solid #e5e7eb; background:#ffffff; text-align:left;" $1>');
  s = s.replace(/<th\b([^>]*)>/gi, '<th style="padding:8px 12px; background:#f8fafc; border:1px solid #e5e7eb; font-weight:700; color:#1e293b; text-align:left;" $1>');
  s = s.replace(/<td(?![^>]*?(?:width:\s*190px|width:\s*25px))\b([^>]*)>/gi, '<td style="padding:8px 12px; border:1px solid #e5e7eb; color:#334155; vertical-align:top; text-align:left;" $1>');
  s = s.replace(/__GRID_TABLE_(\d+)__/g, (_m, i) => gridTables[Number(i)] || '');
  return s;
};

export const buildProposalEmailHtml = (
  proposal: any,
  entity: any,
  settings: any,
  recipientEmail?: string,
  customBody?: string,
  defaultTemplate?: any,
  attachmentsList?: any[],
  includeProposalBody = true,
  pdfDownloadUrl?: string,
  ccEmail?: string | string[]
): string => {
  const brand = settings?.brandColor || '#6d28d9';
  const cur = settings?.currency || 'QAR';
  const companyName = escapeHtml(settings?.companyName || 'WelcomeTech Qatar');
  const website = escapeHtml(settings?.website || '');
  const customerName = escapeHtml(
    proposal.customerName ||
    entity?.companyName ||
    (entity as any)?.companyInfo?.customerName ||
    (entity as any)?.companyInfo?.name ||
    entity?.name ||
    proposal.customerDetails?.companyName ||
    'Valued Customer'
  );
  const customerContact = escapeHtml(
    proposal.customerContactPerson ||
    proposal.customerDetails?.contactName ||
    proposal.customerDetails?.contactPerson ||
    (entity as any)?.contact ||
    (entity as any)?.primaryContactInfo?.contactName1 ||
    (entity as any)?.keyContacts?.[0]?.contactName ||
    ((entity as any)?.companyName ? (entity as any)?.name : '') ||
    ''
  );
  const customerEmail = escapeHtml(
    proposal.customerEmail ||
    recipientEmail ||
    proposalRecipientEmail(entity, proposal.customerEmail) ||
    ''
  );
  const customerPhone = escapeHtml(
    proposal.customerPhone ||
    entity?.phone ||
    entity?.primaryContactInfo?.mobile ||
    proposal.customerDetails?.phone ||
    ''
  );
  const customerAddress = escapeHtml(
    proposal.customerAddress ||
    entity?.address ||
    entity?.fullAddress ||
    entity?.companyInfo?.fullAddress ||
    proposal.customerDetails?.addressLine1 ||
    ''
  );
  const rawCc = ccEmail !== undefined ? ccEmail : proposal?.cc;
  const customerCc = escapeHtml(Array.isArray(rawCc) ? rawCc.join(', ') : String(rawCc || '')).trim();

  const propTemplate = (proposal.template && typeof proposal.template === 'object' && proposal.template.name)
    ? proposal.template
    : null;
  const effectiveTemplate = propTemplate || defaultTemplate;

  const rawHeader = includeProposalBody
    ? ((proposal.templateImage && String(proposal.templateImage).trim()) ||
       (effectiveTemplate?.templateImage && String(effectiveTemplate.templateImage).trim()) ||
       (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
       '')
    : '';
  const rawFooter = includeProposalBody
    ? ((proposal.templateFooterImage && String(proposal.templateFooterImage).trim()) ||
       (effectiveTemplate?.templateFooterImage && String(effectiveTemplate.templateFooterImage).trim()) ||
       (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
       '')
    : '';

  const templateImageUrl = resolveEmailAsset(rawHeader, 'proposal-header-banner', 'header-banner', attachmentsList);
  const templateFooterImageUrl = resolveEmailAsset(rawFooter, 'proposal-footer-banner', 'footer-banner', attachmentsList);

  const templateImageHtml = templateImageUrl ? `
          <div style="width:100%; max-width:100%; margin:0; overflow:hidden; background:#ffffff; text-align:center;">
            <img src="${templateImageUrl}" alt="Header Banner" style="display:block; width:100%; height:auto; border:0; border-radius:0;" />
          </div>
  ` : '';

  const templateFooterImageHtml = templateFooterImageUrl ? `
          <div style="width:100%; max-width:100%; margin:24px 0 0 0; overflow:hidden; background:#ffffff; text-align:center;">
            <img src="${templateFooterImageUrl}" alt="Footer Banner" style="display:block; width:100%; height:auto; border:0; border-radius:0;" />
          </div>
  ` : '';

  const cleanedCustomBody = cleanMsoJunk(customBody || '');
  const customBodyHtml = cleanedCustomBody ? `
    <div style="padding:14px 18px; background:#f8fafc; border-left:4px solid ${brand}; border-radius:6px; margin-bottom:22px; font-size:14px; color:#334155; line-height:1.6; text-align:left;">
      ${escapeHtml(cleanedCustomBody).replace(/\n/g, '<br/>')}
    </div>
  ` : '';

  // ---- Formatting kept byte-for-byte identical to the PDF renderer (buildProposalFullHtml) ----
  const esc = (v: any) => escapeHtml(String(v ?? ''));
  const money = (n: number) => `${cur} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const discount = Number(proposal.discount) || 0;

  const company = {
    name: proposal.companyInfo?.name || settings?.companyName || 'Welcome Trading Co. W.L.L',
    a1: proposal.companyInfo?.addressLine1 || settings?.address || '',
    a2: proposal.companyInfo?.addressLine2 || settings?.country || '',
    phone: proposal.companyInfo?.contactNo || settings?.phone || '+97466032346',
    email: proposal.companyInfo?.email || settings?.email || 'sales@welcometech.qa',
  };
  const effectiveSenderEmail =
    proposal.senderEmail ||
    proposal.quotationDetails?.senderEmail ||
    (proposal.createdBy as any)?.email ||
    company.email ||
    'sales@welcometech.qa';
  const effectiveSenderPhone =
    proposal.senderPhone ||
    proposal.quotationDetails?.senderPhone ||
    (proposal.createdBy as any)?.phone ||
    company.phone ||
    '+97466032346';
  const quoteNo = proposal.proposalNo || proposal.quotationDetails?.quoteNo || settings?.proposalNo || 'QUOTATION';

  // Column proportions mirror the PDF colgroup (38/auto/50/115/155 over ~673px) expressed
  // as percentages, so a fixed-layout email table lands the columns in the same relative
  // positions regardless of the client's rendered width. They sum to 100% to avoid the
  // fixed-px-vs-100%-width conflict that skewed the old layout.
  const COL = { no: '6%', desc: '46%', qty: '8%', unit: '17%', amt: '23%' };

  const blockTableTotal = (block: any) => {
    const rows = Array.isArray(block?.items) ? block.items : [];
    const sub = rows.reduce((a: number, it: any) => it?.type !== 'detail' ? a + (Number(it?.qty) || 0) * (Number(it?.unitPrice) || 0) : a, 0);
    const dv = block?.discountPercent;
    const disc = Number(dv !== undefined && dv !== null && dv !== '' ? dv : discount) || 0;
    return { sub, disc, total: sub - sub * disc / 100 };
  };

  const renderEmailTable = (block: any) => {
    const rows = Array.isArray(block?.items) ? block.items : [];
    let n = 0;
    const rowsHtml = rows.map((it: any) => {
      if (it?.type === 'detail') {
        return `
              <tr style="background:#f8fafc;">
                <td width="${COL.no}" style="width:${COL.no}; padding:7px 8px; border-bottom:1px solid #e2e8f0;"></td>
                <td width="${COL.desc}" style="width:${COL.desc}; padding:7px 10px; border-bottom:1px solid #e2e8f0; font-size:12.5px; color:#64748b; text-align:left; word-break:break-word; vertical-align:top;">${esc(cleanMsoJunk(it?.description))}</td>
                <td width="${COL.qty}" style="width:${COL.qty}; padding:7px 6px; border-bottom:1px solid #e2e8f0;"></td>
                <td width="${COL.unit}" style="width:${COL.unit}; padding:7px 8px; border-bottom:1px solid #e2e8f0;"></td>
                <td width="${COL.amt}" style="width:${COL.amt}; padding:7px 10px; border-bottom:1px solid #e2e8f0;"></td>
              </tr>`;
      }
      n += 1;
      const qty = Number(it?.qty) || 0;
      const price = Number(it?.unitPrice) || 0;
      const rowTotal = qty * price;
      return `
              <tr>
                <td width="${COL.no}" style="width:${COL.no}; padding:9px 8px; border-bottom:1px solid #e2e8f0; text-align:center; font-size:12.5px; color:#64748b; font-weight:600; vertical-align:top;">${n}</td>
                <td width="${COL.desc}" style="width:${COL.desc}; padding:9px 10px; border-bottom:1px solid #e2e8f0; font-size:12.5px; font-weight:600; color:#0f172a; text-align:left; word-break:break-word; overflow-wrap:anywhere; vertical-align:top;">${esc(cleanMsoJunk(it?.description))}</td>
                <td width="${COL.qty}" style="width:${COL.qty}; padding:9px 6px; border-bottom:1px solid #e2e8f0; text-align:center; font-size:12.5px; vertical-align:top;">${qty}</td>
                <td width="${COL.unit}" style="width:${COL.unit}; padding:9px 10px; border-bottom:1px solid #e2e8f0; text-align:right; font-size:12.5px; vertical-align:top; white-space:nowrap;">${price > 0 ? price.toFixed(2) : '<span style="color:#94a3b8;">&mdash;</span>'}</td>
                <td width="${COL.amt}" style="width:${COL.amt}; padding:9px 10px; border-bottom:1px solid #e2e8f0; text-align:right; font-size:12.5px; font-weight:700; vertical-align:top; white-space:nowrap;">${rowTotal > 0 ? rowTotal.toFixed(2) : '<span style="display:inline-block; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:2px 7px; border-radius:5px; font-size:11px; font-weight:800; letter-spacing:0.04em;">FREE</span>'}</td>
              </tr>`;
    }).join('');
    const { sub, disc, total } = blockTableTotal(block);
    return `
          <div style="margin-top:20px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
            ${block?.title ? `<div style="padding:10px 14px; background:#f8fafc; font-size:13px; font-weight:800; color:#0f172a; border-bottom:1px solid #e2e8f0; text-align:left;">${esc(block.title)}</div>` : ''}
            <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px;">
              <colgroup>
                <col style="width:${COL.no};" />
                <col style="width:${COL.desc};" />
                <col style="width:${COL.qty};" />
                <col style="width:${COL.unit};" />
                <col style="width:${COL.amt};" />
              </colgroup>
              <thead>
                <tr style="background:${brand}; color:#ffffff;">
                  <th width="${COL.no}" style="width:${COL.no}; padding:9px 8px; text-align:center; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">No</th>
                  <th width="${COL.desc}" style="width:${COL.desc}; padding:9px 10px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Description</th>
                  <th width="${COL.qty}" style="width:${COL.qty}; padding:9px 6px; text-align:center; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Qty</th>
                  <th width="${COL.unit}" style="width:${COL.unit}; padding:9px 8px; text-align:right; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Unit Price (${cur})</th>
                  <th width="${COL.amt}" style="width:${COL.amt}; padding:9px 10px; text-align:right; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Amount (${cur})</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                ${disc > 0 ? `
                <tr style="background:#f8fafc;">
                  <td colspan="4" style="text-align:right; padding:7px 12px; font-weight:600; color:#64748b; font-size:12.5px; border-top:2px solid #e2e8f0;">Subtotal:</td>
                  <td style="text-align:right; padding:7px 12px; font-weight:700; color:#0f172a; font-size:12.5px; border-top:2px solid #e2e8f0; white-space:nowrap;">${money(sub)}</td>
                </tr>
                <tr style="background:#f8fafc;">
                  <td colspan="4" style="text-align:right; padding:5px 12px; font-weight:700; color:#dc2626; font-size:12.5px;">Discount (${disc}%):</td>
                  <td style="text-align:right; padding:5px 12px; font-weight:700; color:#dc2626; font-size:12.5px; white-space:nowrap;">-${money(sub * disc / 100)}</td>
                </tr>
                ` : ''}
                <tr style="background:#f8fafc;">
                  <td colspan="4" style="text-align:right; padding:9px 12px; font-weight:800; color:#0f172a; font-size:13px; border-top:${disc > 0 ? '1px' : '2px'} solid #e2e8f0;">Table Total:</td>
                  <td style="text-align:right; padding:9px 12px; font-weight:900; color:${brand}; font-size:15px; border-top:${disc > 0 ? '1px' : '2px'} solid #e2e8f0; white-space:nowrap;">${money(total)}</td>
                </tr>
                <tr style="background:#ffffff;">
                  <td colspan="5" style="padding:7px 12px; font-size:12px; color:#475569; font-style:italic; border-top:1px dashed #e2e8f0; text-align:left;">
                    <span style="font-weight:700; color:#0f172a; font-style:normal; margin-right:6px;">Amount in Words:</span>${esc(amountToWords(total, settings?.country || 'QA'))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>`;
  };

  const renderEmailText = (block: any) => `
          <div style="margin-top:20px; padding:16px 18px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; text-align:left;">
            ${block?.title ? `<div style="font-size:14px; font-weight:800; color:${brand}; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em; text-align:left;">${esc(block.title)}</div>` : ''}
            <div style="font-size:13.5px; color:#334155; line-height:1.65; text-align:left;">${sanitizeEmailRichContent(block?.content || '')}</div>
          </div>`;

  // Block assembly mirrors buildProposalFullHtml exactly: legacy flat items collapse into a
  // single table block, and Terms & Conditions are auto-appended as a text block.
  const legacyItems = (proposal.items || []).filter((it: any) => (it?.description || '').trim());
  const formatTableItems = (list: any[]) => list.map((it: any, i: number) => ({
    id: it.id || i + 1,
    type: it.type || 'item',
    no: it.no || i + 1,
    description: it.description || '',
    qty: Number(it.qty) || 1,
    unitPrice: Number(it.unitPrice) || 0,
    total: Number(it.total) || ((Number(it.qty) || 1) * (Number(it.unitPrice) || 0)),
  }));

  let rawBlocks: any[] = Array.isArray(proposal.blocks) ? [...proposal.blocks] : [];
  const hasPopulatedTable = rawBlocks.some(
    (b: any) => b?.type === 'table' && Array.isArray(b?.items) && b.items.filter((it: any) => it?.type !== 'detail' && (it?.description || '').trim()).length > 0
  );

  if (!hasPopulatedTable && legacyItems.length > 0) {
    const emptyTableIdx = rawBlocks.findIndex((b: any) => b?.type === 'table');
    const tableItems = formatTableItems(legacyItems);
    if (emptyTableIdx >= 0) {
      rawBlocks[emptyTableIdx] = {
        ...rawBlocks[emptyTableIdx],
        items: tableItems,
        discountPercent: rawBlocks[emptyTableIdx].discountPercent !== undefined ? rawBlocks[emptyTableIdx].discountPercent : discount,
      };
    } else {
      rawBlocks.push({
        id: 'pricing_table_block',
        type: 'table',
        title: proposal.title || 'Scope of Work & Pricing',
        discountPercent: discount,
        items: tableItems,
      });
    }
  } else if (rawBlocks.length === 0 && legacyItems.length > 0) {
    rawBlocks = [{
      id: 'legacy',
      type: 'table',
      title: proposal.title || 'Scope of Work & Pricing',
      discountPercent: discount,
      items: formatTableItems(legacyItems),
    }];
  }

  const allBlocks: any[] = [...rawBlocks];
  if (proposal.terms && !rawBlocks.some((b: any) => b?.type === 'text')) {
    allBlocks.push({ id: 'terms_block', type: 'text', title: 'Terms & Conditions', content: String(proposal.terms).replace(/\n/g, '<br />') });
  }

  const tableBlocks = allBlocks.filter((b: any) => b?.type === 'table');
  const grandTotal = proposal.total !== undefined && proposal.total !== null
    ? Number(proposal.total)
    : tableBlocks.reduce((acc: number, b: any) => acc + blockTableTotal(b).total, 0);

  const otConfig = proposal.overallTotal || {};
  const isOverallVisible = Boolean(otConfig?.show === true);

  const overallTitle = String(otConfig.label || 'Overall Quotation Total:').trim();
  const overallNotes = otConfig.notes ? String(otConfig.notes).trim() : '';
  const showWords = otConfig.showWords !== false;

  const overallTotalHtml = isOverallVisible ? `
          <div style="margin-top:18px; padding:14px 18px; background:#f8fafc; border-radius:10px; border:2px solid ${brand}; display:flex; justify-content:space-between; align-items:flex-end; gap:16px;">
            <div style="font-size:12px; color:#475569; text-align:left; max-width:55%;">
              ${overallNotes ? `<div style="font-weight:600; color:#334155; white-space:pre-line;">${esc(overallNotes)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px; font-weight:900; color:#0f172a;">
                <span>${esc(overallTitle)} </span>
                <span style="color:${brand}; font-family:monospace; font-size:18px;">${money(grandTotal)}</span>
              </div>
              ${showWords ? `
              <div style="font-size:12px; color:#475569; font-style:italic; margin-top:4px;">
                <span style="font-weight:700; color:#0f172a; font-style:normal; margin-right:6px;">Amount in Words:</span>${esc(amountToWords(grandTotal, settings?.country || 'QA'))}
              </div>` : ''}
            </div>
          </div>` : '';

  const pdfDownloadBarHtml = (pdfDownloadUrl && includeProposalBody) ? `
          <div style="margin-top:22px; padding:14px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; text-align:center;">
            <a href="${escapeHtml(pdfDownloadUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background:${brand}; color:#ffffff; text-decoration:none; font-size:13px; font-weight:800; padding:10px 20px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
              📄 Download Official Proposal PDF
            </a>
          </div>` : '';

  const bodyContentHtml = allBlocks.length
    ? allBlocks.map((b: any) => b?.type === 'text' ? renderEmailText(b) : renderEmailTable(b)).join('')
    : `<div style="padding:40px; text-align:center; color:#94a3b8; font-style:italic; border:2px dashed #e2e8f0; border-radius:12px; margin-top:20px;">No content in this quotation yet.</div>`;

  const attachmentNoticeHtml = `
          <div style="margin-top:20px; padding:16px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; text-align:left;">
            <div style="font-size:14px; font-weight:800; color:#0f172a; margin-bottom:6px;">Proposal ready for review</div>
            <div style="font-size:13.5px; color:#475569; line-height:1.6;">
              Please review the quotation summary and download the full PDF for complete scope, pricing, terms, and requirements.
            </div>
            ${pdfDownloadUrl ? `
              <div style="margin-top:14px;">
                <a href="${escapeHtml(pdfDownloadUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background:${brand}; color:#ffffff; text-decoration:none; font-size:13px; font-weight:800; padding:10px 14px; border-radius:6px;">
                  Download as PDF
                </a>
              </div>
            ` : ''}
          </div>`;

  // Letterhead only shows when there is no header banner image (mirrors the PDF).
  const letterheadHtml = !templateImageUrl ? `
          <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:18px;">
            <tr>
              <td style="vertical-align:top; text-align:left;">
                <div style="font-size:20px; color:${brand}; font-weight:800; margin-bottom:4px;">${esc(company.name)}</div>
                ${company.a1 ? `<div style="font-size:12.5px; color:#475569; margin-bottom:2px;">${esc(company.a1)}</div>` : ''}
                ${company.a2 ? `<div style="font-size:12.5px; color:#475569; margin-bottom:2px;">${esc(company.a2)}</div>` : ''}
                ${company.phone ? `<div style="font-size:12.5px; color:#64748b; margin-top:2px;"><b style="color:#64748b; font-weight:600;">Phone:</b> ${esc(company.phone)}</div>` : ''}
                ${company.email ? `<div style="font-size:12.5px; color:#64748b;"><b style="color:#64748b; font-weight:600;">Email:</b> ${esc(company.email)}</div>` : ''}
              </td>
              <td style="vertical-align:top; text-align:right;">
                <div style="font-size:20px; font-weight:900; color:#0f172a; letter-spacing:0.06em;">QUOTATION</div>
                <div style="font-size:13px; color:${brand}; font-weight:700; margin-top:4px;">${esc(quoteNo)}</div>
              </td>
            </tr>
          </table>
          <div style="border-top:1px solid #e2e8f0; margin:0 0 18px;"></div>
  ` : '';

  return `
    <div style="margin:0; padding:32px 16px; background:#f3f4f8; font-family:'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#111827; text-align:left;">
      <div style="max-width:760px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.04); text-align:left;">

        ${templateImageHtml}

        <div style="padding:26px 32px; text-align:left;">
          ${customBodyHtml}

          ${letterheadHtml}

          <!-- Recipient & Document Specifications: equal-width fixed cards (mirrors the PDF grid) -->
          <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="width:100%; table-layout:fixed; border-collapse:separate; margin-bottom:20px;">
            <colgroup>
              <col style="width:49%;" />
              <col style="width:2%;" />
              <col style="width:49%;" />
            </colgroup>
            <tr>
              <td style="vertical-align:top; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
                <div style="font-size:11px; font-weight:800; color:${brand}; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                  👤 Recipient Information
                </div>
                <div style="font-size:14px; font-weight:800; color:#0f172a; margin-bottom:4px;">${customerName || 'Valued Client'}</div>
                ${customerAddress ? `<div style="font-size:12px; color:#64748b; margin-bottom:6px;">${customerAddress}</div>` : ''}
                <table cellpadding="0" cellspacing="0" style="font-size:12.5px; margin-top:6px;">
                  ${customerContact ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding-right:8px; width:90px; vertical-align:top;">Contact Name</td>
                      <td style="color:#64748b; font-weight:700; padding-right:8px; text-align:center; width:10px; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700;">${customerContact}</td>
                    </tr>
                  ` : ''}
                  ${customerPhone ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:${customerContact ? '4px 8px 0 0' : '0 8px 0 0'}; width:90px; vertical-align:top;">Phone</td>
                      <td style="color:#64748b; font-weight:700; padding:${customerContact ? '4px 8px 0 0' : '0 8px 0 0'}; text-align:center; width:10px; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700; padding-top:${customerContact ? '4px' : '0'};">${customerPhone}</td>
                    </tr>
                  ` : ''}
                  ${customerEmail ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; width:90px; vertical-align:top;">Email</td>
                      <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; width:10px; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700; padding-top:4px;">${customerEmail}</td>
                    </tr>
                  ` : ''}
                  ${customerCc ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; width:90px; vertical-align:top;">CC</td>
                      <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; width:10px; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700; padding-top:4px;">${customerCc}</td>
                    </tr>
                  ` : ''}
                </table>
              </td>
              <td></td>
              <td style="vertical-align:top; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
                <div style="font-size:11px; font-weight:800; color:${brand}; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
                  📄 Document Specifications
                </div>
                <table cellpadding="0" cellspacing="0" style="font-size:12.5px;">
                  <tr>
                    <td style="color:#64748b; font-weight:600; padding-right:8px; width:105px; vertical-align:top;">Quotation No</td>
                    <td style="color:#64748b; font-weight:700; padding-right:8px; text-align:center; width:10px; vertical-align:top;">:</td>
                    <td style="color:${brand}; font-weight:800; font-family:monospace;">${esc(quoteNo)}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Quote Date</td>
                    <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                    <td style="color:#0f172a; font-weight:700; padding-top:4px;">${dateLabel(proposal.quoteDate || proposal.createdAt || new Date())}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Validity Period</td>
                    <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                    <td style="color:#0f172a; font-weight:700; padding-top:4px;">${proposal.validForDays || 10} Days</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Valid Until</td>
                    <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                    <td style="color:#0f172a; font-weight:700; padding-top:4px;">${dateLabel(proposal.validUntil)}</td>
                  </tr>
                  ${effectiveSenderEmail ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Sender Email</td>
                      <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700; padding-top:4px;">${esc(effectiveSenderEmail)}</td>
                    </tr>
                  ` : ''}
                  ${effectiveSenderPhone ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Contact No</td>
                      <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                      <td style="color:#0f172a; font-weight:700; padding-top:4px;">${esc(effectiveSenderPhone)}</td>
                    </tr>
                  ` : ''}
                  ${discount > 0 ? `
                    <tr>
                      <td style="color:#64748b; font-weight:600; padding:4px 8px 0 0; vertical-align:top;">Overall Discount</td>
                      <td style="color:#64748b; font-weight:700; padding:4px 8px 0 0; text-align:center; vertical-align:top;">:</td>
                      <td style="color:#dc2626; font-weight:800; padding-top:4px;">${discount}%</td>
                    </tr>
                  ` : ''}
                </table>
              </td>
            </tr>
          </table>

          ${includeProposalBody ? `${bodyContentHtml}${overallTotalHtml}${pdfDownloadBarHtml}` : attachmentNoticeHtml}
        </div>

        ${templateFooterImageHtml}
      </div>
    </div>
  `;
};

const buildProposalPrintableHtml = (
  proposal: any,
  entity: any,
  settings: any,
  defaultTemplate?: any
): string => {
  const companyName = escapeHtml(settings?.companyName || 'Welcome Trading Co. W.L.L');
  const website = escapeHtml(settings?.website || '');
  const customerName = escapeHtml(
    proposal.customerName ||
    entity?.companyName ||
    (entity as any)?.companyInfo?.customerName ||
    (entity as any)?.companyInfo?.name ||
    entity?.name ||
    proposal.customerDetails?.companyName ||
    'Valued Customer'
  );
  const customerEmail = escapeHtml(
    proposal.customerEmail ||
    proposalRecipientEmail(entity, proposal.customerEmail) ||
    ''
  );
  const customerPhone = escapeHtml(
    proposal.customerPhone ||
    entity?.phone ||
    entity?.primaryContactInfo?.mobile ||
    proposal.customerDetails?.phone ||
    ''
  );
  const customerAddress = escapeHtml(
    proposal.customerAddress ||
    entity?.address ||
    entity?.fullAddress ||
    entity?.companyInfo?.fullAddress ||
    proposal.customerDetails?.addressLine1 ||
    ''
  );
  const terms = escapeHtml(proposal.terms || '').replace(/\n/g, '<br />');

  const propTemplate = (proposal.template && typeof proposal.template === 'object' && proposal.template.name) ? proposal.template : null;
  const effectiveTemplate = propTemplate || defaultTemplate;

  const rawHeader =
    (proposal.templateImage && String(proposal.templateImage).trim()) ||
    (effectiveTemplate?.templateImage && String(effectiveTemplate.templateImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    '';
  const rawFooter =
    (proposal.templateFooterImage && String(proposal.templateFooterImage).trim()) ||
    (effectiveTemplate?.templateFooterImage && String(effectiveTemplate.templateFooterImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    '';
  const rawLogo = settings?.logo;
  const watermarkUrl = absoluteAssetUrl(settings?.proposalWatermark || settings?.logo);

  const headerImageUrl = absoluteAssetUrl(rawHeader);
  const footerImageUrl = absoluteAssetUrl(rawFooter);
  const logoUrl = absoluteAssetUrl(rawLogo);

  const itemsHtml = (proposal.items || []).map((item: any, idx: number) => `
    <tr>
      <td style="width:6%; text-align:center; padding:11px 8px; border-bottom:1px solid #e2e8f0; font-size:13px;">${idx + 1}</td>
      <td style="width:54%; text-align:left; padding:11px 12px; border-bottom:1px solid #e2e8f0; font-size:13px; white-space:pre-line;">${escapeHtml(item.description)}</td>
      <td style="width:10%; text-align:center; padding:11px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; font-weight:600;">${escapeHtml(item.qty)}</td>
      <td style="width:15%; text-align:right; padding:11px 10px; border-bottom:1px solid #e2e8f0; font-size:13px;">${moneyQar(item.unitPrice)}</td>
      <td style="width:15%; text-align:right; padding:11px 10px; border-bottom:1px solid #e2e8f0; font-size:13px; font-weight:700;">${moneyQar(item.total)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Quotation ${escapeHtml(proposal.proposalNo || 'Proposal')}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body {
          font-family: 'Plus Jakarta Sans', Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 0;
          background: #f8fafc;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .action-bar {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          background: #0f172a;
          color: #ffffff;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .btn-print {
          background: #6d28d9;
          color: #ffffff;
          border: none;
          font-size: 14px;
          font-weight: 700;
          padding: 10px 22px;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 2px 6px rgba(109,40,217,0.4);
        }
        .btn-print:hover { background: #5b21b6; }
        .page-sheet {
          max-width: 860px;
          margin: 24px auto 40px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.06);
          overflow: hidden;
          position: relative;
        }
        .watermark {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0.05;
          z-index: 0;
        }
        .watermark img { max-width: 50vw; max-height: 50vh; object-fit: contain; }
        .content { position: relative; z-index: 1; padding: 24px 36px 36px; }
        .banner-header img, .banner-footer img { width: 100%; height: auto; display: block; }
        table { width: 100%; border-collapse: collapse; }
        @media print {
          .action-bar { display: none !important; }
          body { background: #ffffff !important; }
          .page-sheet { margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; }
        }
      </style>
    </head>
    <body>
      <div class="action-bar">
        <div style="font-weight: 800; font-size: 16px; letter-spacing: 0.03em;">WelcomeTech Proposal Viewer</div>
        <button class="btn-print" onclick="window.print()">
          🖨️ Print / Save as PDF
        </button>
      </div>

      ${watermarkUrl ? `<div class="watermark"><img src="${watermarkUrl}" alt="Watermark" /></div>` : ''}

      <div class="page-sheet">
        ${headerImageUrl ? `<div class="banner-header"><img src="${headerImageUrl}" alt="Header Banner" /></div>` : ''}
        
        <div class="content">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #6d28d9;">
            <div>
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height:44px; max-width:180px; object-fit:contain; margin-bottom:6px;" />` : ''}
              <div style="font-size:22px; font-weight:900; color:#0f172a;">${companyName}</div>
              ${website ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${website}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div style="font-size:12px; font-weight:800; color:#6d28d9; letter-spacing:0.08em; text-transform:uppercase;">Official Quotation</div>
              <div style="font-size:18px; font-weight:900; color:#0f172a; margin-top:4px;">${escapeHtml(proposal.proposalNo || 'QUOTATION')}</div>
              <div style="font-size:12px; color:#64748b; margin-top:4px;">Date: ${dateLabel(proposal.createdAt || new Date())}</div>
              <div style="font-size:12px; color:#64748b;">Valid Until: ${dateLabel(proposal.validUntil)}</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; gap:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px 20px; margin-bottom:26px;">
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:800; color:#6d28d9; text-transform:uppercase; margin-bottom:6px;">Prepared For (Client)</div>
              <div style="font-size:16px; font-weight:800; color:#0f172a;">${customerName}</div>
              ${customerAddress ? `<div style="font-size:12.5px; color:#475569; margin-top:3px;">${customerAddress}</div>` : ''}
              ${customerPhone ? `<div style="font-size:12.5px; color:#475569; margin-top:2px;">Tel: ${customerPhone}</div>` : ''}
              ${customerEmail ? `<div style="font-size:12.5px; color:#475569; margin-top:2px;">Email: ${customerEmail}</div>` : ''}
            </div>
          </div>

          <div style="font-size:16px; font-weight:800; color:#0f172a; margin-bottom:12px;">Scope of Work & Commercial Terms</div>

          <table style="margin-bottom:20px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
            <thead>
              <tr style="background:#6d28d9; color:#ffffff;">
                <th style="padding:11px 8px; font-size:12px; text-align:center;">No</th>
                <th style="padding:11px 12px; font-size:12px; text-align:left;">Description</th>
                <th style="padding:11px 8px; font-size:12px; text-align:center;">Qty</th>
                <th style="padding:11px 10px; font-size:12px; text-align:right;">Unit Price</th>
                <th style="padding:11px 10px; font-size:12px; text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="display:flex; justify-content:flex-end; margin-bottom:28px;">
            <div style="min-width:280px; text-align:right; padding:12px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
              <div style="font-size:13px; color:#475569; margin-bottom:4px;">Subtotal: <strong>${moneyQar(proposal.subtotal)}</strong></div>
              ${Number(proposal.discount || 0) > 0 ? `<div style="font-size:13px; color:#475569; margin-bottom:4px;">Discount: <strong>${Number(proposal.discount)}%</strong></div>` : ''}
              <div style="font-size:20px; font-weight:900; color:#6d28d9; margin-top:6px; border-top:1.5px solid #e2e8f0; padding-top:6px;">Grand Total: ${moneyQar(proposal.total)}</div>
            </div>
          </div>

          ${terms ? `
            <div style="margin-top:20px; padding:16px 20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
              <div style="font-size:12px; font-weight:800; color:#0f172a; text-transform:uppercase; margin-bottom:8px;">Terms & Conditions</div>
              <div style="font-size:12.5px; color:#475569; line-height:1.7;">${terms}</div>
            </div>
          ` : ''}
        </div>

        ${footerImageUrl ? `<div class="banner-footer"><img src="${footerImageUrl}" alt="Footer Banner" /></div>` : ''}
      </div>
    </body>
    </html>
  `;
};

const sendProposalEmail = async (
  proposal: any,
  customer: any,
  customerEmailFallback?: string,
  customBody?: string,
  backendOrigin?: string,
  ccFallback?: string | string[]
) => {
  const settings = await Settings.findOne();
  if (!settings || !settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword) {
    throw new Error('SMTP settings are not configured. Please visit Settings > SMTP.');
  }

  const resolvedLead = proposal.lead && typeof proposal.lead === 'object' ? proposal.lead : (proposal.lead ? await Lead.findById(proposal.lead) : null);
  const resolvedCustomer = customer && typeof customer === 'object' ? customer : (proposal.customer ? await Customer.findById(proposal.customer) : null);

  const to = String(
    customerEmailFallback ||
    resolvedCustomer?.email ||
    resolvedCustomer?.primaryContactInfo?.email ||
    resolvedLead?.email ||
    proposal.customerEmail ||
    ''
  ).trim();

  if (!to) {
    throw new Error('Recipient email address is missing. Please provide an email address before sending the proposal.');
  }

  const rawCc = ccFallback !== undefined ? ccFallback : proposal.cc;
  const resolvedCc = (Array.isArray(rawCc) ? rawCc.join(', ') : String(rawCc || '')).trim() || undefined;

  let effectiveTemplate: any = null;
  if (proposal.template && typeof proposal.template === 'object' && proposal.template.name) {
    effectiveTemplate = proposal.template;
  } else if (proposal.template && mongoose.Types.ObjectId.isValid(String(proposal.template))) {
    effectiveTemplate = await ProposalTemplate.findById(proposal.template);
  }
  if (!effectiveTemplate && proposal.templateName) {
    effectiveTemplate = await ProposalTemplate.findOne({ name: proposal.templateName });
  }
  if (!effectiveTemplate) {
    effectiveTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});
  }

  const targetEntity = resolvedCustomer || resolvedLead || {
    name: proposal.customerName,
    companyName: proposal.customerName,
    phone: proposal.customerPhone,
    email: to || proposal.customerEmail,
    address: proposal.customerAddress,
  };
  if (to && !proposal.customerEmail) {
    proposal.customerEmail = to;
  }
  const salutationName =
    proposal.customerContactPerson ||
    (resolvedLead && resolvedLead.companyName ? resolvedLead.name : '') ||
    (resolvedCustomer && (resolvedCustomer.contact || resolvedCustomer.primaryContactInfo?.contactName1) ? (resolvedCustomer.contact || resolvedCustomer.primaryContactInfo?.contactName1) : '') ||
    (targetEntity?.name || proposal.customerName || 'Valued Customer');
  const subject = `Proposal ${proposal.proposalNo}: ${proposal.title}`;
  const emailAttachments: any[] = [];

  const senderUser = proposal.createdBy && typeof proposal.createdBy === 'object' ? proposal.createdBy : null;
  const senderName = senderUser?.name || settings?.companyName || 'Welcome Trading Co. W.L.L';
  const senderPhone = (senderUser as any)?.phone || settings?.companyPhone || '';
  const senderEmail = (senderUser as any)?.email || settings?.companyEmail || settings?.senderEmail || settings?.smtpUser || '';

  const defaultCustomBody = [
    `Dear ${salutationName},`,
    '',
    `Please find attached our quotation proposal ${proposal.proposalNo || ''} for your review. Please feel free to reach out if you have any questions or require any clarification.`,
    '',
    'Thanks & Best Regards',
    senderName,
    senderPhone ? `Phone: ${senderPhone}` : '',
    senderEmail ? `Email: ${senderEmail}` : '',
  ].filter(Boolean).join('\n');

  const effectiveBody = (typeof customBody === 'string' && customBody.trim()) ? customBody.trim() : defaultCustomBody;

  const html = buildProposalEmailHtml(
    proposal,
    targetEntity,
    settings,
    to,
    effectiveBody,
    effectiveTemplate,
    emailAttachments,
    false,
    publicProposalPdfUrl(proposal, backendOrigin),
    resolvedCc
  );

  try {
    const pdfBuffer = await generateUnifiedProposalPdf({
      proposal,
      entity: targetEntity,
      settings,
      defaultTemplate: effectiveTemplate,
    });
    emailAttachments.push({
      filename: `${proposal.proposalNo || 'Quotation'}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  } catch (pdfErr) {
    console.error('[Mailer] Error generating CRM PDF attachment for proposal:', pdfErr);
  }

  await sendEmail({
    host: settings.smtpHost,
    port: Number(settings.smtpPort),
    user: settings.smtpUser,
    pass: settings.smtpPassword,
    secure: settings.mailEncryption === 'ssl',
    fromEmail: settings.senderEmail || settings.smtpUser,
    fromName: settings.mailFromName || settings.companyName || 'Welcome Trading Co. w.l.l',
  }, to, subject, html, undefined, resolvedCc, emailAttachments);
};

export const getProposalPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate('customer', 'name contact phone email address primaryContactInfo companyInfo')
      .populate('lead', 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription')
      .populate('template', 'name title items templateImage templateFooterImage companyInfo terms validForDays blocks senderName senderEmail senderPhone')
      .populate('createdBy', 'name email phone');
    if (!proposal) {
      res.status(404).send('<h2>Proposal not found</h2>');
      return;
    }
    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    let effectiveTemplate: any = null;
    if (proposal.template && typeof proposal.template === 'object' && (proposal.template as any).name) {
      effectiveTemplate = proposal.template;
    } else if (proposal.template && mongoose.Types.ObjectId.isValid(String(proposal.template))) {
      effectiveTemplate = await ProposalTemplate.findById(proposal.template);
    }
    if (!effectiveTemplate && (proposal as any).templateName) {
      effectiveTemplate = await ProposalTemplate.findOne({ name: (proposal as any).templateName });
    }
    if (!effectiveTemplate) {
      effectiveTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});
    }

    const targetEntity = proposal.customer || proposal.lead || {
      name: proposal.customerName,
      companyName: proposal.customerName,
      phone: proposal.customerPhone,
      email: proposal.customerEmail,
      address: proposal.customerAddress,
    };

    const pdfBuffer = await generateUnifiedProposalPdf({
      proposal,
      entity: targetEntity,
      settings,
      defaultTemplate: effectiveTemplate,
    });

    res.setHeader('Content-Type', 'application/pdf');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${proposal.proposalNo || 'Quotation'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: unknown) {
    res.status(500).send(`<h2>Error generating proposal PDF: ${(err as Error).message}</h2>`);
  }
};

export const sendDirectProposalEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    if (!settings || !settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword) {
      res.status(400).json({ success: false, message: 'SMTP settings are not configured. Please visit Settings > SMTP.' });
      return;
    }

    const { to, cc, subject, messageBody, id } = req.body;
    if (!to || (Array.isArray(to) && to.length === 0)) {
      res.status(400).json({ success: false, message: 'Recipient email address (To) is required.' });
      return;
    }

    // Resolve recipient info
    const recipientEmail = String(Array.isArray(to) ? to[0] : to).trim();
    const resolvedCustomerEmail = (req.body.customerEmail || recipientEmail).trim();
    let resolvedCustomerName = req.body.customerName ? String(req.body.customerName).trim() : undefined;
    let resolvedCustomerPhone = req.body.customerPhone ? String(req.body.customerPhone).trim() : undefined;
    let resolvedCustomerAddress = req.body.customerAddress ? String(req.body.customerAddress).trim() : undefined;
    let customerId = req.body.customer && mongoose.Types.ObjectId.isValid(String(req.body.customer)) ? req.body.customer : undefined;

    // If customer is not explicitly provided, attempt to auto-link by recipient email
    if (!customerId && resolvedCustomerEmail) {
      const escapedEmail = escapeRegExp(resolvedCustomerEmail);
      const emailRegex = new RegExp(`^${escapedEmail}$`, 'i');
      const matchedCustomer = await Customer.findOne({
        $or: [
          { email: emailRegex },
          { 'primaryContactInfo.email': emailRegex },
          { 'keyContacts.email': emailRegex },
        ],
      });
      if (matchedCustomer) {
        customerId = matchedCustomer._id;
        if (!resolvedCustomerName) resolvedCustomerName = matchedCustomer.name || matchedCustomer.companyInfo?.customerName;
        if (!resolvedCustomerPhone) resolvedCustomerPhone = matchedCustomer.phone || matchedCustomer.primaryContactInfo?.mobile;
        if (!resolvedCustomerAddress) resolvedCustomerAddress = matchedCustomer.address || matchedCustomer.companyInfo?.fullAddress;
      }
    }

    // Fallback: If customerName is still missing, format a readable name from email username
    if (!resolvedCustomerName && resolvedCustomerEmail) {
      const emailUser = (resolvedCustomerEmail.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
      resolvedCustomerName = emailUser
        ? emailUser.replace(/\b\w/g, (c: string) => c.toUpperCase())
        : resolvedCustomerEmail;
    }

    let proposal: any;
    if (id && mongoose.Types.ObjectId.isValid(String(id))) {
      const existingDoc = await Proposal.findById(id);
      const updates = { ...req.body, status: 'sent' };
      if (existingDoc && existingDoc.sentAt) {
        const nextResend = (Number(existingDoc.resendCount) || 0) + 1;
        updates.sentAt = existingDoc.sentAt;
        updates.resentAt = new Date();
        updates.lastSentAt = new Date();
        updates.resendCount = nextResend;

        const resendEntry = {
          revision: existingDoc.revision || 0,
          revisedAt: new Date(),
          revisedBy: req.user?._id,
          revisedByName: req.user?.name || 'CRM User',
          reason: `Proposal quotation resent to customer (Resend #${nextResend})${resolvedCustomerEmail ? ` (${resolvedCustomerEmail})` : ''}`,
          previousTotal: existingDoc.total || 0,
          newTotal: existingDoc.total || 0,
          previousSubtotal: existingDoc.subtotal,
          previousDiscount: existingDoc.discount,
          previousItems: existingDoc.items,
          previousTerms: existingDoc.terms,
          previousBlocks: existingDoc.blocks,
        };
        const currentHistory = Array.isArray(existingDoc.revisionHistory) ? existingDoc.revisionHistory : [];
        updates.revisionHistory = [...currentHistory, resendEntry];
      } else {
        updates.sentAt = new Date();
      }
      delete updates.id;
      delete updates.to;
      delete updates.subject;
      delete updates.messageBody;
      delete updates.createdBy;
      if (req.body.proposalNo && typeof req.body.proposalNo === 'string' && req.body.proposalNo.trim()) {
        const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
        const includeDate = Boolean(settings?.proposalIncludeDate);
        const targetDate = req.body.quoteDate ? new Date(req.body.quoteDate) : (existingDoc?.quoteDate || new Date());
        updates.proposalNo = buildProposalNumber(req.body.proposalNo.trim(), includeDate, targetDate);
        await syncProposalNoSequence(updates.proposalNo);
      } else {
        delete updates.proposalNo;
      }
      if (cc !== undefined) {
        updates.cc = Array.isArray(cc) ? cc.join(', ') : String(cc || '').trim();
      }
      // Save recipient email/name if not already stored
      if (!updates.customer && customerId) updates.customer = customerId;
      if (!updates.customerEmail) updates.customerEmail = resolvedCustomerEmail;
      if (!updates.customerName && resolvedCustomerName) updates.customerName = resolvedCustomerName;
      if (!updates.customerPhone && resolvedCustomerPhone) updates.customerPhone = resolvedCustomerPhone;
      if (!updates.customerAddress && resolvedCustomerAddress) updates.customerAddress = resolvedCustomerAddress;
      if (req.body.senderEmail) updates.senderEmail = String(req.body.senderEmail).trim();
      if (req.body.senderPhone) updates.senderPhone = String(req.body.senderPhone).trim();
      if (req.body.senderName) updates.senderName = String(req.body.senderName).trim();
      if (Array.isArray(updates.items)) {
        updates.items = updates.items
          .map((item: any) => ({
            description: toStringOrUndefined(item?.description),
            qty: Number(item?.qty) || 1,
            unitPrice: Number(item?.unitPrice) || 0,
            total: Number(item?.total) || ((Number(item?.qty) || 1) * (Number(item?.unitPrice) || 0)),
          }))
          .filter((item: any) => item.description);
        const totals = computeProposalTotals(updates.items, updates.discount, updates.blocks);
        updates.subtotal = totals.subtotal;
        updates.discount = totals.discount;
        updates.total = totals.total;
      }
      if (updates.quoteDate) updates.quoteDate = new Date(updates.quoteDate);
      if (updates.proposalDate) updates.quoteDate = new Date(updates.proposalDate);
      if (updates.validUntil) updates.validUntil = new Date(updates.validUntil);
      if (updates.customer && !mongoose.Types.ObjectId.isValid(String(updates.customer))) delete updates.customer;
      if (updates.lead && !mongoose.Types.ObjectId.isValid(String(updates.lead))) delete updates.lead;
      proposal = await Proposal.findByIdAndUpdate(id, updates, { new: true })
        .populate('customer', 'name contact phone email address primaryContactInfo companyInfo')
        .populate('lead', 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription')
        .populate('template', 'name title items templateImage templateFooterImage companyInfo terms validForDays blocks senderName senderEmail senderPhone')
        .populate('createdBy', 'name email phone');
    } else {
      let templateDoc: any = null;
      if (req.body.template && mongoose.Types.ObjectId.isValid(String(req.body.template))) {
        templateDoc = await ProposalTemplate.findById(req.body.template);
      } else if (req.body.templateName) {
        templateDoc = await ProposalTemplate.findOne({ name: req.body.templateName });
      } else if (req.body.proposalType) {
        templateDoc = await ProposalTemplate.findOne({
          $or: [
            { name: req.body.proposalType },
            { name: { $regex: escapeRegExp(String(req.body.proposalType)), $options: 'i' } },
          ],
        });
      }
      if (!templateDoc) {
        templateDoc = (await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] })) || (await ProposalTemplate.findOne({}));
      }

      const rawItems = (Array.isArray(req.body.items) && req.body.items.length > 0)
        ? req.body.items
        : (templateDoc?.items && templateDoc.items.length > 0)
        ? templateDoc.items
        : [];

      let items = rawItems
        .map((item: any) => ({
          description: toStringOrUndefined(item?.description),
          qty: Number(item?.qty) || 1,
          unitPrice: Number(item?.unitPrice) || 0,
          total: Number(item?.total) || ((Number(item?.qty) || 1) * (Number(item?.unitPrice) || 0)),
        }))
        .filter((item: any) => item.description);

      if (items.length === 0) {
        const fallbackDesc = req.body.title || req.body.proposalType || templateDoc?.name || templateDoc?.title || 'Quotation Services';
        const fallbackAmount = Number(req.body.amount || req.body.total || 0);
        items = [{
          description: fallbackDesc,
          qty: 1,
          unitPrice: fallbackAmount,
          total: fallbackAmount,
        }];
      }
      const effectiveDiscount = req.body.discount !== undefined ? req.body.discount : (templateDoc?.discount || 0);
      const effectiveBlocks = req.body.blocks || templateDoc?.blocks;
      const { subtotal, discount: discountPct, total } = computeProposalTotals(items, effectiveDiscount, effectiveBlocks);
      if (!customerId) customerId = req.body.customer && mongoose.Types.ObjectId.isValid(String(req.body.customer)) ? req.body.customer : undefined;
      let leadId = req.body.lead && mongoose.Types.ObjectId.isValid(String(req.body.lead)) ? req.body.lead : (req.body.customerType === 'lead' ? req.body.selectedLeadId : undefined);
      let taskId = req.body.task || req.body.taskId;
      if (taskId && mongoose.Types.ObjectId.isValid(String(taskId))) {
        const taskDoc = await Task.findById(taskId);
        if (taskDoc) {
          if (!customerId && taskDoc.customer) customerId = taskDoc.customer;
          if (!leadId && taskDoc.lead) leadId = taskDoc.lead;
        }
      } else if (!taskId && customerId) {
        const autoTask = await Task.findOne({ customer: customerId, isActive: true, taskType: 'proposal' })
          || await Task.findOne({ customer: customerId, isActive: true });
        if (autoTask) {
          taskId = autoTask._id;
        }
      }

      const safeBody = omitKeys(req.body || {}, [
        'id', 'to', 'subject', 'messageBody', 'subtotal', 'total', 'status', 'sentAt', 'createdBy', 'items', 'discount'
      ]);
      const quoteDate = req.body.quoteDate ? new Date(req.body.quoteDate) : (req.body.proposalDate ? new Date(req.body.proposalDate) : new Date());
      const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
      const includeDate = Boolean(settings?.proposalIncludeDate);
      if (req.body.proposalNo && typeof req.body.proposalNo === 'string' && req.body.proposalNo.trim()) {
        safeBody.proposalNo = buildProposalNumber(req.body.proposalNo.trim(), includeDate, quoteDate);
        await syncProposalNoSequence(safeBody.proposalNo);
      } else {
        safeBody.proposalNo = await getAndIncrementNextProposalNo(quoteDate);
      }
      const validUntil = req.body.validUntil
        ? new Date(req.body.validUntil)
        : new Date(Date.now() + (Number(templateDoc?.validForDays) || 7) * 24 * 60 * 60 * 1000);
      const templateId = templateDoc?._id || (req.body.template && mongoose.Types.ObjectId.isValid(String(req.body.template)) ? req.body.template : undefined);
      const templateName = templateDoc?.name || req.body.templateName || safeBody.templateName || req.body.proposalType || 'Quotation';
      const proposalTitle = req.body.title || `${templateName} - ${resolvedCustomerName || 'Client'}`;
      proposal = await Proposal.create({
        ...safeBody,
        title: proposalTitle,
        items,
        subtotal,
        discount: discountPct,
        total,
        quoteDate,
        validUntil,
        customer: customerId,
        lead: leadId,
        task: (taskId && mongoose.Types.ObjectId.isValid(String(taskId))) ? taskId : undefined,
        template: templateId,
        templateName,
        terms: safeBody.terms || templateDoc?.terms,
        templateImage: safeBody.templateImage || templateDoc?.templateImage,
        templateFooterImage: safeBody.templateFooterImage || templateDoc?.templateFooterImage,
        blocks: safeBody.blocks || templateDoc?.blocks,
        customerEmail: resolvedCustomerEmail || safeBody.customerEmail,
        customerName: resolvedCustomerName || safeBody.customerName,
        customerPhone: resolvedCustomerPhone || safeBody.customerPhone,
        customerAddress: resolvedCustomerAddress || safeBody.customerAddress,
        cc: cc !== undefined ? (Array.isArray(cc) ? cc.join(', ') : String(cc || '').trim()) : (safeBody.cc ? String(safeBody.cc).trim() : undefined),
        senderName: safeBody.senderName,
        senderEmail: safeBody.senderEmail,
        senderPhone: safeBody.senderPhone,
        status: 'sent',
        sentAt: new Date(),
        createdBy: req.user?._id,
      });
      await proposal.populate([
        { path: 'customer', select: 'name phone email address primaryContactInfo companyInfo' },
        { path: 'lead', select: 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription' },
        { path: 'template', select: 'name title items templateImage templateFooterImage companyInfo terms validForDays blocks senderName senderEmail senderPhone' },
        { path: 'createdBy', select: 'name email phone' },
        { path: 'task', select: 'taskNo title taskType' },
      ]);
    }

    if (!proposal) {
      res.status(404).json({ success: false, message: 'Proposal could not be created or found.' });
      return;
    }

    let effectiveTemplate: any = null;
    if (proposal.template && typeof proposal.template === 'object' && proposal.template.name) {
      effectiveTemplate = proposal.template;
    } else if (proposal.template && mongoose.Types.ObjectId.isValid(String(proposal.template))) {
      effectiveTemplate = await ProposalTemplate.findById(proposal.template);
    }
    if (!effectiveTemplate && (proposal.templateName || req.body.templateName)) {
      effectiveTemplate = await ProposalTemplate.findOne({ name: proposal.templateName || req.body.templateName });
    }
    if (!effectiveTemplate) {
      effectiveTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});
    }

    const linkedEntity = proposal.customer || proposal.lead;
    const targetEntity = linkedEntity || {
      name: proposal.customerName || resolvedCustomerName,
      companyName: proposal.customerName || resolvedCustomerName,
      phone: proposal.customerPhone || resolvedCustomerPhone,
      email: proposal.customerEmail || resolvedCustomerEmail,
      address: proposal.customerAddress || resolvedCustomerAddress,
    };
    const salutationName =
      proposal.customerContactPerson ||
      (proposal.lead && typeof proposal.lead === 'object' && proposal.lead.companyName ? proposal.lead.name : '') ||
      (proposal.customer && typeof proposal.customer === 'object' && (proposal.customer.contact || proposal.customer.primaryContactInfo?.contactName1) ? (proposal.customer.contact || proposal.customer.primaryContactInfo?.contactName1) : '') ||
      (targetEntity?.name || proposal.customerName || 'Valued Customer');
    const emailSubject = subject || `Proposal ${proposal.proposalNo}: ${proposal.title}`;
    const emailAttachments: any[] = [];

    const senderName = req.body.senderName || proposal?.senderName || req.user?.name || settings?.companyName || 'Welcome Trading Co. W.L.L';
    const senderPhone = req.body.senderPhone || proposal?.senderPhone || (req.user as any)?.phone || settings?.companyPhone || '';
    const senderEmail = req.body.senderEmail || proposal?.senderEmail || (req.user as any)?.email || settings?.companyEmail || settings?.senderEmail || settings?.smtpUser || '';

    const defaultMessageBody = [
      `Dear ${salutationName},`,
      '',
      `Please find attached our quotation proposal ${proposal.proposalNo || ''} for your review. Please feel free to reach out if you have any questions or require any clarification.`,
      '',
      'Thanks & Best Regards',
      senderName,
      senderPhone ? `Phone: ${senderPhone}` : '',
      senderEmail ? `Email: ${senderEmail}` : '',
    ].filter(Boolean).join('\n');

    const effectiveMessageBody = (typeof messageBody === 'string' && messageBody.trim()) ? messageBody.trim() : defaultMessageBody;

    const emailProposalDoc = {
      ...(proposal.toObject ? proposal.toObject() : proposal),
      senderEmail: proposal.senderEmail || senderEmail,
      senderPhone: proposal.senderPhone || senderPhone,
      senderName: proposal.senderName || senderName,
    };

    const html = buildProposalEmailHtml(
      emailProposalDoc,
      targetEntity,
      settings,
      Array.isArray(to) ? to.join(', ') : to,
      effectiveMessageBody,
      effectiveTemplate,
      emailAttachments,
      false,
      publicProposalPdfUrl(proposal, requestBackendOrigin(req)),
      cc
    );

    let pdfBuffer: Buffer | null = null;
    if (req.body.pdfBase64) {
      try {
        const cleanBase64 = String(req.body.pdfBase64).replace(/^data:application\/pdf;base64,/, '');
        pdfBuffer = Buffer.from(cleanBase64, 'base64');
      } catch {
        pdfBuffer = null;
      }
    }

    if (!pdfBuffer) {
      try {
        pdfBuffer = await generateUnifiedProposalPdf({
          proposal,
          entity: targetEntity,
          settings,
          defaultTemplate: effectiveTemplate,
        });
      } catch (pdfErr) {
        console.error('[Mailer] Error generating CRM PDF attachment for proposal:', pdfErr);
      }
    }

    if (pdfBuffer) {
      emailAttachments.push({
        filename: `${proposal.proposalNo || 'Quotation'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }

    await sendEmail({
      host: settings.smtpHost,
      port: Number(settings.smtpPort),
      user: settings.smtpUser,
      pass: settings.smtpPassword,
      secure: settings.mailEncryption === 'ssl',
      fromEmail: settings.senderEmail || settings.smtpUser,
      fromName: settings.mailFromName || settings.companyName || 'Welcome Trading Co. w.l.l',
    }, to, emailSubject, html, undefined, cc, emailAttachments);

    const effectiveLeadId = proposal.lead?._id || proposal.lead || req.body.lead || (req.body.customerType === 'lead' ? req.body.selectedLeadId : undefined);
    if (effectiveLeadId && mongoose.Types.ObjectId.isValid(String(effectiveLeadId))) {
      await Lead.findByIdAndUpdate(effectiveLeadId, {
        status: 'Quotation Sent',
        proposalRequested: true,
        proposalRequestedAt: new Date(),
        lastFollowupDate: new Date(),
      });
    }

    const effectiveTaskId = proposal.task?._id || proposal.task || req.body.task || req.body.taskId;
    if (effectiveTaskId && mongoose.Types.ObjectId.isValid(String(effectiveTaskId))) {
      await Task.findByIdAndUpdate(effectiveTaskId, {
        $push: {
          history: {
            action: 'proposal',
            fromStatus: 'todo',
            toStatus: 'done',
            comment: `Proposal ${proposal.proposalNo} created & sent to client`,
            performedBy: req.user?._id,
            createdAt: new Date(),
          },
        },
      });
    }

    res.status(200).json({ success: true, message: 'Proposal email sent successfully', data: proposal });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Failed to send proposal email' });
  }
};

export const createProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let customerId = req.body.customer;
    let leadId = req.body.lead || (req.body.customerType === 'lead' ? req.body.selectedLeadId : undefined);
    let taskId = req.body.task || req.body.taskId;
    if (taskId && mongoose.Types.ObjectId.isValid(String(taskId))) {
      const taskDoc = await Task.findById(taskId);
      if (taskDoc) {
        if (!customerId && taskDoc.customer) customerId = taskDoc.customer;
        if (!leadId && taskDoc.lead) leadId = taskDoc.lead;
      }
    }
    const requestedStatus = req.body.status === 'sent' ? 'sent' : 'draft';
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const items = rawItems
      .map((item: any) => ({
        description: toStringOrUndefined(item?.description),
        qty: Number(item?.qty) || 1,
        unitPrice: Number(item?.unitPrice) || 0,
        total: Number(item?.total) || ((Number(item?.qty) || 1) * (Number(item?.unitPrice) || 0)),
      }))
      .filter((item: any) => item.description);

    if (items.length === 0) {
      if (Array.isArray(req.body.blocks) && req.body.blocks.length > 0) {
        items.push({
          description: toStringOrUndefined(req.body.title) || 'General Services',
          qty: 1,
          unitPrice: 0,
          total: 0,
        });
      } else {
        res.status(400).json({ success: false, message: 'Please add at least one proposal line item before saving.' });
        return;
      }
    }

    let leadDoc: any = null;
    if (req.body.customerType === 'new') {
      const newCustomer = await Customer.create({
        name: req.body.customerName || 'New Prospect',
        contact: req.body.contactPerson || req.body.customerName || 'New Prospect',
        phone: req.body.customerPhone || '—',
        email: req.body.customerEmail || undefined,
        address: req.body.customerAddress || undefined,
        createdBy: req.user?._id,
      });
      customerId = newCustomer._id;
    } else if (leadId && mongoose.Types.ObjectId.isValid(String(leadId))) {
      leadDoc = await Lead.findById(leadId);
      if (leadDoc && leadDoc.customerId) {
        customerId = leadDoc.customerId;
      }
    }

    // Recompute money server-side from blocks or items.
    const { subtotal, discount: discountPct, total } = computeProposalTotals(items, req.body.discount, req.body.blocks);
    const safeBody = omitKeys((req.body || {}) as Record<string, any>, [
      'subtotal', 'total', 'status', 'sentAt', 'createdBy', 'items', 'discount',
    ]);
    const quoteDate = req.body.quoteDate ? new Date(req.body.quoteDate) : (req.body.proposalDate ? new Date(req.body.proposalDate) : new Date());
    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    const includeDate = Boolean(settings?.proposalIncludeDate);
    if (req.body.proposalNo && typeof req.body.proposalNo === 'string' && req.body.proposalNo.trim()) {
      safeBody.proposalNo = buildProposalNumber(req.body.proposalNo.trim(), includeDate, quoteDate);
      await syncProposalNoSequence(safeBody.proposalNo);
    } else {
      safeBody.proposalNo = await getAndIncrementNextProposalNo(quoteDate);
    }

    // Sanitize any empty or invalid ObjectId string values that client sent in safeBody
    for (const k of ['customer', 'lead', 'task', 'template']) {
      if (safeBody[k] !== undefined && (!safeBody[k] || !mongoose.Types.ObjectId.isValid(String(safeBody[k])))) {
        delete safeBody[k];
      }
    }

    const validCustomerId = (customerId && mongoose.Types.ObjectId.isValid(String(customerId))) ? customerId : undefined;
    const validLeadId = (leadId && mongoose.Types.ObjectId.isValid(String(leadId))) ? leadId : undefined;
    const validTaskId = (taskId && mongoose.Types.ObjectId.isValid(String(taskId))) ? taskId : undefined;

    const validUntil = req.body.validUntil ? new Date(req.body.validUntil) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const proposal = await Proposal.create({
      ...safeBody,
      customerName: req.body.customerName || (leadDoc ? (leadDoc.companyName || leadDoc.name) : undefined),
      customerContactPerson: req.body.customerContactPerson || req.body.customerDetails?.contactName || req.body.customerDetails?.contactPerson || (leadDoc ? (leadDoc.companyName ? leadDoc.name : '') : undefined),
      customerDetails: req.body.customerDetails || undefined,
      customerPhone: req.body.customerPhone || (leadDoc ? leadDoc.phone : undefined),
      customerEmail: req.body.customerEmail || (leadDoc ? leadDoc.email : undefined),
      customerAddress: req.body.customerAddress || (leadDoc ? leadDoc.fullAddress : undefined),
      cc: req.body.cc !== undefined ? (Array.isArray(req.body.cc) ? req.body.cc.join(', ') : String(req.body.cc || '').trim()) : undefined,
      senderEmail: req.body.senderEmail ? String(req.body.senderEmail).trim() : ((req.user as any)?.email || undefined),
      senderPhone: req.body.senderPhone ? String(req.body.senderPhone).trim() : ((req.user as any)?.phone || undefined),
      senderName: req.body.senderName ? String(req.body.senderName).trim() : (req.user?.name || undefined),
      items,
      subtotal,
      discount: discountPct,
      total,
      quoteDate,
      validUntil,
      customer: validCustomerId,
      lead: validLeadId,
      task: validTaskId,
      status: requestedStatus,
      sentAt: requestedStatus === 'sent' ? new Date() : undefined,
      createdBy: req.user?._id,
    });

    if (taskId && mongoose.Types.ObjectId.isValid(String(taskId))) {
      const taskDoc = await Task.findById(taskId);
      if (taskDoc && taskDoc.isActive) {
        if (taskDoc.taskType === 'proposal' || taskDoc.status === 'todo' || taskDoc.status === 'in_progress') {
          taskDoc.status = 'done';
          taskDoc.completedAt = new Date();
          taskDoc.completedBy = req.user?._id;
          await taskDoc.save();
        }
      }
    }

    if (leadId && mongoose.Types.ObjectId.isValid(String(leadId))) {
      const lead = await Lead.findById(leadId);
      if (lead && lead.isActive) {
        const isTerminal = ['won', 'converted', 'lost', 'junk'].includes(lead.status.toLowerCase());
        if (!isTerminal) {
          const prevStatus = lead.status;
          lead.status = 'Quotation Sent';
          await lead.save();

          await LeadStatusHistory.create({
            lead: lead._id,
            fromStatus: prevStatus,
            toStatus: 'Quotation Sent',
            changedBy: req.user?._id,
            changedAt: new Date(),
            remarks: `Proposal ${proposal.proposalNo} created`,
          });

          await LeadActivity.create({
            lead: lead._id,
            actor: req.user?._id,
            type: 'status_changed',
            message: `Proposal ${proposal.proposalNo} created for Lead ${lead.leadId}`,
            metadata: { proposalId: proposal._id, proposalNo: proposal.proposalNo },
          });
        }
      }
    }

    const populated = await proposal.populate([
      { path: 'customer', select: 'name phone email address primaryContactInfo companyInfo' },
      { path: 'lead', select: 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription' },
      { path: 'task', select: 'taskNo title status taskType dueDate' },
    ]);
    if (requestedStatus === 'sent') {
      try {
        await sendProposalEmail(proposal, populated.customer, req.body.customerEmail, undefined, requestBackendOrigin(req), req.body.cc || proposal.cc);
      } catch (mailErr) {
        proposal.status = 'draft';
        proposal.sentAt = undefined;
        await proposal.save();
        throw mailErr;
      }
    }

    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const getNextProposalNumberHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetDate = req.query.date ? String(req.query.date) : new Date();
    const nextProposalNo = await peekNextProposalNo(targetDate);
    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    res.status(200).json({
      success: true,
      data: {
        nextProposalNo,
        startingProposalNo: settings?.proposalNo || 'WT-Q1001',
        proposalIncludeDate: Boolean(settings?.proposalIncludeDate),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Failed to get next proposal number' });
  }
};

export const updateProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existingProposal = await Proposal.findOne({ _id: req.params.id, ...userAccessFilter(req) });
    if (!existingProposal) {
      res.status(404).json({ success: false, message: 'Proposal not found' });
      return;
    }

    const updates = { ...req.body };

    if (updates.quoteDate) updates.quoteDate = new Date(updates.quoteDate);
    if (updates.proposalDate) updates.quoteDate = new Date(updates.proposalDate);
    if (updates.validUntil) updates.validUntil = new Date(updates.validUntil);

    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    const includeDate = Boolean(settings?.proposalIncludeDate);
    const targetQuoteDate = updates.quoteDate || existingProposal.quoteDate || new Date();

    // Mass-assignment guard: proposalNo and createdBy are server-controlled,
    // but if the existing document is a legacy record missing proposalNo or createdBy, backfill them.
    if (!existingProposal.proposalNo) {
      const generatedNo = req.body.proposalNo || existingProposal.proposalId || (await nextSequence('proposal', () =>
        highestExistingNumber(Proposal, 'proposalNo')
      ).then(s => `PROP-${String(s).padStart(4, '0')}`));
      updates.proposalNo = buildProposalNumber(generatedNo, includeDate, targetQuoteDate);
      await syncProposalNoSequence(updates.proposalNo);
    } else if (req.body.proposalNo && typeof req.body.proposalNo === 'string' && req.body.proposalNo.trim()) {
      const baseSerial = stripDateSuffix(req.body.proposalNo.trim()) || stripDateSuffix(existingProposal.proposalNo);
      updates.proposalNo = buildProposalNumber(baseSerial, includeDate, targetQuoteDate);
      await syncProposalNoSequence(updates.proposalNo);
    } else if (includeDate && (req.body.quoteDate || req.body.proposalDate)) {
      const baseSerial = stripDateSuffix(existingProposal.proposalNo);
      updates.proposalNo = buildProposalNumber(baseSerial, includeDate, targetQuoteDate);
    } else {
      delete updates.proposalNo;
    }

    if (!existingProposal.createdBy) {
      updates.createdBy = req.user?._id;
    } else {
      delete updates.createdBy;
    }

    delete updates.subtotal;
    delete updates.total;
    if (req.body.cc !== undefined) {
      updates.cc = Array.isArray(req.body.cc) ? req.body.cc.join(', ') : String(req.body.cc || '').trim();
    }

    // Handle customer string resolution or sanitization
    if (updates.customer && !mongoose.Types.ObjectId.isValid(String(updates.customer))) {
      const custName = String(updates.customer).trim();
      const matchedCustomer = await Customer.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegExp(custName)}$`, 'i') },
          { 'companyInfo.customerName': new RegExp(`^${escapeRegExp(custName)}$`, 'i') },
        ],
      });
      if (matchedCustomer) {
        updates.customer = matchedCustomer._id;
        if (!updates.customerName) updates.customerName = matchedCustomer.name;
        if (!updates.customerPhone) updates.customerPhone = matchedCustomer.phone;
        if (!updates.customerEmail) updates.customerEmail = matchedCustomer.email;
        if (!updates.customerAddress) updates.customerAddress = matchedCustomer.address;
      } else {
        if (!updates.customerName) updates.customerName = custName;
        delete updates.customer;
      }
    } else if (!updates.customer && existingProposal.customer && !mongoose.Types.ObjectId.isValid(String(existingProposal.customer))) {
      const custName = String(existingProposal.customer).trim();
      const matchedCustomer = await Customer.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegExp(custName)}$`, 'i') },
          { 'companyInfo.customerName': new RegExp(`^${escapeRegExp(custName)}$`, 'i') },
        ],
      });
      if (matchedCustomer) {
        updates.customer = matchedCustomer._id;
        if (!updates.customerName) updates.customerName = matchedCustomer.name;
      } else {
        if (!updates.customerName) updates.customerName = custName;
        updates.customer = null;
      }
    }

    if (updates.lead && !mongoose.Types.ObjectId.isValid(String(updates.lead))) {
      delete updates.lead;
    }
    if (updates.task && !mongoose.Types.ObjectId.isValid(String(updates.task))) {
      delete updates.task;
    }
    if (updates.template && !mongoose.Types.ObjectId.isValid(String(updates.template))) {
      delete updates.template;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'templateImage')) {
      const val = req.body.templateImage;
      updates.templateImage = (val === null || val === undefined || val === '') ? '' : String(val).trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'templateFooterImage')) {
      const val = req.body.templateFooterImage;
      updates.templateFooterImage = (val === null || val === undefined || val === '') ? '' : String(val).trim();
    }

    // Extract table items from blocks if present
    const extractedBlockItems: any[] = [];
    if (Array.isArray(updates.blocks)) {
      updates.blocks.forEach((b: any) => {
        if (b && b.type === 'table' && Array.isArray(b.items)) {
          b.items.forEach((it: any) => {
            if (it && it.description && String(it.description).trim()) {
              extractedBlockItems.push({
                description: String(it.description).trim(),
                qty: Number(it.qty) || 1,
                unitPrice: Number(it.unitPrice) || 0,
                total: (Number(it.qty) || 1) * (Number(it.unitPrice) || 0),
              });
            }
          });
        }
      });
    }

    if (Array.isArray(updates.items)) {
      updates.items = updates.items
        .map((item: any) => ({
          description: toStringOrUndefined(item?.description),
          qty: Number(item?.qty) || 1,
          unitPrice: Number(item?.unitPrice) || 0,
          total: Number(item?.total) || ((Number(item?.qty) || 1) * (Number(item?.unitPrice) || 0)),
        }))
        .filter((item: any) => item.description);

      if (extractedBlockItems.length > 0 && (updates.items.length === 0 || (updates.items.length === 1 && updates.items[0].unitPrice === 0))) {
        updates.items = extractedBlockItems;
      }

      if (updates.items.length === 0) {
        if (Array.isArray(updates.blocks) && updates.blocks.length > 0) {
          updates.items.push({
            description: toStringOrUndefined(updates.title || req.body.title) || 'General Services',
            qty: 1,
            unitPrice: 0,
            total: 0,
          });
        } else {
          res.status(400).json({ success: false, message: 'Please add at least one proposal line item before saving.' });
          return;
        }
      }
      // Recompute totals server-side from the validated items and blocks.
      const totals = computeProposalTotals(updates.items, updates.discount, updates.blocks);
      updates.subtotal = totals.subtotal;
      updates.discount = totals.discount;
      updates.total = totals.total;
      updates.amount = totals.total;
    } else if (Array.isArray(updates.blocks)) {
      if (extractedBlockItems.length > 0) {
        updates.items = extractedBlockItems;
      }
      const totals = computeProposalTotals(updates.items || [], updates.discount, updates.blocks);
      updates.subtotal = totals.subtotal;
      updates.discount = totals.discount;
      updates.total = totals.total;
      updates.amount = totals.total;
    }

    const isContentAltered =
      Array.isArray(req.body.items) ||
      Array.isArray(req.body.blocks) ||
      req.body.discount !== undefined ||
      req.body.terms !== undefined ||
      req.body.title !== undefined ||
      Boolean(req.body.revisionReason);

    if (isContentAltered) {
      const currentRev = Number(existingProposal.revision) || 0;
      const nextRev = currentRev + 1;
      updates.revision = nextRev;
      updates.revisedAt = new Date();

      const previousTotal = existingProposal.total || 0;
      const newTotal = updates.total !== undefined ? updates.total : previousTotal;

      const revisionEntry = {
        revision: nextRev,
        revisedAt: new Date(),
        revisedBy: req.user?._id,
        revisedByName: req.user?.name || 'CRM User',
        reason: toStringOrUndefined(req.body.revisionReason) || 'Proposal quotation negotiated / terms revised',
        previousTotal,
        newTotal,
        previousSubtotal: existingProposal.subtotal,
        previousDiscount: existingProposal.discount,
        previousItems: existingProposal.items,
        previousTerms: existingProposal.terms,
        previousBlocks: existingProposal.blocks,
      };

      const currentHistory = Array.isArray(existingProposal.revisionHistory) ? existingProposal.revisionHistory : [];
      updates.revisionHistory = [...currentHistory, revisionEntry];
    }

    const wantsSend = updates.status === 'sent';
    if (wantsSend) {
      if (!existingProposal.sentAt) {
        updates.sentAt = new Date();
        if (!req.body.quoteDate && !req.body.proposalDate) {
          const sendDate = new Date();
          updates.quoteDate = sendDate;
          const baseSerial = stripDateSuffix(updates.proposalNo || existingProposal.proposalNo || existingProposal.proposalId);
          if (baseSerial) {
            const incDate = Boolean(settings?.proposalIncludeDate);
            updates.proposalNo = buildProposalNumber(baseSerial, incDate, sendDate);
            await syncProposalNoSequence(updates.proposalNo);
          }
        }
      } else {
        const nextResend = (Number(existingProposal.resendCount) || 0) + 1;
        updates.resentAt = new Date();
        updates.lastSentAt = new Date();
        updates.resendCount = nextResend;
        if (!isContentAltered) {
          const resendEntry = {
            revision: existingProposal.revision || 0,
            revisedAt: new Date(),
            revisedBy: req.user?._id,
            revisedByName: req.user?.name || 'CRM User',
            reason: `Proposal quotation resent to customer (Resend #${nextResend})${req.body.customerEmail ? ` (${req.body.customerEmail})` : ''}`,
            previousTotal: existingProposal.total || 0,
            newTotal: existingProposal.total || 0,
            previousSubtotal: existingProposal.subtotal,
            previousDiscount: existingProposal.discount,
            previousItems: existingProposal.items,
            previousTerms: existingProposal.terms,
            previousBlocks: existingProposal.blocks,
          };
          const currentHistory = Array.isArray(existingProposal.revisionHistory) ? existingProposal.revisionHistory : [];
          updates.revisionHistory = [...currentHistory, resendEntry];
        }
      }
    }
    const proposal = await Proposal.findOneAndUpdate({ _id: req.params.id, ...userAccessFilter(req) }, updates, { new: true })
      .populate('customer', 'name phone email address primaryContactInfo companyInfo')
      .populate('lead', 'leadId name companyName phone email fullAddress locationArea interestedProduct requirementDescription')
      .populate('template', 'name title items templateImage templateFooterImage companyInfo terms validForDays blocks senderName senderEmail senderPhone')
      .populate('createdBy', 'name email phone')
      .populate('task');
    if (!proposal) { res.status(404).json({ success: false, message: 'Proposal not found' }); return; }
    if (wantsSend) {
      try {
        await sendProposalEmail(
          proposal,
          proposal.customer,
          req.body.customerEmail || req.body.email,
          undefined,
          requestBackendOrigin(req),
          req.body.cc !== undefined ? req.body.cc : proposal.cc
        );
      } catch (mailErr) {
        proposal.status = 'draft';
        proposal.sentAt = undefined;
        await proposal.save();
        throw mailErr;
      }
    }
    res.status(200).json({ success: true, data: proposal });
  } catch (err: unknown) { res.status(500).json({ success: false, message: (err as Error).message || 'Server error' }); }
};

export const deleteProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findOneAndDelete({ _id: req.params.id, ...userAccessFilter(req) });
    if (!proposal) {
      res.status(404).json({ success: false, message: 'Proposal not found' });
      return;
    }
    if (proposal.lead) {
      const remainingForLead = await Proposal.countDocuments({ lead: proposal.lead });
      if (remainingForLead === 0) {
        await Lead.findByIdAndUpdate(proposal.lead, { status: 'In Discussion' });
      }
    }

    // Immediately synchronize Settings.proposalCurrentSeq from remaining proposals in DB
    try {
      const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
      if (settings) {
        const { assignedSerial } = await computeNextProposalSerial(settings);
        await Settings.updateOne({}, { $set: { proposalCurrentSeq: assignedSerial } });
      }
    } catch {
      // non-fatal
    }

    res.status(200).json({ success: true, message: 'Proposal deleted successfully' });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message || 'Server error' });
  }
};

// ─── DASHBOARD ────────────────────────────────────
export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenMonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - now.getDay());

    let sDate: Date | null = null;
    let eDate: Date | null = null;
    if (startDate && endDate) {
      const parsedS = new Date(String(startDate));
      parsedS.setHours(0, 0, 0, 0);
      const parsedE = new Date(String(endDate));
      parsedE.setHours(23, 59, 59, 999);
      if (!isNaN(parsedS.getTime()) && !isNaN(parsedE.getTime())) {
        sDate = parsedS;
        eDate = parsedE;
      }
    }

    const [
      totalCustomers, openCalls, openTickets, expiringSoon,
      criticalOpenTickets, recentCalls, recentTickets, monthRevenue,
      revenueByMonth, callsByWeekday, outstandingStats, revenueYtd,
      recentProposals, recentLeads
    ] = await Promise.all([
      Customer.countDocuments({ isActive: true, ...userAccessFilter(req) }),
      Call.countDocuments({ ...userAccessFilter(req, 'engineer'), status: { $in: ['open', 'in-progress'] } }),
      Ticket.countDocuments({ ...userAccessFilter(req, 'assignedTo'), status: { $in: ['open', 'in-progress'] } }),
      AMC.countDocuments({ ...userAccessFilter(req), expiryDate: { $lte: thirtyDaysFromNow, $gte: now } }),
      Ticket.countDocuments({ ...userAccessFilter(req, 'assignedTo'), status: { $in: ['open', 'in-progress'] }, priority: 'critical' }),
      Call.find({ ...userAccessFilter(req, 'engineer'), ...(sDate && eDate ? { callDate: { $gte: sDate, $lte: eDate } } : {}) }).populate('customer', 'name').populate('engineer', 'name').sort({ updatedAt: -1 }).limit(10),
      Ticket.find({ ...userAccessFilter(req, 'assignedTo'), ...(sDate && eDate ? { createdAt: { $gte: sDate, $lte: eDate } } : {}) }).populate('customer', 'name phone').populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(10),
      Payment.aggregate([
        {
          $match: {
            ...userAccessFilter(req),
            status: 'paid',
            paymentDate: sDate && eDate
              ? { $gte: sDate, $lte: eDate }
              : { $gte: monthStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { ...userAccessFilter(req), status: 'paid', paymentDate: { $gte: sevenMonthsStart, $lte: now } } },
        {
          $group: {
            _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } },
            revenue: { $sum: '$amount' },
          },
        },
      ]),
      Call.aggregate([
        { $match: { ...userAccessFilter(req, 'engineer'), callDate: { $gte: weekStart, $lte: now } } },
        {
          $group: {
            _id: { $dayOfWeek: '$callDate' },
            calls: { $sum: 1 },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { ...userAccessFilter(req), status: { $in: ['pending', 'overdue', 'partial'] } } },
        {
          $group: {
            _id: null,
            // For partial payments, only the unpaid remainder is outstanding.
            total: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'partial'] },
                  { $subtract: ['$amount', { $ifNull: ['$partialAmount', 0] }] },
                  '$amount',
                ],
              },
            },
            customers: { $addToSet: '$customer' },
          },
        },
        { $project: { _id: 0, total: 1, outstandingCustomers: { $size: '$customers' } } },
      ]),
      Payment.aggregate([
        { $match: { ...userAccessFilter(req), status: 'paid', paymentDate: { $gte: yearStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Proposal.find({ ...userAccessFilter(req), ...(sDate && eDate ? { createdAt: { $gte: sDate, $lte: eDate } } : {}) }).populate('customer', 'name phone email').sort({ updatedAt: -1 }).limit(10),
      Lead.find({ ...userAccessFilter(req), ...(sDate && eDate ? { createdAt: { $gte: sDate, $lte: eDate } } : {}) }).sort({ updatedAt: -1 }).limit(10),
    ]);

    const monthKeys = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (6 - idx), 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth() + 1}`,
        month: d.toLocaleString('en-US', { month: 'short' }),
        revenue: 0,
      };
    });
    const monthMap = new Map(monthKeys.map((m) => [m.key, m]));
    revenueByMonth.forEach((row: any) => {
      const key = `${row._id.year}-${row._id.month}`;
      const target = monthMap.get(key);
      if (target) target.revenue = row.revenue || 0;
    });

    const callsTrend = [
      { day: 'Sun', calls: 0 },
      { day: 'Mon', calls: 0 },
      { day: 'Tue', calls: 0 },
      { day: 'Wed', calls: 0 },
      { day: 'Thu', calls: 0 },
      { day: 'Fri', calls: 0 },
      { day: 'Sat', calls: 0 },
    ];
    callsByWeekday.forEach((row: any) => {
      const idx = Number(row._id) - 1;
      if (idx >= 0 && idx < callsTrend.length) callsTrend[idx].calls = row.calls || 0;
    });

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalCustomers,
          openCalls,
          openTickets,
          expiringSoon,
          monthRevenue: monthRevenue[0]?.total || 0,
        },
        analytics: {
          criticalOpenTickets,
          outstandingAmount: outstandingStats[0]?.total || 0,
          outstandingCustomers: outstandingStats[0]?.outstandingCustomers || 0,
          revenueYtd: revenueYtd[0]?.total || 0,
          revenueTrend: monthKeys.map(({ month, revenue }) => ({ month, revenue })),
          callsTrend,
        },
        recentCalls,
        recentTickets,
        recentProposals,
        recentLeads,
      },
    });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getCalendarEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const y = Number(req.query.year) || new Date().getFullYear();
    const m = req.query.month !== undefined ? Number(req.query.month) : new Date().getMonth();

    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const dateRange = { $gte: start, $lte: end };

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [amcs, payments, proposals, visits] = await Promise.all([
      AMC.find({ expiryDate: dateRange })
        .populate('customer', 'name')
        .select('expiryDate product customer'),
      Payment.find({ dueDate: dateRange, status: { $in: ['pending', 'partial', 'overdue'] } })
        .populate('customer', 'name')
        .select('dueDate invoiceNo customer'),
      Proposal.find({ validUntil: dateRange, status: { $in: ['draft', 'sent'] } })
        .populate('customer', 'name')
        .select('validUntil proposalNo customer'),
      Call.find({ callDate: dateRange, type: 'visit', status: { $in: ['open', 'in-progress'] } })
        .populate('customer', 'name')
        .select('callDate subject customer'),
    ]);

    const toDateStr = (d: Date): string => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    const events: Array<{
      id: string;
      date: string;
      label: string;
      type: string;
      module: 'amc' | 'payment' | 'proposal' | 'visit';
      moduleLabel: string;
      customerId: string;
      customerName: string;
      targetRoute: string;
      productName?: string;
      refNo?: string;
      amount?: number;
    }> = [];

    for (const amc of amcs) {
      const status = computeAMCStatus(amc.expiryDate, now, soon);
      const cust = amc.customer as any;
      const custName = cust?.name || (typeof amc.customer === 'string' ? '' : 'Unknown');
      const custId = String(cust?._id || amc.customer || '');
      events.push({
        id: String(amc._id),
        date: toDateStr(amc.expiryDate),
        label: `${amc.product || 'AMC'} – ${custName || 'Unknown'}`,
        type: status === 'expired' ? 'amc-expired' : 'amc-expiring',
        module: 'amc',
        moduleLabel: 'AMC',
        customerId: custId,
        customerName: custName || 'Unknown',
        targetRoute: '/amc/list',
        productName: amc.product || 'AMC Contract',
      });
    }

    for (const payment of payments) {
      if (!payment.dueDate) continue;
      const cust = payment.customer as any;
      const custName = cust?.name || 'Unknown';
      const custId = String(cust?._id || payment.customer || '');
      events.push({
        id: String(payment._id),
        date: toDateStr(payment.dueDate),
        label: `Payment Due – ${custName}`,
        type: 'payment-due',
        module: 'payment',
        moduleLabel: 'Payment',
        customerId: custId,
        customerName: custName,
        targetRoute: '/payments',
        refNo: (payment as any).invoiceNo || undefined,
      });
    }

    for (const proposal of proposals) {
      const cust = proposal.customer as any;
      const custName = cust?.name || 'Unknown';
      const custId = String(cust?._id || proposal.customer || '');
      events.push({
        id: String(proposal._id),
        date: toDateStr(proposal.validUntil),
        label: `Proposal Expires – ${custName}`,
        type: 'proposal-expiry',
        module: 'proposal',
        moduleLabel: 'Proposal',
        customerId: custId,
        customerName: custName,
        targetRoute: '/proposals/list',
        refNo: (proposal as any).proposalNo || undefined,
      });
    }

    for (const visit of visits) {
      const cust = visit.customer as any;
      const custName = cust?.name || 'Unknown';
      const custId = String(cust?._id || visit.customer || '');
      events.push({
        id: String(visit._id),
        date: toDateStr(visit.callDate),
        label: `Visit – ${custName}`,
        type: 'visit',
        module: 'visit',
        moduleLabel: 'Scheduled Visit',
        customerId: custId,
        customerName: custName,
        targetRoute: '/calls',
        refNo: (visit as any).subject || undefined,
      });
    }

    res.status(200).json({ success: true, events });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getEngineers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const User = (await import('../models/User')).default;
    const users = await User.find({ isActive: true })
      .populate('role', 'name')
      .select('-password')
      .sort({ name: 1 });
    const userIds = users.map((u) => u._id);
    const openTaskCounts = userIds.length
      ? await Task.aggregate([
          {
            $match: {
              isActive: true,
              $or: [
                { assignedTo: { $in: userIds }, status: { $in: ['todo', 'in_progress', 'blocked', 'review'] as TaskStatus[] } },
                { forwardedBy: { $in: userIds }, status: { $ne: 'done' } },
              ],
            },
          },
          {
            $project: {
              userToCredit: {
                $cond: [
                  { $in: ['$assignedTo', userIds] },
                  '$assignedTo',
                  '$forwardedBy',
                ],
              },
            },
          },
          { $group: { _id: '$userToCredit', count: { $sum: 1 } } },
        ])
      : [];
    const openTaskCountByUser = new Map(openTaskCounts.map((row) => [String(row._id), row.count]));
    
    const usersWithStats = await Promise.all(
      users.map(async (u) => {
        const [totalCalls, resolvedCalls] = await Promise.all([
          Call.countDocuments({ engineer: u._id }),
          Call.countDocuments({ engineer: u._id, status: 'resolved' }),
        ]);
        return { ...u.toObject(), totalCalls, resolvedCalls, openTaskCount: openTaskCountByUser.get(String(u._id)) || 0 };
      })
    );
    res.status(200).json({ success: true, data: usersWithStats });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const sendPaymentWhatsapp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id };
    if (!isAdminUser(req.user)) filter.createdBy = req.user?._id;
    
    const payment = await Payment.findOne(filter).populate('customer');
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment/Invoice not found' });
      return;
    }

    const customer = payment.customer as any;
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer associated with payment not found' });
      return;
    }

    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      res.status(400).json({ success: false, message: 'WhatsApp service is statically disabled in the backend.' });
      return;
    }

    const settings = (mongoose.connection.readyState === 1 || (Settings.findOne as any)?.mock)
      ? await Settings.findOne()
      : null;
    if (settings?.whatsappBusinessStatus !== 'active') {
      res.status(400).json({ success: false, message: 'WhatsApp Business API is inactive. Enable it in Admin Settings first.' });
      return;
    }

    const phoneNumberId = String(settings?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(settings?.whatsappAccessToken || '').trim();
    if (!phoneNumberId || !accessToken) {
      res.status(400).json({ success: false, message: 'WhatsApp Phone Number ID and Access Token are required in Admin Settings.' });
      return;
    }

    const recipient = normalizeWhatsAppPhone(resolveCustomerWhatsappNumber(customer), settings?.country);
    if (!recipient || recipient.length < 8 || recipient.length > 15) {
      res.status(400).json({ success: false, message: 'Customer does not have a valid WhatsApp/mobile number with country code.' });
      return;
    }

    const {
      messageType = 'text',
      message,
      templateName,
      languageCode,
    } = req.body || {};

    let payload: Record<string, unknown>;
    if (messageType === 'template') {
      const resolvedTemplate = String(templateName || settings?.whatsappDefaultTemplateName || '').trim();
      const resolvedLanguage = String(languageCode || settings?.whatsappDefaultLanguageCode || 'en_US').trim();
      if (!resolvedTemplate) {
        res.status(400).json({ success: false, message: 'Template name is required for template messages.' });
        return;
      }
      payload = buildWhatsAppTemplatePayload(recipient, resolvedTemplate, resolvedLanguage);
    } else {
      const defaultMsg = [
        `Dear ${customer.name || 'Customer'},`,
        '',
        `Here are the details of invoice *${payment.invoiceNo}*:`,
        `- Description: ${payment.description || payment.paymentType}`,
        `- Amount: QAR ${(payment.amount || 0).toLocaleString()}`,
        `- Due Date: ${payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : 'N/A'}`,
        `- Status: *${String(payment.status || 'pending').toUpperCase()}*`,
        '',
        `Thank you for your business.`,
      ].join('\n');
      
      const body = String(message || defaultMsg).trim();
      if (!body) {
        res.status(400).json({ success: false, message: 'Message text is required.' });
        return;
      }
      payload = buildWhatsAppTextPayload(recipient, body);
    }

    const data = await sendWhatsAppMessage({
      apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
      phoneNumberId,
      accessToken,
      payload,
    });

    res.status(200).json({
      success: true,
      message: 'Invoice sent via WhatsApp successfully',
      data: {
        to: recipient,
        invoiceNo: payment.invoiceNo,
        customerName: customer.name,
        meta: data,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: `Invoice WhatsApp send failed: ${err.message}`, metaStatus: err?.status });
  }
};
