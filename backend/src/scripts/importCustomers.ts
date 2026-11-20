import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';

import connectDB from '../config/database';
import Customer from '../models/Customer';
import User, { IUser } from '../models/User';

type CustomerStatus = 'active' | 'expired' | 'expiring' | 'none';
type ServiceStatus = CustomerStatus | 'trial';
type ServiceType = 'amc' | 'tdl' | 'tss' | 'cloud';

type RawRow = Record<string, unknown>;

interface ImportArgs {
  file?: string;
  commit: boolean;
  upsert: boolean;
  createdBy?: string;
  report?: string;
}

interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

interface ServicePayload {
  type: ServiceType;
  quantity: number;
  status: ServiceStatus;
  companyType: 'head_office';
  companyName?: string;
  address?: string;
  currentPrice?: number;
  startDate?: Date;
  endDate?: Date;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  notesRemarks?: string;
  vendor?: string;
  vendorCategory?: string;
  product?: string;
  licenceType?: string;
  licenseSerialNo?: string;
  noOfUsers?: number;
  release?: string;
  releaseVersion?: string;
  tssExpiryDate?: Date;
  cloudExpiryDate?: Date;
  cloudStartDate?: Date;
  domainLinkSubId?: string;
  isTdl?: boolean;
  tdlSerialNos?: Array<{ serialNo: string }>;
  amcValue?: number;
}

interface CustomerPayload {
  name: string;
  contact: string;
  phone: string;
  email?: string;
  address?: string;
  industry?: string;
  products: string[];
  licenceType?: string;
  users: number;
  amcStatus: CustomerStatus;
  amcExpiry?: Date;
  customerType?: string;
  notes?: string;
  companyInfo: Record<string, unknown>;
  keyContacts: Array<Record<string, unknown>>;
  primaryContactInfo: Record<string, unknown>;
  serialNoInfo: Array<Record<string, unknown>>;
  amcDetails?: ServicePayload;
  tdlDetails?: ServicePayload;
  cloudDetails?: ServicePayload;
  tssDetails?: ServicePayload;
  services: ServicePayload[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
}

const FIELD_ALIASES: Record<string, string[]> = {
  serial: ['s no', 'sno', 's.no', 's.no.', 'sl no', 'sl.no', 'no', '#'],
  name: ['customer', 'customer name', 'customer name*', 'company', 'company name', 'organization', 'organisation', 'name'],
  contact: ['contact', 'contact name1', 'contact name1*', 'contact person', 'primary contact', 'primary contact name'],
  phone: ['mobile', 'mobile*', 'phone', 'contact number', 'primary contact phone', 'telephone', 'whatsapp', 'whats app'],
  whatsapp: ['whatsapp', 'whats app', 'wa number'],
  email: ['email', 'e-mail', 'mail', 'primary email'],
  address: ['address', 'full address', 'location address'],
  area: ['area', 'location', 'location area'],
  industry: ['industry', 'business segment', 'business type'],
  customerType: ['customer type', 'type', 'gold / silver type', 'gold silver type', 'gold/silver type'],
  crNo: ['cr no', 'cr number', 'commercial registration no'],
  groupCompany: ['group of company', 'group company', 'group'],
  website: ['website', 'web site', 'website url'],
  product: ['product', 'products', 'product name'],
  licenceType: ['license type', 'licence type', 'license', 'licence', 'product type'],
  licenseSerialNo: ['license serial no', 'licence serial no', 'license serial number', 'serial no', 'serial number', 'serial'],
  release: ['release', 'release version', 'version'],
  users: ['users', 'no of users', 'number of users', 'user count'],
  amcStatus: ['amc status', 'status', 'amc active'],
  amcStartDate: ['amc start date', 'start date', 'from date', 'contract start'],
  amcEndDate: ['amc end date', 'amc expiry', 'amc expiry date', 'expiry date', 'end date', 'contract end'],
  amcValue: ['amc value', 'value', 'amount', 'price', 'contract value'],
  agreementStatus: ['agreement status', 'agreement'],
  notes: ['notes', 'notes/remarks', 'remarks', 'description'],
  tdlStatus: ['tdl', 'tdl add-ons', 'tdl add ons', 'tdl add-ons active', 'tdl enabled', 'tdl status'],
  tdlSerialNo: ['tdl serial no', 'tdl serial number'],
  cloudStatus: ['cloud', 'cloud hub', 'cloud hub active', 'cloud status'],
  cloudVendor: ['cloud vendor', 'vendor'],
  cloudDomain: ['domain / sub id', 'domain/sub id', 'domain sub id', 'domain', 'sub id'],
  cloudStartDate: ['cloud start date'],
  cloudExpiryDate: ['cloud expiry date', 'cloud expiry', 'cloud end date'],
  tssStatus: ['tss', 'tss premium active', 'tss status'],
  tssExpiryDate: ['tss expiry', 'tss expiry date', 'tss premium expiry'],
};

const ALIAS_LOOKUP = Object.entries(FIELD_ALIASES).reduce<Record<string, string>>((acc, [canonical, aliases]) => {
  for (const alias of aliases) acc[normalizeHeader(alias)] = canonical;
  return acc;
}, {});

const parseArgs = (): ImportArgs => {
  const args = process.argv.slice(2);
  const parsed: ImportArgs = { commit: false, upsert: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--file') parsed.file = args[++i];
    else if (arg === '--commit') parsed.commit = true;
    else if (arg === '--dry-run') parsed.commit = false;
    else if (arg === '--upsert') parsed.upsert = true;
    else if (arg === '--created-by') parsed.createdBy = args[++i];
    else if (arg === '--report') parsed.report = args[++i];
  }

  return parsed;
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  return ['nil', 'null', 'undefined', 'n/a', 'na'].includes(text.toLowerCase()) ? '' : text;
}

function readWorkbookRows(filePath: string): RawRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Import file not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });
}

