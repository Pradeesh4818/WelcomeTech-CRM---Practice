import mongoose, { Document, Schema } from 'mongoose';
import { nextSequence, highestExistingNumber } from './Counter';
import { getAndIncrementNextProposalNo } from '../utils/proposalSequence';

// Eagerly import all standalone model definitions so Mongoose populates (Customer, Lead, User, etc.) never fail with MissingSchemaError
import Customer, { ICustomer } from './Customer';
import { Lead, ILead, LeadActivity, LeadFollowUp, LeadNote, LeadStatusHistory, LeadNotification } from './Lead';
import User, { IUser } from './User';
import Call, { ICall } from './Call';
import Task, { ITask } from './Task';
import { Settings, ISettings } from './Settings';
import Product, { IProduct } from './Product';
import Role, { IRole } from './Role';
import Media, { IMedia } from './Media';
import EmailTemplate, { IEmailTemplate } from './EmailTemplate';
import CustomerType, { ICustomerType } from './CustomerType';
import LeadSource, { ILeadSource } from './LeadSource';
import LeadStatusMaster, { ILeadStatusMaster } from './LeadStatusMaster';
import LicenceType, { ILicenceType } from './LicenceType';
import TicketCategory, { ITicketCategory } from './TicketCategory';
import VendorCategory, { IVendorCategory } from './VendorCategory';
import Industry, { IIndustry } from './Industry';
import BusinessSegment, { IBusinessSegment } from './BusinessSegment';
import IndustryType, { IIndustryType } from './IndustryType';

export {
  Customer,
  ICustomer,
  Lead,
  ILead,
  LeadActivity,
  LeadFollowUp,
  LeadNote,
  LeadStatusHistory,
  LeadNotification,
  User,
  IUser,
  Call,
  ICall,
  Task,
  ITask,
  Settings,
  ISettings,
  Product,
  IProduct,
  Role,
  IRole,
  Media,
  IMedia,
  EmailTemplate,
  IEmailTemplate,
  CustomerType,
  ICustomerType,
  LeadSource,
  ILeadSource,
  LeadStatusMaster,
  ILeadStatusMaster,
  LicenceType,
  ILicenceType,
  TicketCategory,
  ITicketCategory,
  VendorCategory,
  IVendorCategory,
  Industry,
  IIndustry,
  BusinessSegment,
  IBusinessSegment,
  IndustryType,
  IIndustryType,
};

// ─── AMC ───────────────────────────────────────────
export interface IAMC extends Document {
  customer: mongoose.Types.ObjectId;
  product: string;
  licenceType: string;
  startDate: Date;
  expiryDate: Date;
  amount: number;
  initialStartDate?: Date;
  initialExpiryDate?: Date;
  initialAmount?: number;
  status: 'active' | 'expired' | 'expiring';
  notes?: string;
  lastNotifiedAt?: Date;
  lastNotifiedChannel?: 'email' | 'whatsapp';
  lastNotifiedTemplate?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    accuracy?: number;
    capturedAt?: Date;
  };
  renewalHistory: Array<{
    renewedOn: Date;
    period: string;
    startDate: Date;
    expiryDate: Date;
    amount: number;
    paymentMethod: string;
    invoiceNo?: string;
    notes?: string;
  }>;
  createdBy: mongoose.Types.ObjectId;
}

