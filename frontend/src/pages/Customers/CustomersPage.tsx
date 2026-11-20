import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, Search, Download, Edit, Trash2, Users, Cloud, ChevronDown, Building2, Phone, Package, CalendarDays, MessageCircle, Send, Eye, Layers, ShieldCheck } from 'lucide-react';
import api from '../../utils/api';
import { Customer, Ticket, AMC } from '../../types';
import { fmt, PAGE_SIZE_OPTIONS, computeServiceStatus, deduplicateAmcEntries, mergeModuleServicesBySerial } from '../../utils/helpers';
import { calculateStartDateFromExpiry } from './CustomerManagementPages';
import { exportExcelWorkbook } from '../../utils/excelExport';
import { customerWelcometechExportRows, WELCOMETECH_CUSTOMER_EXPORT_COLUMNS } from '../../utils/customerExport';
import { Badge, Avatar, SkeletonRow, EmptyState, ConfirmDialog, Modal, DetailItem, Select, Pagination } from '../../components/ui';
import toast from 'react-hot-toast';
import { useDateFilter } from '../../context/DateFilterContext';

type CustomerService = NonNullable<Customer['services']>[number];
type CustomerDetailRow = Partial<CustomerService> & {
  key: string;
  label: string;
};

type CustomerModuleRegistryRow = Partial<CustomerService> & {
  key: string;
};

const cleanText = (value: unknown): string => String(value || '').trim();

const moneyOrDash = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const balanceOf = (service: Partial<CustomerService>): number | null => {
  const current = Number(service.currentPrice);
  if (!Number.isFinite(current)) return null;
  const advance1 = Number(service.advance1) || 0;
  const advance2 = Number(service.advance2) || 0;
  return current - advance1 - advance2;
};

const serialList = (rows?: Array<{ serialNo?: string }>): string =>
  (rows || []).map((row) => cleanText(row.serialNo)).filter(Boolean).join(', ') || '—';

const productListOf = (customer: Customer): string[] =>
  Array.from(new Set([
    ...(customer.products || []),
    ...(customer.services || []).map((service) => service.product),
    ...(customer.serialNoInfo || []).map((row) => row.product),
  ].map((product) => cleanText(product)).filter(Boolean)));

const licenseListOf = (customer: Customer): string[] => {
  const amcServices = (customer.services || []).filter((s) => s.type === 'amc');
  if (amcServices.length > 0) {
    return amcServices.map((s) => {
      const prod = cleanText(s.product) || 'Product License';
      const serial = cleanText(s.licenseSerialNo);
      return serial ? `${prod} (${serial})` : prod;
    });
  }

  const serialList = customer.serialNoInfo || [];
  if (serialList.length > 0) {
    const items: string[] = [];
    for (const s of serialList) {
      const prod = cleanText(s.product) || 'Product License';
      if (Array.isArray(s.licenses) && s.licenses.length > 0) {
        for (const lic of s.licenses) {
          const serial = cleanText(lic.licenceSerialNo || s.licenseSerialNo);
          items.push(serial ? `${prod} (${serial})` : prod);
        }
      } else {
        const serial = cleanText(s.licenseSerialNo);
        items.push(serial ? `${prod} (${serial})` : prod);
      }
    }
    if (items.length > 0) return items;
  }

  if (customer.products && customer.products.length > 0) {
    return customer.products.map((p) => {
      const prod = cleanText(p);
      const serial = cleanText(customer.licenseSerialNo);
      return serial ? `${prod} (${serial})` : prod;
    }).filter(Boolean);
  }

  if (customer.licenseSerialNo) {
    return [`License (${cleanText(customer.licenseSerialNo)})`];
  }

  return [];
};

const primaryContactOf = (customer: Customer) => ({
  name: customer.keyContacts?.[0]?.contactName || customer.contact || customer.primaryContactInfo?.contactName1 || '—',
  phone: customer.keyContacts?.[0]?.mobile || customer.phone || customer.primaryContactInfo?.mobile || '—',
});

const customerWhatsappNumberOf = (customer: Customer): string =>
  cleanText(customer.primaryContactInfo?.whatsapp) ||
  cleanText(customer.keyContacts?.find((contact) => cleanText(contact.whatsapp))?.whatsapp) ||
  cleanText(customer.secondaryContactInfo?.whatsapp) ||
  cleanText(customer.primaryContactInfo?.mobile) ||
  cleanText(customer.keyContacts?.find((contact) => cleanText(contact.mobile))?.mobile) ||
  cleanText(customer.secondaryContactInfo?.mobile) ||
  cleanText(customer.phone);

const buildCustomerWhatsappMessage = (customer: Customer): string => {
  const contactName = cleanText(customer.primaryContactInfo?.contactName1) ||
    cleanText(customer.keyContacts?.[0]?.contactName) ||
    cleanText(customer.contact) ||
    'Customer';
  const products = productListOf(customer);
  const tssExpiry = getTssExpiryDate(customer);
  return [
    `Hello ${contactName},`,
    '',
    'Sharing your WelcomeTech customer details:',
    `Customer: ${customer.name || customer.companyInfo?.customerName || '—'}`,
    `Products: ${products.length ? products.join(', ') : '—'}`,
    `AMC Status: ${customer.amcStatus || '—'}`,
    `TSS Expiry: ${tssExpiry ? fmt.date(tssExpiry) : '—'}`,
    '',
    'Thank you.',
  ].join('\n');
};


const getTssExpiryDate = (customer: Customer): string | null => {
  const dates: string[] = [];
  (customer.services || []).forEach((service) => {
    if (service.type === 'tss' && service.endDate) dates.push(String(service.endDate));
    if (service.type === 'amc' && service.tssExpiryDate) dates.push(String(service.tssExpiryDate));
    if (service.tssExpiryDate) dates.push(String(service.tssExpiryDate));
  });
  (customer.serialNoInfo || []).forEach((row) => {
    if (row.tssExpiryDate) dates.push(String(row.tssExpiryDate));
    if (row.endDate) dates.push(String(row.endDate));
  });
  if (customer.tssDetails?.endDate) dates.push(String(customer.tssDetails.endDate));

  const valid = dates
    .map((d) => ({ raw: d, time: new Date(d).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);

  return valid[0]?.raw || null;
};

const consolidateModuleRows = (rows: CustomerModuleRegistryRow[]): CustomerModuleRegistryRow[] => {
  const map = new Map<string, CustomerModuleRegistryRow>();
  const nonKeyed: CustomerModuleRegistryRow[] = [];

  for (const row of rows) {
    const rawSerial = row.licenseSerialNo || row.domainLinkSubId;
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
          amount: secondary.currentPrice ?? secondary.amcValue,
          status: 'expired',
          notes: secondary.details || secondary.notesRemarks,
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

    const merged: CustomerModuleRegistryRow = {
      ...primary,
      startDate: primary.startDate || secondary.startDate,
      product:
        primary.product && !primary.product.toLowerCase().includes('premium')
          ? primary.product
          : secondary.product || primary.product,
      details: primary.details || secondary.details,
      status: computeServiceStatus(primary.endDate, primary.status),
      renewalHistory: combinedHistory,
    };

    map.set(serialKey, merged);
  }

  return [...map.values(), ...nonKeyed];
};

const isServiceEnabled = (service?: CustomerService): boolean =>
  !!service && service.status !== 'none' && service.status !== 'expired';

const hasModuleDetail = (details?: Record<string, unknown>): boolean =>
  !!details && Object.values(details).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== undefined && value !== null && String(value).trim() !== '';
  });

const moduleDetailToService = (
  details: Partial<CustomerService> | undefined,
  type: CustomerService['type'],
  customer: Customer
): Partial<CustomerService> | null => {
  if (!hasModuleDetail(details as Record<string, unknown> | undefined)) return null;
  return {
    ...details,
    type,
    status: details?.status || (type === 'cloud' ? 'active' : customer.amcStatus === 'none' ? 'active' : customer.amcStatus),
    companyName: details?.companyName || customer.name,
    address: details?.address || customer.address,
  };
};

const moduleRegistryConfig = {
  tdl: {
    title: 'TDL Registry',
    empty: 'No TDL Add-ons provisioned.',
    product: 'TDL Add-on',
    reference: 'License Serial',
  },
  tss: {
    title: 'TSS Registry',
    empty: 'No TSS Premium services provisioned.',
    product: 'TSS Premium',
    reference: 'License Serial',
  },
  cloud: {
    title: 'Cloud Registry',
    empty: 'No Cloud Hub services provisioned.',
    product: 'Cloud Hub',
    reference: 'Domain / Sub ID',
  },
} as const;

