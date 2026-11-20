import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description?: string;
  permissions: string[]; // e.g., ['dashboard', 'customers.view', 'customers.create', 'settings']
  hasFullAccess?: boolean; // When true, grants full system access across all modules
  isSystem?: boolean; // System roles like Admin cannot be deleted
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    permissions: [{ type: String }],
    hasFullAccess: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IRole>('Role', RoleSchema);
