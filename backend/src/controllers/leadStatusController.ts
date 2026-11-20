import { Response } from 'express';
import LeadStatusMaster from '../models/LeadStatusMaster';
import { AuthRequest } from '../middleware/auth';
import { cascadeLeadStatusName } from '../utils/masterDataCascade';

export const DEFAULT_LEAD_STATUSES = [
  'New',
  'Assigned',
  'Contacted',
  'Followup',
  'Interested',
  'Quotation Sent',
  'Negotiation',
  'Won',
  'Not Interested',
  'Junk',
] as const;

export const ensureDefaultLeadStatuses = async (createdBy?: unknown): Promise<void> => {
  // Migrate any existing 'Lost' status to 'Not Interested'
  await LeadStatusMaster.updateMany({ name: 'Lost' }, { name: 'Not Interested' }).catch(() => undefined);

  const count = await LeadStatusMaster.countDocuments();
  if (count > 0 || !createdBy) return;

  await LeadStatusMaster.insertMany(
    DEFAULT_LEAD_STATUSES.map((name) => ({
      name,
      createdBy,
      isActive: true,
    })),
    { ordered: false }
  ).catch(() => undefined);
};

export const getActiveLeadStatusNames = async (): Promise<string[]> => {
  // Ensure legacy 'Lost' names are migrated
  await LeadStatusMaster.updateMany({ name: 'Lost' }, { name: 'Not Interested' }).catch(() => undefined);
  const statuses = await LeadStatusMaster.find({ isActive: { $ne: false } }).sort({ _id: 1 }).select('name').lean();
  return statuses.map((s) => s.name);
};

export const getDefaultLeadStatusName = async (createdBy?: unknown): Promise<string> => {
  await ensureDefaultLeadStatuses(createdBy);
  const statuses = await getActiveLeadStatusNames();
  return statuses[0] || 'New';
};

export const isActiveLeadStatus = async (status: string, createdBy?: unknown): Promise<boolean> => {
  await ensureDefaultLeadStatuses(createdBy);
  const found = await LeadStatusMaster.exists({
    name: { $regex: new RegExp(`^${status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: { $ne: false },
  });
  return !!found;
};

// Resolve a (possibly mis-cased) status to its exact stored name so all leads
// share one canonical casing — otherwise dashboard $group splits into buckets.
export const canonicalLeadStatusName = async (status: string, createdBy?: unknown): Promise<string | null> => {
  await ensureDefaultLeadStatuses(createdBy);
  const doc = await LeadStatusMaster.findOne({
    name: { $regex: new RegExp(`^${status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: { $ne: false },
  }).select('name').lean();
  return (doc as { name?: string } | null)?.name || null;
};

export const getFollowUpLeadStatusName = async (createdBy?: unknown): Promise<string> => {
  await ensureDefaultLeadStatuses(createdBy);
  const followUp = await LeadStatusMaster.findOne({
    name: { $regex: /^follow[\s_-]?up$/i },
    isActive: { $ne: false },
  }).select('name').lean();
  return followUp?.name || getDefaultLeadStatusName(createdBy);
};

export const getLeadStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureDefaultLeadStatuses(req.user?._id);
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = { $ne: false };
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [leadStatuses, total] = await Promise.all([
      LeadStatusMaster.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      LeadStatusMaster.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: leadStatuses,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createLeadStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const leadStatus = await LeadStatusMaster.create({
      name: normalizedName,
      description: description ? String(description).trim() : undefined,
      createdBy: req.user?._id,
    });
    const populated = await leadStatus.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Lead status already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLeadStatusMaster = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') updates.description = updates.description.trim();

    const previous = await LeadStatusMaster.findById(req.params.id).select('name');
    const leadStatus = await LeadStatusMaster.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!leadStatus) { res.status(404).json({ success: false, message: 'Lead status not found' }); return; }
    await cascadeLeadStatusName(previous?.name, leadStatus.name);
    res.status(200).json({ success: true, data: leadStatus });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Lead status name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteLeadStatusMaster = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const leadStatus = await LeadStatusMaster.findByIdAndDelete(req.params.id);
    if (!leadStatus) { res.status(404).json({ success: false, message: 'Lead status not found' }); return; }
    res.status(200).json({ success: true, message: 'Lead status deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