const moduleRegistryRows = (
  customer: Customer,
  moduleType: 'tdl' | 'tss' | 'cloud'
): CustomerModuleRegistryRow[] => {
  if (moduleType === 'tdl') {
    const directTdl: CustomerModuleRegistryRow[] = (customer.services || [])
      .filter((s) => s.type === 'tdl')
      .map((s, idx) => ({
        ...s,
        key: s._id || `tdl-service-${idx}`,
        status: computeServiceStatus(s.endDate, s.status),
      }));
    const amcTdl: CustomerModuleRegistryRow[] = (customer.services || [])
      .filter((s) => s.type === 'amc' && (s.isTdl || (s as any).tdlEnabled))
      .map((s, idx) => ({
        ...s,
        key: `tdl-amc-${s._id || idx}`,
        type: 'tdl' as const,
        details: s.details || 'Product TDL Add-on',
        status: computeServiceStatus(s.endDate, s.status),
      }));
    const mergedTdl = mergeModuleServicesBySerial(directTdl, amcTdl);
    const serialTdl: CustomerModuleRegistryRow[] = mergedTdl.length
      ? []
      : (customer.serialNoInfo || [])
        .filter((s) => s.isTdl || (s as any).tdlEnabled)
        .map((s, idx) => ({
          key: `tdl-serial-${idx}`,
          type: 'tdl' as const,
          product: s.product,
          licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
          details: s.notes || 'Product TDL Add-on',
          startDate: s.startDate,
          endDate: s.endDate,
          status: computeServiceStatus(s.endDate, 'active'),
        }));
    const legacy = moduleDetailToService(customer.tdlDetails, 'tdl', customer);
    const rows = [...mergedTdl, ...serialTdl];
    if (rows.length === 0 && legacy) {
      rows.push({
        ...legacy,
        key: 'tdl-legacy',
        status: computeServiceStatus(legacy.endDate, legacy.status),
      });
    }
    return rows;
  }

  if (moduleType === 'cloud') {
    const rows: CustomerModuleRegistryRow[] = (customer.services || [])
      .filter((s) => s.type === 'cloud')
      .map((s, idx) => ({
        ...s,
        key: s._id || `cloud-service-${idx}`,
        status: computeServiceStatus(s.endDate || (s as any).cloudExpiryDate, s.status),
      }));
    const legacy = moduleDetailToService(customer.cloudDetails, 'cloud', customer);
    if (rows.length === 0 && legacy) {
      rows.push({
        ...legacy,
        key: 'cloud-legacy',
        status: computeServiceStatus(legacy.endDate || (legacy as any).cloudExpiryDate, legacy.status),
      });
    }
    return rows;
  }

  const tssServices: CustomerModuleRegistryRow[] = (customer.services || [])
    .filter((s) => s.type === 'tss')
    .map((s, idx) => ({
      ...s,
      key: s._id || `tss-service-${idx}`,
      status: computeServiceStatus(s.endDate || s.tssExpiryDate, s.status),
    }));
  const rawProductLicenseTss: CustomerModuleRegistryRow[] = (customer.services || [])
    .filter((s) => s.type === 'amc' && s.tssExpiryDate)
    .map((s, idx) => ({
      ...s,
      key: `tss-product-license-${s._id || idx}`,
      status: computeServiceStatus(s.tssExpiryDate, s.status),
      endDate: s.tssExpiryDate,
      details: s.details || 'Tracked from Product & License',
    }));
  const mergedTss = mergeModuleServicesBySerial(tssServices, rawProductLicenseTss);
  const legacyTss: CustomerModuleRegistryRow[] = mergedTss.length
    ? []
    : (customer.serialNoInfo || [])
      .filter((s) => s.tssExpiryDate || s.endDate)
      .map((s, idx) => {
        const endDate = s.tssExpiryDate || s.endDate;
        return {
          key: `tss-legacy-${idx}`,
          companyName: s.companyName || customer.name,
          address: s.address || customer.address,
          status: computeServiceStatus(endDate, s.isAmcActive ? 'active' : 'active'),
          product: s.product,
          licenceType: s.licenceType,
          licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
          isAmcActive: s.isAmcActive,
          startDate: s.startDate,
          endDate,
          details: s.notes,
          currentPrice: s.pricingDetails?.currentPrice,
        };
      });
  const legacy = moduleDetailToService(customer.tssDetails, 'tss', customer);
  const rows = [...mergedTss, ...legacyTss];
  if (rows.length === 0 && legacy) {
    rows.push({
      ...legacy,
      key: 'tss-legacy-details',
      status: computeServiceStatus(legacy.endDate || legacy.tssExpiryDate, legacy.status),
    });
  }
  return rows;
};

const moduleRegistryProduct = (row: CustomerModuleRegistryRow, moduleType: 'tdl' | 'tss' | 'cloud') => {
  if (moduleType === 'cloud') return row.product || row.vendor || moduleRegistryConfig.cloud.product;
  return row.product || moduleRegistryConfig[moduleType].product;
};

const moduleRegistryReference = (row: CustomerModuleRegistryRow, moduleType: 'tdl' | 'tss' | 'cloud') => {
  if (moduleType === 'cloud') return row.domainLinkSubId || row.licenseSerialNo || row.release || '—';
  return row.licenseSerialNo || row.licenceType || '—';
};

