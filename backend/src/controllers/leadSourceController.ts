import { Response } from 'express';
import LeadSource from '../models/LeadSource';
import { AuthRequest } from '../middleware/auth';
import { cascadeLeadSourceName } from '../utils/masterDataCascade';

const DEFAULT_LEAD_SOURCES = [
  'Website',
  'Whatsapp',
  'Walk In',
  'Digital Marketing',
  'Call',
  'Email & Email Campaign',
  'Referral',
  'Direct Marketing',
] as const;

const ensureDefaultLeadSources = async (createdBy?: unknown): Promise<void> => {
  if (!createdBy) return;

  await Promise.all(
    DEFAULT_LEAD_SOURCES.map((name) =>
      LeadSource.updateOne(
        { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        {
          $setOnInsert: {
            name,
            createdBy,
            isActive: true,
          },
        },
        { upsert: true }
      )
    )
  );
};

export const getLeadSources = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureDefaultLeadSources(req.user?._id);
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = { $ne: false };
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [leadSources, total] = await Promise.all([
      LeadSource.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      LeadSource.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: leadSources,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createLeadSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const payload = {
      name: normalizedName,
      description: description ? String(description).trim() : undefined,
      createdBy: req.user?._id,
    };

    const leadSource = await LeadSource.create(payload);
    const populated = await leadSource.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Lead source already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLeadSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') updates.description = updates.description.trim();

    const previous = await LeadSource.findById(req.params.id).select('name');
    const leadSource = await LeadSource.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!leadSource) { res.status(404).json({ success: false, message: 'Lead source not found' }); return; }
    await cascadeLeadSourceName(previous?.name, leadSource.name);
    res.status(200).json({ success: true, data: leadSource });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Lead source name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteLeadSource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const leadSource = await LeadSource.findByIdAndDelete(req.params.id);
    if (!leadSource) { res.status(404).json({ success: false, message: 'Lead source not found' }); return; }
    res.status(200).json({ success: true, message: 'Lead source deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
