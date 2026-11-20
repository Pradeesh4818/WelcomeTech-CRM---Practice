import { Response } from 'express';
import VendorCategory from '../models/VendorCategory';
import { AuthRequest } from '../middleware/auth';
import { cascadeVendorCategoryName } from '../utils/masterDataCascade';

export const getVendorCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = true;
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [vendorCategories, total] = await Promise.all([
      VendorCategory.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      VendorCategory.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: vendorCategories,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createVendorCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const payload = {
      name: normalizedName,
      description: description ? String(description).trim() : undefined,
      createdBy: req.user?._id,
    };

    const vendorCategory = await VendorCategory.create(payload);
    const populated = await vendorCategory.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Vendor category already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateVendorCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') updates.description = updates.description.trim();

    const previous = await VendorCategory.findById(req.params.id).select('name');
    const vendorCategory = await VendorCategory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!vendorCategory) { res.status(404).json({ success: false, message: 'Vendor category not found' }); return; }
    await cascadeVendorCategoryName(previous?.name, vendorCategory.name);
    res.status(200).json({ success: true, data: vendorCategory });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Vendor category name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteVendorCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const vendorCategory = await VendorCategory.findByIdAndDelete(req.params.id);
    if (!vendorCategory) { res.status(404).json({ success: false, message: 'Vendor category not found' }); return; }
    res.status(200).json({ success: true, message: 'Vendor category deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
