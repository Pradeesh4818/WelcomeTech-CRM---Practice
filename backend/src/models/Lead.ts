import mongoose, { Document, Schema } from 'mongoose';
import { nextSequence, highestExistingNumber } from './Counter';

export const LEAD_STATUSES = [
  'New',
  'Assigned',
  'Contacted',
  'Followup',
  'Interested',
  'Quotation Sent',
  'Negotiation',
  'Won',
  'Lost',
  'Junk',
] as const;

export const LEAD_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type LeadStatus = string;
export type LeadPriority = typeof LEAD_PRIORITIES[number];

export interface ILead extends Document {
  leadId: string;
  leadDate?: Date;
  leadType: 'new' | 'existing';
  customerId?: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phone: string;
  countryCode: string;
  companyName?: string;
  locationArea?: string;
  fullAddress?: string;
  existingProducts?: string[];
  source?: string;
  interestedProduct?: string;
  requirementDescription?: string;
  pricing?: number;
  status: LeadStatus;
  priority: LeadPriority;
  expectedClosingDate?: Date;
  notes?: string;
  assignedTo?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  lastContactedAt?: Date;
  lastFollowupDate?: Date;
  nextFollowupDate?: Date;
  convertedAt?: Date;
  rejectedAt?: Date;
  proposalRequested?: boolean;
  proposalRequestedAt?: Date;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    leadId: { type: String, unique: true, index: true },
    leadDate: { type: Date, default: Date.now, index: true },
    leadType: { type: String, enum: ['new', 'existing'], default: 'new', index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: false, default: '', lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true, default: 'QA' },
    companyName: { type: String, trim: true },
    locationArea: { type: String, trim: true },
    fullAddress: { type: String, trim: true },
    existingProducts: [{ type: String, trim: true }],
    source: { type: String, trim: true, default: 'manual' },
    interestedProduct: { type: String, trim: true },
    requirementDescription: { type: String, trim: true },
    pricing: { type: Number, min: 0 },
    status: { type: String, default: 'New', index: true, trim: true },
    priority: { type: String, enum: LEAD_PRIORITIES, default: 'medium', index: true },
    expectedClosingDate: { type: Date },
    notes: { type: String },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastContactedAt: { type: Date },
    lastFollowupDate: { type: Date },
    nextFollowupDate: { type: Date },
    convertedAt: { type: Date },
    rejectedAt: { type: Date },
    proposalRequested: { type: Boolean, default: false, index: true },
    proposalRequestedAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

LeadSchema.index({ email: 1 });
LeadSchema.index({ phone: 1 });
LeadSchema.index({ status: 1, assignedTo: 1, createdAt: -1 });
LeadSchema.index({ name: 'text', email: 'text', phone: 'text', companyName: 'text', source: 'text', interestedProduct: 'text' });

LeadSchema.pre('save', async function (next) {
  if (!this.leadId) {
    // Atomic counter — countDocuments() is racy and collides under concurrent creates.
    const seq = await nextSequence('lead', () => highestExistingNumber(mongoose.model('Lead'), 'leadId'));
    this.leadId = `LEAD-${String(seq).padStart(5, '0')}`;
  }
  next();
});

export interface ILeadStatusHistory extends Document {
  lead: mongoose.Types.ObjectId;
  fromStatus?: LeadStatus;
  toStatus: LeadStatus;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  remarks?: string;
}

const LeadStatusHistorySchema = new Schema<ILeadStatusHistory>(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    fromStatus: { type: String },
    toStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now, index: true },
    remarks: { type: String },
  },
  { timestamps: true }
);

export interface ILeadFollowUp extends Document {
  lead: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  followUpType: 'call' | 'email' | 'whatsapp' | 'meeting' | 'visit' | 'sms' | 'task';
  scheduledAt: Date;
  status: 'pending' | 'completed' | 'missed';
  reminderSent: boolean;
  remarks?: string;
  createdBy: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const LeadFollowUpSchema = new Schema<ILeadFollowUp>(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    followUpType: { type: String, enum: ['call', 'email', 'whatsapp', 'meeting', 'visit', 'sms', 'task'], default: 'call' },
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending', index: true },
    reminderSent: { type: Boolean, default: false },
    remarks: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export interface ILeadActivity extends Document {
  lead: mongoose.Types.ObjectId;
  type: 'lead_created' | 'lead_updated' | 'status_changed' | 'assigned' | 'reassigned' | 'note_added' | 'follow_up_added' | 'follow_up_updated' | 'communication_logged' | 'task_completed' | 'lead_lost';
  message: string;
  actor: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const LeadActivitySchema = new Schema<ILeadActivity>(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    type: {
      type: String,
      enum: [
        'lead_created',
        'lead_updated',
        'status_changed',
        'assigned',
        'reassigned',
        'note_added',
        'follow_up_added',
        'follow_up_updated',
        'communication_logged',
        'task_completed',
        'lead_lost',
      ],
      required: true,
    },
    message: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export interface ILeadNote extends Document {
  lead: mongoose.Types.ObjectId;
  text: string;
  attachment?: string;
  communicationType?: 'internal' | 'email' | 'call' | 'whatsapp' | 'sms' | 'meeting';
  createdBy: mongoose.Types.ObjectId;
}

const LeadNoteSchema = new Schema<ILeadNote>(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    text: { type: String, required: true, trim: true },
    attachment: { type: String },
    communicationType: { type: String, enum: ['internal', 'email', 'call', 'whatsapp', 'sms', 'meeting'], default: 'internal' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface ILeadNotification extends Document {
  user: mongoose.Types.ObjectId;
  lead: mongoose.Types.ObjectId;
  type: 'assignment' | 'follow_up_reminder' | 'status_change';
  message: string;
  isRead: boolean;
}

const LeadNotificationSchema = new Schema<ILeadNotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    type: { type: String, enum: ['assignment', 'follow_up_reminder', 'status_change'], required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Lead = mongoose.model<ILead>('Lead', LeadSchema);
export const LeadStatusHistory = mongoose.model<ILeadStatusHistory>('LeadStatusHistory', LeadStatusHistorySchema);
export const LeadFollowUp = mongoose.model<ILeadFollowUp>('LeadFollowUp', LeadFollowUpSchema);
export const LeadActivity = mongoose.model<ILeadActivity>('LeadActivity', LeadActivitySchema);
export const LeadNote = mongoose.model<ILeadNote>('LeadNote', LeadNoteSchema);
export const LeadNotification = mongoose.model<ILeadNotification>('LeadNotification', LeadNotificationSchema);
