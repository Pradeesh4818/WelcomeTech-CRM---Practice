import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, Eye, Server, Tag, Building2, Package, Phone, Mail, MapPin, 
  Briefcase, User, CheckCircle, Minus, ShieldCheck, Clock, AlertTriangle, ChevronDown, Download
} from 'lucide-react';
import api from '../../utils/api';
import { Customer, AMCRenewal } from '../../types';
import { Avatar, Badge, Modal, Select, Pagination } from '../../components/ui';
import { ModernDashboardLayout } from '../../components/Dashboard/ModernDashboardLayout';
import { EmailTemplateSelect, EmailTemplateSendButton } from '../../components/email/EmailActionCell';
import { fmt, PAGE_SIZE_OPTIONS, computeServiceStatus, deduplicateAmcEntries, mergeModuleServicesBySerial } from '../../utils/helpers';
import { calculateStartDateFromExpiry } from './CustomerManagementPages';
import { exportExcelWorkbook } from '../../utils/excelExport';
import CustomerWhatsAppAction from '../../components/whatsapp/CustomerWhatsAppAction';
import { useDateFilter } from '../../context/DateFilterContext';

// ─── Types ────────────────────────────────────────

interface SerialRow {
  _customerId: string;
  _serialIdx: number;
  _customer: Customer;
  _registryRow: ProductRegistryRow;
  customerNumber?: string;
  companyName: string;
  avatar?: string;
  customerType: string;
  product: string;
  releaseVersion: string;
  licenceType: string;
  noOfUsers?: number;
  licenseSerialNo: string;
  licenceStatus?: string;
  partnerDetails?: Customer['partnerDetails'];
  startDate?: string;
  tssExpiryDate?: string;
  isServer9?: boolean;
  server9SerialNo?: string;
  server9SerialNos?: Array<{ serialNo?: string }>;
  pricingDetails?: {
    actualPrice?: number;
    discount?: number;
    currentPrice?: number;
    advance1?: number;
    advance2?: number;
    remainingTotal?: number;
  };
  email?: string;
  emailOptions?: string[];
  primaryContactPerson?: string;
  secondaryContactName?: string;
  primaryMobile?: string;
  secondaryMobile?: string;
  landline?: string;
  sourceStatus?: string;
  partnerDetailsText?: string;
  salesman?: string;
  locationArea?: string;
  fullAddress?: string;
  emailId?: string;
  tssPassword?: string;
  website?: string;
  websiteStatus?: string;
  amcStatusText?: string;
  tdlStatusText?: string;
  cloudStatusText?: string;
  tallyLedger?: string;
  group?: string;
}

type ProductRegistryRow = {
  key: string;
  product?: string;
  releaseVersion?: string;
  licenceType?: string;
  noOfUsers?: number;
  licenseSerialNo?: string;
  licenceStatus?: string;
  reference?: string;
  startDate?: string;
  endDate?: string;
  tssExpiryDate?: string;
  isServer9?: boolean;
  server9SerialNo?: string;
  server9SerialNos?: Array<{ serialNo?: string }>;
  tdlSerialNos?: Array<{ serialNo?: string }>;
  amount?: number;
  pricingDetails?: SerialRow['pricingDetails'];
  partnerDetails?: Customer['partnerDetails'];
  status?: string;
  notes?: string;
  renewalHistory?: AMCRenewal[];
};

type ProductService = NonNullable<Customer['services']>[number];

// ─── Helpers ─────────────────────────────────────

const tv = (...vals: unknown[]) => {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '—';
};

const hasPricing = (p?: SerialRow['pricingDetails']) =>
  !!p && Object.values(p).some((v) => v !== undefined && v !== null && v !== 0);

const hasPartner = (p?: Customer['partnerDetails']) => !!p && p.length > 0;

const hasServer9 = (row: SerialRow) =>
  !!row.isServer9 || !!(row.server9SerialNo && row.server9SerialNo !== '—') ||
  !!(row.server9SerialNos && row.server9SerialNos.length > 0);

const cleanText = (value: unknown): string => String(value || '').trim();

const blankText = (value: unknown): string => {
  const text = cleanText(value);
  return text === '—' ? '' : text;
};

const displayText = (value: unknown): string => blankText(value) || '—';

const noteField = (notes: Array<unknown>, label: string): string => {
  const prefix = `${label.toLowerCase()}:`;
  for (const note of notes) {
    const parts = cleanText(note).split('|').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.toLowerCase().startsWith(prefix)) {
        return part.slice(part.indexOf(':') + 1).trim();
      }
    }
  }
  return '';
};

const hasServiceType = (customer: Customer, type: ProductService['type']) =>
  (customer.services || []).some((service) => service.type === type && service.status !== 'none' && service.status !== 'expired');

const partnerDetailsText = (customer: Customer, fallback?: string): string => {
  const partners = (customer.partnerDetails || [])
    .map((partner) => blankText(partner.companyName || partner.fullName || partner.service))
    .filter(Boolean);
  return partners.join(', ') || blankText(fallback);
};

const excelFieldsForCustomer = (customer: Customer, service?: Partial<ProductService>) => {
  const notes = [
    service?.notesRemarks,
    customer.notes,
    customer.amcDetails?.notesRemarks,
    customer.tdlDetails?.notesRemarks,
    customer.cloudDetails?.notesRemarks,
    customer.tssDetails?.notesRemarks,
  ];
  const primaryContact = customer.keyContacts?.[0];
  const secondaryContact = customer.keyContacts?.[1];

  return {
    primaryContactPerson: blankText(service?.contactPerson || customer.primaryContactInfo?.contactName1 || primaryContact?.contactName || customer.contact),
    secondaryContactName: blankText(customer.secondaryContactInfo?.contactName2 || secondaryContact?.contactName),
    primaryMobile: blankText(service?.mobile || customer.primaryContactInfo?.mobile || primaryContact?.mobile || customer.phone),
    secondaryMobile: blankText(customer.secondaryContactInfo?.mobile || secondaryContact?.mobile),
    landline: blankText(customer.primaryContactInfo?.landline || primaryContact?.landline || secondaryContact?.landline),
    sourceStatus: noteField(notes, 'Source status'),
    partnerDetailsText: partnerDetailsText(customer, service?.vendorCategory || customer.amcDetails?.vendorCategory),
    salesman: blankText(service?.salesman1 || customer.amcDetails?.salesman1 || customer.tssDetails?.salesman1 || customer.tdlDetails?.salesman1 || customer.cloudDetails?.salesman1),
    locationArea: blankText(customer.companyInfo?.locationArea),
    fullAddress: blankText(service?.address || customer.companyInfo?.fullAddress || customer.address),
    emailId: blankText(service?.email || customer.email || customer.primaryContactInfo?.email || primaryContact?.email),
    tssPassword: noteField(notes, 'TSS password'),
    website: blankText(customer.companyInfo?.website),
    websiteStatus: blankText(customer.companyInfo?.websiteStatus),
    amcStatusText: noteField(notes, 'AMC status') || blankText(customer.amcStatus),
    tdlStatusText: noteField(notes, 'TDL status') || (hasServiceType(customer, 'tdl') ? 'YES' : 'NO'),
    cloudStatusText: noteField(notes, 'Cloud status') || (hasServiceType(customer, 'cloud') ? 'YES' : 'NO'),
    tallyLedger: noteField(notes, 'Tally ledger'),
    group: blankText(customer.companyInfo?.groupOfCompany || (customer.groupCompanies || []).map((row) => row.name).filter(Boolean).join(', ')),
  };
};

const hasModuleDetail = (details?: Record<string, unknown>): boolean =>
  !!details && Object.values(details).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== undefined && value !== null && String(value).trim() !== '';
  });

