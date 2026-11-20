import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import mongoose from 'mongoose';
import BackupHistory, { IBackupHistory, BackupTriggerType, BackupStatus } from '../models/BackupHistory';
import BackupSetting, { getOrCreateBackupSetting } from '../models/BackupSetting';
import { Settings } from '../models/Settings';
import { sendEmail } from '../utils/mailer';

// 14 MB threshold in bytes (14 * 1024 * 1024 = 14,680,064 bytes)
export const MAX_ATTACHMENT_SIZE_BYTES = 14 * 1024 * 1024;
export const DEFAULT_RETENTION_COUNT = 14;

/**
 * Resolves the physical directory used for storing MongoDB database archives.
 * Precedence:
 * 1. BACKUP_DIR environment variable if specified
 * 2. Linux VPS production directory (/var/backups/mongodb) if accessible
 * 3. Local backend/backups fallback
 */
export const getBackupDirectory = (): string => {
  if (process.env.BACKUP_DIR) {
    const customDir = path.resolve(process.env.BACKUP_DIR);
    if (!fs.existsSync(customDir)) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
      } catch {
        // Fall back to local directory if custom directory cannot be created
      }
    }
    if (fs.existsSync(customDir)) return customDir;
  }

  if (process.platform === 'linux') {
    const vpsDir = '/var/backups/mongodb';
    try {
      if (!fs.existsSync(vpsDir)) {
        fs.mkdirSync(vpsDir, { recursive: true });
      }
      return vpsDir;
    } catch {
      // If root permission is denied, fall through to local app directory
    }
  }

  const localDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
};

/**
 * Converts byte count to a clean human-readable string (e.g. '42.5 MB', '14.2 MB', '850 KB').
 */
export const formatBytes = (bytes: number, decimals = 1): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${value} ${sizes[i]}`;
};

/**
 * Validates that the archive exists, has non-zero size, and begins with the
 * official GZIP magic bytes: 0x1f 0x8b.
 */
export const verifyArchiveIntegrity = async (filePath: string): Promise<boolean> => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archive verification failed: File not found at ${filePath}`);
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    throw new Error(`Archive verification failed: Generated file is empty (0 bytes)`);
  }

  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    const { bytesRead } = await fd.read(buffer, 0, 2, 0);
    if (bytesRead < 2) {
      throw new Error(`Archive verification failed: Insufficient header bytes read`);
    }

    // GZIP Magic Bytes: 0x1f (31) and 0x8b (139)
    if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
      throw new Error(
        `Archive verification failed: Invalid GZIP magic header (got 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}, expected 0x1f 0x8b)`
      );
    }
    return true;
  } finally {
    await fd.close();
  }
};

/**
 * Computes SHA-256 checksum of an archive for audit reports.
 */
export const computeArchiveChecksum = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
};

/**
 * Enforces automated retention policy, keeping the latest N backups (default: 14)
 * and safely unlinking physical files and history records for older runs.
 */
export const pruneOldBackups = async (
  retentionLimit = DEFAULT_RETENTION_COUNT
): Promise<{ deletedCount: number; deletedFiles: string[] }> => {
  const deletedFiles: string[] = [];
  try {
    const histories = await BackupHistory.find().sort({ timestamp: -1 });

    if (histories.length > retentionLimit) {
      const toDelete = histories.slice(retentionLimit);
      for (const record of toDelete) {
        if (record.filePath && fs.existsSync(record.filePath)) {
          try {
            fs.unlinkSync(record.filePath);
            deletedFiles.push(record.filePath);
          } catch (err) {
            console.warn(`[Backup Prune] Failed to unlink ${record.filePath}:`, err);
          }
        }
        await BackupHistory.findByIdAndDelete(record._id);
      }
    }

    // Also scan backup directory to clean up unrecorded/orphan .archive.gz files if any
    const dir = getBackupDirectory();
    if (fs.existsSync(dir)) {
      const allFiles = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.archive.gz'))
        .map((f) => ({
          name: f,
          fullPath: path.join(dir, f),
          ctime: fs.statSync(path.join(dir, f)).ctime.getTime(),
        }))
        .sort((a, b) => b.ctime - a.ctime);

      if (allFiles.length > retentionLimit) {
        const orphanFiles = allFiles.slice(retentionLimit);
        for (const file of orphanFiles) {
          if (!deletedFiles.includes(file.fullPath) && fs.existsSync(file.fullPath)) {
            try {
              fs.unlinkSync(file.fullPath);
              deletedFiles.push(file.fullPath);
            } catch (err) {
              console.warn(`[Backup Prune] Failed to unlink orphan file ${file.fullPath}:`, err);
            }
          }
        }
      }
    }

    return { deletedCount: deletedFiles.length, deletedFiles };
  } catch (err) {
    console.error('[Backup Prune] Error during backup retention pruning:', err);
    return { deletedCount: deletedFiles.length, deletedFiles };
  }
};

