import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getBackupSettings,
  updateBackupSettings,
  triggerManualBackup,
  getBackupHistory,
  downloadBackupFile,
  deleteBackupHistory,
} from '../backupController';
import BackupHistory from '../../models/BackupHistory';
import BackupSetting, { getOrCreateBackupSetting } from '../../models/BackupSetting';
import * as backupService from '../../services/backupService';
import * as backupScheduler from '../../services/backupScheduler';
import { requireRole, isAdminUser } from '../../middleware/auth';

vi.mock('../../models/BackupHistory', () => {
  return {
    default: {
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
    },
    BackupHistory: {
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
    },
  };
});

vi.mock('../../models/BackupSetting', () => {
  const mockSetting = {
    automatedBackups: true,
    recipientEmail: 'backup@welcometech.qa',
    frequency: 'Every day',
    executionTime: '02:00',
    timezone: 'Asia/Qatar',
    retentionCount: 14,
    save: vi.fn().mockResolvedValue(true),
  };

  return {
    default: {
      findOne: vi.fn().mockResolvedValue(mockSetting),
      create: vi.fn().mockResolvedValue(mockSetting),
    },
    BackupSetting: {
      findOne: vi.fn().mockResolvedValue(mockSetting),
      create: vi.fn().mockResolvedValue(mockSetting),
    },
    getOrCreateBackupSetting: vi.fn().mockResolvedValue(mockSetting),
  };
});

vi.mock('../../services/backupService', () => {
  return {
    generateDatabaseBackup: vi.fn(),
  };
});

vi.mock('../../services/backupScheduler', () => {
  return {
    reloadScheduler: vi.fn().mockResolvedValue(undefined),
    normalizeExecutionTime: vi.fn().mockImplementation((val) => val || '02:00'),
    getSchedulerStatus: vi.fn().mockResolvedValue({
      active: true,
      frequency: 'Every day',
      executionTime: '02:00',
      executionTime12h: '02:00 AM',
      timezone: 'Asia/Qatar',
      nextScheduledRun: 'Nov 11, 2026, 2:00 AM (Asia/Qatar)',
      lastRunAt: new Date(),
      lastRunStatus: 'Success',
    }),
  };
});

