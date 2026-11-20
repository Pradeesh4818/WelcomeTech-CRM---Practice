import mongoose, { Schema, Document } from 'mongoose';

export interface IMedia extends Document {
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  key: string;
  type: 'image' | 'video' | 'audio' | 'document';
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema: Schema = new Schema({
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  url: { type: String, required: true },
  key: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['image', 'video', 'audio', 'document'],
    required: true 
  },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<IMedia>('Media', MediaSchema);
