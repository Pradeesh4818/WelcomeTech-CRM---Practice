import { Response } from 'express';
import LicenceType from '../models/LicenceType';
import { AuthRequest } from '../middleware/auth';
import { cascadeLicenceTypeName } from '../utils/masterDataCascade';

export const getLicenceTypes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = true;
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [licenceTypes, total] = await Promise.all([
      LicenceType.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      LicenceType.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: licenceTypes,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createLicenceType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const payload = {
      name: normalizedName,
      description: description ? String(description).trim() : undefined,
      createdBy: req.user?._id,
    };

    const licenceType = await LicenceType.create(payload);
    const populated = await licenceType.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Licence type already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLicenceType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }
    if (typeof updates.description === 'string') updates.description = updates.description.trim();

    const previous = await LicenceType.findById(req.params.id).select('name');
    const licenceType = await LicenceType.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!licenceType) { res.status(404).json({ success: false, message: 'Licence type not found' }); return; }
    await cascadeLicenceTypeName(previous?.name, licenceType.name);
    res.status(200).json({ success: true, data: licenceType });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Licence type name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteLicenceType = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const licenceType = await LicenceType.findByIdAndDelete(req.params.id);
    if (!licenceType) { res.status(404).json({ success: false, message: 'Licence type not found' }); return; }
    res.status(200).json({ success: true, message: 'Licence type deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
