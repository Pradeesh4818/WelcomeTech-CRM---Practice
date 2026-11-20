import { Response } from 'express';
import Customer from '../models/Customer';
import { AMC, Ticket, Payment, Proposal, ProposalTemplate } from '../models/index';
import Call from '../models/Call';
import { AuthRequest } from '../middleware/auth';
import { isAdminUser } from '../middleware/auth';
import { hasPhoneDigits, normalizePhone, validatePhoneNumber } from '../utils/phoneValidation';
import { formatErrorMessage } from '../utils/formatErrorMessage';
import fs from 'fs';
import path from 'path';
import { buildUploadUrl, ensureUploadDir } from '../config/storage';
import { syncFileToVps } from '../config/uploadSync';
import EmailTemplate from '../models/EmailTemplate';
import { deriveStartDate } from './emailTemplateController';
import { generateTemplatePdfBuffer } from '../utils/templatePdfGenerator';
import { Settings } from '../models/Settings';
import { calculateRemainingDays } from '../utils/controllerHelpers';
import {
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  buildWhatsAppDocumentPayload,
  IS_WHATSAPP_STATICALLY_DISABLED,
  uploadWhatsAppMedia,
  normalizeGraphApiVersion,
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
  firstText,
  resolveCustomerWhatsappNumber,
} from '../utils/whatsapp';

const parseJsonField = <T = unknown>(value: unknown): T | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const computeRemainingTotal = (
  currentPrice: number | undefined,
  advance1: number | undefined,
  advance2: number | undefined
): number | undefined => {
  if (currentPrice === undefined && advance1 === undefined && advance2 === undefined) return undefined;
  return (currentPrice || 0) - (advance1 || 0) - (advance2 || 0);
};

const normalizeModuleFinancialDetails = (value: Record<string, unknown> | undefined) => {
  if (!value) return value;
  const currentPrice = toNumberOrUndefined(value.currentPrice);
  const advance1 = toNumberOrUndefined(value.advance1);
  const advance2 = toNumberOrUndefined(value.advance2);
  return {
    ...value,
    actualPrice: toNumberOrUndefined(value.actualPrice),
    discount: toNumberOrUndefined(value.discount),
    currentPrice,
    advance1,
    advance2,
    // Backend is source of truth for payable balance.
    remainingTotal: computeRemainingTotal(currentPrice, advance1, advance2),
  };
};

const SERVICE_TYPES = new Set(['amc', 'tdl', 'tss', 'cloud']);
const SERVICE_STATUSES = new Set(['active', 'expired', 'expiring', 'none', 'trial']);
const LICENCE_STATUSES = new Set(['active', 'expired', 'blocked', 'surrendered', 'terminated']);

const textOrUndefined = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  return text || undefined;
};

const emailOrUndefined = (value: unknown): string | undefined => {
  const text = String(value || '').trim().toLowerCase();
  return text || undefined;
};

const phoneOrUndefined = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  return digits.length >= 5 ? text : undefined;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeBooleanFlag = (value: unknown): boolean =>
  value === true || String(value || '').trim().toLowerCase() === 'true';



const buildCustomerWhatsappMessage = (customer: any): string => {
  const contactName = firstText(
    customer.primaryContactInfo?.contactName1,
    customer.keyContacts?.[0]?.contactName,
    customer.contact,
    'Customer'
  );
  const products = Array.from(new Set([
    ...(customer.products || []),
    ...(customer.services || []).map((service: any) => service.product),
    ...(customer.serialNoInfo || []).map((row: any) => row.product),
  ].map((value) => String(value || '').trim()).filter(Boolean)));
  const tssCandidates: string[] = [];
  if (customer.tssDetails?.endDate) tssCandidates.push(String(customer.tssDetails.endDate));
  (customer.services || []).forEach((service: any) => {
    if (service.type === 'tss' && service.endDate) tssCandidates.push(String(service.endDate));
    if (service.tssExpiryDate) tssCandidates.push(String(service.tssExpiryDate));
  });
  (customer.serialNoInfo || []).forEach((row: any) => {
    if (row.tssExpiryDate) tssCandidates.push(String(row.tssExpiryDate));
    if (row.endDate) tssCandidates.push(String(row.endDate));
  });
  const sortedTss = tssCandidates
    .map((d) => ({ raw: d, time: new Date(d).getTime() }))
    .filter((x) => !Number.isNaN(x.time))
    .sort((a, b) => b.time - a.time);
  const tssExpiry = sortedTss[0]?.raw || null;

  return [
    `Hello ${contactName},`,
    '',
    'Sharing your WelcomeTech customer details:',
    `Customer: ${customer.name || customer.companyInfo?.customerName || '—'}`,
    `Products: ${products.length ? products.join(', ') : '—'}`,
    `AMC Status: ${customer.amcStatus || '—'}`,
    `TSS Expiry: ${tssExpiry ? new Date(tssExpiry).toLocaleDateString('en-GB') : '—'}`,
    '',
    'Thank you.',
  ].join('\n');
};

const calculateStartDateFromExpiry = (expiryDateInput: unknown, period = '1 Year'): string => {
  if (!expiryDateInput) return '';
  const rawStr = String(expiryDateInput instanceof Date ? expiryDateInput.toISOString() : expiryDateInput).split('T')[0].trim();
  const parts = rawStr.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + 1);
  if (period === '6 Months') dt.setMonth(dt.getMonth() - 6);
  else if (period === '2 Years') dt.setFullYear(dt.getFullYear() - 2);
  else if (period === '3 Years') dt.setFullYear(dt.getFullYear() - 3);
  else dt.setFullYear(dt.getFullYear() - 1);

  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeRenewalHistory = (history: any[] = []): any[] => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      // Filter out empty or phantom entries with no dates, no period, and no amount
      const hasDate = Boolean(item.startDate || item.expiryDate || item.renewedOn);
      const hasAmount = item.amount !== undefined && item.amount !== null && !isNaN(Number(item.amount));
      const hasPeriod = Boolean(item.period && String(item.period).trim() && String(item.period).trim() !== 'Renewal');
      const hasNotes = Boolean(item.notes && String(item.notes).trim());
      return Boolean(hasDate || hasAmount || hasPeriod || hasNotes);
    })
    .map((item) => {
      let startDate = item.startDate ? new Date(item.startDate) : undefined;
      let expiryDate = item.expiryDate ? new Date(item.expiryDate) : undefined;
      let renewedOn = item.renewedOn ? new Date(item.renewedOn) : undefined;
      let period = String(item.period || '').trim();

      if (period === 'Initial Contract' && expiryDate && !isNaN(expiryDate.getTime())) {
        if (!startDate || isNaN(startDate.getTime()) || startDate > expiryDate) {
          const expStr = expiryDate instanceof Date ? expiryDate.toISOString().split('T')[0] : String(expiryDate).split('T')[0];
          const healedStart = calculateStartDateFromExpiry(expStr, period || '1 Year');
          startDate = new Date(healedStart);
          if (!renewedOn || isNaN(renewedOn.getTime()) || renewedOn > expiryDate) {
            renewedOn = startDate;
          }
        }
      }

      // Safe defaults so Mongoose schema validation will never fail on required fields
      if (!period || period === 'Renewal') period = '1 Year';
      if (!renewedOn || isNaN(renewedOn.getTime())) {
        renewedOn = startDate && !isNaN(startDate.getTime()) ? startDate : new Date();
      }
      const amount = (item.amount !== undefined && item.amount !== null && !isNaN(Number(item.amount)))
        ? Number(item.amount)
        : 0;
      const paymentMethod = String(item.paymentMethod || '').trim() || 'Main Record';

      return {
        ...item,
        period,
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
        expiryDate: expiryDate && !isNaN(expiryDate.getTime()) ? expiryDate : undefined,
        renewedOn,
        amount,
        paymentMethod,
        invoiceNo: item.invoiceNo ? String(item.invoiceNo).trim() : undefined,
        notes: item.notes ? String(item.notes).trim() : undefined,
      };
    });
};

const normalizeServiceRecord = (service: Record<string, any>): Record<string, any> => {
  const type = textOrUndefined(service.type);
  const normalizedType = type && SERVICE_TYPES.has(type) ? type : 'amc';
  const normalizedFinancials = (normalizeModuleFinancialDetails(service) || {}) as Record<string, unknown>;
  const server9SerialNos = Array.isArray(service.server9SerialNos)
    ? service.server9SerialNos
        .map((row: Record<string, unknown>) => ({ serialNo: String(row?.serialNo || '').trim() }))
        .filter((row) => row.serialNo)
    : [];
  const tdlSerialNos = Array.isArray(service.tdlSerialNos)
    ? service.tdlSerialNos
        .map((row: Record<string, unknown>) => ({ serialNo: String(row?.serialNo || '').trim() }))
        .filter((row) => row.serialNo)
    : [];
  const users = Array.isArray(service.users)
    ? service.users
        .map((user: Record<string, unknown>) => ({
          username: String(user?.username || '').trim(),
          userDetail: String(user?.userDetail || '').trim(),
          userLocation: String(user?.userLocation || '').trim(),
        }))
        .filter((user) => user.username || user.userDetail || user.userLocation)
    : [];
  const rawStatus = String(service.status || '').trim().toLowerCase();
  const status =
    SERVICE_STATUSES.has(rawStatus)
      ? rawStatus
      : normalizedType === 'cloud'
        ? 'none'
        : 'active';
  const rawLicenceStatus = String(service.licenceStatus || '').trim().toLowerCase();
  const licenceStatus = LICENCE_STATUSES.has(rawLicenceStatus) ? rawLicenceStatus : 'active';

  return {
    ...service,
    ...normalizedFinancials,
    type: normalizedType,
    status,
    companyType: service.companyType === 'branch' ? 'branch' : service.companyType === 'head_office' ? 'head_office' : undefined,
    companyName: textOrUndefined(service.companyName),
    address: textOrUndefined(service.address),
    details: textOrUndefined(service.details),
    contactPerson: textOrUndefined(service.contactPerson),
    mobile: textOrUndefined(service.mobile),
    email: emailOrUndefined(service.email),
    reminder: textOrUndefined(service.reminder),
    notesRemarks: textOrUndefined(service.notesRemarks),
    vendor: textOrUndefined(service.vendor),
    vendorCategory: textOrUndefined(service.vendorCategory),
    others: textOrUndefined(service.others),
    salesman1: textOrUndefined(service.salesman1),
    salesman2: textOrUndefined(service.salesman2),
    startDate: service.startDate || undefined,
    endDate: service.endDate || undefined,
    initialStartDate: service.initialStartDate || undefined,
    initialEndDate: service.initialEndDate || undefined,
    initialPrice: toNumberOrUndefined(service.initialPrice),
    tssExpiryDate: service.tssExpiryDate || undefined,
    quantity: toNumberOrUndefined(service.quantity) || 1,
    noOfDays: toNumberOrUndefined(service.noOfDays) ?? toNumberOrUndefined(service.days),
    noOfUsers: toNumberOrUndefined(service.noOfUsers),
    amcValue: toNumberOrUndefined(service.amcValue),
    licenseSerialNo: textOrUndefined(service.licenseSerialNo),
    product: textOrUndefined(service.product),
    licenceType: textOrUndefined(service.licenceType),
    domainLinkSubId: textOrUndefined(service.domainLinkSubId),
    release: textOrUndefined(service.release),
    releaseVersion: textOrUndefined(service.releaseVersion),
    isServer9: normalizeBooleanFlag(service.isServer9),
    isTdl: normalizeBooleanFlag(service.isTdl),
    isAmcActive: normalizeBooleanFlag(service.isAmcActive),
    licenceStatus,
    server9SerialNos: normalizeBooleanFlag(service.isServer9) ? server9SerialNos : [],
    tdlSerialNos: normalizeBooleanFlag(service.isTdl) ? tdlSerialNos : [],
    users,
    showPricing:
      service.showPricing === false
        ? false
        : service.showPricing === true
          ? true
          : [normalizedFinancials.actualPrice, normalizedFinancials.discount, normalizedFinancials.currentPrice, normalizedFinancials.advance1, normalizedFinancials.advance2]
              .some((value) => value !== undefined),
    renewalHistory: normalizeRenewalHistory(Array.isArray(service.renewalHistory) ? service.renewalHistory : []),
  };
};

const buildModuleSummaryFromService = (service: Record<string, any>) => ({
  companyType: service.companyType,
  companyName: service.companyName,
  address: service.address,
  details: service.details,
  actualPrice: toNumberOrUndefined(service.actualPrice),
  discount: toNumberOrUndefined(service.discount),
  currentPrice: toNumberOrUndefined(service.currentPrice),
  advance1: toNumberOrUndefined(service.advance1),
  advance2: toNumberOrUndefined(service.advance2),
  remainingTotal:
    toNumberOrUndefined(service.remainingTotal) ??
    computeRemainingTotal(
      toNumberOrUndefined(service.currentPrice),
      toNumberOrUndefined(service.advance1),
      toNumberOrUndefined(service.advance2)
    ),
  others: textOrUndefined(service.others),
  salesman1: textOrUndefined(service.salesman1),
  salesman2: textOrUndefined(service.salesman2),
  contactPerson: textOrUndefined(service.contactPerson),
  mobile: textOrUndefined(service.mobile),
  email: emailOrUndefined(service.email),
  reminder: textOrUndefined(service.reminder),
  notesRemarks: textOrUndefined(service.notesRemarks),
  vendor: textOrUndefined(service.vendor),
  vendorCategory: textOrUndefined(service.vendorCategory),
  status: service.status,
  startDate: service.startDate || undefined,
  endDate: service.endDate || undefined,
  initialStartDate: service.initialStartDate || undefined,
  initialEndDate: service.initialEndDate || undefined,
  initialPrice: toNumberOrUndefined(service.initialPrice),
  lastNotifiedAt: service.lastNotifiedAt || undefined,
  lastNotifiedChannel: service.lastNotifiedChannel || undefined,
  lastNotifiedTemplate: service.lastNotifiedTemplate || undefined,
  renewalHistory: normalizeRenewalHistory(Array.isArray(service.renewalHistory) ? service.renewalHistory : []),
});