describe('Database Backup Controller Specifications (backupController)', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-ctrl-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.writeHead = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('RBAC & Role Verification (requireRole)', () => {
    it('TC-BK-RBAC-01: Blocks unauthorized roles (e.g. sales_executive, engineer) with HTTP 403', () => {
      const guard = requireRole('Super Admin', 'Full Admin');
      const req: any = { user: { role: 'sales_executive' } };
      const res = mockRes();
      const next = vi.fn();

      guard(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('TC-BK-RBAC-02: Permits "Super Admin" and "Full Admin" roles', () => {
      const guard = requireRole('Super Admin', 'Full Admin');
      const next = vi.fn();

      const superAdminReq: any = { user: { role: 'Super Admin' } };
      const res1 = mockRes();
      guard(superAdminReq, res1, next);
      expect(next).toHaveBeenCalledTimes(1);

      const fullAdminReq: any = { user: { role: 'Full Admin' } };
      const res2 = mockRes();
      guard(fullAdminReq, res2, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('TC-BK-RBAC-03: Permits system admin and accounts with hasFullAccess: true', () => {
      const guard = requireRole('Super Admin', 'Full Admin');
      const next = vi.fn();

      const adminReq: any = { user: { role: 'admin' } };
      guard(adminReq, mockRes(), next);
      expect(next).toHaveBeenCalledTimes(1);

      const fullAccessReq: any = { user: { role: { name: 'CustomRole', hasFullAccess: true } } };
      guard(fullAccessReq, mockRes(), next);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBackupSettings', () => {
    it('TC-BK-CTRL-01: Returns settings and current scheduler status', async () => {
      const req: any = { user: { role: 'Super Admin' } };
      const res = mockRes();

      await getBackupSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.success).toBe(true);
      expect(json.data.settings).toBeDefined();
      expect(json.data.scheduler).toBeDefined();
      expect(json.data.scheduler.timezone).toBe('Asia/Qatar');
    });
  });

  describe('updateBackupSettings', () => {
    it('TC-BK-CTRL-02: Rejects invalid frequency values with HTTP 400', async () => {
      const req: any = {
        body: { frequency: 'Every 5 hours' },
        user: { role: 'Super Admin' },
      };
      const res = mockRes();

      await updateBackupSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('Invalid backup frequency');
    });

    it('TC-BK-CTRL-03: Rejects malformed execution times with HTTP 400', async () => {
      const req: any = {
        body: { executionTime: '25:99' },
        user: { role: 'Super Admin' },
      };
      const res = mockRes();

      await updateBackupSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('Invalid execution time format');
    });

    it('TC-BK-CTRL-04: Rejects invalid timezone identifiers with HTTP 400', async () => {
      const req: any = {
        body: { timezone: 'Fake/Unknown_City' },
        user: { role: 'Super Admin' },
      };
      const res = mockRes();

      await updateBackupSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('Invalid timezone identifier');
    });

    it('TC-BK-CTRL-05: Saves valid settings and triggers hot-reload of scheduler', async () => {
      const req: any = {
        body: {
          automatedBackups: true,
          recipientEmail: 'alerts@welcometech.qa',
          frequency: 'Every week',
          executionTime: '03:30 PM',
          timezone: 'Asia/Qatar',
          retentionCount: 14,
        },
        user: { role: 'Super Admin' },
      };
      const res = mockRes();

      await updateBackupSettings(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(backupScheduler.reloadScheduler).toHaveBeenCalled();
    });
  });

  describe('triggerManualBackup', () => {
    it('TC-BK-CTRL-06: Invokes manual backup and returns 200 with backup payload on success', async () => {
      const mockRecord: any = {
        _id: 'rec-manual-1',
        fileName: 'welcometech-crm-manual.archive.gz',
        fileSizeFormatted: '12.4 MB',
        status: 'Success',
      };
      vi.mocked(backupService.generateDatabaseBackup).mockResolvedValue(mockRecord);

      const req: any = {
        body: { recipientEmail: 'admin@welcometech.qa' },
        user: { role: 'Super Admin' },
      };
      const res = mockRes();

      await triggerManualBackup(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].success).toBe(true);
      expect(res.json.mock.calls[0][0].data.fileName).toBe('welcometech-crm-manual.archive.gz');
    });

    it('TC-BK-CTRL-07: Returns 500 when manual backup generation fails', async () => {
      const mockFailedRecord: any = {
        _id: 'rec-manual-err',
        status: 'Failed',
        errorMessage: 'mongodump connection timed out',
      };
      vi.mocked(backupService.generateDatabaseBackup).mockResolvedValue(mockFailedRecord);

      const req: any = { body: {}, user: { role: 'Super Admin' } };
      const res = mockRes();

      await triggerManualBackup(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].success).toBe(false);
      expect(res.json.mock.calls[0][0].message).toContain('mongodump connection timed out');
    });
  });

  describe('getBackupHistory', () => {
    it('TC-BK-CTRL-08: Returns paginated backup audit history', async () => {
      vi.mocked(BackupHistory.countDocuments).mockResolvedValue(45);
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ fileName: 'test1.archive.gz' }]),
      };
      vi.mocked(BackupHistory.find).mockReturnValue(mockChain as any);

      const req: any = { query: { page: '2', limit: '20' }, user: { role: 'Super Admin' } };
      const res = mockRes();

      await getBackupHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.pagination.page).toBe(2);
      expect(json.pagination.limit).toBe(20);
      expect(json.pagination.total).toBe(45);
      expect(json.pagination.pages).toBe(3);
    });
  });

  describe('downloadBackupFile', () => {
    it('TC-BK-CTRL-09: Returns 404 when backup history record does not exist', async () => {
      vi.mocked(BackupHistory.findById).mockResolvedValue(null);
      const req: any = { params: { id: 'nonexistent-id' }, user: { role: 'Super Admin' } };
      const res = mockRes();

      await downloadBackupFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].message).toContain('Backup record not found');
    });

    it('TC-BK-CTRL-10: Returns 404 when physical file is missing from disk', async () => {
      vi.mocked(BackupHistory.findById).mockResolvedValue({
        filePath: '/invalid/path/file.archive.gz',
      } as any);
      const req: any = { params: { id: 'some-id' }, user: { role: 'Super Admin' } };
      const res = mockRes();

      await downloadBackupFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].message).toContain('Physical backup archive not found');
    });
  });

  describe('deleteBackupHistory', () => {
    it('TC-BK-CTRL-11: Unlinks physical file and deletes database record', async () => {
      const testFile = path.join(tempDir, 'delete-me.archive.gz');
      fs.writeFileSync(testFile, 'dummy content');

      vi.mocked(BackupHistory.findById).mockResolvedValue({
        _id: 'rec-to-delete',
        filePath: testFile,
      } as any);

      const req: any = { params: { id: 'rec-to-delete' }, user: { role: 'Super Admin' } };
      const res = mockRes();

      await deleteBackupHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(BackupHistory.findByIdAndDelete).toHaveBeenCalledWith('rec-to-delete');
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });
});
