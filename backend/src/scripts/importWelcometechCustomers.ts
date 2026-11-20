import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import { loadEnv } from '../config/env';
import Customer from '../models/Customer';
import User from '../models/User';

loadEnv();

type Row = Record<string, unknown>;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const sourceArg = process.argv.find((arg) => arg.startsWith('--file='));
const sourceFile = sourceArg
  ? sourceArg.slice('--file='.length)
  : '/Users/aedenteka/Downloads/Welcometech data.xlsx';

const nilish = /^(nil|n\/a|na|null|undefined)$/i;

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
  if (['no', 'none', 'false', '0'].includes(text)) return false;
  return text.includes('yes') || text.includes('old amc') || text === 'active';
};

const normalizeLicenceStatus = (value: unknown): string => {
  const text = clean(value).toLowerCase();
  if (text.includes('blocked')) return 'blocked';
  if (text.includes('surrender')) return 'surrendered';
  if (text.includes('terminat')) return 'terminated';
  if (text.includes('expir')) return 'expired';
  return 'active';
};

const serviceStatusFromDate = (date: Date | undefined, rawStatus?: unknown): string => {
  const licenceStatus = normalizeLicenceStatus(rawStatus);
  if (licenceStatus !== 'active') return 'expired';
  if (!date) return 'active';
  const today = new Date();
  const days = Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'expired';
  if (days <= 45) return 'expiring';
  return 'active';
};

