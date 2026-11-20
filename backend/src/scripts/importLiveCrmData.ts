import path from 'path';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { loadEnv } from '../config/env';
import Customer from '../models/Customer';
import User from '../models/User';

loadEnv();

type Row = Record<string, unknown>;

const nilish = /^(nil|n\/a|na|null|undefined|—|-)$/i;

const clean = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return !text || nilish.test(text) ? '' : text;
};

const first = (...values: unknown[]): string => {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
};

const boolYes = (value: unknown): boolean => {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  if (['no', 'none', 'false', '0', 'nil'].includes(text)) return false;
  return text.includes('yes') || text.includes('active') || text.includes('enabled');
};

const normalizeLicenceStatus = (value: unknown): string => {
  const text = clean(value).toLowerCase();
  if (text.includes('blocked')) return 'blocked';
  if (text.includes('surrender')) return 'surrendered';
  if (text.includes('terminat')) return 'terminated';
  if (text.includes('expir')) return 'expired';
  return 'active';
};

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  let parsed: Date | undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    parsed = value;
  } else if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) parsed = new Date(Date.UTC(d.y, d.m - 1, d.d, 12));
  } else {
    const text = clean(value);
    if (!text) return undefined;
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) parsed = d;
  }
  if (!parsed) return undefined;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12));
};