const applyCanonicalCustomerFlow = (payload: Record<string, unknown>, isUpdate: boolean = false, raw: Record<string, unknown> = {}) => {
  const services = Array.isArray(payload.services) ? payload.services as Array<Record<string, any>> : [];
  const keyContacts = Array.isArray(payload.keyContacts) ? payload.keyContacts as Array<Record<string, unknown>> : [];
  const companyInfo = payload.companyInfo && typeof payload.companyInfo === 'object'
    ? payload.companyInfo as Record<string, unknown>
    : {};
  const branchInfo = payload.branchInfo && typeof payload.branchInfo === 'object'
    ? payload.branchInfo as Record<string, unknown>
    : undefined;
  const primaryContact = keyContacts[0];
  const secondaryContact = keyContacts[1];
  const productLicenseService = services.find((service) => service.type === 'amc');
  const tdlService = services.find((service) => service.type === 'tdl');
  const cloudService = services.find((service) => service.type === 'cloud');
  const rawTssService = services.find((service) => service.type === 'tss');
  // TSS and AMC are always sold by the same partner — keep vendorCategory in sync.
  // Also resolve legacy partner stored in AMC companyName if vendorCategory is missing/welcome.
  const custName = String(payload.name || companyInfo.customerName || '').trim().toLowerCase();
  const amcCompanyName = String(productLicenseService?.companyName || '').trim();
  const amcPartnerFromCompany = (amcCompanyName && amcCompanyName.toLowerCase() !== custName)
    ? amcCompanyName
    : undefined;

  const rawPrimaryVendor = textOrUndefined(productLicenseService?.vendorCategory);
  const primaryVendorCategory = (rawPrimaryVendor && rawPrimaryVendor.toLowerCase() !== 'welcome')
    ? rawPrimaryVendor
    : (amcPartnerFromCompany || rawPrimaryVendor);

  if (productLicenseService && primaryVendorCategory && (!productLicenseService.vendorCategory || productLicenseService.vendorCategory.toLowerCase() === 'welcome')) {
    productLicenseService.vendorCategory = primaryVendorCategory;
  }

  const tssService = rawTssService && primaryVendorCategory
    ? { ...rawTssService, vendorCategory: primaryVendorCategory }
    : rawTssService;
  // Reflect the corrected vendorCategory back into the services array payload.
  if (tssService && tssService !== rawTssService) {
    const tssIdx = services.findIndex((service) => service.type === 'tss');
    if (tssIdx !== -1) services[tssIdx] = tssService;
  }

  if (!isUpdate || raw.primaryContactInfo !== undefined || raw.keyContacts !== undefined) {
    payload.primaryContactInfo = primaryContact
      ? {
          contactName1: textOrUndefined(primaryContact.contactName),
          designation: textOrUndefined(primaryContact.designation),
          mobile: phoneOrUndefined(primaryContact.mobile),
          whatsapp: phoneOrUndefined(primaryContact.whatsapp),
          email: emailOrUndefined(primaryContact.email),
          contactPreference: textOrUndefined(primaryContact.contactPreference),
          landline: textOrUndefined(primaryContact.landline),
        }
      : {};
  } else {
    delete payload.primaryContactInfo;
  }

  if (!isUpdate || raw.secondaryContactInfo !== undefined || raw.keyContacts !== undefined) {
    payload.secondaryContactInfo = secondaryContact
      ? {
          contactName2: textOrUndefined(secondaryContact.contactName),
          designation: textOrUndefined(secondaryContact.designation),
          mobile: phoneOrUndefined(secondaryContact.mobile),
          whatsapp: phoneOrUndefined(secondaryContact.whatsapp),
          email: emailOrUndefined(secondaryContact.email),
          contactPreference: textOrUndefined(secondaryContact.contactPreference),
          landline: textOrUndefined(secondaryContact.landline),
        }
      : {};
  } else {
    delete payload.secondaryContactInfo;
  }

  if (!isUpdate || raw.name !== undefined || (raw.companyInfo as any)?.customerName !== undefined) {
    payload.name = String(payload.name || companyInfo.customerName || '').trim();
  } else {
    delete payload.name;
  }

  if (!isUpdate || raw.contact !== undefined) {
    payload.contact = String(payload.contact || primaryContact?.contactName || '').trim();
  } else {
    delete payload.contact;
  }

  if (!isUpdate || raw.phone !== undefined) {
    payload.phone = String(payload.phone || primaryContact?.mobile || '').trim();
  } else {
    delete payload.phone;
  }

  if (!isUpdate || raw.email !== undefined) {
    payload.email = String(payload.email || primaryContact?.email || '').trim().toLowerCase();
  } else {
    delete payload.email;
  }

  if (!isUpdate || raw.address !== undefined || (raw.companyInfo as any)?.fullAddress !== undefined) {
    payload.address = String(payload.address || companyInfo.fullAddress || '').trim();
  } else {
    delete payload.address;
  }

  if (!isUpdate || raw.industry !== undefined || (raw.companyInfo as any)?.industry !== undefined) {
    payload.industry = String(payload.industry || companyInfo.industry || '').trim();
  } else {
    delete payload.industry;
  }

  if (!isUpdate || raw.products !== undefined) {
    const products = Array.from(
      new Set(
        [
          ...(Array.isArray(payload.products) ? payload.products : []),
          ...services.map((service) => service.product),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );
    payload.products = products;
  } else {
    delete payload.products;
  }

  if (productLicenseService) {
    const firstServer9Serial = productLicenseService.server9SerialNos?.[0]?.serialNo;
    const tssExpiryDate = productLicenseService.tssExpiryDate || tssService?.endDate;
    const pricingDetails = [productLicenseService.actualPrice, productLicenseService.discount, productLicenseService.currentPrice, productLicenseService.advance1, productLicenseService.advance2]
      .some((value) => value !== undefined)
      ? {
          actualPrice: toNumberOrUndefined(productLicenseService.actualPrice),
          discount: toNumberOrUndefined(productLicenseService.discount),
          currentPrice: toNumberOrUndefined(productLicenseService.currentPrice),
          advance1: toNumberOrUndefined(productLicenseService.advance1),
          advance2: toNumberOrUndefined(productLicenseService.advance2),
          remainingTotal:
            toNumberOrUndefined(productLicenseService.remainingTotal) ??
            computeRemainingTotal(
              toNumberOrUndefined(productLicenseService.currentPrice),
              toNumberOrUndefined(productLicenseService.advance1),
              toNumberOrUndefined(productLicenseService.advance2)
            ),
        }
      : undefined;

    payload.serialNoInfo = [{
      product: textOrUndefined(productLicenseService.product),
      releaseVersion: textOrUndefined(productLicenseService.releaseVersion),
      licenceType: textOrUndefined(productLicenseService.licenceType),
      noOfUsers: toNumberOrUndefined(productLicenseService.noOfUsers) || 1,
      licenses: productLicenseService.licenseSerialNo
        ? [{ licenceSerialNo: productLicenseService.licenseSerialNo, licenceStatus: productLicenseService.licenceStatus || 'active' }]
        : [],
      startDate: productLicenseService.startDate || undefined,
      endDate: productLicenseService.endDate || undefined,
      tssExpiryDate: tssExpiryDate || undefined,
      isServer9: productLicenseService.isServer9 === true,
      server9SerialNo: textOrUndefined(firstServer9Serial),
      isTdl: !!tdlService,
      tdlEnabled: !!tdlService,
      tdlSerialNo: textOrUndefined(tdlService?.licenseSerialNo),
      tdlSerialNos: tdlService?.licenseSerialNo ? [{ serialNo: tdlService.licenseSerialNo }] : [],
      isAmcActive: productLicenseService.isAmcActive === true,
      licenceStatus: productLicenseService.licenceStatus || 'active',
      licenseSerialNo: textOrUndefined(productLicenseService.licenseSerialNo),
      companyName: textOrUndefined(productLicenseService.companyName),
      address: textOrUndefined(productLicenseService.address),
      notesRemarks: textOrUndefined(productLicenseService.notesRemarks),
      contactDetails: {
        branchName: textOrUndefined(productLicenseService.companyName),
        locationArea: textOrUndefined(productLicenseService.address),
        contactPerson: textOrUndefined(productLicenseService.contactPerson),
        mobile: textOrUndefined(productLicenseService.mobile),
        vendorCategory: textOrUndefined(productLicenseService.vendorCategory),
      },
      pricingDetails,
      notes: textOrUndefined(productLicenseService.details),
    }];

    payload.licenceType = textOrUndefined(productLicenseService.licenceType) || payload.licenceType || 'Silver – Single User';
    payload.users = toNumberOrUndefined(productLicenseService.noOfUsers) ?? toNumberOrUndefined(payload.users) ?? 1;
    payload.amcStatus = productLicenseService.isAmcActive
      ? ['active', 'expired', 'expiring', 'none'].includes(String(productLicenseService.status || '').toLowerCase())
        ? String(productLicenseService.status || '').toLowerCase()
        : 'active'
      : 'none';
    payload.amcExpiry = productLicenseService.isAmcActive ? (productLicenseService.endDate || payload.amcExpiry || undefined) : undefined;
    payload.companyInfo = {
      ...companyInfo,
      customerName: textOrUndefined(payload.name) || textOrUndefined(companyInfo.customerName),
      industry: textOrUndefined(payload.industry) || textOrUndefined(companyInfo.industry),
      fullAddress: textOrUndefined(payload.address) || textOrUndefined(companyInfo.fullAddress),
      releaseVersion: textOrUndefined(productLicenseService.releaseVersion) || textOrUndefined(companyInfo.releaseVersion),
      isServer9: productLicenseService.isServer9 === true,
    };
  } else if (!isUpdate) {
    payload.serialNoInfo = [];
    payload.amcStatus = 'none';
    payload.amcExpiry = undefined;
  } else {
    delete payload.serialNoInfo;
    delete payload.amcStatus;
    delete payload.amcExpiry;
  }

  if (productLicenseService?.isAmcActive) {
    payload.amcDetails = {
      ...buildModuleSummaryFromService(productLicenseService),
      value: toNumberOrUndefined(productLicenseService.amcValue),
    };
  } else if (!isUpdate || raw.amcDetails !== undefined) {
    payload.amcDetails = {};
  } else {
    delete payload.amcDetails;
  }

  if (tdlService) {
    payload.tdlDetails = {
      ...buildModuleSummaryFromService(tdlService),
      licenseSerialNo: textOrUndefined(tdlService.licenseSerialNo),
      noOfDays: toNumberOrUndefined(tdlService.noOfDays),
      days: toNumberOrUndefined(tdlService.noOfDays),
    };
  } else if (!isUpdate || raw.tdlDetails !== undefined) {
    payload.tdlDetails = {};
  } else {
    delete payload.tdlDetails;
  }

  if (cloudService) {
    payload.cloudDetails = {
      ...buildModuleSummaryFromService(cloudService),
      vendor: textOrUndefined(cloudService.vendor),
      cloudStartDate: cloudService.startDate || undefined,
      cloudExpiryDate: cloudService.endDate || undefined,
      licenseSerialNo: textOrUndefined(cloudService.licenseSerialNo),
      domainLinkSubId: textOrUndefined(cloudService.domainLinkSubId),
      noOfUsers: toNumberOrUndefined(cloudService.noOfUsers) || cloudService.users?.length || undefined,
      release: textOrUndefined(cloudService.release),
      users: Array.isArray(cloudService.users) ? cloudService.users : [],
    };
  } else if (!isUpdate || raw.cloudDetails !== undefined) {
    payload.cloudDetails = {};
  } else {
    delete payload.cloudDetails;
  }

  if (tssService) {
    payload.tssDetails = buildModuleSummaryFromService(tssService);
  } else if (!isUpdate || raw.tssDetails !== undefined) {
    payload.tssDetails = {};
  } else {
    delete payload.tssDetails;
  }

  if (!payload.notes && productLicenseService?.notesRemarks) {
    payload.notes = productLicenseService.notesRemarks;
  } else if (isUpdate && raw.notes === undefined) {
    delete payload.notes;
  }
  if (!payload.companyInfo && Object.keys(companyInfo).length > 0 && (!isUpdate || raw.companyInfo !== undefined)) {
    payload.companyInfo = companyInfo;
  } else if (isUpdate && raw.companyInfo === undefined && !productLicenseService) {
    delete payload.companyInfo;
  }
  if (branchInfo) {
    payload.branchInfo = branchInfo;
  } else if (isUpdate && raw.branchInfo === undefined) {
    delete payload.branchInfo;
  }
};

const normalizeCustomerPayload = (raw: Record<string, unknown>, isUpdate: boolean = false): Record<string, unknown> => {
  const payload = { ...raw } as Record<string, unknown>;

  if (typeof payload.products === 'string') {
    const parsed = parseJsonField<string[]>(payload.products);
    if (Array.isArray(parsed)) payload.products = parsed;
  }

  const companyInfo = parseJsonField<Record<string, unknown>>(payload.companyInfo) || payload.companyInfo as Record<string, unknown> | undefined;
  const primaryContactInfo = parseJsonField<Record<string, unknown>>(payload.primaryContactInfo) || payload.primaryContactInfo as Record<string, unknown> | undefined;
  const secondaryContactInfo = parseJsonField<Record<string, unknown>>(payload.secondaryContactInfo) || payload.secondaryContactInfo as Record<string, unknown> | undefined;
  const serialNoInfo = parseJsonField<any[]>(payload.serialNoInfo) || (Array.isArray(payload.serialNoInfo) ? payload.serialNoInfo : undefined);
  const amcDetails = parseJsonField<Record<string, unknown>>(payload.amcDetails) || payload.amcDetails as Record<string, unknown> | undefined;
  const tdlDetails = parseJsonField<Record<string, unknown>>(payload.tdlDetails) || payload.tdlDetails as Record<string, unknown> | undefined;
  const cloudDetails = parseJsonField<Record<string, unknown>>(payload.cloudDetails) || payload.cloudDetails as Record<string, unknown> | undefined;
  const tssDetails = parseJsonField<Record<string, unknown>>(payload.tssDetails) || payload.tssDetails as Record<string, unknown> | undefined;
  const branchInfo = parseJsonField<Record<string, unknown>>(payload.branchInfo) || payload.branchInfo as Record<string, unknown> | undefined;
  const branches =
    parseJsonField<Array<Record<string, unknown>>>(payload.branches) ||
    payload.branches as Array<Record<string, unknown>> | undefined;
  const partnerDetails =
    parseJsonField<Array<Record<string, unknown>>>(payload.partnerDetails || payload.existingDetails) ||
    (payload.partnerDetails || payload.existingDetails) as Array<Record<string, unknown>> | undefined;

  const services = parseJsonField<Array<Record<string, any>>>(payload.services) || payload.services as Array<Record<string, any>> | undefined;
  const groupCompanies =
    parseJsonField<Array<Record<string, unknown>>>(payload.groupCompanies) ||
    payload.groupCompanies as Array<Record<string, unknown>> | undefined;
  const keyContacts =
    parseJsonField<Array<Record<string, any>>>(payload.keyContacts) ||
    payload.keyContacts as Array<Record<string, any>> | undefined;

  if (companyInfo) {
    payload.companyInfo = {
      ...companyInfo,
      customerName: textOrUndefined(companyInfo.customerName),
      crNo: textOrUndefined(companyInfo.crNo),
      groupOfCompany: textOrUndefined(companyInfo.groupOfCompany),
      businessSegment: textOrUndefined(companyInfo.businessSegment),
      industry: textOrUndefined(companyInfo.industry),
      industryGroup: textOrUndefined(companyInfo.industryGroup),
      industryType: textOrUndefined(companyInfo.industryType),
      locationArea: textOrUndefined(companyInfo.locationArea),
      fullAddress: textOrUndefined(companyInfo.fullAddress),
      website: textOrUndefined(companyInfo.website),
      websiteStatus: textOrUndefined(companyInfo.websiteStatus),
      releaseVersion: textOrUndefined(companyInfo.releaseVersion),
      isServer9: normalizeBooleanFlag(companyInfo.isServer9),
    };
  }
  if (primaryContactInfo) payload.primaryContactInfo = primaryContactInfo;
  if (secondaryContactInfo) payload.secondaryContactInfo = secondaryContactInfo;
  
  if (Array.isArray(serialNoInfo)) {
    payload.serialNoInfo = serialNoInfo.map(p => ({
      ...p,
      pricingDetails: normalizeModuleFinancialDetails(p.pricingDetails || {}),
      noOfUsers: toNumberOrUndefined(p.noOfUsers) || (p.licenses?.length || 0),
    }));
  } else if (payload.serialNoInfo && typeof payload.serialNoInfo === 'object') {
    const single = payload.serialNoInfo as Record<string, any>;
    payload.serialNoInfo = [{
      ...single,
      pricingDetails: normalizeModuleFinancialDetails(single.pricingDetails || {}),
      noOfUsers: toNumberOrUndefined(single.noOfUsers) || (single.licenses?.length || 0),
    }];
  }

  if (amcDetails) payload.amcDetails = { ...normalizeModuleFinancialDetails(amcDetails), renewalHistory: normalizeRenewalHistory(Array.isArray((amcDetails as any).renewalHistory) ? (amcDetails as any).renewalHistory : []) };
  if (tdlDetails) payload.tdlDetails = { ...normalizeModuleFinancialDetails(tdlDetails), renewalHistory: normalizeRenewalHistory(Array.isArray((tdlDetails as any).renewalHistory) ? (tdlDetails as any).renewalHistory : []) };
  if (cloudDetails) payload.cloudDetails = { ...normalizeModuleFinancialDetails(cloudDetails), renewalHistory: normalizeRenewalHistory(Array.isArray((cloudDetails as any).renewalHistory) ? (cloudDetails as any).renewalHistory : []) };
  if (tssDetails) payload.tssDetails = { ...normalizeModuleFinancialDetails(tssDetails), renewalHistory: normalizeRenewalHistory(Array.isArray((tssDetails as any).renewalHistory) ? (tssDetails as any).renewalHistory : []) };
  
  if (Array.isArray(services)) {
    payload.services = services.map((service) => normalizeServiceRecord(service));

    // Sync TDL from services -> tdlDetails & serialNoInfo
    const tdlService = (payload.services as any[]).find((s: any) => s.type === 'tdl');
    const tdlLicense = (payload.services as any[]).find((s: any) => s.isTdl === true || s.tdlEnabled === true);
    if (tdlService || tdlLicense) {
      const src = tdlService || tdlLicense;
      const existingTdl = (payload.tdlDetails as Record<string, any>) || {};
      payload.tdlDetails = {
        ...existingTdl,
        status: src.status || existingTdl.status || 'active',
        companyType: src.companyType || existingTdl.companyType || 'head_office',
        companyName: src.companyName || existingTdl.companyName || payload.name,
        address: src.address || existingTdl.address || payload.address,
        details: src.details || existingTdl.details,
        product: src.product || existingTdl.product,
        release: src.releaseVersion || src.release || existingTdl.release,
        licenseSerialNo: src.licenseSerialNo || existingTdl.licenseSerialNo,
        salesman1: src.salesman1 || existingTdl.salesman1,
        salesman2: src.salesman2 || existingTdl.salesman2,
        startDate: src.startDate || existingTdl.startDate,
        endDate: src.endDate || existingTdl.endDate,
        initialStartDate: src.initialStartDate || existingTdl.initialStartDate,
        initialEndDate: src.initialEndDate || existingTdl.initialEndDate,
        initialPrice: src.initialPrice ?? existingTdl.initialPrice,
        renewalHistory: normalizeRenewalHistory(Array.isArray(src.renewalHistory) && src.renewalHistory.length > 0 ? src.renewalHistory : existingTdl.renewalHistory || []),
        actualPrice: src.actualPrice ?? existingTdl.actualPrice,
        discount: src.discount ?? existingTdl.discount,
        currentPrice: src.currentPrice ?? existingTdl.currentPrice,
        advance1: src.advance1 ?? existingTdl.advance1,
        advance2: src.advance2 ?? existingTdl.advance2,
        remainingTotal: src.remainingTotal ?? existingTdl.remainingTotal,
        others: src.others || existingTdl.others,
      };

      if (Array.isArray(payload.serialNoInfo) && payload.serialNoInfo.length > 0) {
        payload.serialNoInfo[0] = {
          ...payload.serialNoInfo[0],
          tdlEnabled: true,
          isTdl: true,
          tdlSerialNo: src.licenseSerialNo || payload.serialNoInfo[0].tdlSerialNo,
        };
      }
    }

    // Sync TSS from services -> tssDetails & serialNoInfo
    const tssService = (payload.services as any[]).find((s: any) => s.type === 'tss');
    const tssAmc = (payload.services as any[]).find((s: any) => s.tssExpiryDate);
    if (tssService || tssAmc) {
      const tssDate = tssService?.endDate || tssService?.tssExpiryDate;
      const amcDate = tssAmc?.tssExpiryDate || tssAmc?.endDate;
      const tssTime = tssDate ? new Date(tssDate).getTime() : 0;
      const amcTime = amcDate ? new Date(amcDate).getTime() : 0;
      const src = (amcTime > tssTime && tssAmc) ? tssAmc : (tssService || tssAmc);

      // Keep both in sync for matching serials
      if (tssService && tssAmc && String(tssService.licenseSerialNo || '').trim().toLowerCase() === String(tssAmc.licenseSerialNo || '').trim().toLowerCase()) {
        const latestDate = src.endDate || src.tssExpiryDate;
        if (latestDate) {
          tssService.endDate = latestDate;
          tssAmc.tssExpiryDate = latestDate;
        }
      }

      const existingTss = (payload.tssDetails as Record<string, any>) || {};
      payload.tssDetails = {
        ...existingTss,
        status: src.status || existingTss.status || 'active',
        companyType: src.companyType || existingTss.companyType || 'head_office',
        companyName: src.companyName || existingTss.companyName || payload.name,
        address: src.address || existingTss.address || payload.address,
        details: src.details || existingTss.details,
        product: src.product || existingTss.product,
        licenseSerialNo: src.licenseSerialNo || existingTss.licenseSerialNo,
        startDate: src.startDate || existingTss.startDate,
        endDate: src.endDate || src.tssExpiryDate || existingTss.endDate,
        initialStartDate: src.initialStartDate || existingTss.initialStartDate,
        initialEndDate: src.initialEndDate || existingTss.initialEndDate,
        initialPrice: src.initialPrice ?? existingTss.initialPrice,
        renewalHistory: normalizeRenewalHistory(Array.isArray(src.renewalHistory) && src.renewalHistory.length > 0 ? src.renewalHistory : existingTss.renewalHistory || []),
        actualPrice: src.actualPrice ?? existingTss.actualPrice,
        discount: src.discount ?? existingTss.discount,
        currentPrice: src.currentPrice ?? existingTss.currentPrice,
        advance1: src.advance1 ?? existingTss.advance1,
        advance2: src.advance2 ?? existingTss.advance2,
        remainingTotal: src.remainingTotal ?? existingTss.remainingTotal,
      };

      if (Array.isArray(payload.serialNoInfo) && payload.serialNoInfo.length > 0) {
        payload.serialNoInfo[0] = {
          ...payload.serialNoInfo[0],
          tssExpiryDate: src.endDate || src.tssExpiryDate || payload.serialNoInfo[0].tssExpiryDate,
        };
      }
    }

    // Sync Cloud from services -> cloudDetails
    const cloudService = (payload.services as any[]).find((s: any) => s.type === 'cloud');
    if (cloudService) {
      const existingCloud = (payload.cloudDetails as Record<string, any>) || {};
      payload.cloudDetails = {
        ...existingCloud,
        status: cloudService.status || existingCloud.status || 'active',
        companyType: cloudService.companyType || existingCloud.companyType || 'head_office',
        companyName: cloudService.companyName || existingCloud.companyName || payload.name,
        address: cloudService.address || existingCloud.address || payload.address,
        vendor: cloudService.vendor || existingCloud.vendor,
        domainLinkSubId: cloudService.domainLinkSubId || existingCloud.domainLinkSubId,
        noOfUsers: cloudService.noOfUsers ?? existingCloud.noOfUsers,
        product: cloudService.product || existingCloud.product,
        release: cloudService.release || cloudService.releaseVersion || existingCloud.release,
        startDate: cloudService.startDate || existingCloud.startDate,
        endDate: cloudService.endDate || existingCloud.endDate,
        initialStartDate: cloudService.initialStartDate || existingCloud.initialStartDate,
        initialEndDate: cloudService.initialEndDate || existingCloud.initialEndDate,
        initialPrice: cloudService.initialPrice ?? existingCloud.initialPrice,
        renewalHistory: normalizeRenewalHistory(Array.isArray(cloudService.renewalHistory) && cloudService.renewalHistory.length > 0 ? cloudService.renewalHistory : existingCloud.renewalHistory || []),
        actualPrice: cloudService.actualPrice ?? existingCloud.actualPrice,
        discount: cloudService.discount ?? existingCloud.discount,
        currentPrice: cloudService.currentPrice ?? existingCloud.currentPrice,
        advance1: cloudService.advance1 ?? existingCloud.advance1,
        advance2: cloudService.advance2 ?? existingCloud.advance2,
        remainingTotal: cloudService.remainingTotal ?? existingCloud.remainingTotal,
      };
    }
  }

  if (branchInfo) payload.branchInfo = branchInfo;
  if (Array.isArray(branches)) payload.branches = branches;
  if (Array.isArray(partnerDetails)) payload.partnerDetails = partnerDetails;
  
  // Handle keyContacts migration and normalization
  let finalContacts = Array.isArray(keyContacts) ? keyContacts : [];
  if (finalContacts.length === 0) {
    if (primaryContactInfo) {
      finalContacts.push({
        contactName: primaryContactInfo.contactName1,
        designation: primaryContactInfo.designation,
        mobile: primaryContactInfo.mobile,
        whatsapp: primaryContactInfo.whatsapp,
        email: primaryContactInfo.email,
        contactPreference: primaryContactInfo.contactPreference,
        landline: primaryContactInfo.landline,
      });
    }
    if (secondaryContactInfo) {
      finalContacts.push({
        contactName: secondaryContactInfo.contactName2,
        designation: secondaryContactInfo.designation,
        mobile: secondaryContactInfo.mobile,
        whatsapp: secondaryContactInfo.whatsapp,
        email: secondaryContactInfo.email,
      });
    }
  }
  
  payload.keyContacts = finalContacts.map(c => ({
    contactName: String(c.contactName || '').trim(),
    designation: String(c.designation || '').trim(),
    mobile: phoneOrUndefined(c.mobile) || '',
    whatsapp: phoneOrUndefined(c.whatsapp) || '',
    email: String(c.email || '').trim().toLowerCase(),
    contactPreference: String(c.contactPreference || '').trim(),
    landline: String(c.landline || '').trim(),
  })).filter(c => c.contactName || c.mobile || c.whatsapp || c.email);
  if (Array.isArray(groupCompanies)) {
    payload.groupCompanies = groupCompanies
      .map((g) => ({
        name: String(g?.name || '').trim(),
        contactNumber: String(g?.contactNumber || '').trim(),
      }))
      .filter((g) => g.name || g.contactNumber);
  }

  const firstKeyContact = Array.isArray(payload.keyContacts) ? (payload.keyContacts as any[])[0] : null;

  if (!isUpdate || raw.name !== undefined || companyInfo?.customerName !== undefined) {
    payload.name = String(payload.name || companyInfo?.customerName || '').trim();
  } else {
    delete payload.name;
  }

  if (!isUpdate || raw.contact !== undefined || primaryContactInfo?.contactName1 !== undefined || firstKeyContact?.contactName !== undefined) {
    payload.contact = String(payload.contact || primaryContactInfo?.contactName1 || firstKeyContact?.contactName || '').trim();
  } else {
    delete payload.contact;
  }

  if (!isUpdate || raw.phone !== undefined || primaryContactInfo?.mobile !== undefined || firstKeyContact?.mobile !== undefined) {
    payload.phone = phoneOrUndefined(payload.phone) || phoneOrUndefined(primaryContactInfo?.mobile) || phoneOrUndefined(firstKeyContact?.mobile) || '';
  } else {
    delete payload.phone;
  }

  if (!isUpdate || raw.email !== undefined || primaryContactInfo?.email !== undefined || firstKeyContact?.email !== undefined) {
    payload.email = String(payload.email || primaryContactInfo?.email || firstKeyContact?.email || '').trim().toLowerCase();
  } else {
    delete payload.email;
  }

  if (!isUpdate || raw.address !== undefined || companyInfo?.fullAddress !== undefined) {
    payload.address = String(payload.address || companyInfo?.fullAddress || '').trim();
  } else {
    delete payload.address;
  }

  if (!isUpdate || raw.industry !== undefined || companyInfo?.industry !== undefined) {
    payload.industry = String(payload.industry || companyInfo?.industry || '').trim();
  } else {
    delete payload.industry;
  }

  // Cascade synchronized customer contact details to all embedded module details & services
  if (payload.tssDetails && typeof payload.tssDetails === 'object') {
    const tss = payload.tssDetails as Record<string, any>;
    if (payload.name) tss.companyName = payload.name;
    if (payload.address) tss.address = payload.address;
    if (payload.contact) tss.contactPerson = payload.contact;
    if (payload.phone) tss.mobile = payload.phone;
    if (payload.email) tss.email = payload.email;
  }
  if (payload.tdlDetails && typeof payload.tdlDetails === 'object') {
    const tdl = payload.tdlDetails as Record<string, any>;
    if (payload.name) tdl.companyName = payload.name;
    if (payload.address) tdl.address = payload.address;
    if (payload.contact) tdl.contactPerson = payload.contact;
    if (payload.phone) tdl.mobile = payload.phone;
    if (payload.email) tdl.email = payload.email;
  }
  if (payload.cloudDetails && typeof payload.cloudDetails === 'object') {
    const cloud = payload.cloudDetails as Record<string, any>;
    if (payload.name) cloud.companyName = payload.name;
    if (payload.address) cloud.address = payload.address;
    if (payload.contact) cloud.contactPerson = payload.contact;
    if (payload.phone) cloud.mobile = payload.phone;
    if (payload.email) cloud.email = payload.email;
  }
  if (payload.amcDetails && typeof payload.amcDetails === 'object') {
    const amc = payload.amcDetails as Record<string, any>;
    if (payload.name) amc.companyName = payload.name;
    if (payload.address) amc.address = payload.address;
    if (payload.contact) amc.contactPerson = payload.contact;
    if (payload.phone) amc.mobile = payload.phone;
    if (payload.email) amc.email = payload.email;
  }
  if (Array.isArray(payload.services)) {
    payload.services = payload.services.map((srv: any) => ({
      ...srv,
      companyName: srv.companyName || payload.name,
      address: srv.address || payload.address,
      contactPerson: payload.contact || srv.contactPerson,
      mobile: payload.phone || srv.mobile,
      email: payload.email || srv.email,
    }));
  }
  if (Array.isArray(payload.serialNoInfo)) {
    payload.serialNoInfo = payload.serialNoInfo.map((sn: any) => ({
      ...sn,
      contactDetails: {
        ...(sn.contactDetails || {}),
        branchName: sn.contactDetails?.branchName || payload.name,
        locationArea: sn.contactDetails?.locationArea || payload.address,
        contactPerson: payload.contact || sn.contactDetails?.contactPerson,
        mobile: payload.phone || sn.contactDetails?.mobile,
      },
    }));
  }

  const firstProd = Array.isArray(payload.serialNoInfo) ? (payload.serialNoInfo as any[])[0] : null;

  if (!Array.isArray(payload.products) && firstProd?.product) {
    payload.products = [firstProd.product];
  }
  
  if (!isUpdate || raw.licenceType !== undefined || firstProd?.licenceType !== undefined) {
    payload.licenceType = String(payload.licenceType || firstProd?.licenceType || 'Silver – Single User').trim();
  } else {
    delete payload.licenceType;
  }

  if (!isUpdate || raw.users !== undefined || firstProd?.noOfUsers !== undefined) {
    const users = toNumberOrUndefined(payload.users) ?? toNumberOrUndefined(firstProd?.noOfUsers) ?? 1;
    payload.users = users;
  } else {
    delete payload.users;
  }

  if (!isUpdate || raw.amcStatus !== undefined || amcDetails?.status !== undefined || firstProd?.isAmcActive !== undefined) {
    const amcStatusRaw = String(payload.amcStatus || amcDetails?.status || (firstProd?.isAmcActive ? 'active' : 'none')).toLowerCase();
    payload.amcStatus = ['active', 'expired', 'expiring', 'none'].includes(amcStatusRaw) ? amcStatusRaw : 'none';
    if (payload.amcStatus === 'none') {
      payload.amcExpiry = undefined;
    } else {
      payload.amcExpiry = payload.amcExpiry || amcDetails?.endDate || firstProd?.endDate || undefined;
    }
  } else {
    delete payload.amcStatus;
  }

  payload.notes = String(payload.notes || amcDetails?.notesRemarks || firstProd?.notes || '').trim();

  if (branchInfo !== undefined) {
    const isBranch = branchInfo?.isBranch === true || String(branchInfo?.isBranch || '').toLowerCase() === 'true';
    const parentCompanyId = String(branchInfo?.parentCompanyId || '').trim();
    payload.branchInfo = {
      isBranch,
      branchName: String(branchInfo?.branchName || '').trim(),
      branchCode: String(branchInfo?.branchCode || '').trim(),
      parentCompanyId: isBranch && parentCompanyId ? parentCompanyId : undefined,
    };
  }

  if (Array.isArray(branches)) {
    payload.branches = branches
      .map((b) => ({
        branchName: String(b?.branchName || '').trim(),
        locationArea: String(b?.locationArea || '').trim(),
        area: String(b?.area || '').trim(),
        fullAddress: String(b?.fullAddress || '').trim(),
        website: String(b?.website || '').trim(),
        websiteStatus: ['Active', 'Inactive'].includes(String(b?.websiteStatus || ''))
          ? String(b?.websiteStatus)
          : 'Active',
        contactPerson: String(b?.contactPerson || '').trim(),
        mobile: String(b?.mobile || '').trim(),
        email: String(b?.email || '').trim().toLowerCase(),
      }))
      .filter((b) => b.branchName || b.locationArea || b.area || b.fullAddress || b.website || b.contactPerson || b.mobile || b.email);
  }

  if (Array.isArray(partnerDetails)) {
    payload.partnerDetails = partnerDetails
      .map((row) => ({
        companyName: String(row?.companyName || '').trim(),
        fullName: String(row?.fullName || '').trim(),
        email: String(row?.email || '').trim().toLowerCase(),
        phone: String(row?.phone || '').trim(),
        address: String(row?.address || '').trim(),
        service: String(row?.service || '').trim(),
      }))
      .filter((row) => row.companyName || row.fullName || row.email || row.phone || row.address || row.service);
  }

  if (Array.isArray(payload.services)) {
    applyCanonicalCustomerFlow(payload, isUpdate, raw);
  }

  return payload;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysUntilNullable = (value: unknown, startValue?: unknown): number | null => {
  return calculateRemainingDays(value, startValue);
};

const hasTDL = (c: any): boolean =>
  !!(
    (Array.isArray(c?.services) && c.services.some((service: any) => service?.type === 'tdl' && service?.status !== 'none' && service?.status !== 'expired')) ||
    (Array.isArray(c?.serialNoInfo) ? c.serialNoInfo.some((p: any) => p.tdlEnabled || p.isTdl) : (c?.serialNoInfo?.tdlEnabled || c?.serialNoInfo?.isTdl)) ||
    ['active', 'expiring', 'trial'].includes(String(c?.tdlDetails?.status || '').toLowerCase()) ||
    (c?.tdlDetails?.actualPrice || 0) > 0
  );

const hasCloud = (c: any): boolean =>
  !!(
    (Array.isArray(c?.services) && c.services.some((service: any) => service?.type === 'cloud' && service?.status !== 'none' && service?.status !== 'expired')) ||
    ['active', 'expiring', 'trial'].includes(String(c?.cloudDetails?.status || '').toLowerCase()) ||
    !!c?.cloudDetails?.vendor ||
    (c?.cloudDetails?.users?.length || 0) > 0 ||
    (c?.cloudDetails?.actualPrice || 0) > 0
  );

const hasTSS = (c: any): boolean =>
  !!(
    (Array.isArray(c?.services) && c.services.some((service: any) => service?.type === 'tss' && service?.status !== 'none' && service?.status !== 'expired')) ||
    (Array.isArray(c?.serialNoInfo) ? c.serialNoInfo.some((p: any) => p.tssExpiryDate) : c?.serialNoInfo?.tssExpiryDate) ||
    ['active', 'expiring', 'trial'].includes(String(c?.tssDetails?.status || '').toLowerCase()) ||
    (c?.tssDetails?.actualPrice || 0) > 0
  );

const branchNameOf = (c: any): string =>
  c?.branchInfo?.isBranch ? (c?.branchInfo?.branchName || 'Branch') : 'Head Office';

const sortByUpdatedDesc = <T>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const at = parseDate((a as any).updatedAt)?.getTime() || 0;
    const bt = parseDate((b as any).updatedAt)?.getTime() || 0;
    return bt - at;
  });

const sortByDaysAsc = <T extends { days: number | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));

