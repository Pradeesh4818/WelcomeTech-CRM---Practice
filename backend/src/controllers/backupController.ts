import { Response } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth';
import BackupHistory from '../models/BackupHistory';
import { getOrCreateBackupSetting, BackupFrequency } from '../models/BackupSetting';
import { generateDatabaseBackup } from '../services/backupService';
import { reloadScheduler, getSchedulerStatus, normalizeExecutionTime } from '../services/backupScheduler';

// Allowed frequencies
const VALID_FREQUENCIES: BackupFrequency[] = ['Every day', 'Every week', 'Every 2 weeks', 'Every month'];

// @desc    Retrieve current backup settings, scheduler status, and last run metadata
// @route   GET /api/backup/settings
// @access  Private (Super Admin / Full Admin)
export const getBackupSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const setting = await getOrCreateBackupSetting();
    const scheduler = await getSchedulerStatus();

    res.status(200).json({
      success: true,
      data: {
        settings: setting,
        scheduler,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to fetch backup settings: ${err?.message}` });
  }
};

// @desc    Save backup settings and hot-reload the scheduler in memory
// @route   POST /api/backup/settings
// @access  Private (Super Admin / Full Admin)
export const updateBackupSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { automatedBackups, recipientEmail, frequency, executionTime, timezone, retentionCount } = req.body;

    const setting = await getOrCreateBackupSetting();

    if (automatedBackups !== undefined) {
      setting.automatedBackups = Boolean(automatedBackups);
    }

    if (recipientEmail !== undefined) {
      setting.recipientEmail = String(recipientEmail).trim();
    }

    if (frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(frequency)) {
        res.status(400).json({
          success: false,
          message: `Invalid backup frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`,
        });
        return;
      }
      setting.frequency = frequency;
    }

    if (executionTime !== undefined) {
      const timeStr = String(executionTime).trim();
      const isValidFormat =
        /^([01]?\d|2[0-3]):[0-5]\d$/.test(timeStr) ||
        /^(0?[1-9]|1[0-2]):[0-5]\d\s*(AM|PM)$/i.test(timeStr);

      if (!isValidFormat) {
        res.status(400).json({
          success: false,
          message:
            'Invalid execution time format. Please provide 12h format HH:mm AM/PM (e.g. 02:00 AM) or 24h format (e.g. 02:00 or 14:30)',
        });
        return;
      }
      setting.executionTime = normalizeExecutionTime(timeStr);
    }

    if (timezone !== undefined) {
      try {
        // Validate timezone with Intl.DateTimeFormat
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        setting.timezone = String(timezone).trim();
      } catch {
        res.status(400).json({
          success: false,
          message: `Invalid timezone identifier: ${timezone}. Example: 'Asia/Qatar', 'Asia/Dubai', 'UTC'`,
        });
        return;
      }
    }

    if (retentionCount !== undefined) {
      const parsedRetention = parseInt(String(retentionCount), 10);
      if (isNaN(parsedRetention) || parsedRetention < 1 || parsedRetention > 100) {
        res.status(400).json({
          success: false,
          message: 'Retention count must be a number between 1 and 100',
        });
        return;
      }
      setting.retentionCount = parsedRetention;
    }

    await setting.save();

    // Hot-reload the in-memory scheduler without requiring server reboot
    await reloadScheduler();

    const scheduler = await getSchedulerStatus();

    res.status(200).json({
      success: true,
      message: 'Backup settings saved successfully and scheduler hot-reloaded',
      data: {
        settings: setting,
        scheduler,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to update backup settings: ${err?.message}` });
  }
};

// @desc    Trigger an immediate on-demand manual backup and email dispatch
// @route   POST /api/backup/test
// @access  Private (Super Admin / Full Admin)
export const triggerManualBackup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipientEmail, mockDump } = req.body;

    const record = await generateDatabaseBackup({
      triggerType: 'Manual',
      recipientEmail: recipientEmail ? String(recipientEmail).trim() : undefined,
      mockDump: Boolean(mockDump || process.env.MOCK_MONGODUMP === 'true'),
    });

    if (record.status === 'Failed') {
      res.status(500).json({
        success: false,
        message: `Database backup failed: ${record.errorMessage}`,
        data: record,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Database backup generated and dispatched successfully (${record.fileSizeFormatted})`,
      data: record,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Error generating backup: ${err?.message}` });
  }
};

// @desc    Retrieve paginated backup execution history logs
// @route   GET /api/backup/history
// @access  Private (Super Admin / Full Admin)
export const getBackupHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 30), 10)));
    const skip = (page - 1) * limit;

    const total = await BackupHistory.countDocuments();
    const records = await BackupHistory.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        limit,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to retrieve backup history: ${err?.message}` });
  }
};

// @desc    Download specific .archive.gz file from server storage
// @route   GET /api/backup/download/:id
// @access  Private (Super Admin / Full Admin)
export const downloadBackupFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const backup = await BackupHistory.findById(id);

    if (!backup) {
      res.status(404).json({ success: false, message: 'Backup record not found' });
      return;
    }

    if (!backup.filePath || !fs.existsSync(backup.filePath)) {
      res.status(404).json({
        success: false,
        message: 'Physical backup archive not found on server disk. It may have been pruned or deleted.',
      });
      return;
    }

    const stat = fs.statSync(backup.filePath);

    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${backup.fileName}"`,
    });

    const readStream = fs.createReadStream(backup.filePath);
    readStream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to stream backup archive: ${err?.message}` });
  }
};

// @desc    Delete backup history record and unlink physical file from disk
// @route   DELETE /api/backup/history/:id
// @access  Private (Super Admin / Full Admin)
export const deleteBackupHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const backup = await BackupHistory.findById(id);

    if (!backup) {
      res.status(404).json({ success: false, message: 'Backup record not found' });
      return;
    }

    // Safely delete physical file from disk if present
    if (backup.filePath && fs.existsSync(backup.filePath)) {
      try {
        fs.unlinkSync(backup.filePath);
      } catch (err: any) {
        console.warn(`[Backup Delete] Could not unlink ${backup.filePath}:`, err?.message);
      }
    }

    await BackupHistory.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Backup history record and archive file deleted successfully',
      data: { id },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to delete backup record: ${err?.message}` });
  }
};