const parseEmails = (value: unknown): string[] => {
  const text = clean(value).toLowerCase();
  if (!text) return [];
  return text
    .split(/[\/,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.includes('@'));
};

const normalizeRelease = (value: unknown): string => clean(value).replace(/^release\s*/i, 'Release ');

const deriveLicenceType = (product: string): string => {
  const text = product.toLowerCase();
  if (text.includes('gold')) return 'Gold';
  if (text.includes('silver')) return 'Silver';
  if (text.includes('server')) return 'Server';
  return product || 'Silver';
};

const isNoPartner = (value: string): boolean => !value || /no partner|nil|none/i.test(value);

const isValidGroup = (value: string): boolean => {
  const text = value.trim().toLowerCase();
  return Boolean(text && !['no', 'none', '—', '-', 'nil', '0', 'false'].includes(text));
};

export const mapExcelRowToCustomer = (row: Row, index: number, createdById: mongoose.Types.ObjectId) => {
  const serial = first(row['Serial No']);
  const product = first(row['Product']);
  const releaseVersion = normalizeRelease(row['Release']);
  const name = first(row['Org Name'], serial ? `Customer ${serial}` : `Customer Row ${index + 1}`);
  const primaryName = first(row['Primary Contact Person']);
  const secondaryName = first(row['Secondary Contact Name']);
  const primaryMobile = first(row['Primary Mobile']);
  const secondaryMobile = first(row['Secondary Mobile']);
  const landline = first(row['Landline']);
  const phone = first(primaryMobile, secondaryMobile, landline, serial, 'N/A');
  const contact = first(primaryName, secondaryName, name);
  const emails = parseEmails(row['Email ID']);
  const email = emails[0] || '';
  const tssExpiry = parseDate(row['TSS Expiry Date']);
  const licenceStatus = normalizeLicenceStatus(row['Status']);
  const partner = first(row['Partner details']);
  const salesman = first(row['Salesman']);
  const locationArea = first(row['Location/Area']);
  const fullAddress = first(row['Full Address']);
  const website = first(row['Website']);
  const websiteStatus = first(row['Website Status']) || 'active';
  const tssPassword = first(row['TSS Password']);
  const tallyLedger = first(row['Tally Ledger']);
  const rawGroup = first(row['Group']);
  const hasValidGroup = isValidGroup(rawGroup);
  const groupName = hasValidGroup ? rawGroup : '';

  const amcRaw = first(row['AMC Status']).toLowerCase();
  const currentAmcStatus = amcRaw.includes('yes') ? 'active' : amcRaw.includes('old') ? 'expired' : 'none';
  const tdlEnabled = boolYes(row['TDL Status']);
  const cloudEnabled = boolYes(row['Cloud Status']);

  const notesParts = [
    clean(row['Status']) && `Licence status: ${clean(row['Status'])}`,
    clean(row['AMC Status']) && `AMC: ${clean(row['AMC Status'])}`,
    clean(row['TDL Status']) && `TDL: ${clean(row['TDL Status'])}`,
    clean(row['Cloud Status']) && `Cloud: ${clean(row['Cloud Status'])}`,
    tallyLedger && `Tally ledger: ${tallyLedger}`,
    tssPassword && `TSS pwd: ${tssPassword}`,
  ].filter(Boolean);

  const keyContacts = [
    {
      contactName: primaryName || contact,
      mobile: primaryMobile || (phone !== 'N/A' ? phone : ''),
      whatsapp: primaryMobile,
      email,
      landline,
      contactPreference: primaryMobile ? 'Mobile' : landline ? 'Landline' : '',
    },
    secondaryName || secondaryMobile
      ? {
          contactName: secondaryName || 'Secondary Contact',
          mobile: secondaryMobile,
          whatsapp: secondaryMobile,
          email: emails[1] || '',
          landline,
          contactPreference: secondaryMobile ? 'Mobile' : '',
        }
      : null,
  ].filter(Boolean);

  const services: any[] = [
    {
      type: 'amc',
      quantity: 1,
      status: currentAmcStatus,
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row['Status']),
      salesman1: salesman,
      contactPerson: contact,
      mobile: phone,
      email,
      vendorCategory: partner,
      product,
      licenceType: deriveLicenceType(product),
      releaseVersion,
      licenseSerialNo: serial,
      licenceStatus,
      isAmcActive: currentAmcStatus === 'active',
      tssExpiryDate: tssExpiry,
      notesRemarks: notesParts.join(' | '),
    },
    {
      type: 'tss',
      quantity: 1,
      status: licenceStatus === 'active' ? 'active' : 'expired',
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row['Status']),
      salesman1: salesman,
      contactPerson: contact,
      mobile: phone,
      email,
      vendorCategory: partner,
      startDate: undefined,
      endDate: tssExpiry,
      licenseSerialNo: serial,
      product,
      releaseVersion,
      notesRemarks: notesParts.join(' | '),
    },
  ];

  if (tdlEnabled) {
    services.push({
      type: 'tdl',
      quantity: 1,
      status: 'active',
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row['TDL Status']),
      salesman1: salesman,
      contactPerson: contact,
      mobile: phone,
      email,
      vendorCategory: partner,
      product,
      release: releaseVersion,
      releaseVersion,
      licenseSerialNo: serial,
      isTdl: true,
      notesRemarks: clean(row['TDL Status']),
    });
  }

  if (cloudEnabled) {
    services.push({
      type: 'cloud',
      quantity: 1,
      status: 'active',
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row['Cloud Status']),
      salesman1: salesman,
      contactPerson: contact,
      mobile: phone,
      email,
      vendorCategory: partner,
      product,
      release: releaseVersion,
      releaseVersion,
    });
  }

  return {
    name,
    contact,
    phone,
    email,
    address: fullAddress,
    industry: '',
    products: product ? [product] : [],
    licenceType: deriveLicenceType(product),
    users: 1,
    amcStatus: currentAmcStatus,
    amcExpiry: currentAmcStatus === 'active' ? tssExpiry : undefined,
    notes: notesParts.join(' | '),
    companyInfo: {
      customerName: name,
      groupOfCompany: groupName,
      locationArea,
      fullAddress,
      website,
      websiteStatus,
      releaseVersion,
    },
    groupCompanies: groupName ? [{ name: groupName }] : [],
    partnerDetails: partner && !isNoPartner(partner) ? [{ companyName: partner, service: 'Partner' }] : [],
    keyContacts,
    primaryContactInfo: {
      contactName1: primaryName || contact,
      mobile: primaryMobile || (phone !== 'N/A' ? phone : ''),
      whatsapp: primaryMobile,
      email,
      contactPreference: primaryMobile ? 'Mobile' : '',
      landline,
    },
    secondaryContactInfo: secondaryName || secondaryMobile
      ? {
          contactName2: secondaryName,
          mobile: secondaryMobile,
          whatsapp: secondaryMobile,
          email: emails[1] || '',
          contactPreference: secondaryMobile ? 'Mobile' : '',
        }
      : {},
    serialNoInfo: [
      {
        product,
        releaseVersion,
        licenceType: deriveLicenceType(product),
        noOfUsers: 1,
        licenseSerialNo: serial,
        licenses: serial ? [{ licenceSerialNo: serial, licenceStatus }] : [],
        tssExpiryDate: tssExpiry,
        endDate: tssExpiry,
        isTdl: tdlEnabled,
        tdlEnabled,
        tdlSerialNos: tdlEnabled && serial ? [{ serialNo: serial }] : [],
        licenceStatus,
        notes: clean(row['Status']),
        contactDetails: {
          branchName: name,
          locationArea,
          contactPerson: contact,
          mobile: phone,
          vendorCategory: partner,
        },
      },
    ],
    amcDetails: currentAmcStatus !== 'none'
      ? {
          status: currentAmcStatus,
          companyType: 'head_office',
          companyName: name,
          address: fullAddress,
          details: clean(row['AMC Status']),
          salesman1: salesman,
          contactPerson: contact,
          mobile: phone,
          email,
          notesRemarks: notesParts.join(' | '),
          vendorCategory: partner,
          endDate: tssExpiry,
        }
      : {},
    tdlDetails: tdlEnabled
      ? {
          status: 'active',
          companyType: 'head_office',
          companyName: name,
          address: fullAddress,
          details: clean(row['TDL Status']),
          salesman1: salesman,
          contactPerson: contact,
          mobile: phone,
          email,
          notesRemarks: clean(row['TDL Status']),
          vendorCategory: partner,
          licenseSerialNo: serial,
        }
      : {},
    cloudDetails: cloudEnabled
      ? {
          status: 'active',
          companyType: 'head_office',
          companyName: name,
          address: fullAddress,
          details: clean(row['Cloud Status']),
          salesman1: salesman,
          contactPerson: contact,
          mobile: phone,
          email,
          notesRemarks: clean(row['Cloud Status']),
          vendorCategory: partner,
        }
      : {},
    tssDetails: {
      status: licenceStatus === 'active' ? 'active' : 'expired',
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row['Status']),
      salesman1: salesman,
      contactPerson: contact,
      mobile: phone,
      email,
      notesRemarks: notesParts.join(' | '),
      vendorCategory: partner,
      endDate: tssExpiry,
      licenseSerialNo: serial,
    },
    services,
    isActive: true,
    createdBy: createdById,
    importSource: 'CRM_Data.xlsx',
    importSerialNo: serial,
  };
};

