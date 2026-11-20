import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

import { IRole } from './Role';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string | mongoose.Types.ObjectId | IRole;
  salary?: number;
  avatar?: string;
  phone?: string;
  address?: string;
  passport?: string;
  passportNumber?: string;
  passportExpiryDate?: Date;
  qidDocument?: string;
  qidNumber?: string;
  qidExpiryDate?: Date;
  documents?: Array<{ name: string; path: string; uploadedAt: Date }>;
  fcmTokens?: string[];
  isActive: boolean;
  theme?: 'light' | 'dark';
  lastLogin?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: Schema.Types.Mixed, default: 'engineer' },
    salary: { type: Number, min: 0 },
    avatar: { type: String },
    phone: { type: String },
    address: { type: String },
    passport: { type: String },
    passportNumber: { type: String },
    passportExpiryDate: { type: Date },
    qidDocument: { type: String },
    qidNumber: { type: String },
    qidExpiryDate: { type: Date },
    documents: [{ name: { type: String }, path: { type: String }, uploadedAt: { type: Date, default: Date.now } }],
    fcmTokens: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark'] },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete (ret as { password?: string }).password;
    return ret;
  },
});

export default mongoose.model<IUser>('User', UserSchema);
