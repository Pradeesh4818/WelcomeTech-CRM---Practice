import fs from 'fs';
import path from 'path';
import { loadEnv } from './env';

loadEnv();

const sanitizePublicBase = (value?: string): string => {
  const raw = (value || '/uploads').trim();
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.replace(/\/+$/, '') || '/uploads';
};

const sanitizeRootDir = (value?: string): string => {
  const raw = (value || 'uploads').trim();
  return raw.replace(/\/+$/, '') || 'uploads';
};

export const UPLOAD_ROOT_DIR = sanitizeRootDir(process.env.UPLOAD_ROOT_DIR);
export const UPLOAD_PUBLIC_BASE = sanitizePublicBase(process.env.UPLOAD_PUBLIC_BASE);

export const toUploadDiskDir = (subdir: string): string =>
  path.join(UPLOAD_ROOT_DIR, subdir);

export const ensureUploadDir = (subdir: string): string => {
  const dir = toUploadDiskDir(subdir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const buildUploadUrl = (subdir: string, filename: string): string =>
  `${UPLOAD_PUBLIC_BASE}/${subdir}/${filename}`;