const run = async () => {
  const filePath = process.argv[2] || path.resolve(__dirname, '../../../CRM_Data.xlsx');
  console.log(`Loading Excel from: ${filePath}`);

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets['Whole Database'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
  console.log(`Found ${rows.length} rows in Excel sheet.`);

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment.');

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(uri);

  const actor = await User.findOne({ isActive: true }).sort({ createdAt: 1 });
  if (!actor) throw new Error('No active user found in database.');

  console.log(`Using actor: ${actor.name} (${actor.email})`);

  const customersToInsert = rows.map((row, idx) => mapExcelRowToCustomer(row, idx, actor._id as mongoose.Types.ObjectId));

  console.log(`Inserting ${customersToInsert.length} customer records in batches...`);
  const batchSize = 250;
  let inserted = 0;

  for (let i = 0; i < customersToInsert.length; i += batchSize) {
    const chunk = customersToInsert.slice(i, i + batchSize);
    await Customer.insertMany(chunk, { ordered: false });
    inserted += chunk.length;
    console.log(`Progress: ${inserted} / ${customersToInsert.length} imported.`);
  }

  const finalCount = await Customer.countDocuments({ isActive: true });
  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Total Customers in Database: ${finalCount}`);

  await mongoose.disconnect();
};

if (require.main === module) {
  run().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
