import multer from 'multer';
import path from 'path';
import { ensureUploadDir } from '../config/storage';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureUploadDir('leads'));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// Restrict to safe document/image types. SVG is deliberately excluded because
// it can carry inline scripts and would execute as stored XSS when served.
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PNG, JPG, GIF, WEBP images and PDF files are allowed'), false);
  }
};

export const leadUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});
