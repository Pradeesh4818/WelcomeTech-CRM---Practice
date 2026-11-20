import { Response } from 'express';
import TicketCategory from '../models/TicketCategory';
import { AuthRequest } from '../middleware/auth';
import { cascadeTicketCategoryName, cascadeTicketSubCategoryNames } from '../utils/masterDataCascade';

export const getTicketCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = true;
    if (search) filter.name = { $regex: search as string, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [categories, total] = await Promise.all([
      TicketCategory.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      TicketCategory.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: categories,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

export const createTicketCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, subCategories } = req.body as { name?: string; subCategories?: string[] };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }

    const payload = {
      name: normalizedName,
      subCategories: subCategories || [],
      createdBy: req.user?._id,
    };

    const category = await TicketCategory.create(payload);
    const populated = await category.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Ticket Category already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTicketCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        res.status(400).json({ success: false, message: 'Category name is required' });
        return;
      }
      updates.name = normalizedName;
    }

    const previous = await TicketCategory.findById(req.params.id).select('name subCategories');
    const category = await TicketCategory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!category) {
      res.status(404).json({ success: false, message: 'Ticket Category not found' });
      return;
    }
    await cascadeTicketCategoryName(previous?.name, category.name);
    await cascadeTicketSubCategoryNames(category.name, previous?.subCategories, category.subCategories);
    res.status(200).json({ success: true, data: category });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) {
      res.status(400).json({ success: false, message: 'Ticket Category name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteTicketCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const category = await TicketCategory.findByIdAndDelete(req.params.id);
    if (!category) {
      res.status(404).json({ success: false, message: 'Ticket Category not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Ticket Category deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
