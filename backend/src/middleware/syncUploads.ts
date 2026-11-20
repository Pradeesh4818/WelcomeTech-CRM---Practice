import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { syncFileToVps, UPLOAD_SYNC_ENABLED } from '../config/uploadSync';

const flattenFiles = (req: Request): Express.Multer.File[] => {
  const collected: Express.Multer.File[] = [];
  if (req.file) {
    collected.push(req.file);
  }

  if (Array.isArray(req.files)) {
    collected.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) collected.push(...value);
    }
  }

  return collected;
};

export const syncUploadedFilesToVps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!UPLOAD_SYNC_ENABLED) {
    next();
    return;
  }

  try {
    const files = flattenFiles(req);
    for (const file of files) {
      const subdir = path.basename(file.destination || '');
      // Keep filename unchanged so stored DB URLs map correctly.
      // eslint-disable-next-line no-await-in-loop
      await syncFileToVps(file.path, subdir, file.filename);
    }
    next();
  } catch (error: any) {
    const message = error?.message || 'Unknown upload sync error';
    console.warn(`[Upload Sync] VPS sync FAILED (file saved locally only): ${message}`);
    (req as any).uploadSyncWarning = message;
    // Surface the degraded state to the caller instead of silently succeeding.
    res.setHeader('X-Upload-Sync-Warning', message.replace(/[\r\n]+/g, ' ').slice(0, 200));
    next();
  }
};
