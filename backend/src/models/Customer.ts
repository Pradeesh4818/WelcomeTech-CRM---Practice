import mongoose, { Document, Schema } from 'mongoose';
import { nextSequence, highestExistingNumber } from './Counter';

export interface ICustomer extends Document {
  customerNumber?: string;
  name: string;
  contact: string;

  phone: string;
  email: string;
  address: string;
  industry: string;
  products: string[];
  licenceType: string;
  users: number;
  amcStatus: 'active' | 'expired' | 'expiring' | 'none';
  amcExpiry?: Date;
  customerType?: string;
  notes?: string;
  avatar?: string;
  lastNotifiedAt?: Date;
  lastNotifiedChannel?: 'email' | 'whatsapp';
  lastNotifiedTemplate?: string;
  agreementCopy?: string;
  importSource?: string;
  importSerialNo?: string;
  companyInfo?: {
    customerName?: string;
    crNo?: string;
    groupOfCompany?: string;
    businessSegment?: string;
    industry?: string;
    industryGroup?: string;
    industryType?: string;
    locationArea?: string;
    fullAddress?: string;
    website?: string;
    websiteStatus?: string;
    releaseVersion?: string;
    isServer9?: boolean;
  };
  branchInfo?: {
    isBranch?: boolean;
    branchName?: string;
    branchCode?: string;
    parentCompanyId?: mongoose.Types.ObjectId;
  };
  branches?: Array<{
    branchName?: string;
    locationArea?: string;
    area?: string;
    fullAddress?: string;
    website?: string;
    websiteStatus?: 'Active' | 'Inactive';
    contactPerson?: string;
    mobile?: string;
    email?: string;
  }>;
  groupCompanies?: Array<{
    name?: string;
  }>;
  partnerDetails?: Array<{
    companyName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    service?: string;
  }>;
  keyContacts?: Array<{
    contactName?: string;
    designation?: string;
    mobile?: string;
    whatsapp?: string;
    email?: string;
    contactPreference?: string;
    landline?: string;
  }>;
  primaryContactInfo?: {
    contactName1?: string;
    designation?: string;
    mobile?: string;
    whatsapp?: string;
    email?: string;
    contactPreference?: string;
    landline?: string;
  };
  secondaryContactInfo?: {
    contactName2?: string;
    designation?: string;
    mobile?: string;
    whatsapp?: string;
    email?: string;
    contactPreference?: string;
    landline?: string;
  };
  serialNoInfo?: Array<{
    product?: string;
    releaseVersion?: string;
    licenceType?: string;
    noOfUsers?: number;
    licenses?: Array<{
      licenceSerialNo?: string;
      licenceStatus?: 'active' | 'expired' | 'blocked' | 'surrendered' | 'terminated';
    }>;
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    isServer9?: boolean;
    server9SerialNo?: string;
    isAmcActive?: boolean;
    contactDetails?: {
      branchName?: string;
      locationArea?: string;
      contactPerson?: string;
      mobile?: string;
      vendorCategory?: string;
    };
    pricingDetails?: {
      actualPrice?: number;
      discount?: number;
      currentPrice?: number;
      advance1?: number;
      advance2?: number;
      remainingTotal?: number;
    };
    notes?: string;
    tdlEnabled?: boolean;
    tdlSerialNo?: string;
    tssExpiryDate?: Date;
    isTdl?: boolean;
    tdlSerialNos?: Array<{ serialNo: string }>;
    licenceStatus?: 'active' | 'expired' | 'blocked' | 'surrendered' | 'terminated';
    releases?: string[];
  }>;
  amcDetails?: {
    status?: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    companyType?: 'head_office' | 'branch';
    companyName?: string;
    address?: string;
    details?: string;
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
    others?: string;
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    value?: number;
    salesman1?: string;
    salesman2?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    notesRemarks?: string;
    vendor?: string;
    vendorCategory?: string;
    lastNotifiedAt?: Date;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
  };
  tdlDetails?: {
    companyType?: 'head_office' | 'branch';
    companyName?: string;
    address?: string;
    details?: string;
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
    others?: string;
    salesman1?: string;
    salesman2?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    notesRemarks?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    licenseSerialNo?: string;
    noOfDays?: number;
    days?: number;
    vendorCategory?: string;
    lastNotifiedAt?: Date;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    renewalHistory?: Array<{
      renewedOn: Date;
      period: string;
      startDate?: Date;
      expiryDate?: Date;
      amount: number;
      paymentMethod: string;
      invoiceNo?: string;
      notes?: string;
    }>;
  };
  cloudDetails?: {
    companyType?: 'head_office' | 'branch';
    companyName?: string;
    address?: string;
    details?: string;
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
    others?: string;
    salesman1?: string;
    salesman2?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    notesRemarks?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none';
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    vendor?: string;
    cloudExpiryDate?: Date;
    cloudStartDate?: Date;
    licenseSerialNo?: string;
    domainLinkSubId?: string;
    noOfUsers?: number;
    release?: string;
    vendorCategory?: string;
    lastNotifiedAt?: Date;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    users?: Array<{
      username?: string;
      userDetail?: string;
      userLocation?: string;
    }>;
    renewalHistory?: Array<{
      renewedOn: Date;
      period: string;
      startDate?: Date;
      expiryDate?: Date;
      amount: number;
      paymentMethod: string;
      invoiceNo?: string;
      notes?: string;
    }>;
  };
  tssDetails?: {
    companyType?: 'head_office' | 'branch';
    companyName?: string;
    address?: string;
    details?: string;
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
    others?: string;
    salesman1?: string;
    salesman2?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    notesRemarks?: string;
    vendor?: string;
    vendorCategory?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none';
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    licenseSerialNo?: string;
    lastNotifiedAt?: Date;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    renewalHistory?: Array<{
      renewedOn: Date;
      period: string;
      startDate?: Date;
      expiryDate?: Date;
      amount: number;
      paymentMethod: string;
      invoiceNo?: string;
      notes?: string;
    }>;
  };
  services: Array<{
    _id?: string;
    type: 'amc' | 'tdl' | 'tss' | 'cloud';
    quantity: number;
    status: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    companyType?: 'head_office' | 'branch';
    companyName?: string;
    address?: string;
    details?: string;
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
    others?: string;
    salesman1?: string;
    salesman2?: string;
    showPricing?: boolean;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    reminder?: string;
    notesRemarks?: string;
    vendor?: string;
    vendorCategory?: string;
    startDate?: Date;
    endDate?: Date;
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialPrice?: number;
    tssExpiryDate?: Date;
    licenseSerialNo?: string;
    noOfDays?: number;
    product?: string;
    licenceType?: string;
    isAmcActive?: boolean;
    domainLinkSubId?: string;
    noOfUsers?: number;
    release?: string;
    releaseVersion?: string;
    isServer9?: boolean;
    licenceStatus?: 'active' | 'expired' | 'blocked' | 'surrendered' | 'terminated';
    server9SerialNos?: Array<{
      serialNo?: string;
    }>;
    isTdl?: boolean;
    tdlSerialNos?: Array<{
      serialNo?: string;
    }>;
    amcValue?: number;
    users?: Array<{
      username?: string;
      userDetail?: string;
      userLocation?: string;
    }>;
    renewalHistory?: Array<{
      renewedOn: Date;
      period: string;
      startDate?: Date;
      expiryDate?: Date;
      amount: number;
      paymentMethod: string;
      invoiceNo?: string;
      notes?: string;
    }>;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const ServiceInstanceSchema = new Schema(
  {
    type: { type: String, enum: ['amc', 'tdl', 'tss', 'cloud'], required: true },
    quantity: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'expired', 'expiring', 'none', 'trial'], default: 'none' },
    companyType: { type: String, enum: ['head_office', 'branch'] },
    companyName: { type: String, trim: true },
    address: { type: String, trim: true },
    details: { type: String, trim: true },
    actualPrice: { type: Number },
    discount: { type: Number },
    currentPrice: { type: Number },
    advance1: { type: Number },
    advance2: { type: Number },
    remainingTotal: { type: Number },
    others: { type: String, trim: true },
    salesman1: { type: String, trim: true },
    salesman2: { type: String, trim: true },
    showPricing: { type: Boolean, default: false },
    contactPerson: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true },
    notesRemarks: { type: String, trim: true },
    vendor: { type: String, trim: true },
    vendorCategory: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    tssExpiryDate: { type: Date },
    licenseSerialNo: { type: String, trim: true },
    noOfDays: { type: Number },
    product: { type: String, trim: true },
    licenceType: { type: String, trim: true },
    isAmcActive: { type: Boolean, default: false },
    domainLinkSubId: { type: String, trim: true },
    noOfUsers: { type: Number },
    release: { type: String, trim: true },
    releaseVersion: { type: String, trim: true },
    isServer9: { type: Boolean, default: false },
    licenceStatus: { type: String, enum: ['active', 'expired', 'blocked', 'surrendered', 'terminated'], default: 'active' },
    server9SerialNos: [
      {
        serialNo: { type: String, trim: true },
      },
    ],
    isTdl: { type: Boolean, default: false },
    tdlSerialNos: [
      {
        serialNo: { type: String, trim: true },
      },
    ],
    amcValue: { type: Number },
    users: [
      {
        username: { type: String, trim: true },
        userDetail: { type: String, trim: true },
        userLocation: { type: String, trim: true },
      },
    ],
    renewalHistory: [
      {
        renewedOn: { type: Date, required: true },
        period: { type: String, required: true },
        startDate: { type: Date },
        expiryDate: { type: Date },
        amount: { type: Number, required: true },
        paymentMethod: { type: String, required: true },
        invoiceNo: { type: String },
        notes: { type: String },
      },
    ],
  },
  { timestamps: true }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    customerNumber: { type: String, trim: true, sparse: true, index: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    industry: { type: String, trim: true },
    products: [{ type: String }],
    licenceType: { type: String, default: 'Silver – Single User' },
    users: { type: Number, default: 1 },
    amcStatus: { type: String, enum: ['active', 'expired', 'expiring', 'none'], default: 'none' },
    amcExpiry: { type: Date },
    customerType: { type: String, trim: true },
    notes: { type: String },
    avatar: { type: String },
    lastNotifiedAt: { type: Date },
    lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
    lastNotifiedTemplate: { type: String },
    agreementCopy: { type: String },
    importSource: { type: String, trim: true },
    importSerialNo: { type: String, trim: true, index: true },
    companyInfo: {
      customerName: { type: String, trim: true },
      crNo: { type: String, trim: true },
      groupOfCompany: { type: String, trim: true },
      businessSegment: { type: String, trim: true },
      industry: { type: String, trim: true },
      industryGroup: { type: String, trim: true },
      industryType: { type: String, trim: true },
      locationArea: { type: String, trim: true },
      fullAddress: { type: String, trim: true },
      website: { type: String, trim: true },
      websiteStatus: { type: String, trim: true },
      releaseVersion: { type: String, trim: true },
      isServer9: { type: Boolean, default: false },
    },
    branchInfo: {
      isBranch: { type: Boolean, default: false },
      branchName: { type: String, trim: true },
      branchCode: { type: String, trim: true },
      parentCompanyId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    },
    branches: [
      {
        branchName: { type: String, trim: true },
        locationArea: { type: String, trim: true },
        area: { type: String, trim: true },
        fullAddress: { type: String, trim: true },
        website: { type: String, trim: true },
        websiteStatus: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
        contactPerson: { type: String, trim: true },
        mobile: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
      },
    ],
    groupCompanies: [
      {
        name: { type: String, trim: true },
      },
    ],
    partnerDetails: [
      {
        companyName: { type: String, trim: true },
        fullName: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        phone: { type: String, trim: true },
        address: { type: String, trim: true },
        service: { type: String, trim: true },
      },
    ],
    keyContacts: [
      {
        contactName: { type: String, trim: true },
        designation: { type: String, trim: true },
        mobile: { type: String, trim: true },
        whatsapp: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        contactPreference: { type: String, trim: true },
        landline: { type: String, trim: true },
      },
    ],
    primaryContactInfo: {
      contactName1: { type: String, trim: true },
      designation: { type: String, trim: true },
      mobile: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      contactPreference: { type: String, trim: true },
      landline: { type: String, trim: true },
    },
    secondaryContactInfo: {
      contactName2: { type: String, trim: true },
      designation: { type: String, trim: true },
      mobile: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    serialNoInfo: [
      {
        product: { type: String, trim: true },
        releaseVersion: { type: String, trim: true },
        licenceType: { type: String, trim: true },
        noOfUsers: { type: Number, default: 1 },
        licenses: [
          {
            licenceSerialNo: { type: String, trim: true },
            licenceStatus: { type: String, enum: ['active', 'expired', 'blocked', 'surrendered', 'terminated'], default: 'active' },
          },
        ],
        startDate: { type: Date },
        endDate: { type: Date },
        licenseSerialNo: { type: String, trim: true },
        isServer9: { type: Boolean, default: false },
        server9SerialNo: { type: String, trim: true },
        isAmcActive: { type: Boolean, default: false },
        contactDetails: {
          branchName: { type: String, trim: true },
          locationArea: { type: String, trim: true },
          contactPerson: { type: String, trim: true },
          mobile: { type: String, trim: true },
          vendorCategory: { type: String, trim: true },
        },
        pricingDetails: {
          actualPrice: { type: Number },
          discount: { type: Number },
          currentPrice: { type: Number },
          advance1: { type: Number },
          advance2: { type: Number },
          remainingTotal: { type: Number },
        },
        notes: { type: String, trim: true },
        tdlEnabled: { type: Boolean, default: false },
        isTdl: { type: Boolean, default: false },
        tdlSerialNos: [
          {
            serialNo: { type: String, trim: true },
          },
        ],
        tssExpiryDate: { type: Date },
        licenceStatus: { type: String, enum: ['active', 'expired', 'blocked', 'surrendered', 'terminated'], default: 'active' },
        releases: [{ type: String, trim: true }],
      },
    ],
    amcDetails: {
      status: { type: String, enum: ['active', 'expired', 'expiring', 'none', 'trial'] },
      companyType: { type: String, enum: ['head_office', 'branch'] },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      details: { type: String, trim: true },
      actualPrice: { type: Number },
      discount: { type: Number },
      currentPrice: { type: Number },
      advance1: { type: Number },
      advance2: { type: Number },
      remainingTotal: { type: Number },
      others: { type: String, trim: true },
      startDate: { type: Date },
      endDate: { type: Date },
      initialStartDate: { type: Date },
      initialEndDate: { type: Date },
      initialPrice: { type: Number },
      value: { type: Number },
      salesman1: { type: String, trim: true },
      salesman2: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      mobile: { type: String, trim: true },
      email: { type: String, trim: true },
      reminder: { type: String, trim: true },
      notesRemarks: { type: String, trim: true },
      vendorCategory: { type: String, trim: true },
      lastNotifiedAt: { type: Date },
      lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
      lastNotifiedTemplate: { type: String },
    },
    tdlDetails: {
      companyType: { type: String, enum: ['head_office', 'branch'] },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      details: { type: String, trim: true },
      actualPrice: { type: Number },
      discount: { type: Number },
      currentPrice: { type: Number },
      advance1: { type: Number },
      advance2: { type: Number },
      remainingTotal: { type: Number },
      others: { type: String, trim: true },
      salesman1: { type: String, trim: true },
      salesman2: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      mobile: { type: String, trim: true },
      email: { type: String, trim: true },
      reminder: { type: String, trim: true },
      notesRemarks: { type: String, trim: true },
      status: { type: String, enum: ['active', 'expired', 'expiring', 'none', 'trial'] },
      startDate: { type: Date },
      endDate: { type: Date },
      initialStartDate: { type: Date },
      initialEndDate: { type: Date },
      initialPrice: { type: Number },
      licenseSerialNo: { type: String, trim: true },
      noOfDays: { type: Number },
      days: { type: Number },
      vendorCategory: { type: String, trim: true },
      lastNotifiedAt: { type: Date },
      lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
      lastNotifiedTemplate: { type: String },
      renewalHistory: [
        {
          renewedOn: { type: Date, required: true },
          period: { type: String, required: true },
          startDate: { type: Date },
          expiryDate: { type: Date },
          amount: { type: Number, required: true },
          paymentMethod: { type: String, required: true },
          invoiceNo: { type: String },
          notes: { type: String },
        },
      ],
    },
    cloudDetails: {
      companyType: { type: String, enum: ['head_office', 'branch'] },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      details: { type: String, trim: true },
      actualPrice: { type: Number },
      discount: { type: Number },
      currentPrice: { type: Number },
      advance1: { type: Number },
      advance2: { type: Number },
      remainingTotal: { type: Number },
      others: { type: String, trim: true },
      notesRemarks: { type: String, trim: true },
      salesman1: { type: String, trim: true },
      salesman2: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      mobile: { type: String, trim: true },
      email: { type: String, trim: true },
      status: { type: String, enum: ['active', 'expired', 'expiring', 'none'] },
      startDate: { type: Date },
      endDate: { type: Date },
      initialStartDate: { type: Date },
      initialEndDate: { type: Date },
      initialPrice: { type: Number },
      vendor: { type: String, trim: true },
      cloudExpiryDate: { type: Date },
      cloudStartDate: { type: Date },
      licenseSerialNo: { type: String, trim: true },
      domainLinkSubId: { type: String, trim: true },
      noOfUsers: { type: Number },
      release: { type: String, trim: true },
      vendorCategory: { type: String, trim: true },
      lastNotifiedAt: { type: Date },
      lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
      lastNotifiedTemplate: { type: String },
      users: [{
        username: { type: String, trim: true },
        userDetail: { type: String, trim: true },
        userLocation: { type: String, trim: true },
      }],
      renewalHistory: [
        {
          renewedOn: { type: Date, required: true },
          period: { type: String, required: true },
          startDate: { type: Date },
          expiryDate: { type: Date },
          amount: { type: Number, required: true },
          paymentMethod: { type: String, required: true },
          invoiceNo: { type: String },
          notes: { type: String },
        },
      ],
    },
    tssDetails: {
      companyType: { type: String, enum: ['head_office', 'branch'] },
      companyName: { type: String, trim: true },
      address: { type: String, trim: true },
      details: { type: String, trim: true },
      actualPrice: { type: Number },
      discount: { type: Number },
      currentPrice: { type: Number },
      advance1: { type: Number },
      advance2: { type: Number },
      remainingTotal: { type: Number },
      others: { type: String, trim: true },
      salesman1: { type: String, trim: true },
      salesman2: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      mobile: { type: String, trim: true },
      email: { type: String, trim: true },
      reminder: { type: String, trim: true },
      notesRemarks: { type: String, trim: true },
      vendorCategory: { type: String, trim: true },
      status: { type: String, enum: ['active', 'expired', 'expiring', 'none'] },
      startDate: { type: Date },
      endDate: { type: Date },
      initialStartDate: { type: Date },
      initialEndDate: { type: Date },
      initialPrice: { type: Number },
      licenseSerialNo: { type: String, trim: true },
      lastNotifiedAt: { type: Date },
      lastNotifiedChannel: { type: String, enum: ['email', 'whatsapp'] },
      lastNotifiedTemplate: { type: String },
      renewalHistory: [
        {
          renewedOn: { type: Date, required: true },
          period: { type: String, required: true },
          startDate: { type: Date },
          expiryDate: { type: Date },
          amount: { type: Number, required: true },
          paymentMethod: { type: String, required: true },
          invoiceNo: { type: String },
          notes: { type: String },
        },
      ],
    },
    services: [ServiceInstanceSchema],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ name: 'text', contact: 'text', email: 'text', customerNumber: 'text' });
