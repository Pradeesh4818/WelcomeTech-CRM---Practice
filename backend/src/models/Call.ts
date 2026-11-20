import mongoose, { Document, Schema } from 'mongoose';

export interface ICall extends Document {
  customer: mongoose.Types.ObjectId;
  engineer: mongoose.Types.ObjectId;
  type: 'remote' | 'visit' | 'phone' | 'email';
  issueType: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  resolution?: string;
  duration?: number; // minutes
  callDate: Date;
  resolvedDate?: Date;
  chargeApplicable: boolean;
  chargeAmount?: number;
  createdBy: mongoose.Types.ObjectId;
}

const CallSchema = new Schema<ICall>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['remote', 'visit', 'phone', 'email'], default: 'remote' },
    issueType: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    resolution: { type: String },
    duration: { type: Number },
    callDate: { type: Date, required: true, default: Date.now },
    resolvedDate: { type: Date },
    chargeApplicable: { type: Boolean, default: false },
    chargeAmount: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICall>('Call', CallSchema);