const moduleDetailToRegistryRow = (
  details: any,
  type: 'tdl' | 'tss' | 'cloud',
  customer: Customer
): ProductRegistryRow | null => {
  if (!hasModuleDetail(details)) return null;
  return {
    key: `${type}-legacy`,
    product: type === 'tdl' ? 'TDL Add-on' : type === 'tss' ? 'TSS Premium' : details.vendor || 'Cloud Hub',
    licenceType: details.licenceType,
    licenseSerialNo: details.licenseSerialNo,
    reference: type === 'cloud' ? details.domainLinkSubId || details.licenseSerialNo : details.licenseSerialNo,
    startDate: details.startDate || details.cloudStartDate,
    endDate: details.endDate || details.cloudExpiryDate,
    amount: details.currentPrice ?? details.actualPrice ?? details.remainingTotal,
    status: details.status || customer.amcStatus || 'active',
    notes: details.notesRemarks || details.details,
    renewalHistory: details.renewalHistory || [],
  };
};

const productServiceToRegistryRow = (s: ProductService, customer: Customer, idx: number): ProductRegistryRow => ({
  key: s._id || `amc-service-${idx}`,
  product: s.product,
  releaseVersion: s.releaseVersion,
  licenceType: s.licenceType,
  noOfUsers: s.noOfUsers,
  licenseSerialNo: s.licenseSerialNo,
  licenceStatus: s.licenceStatus,
  reference: s.licenseSerialNo,
  startDate: s.startDate,
  endDate: s.endDate,
  tssExpiryDate: s.tssExpiryDate,
  isServer9: s.isServer9,
  server9SerialNos: s.server9SerialNos,
  tdlSerialNos: s.tdlSerialNos,
  amount: s.currentPrice ?? s.amcValue ?? s.actualPrice ?? s.remainingTotal,
  pricingDetails: {
    actualPrice: s.actualPrice,
    discount: s.discount,
    currentPrice: s.currentPrice,
    advance1: s.advance1,
    advance2: s.advance2,
    remainingTotal: s.remainingTotal,
  },
  partnerDetails: customer.partnerDetails,
  status: s.status,
  notes: s.notesRemarks || s.details,
  renewalHistory: s.renewalHistory || [],
});

const serialInfoToRegistryRow = (s: NonNullable<Customer['serialNoInfo']>[number], customer: Customer, idx: number): ProductRegistryRow => ({
  key: `product-legacy-${idx}`,
  product: s.product,
  releaseVersion: s.releaseVersion,
  licenceType: s.licenceType,
  noOfUsers: s.noOfUsers,
  licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
  licenceStatus: s.licenceStatus || s.licenses?.[0]?.licenceStatus,
  reference: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
  startDate: s.startDate,
  endDate: s.endDate || s.tssExpiryDate,
  tssExpiryDate: s.tssExpiryDate,
  isServer9: s.isServer9,
  server9SerialNo: s.server9SerialNo,
  tdlSerialNos: s.tdlSerialNos,
  amount: s.pricingDetails?.currentPrice,
  pricingDetails: s.pricingDetails,
  partnerDetails: customer.partnerDetails,
  status: s.isAmcActive ? 'active' : customer.amcStatus,
  notes: s.notes,
  renewalHistory: [],
});

