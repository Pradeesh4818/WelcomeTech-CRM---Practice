import mongoose, { Document, Schema } from 'mongoose';

export interface IBusinessSegment extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BusinessSegmentSchema = new Schema<IBusinessSegment>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

BusinessSegmentSchema.index({ name: 'text' });

export default mongoose.model<IBusinessSegment>('BusinessSegment', BusinessSegmentSchema);
