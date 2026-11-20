import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  formatBytes,
  verifyArchiveIntegrity,
  pruneOldBackups,
  sendBackupEmail,
  generateDatabaseBackup,
  MAX_ATTACHMENT_SIZE_BYTES,
  DEFAULT_RETENTION_COUNT,
} from '../backupService';
import BackupHistory from '../../models/BackupHistory';
import BackupSetting from '../../models/BackupSetting';
import { Settings } from '../../models/Settings';
import * as mailer from '../../utils/mailer';

vi.mock('../../models/BackupHistory', () => {
  return {
    default: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn(),
      countDocuments: vi.fn(),
    },
    BackupHistory: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn(),
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

vi.mock('../../models/Settings', () => {
  return {
    Settings: {
      findOne: vi.fn().mockResolvedValue({
        smtpHost: 'smtp.brevo.com',
        smtpPort: 587,
        smtpUser: 'smtp_user@welcometech.qa',
        smtpPassword: 'secretpassword',
        senderEmail: 'backup@welcometech.qa',
        companyName: 'Welcome Tech CRM',
        mailEncryption: 'tls',
      }),
    },
  };
});

vi.mock('../../utils/mailer', () => {
  return {
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-msg-id-123' }),
  };
});

describe('Database Backup Service Specifications (backupService)', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('formatBytes helper', () => {
    it('TC-BK-UNIT-01: Correctly formats bytes into human readable units', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(14 * 1024 * 1024)).toBe('14 MB');
      expect(formatBytes(42.5 * 1024 * 1024)).toBe('42.5 MB');
      expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB');
    });
  });

  describe('verifyArchiveIntegrity', () => {
    it('TC-BK-UNIT-02: Rejects non-existent archive files with a descriptive error', async () => {
      const nonExistent = path.join(tempDir, 'does-not-exist.archive.gz');
      await expect(verifyArchiveIntegrity(nonExistent)).rejects.toThrow(
        /Archive verification failed: File not found/
      );
    });

    it('TC-BK-UNIT-03: Rejects empty (0 byte) files', async () => {
      const emptyFile = path.join(tempDir, 'empty.archive.gz');
      fs.writeFileSync(emptyFile, Buffer.alloc(0));
      await expect(verifyArchiveIntegrity(emptyFile)).rejects.toThrow(
        /Archive verification failed: Generated file is empty/
      );
    });

    it('TC-BK-UNIT-04: Rejects files with invalid magic bytes (not GZIP)', async () => {
      const corruptFile = path.join(tempDir, 'corrupt.archive.gz');
      fs.writeFileSync(corruptFile, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP header instead of GZIP
      await expect(verifyArchiveIntegrity(corruptFile)).rejects.toThrow(
        /Archive verification failed: Invalid GZIP magic header/
      );
    });

    it('TC-BK-UNIT-05: Confirms valid GZIP magic bytes (0x1f 0x8b)', async () => {
      const validGzip = path.join(tempDir, 'valid.archive.gz');
      fs.writeFileSync(validGzip, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]));
      const isValid = await verifyArchiveIntegrity(validGzip);
      expect(isValid).toBe(true);
    });
  });

  describe('pruneOldBackups (14 Copies Retention Policy)', () => {
    it('TC-BK-UNIT-06: Maintains exactly the retention limit and unlinks older files', async () => {
      const createdFiles: string[] = [];
      const mockHistories: any[] = [];

      for (let i = 0; i < 18; i++) {
        const filePath = path.join(tempDir, `backup-${i}.archive.gz`);
        fs.writeFileSync(filePath, Buffer.from([0x1f, 0x8b, 0x08]));
        createdFiles.push(filePath);
        mockHistories.push({
          _id: `id-${i}`,
          filePath,
          timestamp: new Date(Date.now() - i * 1000 * 60 * 60),
        });
      }

      vi.mocked(BackupHistory.find).mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockHistories),
      } as any);

      const result = await pruneOldBackups(14);

      // The 4 oldest (indices 14, 15, 16, 17) should be pruned
      expect(BackupHistory.findByIdAndDelete).toHaveBeenCalledTimes(4);
      expect(result.deletedFiles.length).toBeGreaterThanOrEqual(4);

      // Verify the 4 oldest files were unlinked from disk
      expect(fs.existsSync(createdFiles[14])).toBe(false);
      expect(fs.existsSync(createdFiles[15])).toBe(false);
      expect(fs.existsSync(createdFiles[16])).toBe(false);
      expect(fs.existsSync(createdFiles[17])).toBe(false);

      // Verify the newest 14 files are still preserved
      for (let i = 0; i < 14; i++) {
        expect(fs.existsSync(createdFiles[i])).toBe(true);
      }
    });
  });

  describe('sendBackupEmail (Threshold & Delivery)', () => {
    it('TC-BK-UNIT-07: Attaches archive directly when size is <= 14 MB', async () => {
      const smallFile = path.join(tempDir, 'small-backup.archive.gz');
      fs.writeFileSync(smallFile, Buffer.from([0x1f, 0x8b, 0x08]));

      const mockRecord: any = {
        _id: 'rec-123',
        fileName: 'welcometech-crm-small.archive.gz',
        filePath: smallFile,
        fileSizeBytes: 5 * 1024 * 1024, // 5 MB <= 14 MB
        fileSizeFormatted: '5 MB',
        triggerType: 'Manual',
        status: 'Success',
        recipientEmail: 'admin@welcometech.qa',
        timestamp: new Date(),
      };

      await sendBackupEmail(mockRecord, 'dummy-sha256');

      expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
      const args = vi.mocked(mailer.sendEmail).mock.calls[0];
      const attachments = args[6];

      expect(attachments).toBeDefined();
      expect(attachments?.length).toBe(1);
      expect(attachments?.[0].filename).toBe('welcometech-crm-small.archive.gz');
      expect(attachments?.[0].path).toBe(smallFile);
    });

    it('TC-BK-UNIT-08: Omits attachment and includes executive audit report when size > 14 MB', async () => {
      const largeFile = path.join(tempDir, 'large-backup.archive.gz');
      fs.writeFileSync(largeFile, Buffer.from([0x1f, 0x8b, 0x08]));

      const mockRecord: any = {
        _id: 'rec-456',
        fileName: 'welcometech-crm-large.archive.gz',
        filePath: largeFile,
        fileSizeBytes: 42.5 * 1024 * 1024, // 42.5 MB > 14 MB
        fileSizeFormatted: '42.5 MB',
        triggerType: 'Scheduled',
        status: 'Success',
        recipientEmail: 'admin@welcometech.qa',
        timestamp: new Date(),
      };

      await sendBackupEmail(mockRecord, 'checksum-large');

      expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
      const args = vi.mocked(mailer.sendEmail).mock.calls[0];
      const attachments = args[6];
      const htmlBody = args[3];

      // Attachments MUST be empty or undefined to prevent SMTP gateway bounce
      expect(attachments).toBeUndefined();

      // HTML body MUST contain the oversized policy notice and direct download link
      expect(htmlBody).toContain('Oversized Archive Policy Enforced');
      expect(htmlBody).toContain('/api/backup/download/rec-456');
      expect(htmlBody).toContain('42.5 MB');
    });
  });

  describe('generateDatabaseBackup', () => {
    it('TC-BK-UNIT-09: Orchestrates backup generation, integrity check, history logging and email dispatch', async () => {
      const mockCreatedHistory: any = {
        _id: 'rec-orch-1',
        fileName: 'welcometech-crm-test.archive.gz',
        filePath: path.join(tempDir, 'welcometech-crm-test.archive.gz'),
        fileSizeBytes: 10,
        fileSizeFormatted: '10 B',
        triggerType: 'Manual',
        status: 'Success',
        recipientEmail: 'admin@welcometech.qa',
        timestamp: new Date(),
      };

      vi.mocked(BackupHistory.create).mockResolvedValue(mockCreatedHistory);

      const result = await generateDatabaseBackup({
        triggerType: 'Manual',
        recipientEmail: 'admin@welcometech.qa',
        mockDump: true,
      });

      expect(BackupHistory.create).toHaveBeenCalled();
      expect(result.status).toBe('Success');
      expect(result.recipientEmail).toBe('admin@welcometech.qa');
    });
  });
});
