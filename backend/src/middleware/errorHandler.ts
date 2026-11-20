import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { formatErrorMessage } from '../utils/formatErrorMessage';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const formatted = formatErrorMessage(err);
  let statusCode = formatted.statusCode;
  let message = formatted.message;
  const rawMessage = String(err.message || '');

  // Multer upload errors should be treated as bad request, not server crash.
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file is too large. Maximum allowed size is 2MB.';
    }
  }

  // File filter rejections (e.g. non-image uploads) should also be treated as bad request.
  if (err.message === 'Only images are allowed') {
    statusCode = 400;
    message = 'Only image files are allowed for upload.';
  }

  // Keep infrastructure/library internals from leaking into global UI toasts.
  if (
    rawMessage.includes('getConnection') ||
    rawMessage.includes('All configured authentication methods failed') ||
    rawMessage.includes('Upload sync is enabled')
  ) {
    statusCode = statusCode === 500 ? 503 : statusCode;
    message = 'Remote file sync is unavailable. Your data was saved locally; please check VPS upload sync settings.';
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};
