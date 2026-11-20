import { Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AuthRequest } from '../middleware/auth';

import { AMC } from '../models/index';
import Customer from '../models/Customer';
import { Settings } from '../models/Settings';
import { COUNTRY_PHONE_RULES, DEFAULT_COUNTRY, normalizePhone, toDigitsOnly, validatePhoneNumber } from '../utils/phoneValidation';

const execFileAsync = promisify(execFile);

type ExcelAMCPreviewRow = {
  customerName: string;
  mobile?: string;
  email?: string;
  product?: string;
  licenceType?: string;
  amcStartDate?: string;
  amcEndDate?: string;
  amount?: number;
  notes?: string;
  status: string;
};

type ExcelAMCPreview = {
  sheet: string;
  totalRows: number;
  rows: ExcelAMCPreviewRow[];
};

export const previewAMCExcelImport = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: 'Excel file is required (field: file)' });
    return;
  }

  const scriptPath = path.resolve(__dirname, '../../scripts/parse_crm_excel.py');

  try {
    const { stdout } = await execFileAsync('python3', [scriptPath, file.path], { maxBuffer: 20 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as ExcelAMCPreview;
    res.status(200).json({ success: true, data: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse Excel file';
    res.status(400).json({ success: false, message });
  } finally {
    try { await fs.unlink(file.path); } catch { /* ignore */ }
  }
};

export const importAMCs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = req.body as { rows: ExcelAMCPreviewRow[] };
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ success: false, message: 'Rows are required' });
      return;
    }

    const results = { created: 0, updated: 0, skipped: 0 };
    const userId = req.user?._id;

    for (const row of rows) {
      if (!row.customerName) {
        results.skipped++;
        continue;
      }

      // 1. Find or Create Customer
      let customer = await Customer.findOne({ 
        $or: [
          { name: { $regex: new RegExp(`^${row.customerName.trim()}$`, 'i') } },
          ...(row.email && row.email.trim() ? [{ email: row.email.trim().toLowerCase() }] : [])
        ]
      });

      if (!customer) {
        const phone = row.mobile?.trim() || '';
        let normalizedPhone = '';
        if (phone && validatePhoneNumber(phone)) {
          normalizedPhone = normalizePhone(phone);
        } else {
          normalizedPhone = '+97400000000'; // Default fallback placeholder to satisfy required Mongoose constraint
        }
        customer = await Customer.create({
          name: row.customerName.trim(),
          phone: normalizedPhone,
          email: row.email?.trim().toLowerCase(),
          contact: row.customerName.trim(),
          createdBy: userId,
          amcStatus: row.status as any || 'none',
          amcExpiry: row.amcEndDate ? new Date(row.amcEndDate) : undefined,
        });
      }

      // 2. Create AMC Record
      const amcProduct = row.product || 'TallyPrime 4.0';
      const amcExpiry = row.amcEndDate ? new Date(row.amcEndDate) : new Date();
      // Skip an identical contract (same customer + product + expiry) so
      // re-importing the same sheet doesn't create duplicate AMCs. Genuinely
      // different products/dates for the same customer are still allowed.
      const existingAmc = await AMC.findOne({ customer: customer._id, product: amcProduct, expiryDate: amcExpiry });
      if (existingAmc) {
        results.skipped++;
        continue;
      }
      await AMC.create({
        customer: customer._id,
        product: amcProduct,
        licenceType: row.licenceType || 'Silver – Single User',
        startDate: row.amcStartDate ? new Date(row.amcStartDate) : new Date(),
        expiryDate: amcExpiry,
        amount: row.amount || 0,
        status: row.status as any || 'active',
        notes: row.notes,
        createdBy: userId,
      });

      // 3. Update Customer's AMC summary
      if (row.amcEndDate) {
        await Customer.updateOne(
          { _id: customer._id },
          { 
            $set: { 
              amcStatus: row.status, 
              amcExpiry: new Date(row.amcEndDate) 
            } 
          }
        );
      }

      results.created++;
    }

    res.status(200).json({ success: true, data: results });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};