const amcStatus = (value: unknown): string => {
  const text = clean(value).toLowerCase();
  if (!text || text === 'no') return 'none';
  if (text.includes('old')) return 'expired';
  if (text.includes('yes')) return 'active';
  return 'none';
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

const isNoPartner = (value: string): boolean => /no partner/i.test(value);

const makeCustomer = (row: Row, index: number, createdBy: mongoose.Types.ObjectId) => {
  const serial = first(row['Serial No']);
  const product = first(row.Product);
  const releaseVersion = normalizeRelease(row.Release);
  const name = first(row['Org Name'], serial ? `Imported Customer ${serial}` : `Imported Customer Row ${index + 2}`);
  const primaryName = first(row['Primary Contact Person']);
  const secondaryName = first(row['Secondary Contact Name']);
  const primaryMobile = first(row['Primary Mobile']);
  const secondaryMobile = first(row['Secondary Mobile']);
  const landline = first(row.Landline);
  const phone = first(primaryMobile, secondaryMobile, landline, serial, 'N/A');
  const contact = first(primaryName, secondaryName, name);
  const emails = parseEmails(row['Email ID']);
  const email = emails[0] || '';
  const tssExpiry = parseDate(row['TSS Expiry Date']);
  const licenceStatus = normalizeLicenceStatus(row.Status);
  const partner = first(row['Partner details']);
  const salesman = first(row.Salesman);
  const locationArea = first(row['Location/Area']);
  const fullAddress = first(row['Full Address']);
  const website = first(row.Website);
  const websiteStatus = first(row['Website Status']);
  const tssPassword = first(row['TSS Password']);
  const tallyLedger = first(row['Tally Ledger']);
  const group = first(row.Group);
  const currentAmcStatus = amcStatus(row['AMC Status']);
  const currentTssStatus = serviceStatusFromDate(tssExpiry, row.Status);
  const tdlEnabled = boolYes(row['TDL Status']);
  const cloudEnabled = boolYes(row['Cloud Status']);
  const notesParts = [
    clean(row.Status) && `Source status: ${clean(row.Status)}`,
    clean(row['AMC Status']) && `AMC status: ${clean(row['AMC Status'])}`,
    clean(row['TDL Status']) && `TDL status: ${clean(row['TDL Status'])}`,
    clean(row['Cloud Status']) && `Cloud status: ${clean(row['Cloud Status'])}`,
    tallyLedger && `Tally ledger: ${tallyLedger}`,
    tssPassword && `TSS password: ${tssPassword}`,
  ].filter(Boolean);

  const keyContacts = [
    {
      contactName: primaryName || contact,
      mobile: primaryMobile,
      whatsapp: primaryMobile,
      email,
      landline,
      contactPreference: primaryMobile ? 'Mobile' : landline ? 'Landline' : '',
    },
    secondaryName || secondaryMobile
      ? {
          contactName: secondaryName,
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
      details: clean(row.Status),
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
      status: currentTssStatus,
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row.Status),
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
      licenseSerialNo: serial,
      product,
      releaseVersion,
      isTdl: true,
      tdlSerialNos: serial ? [{ serialNo: serial }] : [],
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
      groupOfCompany: group,
      locationArea,
      fullAddress,
      website,
      websiteStatus,
      releaseVersion,
    },
    groupCompanies: group && group.toLowerCase() !== name.toLowerCase() ? [{ name: group }] : [],
    partnerDetails: partner && !isNoPartner(partner) ? [{ companyName: partner, service: 'Partner' }] : [],
    keyContacts,
    primaryContactInfo: {
      contactName1: primaryName || contact,
      mobile: primaryMobile || phone,
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
        notes: clean(row.Status),
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
          release: releaseVersion,
        }
      : {},
    tssDetails: {
      status: currentTssStatus,
      companyType: 'head_office',
      companyName: name,
      address: fullAddress,
      details: clean(row.Status),
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
    createdBy,
    importSource: 'Welcometech data.xlsx',
    importSerialNo: serial,
  } as any;
};

const serialMatchFilter = (importSerialNo: string) => {
  if (importSerialNo.includes('::row')) {
    return { importSerialNo };
  }

  return {
    $or: [
      { importSerialNo },
      { 'serialNoInfo.licenseSerialNo': importSerialNo },
      { 'serialNoInfo.licenses.licenceSerialNo': importSerialNo },
      { 'services.licenseSerialNo': importSerialNo },
    ],
  };
};

const main = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing. Run from backend with APP_ENV=staging.');

  const resolvedFile = path.resolve(sourceFile);
  const workbook = XLSX.readFile(resolvedFile, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { defval: null, raw: true });

  await mongoose.connect(uri);
  const actor = await User.findOne({
    isActive: true,
    $or: [{ email: 'admin@welcometech.qa' }, { role: 'admin' }],
  }).sort({ createdAt: 1 });
  if (!actor) throw new Error('No active admin user found for createdBy.');

  const before = await Customer.countDocuments({ isActive: true });
  const docs = rows.map((row, index) => makeCustomer(row, index, actor._id as mongoose.Types.ObjectId));
  const duplicateSerials = new Set<string>();
  const seenSerials = new Set<string>();
  docs.forEach((doc) => {
    const serial = doc.importSerialNo;
    if (!serial) return;
    if (seenSerials.has(serial)) duplicateSerials.add(serial);
    seenSerials.add(serial);
  });
  docs.forEach((doc, index) => {
    if (doc.importSerialNo && duplicateSerials.has(doc.importSerialNo)) {
      doc.importSerialNo = `${doc.importSerialNo}::row${index + 2}`;
    }
  });

  const missingName = docs.filter((doc) => !doc.name).length;
  const missingPhone = docs.filter((doc) => !doc.phone).length;

  let existingMatches = 0;
  for (const doc of docs) {
    const serial = doc.importSerialNo;
    if (!serial) continue;
    const exists = await Customer.exists(serialMatchFilter(serial));
    if (exists) existingMatches += 1;
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    source: resolvedFile,
    sheet: sheetName,
    sourceRows: rows.length,
    customerCountBefore: before,
    preparedDocuments: docs.length,
    missingName,
    missingPhone,
    duplicateSerials: duplicateSerials.size,
    existingSerialMatches: existingMatches,
    createdBy: { id: String(actor._id), name: actor.name, email: actor.email },
    sample: docs.slice(0, 3).map((doc) => ({
      serial: doc.importSerialNo,
      name: doc.name,
      contact: doc.contact,
      phone: doc.phone,
      product: doc.products?.[0],
      licenceType: doc.licenceType,
      tssExpiry: doc.tssDetails?.endDate,
      services: doc.services.map((s: any) => `${s.type}:${s.status}`),
    })),
  }, null, 2));

  if (!apply) {
    await mongoose.disconnect();
    return;
  }

  const ops = docs.map((doc) => {
    doc.importSource = path.basename(resolvedFile);
    const serial = doc.importSerialNo;
    const filter = serial ? serialMatchFilter(serial) : { name: doc.name, phone: doc.phone };
    return {
      updateOne: {
        filter,
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  const result = await Customer.bulkWrite(ops);
  const created = result.upsertedCount || 0;
  const updated = result.modifiedCount || 0;

  const after = await Customer.countDocuments({ isActive: true });
  const filename = path.basename(resolvedFile);
  const imported = await Customer.collection.countDocuments({ importSource: filename });
  const tssImported = await Customer.collection.countDocuments({ importSource: filename, 'services.type': 'tss' });
  const tdlImported = await Customer.collection.countDocuments({ importSource: filename, 'services.type': 'tdl' });
  const cloudImported = await Customer.collection.countDocuments({ importSource: filename, 'services.type': 'cloud' });

  console.log(JSON.stringify({
    result: 'completed',
    created,
    updated,
    customerCountBefore: before,
    customerCountAfter: after,
    importedTaggedCount: imported,
    importedWithTss: tssImported,
    importedWithTdl: tdlImported,
    importedWithCloud: cloudImported,
  }, null, 2));

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
