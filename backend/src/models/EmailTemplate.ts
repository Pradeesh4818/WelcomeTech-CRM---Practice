import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailTemplate extends Document {
  name: string;
  subject: string;
  body: string;
  headerImage?: string;
  footerImage?: string;
  createdBy?: mongoose.Types.ObjectId;
}

const EmailTemplateSchema: Schema = new Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  headerImage: { type: String, default: '' },
  footerImage: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);

