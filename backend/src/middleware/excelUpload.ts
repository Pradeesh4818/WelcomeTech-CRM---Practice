import multer from 'multer';
import path from 'path';
import { ensureUploadDir } from '../config/storage';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureUploadDir('imports'));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'excel-' + uniqueSuffix + path.extname(file.originalname || '.xlsx'));
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isXlsx = ext === '.xlsx';
  const isMimetypeOk =
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/octet-stream' ||
    file.mimetype === 'application/zip';

  if (isXlsx && isMimetypeOk) cb(null, true);
  else cb(new Error('Only .xlsx files are allowed'), false);
};

export const uploadExcel = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
