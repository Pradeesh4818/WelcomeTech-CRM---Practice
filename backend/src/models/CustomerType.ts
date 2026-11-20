import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomerType extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const CustomerTypeSchema = new Schema<ICustomerType>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CustomerTypeSchema.index({ name: 'text' });

export default mongoose.model<ICustomerType>('CustomerType', CustomerTypeSchema);
