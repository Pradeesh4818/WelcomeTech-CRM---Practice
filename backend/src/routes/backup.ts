import { Router } from 'express';
import {
  getBackupSettings,
  updateBackupSettings,
  triggerManualBackup,
  getBackupHistory,
  downloadBackupFile,
  deleteBackupHistory,
} from '../controllers/backupController';
import { protect as attachUser, requireRole } from '../middleware/auth';

const router = Router();

// Strict Security & RBAC: All endpoints restricted to Super Admin and Full Admin roles
const adminGuard = [attachUser, requireRole('Super Admin', 'Full Admin', 'admin')];

router.get('/settings', ...adminGuard, getBackupSettings);
router.post('/settings', ...adminGuard, updateBackupSettings);
router.post('/test', ...adminGuard, triggerManualBackup);
router.get('/history', ...adminGuard, getBackupHistory);
router.get('/download/:id', ...adminGuard, downloadBackupFile);
router.delete('/history/:id', ...adminGuard, deleteBackupHistory);

export default router;
