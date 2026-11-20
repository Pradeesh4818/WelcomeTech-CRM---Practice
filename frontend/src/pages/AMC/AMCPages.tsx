import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Search, Edit, Eye, AlertTriangle, CheckCircle, Clock, Mail, Shield, Download, Plus, ChevronRight, Trash2, RefreshCw
} from 'lucide-react';
import api from '../../utils/api';
import { AMC, AMCRenewal, Customer } from '../../types';
import { fmt, getActiveCurrency, PAGE_SIZE_OPTIONS, calculateRemainingDays } from '../../utils/helpers';
import { exportExcelWorkbook, renewalRows } from '../../utils/excelExport';
import {
  Badge, Avatar, SkeletonRow, EmptyState, InputField, Select, SelectField, Spinner, Modal, ConfirmDialog, Pagination
} from '../../components/ui';
import toast from 'react-hot-toast';
import { EmailTemplateSelect, EmailTemplateSendButton } from '../../components/email/EmailActionCell';
import { ModernDashboardLayout } from '../../components/Dashboard/ModernDashboardLayout';
import CustomerWhatsAppAction from '../../components/whatsapp/CustomerWhatsAppAction';
import { BulkActionToolbar } from '../../components/bulk/BulkActionToolbar';
import { BulkEmailModal, BulkEmailTarget } from '../../components/bulk/BulkEmailModal';
import { BulkWhatsAppModal, BulkWhatsAppTarget } from '../../components/bulk/BulkWhatsAppModal';
import { NotifiedBadge } from '../../components/common/NotifiedBadge';
import { useDateFilter } from '../../context/DateFilterContext';

const amcTableColumnCount = 16;

const textValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '—';
};

const getPrimaryLicense = (cust: Customer | null) => {
  const serialRows = Array.isArray(cust?.serialNoInfo) ? cust?.serialNoInfo : [];
  return serialRows?.[0] || null;
};

const getContactName = (cust: Customer | null) => textValue(
  cust?.amcDetails?.contactPerson,
  cust?.primaryContactInfo?.contactName1,
  cust?.contact
);

const customerEmails = (cust: Customer | null) => Array.from(new Set([
  cust?.email,
  cust?.amcDetails?.email,
  cust?.tdlDetails?.email,
  cust?.cloudDetails?.email,
  cust?.tssDetails?.email,
  cust?.primaryContactInfo?.email,
  cust?.secondaryContactInfo?.email,
  ...(cust?.keyContacts || []).map((contact) => contact.email),
  ...(cust?.branches || []).map((branch) => branch.email),
  ...(cust?.partnerDetails || []).map((partner) => partner.email),
].map((value) => String(value || '').trim()).filter((value) => value && value !== '—' && value.includes('@'))));

const getLocationArea = (cust: Customer | null) => textValue(
  cust?.companyInfo?.locationArea,
  cust?.branchInfo?.branchName,
  cust?.amcDetails?.address,
  cust?.address,
  cust?.companyInfo?.fullAddress
);

const getAmcStartDate = (amc: Pick<AMC, 'startDate'>, cust: Customer | null) =>
  amc.startDate || getPrimaryLicense(cust)?.startDate || cust?.amcDetails?.startDate;

const getAmcEndDate = (amc: Pick<AMC, 'expiryDate'>, cust: Customer | null) =>
  amc.expiryDate || cust?.amcDetails?.endDate || getPrimaryLicense(cust)?.endDate;

const getAmcValue = (value?: number | null, cust?: Customer | null) =>
  value ?? cust?.amcDetails?.value ?? cust?.amcDetails?.currentPrice ?? cust?.amcDetails?.actualPrice ?? null;

const formatQar = (value?: number | null) =>
  value === undefined || value === null ? '—' : fmt.currency(Number(value));

const amcWhatsappMessage = (amc: AMC, cust: Customer | null) => [
  `Hello ${getContactName(cust) === '—' ? 'Customer' : getContactName(cust)},`,
  '',
  'Sharing your WelcomeTech AMC details:',
  `Customer: ${textValue(cust?.name, cust?.companyInfo?.customerName)}`,
  `Product: ${textValue(getPrimaryLicense(cust)?.product, amc.product)}`,
  `Start Date: ${fmt.date(getAmcStartDate(amc, cust))}`,
  `Expiry Date: ${fmt.date(getAmcEndDate(amc, cust))}`,
  `AMC Value: ${formatQar(getAmcValue(amc.amount, cust))}`,
  `Status: ${amc.status || '—'}`,
  '',
  'Thank you.',
].join('\n');

const isNoPartner = (value?: string | null): boolean =>
  !value || /^(no partner|nil|none|—|-)$/i.test(String(value).trim());

export const getAmcPartnerName = (cust: Customer | null, amc?: AMC): string => {
  if (!cust && !amc) return '—';
  
  // 1. Direct vendorCategory on amc
  const amcVendor = (amc as any)?.vendorCategory || (amc as any)?.partnerName || (amc as any)?.partner;
  if (amcVendor && !isNoPartner(amcVendor)) return String(amcVendor).trim();

  // 2. Customer partnerDetails
  const partnerNames = (cust?.partnerDetails || [])
    .map((p) => (p.companyName || p.fullName || p.service || '').trim())
    .filter((name) => name && !isNoPartner(name));

  if (partnerNames.length > 0) {
    return Array.from(new Set(partnerNames)).join(', ');
  }

  // 3. Fallback to amcDetails vendorCategory
  const fallback = cust?.amcDetails?.vendorCategory;
  if (fallback && !isNoPartner(fallback)) return String(fallback).trim();

  // 4. Any amc service in cust.services
  const amcService = (cust?.services || []).find((s) => s.type === 'amc' && s.vendorCategory && !isNoPartner(s.vendorCategory));
  if (amcService?.vendorCategory) return String(amcService.vendorCategory).trim();

  return '—';
};

