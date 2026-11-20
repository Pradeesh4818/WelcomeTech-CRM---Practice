import mongoose, { Document, Schema } from 'mongoose';

export type BackupTriggerType = 'Scheduled' | 'Manual';
export type BackupStatus = 'Success' | 'Failed';

export interface IBackupHistory extends Document {
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  triggerType: BackupTriggerType;
  status: BackupStatus;
  recipientEmail: string;
  errorMessage?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BackupHistorySchema = new Schema<IBackupHistory>(
  {
    fileName: { type: String, required: true, trim: true },
    filePath: { type: String, required: true, trim: true },
    fileSizeBytes: { type: Number, required: true, default: 0 },
    fileSizeFormatted: { type: String, required: true, trim: true },
    triggerType: {
      type: String,
      enum: ['Scheduled', 'Manual'],
      required: true,
      default: 'Manual',
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      required: true,
      default: 'Success',
    },
    recipientEmail: { type: String, required: true, trim: true },
    errorMessage: { type: String, default: '', trim: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

BackupHistorySchema.index({ timestamp: -1 });
BackupHistorySchema.index({ status: 1 });
BackupHistorySchema.index({ triggerType: 1 });

export const BackupHistory = mongoose.model<IBackupHistory>('BackupHistory', BackupHistorySchema);
export default BackupHistory;
