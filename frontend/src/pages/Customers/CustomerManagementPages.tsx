import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, Building2, CheckCircle, Cloud, Clock, Download, Eye, Pencil, Plus, RefreshCw, Search, SearchCheck, Shield, ShieldCheck, Trash2, Users, ChevronRight } from 'lucide-react';
import api from '../../utils/api';
import { AMCRenewal, Customer } from '../../types';
import { Avatar, Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SelectField, SkeletonRow, Spinner, Pagination } from '../../components/ui';
import { ModernDashboardLayout } from '../../components/Dashboard/ModernDashboardLayout';
import { fmt, getActiveCurrency, PAGE_SIZE_OPTIONS, computeServiceStatus, deduplicateAmcEntries, mergeModuleServicesBySerial, calculateRemainingDays } from '../../utils/helpers';
import { customerRenewalRows, exportExcelWorkbook, exportExcelRows } from '../../utils/excelExport';
import toast from 'react-hot-toast';
import { EmailTemplateSelect, EmailTemplateSendButton } from '../../components/email/EmailActionCell';
import CustomerWhatsAppAction from '../../components/whatsapp/CustomerWhatsAppAction';
import { BulkActionToolbar } from '../../components/bulk/BulkActionToolbar';
import { BulkEmailModal, BulkEmailTarget } from '../../components/bulk/BulkEmailModal';
import { BulkWhatsAppModal, BulkWhatsAppTarget } from '../../components/bulk/BulkWhatsAppModal';
import { NotifiedBadge } from '../../components/common/NotifiedBadge';
import { useDateFilter } from '../../context/DateFilterContext';

type CustomerService = NonNullable<Customer['services']>[number];
type ModuleListRow = { customer: Customer; service?: CustomerService; rowKey: string };
type ModuleViewSelection = { customer: Customer; service?: CustomerService } | null;

const useCustomers = () =>
  useQuery({
    queryKey: ['customers-management-pages'],
    queryFn: async () => {
      const res = await api.get('/customers', { params: { all: 'true' } });
      return (res.data.data || []) as Customer[];
    },
  });

export const matchDateFilterRange = (
  expStr?: string | Date | null,
  _startStr?: string | Date | null,
  _createdStr?: string | Date | null,
  _statusFilterVal?: string,
  filterStart?: string | null,
  filterEnd?: string | null
): boolean => {
  if (!filterStart || !filterEnd) return true;
  const sRange = new Date(filterStart);
  sRange.setHours(0, 0, 0, 0);
  const eRange = new Date(filterEnd);
  eRange.setHours(23, 59, 59, 999);
  const sTime = sRange.getTime();
  const eTime = eRange.getTime();
  if (isNaN(sTime) || isNaN(eTime)) return true;

  const expTime = expStr ? new Date(expStr).getTime() : NaN;
  if (isNaN(expTime)) return false;

  // In license registries (TSS, TDL, Cloud), date filtering matches records whose expiry date falls within the filter range
  return expTime >= sTime && expTime <= eTime;
};

const useCustomerManagementInsights = () => {
  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';
  return useQuery({
    queryKey: ['customers-management-insights', dateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/customers/management-insights', { params });
      return res.data?.data || {};
    },
  });
};

const moduleExportRows = (rows: ModuleListRow[]) =>
  rows.map(({ customer, service }) => ({
    customer,
    service: service || {},
  }));

const hasTDL = (c: Customer) =>
  !!(
    c.services?.some((s) => s.type === 'tdl' || s.isTdl || (s as any).tdlEnabled) ||
    c.serialNoInfo?.some((s) => s.isTdl || s.tdlEnabled) ||
    c.serialNoInfo?.[0]?.isAmcActive ||
    c.tdlDetails?.status === 'active' ||
    c.tdlDetails?.status === 'trial' ||
    c.tdlDetails?.status === 'expiring' ||
    (Number(c.tdlDetails?.actualPrice) > 0)
  );

const hasCloud = (c: Customer) =>
  !!(
    c.services?.some((s) => s.type === 'cloud' && s.status !== 'none') ||
    c.cloudDetails?.vendor ||
    (c.cloudDetails?.users?.length || 0) > 0 ||
    (c.cloudDetails?.noOfUsers || 0) > 0 ||
    c.cloudDetails?.status === 'active' ||
    c.cloudDetails?.status === 'trial' ||
    c.cloudDetails?.status === 'expiring' ||
    (Number(c.cloudDetails?.actualPrice) > 0)
  );

const hasTSS = (c: Customer) =>
  !!(
    c.services?.some((s) => (s.type === 'tss' && s.status !== 'none') || s.tssExpiryDate) ||
    c.serialNoInfo?.some((s) => s.tssExpiryDate || s.endDate) ||
    c.serialNoInfo?.[0]?.tssExpiryDate ||
    c.serialNoInfo?.[0]?.endDate ||
    !!c.tssDetails?.endDate ||
    c.tssDetails?.status === 'active' ||
    c.tssDetails?.status === 'expiring'
  );

const daysUntil = (date?: string, startDate?: string) => {
  return calculateRemainingDays(date, startDate);
};

const textValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '—';
};

const customerPhone = (c: Customer) => c.phone || c.primaryContactInfo?.mobile || '—';
const customerContact = (c: Customer) => c.contact || c.primaryContactInfo?.contactName1 || '—';
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
const customerLocation = (c: Customer) => textValue(
  c.companyInfo?.locationArea,
  c.branchInfo?.branchName,
  c.tdlDetails?.address,
  c.address,
  c.companyInfo?.fullAddress
);

const tdlProduct = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.product, c.serialNoInfo?.[0]?.product, c.products?.[0]);

const tdlRelease = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.release, service?.releaseVersion, c.serialNoInfo?.[0]?.releaseVersion, c.companyInfo?.releaseVersion);

const tdlSerialNo = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(
    service?.licenseSerialNo,
    c.tdlDetails?.licenseSerialNo,
    c.serialNoInfo?.[0]?.tdlSerialNo,
    c.serialNoInfo?.[0]?.tdlSerialNos?.[0]?.serialNo,
    c.serialNoInfo?.[0]?.licenses?.[0]?.licenceSerialNo,
    c.licenseSerialNo
  );

const tdlStatus = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const explicit = (service?.status && service.status !== 'none' ? service.status : undefined) ||
    (c.tdlDetails?.status && c.tdlDetails.status !== 'none' ? c.tdlDetails.status : undefined) ||
    (c.serialNoInfo?.[0]?.isTdl || c.serialNoInfo?.[0]?.tdlEnabled ? 'active' : undefined);
  const endDate = tdlEndDate(c, service);
  return computeServiceStatus(endDate, explicit);
};

const tdlStartDate = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  service?.startDate || c.tdlDetails?.startDate || c.serialNoInfo?.[0]?.startDate;

const tdlEndDate = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  service?.endDate || c.tdlDetails?.endDate || c.serialNoInfo?.[0]?.endDate;

const tdlDays = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const explicit = service?.noOfDays ?? c.tdlDetails?.noOfDays ?? c.tdlDetails?.days;
  if (explicit !== undefined && explicit !== null) return String(explicit);
  const days = daysUntil(tdlEndDate(c, service) as any, tdlStartDate(c, service) as any);
  return days === null ? '—' : String(days);
};

const tdlNoOfDays = tdlDays;

const tdlColumnCount = 16;

const moduleListRows = (customers: Customer[], type: CustomerService['type'], hasLegacy: (c: Customer) => boolean): ModuleListRow[] =>
  customers.flatMap((customer) => {
    let services: CustomerService[] = [];

    if (type === 'tdl') {
      const directTdl = (customer.services || []).filter((s) => s.type === 'tdl');
      const rawAmcTdl = (customer.services || [])
        .filter((s) => s.type === 'amc' && (s.isTdl || (s as any).tdlEnabled))
        .map((s, idx) => ({
          ...s,
          type: 'tdl' as const,
          status: computeServiceStatus(s.endDate, (s.status && s.status !== 'none' ? s.status : undefined) || 'active'),
          details: s.details || 'Product TDL Add-on',
          _id: s._id || `amc-tdl-${idx}`,
        }));
      services = mergeModuleServicesBySerial(directTdl, rawAmcTdl);
      if (services.length === 0 && customer.serialNoInfo) {
        const serialTdl = customer.serialNoInfo
          .filter((s) => s.isTdl || (s as any).tdlEnabled)
          .map((s, idx) => ({
            type: 'tdl' as const,
            quantity: 1,
            companyType: 'head_office' as const,
            product: s.product,
            licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
            details: s.notes || 'Product TDL Add-on',
            startDate: s.startDate,
            endDate: s.endDate,
            _id: `serial-tdl-${idx}`,
          } as CustomerService));
        services = serialTdl;
      }
    } else if (type === 'tss') {
      const directTss = (customer.services || [])
        .filter((s) => s.type === 'tss')
        .map((s, idx) => ({
          ...s,
          type: 'tss' as const,
          endDate: s.endDate || s.tssExpiryDate,
          status: computeServiceStatus(s.endDate || s.tssExpiryDate, (s.status && s.status !== 'none' ? s.status : undefined) || 'active'),
          _id: s._id || `tss-${idx}`,
        }));
      const rawAmcTss = (customer.services || [])
        .filter((s) => s.type === 'amc' && s.tssExpiryDate)
        .map((s, idx) => ({
          ...s,
          type: 'tss' as const,
          endDate: s.tssExpiryDate,
          status: computeServiceStatus(s.tssExpiryDate, s.licenceStatus || (s.status && s.status !== 'none' ? s.status : undefined) || 'active'),
          details: s.details || 'Tracked from Product & License',
          _id: s._id || `amc-tss-${idx}`,
        }));
      services = mergeModuleServicesBySerial(directTss, rawAmcTss);
      if (services.length === 0 && customer.serialNoInfo) {
        const serialTss = customer.serialNoInfo
          .filter((s) => s.tssExpiryDate || s.endDate)
          .map((s, idx) => {
            const endDate = s.tssExpiryDate || s.endDate;
            return {
              type: 'tss' as const,
              quantity: 1,
              companyType: 'head_office' as const,
              companyName: s.companyName || customer.name,
              address: s.address || customer.address,
              product: s.product,
              licenceType: s.licenceType,
              licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
              startDate: s.startDate,
              endDate,
              status: computeServiceStatus(endDate, s.isAmcActive ? 'active' : 'active'),
              details: s.notes,
              currentPrice: s.pricingDetails?.currentPrice,
              _id: `serial-tss-${idx}`,
            } as CustomerService;
          });
        services = serialTss;
      }
    } else if (type === 'cloud') {
      services = (customer.services || []).filter((s) => s.type === 'cloud');
    }

    if (services.length > 0) {
      return services.map((service, idx) => ({
        customer,
        service,
        rowKey: `${customer._id}-${type}-${service._id || idx}`,
      }));
    }
    return hasLegacy(customer) ? [{ customer, rowKey: `${customer._id}-${type}-legacy` }] : [];
  });

const tssProduct = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.product, c.serialNoInfo?.[0]?.product, c.products?.[0]);

const tssRelease = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.release, service?.releaseVersion, c.serialNoInfo?.[0]?.releaseVersion, c.companyInfo?.releaseVersion);

const tssSerialNo = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(
    service?.licenseSerialNo,
    c.tssDetails?.licenseSerialNo,
    c.serialNoInfo?.[0]?.licenseSerialNo,
    c.serialNoInfo?.[0]?.licenses?.[0]?.licenceSerialNo,
    c.licenseSerialNo
  );

const tssExpiryDate = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  if (service) {
    const directDate = service.endDate || (service as any).tssExpiryDate;
    if (directDate) return directDate;
  }
  const dates: string[] = [];
  (c.services || []).forEach((s) => {
    if (s.type === 'tss' && s.endDate) dates.push(String(s.endDate));
    if (s.tssExpiryDate) dates.push(String(s.tssExpiryDate));
  });
  (c.serialNoInfo || []).forEach((row) => {
    if (row.tssExpiryDate) dates.push(String(row.tssExpiryDate));
    if (row.endDate) dates.push(String(row.endDate));
  });
  if (c.tssDetails?.endDate) dates.push(String(c.tssDetails.endDate));

  const valid = dates
    .map((d) => ({ raw: d, time: new Date(d).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);

  return valid[0]?.raw || null;
};

const tssStatus = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const explicit = (service?.status && service.status !== 'none' ? service.status : undefined) ||
    (c.tssDetails?.status && c.tssDetails.status !== 'none' ? c.tssDetails.status : undefined) ||
    c.serialNoInfo?.[0]?.licenceStatus ||
    c.serialNoInfo?.[0]?.licenses?.[0]?.licenceStatus;
  const expiry = tssExpiryDate(c, service);
  return computeServiceStatus(expiry, explicit);
};

export const tssContactPerson = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const keyContactNames = (c.keyContacts || []).map((k) => k.contactName?.trim()).filter(Boolean);
  const contactsJoined = keyContactNames.length > 1 ? keyContactNames.join(' / ') : keyContactNames[0];
  return textValue(contactsJoined, c.contact, c.primaryContactInfo?.contactName1, service?.contactPerson, c.tssDetails?.contactPerson);
};

export const tssMobile = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const keyContactMobiles = (c.keyContacts || []).map((k) => k.mobile?.trim()).filter(Boolean);
  const mobilesJoined = keyContactMobiles.length > 1 ? keyContactMobiles.join(', ') : keyContactMobiles[0];
  return textValue(mobilesJoined, c.phone, c.primaryContactInfo?.mobile, service?.mobile, c.tssDetails?.mobile);
};

export const tssEmail = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(c.email, c.primaryContactInfo?.email, c.keyContacts?.[0]?.email, service?.email, c.tssDetails?.email);

const isNoPartner = (value?: string | null): boolean =>
  !value || /^(no partner|nil|none|—|-)$/i.test(String(value).trim());

export const modulePartnerName = (
  c: Customer,
  service?: NonNullable<Customer['services']>[number],
  moduleFallback?: any
): string => {
  // Check if customer has AMC service with legacy partner companyName (when Partner Details was stored in companyName)
  const amcService = (c.services || []).find((s) => s.type === 'amc');
  const custName = (c.name || '').trim().toLowerCase();
  const amcCompanyName = (amcService?.companyName || '').trim();
  const amcPartnerFromCompany = (amcCompanyName && amcCompanyName.toLowerCase() !== custName)
    ? amcCompanyName
    : undefined;

  // 1. Direct vendorCategory / partner on the specific service entry
  const servicePartner = service?.vendorCategory || (service as any)?.partnerName || (service as any)?.partner || (service as any)?.vendor;
  if (servicePartner && !isNoPartner(servicePartner)) {
    if (String(servicePartner).trim().toLowerCase() === 'welcome' && amcPartnerFromCompany && amcPartnerFromCompany.toLowerCase() !== 'welcome') {
      return amcPartnerFromCompany;
    }
    return String(servicePartner).trim();
  }

  // 1b. Fallback to AMC legacy partner companyName
  if (amcPartnerFromCompany) {
    return amcPartnerFromCompany;
  }

  // 2. Customer-level partnerDetails array
  const partnerNames = (c.partnerDetails || [])
    .map((p) => (p.companyName || p.fullName || p.service || '').trim())
    .filter((name) => name && !isNoPartner(name));

  if (partnerNames.length > 0) {
    const unique = Array.from(new Set(partnerNames));
    return unique.join(', ');
  }

  // 3. Fallback to module-specific details or amcDetails vendorCategory
  const moduleVendor = moduleFallback?.vendorCategory || (moduleFallback as any)?.vendor;
  if (moduleVendor && !isNoPartner(moduleVendor)) {
    return String(moduleVendor).trim();
  }

  const amcVendor = c.amcDetails?.vendorCategory;
  if (amcVendor && !isNoPartner(amcVendor)) {
    return String(amcVendor).trim();
  }

  return '—';
};

export const tssPartnerName = (c: Customer, service?: NonNullable<Customer['services']>[number]): string =>
  modulePartnerName(c, service, c.tssDetails);

export const tdlPartnerName = (c: Customer, service?: NonNullable<Customer['services']>[number]): string =>
  modulePartnerName(c, service, c.tdlDetails);

export const cloudPartnerName = (c: Customer, service?: NonNullable<Customer['services']>[number]): string =>
  modulePartnerName(c, service, c.cloudDetails);

const tssColumnCount = 14;

const cloudProduct = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.product, c.cloudDetails?.vendor, c.cloudDetails?.vendorCategory, c.products?.[0]);

const cloudVendor = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.vendor, c.cloudDetails?.vendor);

const cloudRelease = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.release, service?.releaseVersion, c.cloudDetails?.release, c.companyInfo?.releaseVersion);

const cloudDomainSubId = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.domainLinkSubId, c.cloudDetails?.domainLinkSubId);

const cloudUsers = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  textValue(service?.noOfUsers, service?.users?.length, c.cloudDetails?.noOfUsers, c.cloudDetails?.users?.length);

const cloudStartDate = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  service?.startDate || c.cloudDetails?.cloudStartDate || c.cloudDetails?.startDate;

const cloudExpiryDate = (c: Customer, service?: NonNullable<Customer['services']>[number]) =>
  service?.endDate || c.cloudDetails?.cloudExpiryDate || c.cloudDetails?.endDate;

const cloudStatus = (c: Customer, service?: NonNullable<Customer['services']>[number]) => {
  const explicit = (service?.status && service.status !== 'none' ? service.status : undefined) ||
    (c.cloudDetails?.status && c.cloudDetails.status !== 'none' ? c.cloudDetails.status : undefined);
  const expiry = cloudExpiryDate(c, service);
  return computeServiceStatus(expiry, explicit);
};

const cloudColumnCount = 12;

type ModuleType = 'tdl' | 'cloud' | 'tss';

const moduleWhatsappMessage = (
  c: Customer,
  moduleName: 'TDL' | 'Cloud' | 'TSS',
  rows: Array<[string, string]>
) => [
  `Hello ${customerContact(c) === '—' ? 'Customer' : customerContact(c)},`,
  '',
  `Sharing your WelcomeTech ${moduleName} details:`,
  `Customer: ${c.name || c.companyInfo?.customerName || '—'}`,
  ...rows.map(([label, value]) => `${label}: ${value || '—'}`),
  '',
  'Thank you.',
].join('\n');