export const productLicenseRows = (customer: Customer): ProductRegistryRow[] => {
  const amcServices = (customer.services || []).filter((s) => s.type === 'amc');
  const existingAmcSerials = new Set(
    amcServices
      .map((s) => String(s.licenseSerialNo || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const standaloneTssMap = new Map<string, ProductService>();
  (customer.services || [])
    .filter((s) => s.type === 'tss' && s.licenseSerialNo)
    .forEach((s) => {
      const serKey = String(s.licenseSerialNo).trim().toLowerCase();
      if (!existingAmcSerials.has(serKey)) {
        const existing = standaloneTssMap.get(serKey);
        if (!existing) {
          standaloneTssMap.set(serKey, s);
        } else {
          const tNew = new Date(s.endDate || s.tssExpiryDate || 0).getTime();
          const tOld = new Date(existing.endDate || existing.tssExpiryDate || 0).getTime();
          if (tNew > tOld) standaloneTssMap.set(serKey, s);
        }
      }
    });

  const allServices: ProductService[] = [
    ...amcServices,
    ...Array.from(standaloneTssMap.values()).map((tss) => ({
      ...tss,
      type: 'amc' as const,
      isAmcActive: false,
      status: 'none' as const,
      tssExpiryDate: tss.tssExpiryDate || tss.endDate,
    })),
  ];

  if (allServices.length > 0) {
    return allServices.map((s, idx) => productServiceToRegistryRow(s, customer, idx));
  }

  return (customer.serialNoInfo || []).map((s, idx) => serialInfoToRegistryRow(s, customer, idx));
};

export const buildProductListRows = (customers: Customer[]): SerialRow[] => {
  const out: SerialRow[] = [];
  for (const c of customers) {
    const companyName = tv(c.companyInfo?.customerName, c.name);
    const customerType = Array.isArray(c.customerType)
      ? c.customerType.join(', ')
      : tv(c.customerType);
    const serialList = c.serialNoInfo || [];

    // 1. Primary Product & License (AMC) instances
    const amcServices = (c.services || []).filter((service) => service.type === 'amc');

    // 2. Identify standalone TSS licenses whose serial numbers are not in AMC services
    const existingAmcSerials = new Set(
      amcServices
        .map((s) => String(s.licenseSerialNo || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const standaloneTssMap = new Map<string, ProductService>();
    (c.services || [])
      .filter((s) => s.type === 'tss' && s.licenseSerialNo)
      .forEach((s) => {
        const serKey = String(s.licenseSerialNo).trim().toLowerCase();
        if (!existingAmcSerials.has(serKey)) {
          const existing = standaloneTssMap.get(serKey);
          if (!existing) {
            standaloneTssMap.set(serKey, s);
          } else {
            const tNew = new Date(s.endDate || s.tssExpiryDate || 0).getTime();
            const tOld = new Date(existing.endDate || existing.tssExpiryDate || 0).getTime();
            if (tNew > tOld) standaloneTssMap.set(serKey, s);
          }
        }
      });

    // 3. For AMC services, if a TSS service with the same serial has a newer TSS expiry date, reflect it
    const allProductServices: ProductService[] = amcServices.map((service) => {
      const serKey = String(service.licenseSerialNo || '').trim().toLowerCase();
      if (!serKey) return service;
      const matchingTss = (c.services || []).filter(
        (s) => s.type === 'tss' && String(s.licenseSerialNo || '').trim().toLowerCase() === serKey
      );
      if (matchingTss.length === 0) return service;
      let latestTssDate = service.tssExpiryDate || service.endDate;
      matchingTss.forEach((tss) => {
        const d = tss.endDate || tss.tssExpiryDate;
        if (d && (!latestTssDate || new Date(d).getTime() > new Date(latestTssDate).getTime())) {
          latestTssDate = d;
        }
      });
      return {
        ...service,
        tssExpiryDate: latestTssDate,
      };
    });

    // 4. Append standalone TSS licenses as full product license rows
    Array.from(standaloneTssMap.values()).forEach((tss) => {
      allProductServices.push({
        ...tss,
        type: 'amc',
        product: tss.product || c.products?.[0] || 'TallyPrime',
        releaseVersion: tss.releaseVersion || tss.release || c.companyInfo?.releaseVersion || '',
        licenceType: tss.licenceType || c.licenceType || 'Single User (Silver)',
        noOfUsers: tss.noOfUsers ?? c.users ?? 1,
        licenseSerialNo: tss.licenseSerialNo,
        startDate: tss.startDate || c.startDate,
        endDate: tss.endDate || tss.tssExpiryDate,
        tssExpiryDate: tss.tssExpiryDate || tss.endDate,
        licenceStatus: tss.licenceStatus || 'active',
        isAmcActive: false,
        status: 'none',
      });
    });

    if (allProductServices.length > 0) {
      allProductServices.forEach((service, idx) => {
        const registryRow = productServiceToRegistryRow(service, c, idx);
        const excelFields = excelFieldsForCustomer(c, service);
        out.push({
          _customerId: c._id,
          _serialIdx: idx,
          _customer: c,
          _registryRow: registryRow,
          customerNumber: c.customerNumber,
          companyName,
          avatar: c.avatar,
          customerType,
          product: tv(service.product, c.products?.[0]),
          releaseVersion: tv(service.releaseVersion, service.release, c.companyInfo?.releaseVersion),
          licenceType: tv(service.licenceType, c.licenceType),
          noOfUsers: service.noOfUsers ?? c.users ?? undefined,
          licenseSerialNo: tv(service.licenseSerialNo, c.licenseSerialNo),
          licenceStatus: service.licenceStatus,
          partnerDetails: c.partnerDetails,
          startDate: service.startDate || c.startDate,
          tssExpiryDate: service.tssExpiryDate || service.endDate,
          isServer9: service.isServer9 ?? c.companyInfo?.isServer9,
          server9SerialNo: service.server9SerialNos?.[0]?.serialNo,
          server9SerialNos: service.server9SerialNos,
          pricingDetails: {
            actualPrice: service.actualPrice,
            discount: service.discount,
            currentPrice: service.currentPrice ?? service.amcValue,
            advance1: service.advance1,
            advance2: service.advance2,
            remainingTotal: service.remainingTotal,
          },
          email: service.email || c.email || c.primaryContactInfo?.email,
          emailOptions: customerEmails(c),
          ...excelFields,
        });
      });
    } else if (serialList.length === 0) {
      const registryRow: ProductRegistryRow = {
        key: `product-empty-${c._id}`,
        product: c.products?.[0],
        releaseVersion: c.companyInfo?.releaseVersion,
        licenceType: c.licenceType,
        noOfUsers: c.users || undefined,
        licenseSerialNo: c.licenseSerialNo,
        reference: c.licenseSerialNo,
        startDate: c.startDate,
        amount: undefined,
        partnerDetails: c.partnerDetails,
        status: c.amcStatus,
        renewalHistory: [],
      };
      const excelFields = excelFieldsForCustomer(c);
      out.push({
        _customerId: c._id,
        _serialIdx: 0,
        _customer: c,
        _registryRow: registryRow,
        customerNumber: c.customerNumber,
        companyName,
        avatar: c.avatar,
        customerType,
        product: tv(c.products?.[0]),
        releaseVersion: tv(c.companyInfo?.releaseVersion),
        licenceType: tv(c.licenceType),
        noOfUsers: c.users || undefined,
        licenseSerialNo: tv(c.licenseSerialNo),
        licenceStatus: undefined,
        partnerDetails: c.partnerDetails,
        startDate: c.startDate,
        tssExpiryDate: undefined,
        isServer9: c.companyInfo?.isServer9,
        server9SerialNo: undefined,
        server9SerialNos: undefined,
        pricingDetails: undefined,
        email: c.email || c.primaryContactInfo?.email,
        emailOptions: customerEmails(c),
        ...excelFields,
      });
    } else {
      serialList.forEach((s, idx) => {
        const registryRow = serialInfoToRegistryRow(s, c, idx);
        const licenseSerialNo = tv(s.licenseSerialNo, s.licenses?.[0]?.licenceSerialNo);
        const licenceStatus = s.licenceStatus || s.licenses?.[0]?.licenceStatus;
        const excelFields = excelFieldsForCustomer(c);
        out.push({
          _customerId: c._id,
          _serialIdx: idx,
          _customer: c,
          _registryRow: registryRow,
          customerNumber: c.customerNumber,
          companyName,
          avatar: c.avatar,
          customerType,
          product: tv(s.product, c.products?.[0]),
          releaseVersion: tv(s.releaseVersion, c.companyInfo?.releaseVersion),
          licenceType: tv(s.licenceType, c.licenceType),
          noOfUsers: s.noOfUsers ?? c.users ?? undefined,
          licenseSerialNo,
          licenceStatus,
          partnerDetails: c.partnerDetails,
          startDate: s.startDate || c.startDate,
          tssExpiryDate: s.tssExpiryDate || s.endDate,
          isServer9: s.isServer9 ?? c.companyInfo?.isServer9,
          server9SerialNo: s.server9SerialNo,
          server9SerialNos: s.tdlSerialNos,
          pricingDetails: s.pricingDetails,
          email: c.email || c.primaryContactInfo?.email,
          emailOptions: customerEmails(c),
          ...excelFields,
        });
      });
    }
  }
  return out;
};

export const productListExportRows = (rows: SerialRow[]) => rows.map((row, idx) => ({
  'S NO': idx + 1,
  'Serial No': displayText(row.licenseSerialNo),
  Product: displayText(row.product),
  Release: displayText(row.releaseVersion),
  'Org Name': displayText(row.companyName),
  'Primary Contact Person': displayText(row.primaryContactPerson),
  'Secondary Contact Name': displayText(row.secondaryContactName),
  'Primary Mobile': displayText(row.primaryMobile),
  'Secondary Mobile': displayText(row.secondaryMobile),
  Landline: displayText(row.landline),
  'TSS Expiry Date': row.tssExpiryDate ? fmt.date(row.tssExpiryDate) : '—',
  Status: row.sourceStatus || row.licenceStatus ? ((row.sourceStatus || row.licenceStatus)!.charAt(0).toUpperCase() + (row.sourceStatus || row.licenceStatus)!.slice(1)) : '—',
  'Partner details': displayText(row.partnerDetailsText),
  Salesman: displayText(row.salesman),
  'Location/Area': displayText(row.locationArea),
  'Full Address': displayText(row.fullAddress),
  'Email ID': displayText(row.emailId || row.email),
  'TSS Password': displayText(row.tssPassword),
  Website: displayText(row.website),
  'Website Status': displayText(row.websiteStatus),
  'AMC Status': displayText(row.amcStatusText),
  'TDL Status': displayText(row.tdlStatusText),
  'Cloud Status': displayText(row.cloudStatusText),
  'Tally Ledger': displayText(row.tallyLedger),
  Group: displayText(row.group),
}));

const consolidateProductRegistryRows = (rows: ProductRegistryRow[]): ProductRegistryRow[] => {
  const map = new Map<string, ProductRegistryRow>();
  const nonKeyed: ProductRegistryRow[] = [];

  for (const row of rows) {
    const rawSerial = row.licenseSerialNo || row.reference;
    const serialKey = rawSerial ? String(rawSerial).trim().toLowerCase() : null;

    if (!serialKey) {
      nonKeyed.push({
        ...row,
        status: computeServiceStatus(row.endDate, row.status),
      });
      continue;
    }

    const existing = map.get(serialKey);
    if (!existing) {
      map.set(serialKey, {
        ...row,
        status: computeServiceStatus(row.endDate, row.status),
      });
      continue;
    }

    const existingTime = existing.endDate ? new Date(existing.endDate).getTime() : 0;
    const newTime = row.endDate ? new Date(row.endDate).getTime() : 0;

    const primary = newTime >= existingTime ? row : existing;
    const secondary = newTime >= existingTime ? existing : row;

    const combinedHistory = [...(primary.renewalHistory || [])];
    if (secondary.endDate) {
      const secEndStr = fmt.date(secondary.endDate);
      const alreadyInHistory = combinedHistory.some(
        (h) => fmt.date(h.expiryDate) === secEndStr || fmt.date((h as any).endDate) === secEndStr
      );
      if (!alreadyInHistory) {
        combinedHistory.push({
          period: secondary.product ? `${secondary.product} (Previous)` : 'Previous Period',
          startDate: secondary.startDate as any,
          expiryDate: secondary.endDate as any,
          endDate: secondary.endDate as any,
          amount: secondary.amount,
          status: 'expired',
          notes: secondary.notes,
        } as any);
      }
    }
    if (secondary.renewalHistory) {
      for (const rh of secondary.renewalHistory) {
        if (!combinedHistory.some((h) => h.period === rh.period && fmt.date(h.expiryDate) === fmt.date(rh.expiryDate))) {
          combinedHistory.push(rh);
        }
      }
    }

    const merged: ProductRegistryRow = {
      ...primary,
      startDate: primary.startDate || secondary.startDate,
      product:
        primary.product && !primary.product.toLowerCase().includes('premium')
          ? primary.product
          : secondary.product || primary.product,
      notes: primary.notes || secondary.notes,
      status: computeServiceStatus(primary.endDate, primary.status),
      renewalHistory: combinedHistory,
    };

    map.set(serialKey, merged);
  }

  return [...map.values(), ...nonKeyed];
};

const moduleRegistryRows = (customer: Customer, moduleType: 'tdl' | 'tss' | 'cloud'): ProductRegistryRow[] => {
  if (moduleType === 'tdl') {
    const directTdl: ProductRegistryRow[] = (customer.services || []).filter((s) => s.type === 'tdl').map((s, idx) => ({
      key: s._id || `tdl-service-${idx}`,
      product: s.product || 'TDL Add-on',
      licenceType: s.licenceType,
      licenseSerialNo: s.licenseSerialNo,
      reference: s.licenseSerialNo,
      startDate: s.startDate,
      endDate: s.endDate,
      amount: s.currentPrice ?? s.actualPrice ?? s.remainingTotal,
      status: computeServiceStatus(s.endDate, s.status),
      notes: s.notesRemarks || s.details,
      renewalHistory: s.renewalHistory || [],
    }));
    const amcTdl: ProductRegistryRow[] = (customer.services || [])
      .filter((s) => s.type === 'amc' && (s.isTdl || (s as any).tdlEnabled))
      .map((s, idx) => ({
        key: `tdl-amc-${s._id || idx}`,
        product: s.product || 'TDL Add-on',
        licenceType: s.licenceType,
        licenseSerialNo: s.licenseSerialNo,
        reference: s.licenseSerialNo,
        startDate: s.startDate,
        endDate: s.endDate,
        amount: s.currentPrice ?? s.actualPrice ?? s.remainingTotal,
        status: computeServiceStatus(s.endDate, s.status),
        notes: s.notesRemarks || s.details || 'Product TDL Add-on',
        renewalHistory: s.renewalHistory || [],
      }));
    const mergedTdl = mergeModuleServicesBySerial(directTdl, amcTdl);
    const serialTdl: ProductRegistryRow[] = mergedTdl.length
      ? []
      : (customer.serialNoInfo || [])
          .filter((s) => s.isTdl || (s as any).tdlEnabled)
          .map((s, idx) => ({
            key: `tdl-serial-${idx}`,
            product: s.product || 'TDL Add-on',
            licenceType: s.licenceType,
            licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
            reference: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
            startDate: s.startDate,
            endDate: s.endDate,
            amount: s.pricingDetails?.currentPrice,
            status: computeServiceStatus(s.endDate, 'active'),
            notes: s.notes || 'Product TDL Add-on',
            renewalHistory: [],
          }));
    const legacy = moduleDetailToRegistryRow(customer.tdlDetails, 'tdl', customer);
    const rows = [...mergedTdl, ...serialTdl];
    if (rows.length === 0 && legacy) rows.push(legacy);
    return rows;
  }

  if (moduleType === 'cloud') {
    const rows: ProductRegistryRow[] = (customer.services || []).filter((s) => s.type === 'cloud').map((s, idx) => ({
      key: s._id || `cloud-service-${idx}`,
      product: s.product || s.vendor || 'Cloud Hub',
      licenceType: s.release,
      licenseSerialNo: s.licenseSerialNo,
      reference: s.domainLinkSubId || s.licenseSerialNo,
      startDate: s.startDate,
      endDate: s.endDate,
      amount: s.currentPrice ?? s.actualPrice ?? s.remainingTotal,
      status: computeServiceStatus(s.endDate, s.status),
      notes: s.notesRemarks || s.details,
      renewalHistory: s.renewalHistory || [],
    }));
    const legacy = moduleDetailToRegistryRow(customer.cloudDetails, 'cloud', customer);
    if (rows.length === 0 && legacy) rows.push(legacy);
    return rows;
  }

  const rows: ProductRegistryRow[] = (customer.services || []).filter((s) => s.type === 'tss').map((s, idx) => ({
    key: s._id || `tss-service-${idx}`,
    product: s.product || 'TSS Premium',
    licenceType: s.licenceType,
    licenseSerialNo: s.licenseSerialNo,
    reference: s.licenseSerialNo || s.licenceType,
    startDate: s.startDate,
    endDate: s.endDate,
    amount: s.currentPrice ?? s.actualPrice ?? s.remainingTotal,
    status: computeServiceStatus(s.endDate, s.status),
    notes: s.notesRemarks || s.details,
    renewalHistory: s.renewalHistory || [],
  }));
  const rawAmcTss: ProductRegistryRow[] = (customer.services || [])
      .filter((s) => s.type === 'amc' && s.tssExpiryDate)
      .map((s, idx) => ({
        key: `tss-product-${s._id || idx}`,
        product: s.product || 'TSS Premium',
        licenceType: s.licenceType,
        licenseSerialNo: s.licenseSerialNo,
        reference: s.licenseSerialNo || s.licenceType,
        startDate: s.startDate,
        endDate: s.tssExpiryDate,
        amount: s.currentPrice ?? s.actualPrice ?? s.remainingTotal,
        status: computeServiceStatus(s.tssExpiryDate, s.status),
        notes: s.details || 'Tracked from Product & License',
        renewalHistory: s.renewalHistory || [],
      }));
  const mergedTss = mergeModuleServicesBySerial(rows, rawAmcTss);
  const legacySerialTss: ProductRegistryRow[] = mergedTss.length ? [] : (customer.serialNoInfo || [])
    .filter((s) => s.tssExpiryDate || s.endDate)
    .map((s, idx) => {
      const endDate = s.tssExpiryDate || s.endDate;
      return {
        key: `tss-serial-${idx}`,
        product: s.product || 'TSS Premium',
        licenceType: s.licenceType,
        licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
        reference: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
        startDate: s.startDate,
        endDate,
        amount: s.pricingDetails?.currentPrice,
        status: computeServiceStatus(endDate, s.isAmcActive ? 'active' : 'active'),
        notes: s.notes,
        renewalHistory: [],
      };
    });
  const legacy = moduleDetailToRegistryRow(customer.tssDetails, 'tss', customer);
  const allRows = [...mergedTss, ...legacySerialTss];
  if (allRows.length === 0 && legacy) allRows.push(legacy);
  return allRows;
};

const customerEmails = (c: Customer) => Array.from(new Set([
  c.email,
  c.amcDetails?.email,
  c.tdlDetails?.email,
  c.cloudDetails?.email,
  c.tssDetails?.email,
  c.primaryContactInfo?.email,
  c.secondaryContactInfo?.email,
  ...(c.keyContacts || []).map((contact) => contact.email),
  ...(c.branches || []).map((branch) => branch.email),
  ...(c.partnerDetails || []).map((partner) => partner.email),
].map((value) => String(value || '').trim()).filter((value) => value && value !== '—' && value.includes('@'))));

const LICENCE_STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  expired: 'badge-red',
  blocked: 'badge-red',
  surrendered: 'badge-gray',
  terminated: 'badge-red',
};

const LicenceStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || status === '—') return <span style={{ color: 'var(--tx-4)', fontSize: 12 }}>—</span>;
  const cls = LICENCE_STATUS_BADGE[status.toLowerCase()] || 'badge-gray';
  return (
    <span className={`badge ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ─── Popup button ─────────────────────────────────

const IconPopupBtn: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}> = ({ active, icon, onClick, title }) => {
  if (!active)
    return <span style={{ color: 'var(--tx-5)', fontSize: 12 }}>—</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="btn-icon-zen"
    >
      {icon}
    </button>
  );
};

const RegistryHistoryTable: React.FC<{
  title: string;
  emptyText: string;
  rows: ProductRegistryRow[];
  referenceLabel?: string;
}> = ({ title, emptyText, rows, referenceLabel = 'License Serial' }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const money = (value?: number | null) => (
    value != null && Number.isFinite(Number(value)) ? fmt.currency(Number(value)) : '—'
  );
  const serials = (items?: Array<{ serialNo?: string }>) => (items || []).map((item) => cleanText(item.serialNo)).filter(Boolean).join(', ') || '—';
  const detailValue = (value: React.ReactNode) => value || '—';
  const detailGroups = (row: ProductRegistryRow) => [
    {
      title: 'License',
      rows: [
        ['Product', row.product],
        ['Release', row.releaseVersion],
        ['Type', row.licenceType],
        ['Users', row.noOfUsers != null ? String(row.noOfUsers) : '—'],
        ['Serial', row.licenseSerialNo],
        ['Status', row.licenceStatus],
      ],
    },
    {
      title: 'Coverage',
      rows: [
        ['Start', fmt.date(row.startDate)],
        ['Expiry', fmt.date(row.endDate)],
        ['TSS Expiry', fmt.date(row.tssExpiryDate)],
        ['Server 9', row.isServer9 ? 'Yes' : 'No'],
        ['Server Serial', row.server9SerialNo || serials(row.server9SerialNos)],
        ['TDL Serials', serials(row.tdlSerialNos)],
      ],
    },
    {
      title: 'Billing',
      rows: [
        ['Actual', money(row.pricingDetails?.actualPrice)],
        ['Discount', money(row.pricingDetails?.discount)],
        ['Current', money(row.pricingDetails?.currentPrice ?? row.amount)],
        ['Advance 1', money(row.pricingDetails?.advance1)],
        ['Advance 2', money(row.pricingDetails?.advance2)],
        ['Balance', money(row.pricingDetails?.remainingTotal)],
      ],
    },
    {
      title: 'Extra',
      rows: [
        ['Partners', row.partnerDetails?.length ? `${row.partnerDetails.length} partner${row.partnerDetails.length === 1 ? '' : 's'}` : '—'],
        ['Notes', row.notes],
      ],
    },
  ];

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
      <div className="card card-table-sep">
        <button
          type="button"
          className="card-header"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
        >
          <span className="card-title">{title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-blue">{rows.length} Total</span>
            <span style={{ width: 30, height: 30, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--tx-3)' }}>
              <ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--t)' }} />
            </span>
          </span>
        </button>
        {isExpanded ? (
          <div className="tbl-wrap">
            <table className="table-pro table-center">
              <thead>
                <tr>
                  <th className="sno-col">S NO</th>
                  <th>Product & License</th>
                  <th>Coverage</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--tx-4)', fontSize: 13 }}>
                      {emptyText}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => {
                  const isHistoryOpen = expandedRowKey === row.key;
                  const history = (row.renewalHistory || []).filter((rh) => rh.period !== 'Initial Contract');
                  const highlights = [
                    { label: 'Product', value: row.product || '—' },
                    { label: 'Serial', value: row.reference || row.licenseSerialNo || '—' },
                    { label: 'Coverage', value: `${fmt.date(row.startDate)} - ${fmt.date(row.endDate)}` },
                    { label: 'Value', value: money(row.amount) },
                  ];
                  return (
                    <React.Fragment key={row.key}>
                      <tr>
                        <td className="sno-col">{idx + 1}</td>
                        <td style={{ textAlign: 'left', minWidth: 240 }}>
                          <div style={{ fontWeight: 800, color: 'var(--tx-1)' }}>{row.product || '—'}</div>
                          <div style={{ marginTop: 4, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontWeight: 700 }}>
                            {row.reference || row.licenseSerialNo || row.licenceType || '—'}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx-4)' }}>{referenceLabel}</div>
                        </td>
                        <td style={{ minWidth: 190 }}>
                          <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(row.startDate)}</div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', margin: '2px 0' }}>to</div>
                          <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(row.endDate)}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{money(row.amount)}</td>
                        <td><Badge status={computeServiceStatus(row.endDate, row.status)} /></td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setExpandedRowKey((prev) => (prev === row.key ? null : row.key))}
                            style={{ padding: '4px 10px', fontSize: '11px', height: 'auto', minHeight: 'unset', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <span>{isHistoryOpen ? 'Hide History' : 'View History'}</span>
                            <ChevronDown size={12} style={{ transform: isHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--t)' }} />
                          </button>
                        </td>
                      </tr>
                      {isHistoryOpen ? (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--bg-3)', padding: '18px 22px', textAlign: 'left' }}>
                            <div style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0 0 4px 0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                <div>
                                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--tx-1)' }}>
                                    Product & License Details
                                  </h4>
                                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--tx-4)' }}>
                                    {row.licenceType || row.reference || row.licenseSerialNo || 'Product record'}
                                  </div>
                                </div>
                                <Badge status={row.status || 'active'} />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
                                {highlights.map((item) => (
                                  <div key={item.label} style={{ minWidth: 0, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                      {item.label}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(item.value)}>
                                      {item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
                                {detailGroups(row).map((group) => (
                                  <div key={group.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minWidth: 0 }}>
                                    <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 11, fontWeight: 800, color: 'var(--tx-2)' }}>
                                      {group.title}
                                    </div>
                                    <div style={{ padding: '6px 12px' }}>
                                      {group.rows.map(([label, value]) => (
                                        <div key={String(label)} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                                          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                                          <strong style={{ fontSize: 12.5, color: 'var(--tx-1)', wordBreak: 'break-word', lineHeight: 1.35 }}>{detailValue(value)}</strong>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 800, color: 'var(--tx-1)' }}>
                                Renewal & Billing History
                              </h4>
                              <div className="tbl-wrap" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                <table className="table-pro table-center" style={{ margin: 0, background: 'var(--surface)' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-2)' }}>
                                      <th className="sno-col" style={{ fontSize: '11px', padding: '6px 12px' }}>S NO</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Period</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Renewed On</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Start Date</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Expiry Date</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Amount</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Payment</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Ref/Inv</th>
                                      <th style={{ fontSize: '11px', padding: '6px 12px' }}>Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      const initialContract = (row.renewalHistory || []).find((rh) => rh.period === 'Initial Contract');
                                      const initialEnd = initialContract?.expiryDate || (row as any).initialEndDate || (history.length > 0 ? undefined : row.endDate) || row.endDate;
                                      let initialStart = initialContract?.startDate || (row as any).initialStartDate || (history.length > 0 ? undefined : row.startDate);
                                      if (!initialStart || (initialEnd && new Date(initialStart) > new Date(initialEnd))) {
                                        initialStart = initialEnd ? calculateStartDateFromExpiry(initialEnd, initialContract?.period || '1 Year') : row.startDate;
                                      }
                                      const initialAmount = initialContract?.amount ?? (row as any).initialPrice ?? (history.length > 0 ? 0 : row.amount);
                                      const initialLabel = history.length > 0 ? 'Initial' : 'Current';
                                      const initialRenewedOn = initialContract?.renewedOn && (!initialEnd || new Date(initialContract.renewedOn) <= new Date(initialEnd))
                                        ? fmt.date(initialContract.renewedOn)
                                        : initialStart ? fmt.date(initialStart) : '—';
                                      return (
                                        <tr style={{ background: 'rgba(22, 163, 74, 0.04)' }}>
                                          <td className="sno-col" style={{ fontSize: '11px', padding: '8px 12px', fontWeight: 800, color: 'var(--tx-4)' }}>1</td>
                                          <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 700, color: history.length > 0 ? 'var(--tx-2)' : 'var(--green)' }}>{initialLabel}</td>
                                          <td style={{ fontSize: '11px', padding: '8px 12px', color: 'var(--tx-4)' }}>{initialRenewedOn}</td>
                                          <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(initialStart)}</td>
                                          <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(initialEnd)}</td>
                                          <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 800, color: history.length > 0 ? 'var(--tx-1)' : 'var(--green)' }}>{money(initialAmount)}</td>
                                          <td style={{ fontSize: '11px', padding: '8px 12px', fontWeight: 600 }}>Main Record</td>
                                          <td style={{ fontSize: '11px', padding: '8px 12px', color: 'var(--tx-4)' }}>—</td>
                                          <td style={{ fontSize: '11.5px', padding: '8px 12px', color: 'var(--tx-4)' }}>{row.notes || '—'}</td>
                                        </tr>
                                      );
                                    })()}
                                    {history.length === 0 ? (
                                      <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', padding: '12px', color: 'var(--tx-4)', fontSize: '12px' }}>
                                          No previous renewal history found.
                                        </td>
                                      </tr>
                                    ) : history.map((rh, historyIdx) => ({ ...rh, sNo: historyIdx + 2 })).reverse().map((rh, historyIdx) => (
                                      <tr key={`${row.key}-history-${historyIdx}`}>
                                        <td className="sno-col" style={{ fontSize: '11px', padding: '8px 12px' }}>{rh.sNo}</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 700 }}>{rh.period}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.renewedOn)}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.startDate || rh.renewedOn)}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.expiryDate)}</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 600 }}>{money(rh.amount)}</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px' }}>{rh.paymentMethod || '—'}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{rh.invoiceNo || '—'}</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rh.notes}>
                                          {rh.notes || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─── Product List Page ────────────────────────────

const ProductListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [server9Row, setServer9Row] = useState<SerialRow | null>(null);
  const [pricingRow, setPricingRow] = useState<SerialRow | null>(null);
  const [partnerRow, setPartnerRow] = useState<SerialRow | null>(null);
  const [viewRegistry, setViewRegistry] = useState<{ customer: Customer; row: ProductRegistryRow } | null>(null);
  const [templateByRow, setTemplateByRow] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, productFilter, pageSize, hasActiveDateFilter, startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers-product-list', search, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { all: 'true' };
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/customers', { params });
      return (res.data?.data || []) as Customer[];
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['customers-stats', dateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/customers/stats', { params });
      return res.data?.data || {};
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 100 } });
      return (res.data?.data || []) as Array<{ name: string }>;
    },
  });

  const rows = useMemo<SerialRow[]>(() => buildProductListRows(data || []), [data]);

  const filtered = useMemo(() => {
    let result = rows;
    if (productFilter !== 'all') {
      const pLower = productFilter.toLowerCase();
      result = result.filter((row) => (row.product || '').toLowerCase().includes(pLower));
    }
    if (statusFilter !== 'all') {
      result = result.filter((row) => {
        const explicit = row._registryRow?.status || row.licenceStatus || (row.amcStatusText !== 'No AMC' && row.amcStatusText !== 'none' ? row.amcStatusText : undefined);
        const status = computeServiceStatus(row.tssExpiryDate || row.startDate, explicit);
        if (statusFilter === 'active') return status === 'active';
        if (statusFilter === 'expiring') return status === 'expiring';
        if (statusFilter === 'expired') return status === 'expired';
        if (statusFilter === 'none') return status === 'none' || (row._customer?.amcStatus === 'none');
        return true;
      });
    }
    return result;
  }, [rows, statusFilter, productFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / Number(pageSize)));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return filtered.slice(start, start + Number(pageSize));
  }, [filtered, page, pageSize]);

  const exportProducts = () => {
    exportExcelWorkbook('product-list', [
      { name: 'Product List', rows: productListExportRows(filtered) },
    ]);
  };

  const kpis = useMemo(() => {
    const total = statsData?.total ?? rows.length;
    const active = statsData?.active ?? rows.filter((r) => r.licenceStatus === 'active' || r.amcStatusText === 'active').length;
    const expiring = statsData?.expiring ?? rows.filter((r) => r.licenceStatus === 'expiring' || r.amcStatusText === 'expiring').length;
    const expired = statsData?.expired ?? rows.filter((r) => r.licenceStatus === 'expired' || r.amcStatusText === 'expired').length;
    return [
      { label: 'Total Products', value: total, icon: <Package size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All registered serials' },
      { label: 'Active Licenses', value: active, icon: <ShieldCheck size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Healthy TSS status' },
      { label: 'Expiring Soon', value: expiring, icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Within 30 days' },
      { label: 'Expired', value: expired, icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Renewal required' },
    ];
  }, [statsData, rows]);

  const productOptions = useMemo(() => {
    const list = (productsData || []).map((p: any) => p.name);
    return [
      { value: 'all', label: 'All Products' },
      ...list.sort().map((p: string) => ({ value: p, label: p }))
    ];
  }, [productsData]);

const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'AMC Active' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'none', label: 'No AMC' },
  ];

  const productWhatsappMessage = (row: SerialRow) => [
    `Hello ${displayText(row.primaryContactPerson) === '—' ? 'Customer' : displayText(row.primaryContactPerson)},`,
    '',
    'Sharing your WelcomeTech product details:',
    `Customer: ${displayText(row.companyName)}`,
    `Product: ${displayText(row.product)}`,
    `Release: ${displayText(row.releaseVersion)}`,
    `Serial No: ${displayText(row.licenseSerialNo)}`,
    `TSS Expiry: ${row.tssExpiryDate ? fmt.date(row.tssExpiryDate) : '—'}`,
    `AMC Status: ${displayText(row.amcStatusText)}`,
    '',
    'Thank you.',
  ].join('\n');

  const tableHeaders = (
    <>
      <th>S NO</th>
      <th>Customer No</th>
      <th>Serial No</th>
      <th>Product</th>
      <th>Release</th>
      <th>Org Name</th>
      <th>Primary Contact Person</th>
      <th>Secondary Contact Name</th>
      <th>Primary Mobile</th>
      <th>Secondary Mobile</th>
      <th>Landline</th>
      <th>TSS Expiry Date</th>
      <th>Status</th>
      <th>Partner details</th>
      <th>Salesman</th>
      <th>Location/Area</th>
      <th>Full Address</th>
      <th>Email ID</th>
      <th>TSS Password</th>
      <th>Website</th>
      <th>Website Status</th>
      <th>AMC Status</th>
      <th>TDL Status</th>
      <th>Cloud Status</th>
      <th>Tally Ledger</th>
      <th>Group</th>
      <th>Choose Template</th>
      <th>Action</th>
    </>
  );

  const tableBody = pagedRows.length === 0 ? (
    <tr>
      <td colSpan={28}>
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Package size={32} style={{ color: 'var(--tx-5)', marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-2)' }}>No product records found</div>
          <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Try adjusting your search or filters</div>
        </div>
      </td>
    </tr>
  ) : (
    pagedRows.map((row, idx) => {
      const rowKey = `${row._customerId}-${row._serialIdx}`;
      const selectedTemplateId = templateByRow[rowKey] || '';
      const setSelectedTemplateId = (value: string) => setTemplateByRow((prev) => ({ ...prev, [rowKey]: value }));
      const clamp2Lines: React.CSSProperties = {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.35,
        wordBreak: 'break-word',
        textAlign: 'center',
        margin: '0 auto',
      };
      const cellStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx-2)', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' };
      const textCellStyle: React.CSSProperties = { ...cellStyle, textAlign: 'center', minWidth: 160, whiteSpace: 'normal' };
      const displaySerialNumber = (page - 1) * Number(pageSize) + idx + 1;
      return (
      <tr key={rowKey} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)', color: 'var(--tx-3)', fontWeight: 800 }}>{displaySerialNumber}</td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)', fontWeight: 800, fontSize: 13.5 }}>
          {row._customer?.customerNumber || row.customerNumber || '—'}
        </td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)', color: 'var(--brand)', fontWeight: 800 }}>{displayText(row.licenseSerialNo)}</td>
        <td style={cellStyle}>{displayText(row.product)}</td>
        <td style={cellStyle}>{displayText(row.releaseVersion)}</td>
        <td className="company-name-cell" style={{ ...textCellStyle, minWidth: 260, fontWeight: 800, color: 'var(--tx-1)' }}>
          <div style={clamp2Lines} title={displayText(row.companyName)}>
            {displayText(row.companyName)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 190 }}>
          <div style={clamp2Lines} title={displayText(row.primaryContactPerson)}>
            {displayText(row.primaryContactPerson)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 190 }}>
          <div style={clamp2Lines} title={displayText(row.secondaryContactName)}>
            {displayText(row.secondaryContactName)}
          </div>
        </td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }}>{displayText(row.primaryMobile)}</td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }}>{displayText(row.secondaryMobile)}</td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }}>{displayText(row.landline)}</td>
        <td style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }}>{row.tssExpiryDate ? fmt.date(row.tssExpiryDate) : '—'}</td>
        <td style={cellStyle}><LicenceStatusBadge status={row.sourceStatus || row.licenceStatus} /></td>
        <td style={cellStyle}>
          {hasPartner(row.partnerDetails) ? (
            <IconPopupBtn active icon={<Building2 size={13} />} onClick={() => setPartnerRow(row)} title={displayText(row.partnerDetailsText)} />
          ) : displayText(row.partnerDetailsText)}
        </td>
        <td style={{ ...textCellStyle, minWidth: 160 }}>
          <div style={clamp2Lines} title={displayText(row.salesman)}>
            {displayText(row.salesman)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 180 }}>
          <div style={clamp2Lines} title={displayText(row.locationArea)}>
            {displayText(row.locationArea)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 280 }}>
          <div style={clamp2Lines} title={displayText(row.fullAddress)}>
            {displayText(row.fullAddress)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 220 }}>
          <div style={clamp2Lines} title={displayText(row.emailId || row.email)}>
            {displayText(row.emailId || row.email)}
          </div>
        </td>
        <td style={cellStyle}>{displayText(row.tssPassword)}</td>
        <td style={{ ...textCellStyle, minWidth: 220 }}>
          <div style={clamp2Lines} title={displayText(row.website)}>
            {displayText(row.website)}
          </div>
        </td>
        <td style={cellStyle}>{displayText(row.websiteStatus)}</td>
        <td style={cellStyle}>{displayText(row.amcStatusText)}</td>
        <td style={cellStyle}>{displayText(row.tdlStatusText)}</td>
        <td style={cellStyle}>{displayText(row.cloudStatusText)}</td>
        <td style={{ ...textCellStyle, minWidth: 180 }}>
          <div style={clamp2Lines} title={displayText(row.tallyLedger)}>
            {displayText(row.tallyLedger)}
          </div>
        </td>
        <td style={{ ...textCellStyle, minWidth: 160 }}>
          <div style={clamp2Lines} title={displayText(row.group)}>
            {displayText(row.group)}
          </div>
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'center', minWidth: 260 }}>
          <EmailTemplateSelect selectedTemplateId={selectedTemplateId} onTemplateChange={setSelectedTemplateId} />
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'center', minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <EmailTemplateSendButton
            email={row.email}
            emailOptions={row.emailOptions}
            customerName={row.companyName}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              customerId: row._customerId,
              product: row.product,
              release: row.releaseVersion,
              serialNo: row.licenseSerialNo,
              licenseSerialNo: row.licenseSerialNo,
              expiryDate: fmt.date(row.tssExpiryDate),
              tssExpiryDate: fmt.date(row.tssExpiryDate),
              startDate: fmt.date(row.startDate),
              endDate: fmt.date(row.tssExpiryDate),
              email_id: row.email,
            }}
          />
          <CustomerWhatsAppAction
            customer={row._customer}
            contextLabel="product"
            defaultMessage={productWhatsappMessage(row)}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              customerId: row._customerId,
              product: row.product,
              release: row.releaseVersion,
              serialNo: row.licenseSerialNo,
              licenseSerialNo: row.licenseSerialNo,
              expiryDate: fmt.date(row.tssExpiryDate),
              tssExpiryDate: fmt.date(row.tssExpiryDate),
              startDate: fmt.date(row.startDate),
              endDate: fmt.date(row.tssExpiryDate),
              email_id: row.email,
              amount: String(row.pricingDetails?.currentPrice || row.pricingDetails?.actualPrice || ''),
            }}
          />
          <button
            className="btn-action btn-action-blue"
            title="View Product Registry"
            onClick={() => setViewRegistry({ customer: row._customer, row: row._registryRow })}
            style={{ margin: '0 auto' }}
          >
            <Eye size={13} />
          </button>
          </div>
        </td>
      </tr>
      );
    }
  )
);

  return (
    <div>
      <ModernDashboardLayout
        title="Enterprise Product Control"
        subtitle={`Centralized management for ${filtered.length} product licenses and serial records`}
        kpiCards={kpis}
        isLoading={isLoading}
        tableSearch={
          <>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search serials..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </>
        }
        tableActions={
          <>
            <Select
              value={pageSize}
              onChange={(v) => { setPageSize(v); setPage(1); }}
              options={PAGE_SIZE_OPTIONS}
              className="filter-select page-size-select"
            />
            <Select
              value={productFilter}
              onChange={(v) => { setProductFilter(v); setPage(1); }}
              options={productOptions}
              className="filter-select"
            />
            <Select
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={statusOptions}
              className="filter-select"
            />
            <button className="btn btn-export btn-sm" onClick={exportProducts}>
              <Download size={13} /> Export
            </button>
          </>
        }
        tableHeaders={tableHeaders}
        tableBody={tableBody}
        tableFooter={<Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} total={filtered.length} pageSize={pageSize} />}
      />

      {/* ── Product Registry Popup ── */}
      <Modal
        open={!!viewRegistry}
        onClose={() => setViewRegistry(null)}
        title="Product Registry Details"
        size="xl"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setViewRegistry(null)}>Close</button>
          </div>
        }
      >
        {viewRegistry ? (() => {
          const c = viewRegistry.customer;
          const r = viewRegistry.row;
          const serials = (items?: Array<{ serialNo?: string }>) => (items || []).map((item) => cleanText(item.serialNo)).filter(Boolean).join(', ') || '—';
          const money = (val?: number | null) => (val != null && Number.isFinite(Number(val)) ? fmt.currency(Number(val)) : '—');
          const pd = r.pricingDetails;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Header Hero Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '16px 20px',
                  background: 'var(--surface-2)',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <Avatar name={c.name} src={c.avatar} size="lg" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 16.5, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--tx-3)', fontWeight: 500 }}>
                        {c.companyInfo?.industryGroup || c.industry || 'Customer Registry'}
                      </span>
                      {c.phone && (
                        <span style={{ fontSize: 12, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>
                          • Tel: {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <Badge status={r.status || c.amcStatus || 'active'} />
                  {r.isServer9 && (
                    <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={11} /> Server 9
                    </span>
                  )}
                </div>
              </div>

              {/* 4-Stat Quick Overview Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Product
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.product || '—'}
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    License Serial
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.reference || r.licenseSerialNo || '—'}
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    TSS Expiry Date
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>
                    {fmt.date(r.tssExpiryDate)}
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Contract Value
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                    {money(pd?.currentPrice ?? r.amount)}
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Cards (2 Columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                
                {/* Card 1: License & Product Specs */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    License & Product Specifications
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Product Title</span>
                      <span style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--tx-1)' }}>{r.product || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Release Version</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)' }}>{r.releaseVersion || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>License Tier / Type</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)' }}>{r.licenceType || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>No. of Users</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{r.noOfUsers != null ? String(r.noOfUsers) : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>License Status</span>
                      <span className={`badge ${r.licenceStatus === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                        {r.licenceStatus || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Coverage & System Timeline */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Coverage & Timeline
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Start Date</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{fmt.date(r.startDate)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Expiry Date</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{fmt.date(r.endDate)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>TSS Expiry</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{fmt.date(r.tssExpiryDate)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Server 9 Integration</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: r.isServer9 ? 'var(--green)' : 'var(--tx-4)' }}>
                        {r.isServer9 ? 'Enabled' : 'No'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Server 9 Serial</span>
                      <span style={{ fontSize: 12, fontWeight: 650, fontFamily: 'var(--font-mono)', color: 'var(--tx-2)' }}>
                        {r.server9SerialNo || serials(r.server9SerialNos)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 3: Financial & Commercials */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Financial & Commercial Breakdown
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Actual Price</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{money(pd?.actualPrice)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Discount</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: pd?.discount ? 'var(--amber)' : 'var(--tx-4)' }}>{money(pd?.discount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Net Contract Price</span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{money(pd?.currentPrice ?? r.amount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Advance 1 / 2</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                        {money(pd?.advance1)} / {money(pd?.advance2)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Remaining Balance</span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: (pd?.remainingTotal || 0) > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {money(pd?.remainingTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 4: TDL & Partner Association */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 12, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    TDL Serials & Partners
                  </div>
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>TDL Add-on Serials</span>
                      <span style={{ fontSize: 12, fontWeight: 650, fontFamily: 'var(--font-mono)', color: 'var(--tx-2)', maxWidth: 220, textAlign: 'right', wordBreak: 'break-word' }}>
                        {serials(r.tdlSerialNos)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Partner Associations</span>
                      <span className="badge badge-blue">
                        {r.partnerDetails?.length ? `${r.partnerDetails.length} Registered Partner(s)` : 'None'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>Notes / Activity</span>
                      <div style={{ fontSize: 12, color: 'var(--tx-2)', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8, minHeight: 40, lineHeight: 1.45 }}>
                        {r.notes || 'No additional registry notes provided.'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })() : null}
      </Modal>

      {/* ── Server 9 Popup ── */}
      <Modal
        open={!!server9Row}
        onClose={() => setServer9Row(null)}
        title="Server 9 Details"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setServer9Row(null)}>Close</button>
          </div>
        }
      >
        {server9Row && (
          <div>
            {/* Company banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 18 }}>
              <Avatar name={server9Row.companyName} src={server9Row.avatar} size="md" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{server9Row.companyName}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>{server9Row.product}</div>
              </div>
              <span className="badge badge-green" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <CheckCircle size={11} />
                Enabled
              </span>
            </div>

            {/* Primary serial */}
            {server9Row.server9SerialNo && server9Row.server9SerialNo !== '—' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tx-4)', marginBottom: 8 }}>Primary Serial No</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--brand-light)', border: '1.5px solid var(--brand-muted)', borderRadius: 10 }}>
                  <Server size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--brand)', letterSpacing: '0.04em' }}>
                    {server9Row.server9SerialNo}
                  </span>
                </div>
              </div>
            )}

            {/* Additional serials */}
            {(server9Row.server9SerialNos || []).length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tx-4)', marginBottom: 8 }}>
                  Additional Serials ({server9Row.server9SerialNos!.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {server9Row.server9SerialNos!.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-3)' }}>{i + 1}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-2)' }}>{s.serialNo || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Pricing Details Popup ── */}
      <Modal
        open={!!pricingRow}
        onClose={() => setPricingRow(null)}
        title="Pricing Details"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setPricingRow(null)}>Close</button>
          </div>
        }
      >
        {pricingRow && pricingRow.pricingDetails && (() => {
          const pd = pricingRow.pricingDetails;
          const totalPaid = (pd.advance1 || 0) + (pd.advance2 || 0);
          const netPrice = pd.currentPrice ?? pd.actualPrice ?? 0;
          const paidPct = netPrice > 0 ? Math.min(100, Math.round((totalPaid / netPrice) * 100)) : 0;

          return (
            <div>
              {/* Company banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 18 }}>
                <Avatar name={pricingRow.companyName} src={pricingRow.avatar} size="md" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pricingRow.companyName}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>{pricingRow.product}</div>
                </div>
              </div>

              {/* Price breakdown section */}
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tx-4)', marginBottom: 10 }}>Price Breakdown</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>

                {/* Actual Price */}
                {pd.actualPrice != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>Actual Price</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--tx-1)' }}>
                      {fmt.currency(pd.actualPrice)}
                    </span>
                  </div>
                )}

                {/* Discount */}
                {pd.discount != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Minus size={13} style={{ color: 'var(--amber)' }} />
                      <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>Discount</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--amber)' }}>
                      {fmt.currency(pd.discount)}
                    </span>
                  </div>
                )}

                {/* Current / Net Price */}
                {pd.currentPrice != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: 'var(--brand-light)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>Net Price</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color: 'var(--brand)' }}>
                      {fmt.currency(pd.currentPrice)}
                    </span>
                  </div>
                )}
              </div>

              {/* Payment section */}
              {(pd.advance1 != null || pd.advance2 != null) && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tx-4)', marginBottom: 10 }}>Payments Received</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                    {pd.advance1 != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: pd.advance2 != null ? '1px solid var(--border)' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--green)' }}>A1</span>
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>Advance 1</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>
                          {fmt.currency(pd.advance1)}
                        </span>
                      </div>
                    )}
                    {pd.advance2 != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--green)' }}>A2</span>
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>Advance 2</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>
                          {fmt.currency(pd.advance2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment progress bar */}
                  {netPrice > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--tx-3)', fontWeight: 500 }}>Payment Progress</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>{paidPct}%</span>
                      </div>
                      <div style={{ height: 7, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${paidPct}%`, height: '100%', background: paidPct === 100 ? 'var(--green)' : 'var(--brand)', borderRadius: 99, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Remaining Total */}
              {pd.remainingTotal != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: pd.remainingTotal > 0 ? 'rgba(239,68,68,0.06)' : 'var(--green-bg)', border: `1.5px solid ${pd.remainingTotal > 0 ? 'rgba(239,68,68,0.2)' : 'var(--green-bd,rgba(34,197,94,0.2))'}`, borderRadius: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: pd.remainingTotal > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {pd.remainingTotal > 0 ? 'Remaining Balance' : 'Fully Paid'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: pd.remainingTotal > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {fmt.currency(pd.remainingTotal)}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* ── Partner Details Popup ── */}
      <Modal
        open={!!partnerRow}
        onClose={() => setPartnerRow(null)}
        title="Partner Details"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setPartnerRow(null)}>Close</button>
          </div>
        }
      >
        {partnerRow && (partnerRow.partnerDetails || []).length > 0 && (
          <div>
            {/* Company banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 18 }}>
              <Avatar name={partnerRow.companyName} src={partnerRow.avatar} size="md" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx-1)' }}>{partnerRow.companyName}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                  {partnerRow.partnerDetails!.length} partner{partnerRow.partnerDetails!.length !== 1 ? 's' : ''} linked
                </div>
              </div>
              <div style={{ marginLeft: 'auto', flexShrink: 0, textAlign: 'right' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                  <Building2 size={16} />
                </div>
              </div>
            </div>

            {/* Partner cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {partnerRow.partnerDetails!.map((p, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <Avatar name={p.companyName || p.fullName || `P${i + 1}`} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.companyName || p.fullName || `Partner ${i + 1}`}
                      </div>
                      {p.service && (
                        <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600, marginTop: 2 }}>{p.service}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx-4)', background: 'var(--surface-3)', padding: '3px 8px', borderRadius: 20 }}>
                      #{i + 1}
                    </span>
                  </div>

                  {/* Contact info grid */}
                  <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.fullName && p.fullName !== p.companyName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={12} style={{ color: 'var(--tx-3)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Person</div>
                          <div style={{ fontSize: 12.5, color: 'var(--tx-1)', fontWeight: 500 }}>{p.fullName}</div>
                        </div>
                      </div>
                    )}
                    {p.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Phone size={12} style={{ color: 'var(--green)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</div>
                          <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--tx-1)' }}>{p.phone}</div>
                        </div>
                      </div>
                    )}
                    {p.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Mail size={12} style={{ color: 'var(--brand)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
                          <div style={{ fontSize: 12.5, color: 'var(--tx-1)' }}>{p.email}</div>
                        </div>
                      </div>
                    )}
                    {p.service && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--amber-bg,rgba(245,158,11,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Briefcase size={12} style={{ color: 'var(--amber)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service</div>
                          <div style={{ fontSize: 12.5, color: 'var(--tx-1)' }}>{p.service}</div>
                        </div>
                      </div>
                    )}
                    {p.address && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <MapPin size={12} style={{ color: 'var(--tx-3)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--tx-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address</div>
                          <div style={{ fontSize: 12.5, color: 'var(--tx-2)', lineHeight: 1.5 }}>{p.address}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductListPage;
