import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTimeInTimezone,
  shouldRunBackupNow,
  calculateNextScheduledRun,
  initBackupScheduler,
  reloadScheduler,
  stopScheduler,
  getSchedulerStatus,
} from '../backupScheduler';
import BackupSetting from '../../models/BackupSetting';
import * as backupService from '../backupService';

vi.mock('../../models/BackupSetting', () => {
  const mockSetting = {
    automatedBackups: true,
    recipientEmail: 'backup@welcometech.qa',
    frequency: 'Every day',
    executionTime: '02:00',
    timezone: 'Asia/Qatar',
    lastRunAt: new Date('2026-11-09T23:00:00Z'),
    lastRunStatus: 'Success',
    retentionCount: 14,
  };
  return {
    default: {
      findOne: vi.fn().mockResolvedValue(mockSetting),
    },
    BackupSetting: {
      findOne: vi.fn().mockResolvedValue(mockSetting),
    },
  };
});

vi.mock('../backupService', () => {
  return {
    generateDatabaseBackup: vi.fn().mockResolvedValue({
      status: 'Success',
      fileName: 'mock.archive.gz',
    }),
  };
});

describe('Database Backup Scheduler Specifications (backupScheduler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopScheduler();
  });

  describe('getTimeInTimezone', () => {
    it('TC-SCHED-01: Correctly calculates wall-clock time in Asia/Qatar (UTC+03:00)', () => {
      // 2026-11-10 23:00 UTC = 2026-11-11 02:00 AM in Asia/Qatar
      const utcDate = new Date('2026-11-10T23:00:00Z');
      const qatarTime = getTimeInTimezone(utcDate, 'Asia/Qatar');

      expect(qatarTime.timeString).toBe('02:00');
      expect(qatarTime.dateString).toBe('2026-11-11');
      expect(qatarTime.hour).toBe(2);
      expect(qatarTime.minute).toBe(0);
    });
  });

  describe('shouldRunBackupNow', () => {
    const baseSetting: any = {
      automatedBackups: true,
      recipientEmail: 'backup@welcometech.qa',
      frequency: 'Every day',
      executionTime: '02:00',
      timezone: 'Asia/Qatar',
    };

    it('TC-SCHED-02: Returns false when automated backups toggle is disabled', () => {
      const disabledSetting = { ...baseSetting, automatedBackups: false };
      const date = new Date('2026-11-10T23:00:00Z'); // 02:00 AM Qatar
      expect(shouldRunBackupNow(disabledSetting, date)).toBe(false);
    });

    it('TC-SCHED-03: Returns false when current wall-clock time does not match executionTime', () => {
      const date = new Date('2026-11-10T12:30:00Z'); // 15:30 Qatar != 02:00
      expect(shouldRunBackupNow(baseSetting, date)).toBe(false);
    });

    it('TC-SCHED-04: Returns true for "Every day" at the configured execution time', () => {
      const date = new Date('2026-11-10T23:00:00Z'); // 02:00 Qatar
      expect(shouldRunBackupNow(baseSetting, date)).toBe(true);
    });

    it('TC-SCHED-05: Returns true for "Every week" only on Sundays', () => {
      const weeklySetting = { ...baseSetting, frequency: 'Every week' };

      // Sunday 2026-11-15 02:00 AM Qatar (2026-11-14 23:00 UTC)
      const sunday = new Date('2026-11-14T23:00:00Z');
      expect(shouldRunBackupNow(weeklySetting, sunday)).toBe(true);

      // Monday 2026-11-16 02:00 AM Qatar (2026-11-15 23:00 UTC)
      const monday = new Date('2026-11-15T23:00:00Z');
      expect(shouldRunBackupNow(weeklySetting, monday)).toBe(false);
    });

    it('TC-SCHED-06: Returns true for "Every month" only on the 1st of the month', () => {
      const monthlySetting = { ...baseSetting, frequency: 'Every month' };

      // 1st of December 2026 02:00 AM Qatar (2026-11-30 23:00 UTC)
      const firstOfMonth = new Date('2026-11-30T23:00:00Z');
      expect(shouldRunBackupNow(monthlySetting, firstOfMonth)).toBe(true);

      // 2nd of December 2026 02:00 AM Qatar (2026-12-01 23:00 UTC)
      const secondOfMonth = new Date('2026-12-01T23:00:00Z');
      expect(shouldRunBackupNow(monthlySetting, secondOfMonth)).toBe(false);
    });
  });

  describe('calculateNextScheduledRun', () => {
    it('TC-SCHED-07: Computes next run timestamp and human-readable string in Asia/Qatar', () => {
      const setting: any = {
        automatedBackups: true,
        frequency: 'Every day',
        executionTime: '02:00',
        timezone: 'Asia/Qatar',
      };

      const refDate = new Date('2026-11-10T10:00:00Z'); // 13:00 Qatar
      const nextRun = calculateNextScheduledRun(setting, refDate);

      expect(nextRun).not.toBeNull();
      expect(nextRun?.formattedNextRun).toContain('Asia/Qatar');
    });

    it('TC-SCHED-08: Returns null when automated backups are disabled', () => {
      const setting: any = {
        automatedBackups: false,
        frequency: 'Every day',
        executionTime: '02:00',
        timezone: 'Asia/Qatar',
      };
      expect(calculateNextScheduledRun(setting)).toBeNull();
    });
  });

  describe('getSchedulerStatus and reloadScheduler', () => {
    it('TC-SCHED-09: Successfully queries status and reloads scheduler in memory without error', async () => {
      const status = await getSchedulerStatus();
      expect(status.active).toBe(true);
      expect(status.frequency).toBe('Every day');
      expect(status.timezone).toBe('Asia/Qatar');

      await reloadScheduler();
      stopScheduler();
    });
  });
});
