import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  hsnCode?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    hsnCode: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ProductSchema.index({ name: 'text' });

export default mongoose.model<IProduct>('Product', ProductSchema);