const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [viewGroupCustomer, setViewGroupCustomer] = useState<Customer | null>(null);
  const [whatsappCustomer, setWhatsappCustomer] = useState<Customer | null>(null);
  const [whatsappForm, setWhatsappForm] = useState({
    messageType: 'text',
    message: '',
    templateName: '',
    languageCode: 'en_US',
  });
  const [detailPage, setDetailPage] = useState<'overview' | 'amc' | 'amc-contract' | 'tdl' | 'tss' | 'cloud' | 'calls' | 'tickets'>('overview');
  const [expandedDetailSections, setExpandedDetailSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeCustomer) {
      setDetailPage('overview');
      setExpandedDetailSections({});
    }
  }, [activeCustomer]);

  const isDetailSectionExpanded = (sectionKey: string, defaultExpanded = true) => {
    return expandedDetailSections[sectionKey] !== undefined
      ? expandedDetailSections[sectionKey]
      : defaultExpanded;
  };

  const toggleDetailSection = (sectionKey: string, defaultExpanded = true) => {
    setExpandedDetailSections((prev) => {
      const current = prev[sectionKey] !== undefined ? prev[sectionKey] : defaultExpanded;
      return { ...prev, [sectionKey]: !current };
    });
  };

  const renderDetailSectionHeader = (
    sectionKey: string,
    label: string,
    marginTop = 0,
    defaultExpanded = true,
    badge?: React.ReactNode
  ) => {
    const isExpanded = isDetailSectionExpanded(sectionKey, defaultExpanded);
    return (
      <button
        type="button"
        onClick={() => toggleDetailSection(sectionKey, defaultExpanded)}
        aria-expanded={isExpanded}
        style={{
          gridColumn: '1 / -1',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '0 0 8px',
          marginTop,
          marginBottom: isExpanded ? 8 : 0,
          border: 0,
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--primary)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          <span>{label}</span>
          {badge}
        </span>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--tx-3)',
            flexShrink: 0,
          }}
        >
          <ChevronDown
            size={16}
            style={{
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform var(--t)',
            }}
          />
        </span>
      </button>
    );
  };

  const renderCollapsibleCardHeader = (sectionKey: string, title: string, badge: React.ReactNode) => {
    const isExpanded = isDetailSectionExpanded(sectionKey);
    return (
      <button
        type="button"
        className="card-header customer-modal-collapsible-header"
        onClick={() => toggleDetailSection(sectionKey)}
        aria-expanded={isExpanded}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          border: 'none',
          borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
          background: 'color-mix(in srgb, var(--surface-2) 86%, var(--surface))',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: isExpanded ? '14px 14px 0 0' : '14px',
        }}
      >
        <span className="card-title" style={{ textAlign: 'left', fontWeight: 750, fontSize: 14 }}>{title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {badge}
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--tx-3)',
              flexShrink: 0,
            }}
          >
            <ChevronDown
              size={15}
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform var(--t)',
              }}
            />
          </span>
        </span>
      </button>
    );
  };

  const { isFiltered, startDate, endDate, filterType } = useDateFilter();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  React.useEffect(() => {
    setPage(1);
  }, [search, filter, productFilter, groupFilter, pageSize, isFiltered, startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', filter, productFilter, groupFilter, search, page, pageSize, isFiltered ? `${startDate}_${endDate}` : 'all'],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (filter !== 'all') params.amcStatus = filter;
      if (productFilter !== 'all') params.product = productFilter;
      if (groupFilter !== 'all') params.group = groupFilter;
      if (search.trim()) params.search = search.trim();
      if (isFiltered && startDate && endDate && filterType !== 'all') {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/customers', { params });
      return res.data as unknown as { data: Customer[]; pages: number; total: number; };
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 100 } });
      return (res.data?.data || []) as Array<{ name: string }>;
    },
  });

  const productOptions = useMemo(() => {
    const list = (productsData || []).map((p: any) => p.name);
    return [
      { value: 'all', label: 'All Products' },
      ...list.sort().map((p: string) => ({ value: p, label: p }))
    ];
  }, [productsData]);

  const { data: statsData } = useQuery({
    queryKey: ['customers-stats', isFiltered ? `${startDate}_${endDate}` : 'all'],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (isFiltered && startDate && endDate && filterType !== 'all') {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/customers/stats', { params });
      return res.data?.data || {};
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    meta: { invalidateQueryKeys: [['customers'], ['customers-stats']] },
    onSuccess: () => {
      toast.success('Customer deleted');
      setDeleteId(null);
    },
    onError: () => toast.error('Failed to delete customer'),
  });

  const whatsappMut = useMutation({
    mutationFn: async ({ customerId, payload }: { customerId: string; payload: any }) => {
      const res = await api.post(`/customers/${customerId}/whatsapp`, payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      if (data?.data?.warning) {
        toast(data.data.warning, { icon: '!' });
      } else {
        toast.success(data?.message || 'WhatsApp message submitted to Meta');
      }
      setWhatsappCustomer(null);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to send WhatsApp message';
      toast.error(msg);
    },
  });

  const openWhatsappModal = (customer: Customer) => {
    setWhatsappCustomer(customer);
    setWhatsappForm({
      messageType: 'text',
      message: buildCustomerWhatsappMessage(customer),
      templateName: '',
      languageCode: 'en_US',
    });
  };

  const sendCustomerWhatsapp = () => {
    if (!whatsappCustomer) return;
    const payload = whatsappForm.messageType === 'template'
      ? {
        messageType: 'template',
        templateName: whatsappForm.templateName,
        languageCode: whatsappForm.languageCode,
      }
      : {
        messageType: 'text',
        message: whatsappForm.message,
      };
    whatsappMut.mutate({ customerId: whatsappCustomer._id, payload });
  };

  const customers: Customer[] = data?.data || [];

  // Keep activeCustomer synchronized with fresh query data whenever customers list updates
  useEffect(() => {
    if (activeCustomer?._id && customers.length > 0) {
      const match = customers.find((c) => c._id === activeCustomer._id);
      if (match && match !== activeCustomer) {
        setActiveCustomer(match);
      }
    }
  }, [customers]);

  // If navigated back from Edit Customer (via Customer Details modal), auto-open with updated customer
  useEffect(() => {
    const openId = (location.state as any)?.openCustomerId;
    if (openId && customers.length > 0) {
      const match = customers.find((c) => c._id === openId);
      if (match) {
        setActiveCustomer(match);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, customers]);

  const stats = {
    total: Number(statsData?.total || 0),
    tdlEnabled: Number(statsData?.tdlEnabled || 0),
    cloudEnabled: Number(statsData?.cloudEnabled || 0),
    tssActive: Number(statsData?.tssActive || 0),
  };

  const customerKpis = useMemo(() => [
    {
      label: 'Total Customers',
      value: stats.total,
      icon: <Users size={18} strokeWidth={2.2} />,
      color: 'var(--brand)',
      bg: 'var(--brand-light)',
      bottom: 'All registered accounts',
    },
    {
      label: 'TDL Add-ons Active',
      value: stats.tdlEnabled,
      icon: <Layers size={18} strokeWidth={2.2} />,
      color: 'var(--green)',
      bg: 'var(--green-bg)',
      bottom: 'Active add-on licenses',
    },
    {
      label: 'Cloud Hub Active',
      value: stats.cloudEnabled,
      icon: <Cloud size={18} strokeWidth={2.2} />,
      color: 'var(--amber)',
      bg: 'var(--amber-bg)',
      bottom: 'Connected cloud instances',
    },
    {
      label: 'TSS Premium Active',
      value: stats.tssActive,
      icon: <ShieldCheck size={18} strokeWidth={2.2} />,
      color: 'var(--red)',
      bg: 'var(--red-bg)',
      bottom: 'Valid active subscriptions',
    },
  ], [stats]);
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c._id, c.name])),
    [customers]
  );
  const branchCountsByParent = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach((c) => {
      if (c.branchInfo?.isBranch && c.branchInfo?.parentCompanyId) {
        map.set(c.branchInfo.parentCompanyId, (map.get(c.branchInfo.parentCompanyId) || 0) + 1);
      }
    });
    return map;
  }, [customers]);
  const activeCustomerBranches = useMemo(() => {
    if (!activeCustomer || activeCustomer.branchInfo?.isBranch) return [];
    return customers.filter(
      (c) => c.branchInfo?.isBranch && c.branchInfo?.parentCompanyId && c.branchInfo.parentCompanyId === activeCustomer._id
    );
  }, [activeCustomer, customers]);
  const activeCustomerInlineBranches = useMemo(() => {
    if (!activeCustomer || activeCustomer.branchInfo?.isBranch) return [];
    return (activeCustomer.branches || [])
      .filter((b) => b.branchName || b.locationArea || b.contactPerson || b.mobile || b.email)
      .map((b, idx) => ({
        key: `inline-${idx}`,
        branchName: b.branchName || `Branch ${idx + 1}`,
        branchCode: '—',
        contact: b.contactPerson || activeCustomer.keyContacts?.[0]?.contactName || activeCustomer.contact || '—',
        phone: b.mobile || activeCustomer.keyContacts?.[0]?.mobile || activeCustomer.phone || '—',
        email: b.email || activeCustomer.keyContacts?.[0]?.email || activeCustomer.email || '—',
        address: b.fullAddress || b.locationArea || activeCustomer.address || activeCustomer.companyInfo?.fullAddress || '—',
        area: b.area || b.locationArea || '—',
        website: b.website || '—',
        websiteStatus: b.websiteStatus || 'Active',
        source: 'inline' as const,
      }));
  }, [activeCustomer]);
  const activeCustomerBranchRows = useMemo(() => {
    const linked = activeCustomerBranches.map((b) => ({
      key: b._id,
      branchName: b.branchInfo?.branchName || b.name || 'Branch',
      branchCode: b.branchInfo?.branchCode || '—',
      contact: b.keyContacts?.[0]?.contactName || b.contact || '—',
      phone: b.keyContacts?.[0]?.mobile || b.phone || '—',
      email: b.keyContacts?.[0]?.email || b.email || '—',
      address: b.address || b.companyInfo?.fullAddress || '—',
      area: b.companyInfo?.locationArea || '—',
      website: b.companyInfo?.website || '—',
      websiteStatus: b.companyInfo?.websiteStatus || 'Active',
      source: 'linked' as const,
      linkedCustomer: b,
    }));
    return [...linked, ...activeCustomerInlineBranches];
  }, [activeCustomerBranches, activeCustomerInlineBranches]);
  const activeCustomerGroupCompanies = useMemo(() => {
    const explicit = (activeCustomer?.groupCompanies || []).filter(
      (row) => row && row.name && row.name.trim()
    );
    if (explicit.length > 0) return explicit;
    const legacyGroup = activeCustomer?.companyInfo?.groupOfCompany;
    if (
      legacyGroup &&
      legacyGroup.trim() &&
      legacyGroup.trim() !== '—' &&
      legacyGroup.trim().toUpperCase() !== 'NO' &&
      legacyGroup.trim().toUpperCase() !== 'NONE'
    ) {
      return [{ name: legacyGroup.trim() }];
    }
    return [];
  }, [activeCustomer]);
  const activeCustomerKeyContacts = useMemo(
    () =>
      (activeCustomer?.keyContacts || []).filter(
        (c) => c.contactName || c.mobile || c.email
      ),
    [activeCustomer]
  );

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'AMC Active' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'none', label: 'No AMC' },
  ];

  const groupOptions = [
    { value: 'all', label: 'All Groups' },
    { value: 'group_only', label: 'Group Companies' },
    { value: 'non_group', label: 'Individual (No Group)' },
  ];

  const customerRows = useMemo(() => customers.map((c, idx) => {
    const tdlService = (c.services || []).find(s => s.type === 'tdl');
    const tdlActive = isServiceEnabled(tdlService) || ['active', 'expiring', 'trial'].includes(String(c.tdlDetails?.status || '').toLowerCase()) || !!c.serialNoInfo?.some((row) => row.isTdl || row.tdlEnabled);
    const cloudService = (c.services || []).find(s => s.type === 'cloud');
    const cloudActive = isServiceEnabled(cloudService) || ['active', 'expiring', 'trial'].includes(String(c.cloudDetails?.status || '').toLowerCase()) || hasModuleDetail(c.cloudDetails as Record<string, unknown> | undefined);
    const cloudLabel = cloudService
      ? (cloudService.status === 'expired' || cloudService.status === 'none'
        ? 'No Cloud'
        : cloudService.vendor ? cloudService.vendor.toUpperCase() : (cloudService.domainLinkSubId ? 'Configured' : cloudService.status === 'trial' ? 'Trial' : 'Active'))
      : c.cloudDetails?.vendor
        ? c.cloudDetails.vendor.toUpperCase()
        : cloudActive
          ? (c.cloudDetails?.domainLinkSubId ? 'Configured' : c.cloudDetails?.status === 'trial' ? 'Trial' : 'Active')
          : 'No Cloud';
    const branchCount = (branchCountsByParent.get(c._id) || 0) + ((c.branches || []).filter((b) => b.branchName || b.locationArea).length);

    return {
      customer: c,
      rowNo: (page - 1) * Number(pageSize) + idx + 1,
      tdlActive,
      cloudLabel,
      tssExpiry: getTssExpiryDate(c),
      products: productListOf(c),
      licenses: licenseListOf(c),
      primaryContact: primaryContactOf(c),
      branch: c.branchInfo?.isBranch
        ? {
          label: c.branchInfo.branchName || 'Branch',
          subLabel: c.branchInfo.branchCode || '—',
          badgeClass: 'badge-amber',
        }
        : {
          label: 'Head Office',
          subLabel: `${branchCount} branches`,
          badgeClass: 'badge-green',
        },
      partnerRows: c.partnerDetails?.length || 0,
    };
  }), [branchCountsByParent, customers, page, pageSize]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-subtitle">{data?.total ? `${data.total} total customers` : 'Manage all CRM customers'}</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {customerKpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className="kpi-card fade-in-up"
            style={{
              animationDelay: `${i * 60}ms`,
              ['--kpi-border' as any]: kpi.color,
              ['--kpi-accent' as any]: kpi.color,
            }}
          >
            <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>
              {kpi.icon}
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{isLoading ? '—' : kpi.value}</div>
            <div className="kpi-change">{kpi.bottom}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep fade-in-up" style={{ animationDelay: '210ms' }}>
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
          <div className="toolbar-page-size">
            <Select
              className="filter-select page-size-select"
              value={pageSize}
              onChange={setPageSize}
              options={PAGE_SIZE_OPTIONS}
            />
          </div>
          <div className="toolbar-divider" />
          <div className="filter-group">
            <Select
              className="filter-select"
              value={groupFilter}
              onChange={setGroupFilter}
              options={groupOptions}
            />
            <Select
              className="filter-select"
              value={productFilter}
              onChange={setProductFilter}
              options={productOptions}
            />
            <Select
              className="filter-select"
              value={filter}
              onChange={setFilter}
              options={statusOptions}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              title="Export customers"
              onClick={async () => {
                const params: Record<string, string> = { limit: '5000', page: '1' };
                if (filter !== 'all') params.amcStatus = filter;
                if (productFilter !== 'all') params.product = productFilter;
                if (groupFilter !== 'all') params.group = groupFilter;
                if (search.trim()) params.search = search.trim();
                const res = await api.get('/customers', { params });
                const rows = customerWelcometechExportRows((res.data?.data || []) as Customer[]);
                exportExcelWorkbook('customers', [
                  { name: 'Customers', rows, columns: WELCOMETECH_CUSTOMER_EXPORT_COLUMNS },
                ]);
              }}
            >
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm" title="Add customer" onClick={() => navigate('/customers/new')}>
              <UserPlus size={13} /> Add Customer
            </button>
          </div>
        </div>
        <div className="tbl-wrap customer-desktop-table">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th style={{ width: 110 }}>Customer No</th>
                <th>Logo</th>
                <th>Customer</th>
                <th>Group of Company</th>
                <th>Branch</th>
                <th>Primary Contact</th>
                <th style={{ minWidth: 120 }}>Products / Licenses</th>
                <th>TSS Premium Expiry</th>
                <th>TDL Add-ons</th>
                <th>Cloud Hub</th>
                <th>AMC Status</th>
                <th>Partner Details</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={14} />)
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <EmptyState
                      icon={<Users size={22} />}
                      title="No customers found"
                      description="Add your first customer or adjust filters."
                      action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/customers/new')}><UserPlus size={13} /> Add Customer</button>}
                    />
                  </td>
                </tr>
              ) : (
                customerRows.map(({ customer: c, rowNo, tdlActive, cloudLabel, tssExpiry, products, licenses, primaryContact, branch, partnerRows }) => {
                  const explicitGroups = (c.groupCompanies || []).map((g) => g.name?.trim()).filter(Boolean);
                  const legacyGroup = c.companyInfo?.groupOfCompany?.trim();
                  const isLegacyValid =
                    legacyGroup &&
                    legacyGroup !== '—' &&
                    legacyGroup.toUpperCase() !== 'NO' &&
                    legacyGroup.toUpperCase() !== 'NONE';
                  const allGroups = explicitGroups.length > 0 ? explicitGroups : isLegacyValid ? [legacyGroup] : [];

                  return (
                    <tr key={c._id}>
                      <td className="sno-col">{rowNo}</td>
                      <td style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--tx-1)', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>
                        {c.customerNumber || '—'}
                      </td>
                      <td><Avatar name={c.name} src={c.avatar} size="sm" /></td>
                      <td>
                        <div className="customer-cell">
                          <button
                            type="button"
                            className="customer-name-link"
                            onClick={() => setActiveCustomer(c)}
                            title="View customer details"
                          >
                            {c.name}
                          </button>
                          <div style={{ fontSize: 11.5, color: 'var(--tx-4)' }}>{c.companyInfo?.businessSegment || c.industry || '—'}</div>
                        </div>
                      </td>
                      <td>
                        {allGroups.length === 0 ? (
                          <span style={{ color: 'var(--tx-4)', fontSize: 12 }}>—</span>
                        ) : allGroups.length > 1 ? (
                          <button
                            type="button"
                            className="badge badge-purple"
                            style={{
                              cursor: 'pointer',
                              border: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontWeight: 650,
                              boxShadow: '0 1px 3px rgba(139, 92, 246, 0.2)',
                            }}
                            onClick={() => setViewGroupCustomer(c)}
                            title="Click to view all associated group companies"
                          >
                            <Layers size={12} /> {allGroups.length} Groups
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="badge badge-purple"
                            style={{
                              cursor: 'pointer',
                              border: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontWeight: 600,
                              maxWidth: 170,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={() => setViewGroupCustomer(c)}
                            title={`Group: ${allGroups[0]} (Click for details)`}
                          >
                            <Layers size={11} /> {allGroups[0]}
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span className={`badge ${branch.badgeClass}`}>{branch.label}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--tx-4)', textAlign: 'center' }}>
                            {c.branchInfo?.isBranch ? `(${branch.subLabel})` : branch.subLabel}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}>{primaryContact.name}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{primaryContact.phone}</span>
                        </div>
                      </td>
                      <td>
                        <div className="products-cell">
                          <span className="badge badge-blue" title={licenses.join(', ') || products.join(', ') || 'No licenses'} style={{ fontSize: 11, fontWeight: 700 }}>
                            {licenses.length ? `${licenses.length} ${licenses.length === 1 ? 'License' : 'Licenses'}` : products.length ? `${products.length} ${products.length === 1 ? 'Product' : 'Products'}` : 'No Licenses'}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{tssExpiry ? fmt.date(tssExpiry) : '—'}</td>
                      <td>{tdlActive ? <span className="badge badge-green">Enabled</span> : <span className="badge badge-gray">No TDL</span>}</td>
                      <td>
                        <span className={`badge ${(cloudLabel === 'No Cloud') ? 'badge-gray' : 'badge-blue'}`}>
                          <Cloud size={10} /> {cloudLabel}
                        </span>
                      </td>
                      <td><Badge status={c.amcStatus} /></td>
                      <td>
                        <span className={`badge ${partnerRows > 0 ? 'badge-blue' : 'badge-gray'}`}>
                          {partnerRows} rows
                        </span>
                      </td>
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'center' }}>
                          <button className="btn-action btn-action-amber" title="Edit" onClick={() => navigate(`/customers/${c._id}/edit`)}><Edit size={13} /></button>
                          <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(c._id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="customer-mobile-list" aria-label="Customer list">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div className="responsive-record-card customer-record-card is-loading" key={i}>
                <div className="skeleton" style={{ height: 18, width: '62%' }} />
                <div className="skeleton" style={{ height: 42, width: '100%' }} />
                <div className="skeleton" style={{ height: 72, width: '100%' }} />
              </div>
            ))
          ) : customers.length === 0 ? (
            <div className="customer-mobile-empty">
              <EmptyState
                icon={<Users size={22} />}
                title="No customers found"
                description="Add your first customer or adjust filters."
                action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/customers/new')}><UserPlus size={13} /> Add Customer</button>}
              />
            </div>
          ) : (
            customerRows.map(({ customer: c, rowNo, tdlActive, cloudLabel, tssExpiry, products, licenses, primaryContact, branch, partnerRows }) => (
              <article className="responsive-record-card customer-record-card" key={c._id}>
                <div className="customer-record-head">
                  <div className="customer-record-identity">
                    <Avatar name={c.name} src={c.avatar} size="md" />
                    <div className="customer-record-title-wrap" style={{ minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                      <div className="customer-record-title-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                        <button
                          type="button"
                          className="customer-name-link customer-record-title"
                          onClick={() => setActiveCustomer(c)}
                          title="View customer details"
                          style={{
                            margin: 0,
                            padding: 0,
                            textAlign: 'left',
                            justifyContent: 'flex-start',
                            alignItems: 'flex-start',
                            display: 'block',
                            width: '100%',
                            maxWidth: '100%',
                            flex: '1 1 auto',
                            minWidth: 0,
                          }}
                        >
                          {c.name}
                        </button>
                        {c.customerNumber && (
                          <span
                            className="badge badge-purple font-mono"
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              fontWeight: 700,
                              letterSpacing: '0.3px',
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            {c.customerNumber}
                          </span>
                        )}
                      </div>
                      {(c.companyInfo?.businessSegment || c.industry) && (
                        <span className="customer-record-subtitle">{c.companyInfo?.businessSegment || c.industry}</span>
                      )}
                    </div>
                  </div>
                  <span className="record-index">{rowNo}</span>
                </div>

                <div className="customer-record-contact-line">
                  <Phone size={14} />
                  <span>{primaryContact.name}</span>
                  <strong>{primaryContact.phone}</strong>
                </div>

                <div className="customer-record-badges">
                  <span className={`badge ${branch.badgeClass}`}><Building2 size={10} /> {branch.label}</span>
                  <Badge status={c.amcStatus} />
                  <span className={`badge ${tdlActive ? 'badge-green' : 'badge-gray'}`}>{tdlActive ? 'TDL Enabled' : 'No TDL'}</span>
                  <span className={`badge ${(cloudLabel === 'No Cloud') ? 'badge-gray' : 'badge-blue'}`}><Cloud size={10} /> {cloudLabel}</span>
                </div>

                <div className="record-info-grid">
                  <div className="record-info-item record-info-products">
                    <span className="record-info-label"><Package size={12} /> Products / Licenses</span>
                    <strong>{licenses.length ? `${licenses.length} ${licenses.length === 1 ? 'License' : 'Licenses'}` : products.length ? `${products.length} ${products.length === 1 ? 'Product' : 'Products'}` : 'No Licenses'}</strong>
                    <span title={licenses.join(', ') || products.join(', ') || 'No licenses'}>{licenses.slice(0, 2).join(', ') || products.slice(0, 2).join(', ') || '—'}{licenses.length > 2 ? ` +${licenses.length - 2}` : products.length > 2 ? ` +${products.length - 2}` : ''}</span>
                  </div>
                  <div className="record-info-item record-info-expiry">
                    <span className="record-info-label"><CalendarDays size={12} /> TSS Expiry</span>
                    <strong>{tssExpiry ? fmt.date(tssExpiry) : '—'}</strong>
                    <span>{branch.subLabel}</span>
                  </div>
                  <div className="record-info-item record-info-partner">
                    <span className="record-info-label"><Users size={12} /> Partner Details</span>
                    <strong>{partnerRows} rows</strong>
                    <span>{partnerRows > 0 ? 'Available' : 'Not added'}</span>
                  </div>
                </div>

                <div className="customer-record-actions">
                  <button className="btn btn-export btn-sm mobile-action-icon-btn" title="View Details" aria-label="View Details" onClick={() => setActiveCustomer(c)}>
                    <Eye size={13} />
                    <span>View Details</span>
                  </button>
                  <div className="table-actions">
                    <button className="btn-action btn-action-amber" title="Edit" onClick={() => navigate(`/customers/${c._id}/edit`)}><Edit size={13} /></button>
                    <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(c._id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Customer"
        message="This will permanently remove the customer and its associated calls, AMC records, tickets, payments, and proposals. Continue?"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      <Modal
        open={!!whatsappCustomer}
        onClose={() => setWhatsappCustomer(null)}
        title="Send WhatsApp"
        size="md"
        footer={(
          <div className="flex justify-end gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setWhatsappCustomer(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={sendCustomerWhatsapp}
              disabled={whatsappMut.isPending || !whatsappCustomer || (whatsappForm.messageType === 'template' ? !whatsappForm.templateName.trim() : !whatsappForm.message.trim())}
            >
              <Send size={14} />
              {whatsappMut.isPending ? 'Sending...' : 'Send WhatsApp'}
            </button>
          </div>
        )}
      >
        {!whatsappCustomer ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bd)', flexShrink: 0 }}>
                <MessageCircle size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--tx-1)' }}>{whatsappCustomer.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 2 }}>
                  Sending to saved WhatsApp/mobile: <strong style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)' }}>{customerWhatsappNumberOf(whatsappCustomer) || 'Not available'}</strong>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Message Type</label>
              <Select
                value={whatsappForm.messageType}
                onChange={(value) => setWhatsappForm((prev) => ({ ...prev, messageType: value }))}
                options={[
                  { value: 'text', label: 'Free-form Text' },
                  { value: 'template', label: 'Approved Template' },
                ]}
              />
            </div>

            {whatsappForm.messageType === 'template' ? (
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Template Name</label>
                  <input
                    className="form-control"
                    value={whatsappForm.templateName}
                    onChange={(e) => setWhatsappForm((prev) => ({ ...prev, templateName: e.target.value }))}
                    placeholder="Approved template name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Language Code</label>
                  <input
                    className="form-control"
                    value={whatsappForm.languageCode}
                    onChange={(e) => setWhatsappForm((prev) => ({ ...prev, languageCode: e.target.value }))}
                    placeholder="en_US"
                  />
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-control"
                  rows={8}
                  value={whatsappForm.message}
                  onChange={(e) => setWhatsappForm((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="Type WhatsApp message..."
                />
              </div>
            )}

            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.16)', color: 'var(--tx-3)', fontSize: 11.5, lineHeight: 1.55 }}>
              Free-form text works only inside Meta's customer service window. Use an approved template when the customer has not messaged your business recently.
            </div>
          </div>
        )}
      </Modal>

      {/* Theme-based Group of Companies UI/UX Modal */}
      <Modal
        open={!!viewGroupCustomer}
        onClose={() => setViewGroupCustomer(null)}
        title="Group of Companies"
        size="md"
        headerActions={
          viewGroupCustomer ? (
            <span className="badge badge-purple" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Layers size={12} />
              {(() => {
                const explicit = (viewGroupCustomer.groupCompanies || []).filter((g) => g.name?.trim());
                const legacy = viewGroupCustomer.companyInfo?.groupOfCompany?.trim();
                const isLegacyValid = legacy && legacy !== '—' && legacy.toUpperCase() !== 'NO' && legacy.toUpperCase() !== 'NONE';
                return explicit.length || (isLegacyValid ? 1 : 0);
              })()}{' '}
              {((viewGroupCustomer.groupCompanies || []).length || (viewGroupCustomer.companyInfo?.groupOfCompany ? 1 : 0)) === 1 ? 'Entity' : 'Entities'}
            </span>
          ) : undefined
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-secondary" onClick={() => setViewGroupCustomer(null)}>
              Close
            </button>
          </div>
        }
      >
        {viewGroupCustomer && (() => {
          const explicit = (viewGroupCustomer.groupCompanies || []).filter((g) => g.name?.trim());
          const legacyGroup = viewGroupCustomer.companyInfo?.groupOfCompany?.trim();
          const isLegacyValid =
            legacyGroup &&
            legacyGroup !== '—' &&
            legacyGroup.toUpperCase() !== 'NO' &&
            legacyGroup.toUpperCase() !== 'NONE';

          const groupList: Array<{ name: string; contactNumber?: string; remarks?: string }> =
            explicit.length > 0
              ? explicit.map((g: any) => ({
                name: String(g.name || '').trim(),
                contactNumber: g.contactNumber ? String(g.contactNumber).trim() : undefined,
                remarks: g.remarks ? String(g.remarks).trim() : undefined,
              }))
              : isLegacyValid
                ? [{ name: legacyGroup }]
                : [];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Selected company context card */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Selected Customer
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--tx-1)', marginTop: 2 }}>
                    {viewGroupCustomer.name}
                  </div>
                  {viewGroupCustomer.companyInfo?.customerName && viewGroupCustomer.companyInfo.customerName !== viewGroupCustomer.name && (
                    <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 2 }}>
                      {viewGroupCustomer.companyInfo.customerName}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-green">Member Company</span>
                </div>
              </div>

              {/* Associated Group Entities List */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Associated Group Entities
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groupList.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx-4)', background: 'var(--surface-2)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                      No group entities registered for this company.
                    </div>
                  ) : (
                    groupList.map((g, gIdx) => (
                      <div
                        key={gIdx}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 10,
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 200px' }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              background: 'var(--brand-light, rgba(139, 92, 246, 0.1))',
                              color: 'var(--brand)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            {gIdx + 1}
                          </div>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx-1)' }}>
                              {g.name}
                            </div>
                            {g.contactNumber && (
                              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 2 }}>
                                Contact: {g.contactNumber}
                              </div>
                            )}
                            {g.remarks && (
                              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 2 }}>
                                {g.remarks}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="badge badge-purple">Group Entity</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!activeCustomer}
        onClose={() => setActiveCustomer(null)}
        title="Customer Details"
        size="xl"
        className="customer-page-details-modal"
        headerActions={
          activeCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'none' }}
                onClick={() => openWhatsappModal(activeCustomer)}
              >
                <MessageCircle size={13} /> WhatsApp
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'none' }}
                onClick={() => navigate(`/customers/${activeCustomer._id}/edit`, { state: { fromDetailsModal: true } })}
              >
                <Edit size={13} /> Edit
              </button>
            </div>
          ) : null
        }
      >
        {!activeCustomer ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              className="customer-modal-identity-card"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 14,
                background: 'color-mix(in srgb, var(--surface-2) 65%, var(--surface))',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
                <Avatar name={activeCustomer.name} src={activeCustomer.avatar} size="lg" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                    <span style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--brand)', wordBreak: 'break-word', textAlign: 'left', flex: '1 1 auto' }}>
                      {activeCustomer.name}
                    </span>
                    {activeCustomer.customerNumber && (
                      <span
                        className="badge badge-purple font-mono"
                        style={{ fontSize: 11, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.4px', flexShrink: 0, marginTop: 2 }}
                      >
                        {activeCustomer.customerNumber}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {(activeCustomer.companyInfo?.industryGroup || activeCustomer.industry) && (
                      <span style={{ fontSize: 12, color: 'var(--tx-4)', wordBreak: 'break-word' }}>
                        {activeCustomer.companyInfo?.industryGroup || activeCustomer.industry}
                      </span>
                    )}
                    <Badge status={activeCustomer.amcStatus} />
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-nav-premium">
              {[
                { id: 'overview', label: 'Overview' },
                {
                  id: 'amc', label: (() => {
                    const directAmc = (activeCustomer?.services || []).filter(s => s.type === 'amc');
                    const amcSerials = new Set(directAmc.map(s => String(s.licenseSerialNo || '').trim()).filter(Boolean));
                    const standaloneTss = (activeCustomer?.services || []).filter(s => s.type === 'tss' && s.licenseSerialNo && !amcSerials.has(String(s.licenseSerialNo).trim()));
                    const total = directAmc.length + standaloneTss.length || (activeCustomer?.serialNoInfo || []).length;
                    return total > 1 ? `Product & License (${total})` : 'Product & License';
                  })()
                },
                { id: 'amc-contract', label: 'AMC' },
                { id: 'tdl', label: 'TDL Add-ons' },
                { id: 'tss', label: 'TSS Premium' },
                { id: 'cloud', label: 'Cloud Hub' },
                { id: 'calls', label: 'Call Log' },
                { id: 'tickets', label: 'Tickets' },
              ].map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className={`tab-btn-premium ${detailPage === page.id ? 'active' : ''}`}
                  onClick={() => setDetailPage(page.id as typeof detailPage)}
                >
                  {page.label}
                </button>
              ))}
            </div>

            <div className="details-grid">
              {detailPage === 'overview' ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>

                  <div className="card card-table-sep">
                    {renderCollapsibleCardHeader('seg-company', 'Company Information', null)}
                    {isDetailSectionExpanded('seg-company') ? (
                      <div className="card-body">
                        <div className="details-grid">
                          <DetailItem label="Customer Number" value={activeCustomer.customerNumber || '—'} />
                          <DetailItem label="Company Name" value={activeCustomer.name || activeCustomer.companyInfo?.customerName || '—'} />
                          <DetailItem label="Status" value={activeCustomer.isActive !== false ? 'Active' : 'Inactive'} />
                          <DetailItem label="Customer Type" value={Array.isArray(activeCustomer.customerType) ? activeCustomer.customerType.join(', ') : activeCustomer.customerType || '—'} />
                          <DetailItem label="Group" value={activeCustomerGroupCompanies.length > 0 ? 'Yes' : 'No'} />
                          {activeCustomerGroupCompanies.length > 0 ? (
                            <DetailItem label="Group of Company" value={activeCustomerGroupCompanies.map((row) => row.name).filter(Boolean).join(', ') || '—'} />
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="card card-table-sep">
                    {renderCollapsibleCardHeader('seg-industry', 'Industry & Operations', null)}
                    {isDetailSectionExpanded('seg-industry') ? (
                      <div className="card-body">
                        <div className="details-grid">
                          <DetailItem label="CR No" value={activeCustomer.companyInfo?.crNo || '—'} />
                          <DetailItem label="Business Segment" value={activeCustomer.companyInfo?.businessSegment || '—'} />
                          <DetailItem label="Industry" value={activeCustomer.industry || activeCustomer.companyInfo?.industry || '—'} />
                          <DetailItem label="Industry Group" value={activeCustomer.companyInfo?.industryGroup || '—'} />
                          <DetailItem label="Industry Type" value={activeCustomer.companyInfo?.industryType || '—'} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="card card-table-sep">
                    {renderCollapsibleCardHeader('seg-location', 'Location & Address', null)}
                    {isDetailSectionExpanded('seg-location') ? (
                      <div className="card-body">
                        <div className="details-grid">
                          <DetailItem label="Address" value={activeCustomer.address || '—'} />
                          <DetailItem label="Full Address" value={activeCustomer.companyInfo?.fullAddress || '—'} />
                          <DetailItem label="Area" value={activeCustomer.companyInfo?.locationArea || '—'} />
                          <DetailItem label="Website" value={activeCustomer.companyInfo?.website || '—'} subvalue={activeCustomer.companyInfo?.websiteStatus || undefined} />
                          <DetailItem label="Website Status" value={activeCustomer.companyInfo?.websiteStatus || '—'} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="card card-table-sep">
                    {renderCollapsibleCardHeader('seg-branches', 'Managed Branches', <span className="badge badge-green">{activeCustomerBranchRows.length} branches</span>)}
                    {isDetailSectionExpanded('seg-branches') ? (
                      activeCustomer.branchInfo?.isBranch ? (
                        <div className="card-body">
                          <div className="details-grid">
                            <DetailItem label="Company Type" value="Branch" />
                            <DetailItem label="Branch Name" value={activeCustomer.branchInfo?.branchName || '—'} />
                            <DetailItem label="Branch Code" value={activeCustomer.branchInfo?.branchCode || '—'} />
                            <DetailItem label="Parent Company" value={activeCustomer.branchInfo?.parentCompanyId ? (customerNameById.get(activeCustomer.branchInfo.parentCompanyId) || activeCustomer.branchInfo.parentCompanyId) : '—'} />
                          </div>
                        </div>
                      ) : (
                        <div className="tbl-wrap">
                          <table className="table-pro table-center">
                            <thead>
                              <tr>
                                <th className="sno-col">S NO</th>
                                <th>Branch Name</th>
                                <th>Address</th>
                                <th>Area</th>
                                <th>Full Address</th>
                                <th>Website</th>
                                <th>Status</th>
                                <th>Contact Person</th>
                                <th>Mobile</th>
                                <th>Email</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeCustomerBranchRows.length === 0 ? (
                                <tr>
                                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--tx-4)', fontSize: 12.5, padding: 24 }}>
                                    No managed branches added.
                                  </td>
                                </tr>
                              ) : (
                                activeCustomerBranchRows.map((b, idx) => (
                                  <tr key={b.key}>
                                    <td className="sno-col">{idx + 1}</td>
                                    <td style={{ fontWeight: 750, color: 'var(--tx-1)' }}>{b.branchName}</td>
                                    <td style={{ fontSize: 12 }}>{b.source === 'inline' ? b.address : b.area}</td>
                                    <td style={{ fontSize: 12 }}>{b.area}</td>
                                    <td style={{ fontSize: 12, maxWidth: 220, whiteSpace: 'normal' }}>{b.address}</td>
                                    <td style={{ fontSize: 11.5 }}>
                                      {b.website && b.website !== '—' ? (
                                        <a href={b.website.startsWith('http') ? b.website : `https://${b.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
                                          {b.website.replace(/^https?:\/\//, '')}
                                        </a>
                                      ) : '—'}
                                    </td>
                                    <td><span className={`badge ${b.websiteStatus === 'Active' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{b.websiteStatus}</span></td>
                                    <td style={{ fontSize: 12 }}>{b.contact}</td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{b.phone}</td>
                                    <td style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{b.email}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : null}
                  </div>

                  <div className="card card-table-sep">
                    {renderCollapsibleCardHeader('seg-contact', 'Contact Information', <span className="badge badge-amber">{activeCustomerKeyContacts.length} contacts</span>)}
                    {isDetailSectionExpanded('seg-contact') ? (
                      <div className="tbl-wrap">
                        <table className="table-pro table-center">
                          <thead>
                            <tr>
                              <th className="sno-col">S NO</th>
                              <th>Contact Name</th>
                              <th>Designation</th>
                              <th>Mobile</th>
                              <th>Whatsapp</th>
                              <th>Email</th>
                              <th>Preferred</th>
                              <th>Landline / Office</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeCustomerKeyContacts.length === 0 ? (
                              <tr>
                                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--tx-4)', fontSize: 12.5, padding: 24 }}>
                                  No contact information available.
                                </td>
                              </tr>
                            ) : (
                              activeCustomerKeyContacts.map((c, idx) => (
                                <tr key={`${c.contactName || 'contact'}-${idx}`}>
                                  <td className="sno-col">{idx + 1}</td>
                                  <td style={{ fontWeight: 750, color: 'var(--tx-1)' }}>
                                    {c.contactName || '—'} {idx === 0 && <span style={{ fontSize: 9, marginLeft: 6, padding: '2px 5px', borderRadius: 4, background: 'rgba(var(--brand-rgb), 0.1)', color: 'var(--brand)', textTransform: 'uppercase' }}>Primary</span>}
                                  </td>
                                  <td style={{ fontSize: 12 }}>{c.designation || '—'}</td>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{c.mobile || '—'}</td>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{c.whatsapp || '—'}</td>
                                  <td style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{c.email || '—'}</td>
                                  <td><span className="badge badge-gray" style={{ textTransform: 'capitalize' }}>{c.contactPreference || '—'}</span></td>
                                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{c.landline || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>

                </div>
              ) : null}

              {detailPage === 'amc' && activeCustomer ? (
                (() => {
                  const directAmc = (activeCustomer.services || []).filter(s => s.type === 'amc').map(s => {
                    const serKey = String(s.licenseSerialNo || '').trim().toLowerCase();
                    if (!serKey) return s;
                    let latestTssDate = s.tssExpiryDate;
                    let latestTime = latestTssDate ? new Date(latestTssDate).getTime() : 0;
                    (activeCustomer.services || [])
                      .filter(t => t.type === 'tss' && String(t.licenseSerialNo || '').trim().toLowerCase() === serKey)
                      .forEach(t => {
                        const d = t.endDate || t.tssExpiryDate;
                        const time = d ? new Date(d).getTime() : 0;
                        if (time > latestTime) {
                          latestTime = time;
                          latestTssDate = d;
                        }
                      });
                    if (activeCustomer.tssDetails?.licenseSerialNo && String(activeCustomer.tssDetails.licenseSerialNo).trim().toLowerCase() === serKey) {
                      const d = activeCustomer.tssDetails.endDate || (activeCustomer.tssDetails as any).tssExpiryDate;
                      const time = d ? new Date(d).getTime() : 0;
                      if (time > latestTime) {
                        latestTime = time;
                        latestTssDate = d;
                      }
                    }
                    return { ...s, tssExpiryDate: latestTssDate };
                  });
                  const amcSerials = new Set(directAmc.map(s => String(s.licenseSerialNo || '').trim()).filter(Boolean));
                  const standaloneTssMap = new Map<string, typeof directAmc[0]>();
                  (activeCustomer.services || [])
                    .filter(s => s.type === 'tss' && s.licenseSerialNo && !amcSerials.has(String(s.licenseSerialNo).trim()))
                    .forEach(s => {
                      const ser = String(s.licenseSerialNo).trim();
                      if (!standaloneTssMap.has(ser)) standaloneTssMap.set(ser, s);
                    });
                  const synthesizedTss = Array.from(standaloneTssMap.values()).map(s => ({
                    ...s,
                    type: 'amc' as const,
                    isAmcActive: false,
                    status: (s.status === 'expired' ? 'expired' : 'none') as CustomerService['status'],
                    tssExpiryDate: s.endDate || s.tssExpiryDate,
                  }));
                  const amcServices = [...directAmc, ...synthesizedTss];
                  const legacyLicenses = amcServices.length === 0 ? (activeCustomer.serialNoInfo || []) : [];

                  const rows: CustomerDetailRow[] = amcServices.length > 0
                    ? amcServices.map((s, idx) => ({
                      key: `amc-svc-${idx}`,
                      label: `Product & License #${idx + 1}`,
                      product: s.product,
                      releaseVersion: s.releaseVersion,
                      licenceType: s.licenceType,
                      noOfUsers: s.noOfUsers,
                      licenseSerialNo: s.licenseSerialNo,
                      licenceStatus: s.licenceStatus,
                      isServer9: s.isServer9,
                      isAmcActive: s.isAmcActive,
                      status: s.status,
                      companyName: s.companyName || activeCustomer.name,
                      address: s.address || activeCustomer.address,
                      contactPerson: s.contactPerson,
                      mobile: s.mobile,
                      email: s.email,
                      vendorCategory: s.vendorCategory,
                      reminder: s.reminder,
                      details: s.details,
                      salesman1: s.salesman1,
                      salesman2: s.salesman2,
                      startDate: s.startDate,
                      endDate: s.endDate,
                      tssExpiryDate: s.tssExpiryDate,
                      server9SerialNos: s.server9SerialNos,
                      tdlSerialNos: s.tdlSerialNos,
                      actualPrice: s.actualPrice,
                      discount: s.discount,
                      currentPrice: s.currentPrice,
                      advance1: s.advance1,
                      advance2: s.advance2,
                      notesRemarks: s.notesRemarks,
                    }))
                    : legacyLicenses.map((s, idx) => ({
                      key: `amc-leg-${idx}`,
                      label: `Product & License #${idx + 1}`,
                      product: s.product,
                      releaseVersion: s.releaseVersion,
                      licenceType: s.licenceType,
                      noOfUsers: s.noOfUsers,
                      licenseSerialNo: s.licenseSerialNo || s.licenses?.[0]?.licenceSerialNo,
                      licenceStatus: s.licenceStatus || s.licenses?.[0]?.licenceStatus,
                      isServer9: s.isServer9,
                      isAmcActive: s.isAmcActive,
                      status: (s.isAmcActive ? 'active' : 'none') as CustomerService['status'],
                      companyName: s.companyName || activeCustomer.name,
                      address: s.address || activeCustomer.address,
                      contactPerson: undefined,
                      mobile: undefined,
                      email: undefined,
                      vendorCategory: undefined,
                      details: s.notes,
                      salesman1: undefined,
                      salesman2: undefined,
                      startDate: s.startDate,
                      endDate: s.endDate,
                      tssExpiryDate: s.tssExpiryDate,
                      server9SerialNos: s.server9SerialNo ? [{ serialNo: s.server9SerialNo }] : [],
                      tdlSerialNos: s.tdlSerialNos,
                      actualPrice: s.pricingDetails?.actualPrice,
                      discount: s.pricingDetails?.discount,
                      currentPrice: s.pricingDetails?.currentPrice,
                      advance1: s.pricingDetails?.advance1,
                      advance2: s.pricingDetails?.advance2,
                      notesRemarks: s.notes,
                    }));

                  if (rows.length === 0) {
                    return <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--tx-4)', fontStyle: 'italic', background: 'var(--bg-3)', borderRadius: 12 }}>No Product & License records found.</div>;
                  }

                  // If there are multiple licenses, they default to closed (collapsed)
                  const defaultExpanded = rows.length === 1;

                  return (
                    <>
                      {rows.length > 1 && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              const allExpanded = rows.every((r) => isDetailSectionExpanded(r.key, defaultExpanded));
                              const nextState: Record<string, boolean> = {};
                              rows.forEach((r) => {
                                nextState[r.key] = !allExpanded;
                              });
                              setExpandedDetailSections((prev) => ({ ...prev, ...nextState }));
                            }}
                            style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 6, gap: 5, display: 'inline-flex', alignItems: 'center' }}
                          >
                            {rows.every((r) => isDetailSectionExpanded(r.key, defaultExpanded)) ? 'Collapse All' : 'Expand All'}
                          </button>
                        </div>
                      )}
                      {rows.map((s, idx) => {
                        const isExpanded = isDetailSectionExpanded(s.key, defaultExpanded);
                        const balance = balanceOf(s);
                        return (
                          <React.Fragment key={s.key}>
                            {renderDetailSectionHeader(
                              s.key,
                              s.label,
                              idx > 0 ? 16 : 0,
                              defaultExpanded,
                              s.product ? (
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx-3)', padding: '2px 8px', background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                  {s.product}{s.licenseSerialNo ? ` • ${s.licenseSerialNo}` : ''}
                                </span>
                              ) : undefined
                            )}
                            {isExpanded ? (
                              <>
                                <DetailItem label="Company Name" value={s.companyName || '—'} />
                                <DetailItem label="Address" value={s.address || '—'} />
                                <DetailItem label="Product" value={s.product || '—'} />
                                <DetailItem label="Release Version" value={s.releaseVersion || '—'} />
                                <DetailItem label="License Type" value={s.licenceType || '—'} />
                                <DetailItem label="No. of Users" value={s.noOfUsers != null ? String(s.noOfUsers) : '—'} />
                                <DetailItem label="License Serial No" value={s.licenseSerialNo || '—'} />
                                <DetailItem label="License Status" value={s.licenceStatus || '—'} />
                                <DetailItem label="Server 9" value={s.isServer9 ? 'Yes' : 'No'} />
                                <DetailItem label="Server 9 Serial Nos" value={serialList(s.server9SerialNos)} />
                                <DetailItem label="TDL Serial Nos" value={serialList(s.tdlSerialNos)} />
                                <DetailItem label="AMC" value={s.isAmcActive ? 'Yes' : 'No'} />
                                <DetailItem label="AMC Status" value={s.status || '—'} />
                                <DetailItem label="Contact Person" value={s.contactPerson || '—'} />
                                <DetailItem label="Mobile" value={s.mobile || '—'} />
                                <DetailItem label="Email" value={s.email || '—'} />
                                <DetailItem label="Partner Name" value={s.vendorCategory || '—'} />
                                <DetailItem label="Reminder" value={s.reminder || '—'} />
                                <DetailItem label="Details" value={s.details || '—'} />
                                <DetailItem label="Salesman 1" value={s.salesman1 || '—'} />
                                <DetailItem label="Salesman 2" value={s.salesman2 || '—'} />
                                <DetailItem label="Start Date" value={s.startDate ? fmt.date(s.startDate) : '—'} />
                                <DetailItem label="Expiry Date" value={s.endDate ? fmt.date(s.endDate) : '—'} />
                                <DetailItem label="TSS Expiry Date" value={s.tssExpiryDate ? fmt.date(s.tssExpiryDate) : '—'} />
                                <DetailItem label="Actual Price" value={moneyOrDash(s.actualPrice)} />
                                <DetailItem label="Discount" value={moneyOrDash(s.discount)} />
                                <DetailItem label="Current Price" value={moneyOrDash(s.currentPrice)} />
                                <DetailItem label="Advance 1" value={moneyOrDash(s.advance1)} />
                                <DetailItem label="Advance 2" value={moneyOrDash(s.advance2)} />
                                <DetailItem label="Balance" value={balance != null ? moneyOrDash(balance) : '—'} />
                                <DetailItem label="Notes / Remarks" value={s.notesRemarks || s.details || '—'} />
                              </>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })()
              ) : null}

              {detailPage === 'tdl' && activeCustomer ? (
                <CustomerModuleRegistry customer={activeCustomer} moduleType="tdl" />
              ) : null}

              {detailPage === 'tss' && activeCustomer ? (
                <CustomerModuleRegistry customer={activeCustomer} moduleType="tss" />
              ) : null}

              {detailPage === 'cloud' && activeCustomer ? (
                <CustomerModuleRegistry customer={activeCustomer} moduleType="cloud" />
              ) : null}

              {detailPage === 'amc-contract' && activeCustomer ? (
                <CustomerAMCContractLog customerId={activeCustomer._id} />
              ) : null}

              {detailPage === 'calls' && activeCustomer ? (
                <CustomerCallLog customerId={activeCustomer._id} />
              ) : null}

              {detailPage === 'tickets' && activeCustomer ? (
                <CustomerTicketLog customerId={activeCustomer._id} />
              ) : null}
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
};

const CustomerModuleRegistry: React.FC<{ customer: Customer; moduleType: 'tdl' | 'tss' | 'cloud' }> = ({ customer, moduleType }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const config = moduleRegistryConfig[moduleType];
  const rows = moduleRegistryRows(customer, moduleType);

  const amountOf = (row: CustomerModuleRegistryRow) => {
    const amount = row.currentPrice ?? row.amcValue ?? row.actualPrice ?? row.remainingTotal;
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatAmount = (amount: number | null | undefined) => (
    amount != null && Number.isFinite(Number(amount)) ? fmt.currency(Number(amount)) : '—'
  );

  const toggleHistory = (key: string) => {
    setExpandedRowKey((prev) => (prev === key ? null : key));
  };

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
          <span className="card-title">{config.title}</span>
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
                  <th>Product</th>
                  <th>{config.reference}</th>
                  <th>Start Date</th>
                  <th>Expiry Date</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--tx-4)', fontSize: 13 }}>
                      {config.empty}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => {
                    const amount = amountOf(row);
                    const isHistoryOpen = expandedRowKey === row.key;
                    const history = (row.renewalHistory || []).filter((rh) => rh.period !== 'Initial Contract');

                    return (
                      <React.Fragment key={row.key}>
                        <tr>
                          <td className="sno-col">{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{moduleRegistryProduct(row, moduleType)}</td>
                          <td>{moduleRegistryReference(row, moduleType)}</td>
                          <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(row.startDate)}</td>
                          <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(row.endDate)}</td>
                          <td style={{ fontWeight: 600 }}>{formatAmount(amount)}</td>
                          <td><Badge status={computeServiceStatus(row.endDate, row.status)} /></td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => toggleHistory(row.key)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                height: 'auto',
                                minHeight: 'unset',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <span>{isHistoryOpen ? 'Hide History' : 'View History'}</span>
                              <ChevronDown
                                size={12}
                                style={{
                                  transform: isHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform var(--t)',
                                }}
                              />
                            </button>
                          </td>
                        </tr>
                        {isHistoryOpen ? (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--bg-3)', padding: '16px 24px' }}>
                              <div style={{ padding: '4px 8px 12px 8px' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
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
                                        const initialAmount = initialContract?.amount ?? (row as any).initialPrice ?? (history.length > 0 ? 0 : amount);
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
                                            <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 800, color: history.length > 0 ? 'var(--tx-1)' : 'var(--green)' }}>{formatAmount(initialAmount)}</td>
                                            <td style={{ fontSize: '11px', padding: '8px 12px', fontWeight: 600 }}>Main Record</td>
                                            <td style={{ fontSize: '11px', padding: '8px 12px', color: 'var(--tx-4)' }}>—</td>
                                            <td style={{ fontSize: '11.5px', padding: '8px 12px', color: 'var(--tx-4)' }}>{row.notesRemarks || row.details || '—'}</td>
                                          </tr>
                                        );
                                      })()}
                                      {history.length === 0 ? (
                                        <tr>
                                          <td colSpan={9} style={{ textAlign: 'center', padding: '12px', color: 'var(--tx-4)', fontSize: '12px' }}>
                                            No previous renewal history found.
                                          </td>
                                        </tr>
                                      ) : (
                                        history
                                          .map((rh, idx) => ({ ...rh, sNo: idx + 2 }))
                                          .reverse()
                                          .map((rh, idx) => (
                                            <tr key={`${row.key}-history-${idx}`} style={{ background: 'transparent' }}>
                                              <td className="sno-col" style={{ fontSize: '11px', padding: '8px 12px' }}>{rh.sNo}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 700 }}>{rh.period}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.renewedOn)}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.startDate || rh.renewedOn)}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.expiryDate)}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 600 }}>{formatAmount(rh.amount)}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px' }}>{rh.paymentMethod || '—'}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{rh.invoiceNo || '—'}</td>
                                              <td
                                                style={{ fontSize: '11.5px', padding: '8px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={rh.notes}
                                              >
                                                {rh.notes || '—'}
                                              </td>
                                            </tr>
                                          ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─── CUSTOMER CALL LOG COMPONENT ────────────────
const CustomerCallLog: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [customerId]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-calls', customerId],
    queryFn: async () => {
      const res = await api.get('/calls', { params: { customer: customerId } });
      return res.data.data as any[];
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 24 }}>
        <div className="card card-table-sep">
          <div className="tbl-wrap">
            <table>
              <tbody>{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const calls = data || [];

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
          <span className="card-title">Recent Calls</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-blue">{calls.length} Total</span>
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
                  <th>Subject</th>
                  <th>Engineer</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--tx-4)', fontSize: 13 }}>
                      No call logs found for this customer.
                    </td>
                  </tr>
                ) : (
                  calls.map((c, i) => (
                    <tr key={c._id}>
                      <td className="sno-col">{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.subject}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{c.issueType}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{c.engineer?.name || '—'}</td>
                      <td><Badge status={c.status} /></td>
                      <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(c.callDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const CustomerTicketLog: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [customerId]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-tickets', customerId],
    queryFn: async () => {
      const res = await api.get('/tickets', { params: { customer: customerId } });
      return (res.data.data || []) as Ticket[];
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 24 }}>
        <div className="card card-table-sep">
          <div className="tbl-wrap">
            <table>
              <tbody>{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const tickets = data || [];

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
          <span className="card-title">Recent Tickets</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-blue">{tickets.length} Total</span>
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
                  <th>Ticket ID</th>
                  <th>Subject</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--tx-4)', fontSize: 13 }}>
                      No tickets found for this customer.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t, i) => (
                    <tr key={t._id}>
                      <td className="sno-col">{i + 1}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
                          {t.ticketNo}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{t.subject}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{t.category}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{typeof t.assignedTo === 'object' ? t.assignedTo?.name : '—'}</td>
                      <td><Badge status={t.status} /></td>
                      <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(t.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─── CUSTOMER AMC CONTRACT LOG COMPONENT ──────────
const CustomerAMCContractLog: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedAmcId, setExpandedAmcId] = useState<string | null>(null);

  useEffect(() => {
    setIsExpanded(true);
    setExpandedAmcId(null);
  }, [customerId]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-amc-contracts', customerId],
    queryFn: async () => {
      const res = await api.get('/amc', { params: { customer: customerId } });
      return (res.data.data || []) as AMC[];
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 24 }}>
        <div className="card card-table-sep">
          <div className="tbl-wrap">
            <table>
              <tbody>{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={8} />)}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const amcs = data || [];

  const toggleAmcHistory = (id: string) => {
    setExpandedAmcId((prev) => (prev === id ? null : id));
  };

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
          <span className="card-title">AMC Registry</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-blue">{amcs.length} Total</span>
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
                  <th>Product</th>
                  <th>Licence Type</th>
                  <th>Start Date</th>
                  <th>Expiry Date</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {amcs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--tx-4)', fontSize: 13 }}>
                      No AMC registry records found for this customer.
                    </td>
                  </tr>
                ) : (
                  amcs.map((amc, i) => {
                    const isHistoryOpen = expandedAmcId === amc._id;
                    return (
                      <React.Fragment key={amc._id}>
                        <tr>
                          <td className="sno-col">{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{amc.product || '—'}</td>
                          <td>{amc.licenceType || '—'}</td>
                          <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(amc.startDate)}</td>
                          <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{fmt.date(amc.expiryDate)}</td>
                          <td style={{ fontWeight: 600 }}>{fmt.currency(amc.amount)}</td>
                          <td><Badge status={amc.status} /></td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => toggleAmcHistory(amc._id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                height: 'auto',
                                minHeight: 'unset',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{isHistoryOpen ? 'Hide History' : 'View History'}</span>
                              <ChevronDown
                                size={12}
                                style={{
                                  transform: isHistoryOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform var(--t)'
                                }}
                              />
                            </button>
                          </td>
                        </tr>
                        {isHistoryOpen && (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--bg-3)', padding: '16px 24px' }}>
                              <div style={{ padding: '4px 8px 12px 8px' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
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
                                      {/* Current Active Contract Row */}
                                      <tr style={{ background: 'rgba(22, 163, 74, 0.04)' }}>
                                        <td className="sno-col" style={{ fontSize: '11px', padding: '8px 12px', fontWeight: 800, color: 'var(--tx-4)' }}>1</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 700, color: 'var(--green)' }}>Current</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', color: 'var(--tx-4)' }}>—</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(amc.startDate)}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt.date(amc.expiryDate)}</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 800, color: 'var(--green)' }}>{fmt.currency(amc.amount)}</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', fontWeight: 600 }}>Main Contract</td>
                                        <td style={{ fontSize: '11px', padding: '8px 12px', color: 'var(--tx-4)' }}>—</td>
                                        <td style={{ fontSize: '11.5px', padding: '8px 12px', color: 'var(--tx-4)' }}>—</td>
                                      </tr>
                                      {/* Renewal History Rows */}
                                      {(() => {
                                        const history = amc.renewalHistory || [];
                                        const filteredAndNumbered = history
                                          .map((rh, originalIdx) => ({ ...rh, originalIdx }))
                                          .filter((rh) => rh.period !== 'Initial Contract')
                                          .map((rh, idx) => ({ ...rh, sNo: idx + 2 }));

                                        return filteredAndNumbered
                                          .reverse()
                                          .map((rh) => (
                                            <tr key={rh.originalIdx} style={{ background: 'transparent' }}>
                                              <td className="sno-col" style={{ fontSize: '11px', padding: '8px 12px' }}>{rh.sNo}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 700 }}>{rh.period}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.renewedOn)}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.startDate || rh.renewedOn)}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt.date(rh.expiryDate)}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px', fontWeight: 600 }}>{fmt.currency(rh.amount)}</td>
                                              <td style={{ fontSize: '11.5px', padding: '8px 12px' }}>{rh.paymentMethod}</td>
                                              <td style={{ fontSize: '11px', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{rh.invoiceNo || '—'}</td>
                                              <td
                                                style={{ fontSize: '11.5px', padding: '8px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={rh.notes}
                                              >
                                                {rh.notes || '—'}
                                              </td>
                                            </tr>
                                          ));
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CustomersPage;
