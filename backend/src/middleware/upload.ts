import multer from 'multer';
import path from 'path';
import { ensureUploadDir } from '../config/storage';

const AGREEMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf'];
const FONT_MIME_TYPES = [
  'font/woff2',
  'font/woff',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-woff',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/octet-stream',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subdir = 'avatars';
    if (file.fieldname === 'logo' || file.fieldname === 'proposalWatermark') subdir = 'settings';
    if (file.fieldname === 'headingFontFile' || file.fieldname === 'contentFontFile') subdir = 'settings';
    if (file.fieldname === 'agreementCopy') subdir = 'agreements';
    cb(null, ensureUploadDir(subdir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.fieldname === 'agreementCopy') {
    if (AGREEMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Agreement copy must be a PDF, Word document, or image'), false);
    }
  } else if (file.fieldname === 'headingFontFile' || file.fieldname === 'contentFontFile') {
    const ext = path.extname(file.originalname).toLowerCase();
    if (FONT_EXTENSIONS.includes(ext) && FONT_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Font upload must be a WOFF2, WOFF, TTF, or OTF file'), false);
    }
  } else if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only images are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
