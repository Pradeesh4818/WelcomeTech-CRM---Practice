// ─── AUTH ─────────────────────────────────────────
export type ModuleId = 'amc' | 'tdl' | 'tss' | 'cloud' | 'licensing_hub';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'engineer' | 'sales_executive' | string | any;
  permissions?: string[];
  hasFullAccess?: boolean;
  salary?: number;
  avatar?: string;
  phone?: string;
  address?: string;
  passport?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  qidDocument?: string;
  qidNumber?: string;
  qidExpiryDate?: string;
  documents?: Array<{ _id?: string; name: string; path: string; uploadedAt?: string }>;
  isActive: boolean;
  lastLogin?: string;
  createdAt?: string;
  totalCalls?: number;
  resolvedCalls?: number;
  openTaskCount?: number;
  theme?: 'light' | 'dark';
}

// ─── CUSTOMER ────────────────────────────────────
export interface AMCRenewal {
  renewedOn: string;
  period: string;
  startDate: string;
  expiryDate: string;
  amount: number;
  paymentMethod: string;
  invoiceNo?: string;
  notes?: string;
}

export interface ServiceInstance {
  _id?: string;
  type: ModuleId;
  quantity?: number;
  status: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
  
  // Common details
  companyType?: 'head_office' | 'branch';
  companyName?: string;
  address?: string;
  details?: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  notesRemarks?: string;
  vendor?: string;
  vendorCategory?: string;
  reminder?: string;
  
  // Financials
  actualPrice?: number;
  discount?: number;
  currentPrice?: number;
  advance1?: number;
  advance2?: number;
  remainingTotal?: number;
  others?: string;
  showPricing?: boolean;
  salesman1?: string;
  salesman2?: string;
  
  // Dates
  startDate?: string;
  endDate?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialPrice?: number;
  tssExpiryDate?: string;
  
  // Specifics
  licenseSerialNo?: string;
  noOfDays?: number;
  product?: string;
  licenceType?: string;
  isAmcActive?: boolean;
  
  // Cloud Specifics
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
  
