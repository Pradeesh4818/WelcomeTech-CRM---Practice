import { Response } from 'express';
import IndustryType from '../models/IndustryType';
import { AuthRequest } from '../middleware/auth';
import { cascadeIndustryTypeName } from '../utils/masterDataCascade';

export const getIndustryTypes = async (req: AuthRequest, res: Response): Promise<void> => {
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
    const [types, total] = await Promise.all([
      IndustryType.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      IndustryType.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: types,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

export const createIndustryType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      res.status(400).json({ success: false, message: 'Industry Type name is required' });
      return;
    }

    const payload = {
      name: normalizedName,
      description: String(description || '').trim() || undefined,
      createdBy: req.user?._id,
    };

    const type = await IndustryType.create(payload);
    const populated = await type.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Industry Type already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateIndustryType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        res.status(400).json({ success: false, message: 'Industry Type name is required' });
        return;
      }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') {
      updates.description = updates.description.trim() || undefined;
    }

    const previous = await IndustryType.findById(req.params.id).select('name');
    const type = await IndustryType.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!type) {
      res.status(404).json({ success: false, message: 'Industry Type not found' });
      return;
    }
    await cascadeIndustryTypeName(previous?.name, type.name);
    res.status(200).json({ success: true, data: type });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Industry Type name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteIndustryType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const type = await IndustryType.findByIdAndDelete(req.params.id);
    if (!type) {
      res.status(404).json({ success: false, message: 'Industry Type not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Industry Type deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
