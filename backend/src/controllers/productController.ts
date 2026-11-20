import { Response } from 'express';
import Product from '../models/Product';
import { AuthRequest } from '../middleware/auth';
import { cascadeProductName } from '../utils/masterDataCascade';

export const getProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, includeInactive, page = 1, limit = 10 } = req.query;

    const filter: Record<string, unknown> = {};
    const includeInactiveBool = String(includeInactive || '').toLowerCase() === 'true';
    if (!includeInactiveBool) filter.isActive = true;
    if (search) filter.$text = { $search: search as string };

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('createdBy', 'name')
        .sort({ _id: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: products,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body as { name?: string };
    const normalizedName = String(name || '').trim();
    if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }

    const payload = {
      name: normalizedName,
      createdBy: req.user?._id,
    };

    const product = await Product.create(payload);
    const populated = await product.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: populated });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Product already exists' }); return; }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body } as Record<string, unknown>;
    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) { res.status(400).json({ success: false, message: 'Name is required' }); return; }
      updates.name = normalizedName;
    }

    const previous = await Product.findById(req.params.id).select('name');
    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('createdBy', 'name');
    if (!product) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    await cascadeProductName(previous?.name, product.name);
    res.status(200).json({ success: true, data: product });
  } catch (err: unknown) {
    const error = err as { code?: number; message: string };
    if (error.code === 11000) { res.status(400).json({ success: false, message: 'Product name already exists' }); return; }
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) { res.status(404).json({ success: false, message: 'Product not found' }); return; }
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

import * as XLSX from 'xlsx';
import fs from 'fs';

export const importHSNCodes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet) as any[];

    let updatedCount = 0;
    for (const row of data) {
      const productName = row['Product Name'] || row['Name'] || row['product'];
      const hsn = row['HSN Code'] || row['HSN'] || row['hsn'];

      if (productName && hsn) {
        await Product.updateOne(
          { name: { $regex: new RegExp(`^${productName.trim()}$`, 'i') } },
          { $set: { hsnCode: String(hsn).trim() } }
        );
        updatedCount++;
      }
    }

    // Cleanup: remove temp file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.status(200).json({ success: true, message: `Successfully processed ${data.length} rows, updated ${updatedCount} HSN codes.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Error processing file' });
  }
};