function normalizeRow(row: RawRow): RawRow {
  return Object.entries(row).reduce<RawRow>((acc, [header, value]) => {
    const canonical = ALIAS_LOOKUP[normalizeHeader(header)] || normalizeHeader(header);
    if (acc[canonical] === undefined || cleanText(acc[canonical]) === '') {
      acc[canonical] = value;
    }
    return acc;
  }, {});
}

function get(row: RawRow, key: string): string {
  return cleanText(row[key]);
}

function parseNumber(value: string): number | undefined {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(Date.UTC(year, month, day));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseBoolish(value: string): boolean {
  return ['yes', 'y', 'true', '1', 'active', 'enabled', 'available'].includes(value.toLowerCase());
}

function computeStatus(rawStatus: string, endDate?: Date): CustomerStatus {
  if (endDate) {
    const now = new Date();
    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring';
    return 'active';
  }

  const raw = rawStatus.toLowerCase();
  if (raw.includes('expired')) return 'expired';
  if (raw.includes('expiring')) return 'expiring';
  if (raw.includes('active') || raw.includes('enabled') || raw.includes('yes')) return 'active';
  return 'none';
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCustomerPayload(row: RawRow, rowNumber: number): { payload?: CustomerPayload; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const name = get(row, 'name');
  const contact = get(row, 'contact') || name;
  const phone = get(row, 'phone');
  const email = get(row, 'email').toLowerCase();
  const productList = splitList(get(row, 'product'));
  const product = productList[0] || '';
  const licenceType = get(row, 'licenceType') || undefined;
  const licenseSerialNo = get(row, 'licenseSerialNo');
  const users = parseNumber(get(row, 'users')) || 1;
  const amcStartDate = parseDate(get(row, 'amcStartDate'));
  const amcEndDate = parseDate(get(row, 'amcEndDate'));
  const amcValue = parseNumber(get(row, 'amcValue'));
  const amcStatus = computeStatus(get(row, 'amcStatus'), amcEndDate);
  const release = get(row, 'release');
  const address = get(row, 'address');
  const area = get(row, 'area');
  const industry = get(row, 'industry');
  const customerType = get(row, 'customerType');
  const notes = get(row, 'notes');

  if (!name) warnings.push({ row: rowNumber, field: 'customerName', message: 'Missing customer/company name; row skipped.' });
  if (!phone) warnings.push({ row: rowNumber, field: 'phone', message: 'Missing phone/mobile; row skipped to protect required customer data.' });
  if (!name || !phone) return { warnings };

  const services: ServicePayload[] = [];
  if (product || licenceType || licenseSerialNo || amcStartDate || amcEndDate || amcValue !== undefined) {
    services.push({
      type: 'amc',
      quantity: 1,
      status: amcStatus,
      companyType: 'head_office',
      companyName: name,
      address,
      currentPrice: amcValue,
      startDate: amcStartDate,
      endDate: amcEndDate,
      contactPerson: contact,
      mobile: phone,
      email,
      notesRemarks: notes,
      product,
      licenceType,
      licenseSerialNo,
      noOfUsers: users,
      releaseVersion: release,
      amcValue,
    });
  }

  const tdlStatusRaw = get(row, 'tdlStatus');
  const tdlSerialNo = get(row, 'tdlSerialNo');
  if (parseBoolish(tdlStatusRaw) || tdlSerialNo) {
    services.push({
      type: 'tdl',
      quantity: 1,
      status: 'active',
      companyType: 'head_office',
      companyName: name,
      address,
      contactPerson: contact,
      mobile: phone,
      email,
      licenseSerialNo: tdlSerialNo || licenseSerialNo,
      isTdl: true,
      tdlSerialNos: (tdlSerialNo || licenseSerialNo) ? [{ serialNo: tdlSerialNo || licenseSerialNo }] : [],
    });
  }

  const cloudStatusRaw = get(row, 'cloudStatus');
  const cloudExpiryDate = parseDate(get(row, 'cloudExpiryDate'));
  const cloudStartDate = parseDate(get(row, 'cloudStartDate'));
  const cloudDomain = get(row, 'cloudDomain');
  if (parseBoolish(cloudStatusRaw) || cloudExpiryDate || cloudDomain) {
    services.push({
      type: 'cloud',
      quantity: 1,
      status: computeStatus(cloudStatusRaw, cloudExpiryDate),
      companyType: 'head_office',
      companyName: name,
      address,
      contactPerson: contact,
      mobile: phone,
      email,
      vendor: get(row, 'cloudVendor') || undefined,
      startDate: cloudStartDate,
      endDate: cloudExpiryDate,
      cloudStartDate,
      cloudExpiryDate,
      domainLinkSubId: cloudDomain,
      noOfUsers: users,
      release,
    });
  }

  const tssStatusRaw = get(row, 'tssStatus');
  const tssExpiryDate = parseDate(get(row, 'tssExpiryDate'));
  if (parseBoolish(tssStatusRaw) || tssExpiryDate) {
    services.push({
      type: 'tss',
      quantity: 1,
      status: computeStatus(tssStatusRaw, tssExpiryDate),
      companyType: 'head_office',
      companyName: name,
      address,
      contactPerson: contact,
      mobile: phone,
      email,
      startDate: amcStartDate,
      endDate: tssExpiryDate,
      tssExpiryDate,
      licenseSerialNo,
    });
  }

  const payload: CustomerPayload = {
    name,
    contact,
    phone,
    email,
    address,
    industry,
    products: productList,
    licenceType,
    users,
    amcStatus,
    amcExpiry: amcEndDate,
    customerType,
    notes,
    companyInfo: {
      customerName: name,
      crNo: get(row, 'crNo'),
      groupOfCompany: get(row, 'groupCompany'),
      businessSegment: industry,
      industry,
      locationArea: area,
      fullAddress: address,
      website: get(row, 'website'),
      releaseVersion: release,
    },
    keyContacts: [{
      contactName: contact,
      mobile: phone,
      whatsapp: get(row, 'whatsapp') || phone,
      email,
      contactPreference: 'Mobile',
    }],
    primaryContactInfo: {
      contactName1: contact,
      mobile: phone,
      whatsapp: get(row, 'whatsapp') || phone,
      email,
      contactPreference: 'Mobile',
    },
    serialNoInfo: product || licenceType || licenseSerialNo ? [{
      product,
      releaseVersion: release,
      licenceType,
      noOfUsers: users,
      licenses: licenseSerialNo ? [{ licenceSerialNo: licenseSerialNo, licenceStatus: 'active' }] : [],
      startDate: amcStartDate,
      endDate: amcEndDate,
      isAmcActive: amcStatus === 'active' || amcStatus === 'expiring',
      pricingDetails: { currentPrice: amcValue },
      notes,
    }] : [],
    amcDetails: services.find((service) => service.type === 'amc'),
    tdlDetails: services.find((service) => service.type === 'tdl'),
    cloudDetails: services.find((service) => service.type === 'cloud'),
    tssDetails: services.find((service) => service.type === 'tss'),
    services,
    isActive: true,
  };

  return { payload, warnings };
}

async function resolveCreatedBy(value?: string): Promise<mongoose.Types.ObjectId> {
  const query = value
    ? mongoose.isValidObjectId(value)
      ? { _id: value }
      : { email: value.toLowerCase() }
    : { isActive: true };

  const user = await User.findOne(query).sort({ createdAt: 1 }) as IUser | null;
  if (!user) {
    throw new Error(value ? `No user found for --created-by ${value}` : 'No active user found to own imported customers.');
  }
  return user._id as mongoose.Types.ObjectId;
}

async function run(): Promise<void> {
  const args = parseArgs();
  if (!args.file) {
    throw new Error('Usage: npm run import:customers -- --file ./customers.xlsx [--dry-run|--commit] [--upsert] [--created-by admin@example.com]');
  }

  const absoluteFile = path.resolve(args.file);
  const rawRows = readWorkbookRows(absoluteFile);
  const normalizedRows = rawRows.map(normalizeRow);
  const warnings: ImportWarning[] = [];
  const payloads: Array<{ row: number; payload: CustomerPayload }> = [];

  normalizedRows.forEach((row, index) => {
    const sourceRow = index + 2;
    const { payload, warnings: rowWarnings } = buildCustomerPayload(row, sourceRow);
    warnings.push(...rowWarnings);
    if (payload) payloads.push({ row: sourceRow, payload });
  });

  let inserted = 0;
  let updated = 0;
  let duplicates = 0;

  if (args.commit) {
    const connected = await connectDB();
    if (!connected) throw new Error('MongoDB connection failed.');
    const createdBy = await resolveCreatedBy(args.createdBy);

    for (const item of payloads) {
      item.payload.createdBy = createdBy;
      const existing = await Customer.findOne({ name: item.payload.name, phone: item.payload.phone });
      if (existing && args.upsert) {
        await Customer.updateOne({ _id: existing._id }, { $set: { ...item.payload, createdBy: existing.createdBy } });
        updated += 1;
      } else if (existing) {
        duplicates += 1;
      } else {
        await Customer.create(item.payload);
        inserted += 1;
      }
    }

    await mongoose.disconnect();
  }

  const report = {
    mode: args.commit ? 'commit' : 'dry-run',
    file: absoluteFile,
    totalRows: rawRows.length,
    validRows: payloads.length,
    skippedRows: rawRows.length - payloads.length,
    inserted,
    updated,
    duplicates,
    warnings,
    mappedFields: FIELD_ALIASES,
  };

  const reportJson = JSON.stringify(report, null, 2);
  if (args.report) fs.writeFileSync(path.resolve(args.report), `${reportJson}\n`);
  console.log(reportJson);
}

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