const buildHistorySummary = (eligibleCustomers: any[], allRenewals: any[]) => {
  const now = new Date();
  const renewalsThisMonth = allRenewals.filter((r) => {
    const d = parseDate(r.renewedOn);
    if (!d) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const totalRevenue = allRenewals.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const eligible = eligibleCustomers.length;
  const renewedCustomers = new Set(allRenewals.map((r) => String(r.customerId || '')).filter(Boolean)).size;
  const renewalRate = eligible ? Math.round((renewedCustomers / eligible) * 100) : 0;
  return { totalRevenue, renewalsThisMonth, renewalRate };
};

export const getCustomers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, amcStatus, status, product, moduleType, vendor, group, startDate, endDate, page = 1, limit = 10 } = req.query;
    const andClauses: any[] = [];
    const effectiveStatus = String(status || amcStatus || '').trim().toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDaySoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);

    if (startDate && endDate) {
      const sDate = new Date(String(startDate));
      sDate.setHours(0, 0, 0, 0);
      const eDate = new Date(String(endDate));
      eDate.setHours(23, 59, 59, 999);

      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
        if (moduleType === 'cloud') {
          andClauses.push({
            $or: [
              { 'cloudDetails.endDate': { $gte: sDate, $lte: eDate } },
              { 'cloudDetails.cloudExpiryDate': { $gte: sDate, $lte: eDate } },
              { services: { $elemMatch: { type: 'cloud', endDate: { $gte: sDate, $lte: eDate } } } },
            ],
          });
        } else if (moduleType === 'tdl') {
          andClauses.push({
            $or: [
              { 'tdlDetails.endDate': { $gte: sDate, $lte: eDate } },
              { services: { $elemMatch: { $or: [{ type: 'tdl' }, { type: 'amc', isTdl: true }], endDate: { $gte: sDate, $lte: eDate } } } },
              { serialNoInfo: { $elemMatch: { $or: [{ isTdl: true }, { tdlEnabled: true }], endDate: { $gte: sDate, $lte: eDate } } } },
            ],
          });
        } else if (moduleType === 'tss') {
          andClauses.push({
            $or: [
              { 'tssDetails.endDate': { $gte: sDate, $lte: eDate } },
              { 'tssDetails.expiryDate': { $gte: sDate, $lte: eDate } },
              { services: { $elemMatch: { $and: [{ $or: [{ type: 'tss' }, { type: 'amc' }] }, { $or: [{ endDate: { $gte: sDate, $lte: eDate } }, { tssExpiryDate: { $gte: sDate, $lte: eDate } }] }] } } },
              { serialNoInfo: { $elemMatch: { $or: [{ endDate: { $gte: sDate, $lte: eDate } }, { tssExpiryDate: { $gte: sDate, $lte: eDate } }] } } },
            ],
          });
        } else {
          andClauses.push({
            $or: [
              { createdAt: { $gte: sDate, $lte: eDate } },
              { amcExpiry: { $gte: sDate, $lte: eDate } },
              { 'services.endDate': { $gte: sDate, $lte: eDate } },
              { 'serialNoInfo.endDate': { $gte: sDate, $lte: eDate } },
              { 'serialNoInfo.tssExpiryDate': { $gte: sDate, $lte: eDate } },
              { 'tssDetails.endDate': { $gte: sDate, $lte: eDate } },
              { 'tdlDetails.endDate': { $gte: sDate, $lte: eDate } },
              { 'cloudDetails.endDate': { $gte: sDate, $lte: eDate } },
              { 'cloudDetails.cloudExpiryDate': { $gte: sDate, $lte: eDate } },
            ],
          });
        }
      }
    }

    if (vendor) andClauses.push({ 'cloudDetails.vendor': vendor });

    if (group) {
      const gStr = String(group).trim();
      if (gStr === 'group_only') {
        andClauses.push({
          $or: [
            { 'groupCompanies.0': { $exists: true } },
            {
              'companyInfo.groupOfCompany': {
                $exists: true,
                $nin: ['', null, '—', 'NO', 'No', 'no', 'NONE', 'None'],
              },
            },
          ],
        });
      } else if (gStr === 'non_group') {
        andClauses.push({
          $and: [
            { $or: [{ groupCompanies: { $exists: false } }, { groupCompanies: { $size: 0 } }] },
            {
              $or: [
                { 'companyInfo.groupOfCompany': { $exists: false } },
                { 'companyInfo.groupOfCompany': { $in: ['', null, '—', 'NO', 'No', 'no', 'NONE', 'None'] } },
              ],
            },
          ],
        });
      } else {
        const grpRx = new RegExp(escapeRegExp(gStr), 'i');
        andClauses.push({
          $or: [
            { 'companyInfo.groupOfCompany': grpRx },
            { 'groupCompanies.name': grpRx },
          ],
        });
      }
    }

    if (product) {
      const prodRx = new RegExp(escapeRegExp(String(product).trim()), 'i');
      andClauses.push({
        $or: [
          { products: prodRx },
          { 'serialNoInfo.product': prodRx },
          { 'services.product': prodRx },
          { 'tdlDetails.product': prodRx },
          { 'cloudDetails.vendorCategory': prodRx },
        ],
      });
    }

    if (moduleType === 'tdl') {
      if (effectiveStatus === 'expiring') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tdl', endDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', isTdl: true, endDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { serialNoInfo: { $elemMatch: { $or: [{ isTdl: true }, { tdlEnabled: true }], endDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { 'tdlDetails.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { services: { $elemMatch: { type: 'tdl', status: 'expiring' } } },
            { 'tdlDetails.status': 'expiring' },
          ],
        });
      } else if (effectiveStatus === 'expired') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tdl', endDate: { $lt: startOfToday } } } },
            { services: { $elemMatch: { type: 'amc', isTdl: true, endDate: { $lt: startOfToday } } } },
            { serialNoInfo: { $elemMatch: { $or: [{ isTdl: true }, { tdlEnabled: true }], endDate: { $lt: startOfToday } } } },
            { 'tdlDetails.endDate': { $lt: startOfToday } },
            { services: { $elemMatch: { type: 'tdl', status: 'expired' } } },
            { 'tdlDetails.status': 'expired' },
          ],
          $nor: [
            { services: { $elemMatch: { type: 'tdl', endDate: { $gt: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', isTdl: true, endDate: { $gt: endOfDaySoon } } } },
            { serialNoInfo: { $elemMatch: { $or: [{ isTdl: true }, { tdlEnabled: true }], endDate: { $gt: endOfDaySoon } } } },
            { 'tdlDetails.endDate': { $gt: endOfDaySoon } },
          ],
        });
      } else if (effectiveStatus === 'trial') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tdl', status: 'trial' } } },
            { 'tdlDetails.status': 'trial' },
          ],
        });
      } else if (effectiveStatus === 'active') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tdl', endDate: { $gt: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', isTdl: true, endDate: { $gt: endOfDaySoon } } } },
            { serialNoInfo: { $elemMatch: { $and: [{ $or: [{ isTdl: true }, { tdlEnabled: true }] }, { endDate: { $gt: endOfDaySoon } }] } } },
            { services: { $elemMatch: { type: 'tdl', status: 'active', endDate: { $not: { $lt: startOfToday } } } } },
            { 'tdlDetails.status': 'active', 'tdlDetails.endDate': { $not: { $lt: startOfToday } } },
            { 'tdlDetails.endDate': { $gt: endOfDaySoon } },
          ],
        });
      } else {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tdl', status: { $nin: ['none', 'expired'] } } } },
            { services: { $elemMatch: { isTdl: true } } },
            { services: { $elemMatch: { tdlEnabled: true } } },
            { 'serialNoInfo.tdlEnabled': true },
            { 'serialNoInfo.isTdl': true },
            { 'tdlDetails.status': 'active' },
            { 'tdlDetails.status': 'expiring' },
            { 'tdlDetails.status': 'trial' },
            { 'tdlDetails.actualPrice': { $gt: 0 } },
          ],
        });
      }
    } else if (moduleType === 'cloud') {
      if (effectiveStatus === 'expiring') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'cloud', endDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { 'cloudDetails.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { 'cloudDetails.cloudExpiryDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { services: { $elemMatch: { type: 'cloud', status: 'expiring' } } },
            { 'cloudDetails.status': 'expiring' },
          ],
        });
      } else if (effectiveStatus === 'expired') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'cloud', endDate: { $lt: startOfToday } } } },
            { 'cloudDetails.endDate': { $lt: startOfToday } },
            { 'cloudDetails.cloudExpiryDate': { $lt: startOfToday } },
            { services: { $elemMatch: { type: 'cloud', status: 'expired' } } },
            { 'cloudDetails.status': 'expired' },
          ],
          $nor: [
            { services: { $elemMatch: { type: 'cloud', endDate: { $gt: endOfDaySoon } } } },
            { 'cloudDetails.endDate': { $gt: endOfDaySoon } },
            { 'cloudDetails.cloudExpiryDate': { $gt: endOfDaySoon } },
          ],
        });
      } else if (effectiveStatus === 'active') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'cloud', endDate: { $gt: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'cloud', status: 'active', endDate: { $not: { $lt: startOfToday } } } } },
            { 'cloudDetails.status': 'active', 'cloudDetails.endDate': { $not: { $lt: startOfToday } } },
            { 'cloudDetails.endDate': { $gt: endOfDaySoon } },
            { 'cloudDetails.cloudExpiryDate': { $gt: endOfDaySoon } },
          ],
        });
      } else {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'cloud', status: { $nin: ['none', 'expired'] } } } },
            { 'cloudDetails.status': 'active' },
            { 'cloudDetails.status': 'expiring' },
            { 'cloudDetails.status': 'trial' },
            { 'cloudDetails.vendor': { $exists: true, $ne: null } },
            { 'cloudDetails.users.0': { $exists: true } },
            { 'cloudDetails.actualPrice': { $gt: 0 } },
          ],
        });
      }
    } else if (moduleType === 'tss') {
      if (effectiveStatus === 'expiring') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tss', endDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', tssExpiryDate: { $gte: startOfToday, $lte: endOfDaySoon } } } },
            { 'serialNoInfo.tssExpiryDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { 'tssDetails.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { services: { $elemMatch: { type: 'tss', status: 'expiring' } } },
            { 'tssDetails.status': 'expiring' },
          ],
        });
      } else if (effectiveStatus === 'expired') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tss', endDate: { $lt: startOfToday } } } },
            { services: { $elemMatch: { type: 'amc', tssExpiryDate: { $lt: startOfToday } } } },
            { 'serialNoInfo.tssExpiryDate': { $lt: startOfToday } },
            { 'tssDetails.endDate': { $lt: startOfToday } },
            { services: { $elemMatch: { type: 'tss', status: 'expired' } } },
            { 'tssDetails.status': 'expired' },
          ],
          $nor: [
            { services: { $elemMatch: { type: 'tss', endDate: { $gt: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', tssExpiryDate: { $gt: endOfDaySoon } } } },
            { 'serialNoInfo.tssExpiryDate': { $gt: endOfDaySoon } },
            { 'tssDetails.endDate': { $gt: endOfDaySoon } },
          ],
        });
      } else if (effectiveStatus === 'active') {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tss', endDate: { $gt: endOfDaySoon } } } },
            { services: { $elemMatch: { type: 'amc', tssExpiryDate: { $gt: endOfDaySoon } } } },
            { 'serialNoInfo.tssExpiryDate': { $gt: endOfDaySoon } },
            { 'tssDetails.endDate': { $gt: endOfDaySoon } },
            { services: { $elemMatch: { type: 'tss', status: 'active', endDate: { $not: { $lt: startOfToday } } } } },
            { 'tssDetails.status': 'active', 'tssDetails.endDate': { $not: { $lt: startOfToday } } },
          ],
        });
      } else {
        andClauses.push({
          $or: [
            { services: { $elemMatch: { type: 'tss', status: { $nin: ['none', 'expired'] } } } },
            { services: { $elemMatch: { tssExpiryDate: { $exists: true, $ne: null } } } },
            { 'serialNoInfo.tssExpiryDate': { $exists: true, $ne: null } },
            { 'tssDetails.status': 'active' },
            { 'tssDetails.status': 'expiring' },
            { 'tssDetails.actualPrice': { $gt: 0 } },
          ],
        });
      }
    } else if (effectiveStatus && effectiveStatus !== 'all') {
      if (effectiveStatus === 'expiring') {
        andClauses.push({
          $or: [
            { amcStatus: 'expiring' },
            { amcExpiry: { $gte: startOfToday, $lte: endOfDaySoon } },
            { 'amcDetails.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { services: { $elemMatch: { type: 'amc', $or: [{ status: 'expiring' }, { endDate: { $gte: startOfToday, $lte: endOfDaySoon } }, { tssExpiryDate: { $gte: startOfToday, $lte: endOfDaySoon } }] } } },
            { 'serialNoInfo.tssExpiryDate': { $gte: startOfToday, $lte: endOfDaySoon } },
            { 'serialNoInfo.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
          ],
        });
      } else if (effectiveStatus === 'expired') {
        andClauses.push({
          $or: [
            { amcStatus: 'expired' },
            { amcExpiry: { $lt: startOfToday } },
            { 'amcDetails.endDate': { $lt: startOfToday } },
            { services: { $elemMatch: { type: 'amc', $or: [{ status: 'expired' }, { endDate: { $lt: startOfToday } }, { tssExpiryDate: { $lt: startOfToday } }] } } },
          ],
          $nor: [
            { amcStatus: 'active' },
            { amcExpiry: { $gt: endOfDaySoon } },
            { 'amcDetails.endDate': { $gt: endOfDaySoon } },
            { services: { $elemMatch: { type: 'amc', $or: [{ endDate: { $gt: endOfDaySoon } }, { tssExpiryDate: { $gt: endOfDaySoon } }] } } },
          ],
        });
      } else if (effectiveStatus === 'active') {
        andClauses.push({
          $or: [
            { amcStatus: 'active', amcExpiry: { $not: { $lt: startOfToday } } },
            { amcExpiry: { $gt: endOfDaySoon } },
            { 'amcDetails.endDate': { $gt: endOfDaySoon } },
            { services: { $elemMatch: { type: 'amc', $or: [{ endDate: { $gt: endOfDaySoon } }, { tssExpiryDate: { $gt: endOfDaySoon } }] } } },
          ],
        });
      } else if (effectiveStatus === 'none') {
        andClauses.push({
          $or: [
            { amcStatus: 'none' },
            { amcStatus: { $exists: false } },
          ],
        });
      } else {
        andClauses.push({ amcStatus: effectiveStatus });
      }
    }

    if (search) {
      const rx = new RegExp(escapeRegExp(String(search).trim()), 'i');
      andClauses.push({
        $or: [
          { customerNumber: rx },
          { name: rx },
          { contact: rx },
          { phone: rx },
          { email: rx },
          { address: rx },
          { industry: rx },
          { products: rx },
          { customerType: rx },
          { 'companyInfo.customerName': rx },
          { 'companyInfo.crNo': rx },
          { 'companyInfo.businessSegment': rx },
          { 'companyInfo.locationArea': rx },
          { 'branchInfo.branchName': rx },
          { 'keyContacts.contactName': rx },
          { 'keyContacts.mobile': rx },
          { 'keyContacts.email': rx },
          { 'serialNoInfo.product': rx },
          { 'serialNoInfo.licenseSerialNo': rx },
          { 'serialNoInfo.licenses.licenceSerialNo': rx },
          { 'services.product': rx },
          { 'services.licenseSerialNo': rx },
          { 'companyInfo.groupOfCompany': rx },
          { 'groupCompanies.name': rx },
        ],
      });
    }

    const filter: Record<string, unknown> = { isActive: true };
    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    const isAll = String(req.query.all).toLowerCase() === 'true' || 
                  limit === 'all' || 
                  limit === '0' || 
                  Number(limit) === 0 ||
                  (req.query.lookup === 'true' && !req.query.limit);

    const sortOption: any = req.query.sort === 'name' || req.query.sort === 'asc'
      ? { name: 1 }
      : { _id: 1 };

    if (isAll) {
      let query: any = Customer.find(filter).sort(sortOption);
      if (req.query.sort === 'name' || req.query.lookup === 'true') {
        query = query.collation({ locale: 'en', strength: 2 });
      }
      if (req.query.lookup === 'true' || req.query.fields === 'minimal') {
        query = query.select('name contact email phone primaryContactInfo keyContacts companyInfo branchInfo branches address isActive products');
      } else {
        query = query.populate('createdBy', 'name');
      }
      if (typeof query.lean === 'function') {
        query = query.lean();
      }
      const customers = await query;
      res.status(200).json({ success: true, data: customers, total: customers.length, page: 1, pages: 1 });
      return;
    }

    const skip = (Number(page) - 1) * Number(limit);
    let pQuery: any = Customer.find(filter).populate('createdBy', 'name').sort(sortOption).skip(skip).limit(Number(limit));
    if (typeof pQuery.lean === 'function') {
      pQuery = pQuery.lean();
    }
    const [customers, total] = await Promise.all([
      pQuery,
      Customer.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: customers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err: any) {
    console.error('Error in getCustomers:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err?.message });
  }
};

let customerLookupCache: { data: any; timestamp: number } | null = null;
const customerInsightsCacheMap = new Map<string, { data: any; timestamp: number }>();
const CUSTOMER_CACHE_TTL = 60 * 1000; // 60 seconds

export const invalidateCustomerCaches = () => {
  customerLookupCache = null;
  customerInsightsCacheMap.clear();
};

// @route   GET /api/v1/customers/lookup
export const getCustomerLookup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search } = req.query;
    if (!search && customerLookupCache && (Date.now() - customerLookupCache.timestamp < CUSTOMER_CACHE_TTL)) {
      res.status(200).json(customerLookupCache.data);
      return;
    }

    const filter: Record<string, unknown> = { isActive: true };
    if (search) {
      const rx = new RegExp(escapeRegExp(String(search).trim()), 'i');
      filter.$or = [
        { name: rx },
        { contact: rx },
        { phone: rx },
        { email: rx },
        { 'companyInfo.customerName': rx },
        { 'primaryContactInfo.contactName1': rx },
        { 'primaryContactInfo.email': rx },
        { 'primaryContactInfo.mobile': rx },
      ];
    }
    const customers = await Customer.find(filter)
      .select('name contact email phone primaryContactInfo keyContacts companyInfo branchInfo branches address isActive products')
      .sort({ name: 1 })
      .collation({ locale: 'en', strength: 2 })
      .lean();
    const payload = { success: true, data: customers, total: customers.length };
    if (!search) {
      customerLookupCache = { data: payload, timestamp: Date.now() };
    }
    res.status(200).json(payload);
  } catch (err: any) {
    console.error('Error in getCustomerLookup:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err?.message });
  }
};

export const getCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id };
    const customer = await Customer.findOne(filter).populate('createdBy', 'name');
    if (!customer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }
    res.status(200).json({ success: true, data: customer });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const sendCustomerWhatsapp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, isActive: true };
    const customer = await Customer.findOne(filter);
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    if (IS_WHATSAPP_STATICALLY_DISABLED) {
      res.status(400).json({ success: false, message: 'WhatsApp service is statically disabled in the backend.' });
      return;
    }

    const settings = await Settings.findOne();
    if (settings?.whatsappBusinessStatus !== 'active') {
      res.status(400).json({ success: false, message: 'WhatsApp Business API is inactive. Enable it in Admin Settings first.' });
      return;
    }

    const phoneNumberId = String(settings?.whatsappPhoneNumberId || '').trim();
    const accessToken = String(settings?.whatsappAccessToken || '').trim();
    if (!phoneNumberId || !accessToken) {
      res.status(400).json({ success: false, message: 'WhatsApp Phone Number ID and Access Token are required in Admin Settings.' });
      return;
    }

    const recipient = normalizeWhatsAppPhone(resolveCustomerWhatsappNumber(customer), settings?.country);
    if (!recipient || recipient.length < 8 || recipient.length > 15) {
      res.status(400).json({ success: false, message: 'Customer does not have a valid WhatsApp/mobile number with country code.' });
      return;
    }

    const {
      messageType = 'text',
      message,
      templateName,
      languageCode,
      templateId,
      emailTemplateId,
      dynamicData,
      includePdf = true,
    } = req.body || {};

    let pdfUrl: string | undefined;
    let mediaId: string | null = null;
    let emailTemplateDoc: any = null;
    const chosenTemplateId = templateId || emailTemplateId;

    if (chosenTemplateId) {
      emailTemplateDoc = await EmailTemplate.findById(chosenTemplateId);
    }

    const interpolateTemplateVars = (text: string, data: Record<string, any>) => {
      let res = text || '';
      const expiryVal = data.expiryDate || data.expiry_date || data.dueDate || data.due_date || data.endDate || data.end_date || data.tssExpiryDate || data.tss_expiry_date || '—';
      const serialVal = data.serialNo || data.serial_no || data.licenseSerialNo || data.licenceSerialNo || '—';
      const rawStart = data.startDate || data.start_date || data.tssStartDate || data.tss_start_date || data.fromDate || data.from_date || '';
      const startVal = (rawStart && rawStart !== '—') ? String(rawStart) : deriveStartDate(String(expiryVal));

      const safeData: Record<string, any> = {
        ...data,
        startDate: startVal,
        start_date: startVal,
        tss_start_date: startVal,
        service_start_date: startVal,
        fromDate: startVal,
        from_date: startVal,
        expiryDate: expiryVal,
        expiry_date: expiryVal,
        tss_expiry_date: expiryVal,
        endDate: data.endDate || data.end_date || expiryVal,
        end_date: data.endDate || data.end_date || expiryVal,
        toDate: data.endDate || data.end_date || expiryVal,
        to_date: data.endDate || data.end_date || expiryVal,
      };

      Object.entries(safeData).forEach(([k, v]) => {
        const val = (v === undefined || v === null || v === '' || v === '—') ? '—' : String(v);
        res = res.replace(new RegExp(`{{${k}}}`, 'g'), val);
      });

      // Paired date range placeholders: e.g. "Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]"
      const dateRangeRegex = /(from\s+)?(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])\s*(to|-|until|through|–|—)\s*(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi;
      res = res.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);

      // Standalone directional date placeholders
      res = res.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
      res = res.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);

      res = res
        .replace(/\[Company Name\]/gi, data.customerName || data.company_name || '—')
        .replace(/\[Client Name\]/gi, data.customerName || data.company_name || '—')
        .replace(/\[Contact Person\]/gi, data.contactPerson || data.contact_person || 'Valued Customer')
        .replace(/\[Product\/Service Name\]/gi, data.product || data.productName || 'the service')
        .replace(/\[Product Name\]/gi, data.product || data.productName || 'the service')
        .replace(/\[Release\]/gi, data.release || data.releaseVersion || '—')
        .replace(/\[Serial No(?:umber)?\]/gi, serialVal)
        .replace(/\[x{4,}\]/gi, serialVal)
        .replace(/\[Start Date\]/gi, startVal)
        .replace(/\[From Date\]/gi, startVal)
        .replace(/\[End Date\]/gi, safeData.endDate)
        .replace(/\[To Date\]/gi, safeData.endDate)
        .replace(/\[Expiry Date\]/gi, expiryVal)
        .replace(/\[TSS Expiry Date\]/gi, expiryVal)
        .replace(/\[Due Date\]/gi, expiryVal)
        .replace(/\[DD\/MM\/YYYY\]/gi, expiryVal)
        .replace(/\[MM\/DD\/YYYY\]/gi, expiryVal)
        .replace(/\[YYYY-MM-DD\]/gi, expiryVal)
        .replace(/\[Date\]/gi, expiryVal)
        .replace(/\[Amount\]/gi, data.amount || '—')
        .replace(/\[Phone Number\]/gi, data.phone || data.mobile || '—')
        .replace(/\[Email Address\]/gi, data.email || data.email_id || '—')
        .replace(/{{[^}]+}}/g, '—');
      return res;
    };

    if (emailTemplateDoc && includePdf) {
      try {
        const normalizedData: Record<string, any> = {
          ...(dynamicData || {}),
          customerName: customer.name || (customer as any).companyName || 'Valued Customer',
          companyName: (customer as any).companyName || customer.name || 'Valued Customer',
          contactPerson: customer.contact || customer.primaryContactInfo?.contactName1 || 'Valued Customer',
          phone: customer.phone || customer.primaryContactInfo?.mobile || '',
          mobile: customer.primaryContactInfo?.mobile || customer.phone || '',
          email: customer.email || customer.primaryContactInfo?.email || '',
          product: dynamicData?.product || '',
          serialNo: dynamicData?.serialNo || (customer as any).licenseSerialNo || '',
          release: dynamicData?.release || '',
          startDate: dynamicData?.startDate || '',
          expiryDate: dynamicData?.expiryDate || '',
          amount: dynamicData?.amount || '',
        };

        const processedSubject = interpolateTemplateVars(emailTemplateDoc.subject, normalizedData);
        const processedBody = interpolateTemplateVars(emailTemplateDoc.body, normalizedData);

        const defaultProposalTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});
        const pdfBuffer = await generateTemplatePdfBuffer({
          subject: processedSubject,
          body: processedBody,
          customerName: normalizedData.customerName,
          contactPerson: normalizedData.contactPerson,
          phone: normalizedData.phone,
          email: normalizedData.email,
          product: normalizedData.product,
          serialNo: normalizedData.serialNo,
          release: normalizedData.release,
          startDate: normalizedData.startDate,
          expiryDate: normalizedData.expiryDate,
          amount: normalizedData.amount,
          dynamicData: normalizedData,
          settings,
          defaultTemplate: defaultProposalTemplate,
          headerImage: emailTemplateDoc.headerImage || (emailTemplateDoc as any).templateImage || '',
          footerImage: emailTemplateDoc.footerImage || (emailTemplateDoc as any).templateFooterImage || '',
        });

        const documentsDir = ensureUploadDir('documents');
        const safeCustName = (normalizedData.customerName || 'Customer').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
        const safeTmplName = (emailTemplateDoc.name || 'Notice').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
        const filename = `${safeTmplName}_${safeCustName}_${Date.now()}.pdf`;
        const localPath = path.join(documentsDir, filename);

        fs.writeFileSync(localPath, pdfBuffer);

        syncFileToVps(localPath, 'documents', filename).catch((err) => {
          console.warn('[WhatsApp] VPS upload sync failed:', err);
        });

        const backendOrigin = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || (req.get('host')?.includes('localhost') ? 'https://crm.welcometech.qa' : `${req.protocol}://${req.get('host')}`)).replace(/\/+$/, '');
        pdfUrl = `${backendOrigin}${buildUploadUrl('documents', filename)}`;
        console.log(`[WhatsApp] Generated PDF saved at ${localPath}, Public URL: ${pdfUrl}`);

        // Direct upload to Meta Media API for native PDF file delivery in WhatsApp
        try {
          mediaId = await uploadWhatsAppMedia({
            apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
            phoneNumberId,
            accessToken,
            fileBuffer: pdfBuffer,
            filename: `${safeTmplName}_${safeCustName}.pdf`,
            mimeType: 'application/pdf',
          });
          console.log(`[WhatsApp] Successfully uploaded PDF to Meta Media API. Media ID: ${mediaId}`);
        } catch (mediaErr: any) {
          console.warn('[WhatsApp] Meta media upload failed, falling back to link:', mediaErr?.message || mediaErr);
        }
      } catch (pdfErr) {
        console.error('[WhatsApp] Failed to generate template PDF:', pdfErr);
      }
    }

    let mainResponseMeta: any = null;
    let documentResponseMeta: any = null;
    let linkResponseMeta: any = null;
    let pdfTemplateSent = false;
    let pdfTemplateConfigured = false;
    let pdfTemplateSendFailed = false;
    let resolvedPdfTemplateForResponse = '';
    const docFilename = `${emailTemplateDoc?.name || 'Notice'}_Letter.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const summarizeWhatsAppMeta = (meta: any) => ({
      contacts: meta?.contacts,
      messages: meta?.messages,
    });
    const logWhatsAppMeta = (label: string, meta: any) => {
      console.log(`[WhatsApp] ${label} accepted by Meta:`, JSON.stringify(summarizeWhatsAppMeta(meta)));
    };
    const sendPdfDownloadLink = async (reason: string) => {
      if (!pdfUrl || !includePdf) return;
      try {
        console.log(`[WhatsApp] Sending PDF download link to ${recipient} (${reason})...`);
        linkResponseMeta = await sendWhatsAppMessage({
          apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
          phoneNumberId,
          accessToken,
          payload: buildWhatsAppTextPayload(recipient, `Download Official PDF Document:\n${pdfUrl}`, true),
        });
        logWhatsAppMeta('PDF download link', linkResponseMeta);
      } catch (linkErr) {
        console.warn('[WhatsApp] Fallback link dispatch failed:', linkErr);
      }
    };

    if (messageType === 'template') {
      const resolvedTemplate = String(templateName || settings?.whatsappDefaultTemplateName || '').trim();
      const resolvedLanguage = String(languageCode || settings?.whatsappDefaultLanguageCode || 'en_US').trim();
      if (!resolvedTemplate) {
        res.status(400).json({ success: false, message: 'Template name is required for template messages.' });
        return;
      }

      // Resolve Customer / Company Name (filtering out pure phone digits)
      const rawContact = String(customer.primaryContactInfo?.contactName1 || customer.contact || '').trim();
      const isDigitsOnly = /^\+?[\d\s\-()]+$/.test(rawContact);
      const contactPerson = (!isDigitsOnly && rawContact) ? rawContact : '';

      const companyOrCustomerName = String(
        customer.name ||
        customer.companyInfo?.customerName ||
        (customer as any).companyName ||
        contactPerson ||
        'Valued Customer'
      ).trim();

      const bodyParams = [companyOrCustomerName];
      const resolvedPdfTemplate = String((settings as any)?.whatsappPdfTemplateName || process.env.WHATSAPP_PDF_TEMPLATE_NAME || '').trim();
      const resolvedPdfLanguage = String((settings as any)?.whatsappPdfTemplateLanguageCode || resolvedLanguage).trim();
      resolvedPdfTemplateForResponse = resolvedPdfTemplate;
      pdfTemplateConfigured = !!resolvedPdfTemplate;
      const pdfTemplatePayload = resolvedPdfTemplate && includePdf && pdfUrl
        ? buildWhatsAppTemplatePayload(recipient, resolvedPdfTemplate, resolvedPdfLanguage, bodyParams, {
          headerDocument: {
            id: mediaId || undefined,
            link: mediaId ? undefined : pdfUrl,
            filename: docFilename,
          },
        })
        : null;
      const templatePayload = pdfTemplatePayload || buildWhatsAppTemplatePayload(recipient, resolvedTemplate, resolvedLanguage, bodyParams);

      console.log(`[WhatsApp] Sending Meta Template "${pdfTemplatePayload ? resolvedPdfTemplate : resolvedTemplate}" to ${recipient}${pdfTemplatePayload ? ' with PDF document header' : ''}...`);
      try {
        mainResponseMeta = await sendWhatsAppMessage({
          apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
          phoneNumberId,
          accessToken,
          payload: templatePayload,
        });
        pdfTemplateSent = !!pdfTemplatePayload;
        logWhatsAppMeta('Template message', mainResponseMeta);
      } catch (templateErr: any) {
        if (!pdfTemplatePayload) throw templateErr;
        pdfTemplateSendFailed = true;
        console.warn('[WhatsApp] PDF template send failed; retrying default template:', templateErr?.message || templateErr);
        mainResponseMeta = await sendWhatsAppMessage({
          apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
          phoneNumberId,
          accessToken,
          payload: buildWhatsAppTemplatePayload(recipient, resolvedTemplate, resolvedLanguage, bodyParams),
        });
        logWhatsAppMeta('Fallback template message', mainResponseMeta);
      }

      if (includePdf && !pdfTemplateSent) {
        let nativeDocumentSent = false;
        if (mediaId) {
          try {
            console.log(`[WhatsApp] Dispatching native PDF document (Media ID: ${mediaId}) to ${recipient}...`);
            documentResponseMeta = await sendWhatsAppMessage({
              apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
              phoneNumberId,
              accessToken,
              payload: buildWhatsAppDocumentPayload(recipient, mediaId, docFilename, `Attached: ${emailTemplateDoc?.name || 'Official Letter'}`),
            });
            nativeDocumentSent = true;
            logWhatsAppMeta('Native PDF document', documentResponseMeta);
          } catch (docErr: any) {
            console.warn('[WhatsApp] Native PDF document delivery failed, sending direct download link as fallback:', docErr?.message || docErr);
            await sendPdfDownloadLink('document send failed');
          }
        }

        if (nativeDocumentSent) {
          await sendPdfDownloadLink('companion link');
        } else if (!mediaId) {
          await sendPdfDownloadLink('media upload unavailable');
        }
      }
    } else {
      let body = String(message || '').trim();
      if (!body) {
        if (emailTemplateDoc) {
          const normalizedData: Record<string, any> = {
            ...(dynamicData || {}),
            customerName: customer.name || (customer as any).companyName || 'Valued Customer',
            contactPerson: customer.contact || customer.primaryContactInfo?.contactName1 || 'Valued Customer',
            product: dynamicData?.product || '',
            serialNo: dynamicData?.serialNo || (customer as any).licenseSerialNo || '',
            expiryDate: dynamicData?.expiryDate || '',
          };
          body = interpolateTemplateVars(emailTemplateDoc.body, normalizedData).trim();
        } else {
          body = buildCustomerWhatsappMessage(customer).trim();
        }
      }

      if (!body && !mediaId) {
        res.status(400).json({ success: false, message: 'Message text is required.' });
        return;
      }

      // Always append official PDF download link to the text message body if PDF is included
      let messageWithLink = body;
      if (pdfUrl && includePdf && !messageWithLink.includes(pdfUrl)) {
        messageWithLink += `\n\n📄 *View / Download Official PDF:*\n${pdfUrl}`;
      }

      console.log(`[WhatsApp] Sending text letter to ${recipient}...`);
      mainResponseMeta = await sendWhatsAppMessage({
        apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
        phoneNumberId,
        accessToken,
        payload: buildWhatsAppTextPayload(recipient, messageWithLink),
      });
      logWhatsAppMeta('Text message', mainResponseMeta);

      // If native PDF mediaId exists, also send the standalone PDF document attachment file
      if (mediaId && includePdf) {
        try {
          console.log(`[WhatsApp] Dispatching native PDF document (Media ID: ${mediaId}) to ${recipient}...`);
          documentResponseMeta = await sendWhatsAppMessage({
            apiVersion: normalizeGraphApiVersion(settings?.whatsappApiVersion),
            phoneNumberId,
            accessToken,
            payload: buildWhatsAppDocumentPayload(recipient, mediaId, docFilename, `📄 Attached: ${emailTemplateDoc?.name || 'Official Letter'}`),
          });
          logWhatsAppMeta('Native PDF document', documentResponseMeta);
        } catch (docErr: any) {
          console.warn('[WhatsApp] Native PDF document attachment send failed:', docErr?.message || docErr);
        }
      }
    }

    const now = new Date();
    const waTemplate = (messageType === 'template'
      ? (templateName || settings?.whatsappDefaultTemplateName)
      : (emailTemplateDoc?.name || 'Direct Message')) || 'WhatsApp Message';
    try {
      customer.lastNotifiedAt = now;
      customer.lastNotifiedChannel = 'whatsapp';
      customer.lastNotifiedTemplate = waTemplate;
      if (customer.amcDetails) {
        customer.amcDetails.lastNotifiedAt = now;
        customer.amcDetails.lastNotifiedChannel = 'whatsapp';
        customer.amcDetails.lastNotifiedTemplate = waTemplate;
      }
      if (customer.tdlDetails) {
        customer.tdlDetails.lastNotifiedAt = now;
        customer.tdlDetails.lastNotifiedChannel = 'whatsapp';
        customer.tdlDetails.lastNotifiedTemplate = waTemplate;
      }
      if (customer.cloudDetails) {
        customer.cloudDetails.lastNotifiedAt = now;
        customer.cloudDetails.lastNotifiedChannel = 'whatsapp';
        customer.cloudDetails.lastNotifiedTemplate = waTemplate;
      }
      if (customer.tssDetails) {
        customer.tssDetails.lastNotifiedAt = now;
        customer.tssDetails.lastNotifiedChannel = 'whatsapp';
        customer.tssDetails.lastNotifiedTemplate = waTemplate;
      }
      await customer.save();

      await AMC.updateMany({ customer: customer._id }, {
        lastNotifiedAt: now,
        lastNotifiedChannel: 'whatsapp',
        lastNotifiedTemplate: waTemplate,
      });
    } catch (auditErr) {
      console.warn('[WhatsApp] Could not update lastNotified audit:', auditErr);
    }

    const pdfRequested = Boolean(includePdf && emailTemplateDoc && pdfUrl);
    const proactivePdfNeedsTemplate = messageType === 'template' && pdfRequested && !pdfTemplateSent;
    const warning = proactivePdfNeedsTemplate
      ? (pdfTemplateConfigured && pdfTemplateSendFailed
        ? `WhatsApp accepted the notice, but the configured PDF template "${resolvedPdfTemplateForResponse}" was rejected by Meta. Create/approve it as a document-header template or update WhatsApp Settings.`
        : 'WhatsApp accepted the notice, but proactive PDF attachment delivery requires an approved Meta template with a document header. Configure the PDF Template Name in WhatsApp Settings.')
      : null;
    const responseMessage = warning
      ? 'WhatsApp request submitted to Meta, but delivery is not confirmed'
      : (pdfTemplateSent
        ? 'WhatsApp PDF template submitted to Meta successfully'
        : 'WhatsApp message submitted to Meta successfully');

    res.status(200).json({
      success: true,
      message: responseMessage,
      data: {
        to: recipient,
        customerId: customer._id,
        customerName: customer.name,
        pdfUrl: pdfUrl || null,
        mediaId: mediaId || null,
        deliveryStatus: 'accepted_by_meta',
        deliveryVerified: false,
        warning,
        pdfTemplateConfigured,
        pdfTemplateSent,
        pdfTemplateName: resolvedPdfTemplateForResponse || null,
        meta: mainResponseMeta,
        documentMeta: documentResponseMeta,
        linkMeta: linkResponseMeta,
      },
    });
  } catch (err: any) {
    console.error('[WhatsApp] Send failed with error:', err);
    res.status(400).json({ success: false, message: `WhatsApp send failed: ${err.message}`, metaStatus: err?.status });
  }
};

// @desc    Generate/Preview customer template PDF on the fly
// @route   POST /api/v1/customers/:id/template-pdf
// @access  Private
export const previewCustomerTemplatePdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    const { templateId, dynamicData } = req.body || {};
    if (!templateId) {
      res.status(400).json({ success: false, message: 'templateId is required' });
      return;
    }

    const emailTemplate = await EmailTemplate.findById(templateId);
    if (!emailTemplate) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }

    const settings = await Settings.findOne();
    const defaultProposalTemplate = await ProposalTemplate.findOne({ $or: [{ isActive: true }, { status: 'active' }] }) || await ProposalTemplate.findOne({});

    const interpolateTemplateVars = (text: string, data: Record<string, any>) => {
      let res = text || '';
      const expiryVal = data.expiryDate || data.expiry_date || data.dueDate || data.due_date || data.endDate || data.end_date || data.tssExpiryDate || data.tss_expiry_date || '—';
      const serialVal = data.serialNo || data.serial_no || data.licenseSerialNo || data.licenceSerialNo || '—';
      const rawStart = data.startDate || data.start_date || data.tssStartDate || data.tss_start_date || data.fromDate || data.from_date || '';
      const startVal = (rawStart && rawStart !== '—') ? String(rawStart) : deriveStartDate(String(expiryVal));

      const safeData: Record<string, any> = {
        ...data,
        startDate: startVal,
        start_date: startVal,
        tss_start_date: startVal,
        service_start_date: startVal,
        fromDate: startVal,
        from_date: startVal,
        expiryDate: expiryVal,
        expiry_date: expiryVal,
        tss_expiry_date: expiryVal,
        endDate: data.endDate || data.end_date || expiryVal,
        end_date: data.endDate || data.end_date || expiryVal,
        toDate: data.endDate || data.end_date || expiryVal,
        to_date: data.endDate || data.end_date || expiryVal,
      };

      Object.entries(safeData).forEach(([k, v]) => {
        const val = (v === undefined || v === null || v === '' || v === '—') ? '—' : String(v);
        res = res.replace(new RegExp(`{{${k}}}`, 'g'), val);
      });

      // Paired date range placeholders: e.g. "Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]"
      const dateRangeRegex = /(from\s+)?(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])\s*(to|-|until|through|–|—)\s*(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi;
      res = res.replace(dateRangeRegex, (_m: string, fromPrefix?: string, _p1?: string, sep?: string) => `${fromPrefix || ''}${startVal} ${sep || 'to'} ${expiryVal}`);

      // Standalone directional date placeholders
      res = res.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
      res = res.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);

      res = res
        .replace(/\[Company Name\]/gi, data.customerName || data.company_name || '—')
        .replace(/\[Client Name\]/gi, data.customerName || data.company_name || '—')
        .replace(/\[Contact Person\]/gi, data.contactPerson || data.contact_person || 'Valued Customer')
        .replace(/\[Product\/Service Name\]/gi, data.product || data.productName || 'the service')
        .replace(/\[Product Name\]/gi, data.product || data.productName || 'the service')
        .replace(/\[Release\]/gi, data.release || data.releaseVersion || '—')
        .replace(/\[Serial No(?:umber)?\]/gi, serialVal)
        .replace(/\[x{4,}\]/gi, serialVal)
        .replace(/\[Start Date\]/gi, startVal)
        .replace(/\[From Date\]/gi, startVal)
        .replace(/\[End Date\]/gi, safeData.endDate)
        .replace(/\[To Date\]/gi, safeData.endDate)
        .replace(/\[Expiry Date\]/gi, expiryVal)
        .replace(/\[TSS Expiry Date\]/gi, expiryVal)
        .replace(/\[Due Date\]/gi, expiryVal)
        .replace(/\[DD\/MM\/YYYY\]/gi, expiryVal)
        .replace(/\[MM\/DD\/YYYY\]/gi, expiryVal)
        .replace(/\[YYYY-MM-DD\]/gi, expiryVal)
        .replace(/\[Date\]/gi, expiryVal)
        .replace(/\[Amount\]/gi, data.amount || '—')
        .replace(/\[Phone Number\]/gi, data.phone || data.mobile || '—')
        .replace(/\[Email Address\]/gi, data.email || data.email_id || '—')
        .replace(/{{[^}]+}}/g, '—');
      return res;
    };

    const normalizedData: Record<string, any> = {
      ...(dynamicData || {}),
      customerName: customer.name || (customer as any).companyName || 'Valued Customer',
      companyName: (customer as any).companyName || customer.name || 'Valued Customer',
      contactPerson: customer.contact || customer.primaryContactInfo?.contactName1 || 'Valued Customer',
      phone: customer.phone || customer.primaryContactInfo?.mobile || '',
      mobile: customer.primaryContactInfo?.mobile || customer.phone || '',
      email: customer.email || customer.primaryContactInfo?.email || '',
      product: dynamicData?.product || '',
      serialNo: dynamicData?.serialNo || (customer as any).licenseSerialNo || '',
      release: dynamicData?.release || '',
      startDate: dynamicData?.startDate || '',
      expiryDate: dynamicData?.expiryDate || '',
      amount: dynamicData?.amount || '',
    };

    const processedSubject = interpolateTemplateVars(emailTemplate.subject, normalizedData);
    const processedBody = interpolateTemplateVars(emailTemplate.body, normalizedData);

    const pdfBuffer = await generateTemplatePdfBuffer({
      subject: processedSubject,
      body: processedBody,
      customerName: normalizedData.customerName,
      contactPerson: normalizedData.contactPerson,
      phone: normalizedData.phone,
      email: normalizedData.email,
      product: normalizedData.product,
      serialNo: normalizedData.serialNo,
      release: normalizedData.release,
      startDate: normalizedData.startDate,
      expiryDate: normalizedData.expiryDate,
      amount: normalizedData.amount,
      dynamicData: normalizedData,
      settings,
      defaultTemplate: defaultProposalTemplate,
      headerImage: emailTemplate.headerImage || (emailTemplate as any).templateImage || '',
      footerImage: emailTemplate.footerImage || (emailTemplate as any).templateFooterImage || '',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${(emailTemplate.name || 'Notice').replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to generate PDF preview: ${err.message}` });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = normalizeCustomerPayload({ ...req.body });
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    if (files?.avatar?.[0]) payload.avatar = buildUploadUrl('avatars', files.avatar[0].filename);
    if (files?.agreementCopy?.[0]) payload.agreementCopy = buildUploadUrl('agreements', files.agreementCopy[0].filename);

    const branchInfo = payload.branchInfo as Record<string, unknown> | undefined;
    const isBranch = branchInfo?.isBranch === true;
    const parentCompanyId = typeof branchInfo?.parentCompanyId === 'string' ? branchInfo.parentCompanyId : '';
    if (isBranch && !parentCompanyId) {
      res.status(400).json({ success: false, message: 'Parent company is required for branch customers.' });
      return;
    }
    if (isBranch && parentCompanyId) {
      const parent = await Customer.findOne({ _id: parentCompanyId, isActive: true }).select('name companyInfo.customerName');
      if (!parent) {
        res.status(400).json({ success: false, message: 'Selected parent company was not found.' });
        return;
      }
      if (!(payload.companyInfo as Record<string, unknown> | undefined)?.groupOfCompany) {
        payload.companyInfo = {
          ...(payload.companyInfo as Record<string, unknown> || {}),
          groupOfCompany: parent.companyInfo?.customerName || parent.name,
        };
      }
    }

    if (payload.phone) {
      if (!hasPhoneDigits(String(payload.phone))) {
        payload.phone = '';
      } else if (!validatePhoneNumber(String(payload.phone))) {
        res.status(400).json({
          success: false,
          message: `Invalid phone format or length for the provided country code.`,
        });
        return;
      } else {
        payload.phone = normalizePhone(String(payload.phone));
      }
    }
    
    const customer = await Customer.create({ ...payload, createdBy: req.user?._id });
    invalidateCustomerCaches();
    res.status(201).json({ success: true, data: customer });
  } catch (err: unknown) {
    const formatted = formatErrorMessage(err, 'Failed to create customer. Please check your inputs.');
    res.status(formatted.statusCode).json({ success: false, message: formatted.message });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = normalizeCustomerPayload({ ...req.body }, true);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    if (files?.avatar?.[0]) payload.avatar = buildUploadUrl('avatars', files.avatar[0].filename);
    if (files?.agreementCopy?.[0]) payload.agreementCopy = buildUploadUrl('agreements', files.agreementCopy[0].filename);

    const branchInfo = payload.branchInfo as Record<string, unknown> | undefined;
    const isBranch = branchInfo?.isBranch === true;
    const parentCompanyId = typeof branchInfo?.parentCompanyId === 'string' ? branchInfo.parentCompanyId : '';
    if (isBranch && !parentCompanyId) {
      res.status(400).json({ success: false, message: 'Parent company is required for branch customers.' });
      return;
    }
    if (isBranch && parentCompanyId) {
      if (String(parentCompanyId) === String(req.params.id)) {
        res.status(400).json({ success: false, message: 'A branch cannot be its own parent company.' });
        return;
      }
      const parent = await Customer.findOne({ _id: parentCompanyId, isActive: true }).select('name companyInfo.customerName');
      if (!parent) {
        res.status(400).json({ success: false, message: 'Selected parent company was not found.' });
        return;
      }
      if (!(payload.companyInfo as Record<string, unknown> | undefined)?.groupOfCompany) {
        payload.companyInfo = {
          ...(payload.companyInfo as Record<string, unknown> || {}),
          groupOfCompany: parent.companyInfo?.customerName || parent.name,
        };
      }
    }

    if (typeof payload.phone === 'string' && payload.phone.trim()) {
      if (!hasPhoneDigits(payload.phone)) {
        payload.phone = '';
      } else if (!validatePhoneNumber(payload.phone)) {
        res.status(400).json({
          success: false,
          message: `Invalid phone format or length for the provided country code.`,
        });
        return;
      } else {
        payload.phone = normalizePhone(payload.phone);
      }
    }

    // Never let the client set these directly: isActive is managed by the
    // soft-delete/cascade flow, and createdBy is the ownership anchor.
    delete (payload as Record<string, unknown>).isActive;
    delete (payload as Record<string, unknown>).createdBy;
    delete (payload as Record<string, unknown>).customerNumber;

    let existing: any = null;
    try {
      const existingRes = Customer.findById(req.params.id);
      existing = (existingRes && typeof (existingRes as any).select === 'function')
        ? await (existingRes as any).select('services name address contact phone email tssDetails tdlDetails cloudDetails amcDetails').lean()
        : await existingRes;
    } catch {
      existing = null;
    }

    const syncName = String(payload.name || existing?.name || '').trim();
    const syncAddress = String(payload.address || existing?.address || '').trim();
    const syncContact = String(payload.contact || existing?.contact || '').trim();
    const syncPhone = String(payload.phone || existing?.phone || '').trim();
    const syncEmail = String(payload.email || existing?.email || '').trim();

    // If payload does not include module details, but existing customer has them, cascade contact/email/phone
    if (!payload.tssDetails && existing?.tssDetails) {
      payload.tssDetails = {
        ...((existing.tssDetails as any).toObject ? (existing.tssDetails as any).toObject() : existing.tssDetails),
        companyName: syncName,
        address: syncAddress,
        contactPerson: syncContact,
        mobile: syncPhone,
        email: syncEmail,
      };
    }
    if (!payload.tdlDetails && existing?.tdlDetails) {
      payload.tdlDetails = {
        ...((existing.tdlDetails as any).toObject ? (existing.tdlDetails as any).toObject() : existing.tdlDetails),
        companyName: syncName,
        address: syncAddress,
        contactPerson: syncContact,
        mobile: syncPhone,
        email: syncEmail,
      };
    }
    if (!payload.cloudDetails && existing?.cloudDetails) {
      payload.cloudDetails = {
        ...((existing.cloudDetails as any).toObject ? (existing.cloudDetails as any).toObject() : existing.cloudDetails),
        companyName: syncName,
        address: syncAddress,
        contactPerson: syncContact,
        mobile: syncPhone,
        email: syncEmail,
      };
    }
    if (!payload.amcDetails && existing?.amcDetails) {
      payload.amcDetails = {
        ...((existing.amcDetails as any).toObject ? (existing.amcDetails as any).toObject() : existing.amcDetails),
        companyName: syncName,
        address: syncAddress,
        contactPerson: syncContact,
        mobile: syncPhone,
        email: syncEmail,
      };
    }

    // Sync module updates (TDL, TSS, Cloud) into customer.services if services was not explicitly passed
    const hasModuleUpdates = Boolean(payload.tdlDetails || payload.cloudDetails || payload.tssDetails);
    if (!payload.services && (hasModuleUpdates || (existing?.services && existing.services.length > 0))) {
      let updatedServices = [...(existing?.services || [])];
      if (payload.tdlDetails) {
        const tdlData = payload.tdlDetails as Record<string, any>;
        const idx = updatedServices.findIndex((s: any) => s.type === 'tdl');
        const tdlItem = {
          ...(idx >= 0 ? updatedServices[idx] : {}),
          type: 'tdl' as const,
          quantity: Number((idx >= 0 ? (updatedServices[idx] as any)?.quantity : undefined) || 1),
          status: tdlData.status || 'active',
          companyType: tdlData.companyType || 'head_office',
          companyName: tdlData.companyName || syncName,
          address: tdlData.address || syncAddress,
          contactPerson: tdlData.contactPerson || syncContact,
          mobile: tdlData.mobile || syncPhone,
          email: tdlData.email || syncEmail,
          details: tdlData.details,
          product: tdlData.product,
          releaseVersion: tdlData.release || tdlData.releaseVersion,
          licenseSerialNo: tdlData.licenseSerialNo,
          salesman1: tdlData.salesman1,
          salesman2: tdlData.salesman2,
          vendorCategory: tdlData.vendorCategory,
          startDate: tdlData.startDate,
          endDate: tdlData.endDate,
          actualPrice: tdlData.actualPrice,
          discount: tdlData.discount,
          currentPrice: tdlData.currentPrice,
          advance1: tdlData.advance1,
          advance2: tdlData.advance2,
          remainingTotal: tdlData.remainingTotal,
          others: tdlData.others,
          noOfDays: tdlData.noOfDays ?? tdlData.days,
        };
        if (idx >= 0) {
          updatedServices[idx] = tdlItem;
        } else {
          updatedServices.push(tdlItem);
        }
      }
      if (payload.cloudDetails) {
        const cloudData = payload.cloudDetails as Record<string, any>;
        const idx = updatedServices.findIndex((s: any) => s.type === 'cloud');
        const cloudItem = {
          ...(idx >= 0 ? updatedServices[idx] : {}),
          type: 'cloud' as const,
          quantity: Number((idx >= 0 ? (updatedServices[idx] as any)?.quantity : undefined) || 1),
          status: cloudData.status || 'active',
          companyType: cloudData.companyType || 'head_office',
          companyName: cloudData.companyName || syncName,
          address: cloudData.address || syncAddress,
          contactPerson: cloudData.contactPerson || syncContact,
          mobile: cloudData.mobile || syncPhone,
          email: cloudData.email || syncEmail,
          vendor: cloudData.vendor,
          vendorCategory: cloudData.vendorCategory || cloudData.vendor,
          domainLinkSubId: cloudData.domainLinkSubId,
          noOfUsers: cloudData.noOfUsers,
          product: cloudData.product,
          release: cloudData.release,
          startDate: cloudData.startDate,
          endDate: cloudData.endDate,
          actualPrice: cloudData.actualPrice,
          discount: cloudData.discount,
          currentPrice: cloudData.currentPrice,
          advance1: cloudData.advance1,
          advance2: cloudData.advance2,
          remainingTotal: cloudData.remainingTotal,
        };
        if (idx >= 0) {
          updatedServices[idx] = cloudItem;
        } else {
          updatedServices.push(cloudItem);
        }
      }
      if (payload.tssDetails) {
        const tssData = payload.tssDetails as Record<string, any>;
        const idx = updatedServices.findIndex((s: any) => s.type === 'tss');
        const tssItem = {
          ...(idx >= 0 ? updatedServices[idx] : {}),
          type: 'tss' as const,
          quantity: Number((idx >= 0 ? (updatedServices[idx] as any)?.quantity : undefined) || 1),
          status: tssData.status || 'active',
          companyType: tssData.companyType || 'head_office',
          companyName: tssData.companyName || syncName,
          address: tssData.address || syncAddress,
          contactPerson: tssData.contactPerson || syncContact,
          mobile: tssData.mobile || syncPhone,
          email: tssData.email || syncEmail,
          vendorCategory: tssData.vendorCategory,
          details: tssData.details,
          product: tssData.product,
          licenseSerialNo: tssData.licenseSerialNo,
          startDate: tssData.startDate,
          endDate: tssData.endDate,
          actualPrice: tssData.actualPrice,
          discount: tssData.discount,
          currentPrice: tssData.currentPrice,
          advance1: tssData.advance1,
          advance2: tssData.advance2,
          remainingTotal: tssData.remainingTotal,
        };
        if (idx >= 0) {
          updatedServices[idx] = tssItem;
        } else {
          updatedServices.push(tssItem);
        }
      }
      // Ensure any existing services in the customer record inherit updated contact details
      updatedServices = updatedServices.map((srv: any) => ({
        ...srv,
        companyName: syncName || srv.companyName,
        address: syncAddress || srv.address,
        contactPerson: syncContact || srv.contactPerson,
        mobile: syncPhone || srv.mobile,
        email: syncEmail || srv.email,
      }));
      payload.services = updatedServices;
    }

    const filter: Record<string, unknown> = { _id: req.params.id };
    const customer = await Customer.findOneAndUpdate(filter, payload, { new: true, runValidators: true });
    if (!customer) { res.status(404).json({ success: false, message: 'Customer not found' }); return; }

    // Keep standalone AMC records synchronized with customer AMC details
    try {
      const customerExpiry =
        customer.amcExpiry ||
        (customer.amcDetails as any)?.endDate ||
        (Array.isArray(customer.serialNoInfo) ? customer.serialNoInfo[0]?.endDate : undefined);
      if (customerExpiry) {
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expDate = new Date(customerExpiry);
        const computedStatus =
          Number.isNaN(expDate.getTime()) ? 'expired' : expDate < now ? 'expired' : expDate <= soon ? 'expiring' : 'active';
        await AMC.updateMany(
          { customer: customer._id },
          {
            $set: {
              expiryDate: expDate,
              status: computedStatus,
              ...(customer.amcDetails?.startDate ? { startDate: customer.amcDetails.startDate } : {}),
            },
          }
        );
      }
    } catch {
      // Best effort background sync
    }

    invalidateCustomerCaches();
    res.status(200).json({ success: true, data: customer });
  } catch (err: unknown) {
    const formatted = formatErrorMessage(err, 'Failed to update customer. Please check your inputs.');
    res.status(formatted.statusCode).json({ success: false, message: formatted.message });
  }
};

