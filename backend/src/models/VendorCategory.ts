import mongoose, { Document, Schema } from 'mongoose';

export interface IVendorCategory extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const VendorCategorySchema = new Schema<IVendorCategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

VendorCategorySchema.index({ name: 'text' });

export default mongoose.model<IVendorCategory>('VendorCategory', VendorCategorySchema);
