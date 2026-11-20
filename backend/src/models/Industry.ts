import mongoose, { Document, Schema } from 'mongoose';

export interface IIndustry extends Document {
  name: string;
  industryGroups: string[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IndustrySchema = new Schema<IIndustry>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    industryGroups: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

IndustrySchema.index({ name: 'text' });

export default mongoose.model<IIndustry>('Industry', IndustrySchema);