const AMCSchema = new Schema<IAMC>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    product: { type: String, required: true },
    licenceType: { type: String, required: true },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    amount: { type: Number, required: true },
    initialStartDate: { type: Date },
    initialExpiryDate: { type: Date },
    initialAmount: { type: Number },
    status: { type: String, enum: ['active', 'expired', 'expiring'], default: 'active' },
    notes: { type: String },
    lastNotifiedAt: { type: Date },
    lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
    lastNotifiedTemplate: { type: String },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
      accuracy: { type: Number },
      capturedAt: { type: Date },
    },
    renewalHistory: [
      {
        renewedOn: { type: Date, required: true },
        period: { type: String, required: true },
        startDate: { type: Date, required: true },
        expiryDate: { type: Date, required: true },
        amount: { type: Number, required: true },
        paymentMethod: { type: String, required: true },
        invoiceNo: { type: String },
        notes: { type: String },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const AMC = mongoose.model<IAMC>('AMC', AMCSchema);

// ─── TICKET ────────────────────────────────────────
export interface ITicket extends Document {
  ticketNo: string;
  customer: mongoose.Types.ObjectId;
  contactPerson?: string;
  mailId?: string;
  phoneNumber?: string;
  assignedTo: mongoose.Types.ObjectId;
  subject: string;
  description: string;
  category: string;
  subCategory?: string;
  status: 'open' | 'in-progress' | 'pending-customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  ticketRaisedDate?: Date;
  completedDate?: Date;
  tags: string[];
  thread: Array<{
    author: mongoose.Types.ObjectId;
    authorName: string;
    authorRole: string;
    message: string;
    isInternal: boolean;
    createdAt: Date;
  }>;
  resolvedAt?: Date;
  closedAt?: Date;
  lastFollowupDate?: Date;
  nextFollowupDate?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const TicketSchema = new Schema<ITicket>(
  {
    ticketNo: { type: String, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    contactPerson: { type: String, trim: true },
    mailId: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    description: { type: String },
    category: { type: String, required: true },
    subCategory: { type: String, trim: true },
    status: { type: String, enum: ['open', 'in-progress', 'pending-customer', 'resolved', 'closed'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    ticketRaisedDate: { type: Date },
    completedDate: { type: Date },
    tags: [{ type: String }],
    thread: [
      {
        author: { type: Schema.Types.ObjectId, ref: 'User' },
        authorName: { type: String, required: true },
        authorRole: { type: String, required: true },
        message: { type: String, required: true },
        isInternal: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    lastFollowupDate: { type: Date },
    nextFollowupDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

TicketSchema.pre('save', async function (next) {
  if (!this.ticketNo) {
    const seq = await nextSequence('ticket', () => highestExistingNumber(mongoose.model('Ticket'), 'ticketNo'));
    this.ticketNo = `TKT-${String(seq).padStart(4, '0')}`;
  }
  next();
});

export const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);

// ─── PAYMENT ───────────────────────────────────────
export interface IPayment extends Document {
  invoiceNo: string;
  customer: mongoose.Types.ObjectId;
  paymentType: string;
  description: string;
  amount: number;
  paymentDate: Date;
  dueDate?: Date;
  method: string;
  transactionRef?: string;
  status: 'paid' | 'pending' | 'partial' | 'overdue';
  partialAmount?: number;
  remarks?: string;
  createdBy: mongoose.Types.ObjectId;
}

const PaymentSchema = new Schema<IPayment>(
  {
    invoiceNo: { type: String, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    paymentType: { type: String, required: true },
    description: { type: String },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    dueDate: { type: Date },
    method: { type: String, required: true },
    transactionRef: { type: String },
    status: { type: String, enum: ['paid', 'pending', 'partial', 'overdue'], default: 'pending' },
    partialAmount: { type: Number },
    remarks: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

PaymentSchema.pre('save', async function (next) {
  if (!this.invoiceNo) {
    const seq = await nextSequence('invoice', () => highestExistingNumber(mongoose.model('Payment'), 'invoiceNo'));
    this.invoiceNo = `INV-${String(seq).padStart(4, '0')}`;
  }
  next();
});

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);

// ─── PROPOSAL ──────────────────────────────────────
export interface IProposal extends Document {
  proposalNo: string;
  proposalId?: string;
  customer?: mongoose.Types.ObjectId;
  lead?: mongoose.Types.ObjectId;
  task?: mongoose.Types.ObjectId;
  title: string;
  items: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  amount?: number;
  quoteDate?: Date;
  proposalDate?: Date;
  validUntil: Date;
  terms?: string;
  templateImage?: string;
  templateFooterImage?: string;
  companyInfo?: {
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    contactNo?: string;
    email?: string;
  };
  blocks?: unknown[];
  overallTotal?: any;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  customerName?: string;
  customerContactPerson?: string;
  customerDetails?: any;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  cc?: string;
  template?: mongoose.Types.ObjectId;
  templateName?: string;
  sentAt?: Date;
  resentAt?: Date;
  lastSentAt?: Date;
  resendCount?: number;
  revision?: number;
  revisedAt?: Date;
  revisionHistory?: Array<{
    revision: number;
    revisedAt: Date;
    revisedBy?: mongoose.Types.ObjectId;
    revisedByName?: string;
    reason?: string;
    previousTotal?: number;
    newTotal?: number;
    previousSubtotal?: number;
    previousDiscount?: number;
    previousItems?: any[];
    previousTerms?: string;
    previousBlocks?: any[];
  }>;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProposalSchema = new Schema<IProposal>(
  {
    proposalNo: { type: String, unique: true },
    proposalId: { type: String },
    amount: { type: Number },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
    template: { type: Schema.Types.ObjectId, ref: 'ProposalTemplate', index: true },
    templateName: { type: String },
    customerName: { type: String },
    customerContactPerson: { type: String, trim: true },
    customerDetails: { type: Schema.Types.Mixed },
    customerPhone: { type: String },
    customerEmail: { type: String },
    customerAddress: { type: String },
    cc: { type: String },
    senderName: { type: String },
    senderEmail: { type: String },
    senderPhone: { type: String },
    companyInfo: {
      name: { type: String },
      addressLine1: { type: String },
      addressLine2: { type: String },
      contactNo: { type: String },
      email: { type: String },
    },
    title: { type: String, required: true },
    items: [
      {
        description: { type: String, required: true },
        qty: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    quoteDate: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    terms: { type: String },
    templateImage: { type: String },
    templateFooterImage: { type: String },
    blocks: { type: [Schema.Types.Mixed], default: undefined },
    overallTotal: { type: Schema.Types.Mixed, default: undefined },
    status: { type: String, enum: ['draft', 'sent', 'accepted', 'rejected'], default: 'draft' },
    sentAt: { type: Date },
    resentAt: { type: Date },
    lastSentAt: { type: Date },
    resendCount: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
    revisedAt: { type: Date },
    revisionHistory: [
      {
        revision: { type: Number },
        revisedAt: { type: Date, default: Date.now },
        revisedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        revisedByName: { type: String },
        reason: { type: String },
        previousTotal: { type: Number },
        newTotal: { type: Number },
        previousSubtotal: { type: Number },
        previousDiscount: { type: Number },
        previousItems: { type: [Schema.Types.Mixed] },
        previousTerms: { type: String },
        previousBlocks: { type: [Schema.Types.Mixed] },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ProposalSchema.virtual('proposalDate').get(function () {
  return (this as any).quoteDate || this.createdAt;
});

ProposalSchema.pre('save', async function (next) {
  if (!this.proposalNo) {
    if (this.proposalId && typeof this.proposalId === 'string' && this.proposalId.trim()) {
      this.proposalNo = this.proposalId.trim();
    } else {
      try {
        this.proposalNo = await getAndIncrementNextProposalNo();
      } catch {
        const seq = await nextSequence('proposal', () => highestExistingNumber(mongoose.model('Proposal'), 'proposalNo'));
        this.proposalNo = `PROP-${String(seq).padStart(4, '0')}`;
      }
    }
  }
  next();
});

export const Proposal = mongoose.model<IProposal>('Proposal', ProposalSchema);

// ─── PROPOSAL TEMPLATE ─────────────────────────────
export interface IProposalTemplate extends Document {
  name: string;
  title?: string;
  companyInfo?: {
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    contactNo?: string;
    email?: string;
  };
  items: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  discount: number;
  terms?: string;
  templateImage?: string;
  templateFooterImage?: string;
  validForDays: number;
  blocks?: unknown[];
  overallTotal?: any;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  status?: 'active' | 'inactive' | 'draft';
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const ProposalTemplateSchema = new Schema<IProposalTemplate>(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, trim: true },
    senderName: { type: String },
    senderEmail: { type: String },
    senderPhone: { type: String },
    companyInfo: {
      name: { type: String },
      addressLine1: { type: String },
      addressLine2: { type: String },
      contactNo: { type: String },
      email: { type: String },
    },
    items: [
      {
        description: { type: String, required: true },
        qty: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],
    discount: { type: Number, default: 0 },
    terms: { type: String },
    templateImage: { type: String },
    templateFooterImage: { type: String },
    validForDays: { type: Number, default: 10 },
    blocks: { type: [Schema.Types.Mixed], default: undefined },
    overallTotal: { type: Schema.Types.Mixed, default: undefined },
    status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'active' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ProposalTemplateSchema.index({ name: 'text', title: 'text' });
ProposalTemplateSchema.index(
  { createdBy: 1, name: 1 },
  {
    name: 'createdBy_1_name_1_active_unique',
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

export const ProposalTemplate = mongoose.model<IProposalTemplate>('ProposalTemplate', ProposalTemplateSchema);

// ─── LEAD FOLLOW UP ──────────────────────────────
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
    remarks: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// ─── TICKET FOLLOW UP ──────────────────────────────
export interface ITicketFollowUp extends Document {
  ticket: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  followUpType: 'call' | 'email' | 'whatsapp' | 'meeting' | 'visit' | 'sms';
  scheduledAt: Date;
  status: 'pending' | 'completed' | 'missed';
  remarks?: string;
  createdBy: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const TicketFollowUpSchema = new Schema<ITicketFollowUp>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    followUpType: { type: String, enum: ['call', 'email', 'whatsapp', 'meeting', 'visit', 'sms'], default: 'call' },
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending', index: true },
    remarks: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const TicketFollowUp = mongoose.model<ITicketFollowUp>('TicketFollowUp', TicketFollowUpSchema);

// ─── TICKET ACTIVITY ────────────────────────────────
export interface ITicketActivity extends Document {
  ticket: mongoose.Types.ObjectId;
  type: 'ticket_created' | 'ticket_updated' | 'status_changed' | 'assigned' | 'reassigned' | 'reply_added' | 'follow_up_added' | 'follow_up_updated' | 'follow_up_deleted';
  message: string;
  actor: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const TicketActivitySchema = new Schema<ITicketActivity>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    type: {
      type: String,
      enum: [
        'ticket_created',
        'ticket_updated',
        'status_changed',
        'assigned',
        'reassigned',
        'reply_added',
        'follow_up_added',
        'follow_up_updated',
        'follow_up_deleted',
      ],
      required: true,
    },
    message: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const TicketActivity = mongoose.model<ITicketActivity>('TicketActivity', TicketActivitySchema);

export * from './BackupHistory';
export * from './BackupSetting';

