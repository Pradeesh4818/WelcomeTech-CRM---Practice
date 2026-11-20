import fs from 'fs';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { loadEnv } from './env';

loadEnv();

const toBool = (value?: string): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const normalizePosix = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+$/, '');

export const UPLOAD_SYNC_ENABLED = toBool(process.env.UPLOAD_SYNC_TO_VPS);
export const UPLOAD_SYNC_HOST = process.env.UPLOAD_SYNC_HOST || '';
export const UPLOAD_SYNC_PORT = Number(process.env.UPLOAD_SYNC_PORT || 22);
export const UPLOAD_SYNC_USER = process.env.UPLOAD_SYNC_USER || '';
export const UPLOAD_SYNC_PASSWORD = process.env.UPLOAD_SYNC_PASSWORD || '';
export const UPLOAD_SYNC_BASE_DIR = normalizePosix(
  process.env.UPLOAD_SYNC_BASE_DIR || '/staginger/uploads/welcometech-crm-staging'
);

const ensureRemoteDir = async (sftp: SftpClient, remoteDir: string): Promise<void> => {
  const normalized = normalizePosix(remoteDir);
  const parts = normalized.split('/').filter(Boolean);
  let current = '';
  for (const segment of parts) {
    current += `/${segment}`;
    // mkdir with "recursive true" behavior over SFTP.
    try {
      // eslint-disable-next-line no-await-in-loop
      await sftp.mkdir(current, true);
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (!msg.includes('Failure') && !msg.includes('exists')) {
        throw error;
      }
    }
  }
};

export const syncFileToVps = async (localFilePath: string, subdir: string, filename: string): Promise<void> => {
  if (!UPLOAD_SYNC_ENABLED) return;
  if (!UPLOAD_SYNC_HOST || !UPLOAD_SYNC_USER) {
    throw new Error('Upload sync is enabled but VPS connection env vars are missing');
  }

  const resolvedLocal = path.resolve(localFilePath);
  if (!fs.existsSync(resolvedLocal)) {
    throw new Error(`Local upload file not found: ${resolvedLocal}`);
  }

  const remoteSubdir = normalizePosix(subdir || '').replace(/^\/+/, '');
  const remoteDir = remoteSubdir
    ? `${UPLOAD_SYNC_BASE_DIR}/${remoteSubdir}`
    : UPLOAD_SYNC_BASE_DIR;
  const remoteFile = `${remoteDir}/${filename}`;

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: UPLOAD_SYNC_HOST,
      port: UPLOAD_SYNC_PORT,
      username: UPLOAD_SYNC_USER,
      password: UPLOAD_SYNC_PASSWORD || undefined,
    });
    await ensureRemoteDir(sftp, remoteDir);
    await sftp.fastPut(resolvedLocal, remoteFile);
  } finally {
    await sftp.end().catch(() => undefined);
  }
};