  renewalHistory?: AMCRenewal[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer {
  _id: string;
  customerNumber?: string;
  name: string;
  contact: string;
  phone: string;
  email?: string;
  address?: string;
  industry?: string;
  products: string[];
  licenceType: string;
  users: number;
  amcStatus: 'active' | 'expired' | 'expiring' | 'none';
  amcExpiry?: string;
  customerType?: string | string[];
  notes?: string;
  avatar?: string;
  lastNotifiedAt?: string;
  lastNotifiedChannel?: 'email' | 'whatsapp';
  lastNotifiedTemplate?: string;
  agreementCopy?: string;
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
  startDate?: string;
  endDate?: string;
  licenseSerialNo?: string;
  branchInfo?: {
    isBranch?: boolean;
    branchName?: string;
    branchCode?: string;
    parentCompanyId?: string;
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
    startDate?: string;
    endDate?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialPrice?: number;
    tssExpiryDate?: string;
    isServer9?: boolean;
    server9SerialNo?: string;
    isTdl?: boolean;
    tdlEnabled?: boolean;
    tdlSerialNos?: Array<{
      serialNo?: string;
    }>;
    tdlSerialNo?: string;
    isAmcActive?: boolean;
    licenceStatus?: 'active' | 'expired' | 'blocked' | 'surrendered' | 'terminated';
    licenseSerialNo?: string;
    companyName?: string;
    address?: string;
    pricingDetails?: {
      actualPrice?: number;
      discount?: number;
      currentPrice?: number;
      advance1?: number;
      advance2?: number;
      remainingTotal?: number;
    };
    notes?: string;
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
    startDate?: string;
    endDate?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialPrice?: number;
    value?: number;
    salesman1?: string;
    salesman2?: string;
    contactPerson?: string;
    mobile?: string;
    email?: string;
    notesRemarks?: string;
    vendorCategory?: string;
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
    vendorCategory?: string;
    lastNotifiedAt?: string;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    startDate?: string;
    endDate?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialPrice?: number;
    licenseSerialNo?: string;
    noOfDays?: number;
    days?: number;
    renewalHistory?: AMCRenewal[];
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
    vendorCategory?: string;
    lastNotifiedAt?: string;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    startDate?: string;
    endDate?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialPrice?: number;
    vendor?: string;
    cloudExpiryDate?: string;
    cloudStartDate?: string;
    licenseSerialNo?: string;
    domainLinkSubId?: string;
    noOfUsers?: number;
    release?: string;
    users?: Array<{
      username?: string;
      userDetail?: string;
      userLocation?: string;
    }>;
    renewalHistory?: AMCRenewal[];
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
    vendorCategory?: string;
    lastNotifiedAt?: string;
    lastNotifiedChannel?: 'email' | 'whatsapp';
    lastNotifiedTemplate?: string;
    status?: 'active' | 'expired' | 'expiring' | 'none' | 'trial';
    startDate?: string;
    endDate?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    initialPrice?: number;
    licenseSerialNo?: string;
    renewalHistory?: AMCRenewal[];
  };
  services: ServiceInstance[];
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── LICENCE TYPE ───────────────────────────────
export interface LicenceType {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── CUSTOMER TYPE ──────────────────────────────
export interface CustomerType {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── LEAD SOURCE ───────────────────────────────
export interface LeadSource {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── LEAD STATUS ───────────────────────────────
export interface LeadStatusMaster {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── PRODUCT ────────────────────────────────────
export interface Product {
  _id: string;
  name: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── VENDOR CATEGORY ─────────────────────────────
export interface VendorCategory {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}
// ─── TICKET CATEGORY ───────────────────────────
export interface TicketCategory {
  _id: string;
  name: string;
  subCategories: string[];
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── INDUSTRY ──────────────────────────────────
export interface Industry {
  _id: string;
  name: string;
  industryGroups: string[];
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── BUSINESS SEGMENT ──────────────────────────
export interface BusinessSegment {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── INDUSTRY TYPE ─────────────────────────────
export interface IndustryType {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── CALL ────────────────────────────────────────
export interface Call {
  _id: string;
  customer: Customer | string;
  engineer: User | string;
  type: 'remote' | 'visit' | 'phone' | 'email';
  issueType: string;
  subject: string;
  description?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  resolution?: string;
  duration?: number;
  callDate: string;
  resolvedDate?: string;
  chargeApplicable: boolean;
  chargeAmount?: number;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}


export interface AMC {
  _id: string;
  customer: Customer | string;
  product: string;
  licenceType: string;
  startDate: string;
  expiryDate: string;
  amount: number;
  status: 'active' | 'expired' | 'expiring';
  notes?: string;
  lastNotifiedAt?: string;
  lastNotifiedChannel?: 'email' | 'whatsapp';
  lastNotifiedTemplate?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    accuracy?: number;
    capturedAt?: string;
  };
  renewalHistory: AMCRenewal[];
  daysLeft?: number | null;
  statusText?: string;
  createdBy: User | string;
  createdAt: string;
}

// ─── TICKET ──────────────────────────────────────
export interface TicketThread {
  _id?: string;
  author: User | string;
  authorName: string;
  authorRole: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export interface Ticket {
  _id: string;
  ticketNo: string;
  customer: Customer | string;
  contactPerson?: string;
  mailId?: string;
  phoneNumber?: string;
  assignedTo: User | string;
  subject: string;
  description?: string;
  category: string;
  subCategory?: string;
  status: 'open' | 'in-progress' | 'pending-customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  ticketRaisedDate?: string;
  completedDate?: string;
  tags: string[];
  thread: TicketThread[];
  resolvedAt?: string;
  closedAt?: string;
  lastFollowupDate?: string;
  nextFollowupDate?: string;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

// ─── TASK ───────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'forwarded' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType = 'general' | 'customer' | 'lead' | 'ticket' | 'amc' | 'tdl' | 'tss' | 'cloud' | 'call' | 'payment' | 'proposal';

export interface TaskHistoryItem {
  _id?: string;
  action: 'created' | 'status_change' | 'forwarded' | 'completed' | 'reopened' | 'updated' | 'comment' | 'proposal' | 'lost';
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  fromAssignee?: User | string;
  toAssignee?: User | string;
  performedBy?: User | string;
  comment?: string;
  createdAt?: string;
}

export interface Task {
  _id: string;
  taskNo: string;
  title: string;
  description?: string;
  taskDate?: string;
  taskType?: TaskType;
  customer?: Customer | string;
  lead?: Lead | string;
  ticket?: Ticket | string;
  assignedTo: User | string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
  createdBy?: User | string;
  completedBy?: User | string | null;
  forwardedBy?: User | string | null;
  completedAt?: string;
  isActive: boolean;
  history?: TaskHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskDashboard {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  myTasks: number;
  critical: number;
  byStatus: Array<{ _id: TaskStatus; count: number }>;
  byPriority: Array<{ _id: TaskPriority; count: number }>;
  upcoming: Task[];
}

// ─── PAYMENT ─────────────────────────────────────
export interface Payment {
  _id: string;
  invoiceNo: string;
  customer: Customer | string;
  paymentType: string;
  description?: string;
  amount: number;
  paymentDate: string;
  dueDate?: string;
  method: string;
  transactionRef?: string;
  status: 'paid' | 'pending' | 'partial' | 'overdue';
  partialAmount?: number;
  remarks?: string;
  createdBy: User | string;
  createdAt: string;
}

// ─── PROPOSAL ────────────────────────────────────
export interface ProposalItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Proposal {
  _id: string;
  proposalNo: string;
  proposalId?: string;
  customer?: Customer | string;
  lead?: Lead | string;
  task?: Task | string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  cc?: string;
  customerAddress?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  title: string;
  items: ProposalItem[];
  subtotal: number;
  discount: number;
  total: number;
  amount?: number;
  quoteDate?: string;
  proposalDate?: string;
  validUntil: string;
  terms?: string;
  templateImage?: string;
  templateFooterImage?: string;
  blocks?: any[];
  overallTotal?: any;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  sentAt?: string;
  resentAt?: string;
  lastSentAt?: string;
  resendCount?: number;
  revision?: number;
  revisedAt?: string;
  revisionHistory?: Array<{
    revision: number;
    revisedAt: string;
    revisedBy?: any;
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
  createdBy: User | string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProposalTemplate {
  _id: string;
  name: string;
  title?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  items: ProposalItem[];
  discount: number;
  terms?: string;
  templateImage?: string;
  templateFooterImage?: string;
  validForDays: number;
  blocks?: any[];
  overallTotal?: any;
  status?: 'active' | 'inactive' | 'draft';
  isActive?: boolean;
  createdBy?: User | string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── DASHBOARD ───────────────────────────────────
export interface DashboardData {
  kpis: {
    totalCustomers: number;
    openCalls: number;
    openTickets: number;
    expiringSoon: number;
    monthRevenue: number;
  };
  analytics: {
    criticalOpenTickets: number;
    outstandingAmount: number;
    outstandingCustomers: number;
    revenueYtd: number;
    revenueTrend: Array<{ month: string; revenue: number }>;
    callsTrend: Array<{ day: string; calls: number }>;
  };
  recentCalls: Call[];
  recentTickets: Ticket[];
}

// ─── API RESPONSE ────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  total?: number;
  page?: number;
  pages?: number;
}

export type ThemeMode = 'light' | 'dark';

// ─── LEAD ────────────────────────────────────────
export type LeadStatus = string;

export type LeadPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Lead {
  _id: string;
  leadId: string;
  leadDate?: string;
  leadType?: 'new' | 'existing';
  customerId?: Customer | string;
  name: string;
  email: string;
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
  expectedClosingDate?: string;
  notes?: string;
  assignedTo?: User | string;
  createdBy: User | string;
  lastFollowupDate?: string;
  nextFollowupDate?: string;
  convertedAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── EMAIL TEMPLATE ────────────────────────────
export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  body: string;
  createdBy?: User | string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSendPayload {
  to: string;
  templateId: string;
  dynamicData?: Record<string, string>;
}
