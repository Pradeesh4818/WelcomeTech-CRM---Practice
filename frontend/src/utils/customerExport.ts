import { Customer } from '../types';
import { ExportSheet } from './excelExport';

const NIL = 'NIL';

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

const exportValue = (...values: unknown[]) => first(...values) || NIL;

const normalizeRelease = (value: unknown): string => {
  const text = clean(value);
  if (!text) return NIL;
  return /^release\b/i.test(text) ? text : `Release ${text}`;
};

const titleStatus = (value: unknown): string => {
  const text = clean(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const yesNoStatus = (value: unknown): string => {
  const text = clean(value).toLowerCase();
  if (!text) return '';
  if (['none', 'no', 'false', '0'].includes(text)) return 'NO';
  if (text.includes('old amc')) return 'Old AMC';
  if (['active', 'yes', 'true', '1', 'trial', 'expiring'].includes(text)) return 'Yes';
  if (text.includes('yes')) return clean(value);
  return clean(value);
};

const sourceNoteValue = (customer: Customer, label: string): string => {
  const note = clean(customer.notes);
  if (!note) return '';
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = note.match(new RegExp(`${escapedLabel}:\\s*([^|]+)`, 'i'));
  return clean(match?.[1]);
};

const parseDateValue = (value: unknown): Date | string => {
  const text = clean(value);
  if (!text) return NIL;
  const parsed = value instanceof Date ? value : new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed;
};

const serialInfoOf = (customer: Customer) => customer.serialNoInfo?.[0] || {};
const primaryServiceOf = (customer: Customer, type: 'amc' | 'tdl' | 'tss' | 'cloud') =>
  customer.services?.find((service) => service.type === type);

const customerEmails = (customer: Customer) => Array.from(new Set([
  customer.email,
  customer.primaryContactInfo?.email,
  customer.secondaryContactInfo?.email,
  customer.amcDetails?.email,
  customer.tdlDetails?.email,
  customer.cloudDetails?.email,
  customer.tssDetails?.email,
  ...(customer.keyContacts || []).map((contact) => contact.email),
  ...(customer.branches || []).map((branch) => branch.email),
  ...(customer.partnerDetails || []).map((partner) => partner.email),
].map((value) => clean(value).toLowerCase()).filter((value) => value && value.includes('@'))));

const joinedNames = (values: Array<string | undefined>) => {
  const names = values.map(clean).filter(Boolean);
  return names.length ? names.join(' / ') : '';
};

export const WELCOMETECH_CUSTOMER_EXPORT_COLUMNS: NonNullable<ExportSheet['columns']> = [
  { header: 'S NO', width: 6 },
  { header: 'Customer No', width: 14 },
  { header: 'Serial No', width: 11.28515625 },
  { header: 'Product', width: 15 },
  { header: 'Release', width: 13.85546875 },
  { header: 'Org Name', width: 55.28515625 },
  { header: 'Primary Contact Person', width: 13 },
  { header: 'Secondary Contact Name', width: 11 },
  { header: 'Primary Mobile', width: 12.42578125 },
  { header: 'Secondary Mobile', width: 18.5703125 },
  { header: 'Landline', width: 24.5703125 },
  { header: 'TSS Expiry Date', width: 11, dateFormat: 'd-mmm-yy' },
  { header: 'Status', width: 9.140625 },
  { header: 'Partner details', width: 9.28515625 },
  { header: 'Salesman', width: 8.85546875 },
  { header: 'Location/Area', width: 13 },
  { header: 'Full Address', width: 34.85546875 },
  { header: 'Email ID', width: 92.5703125 },
  { header: 'TSS Password', width: 20.7109375 },
  { header: 'Website', width: 21.42578125 },
  { header: 'Website Status', width: 13 },
  { header: 'AMC Status', width: 8.7109375 },
  { header: 'TDL Status', width: 8.5703125 },
  { header: 'Cloud Status', width: 6.42578125 },
  { header: 'Tally Ledger', width: 8.28515625 },
  { header: 'Group', width: 13 },
];

export const customerWelcometechExportRows = (customers: Customer[]): Array<Record<string, unknown>> =>
  customers.map((customer, idx) => {
    const serialInfo = serialInfoOf(customer);
    const amcService = primaryServiceOf(customer, 'amc');
    const tdlService = primaryServiceOf(customer, 'tdl');
    const tssService = primaryServiceOf(customer, 'tss');
    const cloudService = primaryServiceOf(customer, 'cloud');
    const license = serialInfo.licenses?.[0];
    const serialNo = first(
      (customer as any).importSerialNo,
      serialInfo.licenseSerialNo,
      license?.licenceSerialNo,
      customer.licenseSerialNo,
      amcService?.licenseSerialNo,
      tssService?.licenseSerialNo,
      tdlService?.licenseSerialNo,
      cloudService?.licenseSerialNo
    );
    const product = first(serialInfo.product, tssService?.product, amcService?.product, customer.products?.[0]);
    const release = first(serialInfo.releaseVersion, tssService?.releaseVersion, amcService?.releaseVersion, customer.companyInfo?.releaseVersion);
    const partner = joinedNames([
      ...((customer.partnerDetails || []).map((partnerDetail) => partnerDetail.companyName || partnerDetail.fullName)),
      amcService?.vendorCategory,
      tssService?.vendorCategory,
      customer.amcDetails?.vendorCategory,
      customer.tssDetails?.vendorCategory,
    ]);
    const salesman = first(
      amcService?.salesman1,
      tssService?.salesman1,
      tdlService?.salesman1,
      cloudService?.salesman1,
      customer.amcDetails?.salesman1,
      customer.tssDetails?.salesman1,
      customer.tdlDetails?.salesman1,
      customer.cloudDetails?.salesman1
    );
    const tssExpiry = first(tssService?.endDate, tssService?.tssExpiryDate, customer.tssDetails?.endDate, serialInfo.tssExpiryDate, serialInfo.endDate, customer.amcExpiry);

    return {
      'S NO': idx + 1,
      'Customer No': exportValue(customer.customerNumber),
      'Serial No': exportValue(serialNo),
      Product: exportValue(product),
      Release: normalizeRelease(release),
      'Org Name': exportValue(customer.companyInfo?.customerName, customer.name),
      'Primary Contact Person': exportValue(customer.primaryContactInfo?.contactName1, customer.contact),
      'Secondary Contact Name': exportValue(customer.secondaryContactInfo?.contactName2),
      'Primary Mobile': exportValue(customer.primaryContactInfo?.mobile, customer.phone),
      'Secondary Mobile': exportValue(customer.secondaryContactInfo?.mobile),
      Landline: exportValue(customer.primaryContactInfo?.landline, customer.keyContacts?.find((contact) => clean(contact.landline))?.landline),
      'TSS Expiry Date': parseDateValue(tssExpiry),
      Status: exportValue(sourceNoteValue(customer, 'Source status'), titleStatus(serialInfo.licenceStatus || license?.licenceStatus), customer.isActive === false ? 'Inactive' : 'Active'),
      'Partner details': exportValue(partner),
      Salesman: exportValue(salesman),
      'Location/Area': exportValue(customer.companyInfo?.locationArea, (serialInfo as any).contactDetails?.locationArea, customer.branchInfo?.branchName),
      'Full Address': exportValue(customer.companyInfo?.fullAddress, customer.address),
      'Email ID': exportValue(customerEmails(customer).join(' / ')),
      'TSS Password': exportValue(sourceNoteValue(customer, 'TSS password')),
      Website: exportValue(customer.companyInfo?.website),
      'Website Status': exportValue(customer.companyInfo?.websiteStatus),
      'AMC Status': exportValue(sourceNoteValue(customer, 'AMC status'), customer.amcDetails?.details, amcService?.details, yesNoStatus(customer.amcStatus)),
      'TDL Status': exportValue(sourceNoteValue(customer, 'TDL status'), customer.tdlDetails?.details, tdlService?.details, yesNoStatus(customer.tdlDetails?.status || tdlService?.status)),
      'Cloud Status': exportValue(sourceNoteValue(customer, 'Cloud status'), customer.cloudDetails?.details, cloudService?.details, yesNoStatus(customer.cloudDetails?.status || cloudService?.status)),
      'Tally Ledger': exportValue(sourceNoteValue(customer, 'Tally ledger')),
      Group: exportValue(customer.companyInfo?.groupOfCompany, joinedNames((customer.groupCompanies || []).map((group) => group.name))),
    };
  });
