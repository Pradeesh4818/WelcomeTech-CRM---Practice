import mongoose, { Document, Schema } from 'mongoose';

export type BackupFrequency = 'Every day' | 'Every week' | 'Every 2 weeks' | 'Every month';

export interface IBackupSetting extends Document {
  automatedBackups: boolean;
  recipientEmail: string;
  frequency: BackupFrequency;
  executionTime: string; // HH:mm 24-hour format
  timezone: string; // e.g. 'Asia/Qatar'
  lastRunAt?: Date;
  lastRunStatus?: 'Success' | 'Failed';
  lastRunFileName?: string;
  lastRunFileSize?: string;
  retentionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const BackupSettingSchema = new Schema<IBackupSetting>(
  {
    automatedBackups: { type: Boolean, default: false },
    recipientEmail: { type: String, default: '', trim: true },
    frequency: {
      type: String,
      enum: ['Every day', 'Every week', 'Every 2 weeks', 'Every month'],
      default: 'Every day',
    },
    executionTime: { type: String, default: '02:00', trim: true },
    timezone: { type: String, default: 'Asia/Qatar', trim: true },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['Success', 'Failed'] },
    lastRunFileName: { type: String, trim: true },
    lastRunFileSize: { type: String, trim: true },
    retentionCount: { type: Number, default: 14, min: 1, max: 100 },
  },
  { timestamps: true }
);

export const BackupSetting = mongoose.model<IBackupSetting>('BackupSetting', BackupSettingSchema);

export const getOrCreateBackupSetting = async (): Promise<IBackupSetting> => {
  let setting = await BackupSetting.findOne();
  if (!setting) {
    setting = await BackupSetting.create({
      automatedBackups: false,
      recipientEmail: '',
      frequency: 'Every day',
      executionTime: '02:00',
      timezone: 'Asia/Qatar',
      retentionCount: 14,
    });
  }
  return setting;
};

export default BackupSetting;
