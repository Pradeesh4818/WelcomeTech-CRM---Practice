import multer from 'multer';
import path from 'path';
import { ensureUploadDir } from '../config/storage';

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let subdir = 'avatars';
    if (file.fieldname === 'passport') subdir = 'passports';
    if (file.fieldname === 'qidDocument' || file.fieldname === 'qid') subdir = 'qids';
    if (file.fieldname === 'documents') subdir = 'documents';
    cb(null, ensureUploadDir(subdir));
  },
  filename: (_req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + suffix + path.extname(file.originalname));
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only images and PDFs are allowed'), false);
  }
};

export const employeeUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
