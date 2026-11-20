import mongoose, { Document, Schema } from 'mongoose';

export interface ILeadSource extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const LeadSourceSchema = new Schema<ILeadSource>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

LeadSourceSchema.index({ name: 'text' });

export default mongoose.model<ILeadSource>('LeadSource', LeadSourceSchema);
