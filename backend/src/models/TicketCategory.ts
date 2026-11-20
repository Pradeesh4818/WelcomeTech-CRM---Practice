import mongoose, { Document, Schema } from 'mongoose';

export interface ITicketCategory extends Document {
  name: string;
  subCategories: string[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const TicketCategorySchema = new Schema<ITicketCategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    subCategories: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

TicketCategorySchema.index({ name: 'text' });

export default mongoose.model<ITicketCategory>('TicketCategory', TicketCategorySchema);