const toDateInput = (value?: string) => value ? String(value).split('T')[0] : '';
const getNextCalendarDay = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '';
  const rawStr = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
  const datePart = rawStr.split('T')[0].trim();
  const parts = datePart.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
  const dt = new Date(year, month, day);
  dt.setDate(dt.getDate() + 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const calculateRenewalExpiry = (startDateStr: string, period = '1 Year'): string => {
  if (!startDateStr) return '';
  const rawStr = startDateStr.split('T')[0].trim();
  const parts = rawStr.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const dt = new Date(year, month, day);
  if (period === '6 Months') dt.setMonth(dt.getMonth() + 6);
  else if (period === '2 Years') dt.setFullYear(dt.getFullYear() + 2);
  else if (period === '3 Years') dt.setFullYear(dt.getFullYear() + 3);
  else dt.setFullYear(dt.getFullYear() + 1);

  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const calculateStartDateFromExpiry = (expiryDateStr?: string | Date | null, period = '1 Year'): string => {
  if (!expiryDateStr) return '';
  const rawStr = (typeof expiryDateStr === 'string' ? expiryDateStr : new Date(expiryDateStr).toISOString()).split('T')[0].trim();
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

const nextDayInput = getNextCalendarDay;

export const tdlListExportRows = (rows: ModuleListRow[]) => rows.map(({ customer: c, service }, idx) => {
  const startDate = tdlStartDate(c, service);
  const endDate = tdlEndDate(c, service);
  const status = tdlStatus(c, service);
  const days = tdlNoOfDays(c, service);

  return {
    'S NO': idx + 1,
    'Company Name': c.name || textValue(c.tdlDetails?.companyName, service?.companyName, '—'),
    'Partner Name': tdlPartnerName(c, service),
    Mobile: customerPhone(c),
    Location: customerLocation(c),
    'Sales 1': textValue(service?.salesman1, c.tdlDetails?.salesman1),
    'Sales 2': textValue(service?.salesman2, c.tdlDetails?.salesman2),
    Product: tdlProduct(c, service),
    Release: tdlRelease(c, service),
    'Serial No': tdlSerialNo(c, service),
    Status: status ? status.charAt(0).toUpperCase() + status.slice(1) : '—',
    Days: days !== '—' ? String(days) : '—',
    'Start Date': startDate ? fmt.date(startDate as any) : '—',
    'End Date': endDate ? fmt.date(endDate as any) : '—',
  };
});

export const tssListExportRows = (rows: ModuleListRow[]) => rows.map(({ customer: c, service }, idx) => {
  const expiryDate = tssExpiryDate(c, service);
  const startDate = service?.startDate || c.tssDetails?.startDate || c.serialNoInfo?.[0]?.startDate;
  const status = tssStatus(c, service);

  return {
    'S NO': idx + 1,
    'Company Name': c.name || textValue(c.tssDetails?.companyName, service?.companyName, '—'),
    'Partner Name': tssPartnerName(c, service),
    Product: tssProduct(c, service),
    Release: tssRelease(c, service),
    'License Serial': tssSerialNo(c, service),
    'Expiry Date': expiryDate ? fmt.date(expiryDate as any) : '—',
    Contact: tssContactPerson(c, service),
    Mobile: tssMobile(c, service),
    Email: tssEmail(c, service),
    Status: status ? status.charAt(0).toUpperCase() + status.slice(1) : '—',
  };
});

export const cloudListExportRows = (rows: ModuleListRow[]) => rows.map(({ customer: c, service }, idx) => {
  const startDate = cloudStartDate(c, service);
  const endDate = cloudExpiryDate(c, service);
  const userList = service?.users || c.cloudDetails?.users || [];
  const userDetailsStr = userList.map((u: any) => u.username || u.name || u.email).filter(Boolean).join(', ') || '—';
  const status = cloudStatus(c, service);

  return {
    'S NO': idx + 1,
    'Company Name': c.name || textValue(c.cloudDetails?.companyName, service?.companyName, '—'),
    'Partner Name': cloudPartnerName(c, service),
    Product: cloudProduct(c, service),
    Release: cloudRelease(c, service),
    'Domain / Sub ID': cloudDomainSubId(c, service),
    Users: cloudUsers(c, service),
    'Start Date': startDate ? fmt.date(startDate as any) : '—',
    'End Date': endDate ? fmt.date(endDate as any) : '—',
    'User Details': userDetailsStr,
    Status: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active',
  };
});

export const customerManagementExportRows = (customers: Customer[]) => customers.map((c, idx) => ({
  'S NO': idx + 1,
  Customer: c.name || '—',
  Contact: customerContact(c),
  Phone: customerPhone(c),
  Products: (c.products || []).filter(Boolean).join(', ') || '—',
  Status: (c as any).status ? String((c as any).status).charAt(0).toUpperCase() + String((c as any).status).slice(1) : 'Active',
  AMC: c.amcStatus ? c.amcStatus.charAt(0).toUpperCase() + c.amcStatus.slice(1) : '—',
  Updated: c.updatedAt ? fmt.date(c.updatedAt) : '—',
}));

const moduleDetailOf = (customer: Customer, type: ModuleType) => {
  if (type === 'tdl') return customer.tdlDetails || {};
  if (type === 'cloud') return customer.cloudDetails || {};
  return customer.tssDetails || {};
};

const moduleLabelOf = (type: ModuleType) => type === 'tdl' ? 'TDL' : type === 'cloud' ? 'Cloud' : 'TSS';

const moduleCurrentRange = (customer: Customer, type: ModuleType, selectedService?: CustomerService) => {
  const service = selectedService || customer.services?.find((s) => s.type === type);
  if (type === 'tdl') return { start: tdlStartDate(customer, service), end: tdlEndDate(customer, service) };
  if (type === 'cloud') return { start: cloudStartDate(customer, service), end: cloudExpiryDate(customer, service) };
  return { start: service?.startDate || customer.tssDetails?.startDate, end: tssExpiryDate(customer, service) };
};

const moduleCurrentAmount = (customer: Customer, type: ModuleType, selectedService?: CustomerService) => {
  if (selectedService) return selectedService.currentPrice ?? selectedService.actualPrice ?? selectedService.remainingTotal ?? null;
  const details = moduleDetailOf(customer, type);
  return details.currentPrice ?? details.actualPrice ?? null;
};

const moduleSubtitle = (customer: Customer, type: ModuleType, selectedService?: CustomerService) => {
  const service = selectedService || customer.services?.find((s) => s.type === type);
  if (type === 'tdl') return [tdlProduct(customer, service), tdlSerialNo(customer, service)].filter((v) => v && v !== '—').join(' · ') || 'TDL Add-on';
  if (type === 'cloud') return [cloudProduct(customer, service), cloudDomainSubId(customer, service)].filter((v) => v && v !== '—').join(' · ') || 'Cloud Hub';
  return [tssProduct(customer, service), tssSerialNo(customer, service)].filter((v) => v && v !== '—').join(' · ') || 'TSS Premium';
};

const ModuleRenewalHistoryModal: React.FC<{
  type: ModuleType;
  customer: Customer | null;
  service?: CustomerService;
  onClose: () => void;
}> = ({ type, customer, service, onClose }) => {
  const queryClient = useQueryClient();
  const [isRenewing, setIsRenewing] = React.useState(false);
  const [editingRenewalIdx, setEditingRenewalIdx] = React.useState<number | null>(null);
  const [renewalForm, setRenewalForm] = React.useState<Partial<AMCRenewal>>({});
  const [localHistory, setLocalHistory] = React.useState<AMCRenewal[]>([]);
  const [currentOverride, setCurrentOverride] = React.useState<{ start?: string; end?: string; amount?: number | null } | null>(null);
  const [confirmRenewalDelete, setConfirmRenewalDelete] = React.useState<{ renewal: AMCRenewal; originalIdx: number } | null>(null);

  React.useEffect(() => {
    const rawHistory = (((service || (customer ? moduleDetailOf(customer, type) : {})) as any).renewalHistory || []) as AMCRenewal[];
    const cleanHistory = rawHistory.filter(
      (r) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
    );
    setLocalHistory(cleanHistory);
    setIsRenewing(false);
    setEditingRenewalIdx(null);
    setRenewalForm({});
    setCurrentOverride(null);
    setConfirmRenewalDelete(null);
  }, [customer, service, type]);

  const label = moduleLabelOf(type);
  const detailKey = type === 'tdl' ? 'tdlDetails' : type === 'cloud' ? 'cloudDetails' : 'tssDetails';
  const details = service || (customer ? moduleDetailOf(customer, type) : {});
  const serviceId = service?._id ? String(service._id) : '';
  const baseCurrentRange = customer ? moduleCurrentRange(customer, type, service) : { start: undefined, end: undefined };
  const currentRange = {
    start: currentOverride?.start ?? baseCurrentRange.start,
    end: currentOverride?.end ?? baseCurrentRange.end,
  };
  const currentAmount = currentOverride?.amount ?? (customer ? moduleCurrentAmount(customer, type, service) : null);

  const patchSelectedService = async (renewalHistory: AMCRenewal[], extras: Partial<CustomerService> = {}) => {
    if (!customer || !serviceId) throw new Error('No active service selected');
    const sanitizedHistory = (renewalHistory || []).filter(
      (r) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
    );
    const services = (customer.services || []).map((item) => {
      if (String(item._id || '') === serviceId) {
        return {
          ...item,
          initialStartDate: item.initialStartDate || (extras as any).initialStartDate || item.startDate,
          initialEndDate: item.initialEndDate || (extras as any).initialEndDate || item.endDate || item.tssExpiryDate,
          ...extras,
          renewalHistory: sanitizedHistory,
        };
      }
      const otherHistory = Array.isArray(item.renewalHistory)
        ? item.renewalHistory.filter((r: any) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal')))
        : [];
      return {
        ...item,
        renewalHistory: otherHistory,
      };
    });
    const res = await api.patch(`/customers/${customer._id}`, {
      name: customer.name,
      services,
    });
    return res.data.data as Customer;
  };

  const selectedServiceFrom = (updatedCustomer: Customer) =>
    serviceId ? updatedCustomer.services?.find((item) => String(item._id || '') === serviceId) : undefined;

  const renewMut = useMutation({
    mutationFn: async (renewal: AMCRenewal) => {
      if (!customer) throw new Error('No active customer selected');
      if (serviceId) {
        let historyToSave = [...localHistory];
        const hasInitial = historyToSave.some((r) => r.period === 'Initial Contract');
        if (!hasInitial) {
          const initialExpiry = (service?.endDate as string) || (service?.tssExpiryDate as string) || (service?.startDate as string) || new Date().toISOString().split('T')[0];
          let initialStart = (service?.startDate as string) || (service?.initialStartDate as string);
          if (!initialStart || (initialExpiry && new Date(initialStart) > new Date(initialExpiry))) {
            initialStart = initialExpiry ? calculateStartDateFromExpiry(initialExpiry, '1 Year') : (service?.createdAt as string) || new Date().toISOString().split('T')[0];
          }
          const initialEntry: AMCRenewal = {
            period: 'Initial Contract',
            renewedOn: initialStart,
            startDate: initialStart,
            expiryDate: initialExpiry,
            amount: Number(service?.currentPrice ?? service?.actualPrice ?? 0),
            paymentMethod: 'Main Record',
            notes: service?.details || 'Initial Record',
          };
          historyToSave = [initialEntry, ...historyToSave];
        } else {
          historyToSave = historyToSave.map((r) => {
            if (r.period === 'Initial Contract' && r.expiryDate && (!r.startDate || new Date(r.startDate) > new Date(r.expiryDate))) {
              const healedStart = calculateStartDateFromExpiry(r.expiryDate, r.period || '1 Year');
              return {
                ...r,
                startDate: healedStart,
                renewedOn: r.renewedOn && new Date(r.renewedOn) > new Date(r.expiryDate) ? healedStart : (r.renewedOn || healedStart),
              };
            }
            return r;
          });
        }
        const initialRow = historyToSave.find((r) => r.period === 'Initial Contract');
        const initialStart = initialRow?.startDate || service?.initialStartDate || service?.startDate;
        const initialEnd = initialRow?.expiryDate || service?.initialEndDate || service?.endDate || service?.tssExpiryDate;

        return patchSelectedService([...historyToSave, renewal], {
          startDate: renewal.startDate,
          endDate: renewal.expiryDate,
          initialStartDate: initialStart,
          initialEndDate: initialEnd,
          currentPrice: renewal.amount,
          status: 'active',
        });
      }
      const res = await api.patch(`/${type}/${customer._id}/renew`, {
        newStartDate: renewal.startDate,
        newExpiryDate: renewal.expiryDate,
        moduleDetails: {
          ...details,
          currentPrice: renewal.amount,
        },
        renewalData: renewal,
      });
      return res.data.data as Customer;
    },
    onSuccess: (updatedCustomer) => {
      toast.success(`${label} renewal processed`);
      const updatedDetails = serviceId ? selectedServiceFrom(updatedCustomer) : moduleDetailOf(updatedCustomer, type);
      const updated = (((updatedDetails as any)?.renewalHistory || []) as AMCRenewal[]);
      setLocalHistory(updated);
      setCurrentOverride(null);
      setIsRenewing(false);
      setRenewalForm({});
      queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
      queryClient.invalidateQueries({ queryKey: ['customers-management-insights'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-all'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || `Failed to process ${label} renewal`),
  });

  const updateRenewalMut = useMutation({
    mutationFn: async ({ index, renewal }: { index: number; renewal: AMCRenewal }) => {
      if (!customer) throw new Error('No active customer selected');
      const updated = [...localHistory];
      updated[index] = renewal;
      if (serviceId) {
        await patchSelectedService(updated);
        return updated;
      }
      await api.patch(`/customers/${customer._id}`, {
        name: customer.name,
        [detailKey]: {
          ...details,
          renewalHistory: updated,
        },
      });
      return updated;
    },
    onSuccess: (updated) => {
      toast.success(`${label} renewal record updated`);
      setLocalHistory(updated);
      setEditingRenewalIdx(null);
      setRenewalForm({});
      queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
      queryClient.invalidateQueries({ queryKey: ['customers-management-insights'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-all'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || `Failed to update ${label} renewal record`),
  });

  const deleteRenewalMut = useMutation({
    mutationFn: async (index: number) => {
      if (!customer) throw new Error('No active customer selected');
      const cleanHistory = localHistory.filter(
        (r) => r && (r.startDate || r.expiryDate || r.renewedOn || r.amount != null || (r.period && r.period !== 'Renewal'))
      );
      if (index < 0 || index >= cleanHistory.length) {
        throw new Error('Invalid renewal index');
      }
      const updated = cleanHistory.filter((_, idx) => idx !== index);
      if (serviceId) {
        await patchSelectedService(updated);
        return updated;
      }
      await api.patch(`/customers/${customer._id}`, {
        name: customer.name,
        [detailKey]: {
          ...details,
          renewalHistory: updated,
        },
      });
      return updated;
    },
    onSuccess: (updated) => {
      toast.success(`${label} renewal record deleted`);
      setLocalHistory(updated);
      setConfirmRenewalDelete(null);
      queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
      queryClient.invalidateQueries({ queryKey: ['customers-management-insights'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-all'] });
    },
    onError: (err: any) => {
      setConfirmRenewalDelete(null);
      toast.error(err?.response?.data?.message || `Failed to delete ${label} renewal record`);
    },
  });

  if (!customer) return null;

  const openRenewalForm = () => {
    let latestExpiry: any = currentRange.end;
    for (const rh of localHistory) {
      if (rh.expiryDate && (!latestExpiry || new Date(rh.expiryDate) > new Date(latestExpiry))) {
        latestExpiry = rh.expiryDate;
      }
    }
    const nextStart = latestExpiry ? getNextCalendarDay(latestExpiry) : '';
    const period = '1 Year';
    setRenewalForm({
      period,
      paymentMethod: 'Bank Transfer',
      renewedOn: new Date().toISOString().split('T')[0],
      startDate: nextStart,
      expiryDate: nextStart ? calculateRenewalExpiry(nextStart, period) : '',
      amount: currentAmount || 0,
    });
    setIsRenewing(true);
  };

  const openRenewalEdit = (renewal: AMCRenewal, index: number) => {
    setRenewalForm({
      ...renewal,
      renewedOn: toDateInput(renewal.renewedOn),
      startDate: toDateInput(renewal.startDate || renewal.renewedOn),
      expiryDate: toDateInput(renewal.expiryDate),
    });
    setEditingRenewalIdx(index);
  };

  const setRenewalField = (field: keyof AMCRenewal, value: any) => {
    setRenewalForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'startDate' || field === 'period') {
        updated.expiryDate = calculateRenewalExpiry(updated.startDate || '', updated.period || '1 Year');
      }
      return updated;
    });
  };

  return (
    <>
      <Modal
        open={!!customer}
        onClose={onClose}
        title={`${label} Renewal Details`}
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn btn-cancel" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={openRenewalForm}><RefreshCw size={13} /> Process Renewal</button>
          </div>
        }
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Avatar name={customer.name} src={customer.avatar} size="md" />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{customer.name}</span>
                {customer.customerNumber && (
                  <span className="badge badge-purple font-mono" style={{ fontSize: 11.5, padding: '2px 7px', fontWeight: 700 }}>
                    {customer.customerNumber}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 3 }}>{moduleSubtitle(customer, type, service)}</div>
            </div>
          </div>
          {details.status ? <Badge status={details.status as any} /> : null}
        </div>

        <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--tx-4)', marginBottom: 10 }}>Renewal & Billing History</div>
        <div className="tbl-wrap amc-renewal-table-wrap">
          <table className="table-pro table-center amc-renewal-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Period</th>
                <th style={{ width: 110 }}>Renewed</th>
                <th style={{ width: 110 }}>Start Date</th>
                <th style={{ width: 110 }}>Expiry Date</th>
                <th style={{ width: 120 }}>Amount</th>
                <th style={{ width: 120 }}>Payment</th>
                <th style={{ width: 90 }}>Ref/Inv</th>
                <th style={{ width: 96 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const initialEntry = localHistory.find((r) => r.period === 'Initial Contract');
                const renewals = localHistory.filter((r) => r.period !== 'Initial Contract');
                const hasRenewals = renewals.length > 0;

                const initialEnd = initialEntry?.expiryDate 
                  || (details as any).initialEndDate 
                  || (service as any)?.initialEndDate
                  || (hasRenewals ? undefined : currentRange.end) 
                  || currentRange.end;

                let initialStart = initialEntry?.startDate 
                  || (details as any).initialStartDate 
                  || (service as any)?.initialStartDate
                  || (hasRenewals ? undefined : currentRange.start);

                // If initialStart is missing, or invalid (after initialEnd), calculate from initialEnd
                if (!initialStart || (initialEnd && new Date(initialStart) > new Date(initialEnd))) {
                  initialStart = initialEnd ? calculateStartDateFromExpiry(initialEnd, initialEntry?.period || '1 Year') : currentRange.start;
                }

                const initialAmount = initialEntry?.amount 
                  ?? (details as any).initialPrice 
                  ?? (service as any)?.initialPrice
                  ?? (hasRenewals ? 0 : currentAmount);

                const renewedOnDisplay = initialEntry?.renewedOn && (!initialEnd || new Date(initialEntry.renewedOn) <= new Date(initialEnd))
                  ? fmt.date(initialEntry.renewedOn)
                  : initialStart ? fmt.date(initialStart as any) : '—';

                return (
                  <>
                    <tr style={{ background: 'rgba(var(--green-rgb), 0.03)' }}>
                      <td style={{ fontWeight: 700, color: hasRenewals ? 'var(--tx-2)' : 'var(--green)' }}>
                        {hasRenewals ? 'Initial' : 'Current'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                        {renewedOnDisplay}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11.5 }}>{fmt.date(initialStart as any)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11.5 }}>{fmt.date(initialEnd as any)}</td>
                      <td style={{ fontWeight: 800, color: hasRenewals ? 'var(--tx-1)' : 'var(--green)', fontSize: 11.5 }}>
                        {initialAmount != null ? fmt.currency(Number(initialAmount)) : '—'}
                      </td>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>Main Record</td>
                      <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</td>
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'center' }}>
                          <button className="btn-action btn-action-amber" onClick={openRenewalForm} title="Process Renewal"><Pencil size={13} /></button>
                        </div>
                      </td>
                    </tr>
                    {renewals
                      .map((renewal) => ({ renewal, originalIdx: localHistory.indexOf(renewal) }))
                      .filter(({ renewal, originalIdx }) => originalIdx !== -1 && Boolean(renewal.startDate || renewal.expiryDate || renewal.renewedOn || renewal.amount != null || (renewal.period && renewal.period !== 'Renewal')))
                      .reverse()
                      .map(({ renewal, originalIdx }) => (
                        <tr key={`${originalIdx}-${renewal.renewedOn || ''}`}>
                          <td style={{ fontWeight: 700 }}>{renewal.period || 'Renewal'}</td>
                          <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>{fmt.date(renewal.renewedOn)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{fmt.date(renewal.startDate || renewal.renewedOn)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{fmt.date(renewal.expiryDate)}</td>
                          <td style={{ fontWeight: 700, fontSize: 11.5 }}>{renewal.amount != null ? fmt.currency(Number(renewal.amount)) : '—'}</td>
                          <td style={{ fontSize: 11 }}>{renewal.paymentMethod || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>{renewal.invoiceNo || '—'}</td>
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'center' }}>
                              <button className="btn-action btn-action-amber" onClick={() => openRenewalEdit(renewal, originalIdx)} title="Edit Renewal"><Pencil size={13} /></button>
                              <button
                                className="btn-action btn-action-red"
                                onClick={() => setConfirmRenewalDelete({ renewal, originalIdx })}
                                title="Delete Renewal"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </>
                );
              })()}
              {localHistory.filter((renewal) => renewal.period !== 'Initial Contract').length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--tx-4)', fontSize: 12 }}>No previous renewal history found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      </Modal>

      <Modal
        open={isRenewing || editingRenewalIdx !== null}
        onClose={() => { setIsRenewing(false); setEditingRenewalIdx(null); setRenewalForm({}); }}
        title={editingRenewalIdx !== null ? `Edit ${label} Renewal Record` : `Process ${label} Renewal`}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn btn-cancel" onClick={() => { setIsRenewing(false); setEditingRenewalIdx(null); setRenewalForm({}); }}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={renewMut.isPending || updateRenewalMut.isPending}
              onClick={() => {
                const renewal = {
                  renewedOn: renewalForm.renewedOn || new Date().toISOString(),
                  period: renewalForm.period || '1 Year',
                  startDate: renewalForm.startDate || '',
                  expiryDate: renewalForm.expiryDate || '',
                  amount: Number(renewalForm.amount) || 0,
                  paymentMethod: renewalForm.paymentMethod || 'Bank Transfer',
                  invoiceNo: renewalForm.invoiceNo || undefined,
                  notes: renewalForm.notes || undefined,
                };
                if (!renewal.startDate || !renewal.expiryDate) {
                  toast.error('Start and expiry dates are required');
                  return;
                }
                if (renewal.amount <= 0) {
                  toast.error('A positive renewal amount is required');
                  return;
                }
                if (editingRenewalIdx !== null) {
                  updateRenewalMut.mutate({ index: editingRenewalIdx, renewal });
                } else {
                  renewMut.mutate(renewal);
                }
              }}
            >
              {renewMut.isPending || updateRenewalMut.isPending ? <Spinner size={14} /> : <RefreshCw size={14} />}
              {renewMut.isPending || updateRenewalMut.isPending ? 'Saving...' : editingRenewalIdx !== null ? 'Update Record' : 'Process Renewal'}
            </button>
          </div>
        }
      >
        <div className="form-grid-2">
          <InputField label="Start Date" value={renewalForm.startDate || ''} onChange={(v) => setRenewalField('startDate', v)} type="date" />
          <InputField label="Expiry Date" value={renewalForm.expiryDate || ''} onChange={(v) => setRenewalField('expiryDate', v)} type="date" />
          <InputField label={`Amount (${getActiveCurrency()})`} value={renewalForm.amount || ''} onChange={(v) => setRenewalField('amount', Number(v))} type="number" />
          <InputField label="Renewed On" value={renewalForm.renewedOn || ''} onChange={(v) => setRenewalField('renewedOn', v)} type="date" />
          <SelectField
            label="Period"
            value={renewalForm.period || '1 Year'}
            onChange={(v) => setRenewalField('period', v)}
            options={[
              { value: '6 Months', label: '6 Months' },
              { value: '1 Year', label: '1 Year' },
              { value: '2 Years', label: '2 Years' },
              { value: '3 Years', label: '3 Years' },
            ]}
          />
          <SelectField
            label="Payment Method"
            value={renewalForm.paymentMethod || 'Bank Transfer'}
            onChange={(v) => setRenewalField('paymentMethod', v)}
            options={[
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Cash', label: 'Cash' },
              { value: 'Cheque', label: 'Cheque' },
              { value: 'QPAY', label: 'QPAY' },
            ]}
          />
          <InputField label="Invoice/Ref No" value={renewalForm.invoiceNo || ''} onChange={(v) => setRenewalField('invoiceNo', v)} />
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={3} value={renewalForm.notes || ''} onChange={(e) => setRenewalForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmRenewalDelete}
        title="Delete Renewal Record"
        message="Are you sure you want to delete this renewal record from the history? This action cannot be undone."
        onConfirm={() => {
          if (confirmRenewalDelete) {
            deleteRenewalMut.mutate(confirmRenewalDelete.originalIdx);
          }
        }}
        onCancel={() => setConfirmRenewalDelete(null)}
        loading={deleteRenewalMut.isPending}
      />
    </>
  );
};

const toNumber = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const buildCustomerPatchBase = (c: Customer) => ({
  name: c.name || '',
  contact: c.contact || c.primaryContactInfo?.contactName1 || '',
  phone: c.phone || c.primaryContactInfo?.mobile || '',
  email: c.email || c.primaryContactInfo?.email || '',
  address: c.address || c.companyInfo?.fullAddress || '',
  industry: c.industry || c.companyInfo?.industry || '',
  products: c.products || [],
  licenceType: c.licenceType || c.serialNoInfo?.[0]?.licenceType || 'Silver – Single User',
  users: c.users || c.serialNoInfo?.[0]?.noOfUsers || 1,
  amcStatus: c.amcStatus || 'none',
  amcExpiry: c.amcStatus === 'none' ? null : (c.amcExpiry || c.amcDetails?.endDate || null),
  notes: c.notes || c.amcDetails?.notesRemarks || '',
  companyInfo: c.companyInfo || {},
  primaryContactInfo: c.primaryContactInfo || {},
  secondaryContactInfo: c.secondaryContactInfo || {},
  serialNoInfo: c.serialNoInfo || [],
  amcDetails: c.amcDetails || {},
  tdlDetails: c.tdlDetails || {},
  cloudDetails: c.cloudDetails || {},
});

const ManagementTable: React.FC<{
  title: string;
  subtitle: string;
  rows: Customer[];
  isLoading: boolean;
  emptyTitle: string;
}> = ({ title, subtitle, rows, isLoading, emptyTitle }) => {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  
  const filteredRows = React.useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(c => 
      c.name?.toLowerCase().includes(s) || 
      customerContact(c).toLowerCase().includes(s) ||
      customerPhone(c).toLowerCase().includes(s)
    );
  }, [rows, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-subtitle">{subtitle}</div>
        </div>
      </div>

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={() => exportExcelWorkbook(title.toLowerCase().replace(/\s+/g, '-'), [
                { name: title, rows: customerManagementExportRows(filteredRows) },
              ])}
            >
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/customers/new')}><Plus size={13} /> Add Customer</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col" style={{ textAlign: 'center' }}>S NO</th>
                <th>Customer No</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Products</th>
                <th>AMC</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, idx) => <SkeletonRow key={idx} cols={8} />)
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={<SearchCheck size={20} />} title={emptyTitle} description="No matching customers yet." />
                  </td>
                </tr>
              ) : (
                filteredRows.map((c, idx) => (
                  <tr key={c._id}>
                    <td className="sno-col" style={{ textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
                      {c.customerNumber || '—'}
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'center' }}>{c.name}</td>
                    <td style={{ textAlign: 'center' }}>{customerContact(c)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{customerPhone(c)}</td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{(c.products || []).slice(0, 2).join(', ') || '—'}</td>
                    <td style={{ textAlign: 'center' }}><Badge status={c.amcStatus} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>{fmt.date(c.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SectionDashboard: React.FC<{
  title: string;
  subtitle: string;
  kpis: Array<{ label: string; value: number | string; color?: string }>;
  actions: Array<{ label: string; path: string }>;
}> = ({ title, subtitle, kpis, actions }) => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-subtitle">{subtitle}</div>
        </div>
        <div className="actions-row">
          {actions.map((a) => (
            <button key={a.path} className="btn btn-secondary btn-sm" onClick={() => navigate(a.path)}>
              {a.label}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => exportExcelRows(title.toLowerCase().replace(/\s+/g, '-'), 'KPIs', kpis as unknown as Record<string, unknown>[])}>
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      <div className="kpi-grid mgmt-kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            <div className="kpi-title">{kpi.label}</div>
            <div className="kpi-value" style={{ color: kpi.color || 'var(--tx-1)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};


export const AMCDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data: insights, isLoading } = useCustomerManagementInsights();
  const amcDashboard = insights?.amcDashboard || {};
  const kpi = amcDashboard?.kpi || { total: 0, active: 0, expired: 0, expiring: 0 };
  const radarRows = (amcDashboard?.radarRows || []) as Array<{ customer: Customer; days: number | null }>;

  const [filter, setFilter] = React.useState('all');
  const filteredRadarRows = React.useMemo(() => {
    if (filter === '7days') return radarRows.filter(r => (r.days ?? 999) <= 7);
    if (filter === '1month') return radarRows.filter(r => (r.days ?? 999) <= 30);
    return radarRows;
  }, [radarRows, filter]);

  const kpiCards = [
    { label: 'Total AMC Customers', value: kpi.total, icon: <Shield size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All tracked contracts' },
    { label: 'Active', value: kpi.active, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Healthy contracts' },
    { label: 'Expiring (30d)', value: kpi.expiring, icon: <Clock size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Renew soon' },
    { label: 'Expired', value: kpi.expired, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Immediate action' },
  ];

  return (
    <>
      <ModernDashboardLayout
        title="AMC Dashboard"
        subtitle="Manage annual maintenance contracts and service levels"
        headerActions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/amc/list')}>AMC List</button>
            <button
              className="btn btn-export btn-sm"
              onClick={() => {
                const radarData = filteredRadarRows.map(({ customer: c, days }, idx) => ({
                  'S NO': idx + 1,
                  'Customer Name': c.name || '—',
                  'Expiry Date': c.amcExpiry ? fmt.date(c.amcExpiry) : '—',
                  Status: days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`,
                }));
                exportExcelWorkbook('amc-dashboard', [
                  { name: 'Renewal Radar', rows: radarData },
                ]);
              }}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        kpiCards={kpiCards}
        donutData={{ active: kpi.active, expiring: kpi.expiring, expired: kpi.expired, total: kpi.total }}
        recentTableTitle="AMC Renewal Radar"
        tableActions={
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'OverAll' },
              { value: '7days', label: '7 Days' },
              { value: '1month', label: '1 Month' },
            ]}
            className="filter-select"
            style={{ height: 32, fontSize: 12 }}
          />
        }
        isLoading={isLoading}
        tableHeaders={
          <>
            <th >S NO</th>
            <th >Customer Name</th>
            <th >Expiry Date</th>
            <th >Status</th>
            <th >Action</th>
          </>
        }
        tableBody={
          filteredRadarRows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: '60px', textAlign: 'center' }}><span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tx-3)' }}>No critical AMC alerts</span></td></tr>
          ) : (
            filteredRadarRows.map(({ customer: c, days }, idx) => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '20px 32px', fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{String(idx + 1).padStart(2, '0')}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>{c.name || '—'}</span>
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {fmt.date(c.amcExpiry)}
                </td>
                <td style={{ padding: '20px 32px', whiteSpace: 'nowrap' }}>
                  <span className={`badge ${days !== null && days < 0 ? 'badge-red' : days !== null && days <= 30 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px', borderRadius: '12px' }}>
                    {days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                </td>
                <td style={{ padding: '20px 32px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-3)'; }} onClick={() => navigate('/amc/list')}>
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))
          )
        }
        footerContent={
          <div className="quick-grid-3">
            {[
              { icon: <ShieldCheck size={18} />, title: 'AMC List', sub: `${kpi.total} total records`, path: '/amc/list', color: 'var(--brand)', bg: 'var(--brand-light)', bd: 'var(--border)' },
              { icon: <Users size={18} />, title: 'Customers', sub: 'Go to customer master', path: '/customers', color: 'var(--green)', bg: 'var(--green-bg)', bd: 'var(--green-bd)' },
            ].map((link, i) => (
              <button key={link.title} type="button" className="alert-card fade-in-up" style={{ animationDelay: `${(kpiCards.length + i) * 60}ms`, textAlign: 'left' }} onClick={() => navigate(link.path)}>
                <div className="alert-card-icon" style={{ background: link.bg, color: link.color, borderColor: link.bd }}>{link.icon}</div>
                <div>
                  <div className="alert-card-title">{link.title}</div>
                  <div className="alert-card-sub">{isLoading ? '—' : link.sub}</div>
                </div>
              </button>
            ))}
          </div>
        }
      />
    </>
  );
};

export const AMCListPage: React.FC = () => {
  const { data, isLoading } = useCustomers();
  const rows = (data || []).filter(c => c.amcStatus !== 'none');
  
  return (
    <ManagementTable
      title="AMC List"
      subtitle="Comprehensive view of all AMC contracts"
      rows={rows}
      isLoading={isLoading}
      emptyTitle="No AMC customers found"
    />
  );
};

export const TDLDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: insights, isLoading } = useCustomerManagementInsights();
  const dashboard = insights?.tdlDashboard || {};
  const kpi = dashboard?.kpi || { total: 0, active: 0, trial: 0, expiring: 0, expired: 0 };
  const radarRows = (dashboard?.radarRows || []) as Array<{ customer: Customer; days: number | null }>;
  const recentRows = (dashboard?.recentRows || []) as Customer[];

  const [filter, setFilter] = React.useState('all');
  const filteredRadarRows = React.useMemo(() => {
    if (filter === '7days') return radarRows.filter(r => (r.days ?? 999) <= 7);
    if (filter === '1month') return radarRows.filter(r => (r.days ?? 999) <= 30);
    return radarRows;
  }, [radarRows, filter]);

  const kpiCards = [
    { label: 'Total TDL Customers', value: kpi.total, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All tracked licenses' },
    { label: 'Active', value: kpi.active, icon: <CheckCircle size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Production-ready' },
    { label: 'Trial', value: kpi.trial, icon: <Clock size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Needs conversion' },
    { label: 'Expiring (30d)', value: kpi.expiring, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Renew soon' },
    { label: 'Expired', value: kpi.expired, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Immediate action' },
  ];

  return (
    <>
      <ModernDashboardLayout
        title="TDL Dashboard"
        subtitle="Manage TDL status, serial tracking and renewal risk"
        headerActions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tdl/list')}>TDL List</button>
            <button
              className="btn btn-export btn-sm"
              onClick={() => {
                const radarData = filteredRadarRows.map(({ customer: c, days }, idx) => ({
                  'S NO': idx + 1,
                  'Customer Name': c.name || '—',
                  Serial: tdlSerialNo(c),
                  'End Date': tdlEndDate(c) ? fmt.date(tdlEndDate(c) as any) : '—',
                  Status: days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`,
                }));
                const recentData = recentRows.map((c, idx) => ({
                  'S NO': idx + 1,
                  Customer: c.name || '—',
                  Product: tdlProduct(c),
                  Release: tdlRelease(c),
                  'Serial No': tdlSerialNo(c),
                  Status: tdlStatus(c),
                  'Start Date': tdlStartDate(c) ? fmt.date(tdlStartDate(c) as any) : '—',
                  'End Date': tdlEndDate(c) ? fmt.date(tdlEndDate(c) as any) : '—',
                }));
                exportExcelWorkbook('tdl-dashboard', [
                  { name: 'Renewal Radar', rows: radarData },
                  { name: 'Recent TDL Setups', rows: recentData },
                ]);
              }}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        kpiCards={kpiCards}
        donutData={{ active: kpi.active, expiring: kpi.expiring, expired: kpi.expired, total: kpi.total }}
        recentTableTitle="TDL Renewal Radar"
        tableActions={
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'OverAll' },
              { value: '7days', label: '7 Days' },
              { value: '1month', label: '1 Month' },
            ]}
            className="filter-select"
            style={{ height: 32, fontSize: 12 }}
          />
        }
        isLoading={isLoading}
        tableHeaders={
          <>
            <th >S NO</th>
            <th >Customer Name</th>
            <th >Serial</th>
            <th >End Date</th>
            <th >Status</th>
            <th >Action</th>
          </>
        }
        tableBody={
          filteredRadarRows.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '60px', textAlign: 'center' }}><span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tx-3)' }}>No TDL renewal risks</span></td></tr>
          ) : (
            filteredRadarRows.map(({ customer: c, days }, idx) => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '20px 32px', fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{String(idx + 1).padStart(2, '0')}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>{c.name || '—'}</span>
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {c.tdlDetails?.licenseSerialNo || c.serialNoInfo?.[0]?.licenses?.[0]?.licenceSerialNo || '—'}
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {fmt.date(c.tdlDetails?.endDate)}
                </td>
                <td style={{ padding: '20px 32px', whiteSpace: 'nowrap' }}>
                  <span className={`badge ${days !== null && days < 0 ? 'badge-red' : days !== null && days <= 30 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px', borderRadius: '12px' }}>
                    {days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                </td>
                <td style={{ padding: '20px 32px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-3)'; }} onClick={() => navigate('/tdl/list')}>
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))
          )
        }
        footerContent={
          <div className="quick-grid-3">
            {[
              { icon: <ShieldCheck size={18} />, title: 'TDL List', sub: `${kpi.total} total records`, path: '/tdl/list', color: 'var(--brand)', bg: 'var(--brand-light)', bd: 'var(--border)' },
              { icon: <Users size={18} />, title: 'Customers', sub: 'Go to customer master', path: '/customers', color: 'var(--purple)', bg: 'var(--purple-bg)', bd: 'var(--purple-bd)' },
            ].map((link, i) => (
              <button key={link.title} type="button" className="alert-card fade-in-up" style={{ animationDelay: `${(kpiCards.length + i) * 60}ms`, textAlign: 'left' }} onClick={() => navigate(link.path)}>
                <div className="alert-card-icon" style={{ background: link.bg, color: link.color, borderColor: link.bd }}>{link.icon}</div>
                <div>
                  <div className="alert-card-title">{link.title}</div>
                  <div className="alert-card-sub">{isLoading ? '—' : link.sub}</div>
                </div>
              </button>
            ))}
          </div>
        }
      />
    </>
  );
};

const TDLTableRow: React.FC<{
  c: Customer;
  idx: number;
  service?: CustomerService;
  isSelected: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  onToggleSelect: () => void;
  openViewForCustomer: (c: Customer, service?: CustomerService) => void;
}> = ({ c, idx, service, isSelected, selectedTemplateId = '', onTemplateChange, onToggleSelect, openViewForCustomer }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = tdlStatus(c, service);
  const serialNo = tdlSerialNo(c, service);
  const startDate = tdlStartDate(c, service);
  const endDate = tdlEndDate(c, service);
  
  return (
    <tr
      className={isSelected ? 'row-selected' : ''}
      style={{
        borderBottom: '1px solid var(--border)',
        background: isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : 'transparent';
      }}
    >
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <input
          type="checkbox"
          className="crm-checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          title={isSelected ? 'Deselect row' : 'Select row'}
        />
      </td>
      <td className="sno-col" style={{ textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
        {c.customerNumber || '—'}
      </td>
      <td style={{ textAlign: 'center' }}>{<Avatar name={c.name} src={c.avatar} size="sm" />}</td>
      <td className="company-name-cell" style={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span>{c.name || textValue(c.tdlDetails?.companyName, service?.companyName, '—')}</span>
        </div>
      </td>
      <td className="partner-name-cell" style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--tx-2)' }}>
        {tdlPartnerName(c, service)}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>{customerPhone(c)}</td>
      <td style={{ textAlign: 'center' }}>{customerLocation(c)}</td>
      <td style={{ textAlign: 'center' }}>{textValue(c.tdlDetails?.salesman1)}</td>
      <td style={{ textAlign: 'center' }}>{textValue(c.tdlDetails?.salesman2)}</td>
      <td style={{ textAlign: 'center' }}>{tdlProduct(c, service)}</td>
      <td style={{ textAlign: 'center' }}>{tdlRelease(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{serialNo}</td>
      <td style={{ textAlign: 'center' }}><Badge status={status} /></td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{tdlNoOfDays(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(startDate as any)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(endDate as any)}</td>
      <td style={{ textAlign: 'center' }}>
        <EmailTemplateSelect
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={onTemplateChange || (() => {})}
        />
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <NotifiedBadge
          date={c.tdlDetails?.lastNotifiedAt || c.lastNotifiedAt}
          channel={c.tdlDetails?.lastNotifiedChannel || c.lastNotifiedChannel}
          templateName={c.tdlDetails?.lastNotifiedTemplate || c.lastNotifiedTemplate}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <div className="table-actions" style={{ justifyContent: 'center' }}>
        <EmailTemplateSendButton
          email={c.email || c.primaryContactInfo?.email}
          emailOptions={customerEmails(c)}
          customerName={c.name || textValue(c.tdlDetails?.companyName, service?.companyName, '—')}
          selectedTemplateId={selectedTemplateId}
          onSuccess={() => {
            onTemplateChange?.('');
            queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
            queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
          }}
          dynamicData={{
            customerId: c._id,
            product: tdlProduct(c, service),
            release: tdlRelease(c, service),
            serialNo: serialNo,
            expiryDate: fmt.date(endDate as any),
            startDate: fmt.date(startDate as any),
            endDate: fmt.date(endDate as any),
            contactPerson: customerContact(c),
            phone: customerPhone(c),
            salesman: textValue(c.tdlDetails?.salesman1),
            email_id: c.email || c.primaryContactInfo?.email
          }}
        />
          <CustomerWhatsAppAction
            customer={c}
            contextLabel="TDL"
            defaultMessage={moduleWhatsappMessage(c, 'TDL', [
              ['Product', tdlProduct(c, service)],
              ['Release', tdlRelease(c, service)],
              ['Serial No', serialNo],
              ['Start Date', fmt.date(startDate as any)],
              ['Expiry Date', fmt.date(endDate as any)],
              ['Status', status],
            ])}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              customerId: c._id,
              product: tdlProduct(c, service),
              productName: tdlProduct(c, service),
              release: tdlRelease(c, service),
              serialNo: serialNo,
              startDate: fmt.date(startDate as any),
              expiryDate: fmt.date(endDate as any),
              endDate: fmt.date(endDate as any),
              contactPerson: customerContact(c),
              phone: customerPhone(c),
              mobile: customerPhone(c),
              salesman: textValue(c.tdlDetails?.salesman1),
              email_id: c.email || c.primaryContactInfo?.email
            }}
            onSuccess={() => {
              onTemplateChange?.('');
              queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
              queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
            }}
          />
          <button type="button" className="btn-action btn-action-blue" title="View TDL" onClick={() => openViewForCustomer(c, service)}>
            <Eye size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
};

const CloudTableRow: React.FC<{
  c: Customer;
  idx: number;
  service?: CustomerService;
  isSelected: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  onToggleSelect: () => void;
  openViewForCustomer: (c: Customer, service?: CustomerService) => void;
  openUserDetails: (c: Customer) => void;
}> = ({ c, idx, service, isSelected, selectedTemplateId = '', onTemplateChange, onToggleSelect, openViewForCustomer, openUserDetails }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const startDate = cloudStartDate(c, service);
  const endDate = cloudExpiryDate(c, service);
  const userList = service?.users || c.cloudDetails?.users || [];

  return (
    <tr
      className={isSelected ? 'row-selected' : ''}
      style={{
        borderBottom: '1px solid var(--border)',
        background: isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : 'transparent';
      }}
    >
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <input
          type="checkbox"
          className="crm-checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          title={isSelected ? 'Deselect row' : 'Select row'}
        />
      </td>
      <td className="sno-col" style={{ textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
        {c.customerNumber || '—'}
      </td>
      <td style={{ textAlign: 'center' }}><Avatar name={c.name} src={c.avatar} size="sm" /></td>
      <td className="company-name-cell" style={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span>{c.name || textValue(c.cloudDetails?.companyName, service?.companyName, '—')}</span>
        </div>
      </td>
      <td className="partner-name-cell" style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--tx-2)' }}>
        {cloudPartnerName(c, service)}
      </td>
      <td style={{ textAlign: 'center' }}>{cloudProduct(c, service)}</td>
      <td style={{ textAlign: 'center' }}>{cloudRelease(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{cloudDomainSubId(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{cloudUsers(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(startDate as any)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(endDate as any)}</td>
      <td style={{ textAlign: 'center' }}><Badge status={cloudStatus(c, service)} /></td>
      <td style={{ textAlign: 'center' }}>
        {userList.length > 0 ? (
          <button
            type="button"
            title="View User Details"
            onClick={() => openUserDetails(c)}
            className="btn-icon-zen"
          >
            <Users size={13} />
          </button>
        ) : (
          <span style={{ color: 'var(--tx-5)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ textAlign: 'center' }}>
        <EmailTemplateSelect
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={onTemplateChange || (() => {})}
        />
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <NotifiedBadge
          date={c.cloudDetails?.lastNotifiedAt || c.lastNotifiedAt}
          channel={c.cloudDetails?.lastNotifiedChannel || c.lastNotifiedChannel}
          templateName={c.cloudDetails?.lastNotifiedTemplate || c.lastNotifiedTemplate}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <div className="table-actions" style={{ justifyContent: 'center' }}>
        <EmailTemplateSendButton
          email={c.email || c.primaryContactInfo?.email}
          emailOptions={customerEmails(c)}
          customerName={c.name || textValue(c.cloudDetails?.companyName, service?.companyName, '—')}
          selectedTemplateId={selectedTemplateId}
          onSuccess={() => {
            onTemplateChange?.('');
            queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
            queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
          }}
          dynamicData={{
            customerId: c._id,
            product: cloudProduct(c, service),
            release: cloudRelease(c, service),
            serialNo: cloudDomainSubId(c, service),
            expiryDate: fmt.date(endDate as any),
            startDate: fmt.date(startDate as any),
            endDate: fmt.date(endDate as any),
            contactPerson: customerContact(c),
            phone: customerPhone(c),
            email_id: c.email || c.primaryContactInfo?.email
          }}
        />
          <CustomerWhatsAppAction
            customer={c}
            contextLabel="Cloud"
            defaultMessage={moduleWhatsappMessage(c, 'Cloud', [
              ['Product', cloudProduct(c, service)],
              ['Release', cloudRelease(c, service)],
              ['Domain / Sub ID', cloudDomainSubId(c, service)],
              ['Users', cloudUsers(c, service)],
              ['Start Date', fmt.date(startDate as any)],
              ['Expiry Date', fmt.date(endDate as any)],
            ])}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              customerId: c._id,
              product: cloudProduct(c, service),
              productName: cloudProduct(c, service),
              release: cloudRelease(c, service),
              domainLinkSubId: cloudDomainSubId(c, service),
              noOfUsers: cloudUsers(c, service),
              startDate: fmt.date(startDate as any),
              expiryDate: fmt.date(endDate as any),
              endDate: fmt.date(endDate as any),
              contactPerson: customerContact(c),
              phone: customerPhone(c),
              mobile: customerPhone(c),
              email_id: c.email || c.primaryContactInfo?.email
            }}
            onSuccess={() => {
              onTemplateChange?.('');
              queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
              queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
            }}
          />
          <button type="button" className="btn-action btn-action-blue" title="View Cloud" onClick={() => openViewForCustomer(c, service)}>
            <Eye size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
};

const TSSTableRow: React.FC<{
  c: Customer;
  idx: number;
  service?: CustomerService;
  isSelected: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  onToggleSelect: () => void;
  openViewForCustomer: (c: Customer, service?: CustomerService) => void;
}> = ({ c, idx, service, isSelected, selectedTemplateId = '', onTemplateChange, onToggleSelect, openViewForCustomer }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const expiryDate = tssExpiryDate(c, service);
  const startDate = service?.startDate || c.tssDetails?.startDate || c.serialNoInfo?.[0]?.startDate;
  const status = tssStatus(c, service);
  
  return (
    <tr
      className={isSelected ? 'row-selected' : ''}
      style={{
        borderBottom: '1px solid var(--border)',
        background: isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : 'transparent';
      }}
    >
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <input
          type="checkbox"
          className="crm-checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          title={isSelected ? 'Deselect row' : 'Select row'}
        />
      </td>
      <td className="sno-col" style={{ textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
        {c.customerNumber || '—'}
      </td>
      <td style={{ textAlign: 'center' }}><Avatar name={c.name} src={c.avatar} size="sm" /></td>
      <td className="company-name-cell" style={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span>{c.name || textValue(c.tssDetails?.companyName, service?.companyName, '—')}</span>
        </div>
      </td>
      <td className="partner-name-cell" style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--tx-2)' }}>
        {tssPartnerName(c, service)}
      </td>
      <td style={{ textAlign: 'center' }}>{tssProduct(c, service)}</td>
      <td style={{ textAlign: 'center' }}>{tssRelease(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{tssSerialNo(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(expiryDate as any)}</td>
      <td style={{ textAlign: 'center' }}>{tssContactPerson(c, service)}</td>
      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{tssMobile(c, service)}</td>
      <td style={{ textAlign: 'center' }}>{tssEmail(c, service)}</td>
      <td style={{ textAlign: 'center' }}><Badge status={status} /></td>
      <td style={{ textAlign: 'center' }}>
        <EmailTemplateSelect
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={onTemplateChange || (() => {})}
        />
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <NotifiedBadge
          date={c.tssDetails?.lastNotifiedAt || c.lastNotifiedAt}
          channel={c.tssDetails?.lastNotifiedChannel || c.lastNotifiedChannel}
          templateName={c.tssDetails?.lastNotifiedTemplate || c.lastNotifiedTemplate}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <div className="table-actions" style={{ justifyContent: 'center' }}>
        <EmailTemplateSendButton
          email={tssEmail(c, service) === '—' ? (c.email || c.primaryContactInfo?.email) : tssEmail(c, service)}
          emailOptions={customerEmails(c)}
          customerName={c.name || textValue(c.tssDetails?.companyName, service?.companyName, '—')}
          selectedTemplateId={selectedTemplateId}
          onSuccess={() => {
            onTemplateChange?.('');
            queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
            queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
          }}
          dynamicData={{
            customerId: c._id,
            product: tssProduct(c, service),
            release: tssRelease(c, service),
            serialNo: tssSerialNo(c, service),
            expiryDate: fmt.date(expiryDate as any),
            startDate: fmt.date(startDate as any),
            endDate: fmt.date(expiryDate as any),
            contactPerson: tssContactPerson(c, service),
            mobile: tssMobile(c, service),
            phone: tssMobile(c, service),
            email_id: tssEmail(c, service) === '—' ? (c.email || c.primaryContactInfo?.email) : tssEmail(c, service)
          }}
        />
          <CustomerWhatsAppAction
            customer={c}
            contextLabel="TSS"
            defaultMessage={moduleWhatsappMessage(c, 'TSS', [
              ['Product', tssProduct(c, service)],
              ['Release', tssRelease(c, service)],
              ['Serial No', tssSerialNo(c, service)],
              ['Start Date', fmt.date(startDate as any)],
              ['Expiry Date', fmt.date(expiryDate as any)],
              ['Contact', tssContactPerson(c)],
              ['Mobile', tssMobile(c)],
              ['Status', status],
            ])}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              customerId: c._id,
              product: tssProduct(c, service),
              productName: tssProduct(c, service),
              release: tssRelease(c, service),
              serialNo: tssSerialNo(c, service),
              startDate: fmt.date(startDate as any),
              expiryDate: fmt.date(expiryDate as any),
              endDate: fmt.date(expiryDate as any),
              contactPerson: tssContactPerson(c),
              mobile: tssMobile(c),
              phone: tssMobile(c),
              email_id: tssEmail(c) === '—' ? (c.email || c.primaryContactInfo?.email) : tssEmail(c)
            }}
            onSuccess={() => {
              onTemplateChange?.('');
              queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
              queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
            }}
          />
          <button type="button" className="btn-action btn-action-blue" title="View TSS" onClick={() => openViewForCustomer(c, service)}>
            <Eye size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
};

export const TDLListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: insights } = useCustomerManagementInsights();

  const urlSearch = searchParams.get('search') || searchParams.get('customer') || '';
  const urlProduct = searchParams.get('product') || 'all';
  const urlStatus = searchParams.get('status') || 'all';

  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewSelection, setViewSelection] = React.useState<ModuleViewSelection>(null);
  const [form, setForm] = React.useState({
    customerId: '',
    status: 'active',
    days: '',
    startDate: '',
    endDate: '',
    licenseSerialNo: '',
    tdlSerialNo: '',
    product: '',
    release: '',
    mobile: '',
    locationArea: '',
    salesman1: '',
    salesman2: '',
    companyType: 'head_office',
    companyName: '',
    address: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });
  const [search, setSearch] = React.useState(urlSearch);
  const [statusFilter, setStatusFilter] = React.useState(urlStatus);
  const [productFilter, setProductFilter] = React.useState(urlProduct);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState('10');

  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
    if (urlProduct && urlProduct !== 'all') setProductFilter(urlProduct);
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
  }, [urlSearch, urlProduct, urlStatus]);

  const { isFiltered, startDate: filterStartDate, endDate: filterEndDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!filterStartDate && !!filterEndDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${filterStartDate}_${filterEndDate}` : 'all';

  const { data: tdlCustsData, isLoading } = useQuery({
    queryKey: ['customers-tdl-list', search, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { all: 'true', moduleType: 'tdl' };
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = filterStartDate;
        params.endDate = filterEndDate;
      }
      const res = await api.get('/customers', { params });
      return (res.data?.data || []) as Customer[];
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 100 } });
      return (res.data?.data || []) as Array<{ name: string }>;
    },
  });

  const productOptions = React.useMemo(() => {
    const list = (productsData || []).map((p: any) => p.name);
    return [
      { value: 'all', label: 'All Products' },
      ...list.sort().map((p: string) => ({ value: p, label: p }))
    ];
  }, [productsData]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'trial', label: 'Trial' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
  ];

  const { data: allCustsData } = useQuery({
    queryKey: ['customers-all-names'],
    enabled: createOpen,
    queryFn: async () => {
      const res = await api.get('/customers', { params: { all: 'true' } });
      return (res.data.data || []) as Customer[];
    },
  });

  const customers = tdlCustsData || [];
  const allCustomers = allCustsData || [];
  const filteredRows = React.useMemo(() => {
    const rows = moduleListRows(customers, 'tdl', hasTDL);
    return rows.filter(({ customer: c, service }) => {
      if (statusFilter !== 'all') {
        const s = (tdlStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active' && !s.includes('active')) return false;
        if (statusFilter === 'trial' && !s.includes('trial')) return false;
        if (statusFilter === 'expiring' && !s.includes('expiring')) return false;
        if (statusFilter === 'expired' && !s.includes('expired')) return false;
      }
      if (productFilter !== 'all') {
        const prod = (tdlProduct(c, service) || '').toLowerCase();
        if (!prod.includes(productFilter.toLowerCase())) return false;
      }
      if (hasActiveDateFilter) {
        const match = matchDateFilterRange(
          tdlEndDate(c, service),
          tdlStartDate(c, service),
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        );
        if (!match) return false;
      }
      return true;
    });
  }, [customers, statusFilter, productFilter, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / Number(pageSize)));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, productFilter, search, pageSize, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const pagedRows = React.useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return filteredRows.slice(start, start + Number(pageSize));
  }, [filteredRows, page, pageSize]);

  const selectedCustomer = allCustomers.find((c) => c._id === form.customerId) || null;
  const set = (field: keyof typeof form, value: string) => setForm((p) => ({ ...p, [field]: value }));
  const openForCustomer = (c: Customer) => {
    setForm({
      customerId: c._id,
      status: c.tdlDetails?.status || (c.serialNoInfo?.[0]?.isAmcActive ? 'active' : 'active'),
      days: c.tdlDetails?.noOfDays != null ? String(c.tdlDetails.noOfDays) : c.tdlDetails?.days != null ? String(c.tdlDetails.days) : '',
      startDate: c.tdlDetails?.startDate?.split('T')[0] || '',
      endDate: c.tdlDetails?.endDate?.split('T')[0] || '',
      licenseSerialNo: c.tdlDetails?.licenseSerialNo || c.serialNoInfo?.[0]?.licenses?.[0]?.licenceSerialNo || '',
      tdlSerialNo: c.serialNoInfo?.[0]?.licenses?.[0]?.licenceSerialNo || c.tdlDetails?.licenseSerialNo || '',
      product: tdlProduct(c),
      release: tdlRelease(c),
      mobile: customerPhone(c) === '—' ? '' : customerPhone(c),
      locationArea: customerLocation(c) === '—' ? '' : customerLocation(c),
      salesman1: c.tdlDetails?.salesman1 || '',
      salesman2: c.tdlDetails?.salesman2 || '',
      companyType: c.tdlDetails?.companyType || (c.branchInfo?.isBranch ? 'branch' : 'head_office'),
      companyName: c.tdlDetails?.companyName || c.name || '',
      address: c.tdlDetails?.address || c.address || '',
      details: c.tdlDetails?.details || '',
      actualPrice: c.tdlDetails?.actualPrice != null ? String(c.tdlDetails.actualPrice) : '',
      discount: c.tdlDetails?.discount != null ? String(c.tdlDetails.discount) : '',
      currentPrice: c.tdlDetails?.currentPrice != null ? String(c.tdlDetails.currentPrice) : '',
      advance1: c.tdlDetails?.advance1 != null ? String(c.tdlDetails.advance1) : '',
      advance2: c.tdlDetails?.advance2 != null ? String(c.tdlDetails.advance2) : '',
      remainingTotal: c.tdlDetails?.remainingTotal != null ? String(c.tdlDetails.remainingTotal) : '',
      others: c.tdlDetails?.others || '',
    });
    setCreateOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const customerId = selectedCustomer?._id || form.customerId;
      const serialRows = Array.isArray(selectedCustomer?.serialNoInfo) ? selectedCustomer.serialNoInfo : [];
      const primarySerial = serialRows[0] || {};
      const payload = {
        ...(selectedCustomer ? buildCustomerPatchBase(selectedCustomer) : {}),
        products: form.product && form.product !== '—' ? [form.product] : (selectedCustomer?.products || []),
        companyInfo: {
          ...(selectedCustomer?.companyInfo || {}),
          releaseVersion: form.release && form.release !== '—' ? form.release : selectedCustomer?.companyInfo?.releaseVersion,
          locationArea: form.locationArea || selectedCustomer?.companyInfo?.locationArea,
        },
        serialNoInfo: [
          {
            ...primarySerial,
            product: form.product && form.product !== '—' ? form.product : primarySerial.product,
            releaseVersion: form.release && form.release !== '—' ? form.release : primarySerial.releaseVersion,
            tdlEnabled: form.status === 'active',
            isTdl: form.status === 'active',
            tdlSerialNo: form.tdlSerialNo || form.licenseSerialNo || primarySerial.tdlSerialNo,
            startDate: form.startDate || primarySerial.startDate,
            endDate: form.endDate || primarySerial.endDate,
            licenses: [
              {
                ...(primarySerial.licenses?.[0] || {}),
                licenceSerialNo: form.licenseSerialNo || primarySerial.licenses?.[0]?.licenceSerialNo,
                licenceStatus: form.status === 'active' ? 'active' : 'inactive',
              },
            ],
          },
        ],
        tdlDetails: {
          ...(selectedCustomer?.tdlDetails || {}),
          status: form.status,
          noOfDays: toNumber(form.days),
          days: toNumber(form.days),
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          licenseSerialNo: form.licenseSerialNo || undefined,
          salesman1: form.salesman1 || undefined,
          salesman2: form.salesman2 || undefined,
          companyType: form.companyType as 'head_office' | 'branch',
          companyName: form.companyName || undefined,
          address: form.address || undefined,
          details: form.details || undefined,
          actualPrice: toNumber(form.actualPrice),
          discount: toNumber(form.discount),
          currentPrice: toNumber(form.currentPrice),
          advance1: toNumber(form.advance1),
          advance2: toNumber(form.advance2),
          others: form.others || undefined,
        },
      };
      await api.patch(`/customers/${customerId}`, payload);
    },
    meta: { invalidateQueryKeys: [['customers-management-pages'], ['customers-management-insights'], ['customers'], ['customers-all']] },
    onSuccess: () => {
      toast.success('TDL details saved');
      setCreateOpen(false);
      setForm({
        customerId: '',
        status: 'active',
        days: '',
        startDate: '',
        endDate: '',
        licenseSerialNo: '',
        tdlSerialNo: '',
        product: '',
        release: '',
        mobile: '',
        locationArea: '',
        salesman1: '',
        salesman2: '',
        companyType: 'head_office',
        companyName: '',
        address: '',
        details: '',
        actualPrice: '',
        discount: '',
        currentPrice: '',
        advance1: '',
        advance2: '',
        remainingTotal: '',
        others: '',
      });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to save TDL details'),
  });

  const exportTDL = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1', moduleType: 'tdl' };
    if (search.trim()) params.search = search.trim();
    if (productFilter !== 'all') params.product = productFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (hasActiveDateFilter) {
      params.startDate = filterStartDate;
      params.endDate = filterEndDate;
    }
    const res = await api.get('/customers', { params });
    const allTDLCustomers = (res.data?.data || []) as Customer[];
    let allTDLRows = moduleListRows(allTDLCustomers, 'tdl', hasTDL);
    if (statusFilter !== 'all') {
      allTDLRows = allTDLRows.filter(({ customer: c, service }) => {
        const s = (tdlStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active') return s.includes('active');
        if (statusFilter === 'trial') return s.includes('trial');
        if (statusFilter === 'expiring') return s.includes('expiring');
        if (statusFilter === 'expired') return s.includes('expired');
        return true;
      });
    }
    if (hasActiveDateFilter) {
      allTDLRows = allTDLRows.filter(({ customer: c, service }) =>
        matchDateFilterRange(
          tdlEndDate(c, service),
          tdlStartDate(c, service),
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        )
      );
    }
    exportExcelWorkbook('tdl-registry', [
      { name: 'TDL Registry', rows: tdlListExportRows(allTDLRows) },
    ]);
  };

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [rowTemplates, setRowTemplates] = useState<Record<string, string>>({});
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);

  const handleBulkTemplateSelect = (templateId: string) => {
    setBulkTemplateId(templateId);
    setRowTemplates((prev) => {
      const next = { ...prev };
      selectedKeys.forEach((k) => {
        next[k] = templateId;
      });
      return next;
    });
  };

  const handleRowTemplateChange = (key: string, templateId: string) => {
    setRowTemplates((prev) => ({ ...prev, [key]: templateId }));
  };

  const isAllPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedKeys.includes(r.rowKey));

  const toggleSelectAllPage = () => {
    const pageKeys = pagedRows.map(r => r.rowKey);
    if (isAllPageSelected) {
      setSelectedKeys(prev => prev.filter(k => !pageKeys.includes(k)));
      setRowTemplates(prev => {
        const next = { ...prev };
        pageKeys.forEach(k => {
          delete next[k];
        });
        return next;
      });
    } else {
      setSelectedKeys(prev => Array.from(new Set([...prev, ...pageKeys])));
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const isCurrentlySelected = prev.includes(key);
      if (isCurrentlySelected) {
        setRowTemplates(r => {
          const nr = { ...r };
          delete nr[key];
          return nr;
        });
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const selectedRows = filteredRows.filter(r => selectedKeys.includes(r.rowKey));

  const bulkEmailTargets: BulkEmailTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = textValue(service?.companyName, c.tdlDetails?.companyName, c.name);
    const customerEmail = c.email || c.primaryContactInfo?.email || '';
    const serialNo = tdlSerialNo(c, service);
    const startDate = tdlStartDate(c, service);
    const endDate = tdlEndDate(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      email: customerEmail,
      cc: c.secondaryContactInfo?.email,
      templateId,
      dynamicData: {
        customerName,
        companyName: customerName,
        product: tdlProduct(c, service),
        release: tdlRelease(c, service),
        serialNo,
        expiryDate: fmt.date(endDate as any),
        startDate: fmt.date(startDate as any),
        endDate: fmt.date(endDate as any),
        contactPerson: customerContact(c),
        phone: customerPhone(c),
        salesman: textValue(c.tdlDetails?.salesman1),
        email_id: customerEmail,
      },
    };
  });

  const bulkWhatsAppTargets: BulkWhatsAppTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = textValue(service?.companyName, c.tdlDetails?.companyName, c.name);
    const phone = customerPhone(c);
    const status = tdlStatus(c, service);
    const serialNo = tdlSerialNo(c, service);
    const startDate = tdlStartDate(c, service);
    const endDate = tdlEndDate(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      phone,
      templateId,
      customMessage: moduleWhatsappMessage(c, 'TDL', [
        ['Product', tdlProduct(c, service)],
        ['Release', tdlRelease(c, service)],
        ['Serial No', serialNo],
        ['Status', status],
        ['Start Date', fmt.date(startDate as any)],
        ['End Date', fmt.date(endDate as any)],
        ['Days', String(tdlNoOfDays(c, service))],
        ['Sales 1', textValue(c.tdlDetails?.salesman1)],
        ['Sales 2', textValue(c.tdlDetails?.salesman2)],
      ]),
      dynamicData: {
        customerName,
        product: tdlProduct(c, service),
        expiryDate: fmt.date(endDate as any),
      },
    };
  });

  const exportSelectedTDL = () => {
    if (selectedRows.length === 0) {
      toast.error('No records selected to export');
      return;
    }
    exportExcelWorkbook('selected-tdl-registry', [
      { name: 'Selected TDL Records', rows: tdlListExportRows(selectedRows) },
    ]);
    toast.success(`Exported ${selectedRows.length} selected TDL records`);
  };

  return (
    <div>
      <ModernDashboardLayout
        title="TDL Add-on Hub"
        subtitle={`Tracking ${filteredRows.length} active TDL license extensions & configurations`}
        kpiCards={[
          { label: 'Total TDL', value: insights?.tdlDashboard?.kpi?.total ?? '—', icon: <Boxes size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'Add-on deployments' },
          { label: 'Active', value: insights?.tdlDashboard?.kpi?.active ?? '—', icon: <CheckCircle size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Active license' },
          { label: 'Expiring Soon', value: insights?.tdlDashboard?.kpi?.expiring ?? '—', icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Renewal due' },
          { label: 'Expired', value: insights?.tdlDashboard?.kpi?.expired ?? '—', icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Lapsed add-ons' },
        ]}
        isLoading={isLoading}
        tableSearch={
          <>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search TDL licenses..."
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
              className="filter-select"
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
            <button
              className="btn btn-export btn-sm"
              onClick={exportTDL}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        tableHeaders={
          <>
            <th style={{ width: 44, textAlign: 'center', padding: '10px 14px' }}>
              <input
                type="checkbox"
                className="crm-checkbox crm-checkbox-header"
                checked={isAllPageSelected}
                onChange={toggleSelectAllPage}
                title="Select all on this page"
              />
            </th>
            <th className="sno-col">S NO</th>
            <th>Customer No</th>
            <th>Logo</th>
            <th>Company Name</th>
            <th>Partner Name</th>
            <th>Mobile</th>
            <th>Location</th>
            <th>Sales 1</th>
            <th>Sales 2</th>
            <th>Product</th>
            <th>Release</th>
            <th>Serial No</th>
            <th>Status</th>
            <th>Days</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Template</th>
            <th>Last Notified</th>
            <th>Actions</th>
          </>
        }
        tableBody={
          filteredRows.length === 0 ? (
            <tr>
              <td colSpan={19} style={{ padding: '60px', textAlign: 'center' }}>
                <ShieldCheck size={32} style={{ color: 'var(--tx-5)', marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-2)' }}>No TDL records found</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Try adjusting your search or filters</div>
              </td>
            </tr>
          ) : (
            pagedRows.map((row, idx) => {
              const isSelected = selectedKeys.includes(row.rowKey);
              const templateId = rowTemplates[row.rowKey] || (isSelected ? bulkTemplateId : '') || '';
              return (
                <TDLTableRow
                  key={row.rowKey}
                  c={row.customer}
                  service={row.service}
                  idx={(page - 1) * Number(pageSize) + idx}
                  isSelected={isSelected}
                  selectedTemplateId={templateId}
                  onTemplateChange={(tid) => handleRowTemplateChange(row.rowKey, tid)}
                  onToggleSelect={() => toggleSelectRow(row.rowKey)}
                  openViewForCustomer={(customer, service) => setViewSelection({ customer, service })}
                />
              );
            })
          )
        }
        tableFooter={<Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} total={filteredRows.length} pageSize={pageSize} />}
      />

      <BulkActionToolbar
        selectedCount={selectedKeys.length}
        totalCount={filteredRows.length}
        isAllPageSelected={isAllPageSelected}
        onSelectAllPage={toggleSelectAllPage}
        selectedTemplateId={bulkTemplateId}
        onSelectTemplate={handleBulkTemplateSelect}
        onClearSelection={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
        }}
        onOpenBulkEmail={() => setIsBulkEmailOpen(true)}
        onOpenBulkWhatsApp={() => setIsBulkWhatsAppOpen(true)}
      />

      <BulkEmailModal
        open={isBulkEmailOpen}
        onClose={() => setIsBulkEmailOpen(false)}
        targets={bulkEmailTargets}
        initialTemplateId={bulkTemplateId}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
        }}
      />

      <BulkWhatsAppModal
        open={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        targets={bulkWhatsAppTargets}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="TDL Details"
        size="xxl"
        footer={
          <button className="btn btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? <Spinner size={14} /> : <Plus size={14} />}
            {createMut.isPending ? 'Saving...' : 'Save TDL'}
          </button>
        }
      >
        <SelectField
          label="Customer"
          required
          value={form.customerId}
          onChange={(v) => {
            const c = allCustomers.find((x) => x._id === v);
            if (!c) return set('customerId', v);
            openForCustomer(c);
          }}
          options={allCustomers.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="— Select Customer —"
        />
        <div className="form-grid-3">
          <InputField label="Company Name" value={form.companyName} onChange={(v) => set('companyName', v)} />
          <InputField label="Mobile No" value={form.mobile} onChange={(v) => set('mobile', v)} />
          <InputField label="Location/Area" value={form.locationArea || form.address} onChange={(v) => { set('locationArea', v); set('address', v); }} />
          <InputField label="Salesman 1" value={form.salesman1} onChange={(v) => set('salesman1', v)} />
          <InputField label="Salesman 2" value={form.salesman2} onChange={(v) => set('salesman2', v)} />
          <InputField label="Product" value={form.product} onChange={(v) => set('product', v)} />
          <InputField label="Release" value={form.release} onChange={(v) => set('release', v)} />
          <InputField label="License Serial No" value={form.licenseSerialNo} onChange={(v) => set('licenseSerialNo', v)} />
          <SelectField
            label="TDL Status"
            value={form.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'trial', label: 'Trial' },
              { value: 'none', label: 'None' },
            ]}
          />
          <InputField label="No.of days" value={form.days} onChange={(v) => set('days', v)} type="number" />
          <InputField label="Start date" value={form.startDate} onChange={(v) => set('startDate', v)} type="date" />
          <InputField label="End date" value={form.endDate} onChange={(v) => set('endDate', v)} type="date" />
          <div className="form-group">
            <label className="form-label">Branch</label>
            <input
              className="form-control"
              disabled
              value={selectedCustomer ? (selectedCustomer.branchInfo?.isBranch ? (selectedCustomer.branchInfo?.branchName || 'Branch') : 'Head Office') : '—'}
            />
          </div>
          <InputField label="TDL Serial No" value={form.tdlSerialNo} onChange={(v) => set('tdlSerialNo', v)} />
          <div className="form-group">
            <label className="form-label">Company Type</label>
            <input className="form-control" disabled value={form.companyType === 'branch' ? 'Branch' : 'Head Office'} />
          </div>
          <InputField label="Address" value={form.address} onChange={(v) => set('address', v)} />
          <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
          <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
          <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
          <InputField
            label="Current Price"
            value={form.currentPrice}
            onChange={(v) => set('currentPrice', v)}
            type="number"
          />
          <InputField
            label="Advance 1"
            value={form.advance1}
            onChange={(v) => set('advance1', v)}
            type="number"
          />
          <InputField
            label="Advance 2"
            value={form.advance2}
            onChange={(v) => set('advance2', v)}
            type="number"
          />
          <div className="form-group">
            <label className="form-label">Remaining Total</label>
            <input className="form-control" readOnly value={form.remainingTotal || 'Will calculate after save'} />
          </div>
          <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
        </div>
      </Modal>

      <ModuleRenewalHistoryModal
        type="tdl"
        customer={viewSelection?.customer || null}
        service={viewSelection?.service}
        onClose={() => setViewSelection(null)}
      />
    </div>
  );
};



export const CloudDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: insights, isLoading } = useCustomerManagementInsights();
  const dashboard = insights?.cloudDashboard || {};
  const kpi = dashboard?.kpi || { total: 0, totalUsers: 0, expiring: 0, expired: 0 };
  const radarRows = (dashboard?.radarRows || []) as Array<{ customer: Customer; days: number | null }>;
  const recentRows = (dashboard?.recentRows || []) as Customer[];

  const [filter, setFilter] = React.useState('all');
  const filteredRadarRows = React.useMemo(() => {
    if (filter === '7days') return radarRows.filter(r => (r.days ?? 999) <= 7);
    if (filter === '1month') return radarRows.filter(r => (r.days ?? 999) <= 30);
    return radarRows;
  }, [radarRows, filter]);

  const kpiCards = [
    { label: 'Total Cloud Customers', value: kpi.total, icon: <Cloud size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'Managed accounts' },
    { label: 'Total Cloud Users', value: kpi.totalUsers, icon: <Users size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Assigned seats' },
    { label: 'Expiring (30d)', value: kpi.expiring, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Plan renewals' },
    { label: 'Expired', value: kpi.expired, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Action required' },
  ];

  return (
    <>
      <ModernDashboardLayout
        title="Cloud Dashboard"
        subtitle="Cloud vendor, users and renewal visibility"
        headerActions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cloud/list')}>Cloud Details</button>
            <button
              className="btn btn-export btn-sm"
              onClick={() => {
                const radarData = filteredRadarRows.map(({ customer: c, days }, idx) => ({
                  'S NO': idx + 1,
                  'Customer Name': c.name || '—',
                  Vendor: c.cloudDetails?.vendor || '—',
                  Users: c.cloudDetails?.users?.length || c.cloudDetails?.noOfUsers || 0,
                  Status: days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`,
                }));
                const recentData = recentRows.map((c, idx) => ({
                  'S NO': idx + 1,
                  Customer: c.name || '—',
                  Product: cloudProduct(c),
                  Release: cloudRelease(c),
                  'Domain / Sub ID': cloudDomainSubId(c),
                  Users: cloudUsers(c),
                  'Expiry Date': cloudExpiryDate(c) ? fmt.date(cloudExpiryDate(c) as any) : '—',
                  Status: c.cloudDetails?.status ? c.cloudDetails.status.charAt(0).toUpperCase() + c.cloudDetails.status.slice(1) : 'Active',
                }));
                exportExcelWorkbook('cloud-dashboard', [
                  { name: 'Renewal Radar', rows: radarData },
                  { name: 'Recent Cloud Setups', rows: recentData },
                ]);
              }}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        kpiCards={kpiCards}
        donutData={{ active: kpi.total - (kpi.expiring + kpi.expired), expiring: kpi.expiring, expired: kpi.expired, total: kpi.total }}
        recentTableTitle="Cloud Renewal Radar"
        tableActions={
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'OverAll' },
              { value: '7days', label: '7 Days' },
              { value: '1month', label: '1 Month' },
            ]}
            className="filter-select"
            style={{ height: 32, fontSize: 12 }}
          />
        }
        isLoading={isLoading}
        tableHeaders={
          <>
            <th >S NO</th>
            <th >Customer Name</th>
            <th >Vendor</th>
            <th >Users</th>
            <th >Status</th>
            <th >Action</th>
          </>
        }
        tableBody={
          filteredRadarRows.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '60px', textAlign: 'center' }}><span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tx-3)' }}>No cloud renewal risks</span></td></tr>
          ) : (
            filteredRadarRows.map(({ customer: c, days }, idx) => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '20px 32px', fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>{c.name || '—'}</span>
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', textAlign: 'center' }}>
                  {c.cloudDetails?.vendor || '—'}
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                  {c.cloudDetails?.noOfUsers || c.cloudDetails?.users?.length || 0}
                </td>
                <td style={{ padding: '20px 32px' }}>
                  <span className={`badge ${days !== null && days < 0 ? 'badge-red' : days !== null && days <= 30 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px', borderRadius: '12px' }}>
                    {days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                </td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <button style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-3)'; }} onClick={() => navigate('/cloud/list')}>
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))
          )
        }
        footerContent={
          <div className="quick-grid-3">
            {[
              { icon: <Cloud size={18} />, title: 'Cloud Details', sub: `${kpi.total} customers`, path: '/cloud/list', color: 'var(--brand)', bg: 'var(--brand-light)', bd: 'var(--border)' },
              { icon: <Users size={18} />, title: 'Customers', sub: `${kpi.totalUsers} cloud users`, path: '/customers', color: 'var(--purple)', bg: 'var(--purple-bg)', bd: 'var(--purple-bd)' },
            ].map((link, i) => (
              <button key={link.title} type="button" className="alert-card fade-in-up" style={{ animationDelay: `${(kpiCards.length + i) * 60}ms`, textAlign: 'left' }} onClick={() => navigate(link.path)}>
                <div className="alert-card-icon" style={{ background: link.bg, color: link.color, borderColor: link.bd }}>{link.icon}</div>
                <div>
                  <div className="alert-card-title">{link.title}</div>
                  <div className="alert-card-sub">{isLoading ? '—' : link.sub}</div>
                </div>
              </button>
            ))}
          </div>
        }
      />
    </>
  );
};

export const CloudListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: insights } = useCustomerManagementInsights();

  const urlSearch = searchParams.get('search') || searchParams.get('customer') || '';
  const urlProduct = searchParams.get('product') || 'all';
  const urlStatus = searchParams.get('status') || 'all';

  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewSelection, setViewSelection] = React.useState<ModuleViewSelection>(null);
  const [userDetailsCustomer, setUserDetailsCustomer] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState({
    customerId: '',
    vendor: 'sugam',
    product: '',
    release: '',
    domainLinkSubId: '',
    noOfUsers: '1',
    cloudStartDate: '',
    cloudExpiryDate: '',
    licenseSerialNo: '',
    companyType: 'head_office',
    companyName: '',
    address: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });
  const [search, setSearch] = React.useState(urlSearch);
  const [statusFilter, setStatusFilter] = React.useState(urlStatus);
  const [productFilter, setProductFilter] = React.useState(urlProduct);
  const [vendorFilter, setVendorFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState('10');

  React.useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
    if (urlProduct && urlProduct !== 'all') setProductFilter(urlProduct);
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
  }, [urlSearch, urlProduct, urlStatus]);

  const { isFiltered, startDate: filterStartDate, endDate: filterEndDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!filterStartDate && !!filterEndDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${filterStartDate}_${filterEndDate}` : 'all';

  const { data: cloudCustsData, isLoading } = useQuery({
    queryKey: ['customers-cloud-list', search, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { all: 'true', moduleType: 'cloud' };
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = filterStartDate;
        params.endDate = filterEndDate;
      }
      const res = await api.get('/customers', { params });
      return (res.data?.data || []) as Customer[];
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 100 } });
      return (res.data?.data || []) as Array<{ name: string }>;
    },
  });

  const productOptions = React.useMemo(() => {
    const list = (productsData || []).map((p: any) => p.name);
    return [
      { value: 'all', label: 'All Products' },
      ...list.sort().map((p: string) => ({ value: p, label: p }))
    ];
  }, [productsData]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
  ];

  const { data: allCustsData } = useQuery({
    queryKey: ['customers-all-names'],
    enabled: createOpen,
    queryFn: async () => {
      const res = await api.get('/customers', { params: { all: 'true' } });
      return (res.data.data || []) as Customer[];
    },
  });

  const customers = cloudCustsData || [];
  const allCustomers = allCustsData || [];
  const filteredRows = React.useMemo(() => {
    const rows = moduleListRows(customers, 'cloud', hasCloud);
    return rows.filter(({ customer: c, service }) => {
      if (statusFilter !== 'all') {
        const s = (cloudStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active' && !s.includes('active')) return false;
        if (statusFilter === 'expiring' && !s.includes('expiring')) return false;
        if (statusFilter === 'expired' && !s.includes('expired')) return false;
      }
      if (productFilter !== 'all') {
        const prod = (cloudProduct(c, service) || '').toLowerCase();
        if (!prod.includes(productFilter.toLowerCase())) return false;
      }
      if (vendorFilter !== 'all') {
        const v = (cloudVendor(c, service) || '').toLowerCase();
        if (!v.includes(vendorFilter.toLowerCase())) return false;
      }
      if (hasActiveDateFilter) {
        const match = matchDateFilterRange(
          cloudExpiryDate(c, service),
          cloudStartDate(c, service),
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        );
        if (!match) return false;
      }
      return true;
    });
  }, [customers, statusFilter, productFilter, vendorFilter, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / Number(pageSize)));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, productFilter, vendorFilter, search, pageSize, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const pagedRows = React.useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return filteredRows.slice(start, start + Number(pageSize));
  }, [filteredRows, page, pageSize]);

  const activeCloudRows = React.useMemo(() => customers.filter(hasCloud), [customers]);
  const vendorOptions = React.useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    activeCloudRows.forEach((c) => {
      const label = cloudVendor(c);
      if (!label || label === '—') return;
      const key = label.toLowerCase();
      const current = counts.get(key);
      counts.set(key, { label: current?.label || label, count: (current?.count || 0) + 1 });
    });
    return Array.from(counts.entries())
      .map(([key, value]) => ({ value: key, label: value.label, count: value.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activeCloudRows]);
  
  const selectedCustomer = allCustomers.find((c) => c._id === form.customerId) || null;
  const set = (field: keyof typeof form, value: string) => setForm((p) => ({ ...p, [field]: value }));
  const openForCustomer = (c: Customer) => {
    setForm({
      customerId: c._id,
      vendor: c.cloudDetails?.vendor || 'sugam',
      product: cloudProduct(c),
      release: cloudRelease(c),
      domainLinkSubId: c.cloudDetails?.domainLinkSubId || '',
      noOfUsers: c.cloudDetails?.noOfUsers != null ? String(c.cloudDetails.noOfUsers) : '1',
      cloudStartDate: c.cloudDetails?.cloudStartDate?.split('T')[0] || '',
      cloudExpiryDate: c.cloudDetails?.cloudExpiryDate?.split('T')[0] || '',
      licenseSerialNo: c.cloudDetails?.licenseSerialNo || '',
      companyType: c.cloudDetails?.companyType || (c.branchInfo?.isBranch ? 'branch' : 'head_office'),
      companyName: c.cloudDetails?.companyName || c.name || '',
      address: c.cloudDetails?.address || c.address || '',
      details: c.cloudDetails?.details || '',
      actualPrice: c.cloudDetails?.actualPrice != null ? String(c.cloudDetails.actualPrice) : '',
      discount: c.cloudDetails?.discount != null ? String(c.cloudDetails.discount) : '',
      currentPrice: c.cloudDetails?.currentPrice != null ? String(c.cloudDetails.currentPrice) : '',
      advance1: c.cloudDetails?.advance1 != null ? String(c.cloudDetails.advance1) : '',
      advance2: c.cloudDetails?.advance2 != null ? String(c.cloudDetails.advance2) : '',
      remainingTotal: c.cloudDetails?.remainingTotal != null ? String(c.cloudDetails.remainingTotal) : '',
      others: c.cloudDetails?.others || '',
    });
    setCreateOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const customerId = selectedCustomer?._id || form.customerId;
      const payload = {
        ...(selectedCustomer ? buildCustomerPatchBase(selectedCustomer) : {}),
        products: form.product && form.product !== '—' ? [form.product] : (selectedCustomer?.products || []),
        companyInfo: {
          ...(selectedCustomer?.companyInfo || {}),
          releaseVersion: form.release && form.release !== '—' ? form.release : selectedCustomer?.companyInfo?.releaseVersion,
        },
        cloudDetails: {
          ...(selectedCustomer?.cloudDetails || {}),
          vendor: form.vendor as 'sugam' | 'comhard' | 'other',
          release: form.release && form.release !== '—' ? form.release : undefined,
          vendorCategory: form.product && form.product !== '—' ? form.product : undefined,
          domainLinkSubId: form.domainLinkSubId || undefined,
          noOfUsers: toNumber(form.noOfUsers) || 1,
          cloudStartDate: form.cloudStartDate || undefined,
          cloudExpiryDate: form.cloudExpiryDate || undefined,
          licenseSerialNo: form.licenseSerialNo || undefined,
          users: selectedCustomer?.cloudDetails?.users || [],
          companyType: form.companyType as 'head_office' | 'branch',
          companyName: form.companyName || undefined,
          address: form.address || undefined,
          details: form.details || undefined,
          actualPrice: toNumber(form.actualPrice),
          discount: toNumber(form.discount),
          currentPrice: toNumber(form.currentPrice),
          advance1: toNumber(form.advance1),
          advance2: toNumber(form.advance2),
          others: form.others || undefined,
        },
      };
      await api.patch(`/customers/${customerId}`, payload);
    },
    meta: { invalidateQueryKeys: [['customers-management-pages'], ['customers-management-insights'], ['customers'], ['customers-all']] },
    onSuccess: () => {
      toast.success('Cloud details saved');
      setCreateOpen(false);
      setForm({
        customerId: '',
        vendor: 'sugam',
        product: '',
        release: '',
        domainLinkSubId: '',
        noOfUsers: '1',
        cloudStartDate: '',
        cloudExpiryDate: '',
        licenseSerialNo: '',
        companyType: 'head_office',
        companyName: '',
        address: '',
        details: '',
        actualPrice: '',
        discount: '',
        currentPrice: '',
        advance1: '',
        advance2: '',
        remainingTotal: '',
        others: '',
      });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to save cloud details'),
  });

  const exportCloud = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1', moduleType: 'cloud' };
    if (search.trim()) params.search = search.trim();
    if (productFilter !== 'all') params.product = productFilter;
    if (vendorFilter !== 'all') params.vendor = vendorFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (hasActiveDateFilter) {
      params.startDate = filterStartDate;
      params.endDate = filterEndDate;
    }
    const res = await api.get('/customers', { params });
    const allCloudCustomers = (res.data?.data || []) as Customer[];
    let allCloudRows = moduleListRows(allCloudCustomers, 'cloud', hasCloud);
    if (statusFilter !== 'all') {
      allCloudRows = allCloudRows.filter(({ customer: c, service }) => {
        const s = (cloudStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active') return s.includes('active');
        if (statusFilter === 'expiring') return s.includes('expiring');
        if (statusFilter === 'expired') return s.includes('expired');
        return true;
      });
    }
    if (hasActiveDateFilter) {
      allCloudRows = allCloudRows.filter(({ customer: c, service }) =>
        matchDateFilterRange(
          cloudExpiryDate(c, service),
          cloudStartDate(c, service),
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        )
      );
    }
    exportExcelWorkbook('cloud-registry', [
      { name: 'Cloud Registry', rows: cloudListExportRows(allCloudRows) },
    ]);
  };

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [rowTemplates, setRowTemplates] = useState<Record<string, string>>({});
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);

  const handleBulkTemplateSelect = (templateId: string) => {
    setBulkTemplateId(templateId);
    setRowTemplates((prev) => {
      const next = { ...prev };
      selectedKeys.forEach((k) => {
        next[k] = templateId;
      });
      return next;
    });
  };

  const handleRowTemplateChange = (key: string, templateId: string) => {
    setRowTemplates((prev) => ({ ...prev, [key]: templateId }));
  };

  const isAllPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedKeys.includes(r.rowKey));

  const toggleSelectAllPage = () => {
    const pageKeys = pagedRows.map(r => r.rowKey);
    if (isAllPageSelected) {
      setSelectedKeys(prev => prev.filter(k => !pageKeys.includes(k)));
      setRowTemplates(prev => {
        const next = { ...prev };
        pageKeys.forEach(k => {
          delete next[k];
        });
        return next;
      });
    } else {
      setSelectedKeys(prev => Array.from(new Set([...prev, ...pageKeys])));
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const isCurrentlySelected = prev.includes(key);
      if (isCurrentlySelected) {
        setRowTemplates(r => {
          const nr = { ...r };
          delete nr[key];
          return nr;
        });
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const selectedRows = filteredRows.filter(r => selectedKeys.includes(r.rowKey));

  const bulkEmailTargets: BulkEmailTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = c.name || textValue(c.cloudDetails?.companyName, service?.companyName, '—');
    const customerEmail = c.email || c.primaryContactInfo?.email || '';
    const startDate = cloudStartDate(c, service);
    const endDate = cloudExpiryDate(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      email: customerEmail,
      cc: c.secondaryContactInfo?.email,
      templateId,
      dynamicData: {
        customerName,
        companyName: customerName,
        product: cloudProduct(c, service),
        release: cloudRelease(c, service),
        serialNo: cloudDomainSubId(c, service),
        expiryDate: fmt.date(endDate as any),
        startDate: fmt.date(startDate as any),
        endDate: fmt.date(endDate as any),
        contactPerson: customerContact(c),
        phone: customerPhone(c),
        email_id: customerEmail,
      },
    };
  });

  const bulkWhatsAppTargets: BulkWhatsAppTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = c.name || textValue(c.cloudDetails?.companyName, service?.companyName, '—');
    const phone = customerPhone(c);
    const startDate = cloudStartDate(c, service);
    const endDate = cloudExpiryDate(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      phone,
      templateId,
      customMessage: moduleWhatsappMessage(c, 'Cloud', [
        ['Product', cloudProduct(c, service)],
        ['Release', cloudRelease(c, service)],
        ['Domain / Sub ID', cloudDomainSubId(c, service)],
        ['Users', cloudUsers(c, service)],
        ['Start Date', fmt.date(startDate as any)],
        ['Expiry Date', fmt.date(endDate as any)],
      ]),
      dynamicData: {
        customerName,
        product: cloudProduct(c, service),
        expiryDate: fmt.date(endDate as any),
      },
    };
  });

  const exportSelectedCloud = () => {
    if (selectedRows.length === 0) {
      toast.error('No records selected to export');
      return;
    }
    exportExcelWorkbook('selected-cloud-registry', [
      { name: 'Selected Cloud Records', rows: cloudListExportRows(selectedRows) },
    ]);
    toast.success(`Exported ${selectedRows.length} selected cloud records`);
  };

  return (
    <div>
      <ModernDashboardLayout
        title="Cloud Operations Master"
        subtitle={`Monitoring ${filteredRows.length} cloud instances and user allocations`}
        kpiCards={[
          { label: 'Cloud Customers', value: insights?.cloudDashboard?.kpi?.total ?? '—', icon: <Cloud size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'Managed accounts' },
          { label: 'Active Users', value: insights?.cloudDashboard?.kpi?.totalUsers ?? '—', icon: <Users size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Assigned seats' },
          { label: 'Expiring', value: insights?.cloudDashboard?.kpi?.expiring ?? '—', icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Plan renewals' },
          { label: 'Expired', value: insights?.cloudDashboard?.kpi?.expired ?? '—', icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Immediate action' },
        ]}
        tableSearch={
          <>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search cloud setups..."
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
            <button
              className="btn btn-export btn-sm"
              onClick={exportCloud}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        tableHeaders={
          <>
            <th style={{ width: 44, textAlign: 'center', padding: '10px 14px' }}>
              <input
                type="checkbox"
                className="crm-checkbox crm-checkbox-header"
                checked={isAllPageSelected}
                onChange={toggleSelectAllPage}
                title="Select all on this page"
              />
            </th>
            <th className="sno-col">S NO</th>
            <th>Customer No</th>
            <th>Logo</th>
            <th>Company Name</th>
            <th>Partner Name</th>
            <th>Product</th>
            <th>Release</th>
            <th>Domain / Sub ID</th>
            <th>Users</th>
            <th>Start Date</th>
            <th>Expiry Date</th>
            <th>Status</th>
            <th>U.Details</th>
            <th>Template</th>
            <th>Last Notified</th>
            <th>Action</th>
          </>
        }
        tableBody={
          filteredRows.length === 0 ? (
            <tr>
              <td colSpan={16} style={{ padding: '60px', textAlign: 'center' }}>
                <Cloud size={32} style={{ color: 'var(--tx-5)', marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-2)' }}>No cloud records found</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Try adjusting your search or filters</div>
              </td>
            </tr>
          ) : (
            pagedRows.map((row, idx) => {
              const isSelected = selectedKeys.includes(row.rowKey);
              const templateId = rowTemplates[row.rowKey] || (isSelected ? bulkTemplateId : '') || '';
              return (
                <CloudTableRow
                  key={row.rowKey}
                  c={row.customer}
                  service={row.service}
                  idx={(page - 1) * Number(pageSize) + idx}
                  isSelected={isSelected}
                  selectedTemplateId={templateId}
                  onTemplateChange={(tid) => handleRowTemplateChange(row.rowKey, tid)}
                  onToggleSelect={() => toggleSelectRow(row.rowKey)}
                  openViewForCustomer={(customer, service) => setViewSelection({ customer, service })}
                  openUserDetails={setUserDetailsCustomer}
                />
              );
            })
          )
        }
        tableFooter={<Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} total={filteredRows.length} pageSize={pageSize} />}
      />

      <BulkActionToolbar
        selectedCount={selectedKeys.length}
        totalCount={filteredRows.length}
        isAllPageSelected={isAllPageSelected}
        onSelectAllPage={toggleSelectAllPage}
        selectedTemplateId={bulkTemplateId}
        onSelectTemplate={handleBulkTemplateSelect}
        onClearSelection={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
        }}
        onOpenBulkEmail={() => setIsBulkEmailOpen(true)}
        onOpenBulkWhatsApp={() => setIsBulkWhatsAppOpen(true)}
      />

      <BulkEmailModal
        open={isBulkEmailOpen}
        onClose={() => setIsBulkEmailOpen(false)}
        targets={bulkEmailTargets}
        initialTemplateId={bulkTemplateId}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
        }}
      />

      <BulkWhatsAppModal
        open={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        targets={bulkWhatsAppTargets}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Cloud Details"
        size="xxl"
        footer={
          <button className="btn btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? <Spinner size={14} /> : <Plus size={14} />}
            {createMut.isPending ? 'Saving...' : 'Save Cloud'}
          </button>
        }
      >
        <SelectField
          label="Customer"
          required
          value={form.customerId}
          onChange={(v) => {
            const c = allCustomers.find((x) => x._id === v);
            if (!c) return set('customerId', v);
            openForCustomer(c);
          }}
          options={allCustomers.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="— Select Customer —"
        />
        <div className="form-grid-3">
          <InputField label="Company Name" value={form.companyName} onChange={(v) => set('companyName', v)} />
          <InputField label="Product" value={form.product} onChange={(v) => set('product', v)} />
          <InputField label="Release" value={form.release} onChange={(v) => set('release', v)} />
          <InputField label="Domain_Link / SUB_ID" value={form.domainLinkSubId} onChange={(v) => set('domainLinkSubId', v)} />
          <InputField label="No.Of. Users" value={form.noOfUsers} onChange={(v) => set('noOfUsers', v)} type="number" />
          <InputField label="Cloud Start Date" value={form.cloudStartDate} onChange={(v) => set('cloudStartDate', v)} type="date" />
          <InputField label="Cloud Expiry Date" value={form.cloudExpiryDate} onChange={(v) => set('cloudExpiryDate', v)} type="date" />
          <div className="form-group">
            <label className="form-label">Branch</label>
            <input
              className="form-control"
              disabled
              value={selectedCustomer ? (selectedCustomer.branchInfo?.isBranch ? (selectedCustomer.branchInfo?.branchName || 'Branch') : 'Head Office') : '—'}
            />
          </div>
          <SelectField
            label="Vendor"
            value={form.vendor}
            onChange={(v) => set('vendor', v)}
            options={[
              { value: 'sugam', label: 'Sugam' },
              { value: 'comhard', label: 'Comhard' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <InputField label="License Serial No" value={form.licenseSerialNo} onChange={(v) => set('licenseSerialNo', v)} />
          <div className="form-group">
            <label className="form-label">Company Type</label>
            <input className="form-control" disabled value={form.companyType === 'branch' ? 'Branch' : 'Head Office'} />
          </div>
          <InputField label="Address" value={form.address} onChange={(v) => set('address', v)} />
          <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
          <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
          <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
          <InputField
            label="Current Price"
            value={form.currentPrice}
            onChange={(v) => set('currentPrice', v)}
            type="number"
          />
          <InputField
            label="Advance 1"
            value={form.advance1}
            onChange={(v) => set('advance1', v)}
            type="number"
          />
          <InputField
            label="Advance 2"
            value={form.advance2}
            onChange={(v) => set('advance2', v)}
            type="number"
          />
          <div className="form-group">
            <label className="form-label">Remaining Total</label>
            <input className="form-control" readOnly value={form.remainingTotal || 'Will calculate after save'} />
          </div>
          <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
        </div>
      </Modal>

      <ModuleRenewalHistoryModal
        type="cloud"
        customer={viewSelection?.customer || null}
        service={viewSelection?.service}
        onClose={() => setViewSelection(null)}
      />

      {/* ── User Details Popup ── */}
      <Modal
        open={!!userDetailsCustomer}
        onClose={() => setUserDetailsCustomer(null)}
        title="User Details"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setUserDetailsCustomer(null)}>Close</button>
          </div>
        }
      >
        {userDetailsCustomer && (() => {
          const users = userDetailsCustomer.cloudDetails?.users || [];
          return (
            <div>
              {/* Company banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 18 }}>
                <Avatar name={userDetailsCustomer.name} src={userDetailsCustomer.avatar} size="md" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {userDetailsCustomer.cloudDetails?.companyName || userDetailsCustomer.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                    {users.length} user{users.length !== 1 ? 's' : ''} registered
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                  <Users size={16} />
                </div>
              </div>

              {/* Users table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th>S NO</th>
                      <th>Username</th>
                      <th>User Detail</th>
                      <th>User Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={i} style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border)' : undefined, transition: 'background 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--brand-light)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--brand)' }}>{i + 1}</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={u.username || `User ${i + 1}`} size="sm" />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-1)' }}>
                              {u.username || <span style={{ color: 'var(--tx-4)' }}>—</span>}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--tx-2)' }}>
                          {u.userDetail || <span style={{ color: 'var(--tx-4)' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--tx-2)' }}>
                          {u.userLocation || <span style={{ color: 'var(--tx-4)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export const TSSDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: insights, isLoading } = useCustomerManagementInsights();
  const dashboard = insights?.tssDashboard || {};
  const kpi = dashboard?.kpi || { total: 0, active: 0, expiring: 0, expired: 0, renewalDue: 0 };
  const radarRows = (dashboard?.radarRows || []) as Array<{ customer: Customer; days: number | null }>;
  const recentRows = (dashboard?.recentRows || []) as Customer[];

  const [filter, setFilter] = React.useState('all');
  const filteredRadarRows = React.useMemo(() => {
    if (filter === '7days') return radarRows.filter(r => (r.days ?? 999) <= 7);
    if (filter === '1month') return radarRows.filter(r => (r.days ?? 999) <= 30);
    return radarRows;
  }, [radarRows, filter]);

  const kpiCards = [
    { label: 'Total TSS Customers', value: kpi.total, icon: <SearchCheck size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'License tracking' },
    { label: 'Active', value: kpi.active, icon: <CheckCircle size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'In service window' },
    { label: 'Expiring (30d)', value: kpi.expiring, icon: <Clock size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Needs renewal plan' },
    { label: 'Due (15d)', value: kpi.renewalDue, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Immediate follow-up' },
    { label: 'Expired', value: kpi.expired, icon: <AlertTriangle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Critical cases' },
  ];

  return (
    <>
      <ModernDashboardLayout
        title="TSS Dashboard"
        subtitle="Track TSS expiries and renewal workload"
        headerActions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tss/list')}>TSS Management</button>
            <button
              className="btn btn-export btn-sm"
              onClick={() => {
                const radarData = filteredRadarRows.map(({ customer: c, days }, idx) => ({
                  'S NO': idx + 1,
                  'Customer Name': c.name || '—',
                  'TSS Expiry': tssExpiryDate(c) ? fmt.date(tssExpiryDate(c) as any) : '—',
                  'License Type': c.licenceType || '—',
                  Status: days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`,
                }));
                const recentData = recentRows.map((c, idx) => ({
                  'S NO': idx + 1,
                  Customer: c.name || '—',
                  Product: tssProduct(c),
                  Release: tssRelease(c),
                  'License Serial': tssSerialNo(c),
                  'Expiry Date': tssExpiryDate(c) ? fmt.date(tssExpiryDate(c) as any) : '—',
                  Contact: tssContactPerson(c),
                  Status: tssStatus(c),
                }));
                exportExcelWorkbook('tss-dashboard', [
                  { name: 'Renewal Radar', rows: radarData },
                  { name: 'Recent TSS Subscriptions', rows: recentData },
                ]);
              }}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        kpiCards={kpiCards}
        donutData={{ active: kpi.active, expiring: kpi.expiring, expired: kpi.expired, total: kpi.total }}
        recentTableTitle="TSS Renewal Radar"
        tableActions={
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'OverAll' },
              { value: '7days', label: '7 Days' },
              { value: '1month', label: '1 Month' },
            ]}
            className="filter-select"
            style={{ height: 32, fontSize: 12 }}
          />
        }
        isLoading={isLoading}
        tableHeaders={
          <>
            <th >S NO</th>
            <th >Customer Name</th>
            <th >TSS Expiry</th>
            <th >License Type</th>
            <th >Status</th>
            <th >Action</th>
          </>
        }
        tableBody={
          filteredRadarRows.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '60px', textAlign: 'center' }}><span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tx-3)' }}>No TSS renewal risks</span></td></tr>
          ) : (
            filteredRadarRows.map(({ customer: c, days }, idx) => (
              <tr key={c._id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '20px 32px', fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>{c.name || '—'}</span>
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                  {fmt.date(c.serialNoInfo?.[0]?.tssExpiryDate || c.serialNoInfo?.[0]?.endDate)}
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', textAlign: 'center' }}>
                  {c.licenceType || c.serialNoInfo?.[0]?.licenceType || '—'}
                </td>
                <td style={{ padding: '20px 32px' }}>
                  <span className={`badge ${days !== null && days < 0 ? 'badge-red' : days !== null && days <= 15 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px', borderRadius: '12px' }}>
                    {days === null ? 'Unknown' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                </td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <button style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-3)'; }} onClick={() => navigate('/tss/list')}>
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))
          )
        }
        footerContent={
          <div className="quick-grid-3">
            {[
              { icon: <SearchCheck size={18} />, title: 'TSS Management', sub: `${kpi.total} tracked customers`, path: '/tss/list', color: 'var(--brand)', bg: 'var(--brand-light)', bd: 'var(--border)' },
              { icon: <Users size={18} />, title: 'Customers', sub: `${kpi.active} active licenses`, path: '/customers', color: 'var(--green)', bg: 'var(--green-bg)', bd: 'var(--green-bd)' },
            ].map((link, i) => (
              <button key={link.title} type="button" className="alert-card fade-in-up" style={{ animationDelay: `${(kpiCards.length + i) * 60}ms`, textAlign: 'left' }} onClick={() => navigate(link.path)}>
                <div className="alert-card-icon" style={{ background: link.bg, color: link.color, borderColor: link.bd }}>{link.icon}</div>
                <div>
                  <div className="alert-card-title">{link.title}</div>
                  <div className="alert-card-sub">{isLoading ? '—' : link.sub}</div>
                </div>
              </button>
            ))}
          </div>
        }
      />
    </>
  );
};

export const TSSListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: insights } = useCustomerManagementInsights();

  const urlSearch = searchParams.get('search') || searchParams.get('customer') || '';
  const urlProduct = searchParams.get('product') || 'all';
  const urlStatus = searchParams.get('status') || 'all';

  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewSelection, setViewSelection] = React.useState<ModuleViewSelection>(null);
  const [form, setForm] = React.useState({
    customerId: '',
    tssExpiryDate: '',
    licenceType: '',
    licenceStatus: 'active',
    product: '',
    release: '',
    licenseSerialNo: '',
    contactPerson: '',
    mobile: '',
    email: '',
    companyType: 'head_office',
    companyName: '',
    address: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });
  const [search, setSearch] = React.useState(urlSearch);
  const [statusFilter, setStatusFilter] = React.useState(urlStatus);
  const [productFilter, setProductFilter] = React.useState(urlProduct);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState('10');

  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
    if (urlProduct && urlProduct !== 'all') setProductFilter(urlProduct);
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
  }, [urlSearch, urlProduct, urlStatus]);

  const { isFiltered, startDate: filterStartDate, endDate: filterEndDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!filterStartDate && !!filterEndDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${filterStartDate}_${filterEndDate}` : 'all';

  const { data: tssCustsData, isLoading } = useQuery({
    queryKey: ['customers-tss-list', search, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { all: 'true', moduleType: 'tss' };
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = filterStartDate;
        params.endDate = filterEndDate;
      }
      const res = await api.get('/customers', { params });
      return (res.data?.data || []) as Customer[];
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 100 } });
      return (res.data?.data || []) as Array<{ name: string }>;
    },
  });

  const productOptions = React.useMemo(() => {
    const list = (productsData || []).map((p: any) => p.name);
    return [
      { value: 'all', label: 'All Products' },
      ...list.sort().map((p: string) => ({ value: p, label: p }))
    ];
  }, [productsData]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
  ];

  const { data: allCustsData } = useQuery({
    queryKey: ['customers-all-names'],
    enabled: createOpen,
    queryFn: async () => {
      const res = await api.get('/customers', { params: { all: 'true' } });
      return (res.data.data || []) as Customer[];
    },
  });

  const customers = tssCustsData || [];
  const allCustomers = allCustsData || [];
  const filteredRows = React.useMemo(() => {
    const rows = moduleListRows(customers, 'tss', hasTSS);
    return rows.filter(({ customer: c, service }) => {
      if (statusFilter !== 'all') {
        const s = (tssStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active' && !s.includes('active')) return false;
        if (statusFilter === 'expiring' && !s.includes('expiring')) return false;
        if (statusFilter === 'expired' && !s.includes('expired')) return false;
      }
      if (productFilter !== 'all') {
        const prod = (tssProduct(c, service) || '').toLowerCase();
        if (!prod.includes(productFilter.toLowerCase())) return false;
      }
      if (hasActiveDateFilter) {
        const startVal = service?.startDate || c.tssDetails?.startDate || c.serialNoInfo?.[0]?.startDate;
        const match = matchDateFilterRange(
          tssExpiryDate(c, service),
          startVal,
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        );
        if (!match) return false;
      }
      return true;
    });
  }, [customers, statusFilter, productFilter, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / Number(pageSize)));

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [totalPages, page]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, productFilter, search, pageSize, hasActiveDateFilter, filterStartDate, filterEndDate]);

  const pagedRows = React.useMemo(() => {
    const start = (page - 1) * Number(pageSize);
    return filteredRows.slice(start, start + Number(pageSize));
  }, [filteredRows, page, pageSize]);

  const selectedCustomer = allCustomers.find((c) => c._id === form.customerId) || null;
  const set = (field: keyof typeof form, value: string) => setForm((p) => ({ ...p, [field]: value }));
  const openForCustomer = (c: Customer) => {
    setForm({
      customerId: c._id,
      tssExpiryDate: c.serialNoInfo?.[0]?.tssExpiryDate?.split('T')[0] || c.serialNoInfo?.[0]?.endDate?.split('T')[0] || '',
      licenceType: c.licenceType || c.serialNoInfo?.[0]?.licenceType || '',
      licenceStatus: c.serialNoInfo?.[0]?.licenceStatus || c.serialNoInfo?.[0]?.licenses?.[0]?.licenceStatus || 'active',
      product: tssProduct(c),
      release: tssRelease(c),
      licenseSerialNo: tssSerialNo(c) === '—' ? '' : tssSerialNo(c),
      contactPerson: tssContactPerson(c) === '—' ? '' : tssContactPerson(c),
      mobile: tssMobile(c) === '—' ? '' : tssMobile(c),
      email: tssEmail(c) === '—' ? '' : tssEmail(c),
      companyType: c.tssDetails?.companyType || (c.branchInfo?.isBranch ? 'branch' : 'head_office'),
      companyName: c.tssDetails?.companyName || c.name || '',
      address: c.tssDetails?.address || c.address || '',
      details: c.tssDetails?.details || '',
      actualPrice: c.tssDetails?.actualPrice != null ? String(c.tssDetails.actualPrice) : '',
      discount: c.tssDetails?.discount != null ? String(c.tssDetails.discount) : '',
      currentPrice: c.tssDetails?.currentPrice != null ? String(c.tssDetails.currentPrice) : '',
      advance1: c.tssDetails?.advance1 != null ? String(c.tssDetails.advance1) : '',
      advance2: c.tssDetails?.advance2 != null ? String(c.tssDetails.advance2) : '',
      remainingTotal: c.tssDetails?.remainingTotal != null ? String(c.tssDetails.remainingTotal) : '',
      others: c.tssDetails?.others || '',
    });
    setCreateOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const customerId = selectedCustomer?._id || form.customerId;
      const serialRows = Array.isArray(selectedCustomer?.serialNoInfo) ? selectedCustomer.serialNoInfo : [];
      const primarySerial = serialRows[0] || {};
      const payload = {
        ...(selectedCustomer ? buildCustomerPatchBase(selectedCustomer) : {}),
        products: form.product && form.product !== '—' ? [form.product] : (selectedCustomer?.products || []),
        companyInfo: {
          ...(selectedCustomer?.companyInfo || {}),
          releaseVersion: form.release && form.release !== '—' ? form.release : selectedCustomer?.companyInfo?.releaseVersion,
        },
        serialNoInfo: [
          {
            ...primarySerial,
            product: form.product && form.product !== '—' ? form.product : primarySerial.product,
            releaseVersion: form.release && form.release !== '—' ? form.release : primarySerial.releaseVersion,
            licenceType: form.licenceType || primarySerial.licenceType,
            licenceStatus: form.licenceStatus || primarySerial.licenceStatus,
            licenseSerialNo: form.licenseSerialNo || primarySerial.licenseSerialNo,
            tssExpiryDate: form.tssExpiryDate || primarySerial.tssExpiryDate,
            endDate: form.tssExpiryDate || primarySerial.endDate,
            licenses: [
              {
                ...(primarySerial.licenses?.[0] || {}),
                licenceSerialNo: form.licenseSerialNo || primarySerial.licenses?.[0]?.licenceSerialNo,
                licenceStatus: form.licenceStatus || primarySerial.licenses?.[0]?.licenceStatus || 'active',
              },
            ],
          },
        ],
        tssDetails: {
          ...(selectedCustomer?.tssDetails || {}),
          status: form.licenceStatus as 'active' | 'expiring' | 'none',
          licenceType: form.licenceType || undefined,
          licenseSerialNo: form.licenseSerialNo || undefined,
          contactPerson: form.contactPerson || undefined,
          mobile: form.mobile || undefined,
          email: form.email || undefined,
          companyType: form.companyType as 'head_office' | 'branch',
          companyName: form.companyName || undefined,
          address: form.address || undefined,
          details: form.details || undefined,
          actualPrice: toNumber(form.actualPrice),
          discount: toNumber(form.discount),
          currentPrice: toNumber(form.currentPrice),
          advance1: toNumber(form.advance1),
          advance2: toNumber(form.advance2),
          others: form.others || undefined,
          endDate: form.tssExpiryDate || selectedCustomer?.tssDetails?.endDate || undefined,
        },
      };
      await api.patch(`/customers/${customerId}`, payload);
    },
    meta: { invalidateQueryKeys: [['customers-management-pages'], ['customers-management-insights'], ['customers'], ['customers-all']] },
    onSuccess: () => {
      toast.success('TSS details saved');
      setCreateOpen(false);
      setForm({
        customerId: '',
        tssExpiryDate: '',
        licenceType: '',
        licenceStatus: 'active',
        product: '',
        release: '',
        licenseSerialNo: '',
        contactPerson: '',
        mobile: '',
        email: '',
        companyType: 'head_office',
        companyName: '',
        address: '',
        details: '',
        actualPrice: '',
        discount: '',
        currentPrice: '',
        advance1: '',
        advance2: '',
        remainingTotal: '',
        others: '',
      });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to save TSS details'),
  });

  const exportTSS = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1', moduleType: 'tss' };
    if (search.trim()) params.search = search.trim();
    if (productFilter !== 'all') params.product = productFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (hasActiveDateFilter) {
      params.startDate = filterStartDate;
      params.endDate = filterEndDate;
    }
    const res = await api.get('/customers', { params });
    const allTSSCustomers = (res.data?.data || []) as Customer[];
    let allTSSRows = moduleListRows(allTSSCustomers, 'tss', hasTSS);
    if (statusFilter !== 'all') {
      allTSSRows = allTSSRows.filter(({ customer: c, service }) => {
        const s = (tssStatus(c, service) || '').toLowerCase();
        if (statusFilter === 'active') return s.includes('active');
        if (statusFilter === 'expiring') return s.includes('expiring');
        if (statusFilter === 'expired') return s.includes('expired');
        return true;
      });
    }
    if (hasActiveDateFilter) {
      allTSSRows = allTSSRows.filter(({ customer: c, service }) => {
        const startVal = service?.startDate || c.tssDetails?.startDate || c.serialNoInfo?.[0]?.startDate;
        return matchDateFilterRange(
          tssExpiryDate(c, service),
          startVal,
          c.createdAt,
          statusFilter,
          filterStartDate,
          filterEndDate
        );
      });
    }
    exportExcelWorkbook('tss-registry', [
      { name: 'TSS Registry', rows: tssListExportRows(allTSSRows) },
    ]);
  };

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [rowTemplates, setRowTemplates] = useState<Record<string, string>>({});
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);

  const handleBulkTemplateSelect = (templateId: string) => {
    setBulkTemplateId(templateId);
    setRowTemplates((prev) => {
      const next = { ...prev };
      selectedKeys.forEach((k) => {
        next[k] = templateId;
      });
      return next;
    });
  };

  const handleRowTemplateChange = (key: string, templateId: string) => {
    setRowTemplates((prev) => ({ ...prev, [key]: templateId }));
  };

  const isAllPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedKeys.includes(r.rowKey));

  const toggleSelectAllPage = () => {
    const pageKeys = pagedRows.map(r => r.rowKey);
    if (isAllPageSelected) {
      setSelectedKeys(prev => prev.filter(k => !pageKeys.includes(k)));
      setRowTemplates(prev => {
        const next = { ...prev };
        pageKeys.forEach(k => {
          delete next[k];
        });
        return next;
      });
    } else {
      setSelectedKeys(prev => Array.from(new Set([...prev, ...pageKeys])));
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => {
      const isCurrentlySelected = prev.includes(key);
      if (isCurrentlySelected) {
        setRowTemplates(r => {
          const nr = { ...r };
          delete nr[key];
          return nr;
        });
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const selectedRows = filteredRows.filter(r => selectedKeys.includes(r.rowKey));

  const bulkEmailTargets: BulkEmailTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = c.name || textValue(c.tssDetails?.companyName, service?.companyName, '—');
    const emailVal = tssEmail(c);
    const customerEmail = (emailVal === '—' ? (c.email || c.primaryContactInfo?.email) : emailVal) || '';
    const expiryDate = tssExpiryDate(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      email: customerEmail,
      cc: c.secondaryContactInfo?.email,
      templateId,
      dynamicData: {
        customerName,
        companyName: customerName,
        product: tssProduct(c, service),
        release: tssRelease(c, service),
        serialNo: tssSerialNo(c, service),
        expiryDate: fmt.date(expiryDate as any),
        contactPerson: tssContactPerson(c),
        mobile: tssMobile(c),
        phone: tssMobile(c),
        email_id: customerEmail,
      },
    };
  });

  const bulkWhatsAppTargets: BulkWhatsAppTarget[] = selectedRows.map(({ customer: c, service, rowKey }) => {
    const customerName = c.name || textValue(c.tssDetails?.companyName, service?.companyName, '—');
    const phone = tssMobile(c) === '—' ? (c.phone || c.primaryContactInfo?.mobile || '') : tssMobile(c);
    const expiryDate = tssExpiryDate(c, service);
    const status = tssStatus(c, service);
    const templateId = rowTemplates[rowKey] || bulkTemplateId;
    return {
      id: c._id,
      customerName,
      phone,
      templateId,
      customMessage: moduleWhatsappMessage(c, 'TSS', [
        ['Product', tssProduct(c, service)],
        ['Release', tssRelease(c, service)],
        ['Serial No', tssSerialNo(c, service)],
        ['Expiry Date', fmt.date(expiryDate as any)],
        ['Contact', tssContactPerson(c)],
        ['Mobile', tssMobile(c)],
        ['Status', status],
      ]),
      dynamicData: {
        customerName,
        product: tssProduct(c, service),
        expiryDate: fmt.date(expiryDate as any),
      },
    };
  });

  const exportSelectedTSS = () => {
    if (selectedRows.length === 0) {
      toast.error('No records selected to export');
      return;
    }
    exportExcelWorkbook('selected-tss-registry', [
      { name: 'Selected TSS Records', rows: tssListExportRows(selectedRows) },
    ]);
    toast.success(`Exported ${selectedRows.length} selected TSS records`);
  };

  return (
    <div>
      <ModernDashboardLayout
        title="TSS Service Hub"
        subtitle={`Tracking ${filteredRows.length} active service subscriptions and license windows`}
        kpiCards={[
          { label: 'Total TSS', value: insights?.tssDashboard?.kpi?.total ?? '—', icon: <SearchCheck size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'License registry' },
          { label: 'Active', value: insights?.tssDashboard?.kpi?.active ?? '—', icon: <CheckCircle size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'In service window' },
          { label: 'Expiring', value: insights?.tssDashboard?.kpi?.expiring ?? '—', icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Renewal due' },
          { label: 'Expired', value: insights?.tssDashboard?.kpi?.expired ?? '—', icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Service lapsed' },
        ]}
        tableSearch={
          <>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search TSS serials..."
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
            <button
              className="btn btn-export btn-sm"
              onClick={exportTSS}
            >
              <Download size={13} /> Export
            </button>
          </>
        }
        tableHeaders={
          <>
            <th style={{ width: 44, textAlign: 'center', padding: '10px 14px' }}>
              <input
                type="checkbox"
                className="crm-checkbox crm-checkbox-header"
                checked={isAllPageSelected}
                onChange={toggleSelectAllPage}
                title="Select all on this page"
              />
            </th>
            <th className="sno-col">S NO</th>
            <th>Customer No</th>
            <th>Logo</th>
            <th>Company Name</th>
            <th>Partner Name</th>
            <th>Product</th>
            <th>Release</th>
            <th>License Serial</th>
            <th>Expiry Date</th>
            <th>Contact</th>
            <th>Mobile</th>
            <th>Email</th>
            <th>Status</th>
            <th>Template</th>
            <th>Last Notified</th>
            <th>Actions</th>
          </>
        }
        tableBody={
          filteredRows.length === 0 ? (
            <tr>
              <td colSpan={17} style={{ padding: '60px', textAlign: 'center' }}>
                <SearchCheck size={32} style={{ color: 'var(--tx-5)', marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-2)' }}>No TSS records found</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Try adjusting your search or filters</div>
              </td>
            </tr>
          ) : (
            pagedRows.map((row, idx) => {
              const isSelected = selectedKeys.includes(row.rowKey);
              const templateId = rowTemplates[row.rowKey] || (isSelected ? bulkTemplateId : '') || '';
              return (
                <TSSTableRow
                  key={row.rowKey}
                  c={row.customer}
                  service={row.service}
                  idx={(page - 1) * Number(pageSize) + idx}
                  isSelected={isSelected}
                  selectedTemplateId={templateId}
                  onTemplateChange={(tid) => handleRowTemplateChange(row.rowKey, tid)}
                  onToggleSelect={() => toggleSelectRow(row.rowKey)}
                  openViewForCustomer={(customer, service) => setViewSelection({ customer, service })}
                />
              );
            })
          )
        }
        tableFooter={<Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} total={filteredRows.length} pageSize={pageSize} />}
      />

      <BulkActionToolbar
        selectedCount={selectedKeys.length}
        totalCount={filteredRows.length}
        isAllPageSelected={isAllPageSelected}
        onSelectAllPage={toggleSelectAllPage}
        selectedTemplateId={bulkTemplateId}
        onSelectTemplate={handleBulkTemplateSelect}
        onClearSelection={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
        }}
        onOpenBulkEmail={() => setIsBulkEmailOpen(true)}
        onOpenBulkWhatsApp={() => setIsBulkWhatsAppOpen(true)}
      />

      <BulkEmailModal
        open={isBulkEmailOpen}
        onClose={() => setIsBulkEmailOpen(false)}
        targets={bulkEmailTargets}
        initialTemplateId={bulkTemplateId}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
        }}
      />

      <BulkWhatsAppModal
        open={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        targets={bulkWhatsAppTargets}
        onComplete={() => {
          setSelectedKeys([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="TSS Details"
        size="xxl"
        footer={
          <button className="btn btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? <Spinner size={14} /> : <Plus size={14} />}
            {createMut.isPending ? 'Saving...' : 'Save TSS'}
          </button>
        }
      >
        <SelectField
          label="Customer"
          required
          value={form.customerId}
          onChange={(v) => {
            const c = allCustomers.find((x) => x._id === v);
            if (!c) return set('customerId', v);
            openForCustomer(c);
          }}
          options={allCustomers.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="— Select Customer —"
        />
        <div className="form-grid-3">
          <InputField label="Company Name" value={form.companyName} onChange={(v) => set('companyName', v)} />
          <InputField label="Product" value={form.product} onChange={(v) => set('product', v)} />
          <InputField label="Release" value={form.release} onChange={(v) => set('release', v)} />
          <InputField label="License Serial No" value={form.licenseSerialNo} onChange={(v) => set('licenseSerialNo', v)} />
          <InputField label="TSS Expiry Date" value={form.tssExpiryDate} onChange={(v) => set('tssExpiryDate', v)} type="date" />
          <InputField label="Contact Person" value={form.contactPerson} onChange={(v) => set('contactPerson', v)} />
          <InputField label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} />
          <InputField label="Email ID" value={form.email} onChange={(v) => set('email', v)} />
          <SelectField
            label="Status"
            value={form.licenceStatus}
            onChange={(v) => set('licenceStatus', v)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'surrendered', label: 'Surrendered' },
              { value: 'terminated', label: 'Terminated' },
            ]}
          />
          <InputField label="Licence Type" value={form.licenceType} onChange={(v) => set('licenceType', v)} placeholder="e.g. Silver – Single User" />
          <div className="form-group">
            <label className="form-label">Branch</label>
            <input
              className="form-control"
              disabled
              value={selectedCustomer ? (selectedCustomer.branchInfo?.isBranch ? (selectedCustomer.branchInfo?.branchName || 'Branch') : 'Head Office') : '—'}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Customer Phone</label>
            <input className="form-control" disabled value={selectedCustomer ? customerPhone(selectedCustomer) : '—'} />
          </div>
          <div className="form-group">
            <label className="form-label">Company Type</label>
            <input className="form-control" disabled value={form.companyType === 'branch' ? 'Branch' : 'Head Office'} />
          </div>
          <InputField label="Address" value={form.address} onChange={(v) => set('address', v)} />
          <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
          <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
          <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
          <InputField
            label="Current Price"
            value={form.currentPrice}
            onChange={(v) => set('currentPrice', v)}
            type="number"
          />
          <InputField
            label="Advance 1"
            value={form.advance1}
            onChange={(v) => set('advance1', v)}
            type="number"
          />
          <InputField
            label="Advance 2"
            value={form.advance2}
            onChange={(v) => set('advance2', v)}
            type="number"
          />
          <div className="form-group">
            <label className="form-label">Remaining Total</label>
            <input className="form-control" readOnly value={form.remainingTotal || 'Will calculate after save'} />
          </div>
          <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
        </div>
      </Modal>

      <ModuleRenewalHistoryModal
        type="tss"
        customer={viewSelection?.customer || null}
        service={viewSelection?.service}
        onClose={() => setViewSelection(null)}
      />
    </div>
  );
};

// Backward-compatible exports for existing routes
export const CustomerTDLPage = TDLDashboardPage;
export const CustomerCloudPage = CloudDashboardPage;
export const CustomerTSSPage = TSSDashboardPage;