export const computeAmcDaysLeft = (amc: any, cust?: any): number | null => {
  if (amc?.daysLeft !== undefined && amc?.daysLeft !== null) {
    return amc.daysLeft;
  }
  return calculateRemainingDays(
    getAmcEndDate(amc, cust),
    amc?.startDate || cust?.amcDetails?.startDate
  );
};

export const amcListExportRows = (amcs: AMC[]) => amcs.map((amc, idx) => {
  const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
  const license = getPrimaryLicense(cust);
  const customerName = cust?.name || textValue(cust?.companyInfo?.customerName, '—');
  const partnerName = getAmcPartnerName(cust, amc);
  const amcValue = getAmcValue(amc.amount, cust);
  const contactName = getContactName(cust);
  const contactPhone = textValue(cust?.phone, cust?.amcDetails?.mobile);
  const location = getLocationArea(cust);
  const product = textValue(license?.product, amc.product);
  const expiry = fmt.date(getAmcEndDate(amc, cust));
  const dLeft = computeAmcDaysLeft(amc, cust);
  const daysLeft = dLeft !== undefined && dLeft !== null
    ? (dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : `${dLeft}d left`)
    : '—';

  return {
    'S NO': idx + 1,
    'Customer Name': customerName,
    'Partner Name': partnerName,
    'Contact Person': contactName,
    'Contact Mobile': contactPhone,
    Location: location,
    Product: product,
    Status: amc.status ? amc.status.charAt(0).toUpperCase() + amc.status.slice(1) : '—',
    'Expiry Date': expiry,
    'Days Left': daysLeft,
    [`Value (${getActiveCurrency()})`]: amcValue != null ? Number(amcValue) : 0,
  };
});