/**
 * Generates an executive responsive HTML email dispatched via Nodemailer / Brevo.
 * Handles attachment threshold logic:
 * - If size <= 14 MB: attaches .archive.gz directly.
 * - If size > 14 MB: omits attachment, provides executive report + direct download link.
 */
export const sendBackupEmail = async (
  backupRecord: IBackupHistory,
  checksum?: string
): Promise<any> => {
  const recipient = backupRecord.recipientEmail;
  if (!recipient) {
    console.warn('[Backup Mailer] Skipped sending backup email: No recipient email specified.');
    return null;
  }

  const settings = await Settings.findOne();
  if (!settings || !settings.smtpHost || !settings.smtpUser) {
    console.warn('[Backup Mailer] Skipped email delivery: SMTP is not configured in Settings.');
    return null;
  }

  const isOversized = backupRecord.fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES;
  const isSuccess = backupRecord.status === 'Success';
  const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://crm.welcometech.qa';
  const downloadUrl = `${backendUrl}/api/backup/download/${backupRecord._id}`;
  const appName = settings.companyName || 'Welcome Tech CRM';

  const subject = isSuccess
    ? `[Database Backup] ${appName} Full Backup - ${backupRecord.fileName} (${backupRecord.fileSizeFormatted})`
    : `[Backup Alert] ${appName} Database Backup FAILED - ${backupRecord.fileName}`;

  const formattedDate = new Date(backupRecord.timestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Qatar',
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%); color: #ffffff; padding: 28px 24px; text-align: left; }
        .header-tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 9999px; font-weight: 700; display: inline-block; margin-bottom: 8px; }
        .header-title { font-size: 22px; font-weight: 700; margin: 0; color: #ffffff; }
        .content { padding: 24px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; }
        .badge-success { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .badge-failed { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 8px 4px; font-size: 13.5px; border-bottom: 1px solid #edf2f7; }
        .grid td.label { font-weight: 600; color: #64748b; width: 38%; }
        .grid td.val { font-weight: 600; color: #0f172a; word-break: break-all; }
        .notice-box { padding: 14px 18px; border-radius: 8px; margin: 18px 0; font-size: 13px; line-height: 1.5; }
        .notice-attached { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
        .notice-oversized { background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; }
        .notice-failed { background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; }
        .btn-download { display: inline-block; background: #6d28d9; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; margin: 12px 0; }
        .code-block { background: #0f172a; color: #38bdf8; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 12px; overflow-x: auto; margin: 12px 0; word-break: break-all; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-tag">Disaster Recovery & Portability</div>
          <h1 class="header-title">${appName} — Database Backup Report</h1>
        </div>

        <div class="content">
          <p style="margin-top:0; font-size: 14px;">
            An automated database disaster recovery operation has completed. Below is the execution audit trail and verification status.
          </p>

          <div style="margin: 16px 0;">
            <span class="badge ${isSuccess ? 'badge-success' : 'badge-failed'}">
              ${isSuccess ? 'BACKUP VERIFIED & READY' : 'BACKUP FAILED'}
            </span>
          </div>

          <div class="card">
            <table class="grid">
              <tr>
                <td class="label">Status:</td>
                <td class="val">${isSuccess ? 'Success (GZIP 0x1f 0x8b Validated)' : 'Failed'}</td>
              </tr>
              <tr>
                <td class="label">Trigger Type:</td>
                <td class="val">${backupRecord.triggerType}</td>
              </tr>
              <tr>
                <td class="label">File Name:</td>
                <td class="val">${backupRecord.fileName}</td>
              </tr>
              <tr>
                <td class="label">Archive Size:</td>
                <td class="val"><strong>${backupRecord.fileSizeFormatted}</strong> (${backupRecord.fileSizeBytes.toLocaleString()} bytes)</td>
              </tr>
              <tr>
                <td class="label">Execution Time:</td>
                <td class="val">${formattedDate} (Asia/Qatar)</td>
              </tr>
              <tr>
                <td class="label">VPS Storage Path:</td>
                <td class="val">${backupRecord.filePath}</td>
              </tr>
              ${checksum ? `
              <tr>
                <td class="label">SHA-256 Checksum:</td>
                <td class="val" style="font-family: monospace; font-size: 11px;">${checksum}</td>
              </tr>
              ` : ''}
              ${backupRecord.errorMessage ? `
              <tr>
                <td class="label" style="color: #b91c1c;">Error Reason:</td>
                <td class="val" style="color: #b91c1c;">${backupRecord.errorMessage}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          ${isSuccess && !isOversized ? `
          <div class="notice-box notice-attached">
            <strong>Archive Attached:</strong> The database archive (${backupRecord.fileSizeFormatted}) is attached directly to this email. You may save it directly for offline safekeeping.
          </div>
          ` : ''}

          ${isSuccess && isOversized ? `
          <div class="notice-box notice-oversized">
            <strong>Oversized Archive Policy Enforced:</strong> The archive size (<strong>${backupRecord.fileSizeFormatted}</strong>) exceeds the 14 MB email attachment threshold. To guarantee email delivery and prevent mail server bounces, the archive has been preserved safely on the VPS server and direct download access is provided below:
            <div style="text-align: center; margin-top: 12px;">
              <a href="${downloadUrl}" class="btn-download" target="_blank" rel="noopener noreferrer">
                Download Database Archive (.archive.gz)
              </a>
            </div>
          </div>
          ` : ''}

          ${!isSuccess ? `
          <div class="notice-box notice-failed">
            <strong>Critical Alert:</strong> The database backup failed to generate or verify. Please review the error message above or test via the Admin Settings portal immediately.
          </div>
          ` : ''}

          <div style="margin-top: 24px;">
            <div style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 6px;">
              Disaster Recovery Restoration Terminal Command:
            </div>
            <div class="code-block">
mongorestore --gzip --archive="${backupRecord.filePath}" --drop
            </div>
          </div>
        </div>

        <div class="footer">
          ${appName} &bull; Welcome Tech Systems &bull; Automated Disaster Recovery Daemon &bull; Retains Last 14 Backups
        </div>
      </div>
    </body>
    </html>
  `;

  const attachments: any[] = [];
  if (isSuccess && !isOversized && fs.existsSync(backupRecord.filePath)) {
    attachments.push({
      filename: backupRecord.fileName,
      path: backupRecord.filePath,
    });
  }

  const smtpConfig = {
    host: settings.smtpHost,
    port: Number(settings.smtpPort || 587),
    user: settings.smtpUser,
    pass: settings.smtpPassword || '',
    secure: settings.mailEncryption === 'ssl',
    fromEmail: settings.senderEmail || settings.smtpUser,
    fromName: settings.mailFromName || settings.companyName || 'Welcome Tech CRM',
  };

  try {
    const result = await sendEmail(
      smtpConfig,
      recipient,
      subject,
      html,
      undefined,
      undefined,
      attachments.length ? attachments : undefined
    );
    console.log(`[Backup Mailer] Dispatched backup notice to ${recipient} (Attached: ${attachments.length > 0})`);
    return result;
  } catch (err: any) {
    console.error(`[Backup Mailer] Failed to deliver backup email to ${recipient}:`, err?.message || err);
    throw err;
  }
};

/**
 * Spawns the native mongodump binary to create a full binary BSON stream with GZIP compression.
 */
export const spawnMongodump = async (
  uri: string,
  outputPath: string
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    // If running in test environment or custom mock mode
    if (process.env.MOCK_MONGODUMP === 'true') {
      const mockGzipHeader = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
      fs.writeFileSync(outputPath, mockGzipHeader);
      return resolve({ stdout: 'Mock dump generated', stderr: '' });
    }

    const args = [`--uri=${uri}`, `--archive=${outputPath}`, '--gzip'];
    const child = spawn('mongodump', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn mongodump binary: ${err.message}. Ensure mongodb-database-tools are installed on host.`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`mongodump process exited with error code ${code}: ${stderr || stdout}`));
      }
    });
  });
};

/**
 * Core Orchestrator:
 * Generates a full database backup using native mongodump, validates GZIP integrity,
 * prunes older backups, updates scheduler metadata, and dispatches the email.
 */
export const generateDatabaseBackup = async (options: {
  triggerType?: BackupTriggerType;
  recipientEmail?: string;
  mockDump?: boolean;
}): Promise<IBackupHistory> => {
  const triggerType: BackupTriggerType = options.triggerType || 'Manual';
  const setting = await getOrCreateBackupSetting();
  const recipientEmail = options.recipientEmail || setting.recipientEmail;

  const timestamp = new Date();
  const isoString = timestamp.toISOString().replace(/[:.]/g, '-');
  const fileName = `welcometech-crm-${isoString}.archive.gz`;
  const backupDir = getBackupDirectory();
  const filePath = path.join(backupDir, fileName);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';

  let status: BackupStatus = 'Success';
  let errorMessage = '';
  let fileSizeBytes = 0;
  let fileSizeFormatted = '0 B';
  let checksum = '';

  try {
    if (options.mockDump) {
      // Mock GZIP file for fast, deterministic testing without live DB mongodump
      const header = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
      fs.writeFileSync(filePath, header);
    } else {
      await spawnMongodump(mongoUri, filePath);
    }

    // Verify magic bytes (0x1f 0x8b) and non-zero size
    await verifyArchiveIntegrity(filePath);

    const stats = await fs.promises.stat(filePath);
    fileSizeBytes = stats.size;
    fileSizeFormatted = formatBytes(fileSizeBytes);
    checksum = await computeArchiveChecksum(filePath);

    // Prune backups beyond the retention limit
    await pruneOldBackups(setting.retentionCount || DEFAULT_RETENTION_COUNT);
  } catch (err: any) {
    status = 'Failed';
    errorMessage = err?.message || String(err);
    console.error(`[Backup Error] Backup generation failed: ${errorMessage}`);
  }

  // Create audit history document
  const history = await BackupHistory.create({
    fileName,
    filePath,
    fileSizeBytes,
    fileSizeFormatted,
    triggerType,
    status,
    recipientEmail: recipientEmail || 'admin@welcometech.qa',
    errorMessage,
    timestamp,
  });

  // Update BackupSetting with last run audit metadata
  setting.lastRunAt = timestamp;
  setting.lastRunStatus = status;
  setting.lastRunFileName = fileName;
  setting.lastRunFileSize = fileSizeFormatted;
  await setting.save();

  // Dispatch email notification if recipient is configured
  if (recipientEmail) {
    try {
      await sendBackupEmail(history, checksum);
    } catch (emailErr: any) {
      console.warn(`[Backup Mailer] Failed to email backup notification: ${emailErr?.message}`);
    }
  }

  return history;
};
