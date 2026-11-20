import { Response } from 'express';
import Industry from '../models/Industry';
import { AuthRequest } from '../middleware/auth';
import { cascadeIndustryName, cascadeIndustryGroupNames } from '../utils/masterDataCascade';

export const getIndustries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, isActive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) {
      if (isActive !== undefined) {
        filter.isActive = String(isActive).toLowerCase() === 'true';
      } else {
        filter.isActive = true;
      }
    }
    if (search) filter.name = { $regex: search as string, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [industries, total] = await Promise.all([
      Industry.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Industry.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: industries,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

export const createIndustry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, industryGroups } = req.body as { name?: string; industryGroups?: string[] };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      res.status(400).json({ success: false, message: 'Industry name is required' });
      return;
    }

    const payload = {
      name: normalizedName,
      industryGroups: Array.isArray(industryGroups)
        ? industryGroups.map((g) => String(g).trim()).filter(Boolean)
        : [],
      createdBy: req.user?._id,
    };

    const industry = await Industry.create(payload);
    const populated = await industry.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Industry already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateIndustry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        res.status(400).json({ success: false, message: 'Industry name is required' });
        return;
      }
      updates.name = normalizedName;
    }
    if (Array.isArray(updates.industryGroups)) {
      updates.industryGroups = updates.industryGroups
        .map((g) => String(g).trim())
        .filter(Boolean);
    }

    const previous = await Industry.findById(req.params.id).select('name industryGroups');
    const industry = await Industry.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!industry) {
      res.status(404).json({ success: false, message: 'Industry not found' });
      return;
    }
    await cascadeIndustryName(previous?.name, industry.name);
    await cascadeIndustryGroupNames(industry.name, previous?.industryGroups, industry.industryGroups);
    res.status(200).json({ success: true, data: industry });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Industry name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteIndustry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const industry = await Industry.findByIdAndDelete(req.params.id);
    if (!industry) {
      res.status(404).json({ success: false, message: 'Industry not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Industry deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