// ─── AMC DASHBOARD ───────────────────────────────
export const AMCDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [riskFilter, setRiskFilter] = useState('all');
  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  const { data, isLoading } = useQuery({
    queryKey: ['amc-insights', dateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/amc/insights', { params });
      return r.data.data as {
        dashboard: {
          total: number;
          active: number;
          expiring: number;
          expired: number;
          renewalRate: number;
          riskRows: AMC[];
          recentRows: AMC[];
        };
        history: {
          totalRevenue: number;
          renewalsThisMonth: number;
          renewalRate: number;
        };
      };
    },
  });

  const dash = data?.dashboard;
  const hist = data?.history;

  const kpiCards = [
    { label: 'Total AMC', value: dash?.total ?? '—', icon: <Shield size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All registered contracts' },
    { label: 'Active', value: dash?.active ?? '—', icon: <CheckCircle size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Healthy contracts' },
    { label: 'Expiring Soon', value: dash?.expiring ?? '—', icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Within 30 days' },
    { label: 'Expired', value: dash?.expired ?? '—', icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Renewal required' },
  ];

  return (
    <ModernDashboardLayout
      title="AMC Intelligence"
      subtitle="Comprehensive overview of annual maintenance contracts and service revenue"
      headerActions={
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/amc/list')}>View All Contracts</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/customers/new')}><Plus size={13} /> New Contract</button>
          <button
            className="btn btn-export btn-sm"
            onClick={() => {
              const riskData = (dash?.riskRows || []).map((amc, idx) => {
                const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
                const daysLeft = amc.daysLeft !== undefined && amc.daysLeft !== null
                  ? (amc.daysLeft < 0 ? `${Math.abs(amc.daysLeft)}d overdue` : `${amc.daysLeft}d left`)
                  : '—';
                return {
                  'S NO': idx + 1,
                  'Customer Name': cust?.name || '—',
                  Product: amc.product || '—',
                  'Expiry Date': fmt.date(amc.expiryDate),
                  Status: daysLeft,
                };
              });

              const recentData = (dash?.recentRows || []).map((amc, idx) => {
                const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
                return {
                  'S NO': idx + 1,
                  Customer: cust?.name || '—',
                  Product: amc.product || '—',
                  [`Value (${getActiveCurrency()})`]: amc.amount ?? 0,
                  Status: amc.status ? amc.status.charAt(0).toUpperCase() + amc.status.slice(1) : '—',
                };
              });

              exportExcelWorkbook('amc-intelligence', [
                { name: 'Renewal Radar', rows: riskData },
                { name: 'Recent Contracts', rows: recentData },
              ]);
            }}
          >
            <Download size={13} /> Export
          </button>
        </>
      }
      kpiCards={kpiCards}
      donutData={{ active: dash?.active ?? 0, expiring: dash?.expiring ?? 0, expired: dash?.expired ?? 0, total: dash?.total ?? 0 }}
      recentTableTitle="AMC Renewal Radar"
      tableActions={
        <Select
          value={riskFilter}
          onChange={setRiskFilter}
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
          <th className="sno-col">S NO</th>
          <th>Customer Name</th>
          <th>Product</th>
          <th>Expiry Date</th>
          <th>Status</th>
          <th>Action</th>
        </>
      }
      tableBody={
        (() => {
          const rows = (dash?.riskRows || []).filter(r => {
            if (riskFilter === '7days') return (r.daysLeft ?? 999) <= 7;
            if (riskFilter === '1month') return (r.daysLeft ?? 999) <= 30;
            return true;
          });
          if (rows.length === 0) return <tr><td colSpan={6} style={{ padding: '60px', textAlign: 'center' }}><span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tx-3)' }}>No renewal risks found</span></td></tr>;
          return rows.map((amc, idx) => {
            const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
            return (
              <tr key={amc._id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '20px 32px', fontSize: '12px', color: 'var(--tx-3)', fontWeight: 600, textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                    {cust && <Avatar name={cust.name} src={cust.avatar} size="sm" />}
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>{cust?.name || '—'}</span>
                  </div>
                </td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', textAlign: 'center' }}>{amc.product}</td>
                <td style={{ padding: '20px 32px', fontSize: '13px', fontWeight: 600, color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{fmt.date(amc.expiryDate)}</td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <span className={`badge ${(amc.daysLeft ?? 0) < 0 ? 'badge-red' : (amc.daysLeft ?? 0) < 30 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px', borderRadius: '12px' }}>
                    {amc.daysLeft !== undefined && amc.daysLeft !== null
                      ? amc.daysLeft < 0 ? `${Math.abs(amc.daysLeft)}d overdue` : `${amc.daysLeft}d left`
                      : '—'}
                  </span>
                </td>
                <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                  <button style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-3)'; }} onClick={() => navigate('/amc/list')}>
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            );
          });
        })()
      }
      footerContent={
        <div className="quick-grid-3" style={{ marginTop: 20 }}>
          <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
              <span className="card-title" style={{ fontSize: 13, fontWeight: 700 }}>Revenue Performance</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>Total Portfolio Value</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', marginTop: 6 }}>
                  {isLoading ? '—' : fmt.currency(hist?.totalRevenue || 0)}
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>Monthly Renewals</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)', marginTop: 4 }}>
                    {isLoading ? '—' : hist?.renewalsThisMonth ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em' }}>Retention Rate</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx-1)', marginTop: 4 }}>
                    {isLoading ? '—' : `${dash?.renewalRate ?? 0}%`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', gridColumn: 'span 2' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title" style={{ fontSize: 13, fontWeight: 700 }}>Recently Secured Contracts</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => navigate('/amc/list')}>View All</button>
            </div>
            <div className="tbl-wrap">
              <table className="table-pro table-center">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                    : (dash?.recentRows || []).slice(0, 4).map((amc) => {
                        const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
                        return (
                          <tr key={amc._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600 }}>{cust?.name || '—'}</td>
                            <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--tx-3)' }}>{amc.product}</td>
                            <td style={{ padding: '14px 20px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt.currency(amc.amount)}</td>
                            <td style={{ padding: '14px 20px' }}><Badge status={amc.status} /></td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
    />
  );
};

export const getNextCalendarDay = (dateStr?: string | Date | null): string => {
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

export const calculateCalendarExpiry = (startDateStr: string, period = '1 Year'): string => {
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

export const calculateCalendarStartDateFromExpiry = (expiryDateStr?: string | Date | null, period = '1 Year'): string => {
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

const getNextDay = getNextCalendarDay;

interface AMCTableRowProps {
  amc: AMC;
  idx: number;
  isSelected: boolean;
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string) => void;
  onToggleSelect: () => void;
  onView: (id: string) => void;
}

const AMCTableRow: React.FC<AMCTableRowProps> = ({
  amc,
  idx,
  isSelected,
  selectedTemplateId = '',
  onTemplateChange,
  onToggleSelect,
  onView,
}) => {
  const queryClient = useQueryClient();
  const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
  const license = getPrimaryLicense(cust);
  const customerName = textValue(cust?.name, cust?.companyInfo?.customerName);
  const amcValue = getAmcValue(amc.amount, cust);
  const customerEmail = cust?.email || cust?.amcDetails?.email || cust?.primaryContactInfo?.email;

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
      <td data-label="Select" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <input
          type="checkbox"
          className="crm-checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          title={isSelected ? 'Deselect row' : 'Select row'}
        />
      </td>
      <td data-label="S NO" style={{ padding: '10px 14px', textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}</td>
      <td data-label="Customer No" className="amc-customer-no-cell" style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
        <span className="record-id-link amc-customer-no">{cust?.customerNumber || '—'}</span>
      </td>
      <td data-label="Logo" style={{ padding: '10px 14px', textAlign: 'center' }}>
        {cust && <Avatar name={customerName} src={cust.avatar} size="sm" />}
      </td>
      <td className="company-name-cell" style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }} data-label="Customer Name">
        <span style={{ fontSize: 13, color: 'var(--tx-1)' }}>{customerName}</span>
      </td>
      <td data-label="Partner Name" className="partner-name-cell" style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--tx-2)' }}>
        {getAmcPartnerName(cust, amc)}
      </td>
      <td data-label="Contact" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx-2)' }}>{getContactName(cust)}</div>
        <div style={{ fontSize: 11, color: 'var(--tx-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{textValue(cust?.phone, cust?.amcDetails?.mobile)}</div>
      </td>
      <td data-label="Location" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx-3)', textAlign: 'center' }}>{getLocationArea(cust)}</td>
      <td data-label="Product" style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx-2)', textAlign: 'center' }}>{textValue(license?.product, amc.product)}</td>
      <td data-label="Status" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <Badge status={amc.status} />
      </td>
      <td data-label="Expiry" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{fmt.date(getAmcEndDate(amc, cust))}</div>
        {(() => {
          const dLeft = computeAmcDaysLeft(amc, cust);
          return (
            <div style={{ fontSize: 10, color: (dLeft ?? 0) < 0 ? 'var(--red)' : 'var(--tx-4)', marginTop: 2, fontWeight: 700, textTransform: 'uppercase' }}>
              {dLeft !== undefined && dLeft !== null ? (dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : `${dLeft}d left`) : '—'}
            </div>
          );
        })()}
      </td>
      <td data-label="Value" style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{formatQar(amcValue)}</td>
      <td data-label="Template" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <EmailTemplateSelect
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={onTemplateChange || (() => {})}
        />
      </td>
      <td data-label="Last Notified" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <NotifiedBadge
          date={(amc as any).lastNotifiedAt || (cust as any)?.lastNotifiedAt || (cust?.amcDetails as any)?.lastNotifiedAt}
          channel={(amc as any).lastNotifiedChannel || (cust as any)?.lastNotifiedChannel || (cust?.amcDetails as any)?.lastNotifiedChannel}
          templateName={(amc as any).lastNotifiedTemplate || (cust as any)?.lastNotifiedTemplate || (cust?.amcDetails as any)?.lastNotifiedTemplate}
        />
      </td>
      <td data-label="Actions" style={{ padding: '10px 14px', textAlign: 'center' }}>
        <div className="table-actions" style={{ justifyContent: 'center' }}>
          <EmailTemplateSendButton
            email={customerEmail}
            emailOptions={customerEmails(cust)}
            customerName={customerName}
            selectedTemplateId={selectedTemplateId}
            onSuccess={() => {
              onTemplateChange?.('');
              queryClient.invalidateQueries({ queryKey: ['amcs'] });
            }}
            dynamicData={{
              amcId: amc._id,
              customerId: cust?._id,
              productName: textValue(license?.product, amc.product),
              product: textValue(license?.product, amc.product),
              release: textValue(license?.releaseVersion, cust?.companyInfo?.releaseVersion),
              expiryDate: fmt.date(getAmcEndDate(amc, cust)),
              startDate: fmt.date(getAmcStartDate(amc, cust)),
              endDate: fmt.date(getAmcEndDate(amc, cust)),
              amount: String(amcValue || ''),
              serialNo: license?.licenseSerialNo || '—',
              contactPerson: getContactName(cust),
              phone: textValue(cust?.phone, cust?.amcDetails?.mobile),
              email_id: customerEmail,
            }}
          />
          <CustomerWhatsAppAction
            customer={cust}
            contextLabel="AMC"
            defaultMessage={cust ? amcWhatsappMessage(amc, cust) : undefined}
            selectedTemplateId={selectedTemplateId}
            dynamicData={{
              amcId: amc._id,
              customerId: cust?._id,
              productName: textValue(license?.product, amc.product),
              product: textValue(license?.product, amc.product),
              release: textValue(license?.releaseVersion, cust?.companyInfo?.releaseVersion),
              expiryDate: fmt.date(getAmcEndDate(amc, cust)),
              startDate: fmt.date(getAmcStartDate(amc, cust)),
              endDate: fmt.date(getAmcEndDate(amc, cust)),
              amount: String(amcValue || ''),
              serialNo: license?.licenseSerialNo || '—',
              contactPerson: getContactName(cust),
              phone: textValue(cust?.phone, cust?.amcDetails?.mobile),
              email_id: customerEmail,
            }}
            onSuccess={() => {
              onTemplateChange?.('');
              queryClient.invalidateQueries({ queryKey: ['amcs'] });
            }}
          />
          <button className="btn-action btn-action-blue" onClick={() => onView(amc._id)} title="View"><Eye size={13} /></button>
        </div>
      </td>
    </tr>
  );
};

// ─── AMC LIST PAGE ───────────────────────────────
export const AMCListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const urlSearch = searchParams.get('search') || searchParams.get('customer') || searchParams.get('product') || '';
  const urlStatus = searchParams.get('status') || 'all';
  const viewId = searchParams.get('viewId') || searchParams.get('id') || '';

  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [search, setSearch] = useState(urlSearch);
  const [viewAmc, setViewAmc] = useState<AMC | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [editingRenewalIdx, setEditingRenewalIdx] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRenewalDelete, setConfirmRenewalDelete] = useState<{ id: string, index: number } | null>(null);
  const [renewalForm, setRenewalForm] = useState<Partial<AMCRenewal>>({
    period: '1 Year',
    paymentMethod: 'Bank Transfer',
    renewedOn: new Date().toISOString().split('T')[0],
  });

  const handleView = async (id: string, silent = false) => {
    if (!silent) setViewAmc(null); // Only clear state for new opens to avoid jarring closure
    try {
      const res = await api.get(`/amc/${id}`);
      setViewAmc(res.data.data);
    } catch (err) {
      toast.error('Failed to load contract details');
    }
  };

  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
    if (urlStatus && urlStatus !== 'all') setStatusFilter(urlStatus);
    if (viewId) {
      handleView(viewId);
    }
  }, [urlSearch, urlStatus, viewId]);

  const updateRenewalMut = useMutation({
    mutationFn: async ({ id, renewalHistory }: { id: string; renewalHistory: AMCRenewal[] }) => {
      await api.patch(`/amc/${id}`, { renewalHistory });
    },
    meta: { invalidateQueryKeys: [['amcs']] },
    onSuccess: () => {
      toast.success('Renewal record updated');
      setEditingRenewalIdx(null);
      if (viewAmc) handleView(viewAmc._id, true);
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['amc-insights'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update record'),
  });

  const deleteRenewalMut = useMutation({
    mutationFn: async ({ id, index }: { id: string; index: number }) => {
      if (!viewAmc) throw new Error('No active contract selected');
      const updated = [...(viewAmc.renewalHistory || [])];
      updated.splice(index, 1);
      await api.patch(`/amc/${id}`, { renewalHistory: updated });
      return updated;
    },
    meta: { invalidateQueryKeys: [['amcs'], ['amc-insights'], ['amc-stats']] },
    onSuccess: (updated, variables) => {
      toast.success('Renewal entry deleted');
      if (viewAmc && viewAmc._id === variables.id && updated) {
        handleView(variables.id, true);
      }
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['amc-insights'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete renewal entry'),
  });

  const renewMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/amc/${id}/renew`, payload);
      return res.data.data as AMC;
    },
    meta: { invalidateQueryKeys: [['amcs'], ['amc-insights'], ['amc-stats']] },
    onSuccess: (updatedAmc) => {
      toast.success('AMC renewal processed');
      // If modal is open for this AMC, refresh it silently to ensure history shows up
      if (viewAmc && viewAmc._id === updatedAmc._id) {
        handleView(updatedAmc._id, true);
      }
      setIsRenewing(false);
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['amc-insights'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to renew AMC'),
  });
  const [editAmc, setEditAmc] = useState<AMC | null>(null);
  const [editForm, setEditForm] = useState({ product: '', licenceType: '', startDate: '', expiryDate: '', amount: '', notes: '', status: 'active' as AMC['status'] });
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [rowTemplates, setRowTemplates] = useState<Record<string, string>>({});
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);

  const handleBulkTemplateSelect = (templateId: string) => {
    setBulkTemplateId(templateId);
    setRowTemplates((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        next[id] = templateId;
      });
      return next;
    });
  };

  const handleRowTemplateChange = (id: string, templateId: string) => {
    setRowTemplates((prev) => ({ ...prev, [id]: templateId }));
  };

  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, pageSize, hasActiveDateFilter, startDate, endDate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['amcs', statusFilter, search, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/amc', { params });
      return r.data as unknown as { data: AMC[]; pages: number; total: number; };
    },
  });

  const { data: insights } = useQuery({
    queryKey: ['amc-insights-kpis', dateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/amc/insights', { params });
      return r.data.data.dashboard as { total: number; active: number; expiring: number; expired: number };
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await api.patch(`/amc/${id}`, payload);
      return res.data.data as AMC;
    },
    onSuccess: (updatedAmc) => {
      toast.success('AMC updated');
      setEditAmc(null);
      if (viewAmc && viewAmc._id === updatedAmc._id) {
        handleView(updatedAmc._id, true);
      }
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['amc-insights'] });
    },
    onError: () => toast.error('Failed to update AMC'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/amc/${id}`);
    },
    onSuccess: () => {
      toast.success('AMC deleted');
      setViewAmc(null);
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['amc-insights'] });
    },
    onError: () => toast.error('Failed to delete AMC'),
  });

  const handleDelete = (id: string) => {
    setConfirmDelete(id);
  };

  const handleRenewalFieldChange = (field: keyof AMCRenewal, value: any) => {
    setRenewalForm(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate expiry if start date or period changes
      if (field === 'startDate' || field === 'period') {
        const start = updated.startDate || '';
        const period = updated.period || '1 Year';
        updated.expiryDate = calculateCalendarExpiry(start, period);
      }
      return updated;
    });
  };

  const calculateExpiry = calculateCalendarExpiry;

  const amcs = data?.data || [];
  const totalAmcs = data?.total || 0;

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const isCurrentlySelected = prev.includes(id);
      if (isCurrentlySelected) {
        setRowTemplates(r => {
          const nr = { ...r };
          delete nr[id];
          return nr;
        });
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleSelectAllPage = () => {
    const pageIds = amcs.map(a => a._id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
      setRowTemplates(prev => {
        const next = { ...prev };
        pageIds.forEach(id => {
          delete next[id];
        });
        return next;
      });
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const selectedAmcRows = amcs.filter(a => selectedIds.includes(a._id));

  const bulkEmailTargets: BulkEmailTarget[] = selectedAmcRows.map(amc => {
    const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
    const license = getPrimaryLicense(cust);
    const customerName = textValue(cust?.name, cust?.companyInfo?.customerName);
    const customerEmail = cust?.email || cust?.amcDetails?.email || cust?.primaryContactInfo?.email || '';
    const amcValue = getAmcValue(amc.amount, cust);
    const templateId = rowTemplates[amc._id] || bulkTemplateId;
    return {
      id: amc._id,
      customerName,
      email: customerEmail,
      cc: cust?.secondaryContactInfo?.email,
      templateId,
      dynamicData: {
        customerName,
        companyName: customerName,
        product: textValue(license?.product, amc.product),
        productName: textValue(license?.product, amc.product),
        release: textValue(license?.releaseVersion, cust?.companyInfo?.releaseVersion),
        expiryDate: fmt.date(getAmcEndDate(amc, cust)),
        startDate: fmt.date(getAmcStartDate(amc, cust)),
        endDate: fmt.date(getAmcEndDate(amc, cust)),
        amount: amcValue != null ? String(amcValue) : '',
        contactPerson: getContactName(cust),
        phone: textValue(cust?.phone, cust?.amcDetails?.mobile),
        serialNo: license?.licenseSerialNo || '—',
        email_id: customerEmail,
      },
    };
  });

  const bulkWhatsAppTargets: BulkWhatsAppTarget[] = selectedAmcRows.map(amc => {
    const cust = typeof amc.customer === 'object' ? amc.customer as Customer : null;
    const license = getPrimaryLicense(cust);
    const customerName = textValue(cust?.name, cust?.companyInfo?.customerName);
    const phone = textValue(cust?.phone, cust?.amcDetails?.mobile, cust?.primaryContactInfo?.mobile);
    const amcValue = getAmcValue(amc.amount, cust);
    const templateId = rowTemplates[amc._id] || bulkTemplateId;
    return {
      id: amc._id,
      customerName,
      phone,
      templateId,
      customMessage: cust ? amcWhatsappMessage(amc, cust) : undefined,
      dynamicData: {
        customerName,
        product: textValue(license?.product, amc.product),
        expiryDate: fmt.date(getAmcEndDate(amc, cust)),
        amount: amcValue != null ? String(amcValue) : '',
      },
    };
  });

  const exportAmcs = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (statusFilter !== 'all') params.status = statusFilter;
    if (search.trim()) params.search = search.trim();
    if (hasActiveDateFilter) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    const res = await api.get('/amc', { params });
    const rows = (res.data?.data || []) as AMC[];
    exportExcelWorkbook('amc-contracts', [
      { name: 'AMC Contracts', rows: amcListExportRows(rows) },
    ]);
  };

  const exportSelectedAmcs = () => {
    if (selectedAmcRows.length === 0) {
      toast.error('No contracts selected to export');
      return;
    }
    exportExcelWorkbook('selected-amc-contracts', [
      { name: 'Selected Contracts', rows: amcListExportRows(selectedAmcRows) },
    ]);
    toast.success(`Exported ${selectedAmcRows.length} selected contracts`);
  };

  const openEdit = (amc: AMC) => {
    setEditAmc(amc);
    setEditForm({
      product: amc.product,
      licenceType: amc.licenceType,
      startDate: amc.startDate ? String(amc.startDate).split('T')[0] : '',
      expiryDate: amc.expiryDate ? String(amc.expiryDate).split('T')[0] : '',
      amount: String(amc.amount),
      notes: amc.notes || '',
      status: amc.status,
    });
  };

  const kpiCards = [
    { label: 'Total AMC', value: insights?.total ?? '—', icon: <Shield size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All active contracts' },
    { label: 'Active', value: insights?.active ?? '—', icon: <CheckCircle size={18} />, color: 'var(--green)', bg: 'var(--green-bg)', bottom: 'Healthy status' },
    { label: 'Expiring', value: insights?.expiring ?? '—', icon: <Clock size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Needs attention' },
    { label: 'Expired', value: insights?.expired ?? '—', icon: <AlertTriangle size={18} />, color: 'var(--red)', bg: 'var(--red-bg)', bottom: 'Immediate action' },
  ];

  const isAllPageSelected = amcs.length > 0 && amcs.every(a => selectedIds.includes(a._id));

  return (
    <div>
      <ModernDashboardLayout
        title="AMC Master Registry"
        subtitle={`Managing ${totalAmcs} maintenance contracts across the enterprise`}
        kpiCards={kpiCards}
        tableSearch={
          <>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search contracts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </>
        }
        tableActions={
          <>
            <Select
              className="filter-select page-size-select"
              value={pageSize}
              onChange={(v) => { setPageSize(v); setPage(1); }}
              options={PAGE_SIZE_OPTIONS}
            />
            <Select
              className="filter-select"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'expiring', label: 'Expiring Soon' },
                { value: 'expired', label: 'Expired' },
              ]}
            />
            <button
              className="btn btn-export btn-sm"
              onClick={exportAmcs}
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
            <th>Customer Name</th>
            <th>Partner Name</th>
            <th>Contact</th>
            <th>Location</th>
            <th>Product</th>
            <th>Status</th>
            <th>Expiry</th>
            <th>Value</th>
            <th>Template</th>
            <th>Last Notified</th>
            <th>Actions</th>
          </>
        }
        tableBody={
          amcs.length === 0 ? (
            <tr>
              <td colSpan={14} style={{ padding: '60px', textAlign: 'center' }}>
                <Shield size={32} style={{ color: 'var(--tx-5)', marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-2)' }}>No AMC contracts found</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 4 }}>Try adjusting your filters or search query</div>
              </td>
            </tr>
          ) : (
            amcs.map((amc, idx) => {
              const isSelected = selectedIds.includes(amc._id);
              const templateId = rowTemplates[amc._id] || (isSelected ? bulkTemplateId : '') || '';
              return (
                <AMCTableRow
                  key={amc._id}
                  amc={amc}
                  idx={(page - 1) * Number(pageSize) + idx}
                  isSelected={isSelected}
                  selectedTemplateId={templateId}
                  onTemplateChange={(tId) => handleRowTemplateChange(amc._id, tId)}
                  onToggleSelect={() => toggleSelectRow(amc._id)}
                  onView={handleView}
                />
              );
            })
          )
        }
        tableFooter={<Pagination currentPage={page} totalPages={data?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />}
      />

      <BulkActionToolbar
        selectedCount={selectedIds.length}
        totalCount={amcs.length}
        isAllPageSelected={isAllPageSelected}
        onSelectAllPage={toggleSelectAllPage}
        selectedTemplateId={bulkTemplateId}
        onSelectTemplate={handleBulkTemplateSelect}
        onClearSelection={() => {
          setSelectedIds([]);
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
          setSelectedIds([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['amcs'] });
        }}
      />

      <BulkWhatsAppModal
        open={isBulkWhatsAppOpen}
        onClose={() => setIsBulkWhatsAppOpen(false)}
        targets={bulkWhatsAppTargets}
        onComplete={() => {
          setSelectedIds([]);
          setBulkTemplateId('');
          setRowTemplates({});
          queryClient.invalidateQueries({ queryKey: ['amcs'] });
        }}
      />

      {/* View Modal */}
      <Modal
        open={!!viewAmc}
        onClose={() => setViewAmc(null)}
        title="AMC Contract Details"
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
            <CustomerWhatsAppAction
              customer={typeof viewAmc?.customer === 'object' ? viewAmc.customer as Customer : null}
              contextLabel="AMC"
              defaultMessage={viewAmc && typeof viewAmc.customer === 'object' ? amcWhatsappMessage(viewAmc, viewAmc.customer as Customer) : undefined}
              iconOnly={false}
              className="btn btn-secondary btn-sm"
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                let latestExpiry: any = viewAmc?.expiryDate;
                if (viewAmc?.renewalHistory && viewAmc.renewalHistory.length > 0) {
                  for (const rh of viewAmc.renewalHistory) {
                    if (rh.expiryDate && (!latestExpiry || new Date(rh.expiryDate) > new Date(latestExpiry))) {
                      latestExpiry = rh.expiryDate;
                    }
                  }
                }
                const nextStart = latestExpiry ? getNextCalendarDay(latestExpiry) : '';
                const period = '1 Year';
                setRenewalForm({
                  period,
                  paymentMethod: 'Bank Transfer',
                  renewedOn: new Date().toISOString().split('T')[0],
                  startDate: nextStart,
                  expiryDate: nextStart ? calculateCalendarExpiry(nextStart, period) : '',
                  amount: viewAmc?.amount || 0,
                });
                setIsRenewing(true);
              }}
            >
              <RefreshCw size={14} /> Process Renewal
            </button>
            <button className="btn btn-cancel" onClick={() => setViewAmc(null)}>Close</button>
          </div>
        }
      >
        {viewAmc && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{typeof viewAmc.customer === 'object' ? (viewAmc.customer as Customer).name : '—'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 3 }}>{viewAmc.product} · {viewAmc.licenceType}</div>
              </div>
              <Badge status={viewAmc.status} />
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--tx-4)', marginBottom: 10 }}>Renewal & Billing History</div>
            <div className="tbl-wrap amc-renewal-table-wrap">
              <table className="table-pro table-center amc-renewal-table">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={{ width: 70 }}>S NO</th>
                    <th style={{ width: 110 }}>Period</th>
                    <th style={{ width: 110 }}>Renewed</th>
                    <th style={{ width: 120 }}>Start Date</th>
                    <th style={{ width: 120 }}>Expiry Date</th>
                    <th style={{ width: 120 }}>Amount</th>
                    <th style={{ width: 130 }}>Payment / Ref</th>
                    <th style={{ width: 96 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const history = viewAmc.renewalHistory || [];
                    const initialEntry = history.find(rh => rh.period === 'Initial Contract');
                    const renewals = history.filter(rh => rh.period !== 'Initial Contract');
                    const hasRenewals = renewals.length > 0;

                    // Resolve initial / main contract dates
                    const cust = typeof viewAmc.customer === 'object' ? (viewAmc.customer as any) : null;
                    const originalService = cust?.services?.find((s: any) => s.type === 'amc' && s.startDate && s.endDate);
                    const originalSerial = cust?.serialNoInfo?.find((s: any) => s.startDate && s.endDate);

                    const initialEnd = initialEntry?.expiryDate 
                      || (viewAmc as any).initialExpiryDate 
                      || (hasRenewals ? (originalService?.endDate || originalSerial?.endDate) : null)
                      || viewAmc.expiryDate;

                    let initialStart = initialEntry?.startDate 
                      || (viewAmc as any).initialStartDate 
                      || (hasRenewals ? (originalService?.startDate || originalSerial?.startDate) : null)
                      || (hasRenewals ? undefined : viewAmc.startDate);

                    if (!initialStart || (initialEnd && new Date(initialStart) > new Date(initialEnd))) {
                      initialStart = initialEnd ? calculateCalendarStartDateFromExpiry(initialEnd, initialEntry?.period || '1 Year') : viewAmc.startDate;
                    }

                    const initialAmt = initialEntry?.amount 
                      ?? (viewAmc as any).initialAmount 
                      ?? (hasRenewals ? (originalService?.amcValue ?? 0) : viewAmc.amount);

                    const renewedOnDisplay = initialEntry?.renewedOn && (!initialEnd || new Date(initialEntry.renewedOn) <= new Date(initialEnd))
                      ? fmt.date(initialEntry.renewedOn)
                      : initialStart ? fmt.date(initialStart as any) : '—';

                    const filteredAndNumbered = renewals
                      .map((rh) => ({ ...rh, originalIdx: history.indexOf(rh) }))
                      .map((rh, idx) => ({ ...rh, sNo: idx + 2 }));

                    return (
                      <>
                        {/* Current / Initial Active Contract Row */}
                        <tr style={{ background: 'rgba(var(--green-rgb), 0.03)' }}>
                          <td style={{ fontWeight: 800, color: 'var(--tx-4)' }}>1</td>
                          <td style={{ fontWeight: 700, color: hasRenewals ? 'var(--tx-2)' : 'var(--green)' }}>
                            {hasRenewals ? 'Initial' : 'Current'}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                            {renewedOnDisplay}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11.5 }}>{fmt.date(initialStart)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11.5 }}>{fmt.date(initialEnd)}</td>
                          <td style={{ fontWeight: 800, color: hasRenewals ? 'var(--tx-1)' : 'var(--green)', fontSize: 11.5 }}>{fmt.currency(initialAmt)}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600 }}>Main Contract</span>
                              <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</span>
                            </div>
                          </td>
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'center' }}>
                              <button className="btn-action btn-action-amber" onClick={() => openEdit(viewAmc)} title="Edit Main"><Edit size={13} /></button>
                            </div>
                          </td>
                        </tr>

                        {/* Renewal History Rows */}
                        {filteredAndNumbered.reverse().map((rh) => {
                          const actualIdx = rh.originalIdx;
                          return (
                            <tr key={actualIdx}>
                              <td style={{ fontWeight: 600, color: 'var(--tx-4)' }}>{rh.sNo}</td>
                              <td style={{ fontWeight: 700 }}>{rh.period}</td>
                              <td style={{ fontSize: 11, color: 'var(--tx-4)' }}>{fmt.date(rh.renewedOn)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{fmt.date(rh.startDate || rh.renewedOn)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{fmt.date(rh.expiryDate)}</td>
                              <td style={{ fontWeight: 700, fontSize: 11.5 }}>{fmt.currency(rh.amount)}</td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                                  <span style={{ fontSize: 11 }}>{rh.paymentMethod}</span>
                                  <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>{rh.invoiceNo || '—'}</span>
                                </div>
                              </td>
                              <td>
                                <div className="table-actions" style={{ justifyContent: 'center' }}>
                                  <button
                                    className="btn-action btn-action-amber"
                                    onClick={() => {
                                      setRenewalForm({
                                        ...rh,
                                        renewedOn: rh.renewedOn ? String(rh.renewedOn).split('T')[0] : '',
                                        startDate: rh.startDate ? String(rh.startDate).split('T')[0] : (rh.renewedOn ? String(rh.renewedOn).split('T')[0] : ''),
                                        expiryDate: rh.expiryDate ? String(rh.expiryDate).split('T')[0] : '',
                                      });
                                      setEditingRenewalIdx(actualIdx);
                                    }}
                                    title="Edit Renewal"
                                  >
                                    <Edit size={13} />
                                  </button>
                                  <button
                                    className="btn-action btn-action-red"
                                    onClick={() => {
                                      setConfirmRenewalDelete({ id: viewAmc._id, index: actualIdx });
                                    }}
                                    title="Delete Renewal"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })()}
                  {(!viewAmc.renewalHistory || viewAmc.renewalHistory.filter(rh => rh.period !== 'Initial Contract').length === 0) && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--tx-4)', fontSize: 12 }}>No previous renewal history found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>


          </>
        )}
      </Modal>

      {/* Process/Edit Renewal Modal */}
      <Modal
        open={isRenewing || editingRenewalIdx !== null}
        onClose={() => {
          setIsRenewing(false);
          setEditingRenewalIdx(null);
        }}
        title={editingRenewalIdx !== null ? 'Edit Renewal Record' : 'Process AMC Renewal'}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn btn-cancel" onClick={() => { setIsRenewing(false); setEditingRenewalIdx(null); }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!viewAmc) return;

                // Validation: Start date must be after or on the day after current expiry
                if (renewalForm.startDate && viewAmc.expiryDate && editingRenewalIdx === null) {
                  const start = new Date(renewalForm.startDate);
                  const currentExpiry = new Date(viewAmc.expiryDate);
                  if (start < currentExpiry) {
                    toast.error(`Start date must be on or after ${fmt.date(currentExpiry)}`);
                    return;
                  }
                }

                // General validation: Expiry date must be after start date
                if (renewalForm.startDate && renewalForm.expiryDate) {
                  const start = new Date(renewalForm.startDate);
                  const expiry = new Date(renewalForm.expiryDate);
                  if (expiry <= start) {
                    toast.error('Expiry date must be after start date');
                    return;
                  }
                }

                if (editingRenewalIdx !== null) {
                  const updated = [...(viewAmc.renewalHistory || [])];
                  updated[editingRenewalIdx] = renewalForm as AMCRenewal;
                  updateRenewalMut.mutate({ id: viewAmc._id, renewalHistory: updated });
                } else {
                  renewMut.mutate({
                    id: viewAmc._id,
                    payload: {
                      newStartDate: renewalForm.startDate,
                      newExpiryDate: renewalForm.expiryDate,
                      amount: Number(renewalForm.amount),
                      renewalData: {
                        period: renewalForm.period,
                        amount: Number(renewalForm.amount),
                        paymentMethod: renewalForm.paymentMethod,
                        invoiceNo: renewalForm.invoiceNo,
                        notes: renewalForm.notes,
                        startDate: renewalForm.startDate,
                        expiryDate: renewalForm.expiryDate,
                        renewedOn: renewalForm.renewedOn,
                      }
                    }
                  });
                }
              }}
            >
              {renewMut.isPending || updateRenewalMut.isPending ? <Spinner size={14} /> : null}
              {editingRenewalIdx !== null ? 'Update Record' : 'Process Renewal'}
            </button>
          </div>
        }
      >
        <div className="form-grid-2">
          <InputField label="Start Date" value={renewalForm.startDate || ''} onChange={(v) => handleRenewalFieldChange('startDate', v)} type="date" />
          <InputField label="Expiry Date" value={renewalForm.expiryDate || ''} onChange={(v) => handleRenewalFieldChange('expiryDate', v)} type="date" />
          <InputField label={`Amount (${getActiveCurrency()})`} value={renewalForm.amount || ''} onChange={(v) => handleRenewalFieldChange('amount', Number(v))} type="number" />
          <InputField label="Renewed On" value={renewalForm.renewedOn || ''} onChange={(v) => handleRenewalFieldChange('renewedOn', v)} type="date" />
          <SelectField
            label="Period"
            value={renewalForm.period || '1 Year'}
            onChange={(v) => handleRenewalFieldChange('period', v)}
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
            onChange={(v) => handleRenewalFieldChange('paymentMethod', v)}
            options={[
              { value: 'Bank Transfer', label: 'Bank Transfer' },
              { value: 'Cash', label: 'Cash' },
              { value: 'Cheque', label: 'Cheque' },
              { value: 'QPAY', label: 'QPAY' },
            ]}
          />
          <InputField label="Invoice/Ref No" value={renewalForm.invoiceNo || ''} onChange={(v) => handleRenewalFieldChange('invoiceNo', v)} />
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Notes</label>
          <textarea
            className="form-control"
            rows={3}
            value={renewalForm.notes || ''}
            onChange={(e) => setRenewalForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Additional renewal notes..."
          />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editAmc}
        onClose={() => setEditAmc(null)}
        title="Edit AMC Contract"
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button className="btn btn-cancel" onClick={() => setEditAmc(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={updateMut.isPending}
              onClick={() => {
                if (!editAmc) return;
                updateMut.mutate({ id: editAmc._id, payload: { ...editForm, amount: Number(editForm.amount) } });
              }}
            >
              {updateMut.isPending ? <Spinner size={14} /> : null}
              {updateMut.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      >
        {editAmc && (
          <div className="form-grid-2">
            <InputField label="Product" value={editForm.product} onChange={(v) => setEditForm((p) => ({ ...p, product: v }))} />
            <InputField label="Licence Type" value={editForm.licenceType} onChange={(v) => setEditForm((p) => ({ ...p, licenceType: v }))} />
            <InputField label="Start Date" value={editForm.startDate} onChange={(v) => setEditForm((p) => ({ ...p, startDate: v }))} type="date" />
            <InputField label="Expiry Date" value={editForm.expiryDate} onChange={(v) => setEditForm((p) => ({ ...p, expiryDate: v }))} type="date" />
            <InputField label={`Amount (${getActiveCurrency()})`} value={editForm.amount} onChange={(v) => setEditForm((p) => ({ ...p, amount: v }))} type="number" />
            <SelectField
              label="Status"
              value={editForm.status}
              onChange={(v) => setEditForm((p) => ({ ...p, status: v as AMC['status'] }))}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'expiring', label: 'Expiring' },
                { value: 'expired', label: 'Expired' },
              ]}
            />
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={3} value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete AMC Contract"
        message="Are you sure you want to delete this AMC contract? This action cannot be undone."
        onConfirm={() => {
          if (confirmDelete) deleteMut.mutate(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
        loading={deleteMut.isPending}
      />

      <ConfirmDialog
        open={!!confirmRenewalDelete}
        title="Delete Renewal Record"
        message="Are you sure you want to delete this renewal entry from the history? This action cannot be undone."
        onConfirm={() => {
          if (confirmRenewalDelete) deleteRenewalMut.mutate(confirmRenewalDelete);
          setConfirmRenewalDelete(null);
        }}
        onCancel={() => setConfirmRenewalDelete(null)}
        loading={deleteRenewalMut.isPending}
      />
    </div>
  );
};