CustomerSchema.index({ importSource: 1, importSerialNo: 1 });
CustomerSchema.index({ isActive: 1, name: 1 });
CustomerSchema.index({ isActive: 1, createdAt: -1 });
CustomerSchema.index({ isActive: 1, amcStatus: 1 });
CustomerSchema.index({ isActive: 1, 'services.type': 1 });
CustomerSchema.index({ isActive: 1, 'services.status': 1 });
CustomerSchema.index({ isActive: 1, 'services.endDate': 1 });
CustomerSchema.index({ isActive: 1, 'services.tssExpiryDate': 1 });
CustomerSchema.index({ isActive: 1, 'serialNoInfo.tssExpiryDate': 1 });

CustomerSchema.pre('save', async function (next) {
  if (!this.customerNumber) {
    const seq = await nextSequence('customer', () => highestExistingNumber(mongoose.model('Customer'), 'customerNumber'));
    this.customerNumber = `WT${String(seq).padStart(4, '0')}`;
  }
  next();
});

export const assignMissingCustomerNumbers = async (): Promise<void> => {
  try {
    const CustomerModel = mongoose.model<ICustomer>('Customer');
    const unnumberedCustomers = await CustomerModel.find({
      $or: [
        { customerNumber: { $exists: false } },
        { customerNumber: null },
        { customerNumber: '' },
      ],
    }).sort({ createdAt: 1, _id: 1 });

    if (!unnumberedCustomers || unnumberedCustomers.length === 0) return;

    for (const customer of unnumberedCustomers) {
      const seq = await nextSequence('customer', () => highestExistingNumber(CustomerModel, 'customerNumber'));
      const customerNumber = `WT${String(seq).padStart(4, '0')}`;
      await CustomerModel.updateOne({ _id: customer._id }, { $set: { customerNumber } });
    }
    console.log(`[migration] Assigned customer numbers to ${unnumberedCustomers.length} existing customer(s).`);
  } catch (err: any) {
    console.error('[migration] Failed to backfill customer numbers:', err?.message || err);
  }
};

export default mongoose.model<ICustomer>('Customer', CustomerSchema);