export const deleteCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.params.id;

    // Verify existence + ownership first (without deleting yet).
    const customerFilter: Record<string, unknown> = { _id: customerId };
    const customer = await Customer.findOne(customerFilter).select('_id');
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    // Cascade-delete linked records BEFORE removing the customer, so a cascade
    // failure leaves the (retryable) customer intact rather than orphaned records.
    await Promise.all([
      Call.deleteMany({ customer: customerId }),
      AMC.deleteMany({ customer: customerId }),
      Ticket.deleteMany({ customer: customerId }),
      Payment.deleteMany({ customer: customerId }),
      Proposal.deleteMany({ customer: customerId })
    ]);
    await Customer.deleteOne({ _id: customerId });
    invalidateCustomerCaches();

    res.status(200).json({ success: true, message: 'Customer and all associated records permanently removed' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error during cascading deletion' });
  }
};

export const getCustomerStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDaySoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);
    const accessFilter = {};

    let dateFilterClause: any = null;
    if (startDate && endDate) {
      const sDate = new Date(String(startDate));
      sDate.setHours(0, 0, 0, 0);
      const eDate = new Date(String(endDate));
      eDate.setHours(23, 59, 59, 999);

      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
        dateFilterClause = {
          $or: [
            { createdAt: { $gte: sDate, $lte: eDate } },
            { amcExpiry: { $gte: sDate, $lte: eDate } },
            { 'services.endDate': { $gte: sDate, $lte: eDate } },
            { 'serialNoInfo.endDate': { $gte: sDate, $lte: eDate } },
            { 'serialNoInfo.tssExpiryDate': { $gte: sDate, $lte: eDate } },
            { 'tssDetails.endDate': { $gte: sDate, $lte: eDate } },
            { 'tdlDetails.endDate': { $gte: sDate, $lte: eDate } },
            { 'cloudDetails.endDate': { $gte: sDate, $lte: eDate } },
            { 'cloudDetails.cloudExpiryDate': { $gte: sDate, $lte: eDate } },
          ],
        };
      }
    }

    const buildFilter = (filter: any) => {
      if (!dateFilterClause) return filter;
      return { $and: [filter, dateFilterClause] };
    };

    const [total, active, expiring, expired, tdlEnabled, cloudEnabled, tssActive, amcExpiringSoon, amcOverdue] = await Promise.all([
      Customer.countDocuments(buildFilter({ ...accessFilter, isActive: true })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { amcStatus: 'active' },
          { amcExpiry: { $gt: endOfDaySoon } },
          { 'amcDetails.endDate': { $gt: endOfDaySoon } },
          { services: { $elemMatch: { type: 'amc', $or: [{ status: 'active' }, { endDate: { $gt: endOfDaySoon } }, { tssExpiryDate: { $gt: endOfDaySoon } }] } } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { amcStatus: 'expiring' },
          { amcExpiry: { $gte: startOfToday, $lte: endOfDaySoon } },
          { 'amcDetails.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
          { services: { $elemMatch: { type: 'amc', $or: [{ status: 'expiring' }, { endDate: { $gte: startOfToday, $lte: endOfDaySoon } }, { tssExpiryDate: { $gte: startOfToday, $lte: endOfDaySoon } }] } } },
          { 'serialNoInfo.tssExpiryDate': { $gte: startOfToday, $lte: endOfDaySoon } },
          { 'serialNoInfo.endDate': { $gte: startOfToday, $lte: endOfDaySoon } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { amcStatus: 'expired' },
          { amcExpiry: { $lt: startOfToday } },
          { 'amcDetails.endDate': { $lt: startOfToday } },
          { services: { $elemMatch: { type: 'amc', $or: [{ status: 'expired' }, { endDate: { $lt: startOfToday } }, { tssExpiryDate: { $lt: startOfToday } }] } } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { services: { $elemMatch: { type: 'tdl', status: { $nin: ['none', 'expired'] } } } },
          { 'serialNoInfo.tdlEnabled': true },
          { 'serialNoInfo.isTdl': true },
          { 'tdlDetails.status': 'active' },
          { 'tdlDetails.status': 'expiring' },
          { 'tdlDetails.status': 'trial' },
          { 'tdlDetails.actualPrice': { $gt: 0 } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { services: { $elemMatch: { type: 'cloud', status: { $nin: ['none', 'expired'] } } } },
          { 'cloudDetails.status': 'active' },
          { 'cloudDetails.status': 'expiring' },
          { 'cloudDetails.status': 'trial' },
          { 'cloudDetails.vendor': { $exists: true, $ne: null } },
          { 'cloudDetails.users.0': { $exists: true } },
          { 'cloudDetails.actualPrice': { $gt: 0 } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        $or: [
          { services: { $elemMatch: { type: 'tss', status: { $nin: ['none', 'expired'] } } } },
          { 'serialNoInfo.tssExpiryDate': { $exists: true, $ne: null } },
          { 'tssDetails.status': 'active' },
          { 'tssDetails.status': 'expiring' },
          { 'tssDetails.actualPrice': { $gt: 0 } },
        ],
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        amcStatus: { $in: ['expiring', 'expired'] },
        amcExpiry: { $gte: now, $lte: soon },
      })),
      Customer.countDocuments(buildFilter({
        ...accessFilter,
        isActive: true,
        amcStatus: 'expired',
        amcExpiry: { $lt: now },
      })),
    ]);
    res.status(200).json({
      success: true,
      data: {
        total,
        active,
        expiring,
        expired,
        tdlEnabled,
        cloudEnabled,
        tssActive,
        amcExpiringSoon,
        amcOverdue,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getCustomerManagementInsights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = startDate && endDate ? `${startDate}_${endDate}` : 'all';
    const cached = customerInsightsCacheMap.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CUSTOMER_CACHE_TTL)) {
      res.status(200).json(cached.data);
      return;
    }

    const hasDateRange = !!(startDate && endDate);
    const sDate = hasDateRange ? new Date(String(startDate)) : null;
    if (sDate) sDate.setHours(0, 0, 0, 0);
    const eDate = hasDateRange ? new Date(String(endDate)) : null;
    if (eDate) eDate.setHours(23, 59, 59, 999);
    const isDateValid = !!(sDate && eDate && !isNaN(sDate.getTime()) && !isNaN(eDate.getTime()));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDaySoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59, 999);

    const filter = { isActive: true };
    const docs = await Customer.find(filter)
      .select('name customerNumber amcStatus amcExpiry serialNoInfo tdlDetails cloudDetails tssDetails services updatedAt avatar phone primaryContactInfo companyInfo branchInfo address products createdAt')
      .sort({ _id: 1 })
      .lean();

    const getTdlExpiry = (c: any) => {
      const tdlService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'tdl' || s.isTdl || s.tdlEnabled) : null;
      const p0 = Array.isArray(c.serialNoInfo) ? c.serialNoInfo.find((p: any) => p.tdlEnabled || p.isTdl) || c.serialNoInfo[0] : c.serialNoInfo;
      return tdlService?.endDate || c.tdlDetails?.endDate || c.tdlDetails?.expiryDate || p0?.tdlExpiryDate || p0?.endDate;
    };
    const getTdlStartDate = (c: any) => {
      const tdlService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'tdl' || s.isTdl || s.tdlEnabled) : null;
      const p0 = Array.isArray(c.serialNoInfo) ? c.serialNoInfo.find((p: any) => p.tdlEnabled || p.isTdl) || c.serialNoInfo[0] : c.serialNoInfo;
      return tdlService?.startDate || c.tdlDetails?.startDate || p0?.startDate;
    };

    const getCloudExpiry = (c: any) => {
      const cloudService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'cloud') : null;
      return cloudService?.endDate || c.cloudDetails?.cloudExpiryDate || c.cloudDetails?.endDate || c.cloudDetails?.expiryDate;
    };
    const getCloudStartDate = (c: any) => {
      const cloudService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'cloud') : null;
      return cloudService?.startDate || c.cloudDetails?.cloudStartDate || c.cloudDetails?.startDate;
    };

    const getTssExpiry = (c: any) => {
      const tssService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'tss') : null;
      const p0 = Array.isArray(c.serialNoInfo) ? c.serialNoInfo[0] : c.serialNoInfo;
      return tssService?.endDate || (tssService as any)?.tssExpiryDate || p0?.tssExpiryDate || p0?.endDate || c.tssDetails?.endDate || c.tssDetails?.expiryDate;
    };
    const getTssStartDate = (c: any) => {
      const tssService = Array.isArray(c.services) ? c.services.find((s: any) => s.type === 'tss') : null;
      const p0 = Array.isArray(c.serialNoInfo) ? c.serialNoInfo[0] : c.serialNoInfo;
      return tssService?.startDate || p0?.startDate || c.tssDetails?.startDate;
    };

    // ─── TDL KPI & Rows ───
    const tdlCustomers = docs.filter(hasTDL);
    let filteredTdl = tdlCustomers;
    let tdlExpiringCount = 0;
    let tdlExpiredCount = 0;
    let tdlActiveCount = 0;

    if (isDateValid && sDate && eDate) {
      filteredTdl = tdlCustomers.filter((c: any) => {
        const exp = parseDate(getTdlExpiry(c));
        return exp && exp >= sDate && exp <= eDate;
      });

      tdlActiveCount = filteredTdl.filter((c: any) => {
        const exp = parseDate(getTdlExpiry(c));
        return exp && exp >= startOfToday;
      }).length;

      tdlExpiringCount = filteredTdl.filter((c: any) => {
        const exp = parseDate(getTdlExpiry(c));
        const d = daysUntilNullable(getTdlExpiry(c), getTdlStartDate(c));
        return exp && exp >= startOfToday && d !== null && d >= 0 && d <= 30;
      }).length;

      tdlExpiredCount = filteredTdl.filter((c: any) => {
        const exp = parseDate(getTdlExpiry(c));
        return exp && exp < startOfToday;
      }).length;
    } else {
      tdlExpiringCount = tdlCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTdlExpiry(c), getTdlStartDate(c));
        return d !== null && d >= 0 && d <= 30;
      }).length;

      tdlExpiredCount = tdlCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTdlExpiry(c), getTdlStartDate(c));
        return d !== null && d < 0;
      }).length;

      tdlActiveCount = tdlCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTdlExpiry(c), getTdlStartDate(c));
        return d !== null && d >= 0;
      }).length;
    }

    const tdlKpi = {
      total: isDateValid ? filteredTdl.length : tdlCustomers.length,
      active: tdlActiveCount,
      trial: tdlCustomers.filter((c: any) => c.tdlDetails?.status === 'trial').length,
      expiring: tdlExpiringCount,
      expired: tdlExpiredCount,
    };
    const tdlRadarRows = sortByDaysAsc(
      (isDateValid ? filteredTdl : tdlCustomers)
        .map((c: any) => {
          const expiry = getTdlExpiry(c);
          return { customer: c, days: daysUntilNullable(expiry, getTdlStartDate(c)) };
        })
        .filter((r) => r.days !== null)
    ).slice(0, 50);
    const tdlRecentRows = sortByUpdatedDesc(filteredTdl).slice(0, 6);

    // ─── Cloud KPI & Rows ───
    const cloudCustomers = docs.filter(hasCloud);
    let filteredCloud = cloudCustomers;
    let cloudExpiringCount = 0;
    let cloudExpiredCount = 0;
    let cloudActiveCount = 0;

    if (isDateValid && sDate && eDate) {
      filteredCloud = cloudCustomers.filter((c: any) => {
        const exp = parseDate(getCloudExpiry(c));
        return exp && exp >= sDate && exp <= eDate;
      });

      cloudActiveCount = filteredCloud.filter((c: any) => {
        const exp = parseDate(getCloudExpiry(c));
        return exp && exp >= startOfToday;
      }).length;

      cloudExpiringCount = filteredCloud.filter((c: any) => {
        const exp = parseDate(getCloudExpiry(c));
        const d = daysUntilNullable(getCloudExpiry(c), getCloudStartDate(c));
        return exp && exp >= startOfToday && d !== null && d >= 0 && d <= 30;
      }).length;

      cloudExpiredCount = filteredCloud.filter((c: any) => {
        const exp = parseDate(getCloudExpiry(c));
        return exp && exp < startOfToday;
      }).length;
    } else {
      cloudExpiringCount = cloudCustomers.filter((c: any) => {
        const d = daysUntilNullable(getCloudExpiry(c), getCloudStartDate(c));
        return d !== null && d >= 0 && d <= 30;
      }).length;

      cloudExpiredCount = cloudCustomers.filter((c: any) => {
        const d = daysUntilNullable(getCloudExpiry(c), getCloudStartDate(c));
        return d !== null && d < 0;
      }).length;

      cloudActiveCount = cloudCustomers.filter((c: any) => {
        const d = daysUntilNullable(getCloudExpiry(c), getCloudStartDate(c));
        return d !== null && d >= 0;
      }).length;
    }

    const cloudKpi = {
      total: isDateValid ? filteredCloud.length : cloudCustomers.length,
      totalUsers: (isDateValid ? filteredCloud : cloudCustomers).reduce((sum, c) => sum + (c.cloudDetails?.users?.length || c.cloudDetails?.noOfUsers || 1), 0),
      active: cloudActiveCount,
      expiring: cloudExpiringCount,
      expired: cloudExpiredCount,
    };
    const cloudRadarRows = sortByDaysAsc(
      (isDateValid ? filteredCloud : cloudCustomers)
        .map((c: any) => {
          const expiry = getCloudExpiry(c);
          return { customer: c, days: daysUntilNullable(expiry, getCloudStartDate(c)) };
        })
        .filter((r) => r.days !== null)
    ).slice(0, 50);
    const cloudRecentRows = sortByUpdatedDesc(filteredCloud).slice(0, 6);

    // ─── TSS KPI & Rows ───
    const tssCustomers = docs.filter(hasTSS);
    let filteredTss = tssCustomers;
    let tssActiveCount = 0;
    let tssExpiringCount = 0;
    let tssExpiredCount = 0;
    let tssRenewalDueCount = 0;

    if (isDateValid && sDate && eDate) {
      filteredTss = tssCustomers.filter((c: any) => {
        const exp = parseDate(getTssExpiry(c));
        return exp && exp >= sDate && exp <= eDate;
      });

      tssActiveCount = filteredTss.filter((c: any) => {
        const exp = parseDate(getTssExpiry(c));
        return exp && exp >= startOfToday;
      }).length;

      tssExpiringCount = filteredTss.filter((c: any) => {
        const exp = parseDate(getTssExpiry(c));
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return exp && exp >= startOfToday && d !== null && d >= 0 && d <= 30;
      }).length;

      tssExpiredCount = filteredTss.filter((c: any) => {
        const exp = parseDate(getTssExpiry(c));
        return exp && exp < startOfToday;
      }).length;

      tssRenewalDueCount = filteredTss.filter((c: any) => {
        const exp = parseDate(getTssExpiry(c));
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return exp && exp >= startOfToday && d !== null && d >= 0 && d <= 15;
      }).length;
    } else {
      tssActiveCount = tssCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return d !== null && d >= 0;
      }).length;

      tssExpiringCount = tssCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return d !== null && d >= 0 && d <= 30;
      }).length;

      tssExpiredCount = tssCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return d !== null && d < 0;
      }).length;

      tssRenewalDueCount = tssCustomers.filter((c: any) => {
        const d = daysUntilNullable(getTssExpiry(c), getTssStartDate(c));
        return d !== null && d >= 0 && d <= 15;
      }).length;
    }

    const tssKpi = {
      total: isDateValid ? filteredTss.length : tssCustomers.length,
      active: tssActiveCount,
      expiring: tssExpiringCount,
      expired: tssExpiredCount,
      renewalDue: tssRenewalDueCount,
    };
    const tssRadarRows = sortByDaysAsc(
      (isDateValid ? filteredTss : tssCustomers)
        .map((c: any) => {
          return { customer: c, days: daysUntilNullable(getTssExpiry(c), getTssStartDate(c)) };
        })
        .filter((r) => r.days !== null)
    ).slice(0, 50);
    const tssRecentRows = sortByUpdatedDesc(filteredTss).slice(0, 6);

    // ─── Customer Master KPI & Alerts ───
    const customerKpi = {
      total: isDateValid ? (new Set([...filteredTdl, ...filteredCloud, ...filteredTss].map((c: any) => String(c._id)))).size : docs.length,
      amcActive: docs.filter((c) => c.amcStatus === 'active').length,
      tdl: tdlKpi.total,
      cloud: cloudKpi.total,
      tss: tssKpi.total,
    };
    const customerHealthScore = customerKpi.total
      ? Math.round(((customerKpi.amcActive + customerKpi.tdl + customerKpi.cloud + customerKpi.tss) / (customerKpi.total * 4)) * 100)
      : 0;

    const allCustomerAlerts = docs
      .filter((c) => c.amcStatus === 'expiring' || c.amcStatus === 'expired')
      .map((c) => ({ customer: c, days: daysUntilNullable(c.amcExpiry, c.amcDetails?.startDate) }));
    const customerAlertRows = sortByDaysAsc(allCustomerAlerts).slice(0, 50);
    const customerRecentRows = sortByUpdatedDesc(docs).slice(0, 6);
    const lastUpdated = customerRecentRows.length ? (customerRecentRows[0] as any).updatedAt : null;

    const tdlRenewals = docs
      .flatMap((c) =>
        (c.tdlDetails?.renewalHistory || []).map((rh: any) => {
          const doc = c as any;
          const tdlService = Array.isArray(doc.services) ? doc.services.find((s: any) => s.type === 'tdl') : null;
          const primarySerial = Array.isArray(doc.serialNoInfo) ? doc.serialNoInfo[0] : doc.serialNoInfo;
          return {
            ...rh,
            customerName: doc.name,
            customerId: doc._id,
            logo: doc.avatar,
            mobileNo: doc.phone || doc.primaryContactInfo?.mobile,
            locationArea: doc.companyInfo?.locationArea || doc.branchInfo?.branchName || doc.tdlDetails?.address || doc.address || doc.companyInfo?.fullAddress,
            salesman1: doc.tdlDetails?.salesman1,
            salesman2: doc.tdlDetails?.salesman2,
            product: tdlService?.product || primarySerial?.product || doc.products?.[0],
            release: tdlService?.release || tdlService?.releaseVersion || primarySerial?.releaseVersion || doc.companyInfo?.releaseVersion,
            licenseSerialNo: doc.tdlDetails?.licenseSerialNo || primarySerial?.tdlSerialNo || primarySerial?.tdlSerialNos?.[0]?.serialNo || primarySerial?.licenses?.[0]?.licenceSerialNo,
            tdlStatus: doc.tdlDetails?.status,
            noOfDays: doc.tdlDetails?.noOfDays || doc.tdlDetails?.days,
            startDate: doc.tdlDetails?.startDate,
            endDate: doc.tdlDetails?.endDate,
            branchName: branchNameOf(doc),
          };
        })
      )
      .sort((a, b) => (parseDate(b.renewedOn)?.getTime() || 0) - (parseDate(a.renewedOn)?.getTime() || 0));

    const cloudRenewals = docs
      .flatMap((c) =>
        (c.cloudDetails?.renewalHistory || []).map((rh: any) => {
          const doc = c as any;
          const cloudService = Array.isArray(doc.services) ? doc.services.find((s: any) => s.type === 'cloud') : null;
          return {
            ...rh,
            customerName: doc.name,
            customerId: doc._id,
            logo: doc.avatar,
            companyName: doc.cloudDetails?.companyName || doc.name,
            product: cloudService?.product || doc.cloudDetails?.vendorCategory || doc.cloudDetails?.vendor || doc.products?.[0],
            release: cloudService?.release || cloudService?.releaseVersion || doc.cloudDetails?.release || doc.companyInfo?.releaseVersion,
            domainLinkSubId: cloudService?.domainLinkSubId || doc.cloudDetails?.domainLinkSubId,
            noOfUsers: cloudService?.noOfUsers || cloudService?.users?.length || doc.cloudDetails?.noOfUsers || doc.cloudDetails?.users?.length,
            cloudStartDate: cloudService?.startDate || doc.cloudDetails?.cloudStartDate || doc.cloudDetails?.startDate,
            cloudExpiryDate: cloudService?.endDate || doc.cloudDetails?.cloudExpiryDate || doc.cloudDetails?.endDate,
            branchName: branchNameOf(doc),
          };
        })
      )
      .sort((a, b) => (parseDate(b.renewedOn)?.getTime() || 0) - (parseDate(a.renewedOn)?.getTime() || 0));

    const tssRenewals = docs
      .flatMap((c) =>
        (c.tssDetails?.renewalHistory || []).map((rh: any) => {
          const doc = c as any;
          const tssService = Array.isArray(doc.services) ? doc.services.find((s: any) => s.type === 'tss') : null;
          const primarySerial = Array.isArray(doc.serialNoInfo) ? doc.serialNoInfo[0] : doc.serialNoInfo;
          return {
            ...rh,
            customerName: doc.name,
            customerId: doc._id,
            logo: doc.avatar,
            companyName: doc.tssDetails?.companyName || doc.name,
            product: tssService?.product || primarySerial?.product || doc.products?.[0],
            release: tssService?.release || tssService?.releaseVersion || primarySerial?.releaseVersion || doc.companyInfo?.releaseVersion,
            licenseSerialNo: doc.tssDetails?.licenseSerialNo || primarySerial?.licenseSerialNo || primarySerial?.licenses?.[0]?.licenceSerialNo || doc.licenseSerialNo,
            tssExpiryDate: tssService?.endDate || primarySerial?.tssExpiryDate || primarySerial?.endDate || doc.tssDetails?.endDate,
            contactPerson: doc.tssDetails?.contactPerson || doc.primaryContactInfo?.contactName1 || doc.contact,
            mobile: doc.tssDetails?.mobile || doc.primaryContactInfo?.mobile || doc.phone,
            email: doc.tssDetails?.email || doc.primaryContactInfo?.email || doc.email,
            status: doc.tssDetails?.status || primarySerial?.licenceStatus || primarySerial?.licenses?.[0]?.licenceStatus,
            branchName: branchNameOf(doc),
          };
        })
      )
      .sort((a, b) => (parseDate(b.renewedOn)?.getTime() || 0) - (parseDate(a.renewedOn)?.getTime() || 0));

    const tdlHistory = buildHistorySummary(tdlCustomers, tdlRenewals);
    const cloudHistory = buildHistorySummary(cloudCustomers, cloudRenewals);
    const tssHistory = buildHistorySummary(tssCustomers, tssRenewals);

    const payload = {
      success: true,
      data: {
        customerDashboard: {
          kpi: { ...customerKpi, healthScore: customerHealthScore },
          totalExpiring: allCustomerAlerts.filter((r) => (r.days ?? 999999) >= 0).length,
          totalOverdue: allCustomerAlerts.filter((r) => (r.days ?? 0) < 0).length,
          lastUpdated,
          alertRows: customerAlertRows,
          recentRows: customerRecentRows,
        },
        tdlDashboard: {
          kpi: tdlKpi,
          radarRows: tdlRadarRows,
          recentRows: tdlRecentRows,
        },
        cloudDashboard: {
          kpi: cloudKpi,
          radarRows: cloudRadarRows,
          recentRows: cloudRecentRows,
        },
        tssDashboard: {
          kpi: tssKpi,
          radarRows: tssRadarRows,
          recentRows: tssRecentRows,
        },
        histories: {
          tdl: { allRenewals: tdlRenewals, ...tdlHistory },
          cloud: { allRenewals: cloudRenewals, ...cloudHistory },
          tss: { allRenewals: tssRenewals, ...tssHistory },
        },
      },
    };

    customerInsightsCacheMap.set(cacheKey, { data: payload, timestamp: Date.now() });
    res.status(200).json(payload);
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
