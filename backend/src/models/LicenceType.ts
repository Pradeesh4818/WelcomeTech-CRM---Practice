import mongoose, { Document, Schema } from 'mongoose';

export interface ILicenceType extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const LicenceTypeSchema = new Schema<ILicenceType>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

LicenceTypeSchema.index({ name: 'text' });

export default mongoose.model<ILicenceType>('LicenceType', LicenceTypeSchema);
