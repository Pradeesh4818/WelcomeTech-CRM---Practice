import mongoose, { Document, Schema } from 'mongoose';

export interface IIndustryType extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IndustryTypeSchema = new Schema<IIndustryType>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

IndustryTypeSchema.index({ name: 'text' });

export default mongoose.model<IIndustryType>('IndustryType', IndustryTypeSchema);
