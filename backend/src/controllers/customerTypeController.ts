import { Response } from 'express';
import CustomerType from '../models/CustomerType';
import { AuthRequest } from '../middleware/auth';
import { cascadeCustomerTypeName } from '../utils/masterDataCascade';

export const getCustomerTypes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = true;
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [customerTypes, total] = await Promise.all([
      CustomerType.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      CustomerType.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: customerTypes,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createCustomerType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const payload = {
      name: normalizedName,
      description: description ? String(description).trim() : undefined,
      createdBy: req.user?._id,
    };

    const customerType = await CustomerType.create(payload);
    const populated = await customerType.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Customer type already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCustomerType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') updates.description = updates.description.trim();

    const previous = await CustomerType.findById(req.params.id).select('name');
    const customerType = await CustomerType.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!customerType) { res.status(404).json({ success: false, message: 'Customer type not found' }); return; }
    await cascadeCustomerTypeName(previous?.name, customerType.name);
    res.status(200).json({ success: true, data: customerType });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Customer type name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteCustomerType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerType = await CustomerType.findByIdAndDelete(req.params.id);
    if (!customerType) { res.status(404).json({ success: false, message: 'Customer type not found' }); return; }
    res.status(200).json({ success: true, message: 'Customer type deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
