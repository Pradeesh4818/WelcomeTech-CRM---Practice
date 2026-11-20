import { Response } from 'express';
import BusinessSegment from '../models/BusinessSegment';
import { AuthRequest } from '../middleware/auth';
import { cascadeBusinessSegmentName } from '../utils/masterDataCascade';

export const getBusinessSegments = async (req: AuthRequest, res: Response): Promise<void> => {
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
    const [segments, total] = await Promise.all([
      BusinessSegment.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      BusinessSegment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: segments,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

export const createBusinessSegment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      res.status(400).json({ success: false, message: 'Business Segment name is required' });
      return;
    }

    const payload = {
      name: normalizedName,
      description: String(description || '').trim() || undefined,
      createdBy: req.user?._id,
    };

    const segment = await BusinessSegment.create(payload);
    const populated = await segment.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Business Segment already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBusinessSegment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        res.status(400).json({ success: false, message: 'Business Segment name is required' });
        return;
      }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') {
      updates.description = updates.description.trim() || undefined;
    }

    const previous = await BusinessSegment.findById(req.params.id).select('name');
    const segment = await BusinessSegment.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!segment) {
      res.status(404).json({ success: false, message: 'Business Segment not found' });
      return;
    }
    await cascadeBusinessSegmentName(previous?.name, segment.name);
    res.status(200).json({ success: true, data: segment });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Business Segment name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteBusinessSegment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const segment = await BusinessSegment.findByIdAndDelete(req.params.id);
    if (!segment) {
      res.status(404).json({ success: false, message: 'Business Segment not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Business Segment deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
