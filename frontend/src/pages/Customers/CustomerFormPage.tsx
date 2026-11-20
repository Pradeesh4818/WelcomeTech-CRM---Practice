import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  SearchCheck,
  Cloud,
  Layers,
  Building2,
  Headphones,
  Rocket,
  ChevronDown,
  Users,
  Plus,
  User,
  Save,
  X,
  Clock,
  Trash2,
  Zap,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { InputField, SelectField, Spinner } from '../../components/ui';
import api from '../../utils/api';
import { Customer, Industry, BusinessSegment, IndustryType } from '../../types';
import { toAssetUrl } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { validatePhoneNumber, parsePhoneNumber } from '../../utils/phoneRules';
import './CustomerFormPage.css';

const cleanPhone = (val?: string): string => {
  const trimmed = String(val || '').trim();
  if (!trimmed) return '';
  const parsed = parsePhoneNumber(trimmed);
  return parsed.digits ? trimmed : '';
};

const MODULES = ['tdl', 'cloud', 'amc'] as const;
type ModuleId = typeof MODULES[number];
const DEFAULT_SERVICE_FORM_ORDER: ModuleId[] = ['amc'];
type SerialNoInfoItem = NonNullable<Customer['serialNoInfo']>[number];
type ServiceInstanceItem = NonNullable<Customer['services']>[number];
type LicenceStatus = NonNullable<SerialNoInfoItem['licenceStatus']>;
const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const textOrEmpty = (value: unknown): string => String(value || '').trim();
const dateInputValue = (value: unknown): string => value ? String(value).slice(0, 10) : '';
const firstLicenseSerial = (license?: SerialNoInfoItem): string =>
  textOrEmpty(license?.licenseSerialNo || license?.licenses?.[0]?.licenceSerialNo);
const LICENSE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'surrendered', label: 'Surrendered' },
  { value: 'terminated', label: 'Terminated' },
];
const SERVICE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'none', label: 'None' },
  { value: 'trial', label: 'Trial' },
];
const hasServicePricingDetails = (service: Partial<ServiceInstanceItem>): boolean =>
  ['actualPrice', 'discount', 'currentPrice', 'advance1', 'advance2'].some((field) => toNumberOrUndefined((service as any)[field]) !== undefined);

const createDefaultServiceInstance = (type: ModuleId, source: Partial<Customer>): ServiceInstanceItem => {
  const currentLicense = (source.serialNoInfo?.[0] || {}) as any;
  const isProductLicense = type === 'amc';
  const isCloudHub = type === 'cloud';
  const currentPricing = currentLicense?.pricingDetails || {};
  const server9SerialNo = textOrEmpty(currentLicense?.server9SerialNo);

  return {
    type,
    quantity: undefined,
    status: isCloudHub ? 'none' : 'active',
    companyType: 'head_office',
    companyName: source.name || '',
    address: source.address || '',
    startDate: '',
    endDate: '',
    product: isProductLicense ? (source.products?.[0] || currentLicense?.product || '') : undefined,
    releaseVersion: isProductLicense ? (currentLicense?.releaseVersion || '') : undefined,
    licenceType: isProductLicense ? (source.licenceType || currentLicense?.licenceType || '') : undefined,
    noOfUsers: (isProductLicense || isCloudHub) ? toNumberOrUndefined(currentLicense?.noOfUsers) : undefined,
    licenseSerialNo: isProductLicense ? (source.licenseSerialNo || firstLicenseSerial(currentLicense)) : (isCloudHub ? '' : undefined),
    licenceStatus: isProductLicense ? (currentLicense?.licenceStatus || currentLicense?.licenses?.[0]?.licenceStatus || 'active') : undefined,
    tssExpiryDate: isProductLicense ? (currentLicense?.tssExpiryDate ? String(currentLicense.tssExpiryDate).split('T')[0] : '') : undefined,
    isServer9: isProductLicense ? (source.companyInfo?.isServer9 === true || currentLicense?.isServer9 === true) : undefined,
    server9SerialNos: isProductLicense && (source.companyInfo?.isServer9 === true || currentLicense?.isServer9 === true)
      ? [{ serialNo: server9SerialNo }]
      : [],
    isTdl: isProductLicense ? (currentLicense?.isTdl === true || currentLicense?.tdlEnabled === true) : undefined,
    tdlSerialNos: isProductLicense && (currentLicense?.isTdl === true || currentLicense?.tdlEnabled === true)
      ? (currentLicense?.tdlSerialNos && currentLicense.tdlSerialNos.length > 0 ? currentLicense.tdlSerialNos : [{ serialNo: '' }])
      : [],
    isAmcActive: isProductLicense ? (source.amcStatus === 'active' || currentLicense?.isAmcActive === true) : undefined,
    contactPerson: isProductLicense ? (source.contact || source.keyContacts?.[0]?.contactName || '') : undefined,
    mobile: isProductLicense ? (source.phone || source.keyContacts?.[0]?.mobile || '') : undefined,
    email: isProductLicense ? (source.email || source.keyContacts?.[0]?.email || '') : undefined,
    vendorCategory: isProductLicense
      ? ((source.services || []).find((s) => s.type === type)?.vendorCategory || currentLicense?.contactDetails?.vendorCategory || source.amcDetails?.vendorCategory || source.tssDetails?.vendorCategory || '')
      : undefined,
    amcValue: isProductLicense ? source.amcDetails?.value : undefined,
    actualPrice: isProductLicense ? currentPricing.actualPrice : undefined,
    discount: isProductLicense ? currentPricing.discount : undefined,
    currentPrice: isProductLicense ? currentPricing.currentPrice : undefined,
    advance1: isProductLicense ? currentPricing.advance1 : undefined,
    advance2: isProductLicense ? currentPricing.advance2 : undefined,
    showPricing: isProductLicense ? hasServicePricingDetails(currentPricing) : false,
    vendor: isCloudHub ? '' : undefined,
    domainLinkSubId: isCloudHub ? '' : undefined,
    users: isCloudHub ? [{ username: '', userDetail: '', userLocation: '' }] : undefined,
  };
};

const hasMeaningfulServiceData = (service: Partial<ServiceInstanceItem>): boolean => {
  if (service._id) return true;

  const textFields = [
    service.product,
    service.releaseVersion,
    service.licenceType,
    service.licenseSerialNo,
    service.companyName,
    service.address,
    service.details,
    service.contactPerson,
    service.mobile,
    service.email,
    service.notesRemarks,
    service.vendor,
    service.vendorCategory,
    service.domainLinkSubId,
    service.release,
    service.salesman1,
    service.salesman2,
    service.tssExpiryDate,
  ];
  const hasUserDetails = (service.users || []).some((user) =>
    textOrEmpty(user?.username) || textOrEmpty(user?.userDetail) || textOrEmpty(user?.userLocation)
  );
  const hasNumberDetails = [service.noOfDays, service.noOfUsers, service.amcValue].some((value) => toNumberOrUndefined(value) !== undefined);
  const statusMarksEnabledService = service.type !== 'amc' && textOrEmpty(service.status) !== '' && textOrEmpty(service.status) !== 'none';

  return Boolean(
    textFields.some(textOrEmpty) ||
    hasNumberDetails ||
    hasUserDetails ||
    hasServicePricingDetails(service) ||
    statusMarksEnabledService ||
    service.isServer9 ||
    service.isTdl ||
    service.isAmcActive
  );
};

const CustomerFormPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const serviceIcons: Record<ModuleId, React.ReactNode> = {
    tdl: <ShieldCheck size={24} />,
    cloud: <Cloud size={24} />,
    amc: <Layers size={24} />,
  };

  const serviceTitles: Record<ModuleId, string> = {
    tdl: 'TDL Add-ons',
    cloud: 'Cloud Hub',
    amc: 'Product & License',
  };


  const [openServiceIdx, setOpenServiceIdx] = useState<number | null>(0);
  const [activeModuleSelection, setActiveModuleSelection] = useState<ModuleId | null>('amc');
  const [amcExpanded, setAmcExpanded] = useState(false);
  const [tdlExpanded, setTdlExpanded] = useState(false);
  const [cloudExpanded, setCloudExpanded] = useState(false);
  const [branchesExpanded, setBranchesExpanded] = useState(false);


  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [agreementCopyFile, setAgreementCopyFile] = useState<File | null>(null);

  const toggleServicePanel = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenServiceIdx(prev => prev === idx ? null : idx);
  };

  const [form, setForm] = useState<Partial<Customer>>({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    industry: '',
    products: [],
    licenceType: '',
    users: 1,
    amcStatus: 'none',
    customerType: [],
    isActive: true,
    serialNoInfo: [],
    amcDetails: {},
    tdlDetails: {},
    cloudDetails: {},
    branches: [],
    partnerDetails: [{ companyName: '', fullName: '', email: '', phone: '', address: '', service: '' }],
    groupCompanies: [],
    services: [],
    companyInfo: {},
    keyContacts: [{ contactName: '', designation: '', mobile: '', whatsapp: '', email: '', contactPreference: '', landline: '' }],
  });

  const hasAmc = (form.services || []).some(s => s.type === 'amc' && s.isAmcActive);
  const hasTdl = (form.services || []).some(s => s.type === 'tdl');
  const hasCloud = (form.services || []).some(s => s.type === 'cloud');
  const hasBranches = (form.branches || []).length > 0;

  const handleBranchesToggle = (active: boolean) => {
    setForm(prev => {
      if (active) {
        if ((prev.branches || []).length === 0) {
          return { ...prev, branches: [{ branchName: '', locationArea: '', area: '', fullAddress: '', website: '', websiteStatus: 'Active', contactPerson: '', mobile: '', email: '' }] };
        }
      } else {
        return { ...prev, branches: [] };
      }
      return prev;
    });
    if (active) setBranchesExpanded(true);
  };

  const handleAmcToggle = (active: boolean) => {
    setForm(prev => {
      let services = [...(prev.services || [])];
      if (active && !services.some((s) => s.type === 'amc')) {
        services = [createDefaultServiceInstance('amc', prev), ...services];
        setOpenServiceIdx(0);
      }
      services = services.map((s) => {
        if (s.type === 'amc') {
          return { ...s, isAmcActive: active, status: active ? (s.status === 'none' ? 'active' : s.status || 'active') : s.status };
        }
        return s;
      });
      return { ...prev, services };
    });
    if (active) setAmcExpanded(true);
  };

  const handleTdlToggle = (active: boolean) => {
    setForm(prev => {
      let services = prev.services || [];
      if (active) {
        if (!services.some(s => s.type === 'tdl')) {
          services = [...services, createDefaultServiceInstance('tdl', prev)];
        }
      } else {
        services = services.filter(s => s.type !== 'tdl');
      }
      return { ...prev, services };
    });
    if (active) setTdlExpanded(true);
  };

  const handleCloudToggle = (active: boolean) => {
    setForm(prev => {
      let services = prev.services || [];
      if (active) {
        if (!services.some(s => s.type === 'cloud')) {
          services = [...services, { ...createDefaultServiceInstance('cloud', prev), status: 'active' }];
        }
      } else {
        services = services.filter(s => s.type !== 'cloud');
      }
      return { ...prev, services };
    });
    if (active) setCloudExpanded(true);
  };

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`).then((res) => res.data?.data as Customer),
    enabled: isEdit,
  });


  const { data: productsFromApi, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: 500 } });
      return (res.data?.data || []) as Array<{ name: string; releaseVersion?: string }>;
    },
  });
  const { data: licenceTypesFromApi, isLoading: isLoadingLicenceTypes } = useQuery({
    queryKey: ['licence-types', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/licence-types', { params: { limit: 500 } });
      return ((res.data?.data || []) as Array<{ name?: string }>)
        .map((lt) => (lt.name || '').trim())
        .filter(Boolean);
    },
  });

  const { data: customerTypesFromApi, isLoading: isLoadingCustomerTypes } = useQuery({
    queryKey: ['customer-types', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/customer-types', { params: { limit: 500, isActive: true } });
      return (res.data?.data || []) as Array<{ _id: string; name: string }>;
    },
  });

  const { data: vendorCategoriesFromApi, isLoading: isLoadingVendorCategories } = useQuery({
    queryKey: ['vendor-categories', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/vendor-categories', { params: { limit: 500, isActive: true } });
      return (res.data?.data || []) as Array<{ _id: string; name: string }>;
    },
  });

  const { data: industriesFromApi, isLoading: isLoadingIndustries } = useQuery({
    queryKey: ['industries', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/industries', { params: { limit: 500, isActive: true } });
      return (res.data?.data || []) as Industry[];
    },
  });

  const { data: businessSegmentsFromApi, isLoading: isLoadingBusinessSegments } = useQuery({
    queryKey: ['business-segments', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/business-segments', { params: { limit: 500, isActive: true } });
      return (res.data?.data || []) as BusinessSegment[];
    },
  });

  const { data: industryTypesFromApi, isLoading: isLoadingIndustryTypes } = useQuery({
    queryKey: ['industry-types', 'customer-form'],
    queryFn: async () => {
      const res = await api.get('/industry-types', { params: { limit: 500, isActive: true } });
      return (res.data?.data || []) as IndustryType[];
    },
  });

  const selectedBusinessSegment = String(form.companyInfo?.businessSegment || '').trim();

  const businessSegmentOptions = useMemo(() => {
    const apiValues = (businessSegmentsFromApi || []).map((bs) => String(bs.name || '').trim()).filter(Boolean);
    const unique = Array.from(new Set([...apiValues, ...(selectedBusinessSegment ? [selectedBusinessSegment] : [])]));
    return unique.map((val) => ({ value: val, label: val }));
  }, [businessSegmentsFromApi, selectedBusinessSegment]);

  const selectedIndustryType = String(form.companyInfo?.industryType || '').trim();

  const industryTypeOptions = useMemo(() => {
    const apiValues = (industryTypesFromApi || []).map((it) => String(it.name || '').trim()).filter(Boolean);
    const unique = Array.from(new Set([...apiValues, ...(selectedIndustryType ? [selectedIndustryType] : [])]));
    return unique.map((val) => ({ value: val, label: val }));
  }, [industryTypesFromApi, selectedIndustryType]);

  const primaryLicenseInfo = form.serialNoInfo?.[0];

  const productOptions = useMemo(() => {
    const selected = [
      ...(form.products || []),
      primaryLicenseInfo?.product,
    ].map((p) => String(p || '').trim()).filter(Boolean);
    const apiValues = (productsFromApi || []).map((p) => String(p.name || '').trim()).filter(Boolean);
    return Array.from(new Set([...apiValues, ...selected]));
  }, [productsFromApi, form.products, primaryLicenseInfo?.product]);

  const licenceTypeOptions = useMemo(() => {
    const selected = [
      String(form.licenceType || '').trim(),
      String(form.serialNoInfo?.[0]?.licenceType || '').trim(),
    ].filter(Boolean);
    const apiValues = (licenceTypesFromApi || []).map((lt) => String(lt || '').trim()).filter(Boolean);
    return Array.from(new Set([...apiValues, ...selected]));
  }, [licenceTypesFromApi, form.licenceType, form.serialNoInfo?.[0]?.licenceType]);

  const partnerOptions = useMemo(() => {
    const fromApi = (vendorCategoriesFromApi || []).map((v) => String(v.name || '').trim()).filter(Boolean);
    const fromServices = (form.services || []).map((s) => String(s.vendorCategory || '').trim()).filter(Boolean);
    const fromPartners = (form.partnerDetails || []).map((p) => String(p.companyName || '').trim()).filter(Boolean);
    const defaults = ['welcome', 'Welcome Tech', 'Inox Qatar', 'Al Asna Trading & Service.', 'Doha Computer', 'Prime Solutions'];
    const unique = Array.from(new Set([...defaults, ...fromApi, ...fromServices, ...fromPartners]));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [vendorCategoriesFromApi, form.services, form.partnerDetails]);

  const selectedIndustryName = String(form.industry || form.companyInfo?.industry || '').trim();
  const selectedIndustryGroup = String(form.companyInfo?.industryGroup || '').trim();

  const industryOptions = useMemo(() => {
    const apiValues = (industriesFromApi || []).map((ind) => String(ind.name || '').trim()).filter(Boolean);
    const unique = Array.from(new Set([...apiValues, ...(selectedIndustryName ? [selectedIndustryName] : [])]));
    return unique.map((val) => ({ value: val, label: val }));
  }, [industriesFromApi, selectedIndustryName]);

  const industryGroupOptions = useMemo(() => {
    if (!selectedIndustryName) {
      return selectedIndustryGroup ? [{ value: selectedIndustryGroup, label: selectedIndustryGroup }] : [];
    }
    const matched = (industriesFromApi || []).find(
      (ind) => ind.name.trim().toLowerCase() === selectedIndustryName.toLowerCase()
    );
    const groups = (matched?.industryGroups || []).map((g) => String(g || '').trim()).filter(Boolean);
    const unique = Array.from(new Set([...groups, ...(selectedIndustryGroup ? [selectedIndustryGroup] : [])]));
    return unique.map((val) => ({ value: val, label: val }));
  }, [industriesFromApi, selectedIndustryName, selectedIndustryGroup]);

  const handleIndustryChange = (val: string) => {
    updateField('industry', val);
    updateNestedField('companyInfo', 'industry', val);

    const matched = (industriesFromApi || []).find(
      (ind) => ind.name.trim().toLowerCase() === val.trim().toLowerCase()
    );
    const validGroups = (matched?.industryGroups || []).map((g) => g.trim().toLowerCase());
    const currentGrp = String(form.companyInfo?.industryGroup || '').trim().toLowerCase();
    if (currentGrp && !validGroups.includes(currentGrp)) {
      updateNestedField('companyInfo', 'industryGroup', '');
    }
  };

  // --- Helpers for cleaner state updates ---
  const updateField = (field: keyof Customer, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateNestedField = <K extends keyof Customer>(
    category: K,
    field: string,
    value: any
  ) => {
    setForm(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] as any || {}),
        [field]: value
      }
    }));
  };

  const updateArrayField = <K extends keyof Customer>(
    category: K,
    index: number,
    field: string,
    value: any
  ) => {
    setForm(prev => {
      const arr = [...(prev[category] as any[] || [])];
      arr[index] = { ...(arr[index] || {}), [field]: value };
      return { ...prev, [category]: arr };
    });
  };

  const removeArrayItem = <K extends keyof Customer>(category: K, index: number) => {
    setForm(prev => ({
      ...prev,
      [category]: (prev[category] as any[] || []).filter((_, i) => i !== index)
    }));
  };

  const addArrayItem = <K extends keyof Customer>(category: K, defaultValue: any) => {
    setForm(prev => ({
      ...prev,
      [category]: [...(prev[category] as any[] || []), defaultValue]
    }));
  };

  const getServicePricingDetails = (service: Partial<ServiceInstanceItem>) => {
    const actualPrice = toNumberOrUndefined(service.actualPrice);
    const discount = toNumberOrUndefined(service.discount);
    const currentPrice = toNumberOrUndefined(service.currentPrice);
    const advance1 = toNumberOrUndefined(service.advance1);
    const advance2 = toNumberOrUndefined(service.advance2);

    if ([actualPrice, discount, currentPrice, advance1, advance2].every((v) => v === undefined)) {
      return undefined;
    }

    return {
      actualPrice,
      discount,
      currentPrice,
      advance1,
      advance2,
      remainingTotal: (currentPrice || 0) - (advance1 || 0) - (advance2 || 0),
    };
  };

  const syncPrimaryLicensingServiceState = (
    prev: Partial<Customer>,
    services: ServiceInstanceItem[],
    index: number
  ): Partial<Customer> => {
    const service = services[index] as ServiceInstanceItem | undefined;
    if (!service || service.type !== 'amc' || index !== (prev.services || []).findIndex((s) => s.type === 'amc')) {
      return { ...prev, services };
    }

    const serialNoInfo = [...(prev.serialNoInfo || [])];
    const currentLicense = (serialNoInfo[0] || {}) as any;
    const licenseSerialNo = textOrEmpty(service.licenseSerialNo || currentLicense.licenseSerialNo || currentLicense.licenses?.[0]?.licenceSerialNo);
    const licenceStatus = (service.licenceStatus || currentLicense.licenceStatus || currentLicense.licenses?.[0]?.licenceStatus || 'active') as LicenceStatus;
    const server9SerialNo = textOrEmpty(service.server9SerialNos?.[0]?.serialNo || currentLicense.server9SerialNo);
    const noOfUsers = toNumberOrUndefined(service.noOfUsers) || toNumberOrUndefined(currentLicense.noOfUsers) || 1;
    const pricingDetails = getServicePricingDetails(service);
    const nestedLicenses = [...(currentLicense.licenses || [])];

    if (licenseSerialNo || service.licenceStatus || nestedLicenses.length > 0) {
      nestedLicenses[0] = {
        ...(nestedLicenses[0] || {}),
        licenceSerialNo: licenseSerialNo,
        licenceStatus,
      };
    }

    serialNoInfo[0] = {
      ...currentLicense,
      product: textOrEmpty(service.product) || currentLicense.product,
      releaseVersion: textOrEmpty(service.releaseVersion) || currentLicense.releaseVersion,
      licenceType: textOrEmpty(service.licenceType) || currentLicense.licenceType,
      noOfUsers,
      startDate: service.startDate || currentLicense.startDate,
      endDate: service.endDate || currentLicense.endDate,
      tssExpiryDate: service.tssExpiryDate || currentLicense.tssExpiryDate,
      licenseSerialNo: licenseSerialNo || currentLicense.licenseSerialNo,
      licenceStatus,
      isServer9: service.isServer9 === true,
      server9SerialNo: service.isServer9 ? server9SerialNo : undefined,
      isTdl: service.isTdl === true,
      tdlSerialNos: service.isTdl ? service.tdlSerialNos : [],
      isAmcActive: service.isAmcActive === true,
      companyName: textOrEmpty(service.companyName) || currentLicense.companyName,
      address: textOrEmpty(service.address) || currentLicense.address,
      contactDetails: {
        ...(currentLicense.contactDetails || {}),
        branchName: textOrEmpty(service.companyName) || currentLicense.contactDetails?.branchName,
        locationArea: textOrEmpty(service.address) || currentLicense.contactDetails?.locationArea,
        contactPerson: textOrEmpty(service.contactPerson) || currentLicense.contactDetails?.contactPerson,
        mobile: textOrEmpty(service.mobile) || currentLicense.contactDetails?.mobile,
        vendorCategory: textOrEmpty(service.vendorCategory) || currentLicense.contactDetails?.vendorCategory,
      },
      ...(nestedLicenses.length > 0 ? { licenses: nestedLicenses } : {}),
      ...(pricingDetails ? { pricingDetails: { ...(currentLicense.pricingDetails || {}), ...pricingDetails } } : {}),
    };

    return {
      ...prev,
      services,
      products: service.product ? [service.product] : (prev.products || []),
      licenceType: service.licenceType || prev.licenceType || '',
      users: noOfUsers,
      licenseSerialNo: licenseSerialNo || prev.licenseSerialNo,
      amcStatus: service.isAmcActive ? 'active' : (prev.amcStatus || 'none'),
      companyInfo: {
        ...(prev.companyInfo || {}),
        releaseVersion: service.releaseVersion || prev.companyInfo?.releaseVersion,
        isServer9: service.isServer9 === true,
      },
      amcDetails: service.isAmcActive ? {
        ...(prev.amcDetails || {}),
        status: service.status || prev.amcDetails?.status || 'active',
        vendorCategory: textOrEmpty(service.vendorCategory) || prev.amcDetails?.vendorCategory,
        companyName: textOrEmpty(service.companyName) || prev.amcDetails?.companyName || prev.name || '',
        address: textOrEmpty(service.address) || prev.amcDetails?.address || prev.address || '',
        contactPerson: textOrEmpty(service.contactPerson) || prev.amcDetails?.contactPerson || prev.contact || '',
        mobile: textOrEmpty(service.mobile) || prev.amcDetails?.mobile || prev.phone || '',
        email: textOrEmpty(service.email) || prev.amcDetails?.email || prev.email || '',
        details: textOrEmpty(service.details) || prev.amcDetails?.details,
        salesman1: textOrEmpty(service.salesman1) || prev.amcDetails?.salesman1,
        salesman2: textOrEmpty(service.salesman2) || prev.amcDetails?.salesman2,
        startDate: service.startDate || prev.amcDetails?.startDate,
        endDate: service.endDate || prev.amcDetails?.endDate,
        value: toNumberOrUndefined(service.amcValue) ?? prev.amcDetails?.value,
      } : prev.amcDetails,
      serialNoInfo,
    };
  };

  // --- Service Instance Helpers ---
  const addServiceInstance = (type: ModuleId) => {
    setForm(prev => {
      const newServices = [
        ...(prev.services || []),
        createDefaultServiceInstance(type, prev)
      ];
      setOpenServiceIdx(newServices.length - 1);
      return { ...prev, services: newServices };
    });
  };

  const removeServiceInstance = (index: number) => {
    setForm(prev => ({
      ...prev,
      services: (prev.services || []).filter((_, i) => i !== index)
    }));
  };

  const updateServiceInstance = (index: number, field: string, value: any) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      if (!services[index]) return prev;

      const updatedService = { ...services[index], [field]: value } as ServiceInstanceItem;
      if (field === 'isServer9') {
        updatedService.server9SerialNos = value
          ? ((updatedService.server9SerialNos && updatedService.server9SerialNos.length > 0) ? updatedService.server9SerialNos : [{ serialNo: '' }])
          : [];
      }

      services[index] = updatedService;
      return syncPrimaryLicensingServiceState(prev, services, index);
    });
  };

  const updateServiceInstanceNestedArray = (sIdx: number, arrayField: string, aIdx: number, field: string, value: any) => {
    setForm(prev => {
      const services = [...(prev.services || [])];
      const s = { ...services[sIdx] };
      const arr = [...(s[arrayField as keyof typeof s] as any[] || [])];
      arr[aIdx] = { ...(arr[aIdx] || {}), [field]: value };
      (s as any)[arrayField] = arr;
      services[sIdx] = s;
      return { ...prev, services };
    });
  };

  const addServiceInstanceNestedArray = (sIdx: number, arrayField: string, defaultValue: any) => {
    setForm(prev => {
      const services = [...(prev.services || [])];
      const s = { ...services[sIdx] };
      const arr = [...(s[arrayField as keyof typeof s] as any[] || []), defaultValue];
      (s as any)[arrayField] = arr;
      services[sIdx] = s;
      return { ...prev, services };
    });
  };

  const removeServiceInstanceNestedArray = (sIdx: number, arrayField: string, aIdx: number) => {
    setForm(prev => {
      const services = [...(prev.services || [])];
      const s = { ...services[sIdx] };
      const arr = (s[arrayField as keyof typeof s] as any[] || []).filter((_, i) => i !== aIdx);
      (s as any)[arrayField] = arr;
      services[sIdx] = s;
      return { ...prev, services };
    });
  };

  const updateServiceServer9SerialNo = (sIdx: number, rowIdx: number, value: string) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      const rows = [...(s.server9SerialNos || [{ serialNo: '' }])];
      rows[rowIdx] = { ...(rows[rowIdx] || {}), serialNo: value };
      s.server9SerialNos = rows;
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const addServiceServer9SerialNo = (sIdx: number) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      s.server9SerialNos = [...(s.server9SerialNos || []), { serialNo: '' }];
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const removeServiceServer9SerialNo = (sIdx: number, rowIdx: number) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      const rows = (s.server9SerialNos || []).filter((_, i) => i !== rowIdx);
      s.server9SerialNos = rows.length > 0 ? rows : [{ serialNo: '' }];
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const updateServiceTdlSerialNo = (sIdx: number, rowIdx: number, value: string) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      const rows = [...(s.tdlSerialNos || [{ serialNo: '' }])];
      rows[rowIdx] = { ...(rows[rowIdx] || {}), serialNo: value };
      s.tdlSerialNos = rows;
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const addServiceTdlSerialNo = (sIdx: number) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      s.tdlSerialNos = [...(s.tdlSerialNos || []), { serialNo: '' }];
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const removeServiceTdlSerialNo = (sIdx: number, rowIdx: number) => {
    setForm(prev => {
      const services = [...(prev.services || [])] as ServiceInstanceItem[];
      const s = { ...services[sIdx] };
      const rows = (s.tdlSerialNos || []).filter((_, i) => i !== rowIdx);
      s.tdlSerialNos = rows.length > 0 ? rows : [{ serialNo: '' }];
      services[sIdx] = s;
      return syncPrimaryLicensingServiceState(prev, services, sIdx);
    });
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Profile picture must be 2MB or less.');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const clearSelectedAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview('');
  };

  const avatarPreviewUrl = avatarPreview || toAssetUrl(form.avatar);

  useEffect(() => {
    if (!customer) return;

    setAvatarFile(null);
    setAvatarPreview('');
    const synthesizedServices: ServiceInstanceItem[] = [];
    if (customer.amcDetails && (customer.amcDetails.status || customer.amcDetails.currentPrice || customer.amcStatus === 'active')) {
      synthesizedServices.push({
        ...createDefaultServiceInstance('amc', customer),
        ...customer.amcDetails,
        type: 'amc',
        quantity: 1,
        isAmcActive: customer.amcStatus === 'active' || customer.amcDetails.status === 'active',
      });
    }
    if (customer.tdlDetails && (customer.tdlDetails.status || customer.tdlDetails.currentPrice)) {
      synthesizedServices.push({
        ...createDefaultServiceInstance('tdl', customer),
        ...customer.tdlDetails,
        type: 'tdl',
        quantity: 1,
      });
    }
    if (customer.cloudDetails && (customer.cloudDetails.status || customer.cloudDetails.currentPrice)) {
      synthesizedServices.push({
        ...createDefaultServiceInstance('cloud', customer),
        ...customer.cloudDetails,
        type: 'cloud',
        quantity: 1,
      });
    }

    const rawServices = customer.services && customer.services.length > 0
      ? customer.services
      : synthesizedServices;
    // Normalize on load: TSS vendorCategory must always match AMC's vendorCategory.
    // Also resolve legacy partner names stored in amc.companyName (from legacy forms where Partner Details was bound to companyName).
    const amcService = rawServices.find((s) => s.type === 'amc');
    const custName = (customer.name || '').trim().toLowerCase();
    const amcCompanyName = (amcService?.companyName || '').trim();
    const amcPartnerFromCompany = (amcCompanyName && amcCompanyName.toLowerCase() !== custName)
      ? amcCompanyName
      : undefined;

    const rawAmcVendor = (amcService?.vendorCategory || '').trim();
    const amcVendor = (rawAmcVendor && rawAmcVendor.toLowerCase() !== 'welcome')
      ? rawAmcVendor
      : (amcPartnerFromCompany || rawAmcVendor);

    // Ensure all physical licenses (including standalone TSS licenses without an AMC record)
    // are represented in the Product & License (amc) instance list so none are hidden.
    const existingAmcSerials = new Set(
      rawServices
        .filter((s) => s.type === 'amc')
        .map((s) => String(s.licenseSerialNo || '').trim())
        .filter(Boolean)
    );
    const standaloneTssMap = new Map<string, ServiceInstanceItem>();
    rawServices
      .filter((s) => s.type === 'tss' && s.licenseSerialNo && !existingAmcSerials.has(String(s.licenseSerialNo).trim()))
      .forEach((s) => {
        const ser = String(s.licenseSerialNo).trim();
        const existing = standaloneTssMap.get(ser);
        if (!existing) {
          standaloneTssMap.set(ser, s);
        } else {
          const tNew = new Date(s.endDate || s.tssExpiryDate || 0).getTime();
          const tOld = new Date(existing.endDate || existing.tssExpiryDate || 0).getTime();
          if (tNew > tOld) standaloneTssMap.set(ser, s);
        }
      });

    const synthesizedTssAmc: ServiceInstanceItem[] = Array.from(standaloneTssMap.values()).map((tss) => ({
      ...createDefaultServiceInstance('amc', customer),
      type: 'amc',
      product: tss.product || customer.products?.[0] || 'TallyPrime Silver',
      releaseVersion: tss.releaseVersion || tss.release || '',
      licenceType: tss.licenceType || (String(tss.product || '').toLowerCase().includes('gold') ? 'Gold' : 'Silver'),
      licenseSerialNo: tss.licenseSerialNo,
      licenceStatus: tss.licenceStatus || (tss.status === 'expired' ? 'expired' : 'active'),
      status: (tss.status === 'expired' ? 'expired' : 'none') as ServiceInstanceItem['status'],
      isAmcActive: false,
      tssExpiryDate: tss.endDate || tss.tssExpiryDate,
      contactPerson: tss.contactPerson,
      mobile: tss.mobile,
      email: tss.email,
      vendorCategory: tss.vendorCategory || amcVendor,
      companyName: tss.companyName,
      address: tss.address,
      notesRemarks: tss.notesRemarks,
      _id: tss._id,
    }));

    const services = [...rawServices, ...synthesizedTssAmc].map((s) => {
      if (s.type === 'amc') {
        const serKey = String(s.licenseSerialNo || '').trim().toLowerCase();
        let latestTssDate = s.tssExpiryDate;
        let latestTime = latestTssDate ? new Date(latestTssDate).getTime() : 0;

        if (serKey) {
          rawServices
            .filter((t) => t.type === 'tss' && String(t.licenseSerialNo || '').trim().toLowerCase() === serKey)
            .forEach((t) => {
              const d = t.endDate || t.tssExpiryDate;
              const time = d ? new Date(d).getTime() : 0;
              if (time > latestTime) {
                latestTime = time;
                latestTssDate = d;
              }
            });

          if (customer.tssDetails?.licenseSerialNo && String(customer.tssDetails.licenseSerialNo).trim().toLowerCase() === serKey) {
            const d = customer.tssDetails.endDate || (customer.tssDetails as any).tssExpiryDate;
            const time = d ? new Date(d).getTime() : 0;
            if (time > latestTime) {
              latestTime = time;
              latestTssDate = d;
            }
          }
        }

        return {
          ...s,
          tssExpiryDate: latestTssDate,
          vendorCategory: (amcVendor && (!s.vendorCategory || s.vendorCategory.toLowerCase() === 'welcome'))
            ? amcVendor
            : s.vendorCategory,
        };
      }
      if (s.type === 'tss' && amcVendor) {
        return { ...s, vendorCategory: amcVendor };
      }
      return s;
    });

    const baseForm = {
      ...customer,
      services,
      serialNoInfo: Array.isArray(customer.serialNoInfo) ? customer.serialNoInfo : (customer.serialNoInfo ? [customer.serialNoInfo] : []),
      amcDetails: customer.amcDetails || {},
      tdlDetails: customer.tdlDetails || {},
      cloudDetails: customer.cloudDetails || {},
      tssDetails: customer.tssDetails || {},
      branches: (customer.branches && customer.branches.length > 0) ? customer.branches : [],
      partnerDetails: (customer.partnerDetails && customer.partnerDetails.length > 0) ? customer.partnerDetails : [{ companyName: '', fullName: '', email: '', phone: '', address: '', service: '' }],
      groupCompanies: (customer.groupCompanies && customer.groupCompanies.length > 0)
        ? customer.groupCompanies
        : (customer.companyInfo?.groupOfCompany && customer.companyInfo.groupOfCompany.trim() !== 'NO' && customer.companyInfo.groupOfCompany.trim() !== 'No' && customer.companyInfo.groupOfCompany.trim() !== '—')
        ? [{ name: customer.companyInfo.groupOfCompany.trim() }]
        : [],
    };

    const synthesizedContacts = (customer.keyContacts && customer.keyContacts.length > 0)
      ? customer.keyContacts
      : [
          ...(customer.primaryContactInfo?.contactName1 ? [{
            contactName: customer.primaryContactInfo.contactName1,
            designation: customer.primaryContactInfo.designation,
            mobile: customer.primaryContactInfo.mobile,
            whatsapp: customer.primaryContactInfo.whatsapp,
            email: customer.primaryContactInfo.email,
            contactPreference: customer.primaryContactInfo.contactPreference,
            landline: customer.primaryContactInfo.landline,
          }] : []),
          ...(customer.secondaryContactInfo?.contactName2 ? [{
            contactName: customer.secondaryContactInfo.contactName2,
            designation: customer.secondaryContactInfo.designation,
            mobile: customer.secondaryContactInfo.mobile,
            whatsapp: customer.secondaryContactInfo.whatsapp,
            email: customer.secondaryContactInfo.email,
          }] : [])
        ];

    setForm({
      ...baseForm,
      phone: cleanPhone(baseForm.phone),
      keyContacts: synthesizedContacts.length > 0
        ? synthesizedContacts
        : [{ contactName: '', designation: '', mobile: '', whatsapp: '', email: '', contactPreference: '', landline: '' }]
    });

    setAmcExpanded(services.some(s => s.type === 'amc' && s.isAmcActive));
    setTdlExpanded(services.some(s => s.type === 'tdl'));
    setCloudExpanded(services.some(s => s.type === 'cloud'));
  }, [customer]);

  useEffect(() => {
    if (isEdit) return;

    setForm((prev) => {
      const services = prev.services || [];
      const missingDefaultServices = DEFAULT_SERVICE_FORM_ORDER.filter(
        (type) => !services.some((service) => service.type === type)
      );

      if (missingDefaultServices.length === 0) return prev;

      const nextServices = [
        ...services,
        ...missingDefaultServices.map((type) => createDefaultServiceInstance(type, prev)),
      ];
      const activeIndex = nextServices.findIndex((service) => service.type === activeModuleSelection);
      setOpenServiceIdx(activeIndex !== -1 ? activeIndex : 0);

      return { ...prev, services: nextServices };
    });
  }, [activeModuleSelection, isEdit]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleAgreementCopyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ALLOWED = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/webp',
    ];
    if (!ALLOWED.includes(file.type)) {
      toast.error('Please upload a PDF, Word document, or image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Agreement copy must be 10MB or less.');
      return;
    }
    setAgreementCopyFile(file);
  };

  useEffect(() => {
    const count = (form.serialNoInfo || []).reduce((acc, p) => acc + (p.licenses?.length || 0), 0);
    if (count > 0 && !toNumberOrUndefined(form.users)) {
      setForm(prev => ({
        ...prev,
        users: count
      }));
    }
  }, [form.serialNoInfo, form.users]);

  const getRemainingBalance = (s: any) => {
    const current = toNumberOrUndefined(s.currentPrice) || 0;
    const a1 = toNumberOrUndefined(s.advance1) || 0;
    const a2 = toNumberOrUndefined(s.advance2) || 0;
    if (!s.currentPrice && !s.advance1 && !s.advance2) return '0';
    return String(current - a1 - a2);
  };



  useEffect(() => {
    if (isEdit) return;

    const productSet = new Set(productOptions);
    const licenceSet = new Set(licenceTypeOptions);
    const currentProduct = String(form.products?.[0] || '').trim();
    const currentLicence = String(form.licenceType || '').trim();

    const shouldClearProduct = !!currentProduct && !productSet.has(currentProduct);
    const shouldClearLicence = !!currentLicence && !licenceSet.has(currentLicence);

    if (!shouldClearProduct && !shouldClearLicence) return;

    setForm((prev) => ({
      ...prev,
      products: shouldClearProduct ? [] : (prev.products || []),
      licenceType: shouldClearLicence ? '' : (prev.licenceType || ''),
      serialNoInfo: (prev.serialNoInfo || []).map((p, idx) => idx === 0 ? {
        ...p,
        licenceType: shouldClearLicence ? undefined : p.licenceType,
      } : p),
    }));
  }, [isEdit, productOptions, licenceTypeOptions, form.products, form.licenceType]);

  const buildPayload = (): Partial<Customer> => {
    const licenseRows = [...(form.serialNoInfo || [])];
    const firstLicense = (licenseRows[0] || {}) as any;
    const product = textOrEmpty(form.products?.[0] || firstLicense.product);
    const releaseVersion = textOrEmpty(firstLicense.releaseVersion || form.companyInfo?.releaseVersion);
    const licenceType = textOrEmpty(form.licenceType || firstLicense.licenceType);
    const startDate = dateInputValue(form.startDate || firstLicense.startDate);
    const endDate = dateInputValue(form.endDate || firstLicense.endDate);
    const tssExpiryDate = dateInputValue(firstLicense.tssExpiryDate);
    const licenseSerialNo = textOrEmpty(form.licenseSerialNo || firstLicenseSerial(firstLicense));
    const nestedLicenseCount = licenseRows.reduce((acc, p) => acc + (p.licenses?.length || 0), 0);
    const rawUsers =
      toNumberOrUndefined(form.users) ??
      toNumberOrUndefined(firstLicense.noOfUsers) ??
      (nestedLicenseCount > 0 ? nestedLicenseCount : 1);
    const users = rawUsers > 0 ? rawUsers : 1;
    const isServer9 = form.companyInfo?.isServer9 === true || firstLicense.isServer9 === true;
    const isTdl = firstLicense.isTdl === true;
    const isAmcActive = form.amcStatus === 'active' || firstLicense.isAmcActive === true;
    const hasPrimaryLicenseInfo = Boolean(
      product || releaseVersion || licenceType || startDate || endDate || tssExpiryDate || licenseSerialNo || isServer9 || isTdl || isAmcActive
    );

    if (hasPrimaryLicenseInfo) {
      const nestedLicenses = [...(firstLicense.licenses || [])];
      if (licenseSerialNo) {
        nestedLicenses[0] = {
          ...(nestedLicenses[0] || {}),
          licenceSerialNo: licenseSerialNo,
          licenceStatus: nestedLicenses[0]?.licenceStatus || firstLicense.licenceStatus || 'active',
        };
      }

      licenseRows[0] = {
        ...firstLicense,
        product: product || undefined,
        releaseVersion: releaseVersion || undefined,
        licenceType: licenceType || undefined,
        noOfUsers: users,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        tssExpiryDate: tssExpiryDate || undefined,
        licenseSerialNo: licenseSerialNo || undefined,
        isServer9,
        isTdl,
        tdlSerialNos: isTdl ? firstLicense.tdlSerialNos : [],
        isAmcActive,
        ...(nestedLicenses.length > 0 ? { licenses: nestedLicenses } : {}),
      };
    }

    const normalizedLicenseRows = licenseRows.map((p) => {
      const rowUserCount = toNumberOrUndefined(p.noOfUsers) ?? (p.licenses?.length ? p.licenses.length : 1);
      return {
        ...p,
        noOfUsers: rowUserCount > 0 ? rowUserCount : 1,
      };
    });
    const mappedProducts = Array.from(new Set([
      product,
      ...(form.products || []),
      ...normalizedLicenseRows.map((p) => p.product || ''),
    ].map((p) => String(p || '').trim()).filter(Boolean)));
    const companyName = form.name || form.companyInfo?.customerName || '';
    const companyAddress = form.address || form.companyInfo?.fullAddress || '';
    const primaryLicenseVendor = (form.services || []).find((s) => s.type === 'amc')?.vendorCategory;
    const amcExpiryBySerial = new Map<string, string>();
    (form.services || []).forEach((s) => {
      if (s.type === 'amc' && s.licenseSerialNo && s.tssExpiryDate) {
        const d = dateInputValue(s.tssExpiryDate);
        if (d) amcExpiryBySerial.set(String(s.licenseSerialNo).trim().toLowerCase(), d);
      }
    });

    const normalizedServices = (form.services || []).filter(hasMeaningfulServiceData).map((s) => {
      const actualPrice = toNumberOrUndefined(s.actualPrice);
      const discount = toNumberOrUndefined(s.discount);
      const currentPrice = toNumberOrUndefined(s.currentPrice);
      const advance1 = toNumberOrUndefined(s.advance1);
      const advance2 = toNumberOrUndefined(s.advance2);
      const server9SerialNos = s.isServer9
        ? (s.server9SerialNos || [])
            .map((row) => ({ serialNo: String(row?.serialNo || '').trim() }))
            .filter((row) => row.serialNo)
        : [];
      const serviceUsers = Array.isArray(s.users)
        ? s.users
            .map((user) => ({
              username: String(user?.username || '').trim(),
              userDetail: String(user?.userDetail || '').trim(),
              userLocation: String(user?.userLocation || '').trim(),
            }))
            .filter((user) => user.username || user.userDetail || user.userLocation)
        : undefined;
      const tdlSerialNos = s.isTdl
        ? (s.tdlSerialNos || [])
            .map((row) => ({ serialNo: String(row?.serialNo || '').trim() }))
            .filter((row) => row.serialNo)
        : [];
      const serviceCompanyName = textOrEmpty(s.companyName) || companyName;
      const serviceAddress = textOrEmpty(s.address) || companyAddress;
      const primaryContactDraft = (form.keyContacts || [])[0];
      const serviceContactPerson = textOrEmpty(s.contactPerson) || form.contact || primaryContactDraft?.contactName || undefined;
      const serviceMobile = cleanPhone(s.mobile) || cleanPhone(form.phone) || cleanPhone(primaryContactDraft?.mobile) || undefined;
      const serviceEmail = (s.email || form.email || primaryContactDraft?.email || '').trim().toLowerCase() || undefined;
      const resolvedVendorCategory = s.type === 'tss'
        ? (textOrEmpty(primaryLicenseVendor) || textOrEmpty(s.vendorCategory) || undefined)
        : (textOrEmpty(s.vendorCategory) || undefined);

      let resolvedEndDate = dateInputValue(s.endDate) || undefined;
      let resolvedTssExpiryDate = dateInputValue(s.tssExpiryDate) || undefined;
      if (s.type === 'tss' && s.licenseSerialNo) {
        const serKey = String(s.licenseSerialNo).trim().toLowerCase();
        const amcDate = amcExpiryBySerial.get(serKey);
        if (amcDate) {
          resolvedEndDate = amcDate;
          resolvedTssExpiryDate = amcDate;
        }
      }

      return {
        ...s,
        companyType: s.companyType || 'head_office',
        companyName: serviceCompanyName || undefined,
        address: serviceAddress || undefined,
        contactPerson: serviceContactPerson,
        mobile: serviceMobile,
        email: serviceEmail,
        vendor: String(s.vendor || '').trim() || undefined,
        vendorCategory: resolvedVendorCategory,
        startDate: dateInputValue(s.startDate) || undefined,
        endDate: resolvedEndDate,
        tssExpiryDate: resolvedTssExpiryDate,
        quantity: toNumberOrUndefined(s.quantity) || 1,
        noOfDays: toNumberOrUndefined(s.noOfDays),
        noOfUsers: toNumberOrUndefined(s.noOfUsers),
        amcValue: toNumberOrUndefined(s.amcValue),
        licenceStatus: s.licenceStatus || 'active',
        server9SerialNos,
        isTdl: s.isTdl === true,
        tdlSerialNos,
        users: serviceUsers || [],
        showPricing: Boolean(s.showPricing || (s.showPricing === undefined && hasServicePricingDetails(s))),
        actualPrice,
        discount,
        currentPrice,
        advance1,
        advance2,
        remainingTotal: (currentPrice || 0) - (advance1 || 0) - (advance2 || 0),
      };
    });
    const normalizedBranches = (form.branches || [])
      .map((b) => ({
        branchName: String(b?.branchName || '').trim(),
        locationArea: String(b?.locationArea || '').trim(),
        area: String(b?.area || '').trim(),
        fullAddress: String(b?.fullAddress || '').trim(),
        website: String(b?.website || '').trim(),
        websiteStatus: b?.websiteStatus || 'Active',
        contactPerson: String(b?.contactPerson || '').trim(),
        mobile: cleanPhone(b?.mobile),
        email: String(b?.email || '').trim(),
      }))
      .filter((b) => b.branchName || b.locationArea || b.area || b.fullAddress || b.contactPerson || b.mobile || b.email);
    const normalizedPartnerDetails = (form.partnerDetails || [])
      .map((row) => ({
        companyName: String(row?.companyName || '').trim(),
        fullName: String(row?.fullName || '').trim(),
        email: String(row?.email || '').trim(),
        phone: cleanPhone(row?.phone),
        address: String(row?.address || '').trim(),
        service: String(row?.service || '').trim(),
      }))
      .filter((row) => row.companyName || row.fullName || row.email || row.phone || row.address || row.service);
    const normalizedGroupCompanies = (form.groupCompanies || [])
      .map((g) => ({
        name: String(g?.name || '').trim(),
      }))
      .filter((g) => g.name);
    const normalizedKeyContacts = (form.keyContacts || [])
      .map((c) => ({
        contactName: String(c.contactName || '').trim(),
        designation: String(c.designation || '').trim(),
        mobile: cleanPhone(c.mobile),
        whatsapp: cleanPhone(c.whatsapp),
        email: String(c.email || '').trim().toLowerCase(),
        contactPreference: String(c.contactPreference || '').trim(),
        landline: String(c.landline || '').trim(),
      }))
      .filter((c) => c.contactName || c.mobile || c.whatsapp || c.email);
    const primaryContact = normalizedKeyContacts[0];
    const primaryProductLicenseService = normalizedServices.find((service) => service.type === 'amc');
    const hasActiveAmcService = Boolean(primaryProductLicenseService?.isAmcActive || isAmcActive);
    const normalizedBranchInfo = form.branchInfo
      ? {
          isBranch: !!form.branchInfo.isBranch,
          branchName: String(form.branchInfo.branchName || '').trim(),
          branchCode: String(form.branchInfo.branchCode || '').trim(),
          parentCompanyId: form.branchInfo.isBranch ? String(form.branchInfo.parentCompanyId || '').trim() || undefined : undefined,
        }
      : undefined;

    const tdlService = normalizedServices.find((s) => s.type === 'tdl');
    const tdlLicense = normalizedServices.find((s) => s.isTdl);
    const resolvedTdl = tdlService || (tdlLicense ? {
      ...tdlLicense,
      status: tdlLicense.status || 'active',
      details: tdlLicense.details || 'Product TDL Add-on',
    } : null);

    const activeContactName = form.contact || primaryContact?.contactName || '';
    const activePhone = cleanPhone(form.phone) || cleanPhone(primaryContact?.mobile) || '';
    const activeEmail = (form.email || primaryContact?.email || '').trim().toLowerCase() || undefined;

    const tdlDetails = resolvedTdl ? {
      ...(form.tdlDetails || {}),
      vendorCategory: textOrEmpty(resolvedTdl.vendorCategory) || form.tdlDetails?.vendorCategory,
      status: (resolvedTdl.status || 'active') as 'active' | 'expired' | 'expiring' | 'none' | 'trial',
      companyType: resolvedTdl.companyType || 'head_office',
      companyName: companyName || resolvedTdl.companyName || form.tdlDetails?.companyName,
      address: companyAddress || resolvedTdl.address || form.tdlDetails?.address,
      contactPerson: activeContactName || form.tdlDetails?.contactPerson,
      mobile: activePhone || form.tdlDetails?.mobile,
      email: activeEmail || form.tdlDetails?.email,
      details: resolvedTdl.details,
      product: resolvedTdl.product,
      release: resolvedTdl.releaseVersion || resolvedTdl.release,
      licenseSerialNo: resolvedTdl.licenseSerialNo,
      startDate: dateInputValue(resolvedTdl.startDate) || undefined,
      endDate: dateInputValue(resolvedTdl.endDate) || undefined,
      salesman1: resolvedTdl.salesman1,
      salesman2: resolvedTdl.salesman2,
      actualPrice: resolvedTdl.actualPrice,
      discount: resolvedTdl.discount,
      currentPrice: resolvedTdl.currentPrice,
      advance1: resolvedTdl.advance1,
      advance2: resolvedTdl.advance2,
      remainingTotal: resolvedTdl.remainingTotal,
      others: resolvedTdl.others,
    } : (form.tdlDetails?.status ? {
      ...form.tdlDetails,
      status: 'none' as const,
      companyName: companyName || form.tdlDetails?.companyName,
      address: companyAddress || form.tdlDetails?.address,
      contactPerson: activeContactName || form.tdlDetails?.contactPerson,
      mobile: activePhone || form.tdlDetails?.mobile,
      email: activeEmail || form.tdlDetails?.email,
    } : undefined);

    const cloudService = normalizedServices.find((s) => s.type === 'cloud');
    const cloudDetails = cloudService ? {
      ...(form.cloudDetails || {}),
      status: (cloudService.status || 'active') as 'active' | 'expired' | 'expiring' | 'none' | 'trial',
      companyType: cloudService.companyType || 'head_office',
      companyName: companyName || cloudService.companyName || form.cloudDetails?.companyName,
      address: companyAddress || cloudService.address || form.cloudDetails?.address,
      contactPerson: activeContactName || form.cloudDetails?.contactPerson,
      mobile: activePhone || form.cloudDetails?.mobile,
      email: activeEmail || form.cloudDetails?.email,
      vendor: cloudService.vendor,
      domainLinkSubId: cloudService.domainLinkSubId,
      noOfUsers: cloudService.noOfUsers,
      product: cloudService.product,
      release: cloudService.release || cloudService.releaseVersion,
      startDate: dateInputValue(cloudService.startDate) || undefined,
      endDate: dateInputValue(cloudService.endDate) || undefined,
      salesman1: cloudService.salesman1,
      salesman2: cloudService.salesman2,
      actualPrice: cloudService.actualPrice,
      discount: cloudService.discount,
      currentPrice: cloudService.currentPrice,
      advance1: cloudService.advance1,
      advance2: cloudService.advance2,
      remainingTotal: cloudService.remainingTotal,
      others: cloudService.others,
    } : (form.cloudDetails?.status ? {
      ...form.cloudDetails,
      status: 'none' as const,
      companyName: companyName || form.cloudDetails?.companyName,
      address: companyAddress || form.cloudDetails?.address,
      contactPerson: activeContactName || form.cloudDetails?.contactPerson,
      mobile: activePhone || form.cloudDetails?.mobile,
      email: activeEmail || form.cloudDetails?.email,
    } : undefined);

    const tssService = normalizedServices.find((s) => s.type === 'tss');
    const tssAmc = normalizedServices.find((s) => s.tssExpiryDate);
    const resolvedTss = tssService || tssAmc;
    const tssDetails = resolvedTss ? {
      ...(form.tssDetails || {}),
      vendorCategory: textOrEmpty(resolvedTss.vendorCategory) || form.tssDetails?.vendorCategory,
      status: (resolvedTss.status || 'active') as 'active' | 'expired' | 'expiring' | 'none' | 'trial',
      companyType: resolvedTss.companyType || 'head_office',
      companyName: companyName || resolvedTss.companyName || form.tssDetails?.companyName,
      address: companyAddress || resolvedTss.address || form.tssDetails?.address,
      contactPerson: activeContactName || form.tssDetails?.contactPerson,
      mobile: activePhone || form.tssDetails?.mobile,
      email: activeEmail || form.tssDetails?.email,
      details: resolvedTss.details,
      product: resolvedTss.product,
      licenseSerialNo: resolvedTss.licenseSerialNo,
      startDate: dateInputValue(resolvedTss.startDate) || undefined,
      endDate: dateInputValue(resolvedTss.endDate || resolvedTss.tssExpiryDate) || undefined,
      actualPrice: resolvedTss.actualPrice,
      discount: resolvedTss.discount,
      currentPrice: resolvedTss.currentPrice,
      advance1: resolvedTss.advance1,
      advance2: resolvedTss.advance2,
      remainingTotal: resolvedTss.remainingTotal,
      others: resolvedTss.others,
    } : (form.tssDetails?.status ? {
      ...form.tssDetails,
      status: 'none' as const,
      companyName: companyName || form.tssDetails?.companyName,
      address: companyAddress || form.tssDetails?.address,
      contactPerson: activeContactName || form.tssDetails?.contactPerson,
      mobile: activePhone || form.tssDetails?.mobile,
      email: activeEmail || form.tssDetails?.email,
    } : undefined);

    return {
      name: String(form.name || form.companyInfo?.customerName || '').trim(),
      contact: form.contact || primaryContact?.contactName || '',
      phone: cleanPhone(form.phone) || primaryContact?.mobile || '',
      email: (form.email || primaryContact?.email || '').trim().toLowerCase() || undefined,
      address: form.address || form.companyInfo?.fullAddress || '',
      industry: form.industry || form.companyInfo?.industry || '',
      products: mappedProducts,
      licenceType: licenceType || undefined,
      users,
      amcStatus: hasActiveAmcService ? 'active' : (form.amcStatus || 'none'),
      amcExpiry: hasActiveAmcService ? (primaryProductLicenseService?.endDate || endDate || undefined) : undefined,
      customerType: Array.isArray(form.customerType) ? form.customerType.join(', ') : String(form.customerType || '').trim() || undefined,
      notes: String(form.notes || '').trim() || undefined,
      avatar: form.avatar,
      agreementCopy: form.agreementCopy,
      isActive: form.isActive !== false,
      companyInfo: {
        ...(form.companyInfo || {}),
        customerName: companyName,
        industry: form.industry || form.companyInfo?.industry || '',
        fullAddress: companyAddress,
        releaseVersion: releaseVersion || form.companyInfo?.releaseVersion,
        isServer9,
        groupOfCompany: normalizedGroupCompanies.map((g) => g.name).filter(Boolean).join(', ') || undefined,
      },
      branchInfo: normalizedBranchInfo,
      services: normalizedServices,
      serialNoInfo: normalizedLicenseRows,
      tdlDetails,
      cloudDetails,
      tssDetails,
      branches: normalizedBranches,
      partnerDetails: normalizedPartnerDetails,
      groupCompanies: normalizedGroupCompanies,
      keyContacts: normalizedKeyContacts,
    };
  };

  const buildRequestBody = (): Partial<Customer> | FormData => {
    const payload = buildPayload();
    const needsFormData = !!(avatarFile || agreementCopyFile);
    if (!needsFormData) return payload;

    const body = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (key === 'avatar' || key === 'agreementCopy') return;
      if (typeof value === 'object') {
        body.append(key, JSON.stringify(value));
        return;
      }
      body.append(key, String(value));
    });
    if (avatarFile) body.append('avatar', avatarFile);
    if (agreementCopyFile) body.append('agreementCopy', agreementCopyFile);
    return body;
  };

  const renderFormContent = () => {
    const selectedServiceInstances = activeModuleSelection
      ? (form.services || [])
          .map((service, index) => ({ service, index }))
          .filter(({ service }) => service.type === activeModuleSelection)
      : [];

    return (
      <div className="step-content">
        <div className="form-header-premium" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            className="btn-back"
            onClick={() => navigate('/customers')}
            title="Back to Customers"
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{isEdit ? 'Edit Customer' : 'Customer Profile Studio'}</h1>
              {customer?.customerNumber && (
                <span
                  className="badge badge-purple font-mono"
                  style={{ fontSize: 13, padding: '4px 10px', fontWeight: 700, letterSpacing: '0.4px' }}
                >
                  {customer.customerNumber}
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0' }}>
              {isEdit
                ? `Managing profile for ${customer?.name || 'Customer'}`
                : 'Customer Number will be automatically assigned starting from WT0001.'}
            </p>
          </div>
        </div>

        <div className="form-grid">
          {/* ─── Identity & Brand ─── */}
          <div className="form-section-container section-tint-purple">
            <div className="form-section-header">
              <div className="studio-step-icon">
                <Building2 size={16} />
              </div>
              <h3>1. Company Information</h3>
            </div>

            {/* Left Side: 3 Identity Values */}
            <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(139, 92, 246, 0.06)', borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.18)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-2)' }}>
                  Customer Number
                </div>
                <span className="badge badge-purple font-mono" style={{ fontSize: 12.5, padding: '3px 10px', fontWeight: 700 }}>
                  {customer?.customerNumber || 'Auto-generated on Save (WT000X)'}
                </span>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <InputField
                  label="Company Name"
                  required
                  placeholder="e.g. Al-Futtaim Group"
                  value={form.name || ''}
                  onChange={(val) => updateField('name', val)}
                />
              </div>

              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, color: 'var(--tx-3)', marginBottom: '8px', display: 'block' }}>Group</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div 
                      className={`premium-toggle ${(form.groupCompanies && form.groupCompanies.length > 0) ? 'active' : ''}`} 
                      onClick={() => {
                        const isGroup = form.groupCompanies && form.groupCompanies.length > 0;
                        if (!isGroup) {
                          setForm(prev => ({ ...prev, groupCompanies: [{ name: '' }] }));
                        } else {
                          setForm(prev => ({ ...prev, groupCompanies: [] }));
                        }
                      }}
                    >
                      <div className="toggle-thumb" />
                      <div className="toggle-text">{(form.groupCompanies && form.groupCompanies.length > 0) ? 'YES' : 'NO'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {form.groupCompanies && form.groupCompanies.length > 0 && (
                <div style={{ gridColumn: 'span 2', marginTop: 10, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group Entries</div>
                    <button 
                      type="button" 
                      className="studio-btn studio-add-btn studio-add-btn-compact"
                      onClick={() => addArrayItem('groupCompanies', { name: '' })}
                    >
                      <Plus size={12} /> Add Group Entity
                    </button>
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: '16px 20px',
                    marginTop: '8px'
                  }}>
                    {form.groupCompanies.map((gc, gcIdx) => (
                      <div key={gcIdx} className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ marginBottom: 6 }}>
                          Group Name {(form.groupCompanies?.length || 0) > 1 ? `#${gcIdx + 1}` : ''}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. ABC Holdings"
                            value={gc.name || ''}
                            onChange={(e) => updateArrayField('groupCompanies', gcIdx, 'name', e.target.value)}
                            style={{ flex: 1, height: 42 }}
                          />
                          <button
                            type="button"
                            onClick={() => removeArrayItem('groupCompanies', gcIdx)}
                            title="Remove Group Entity"
                            style={{
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.18)',
                              borderRadius: 10,
                              color: 'var(--red, #ef4444)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 42,
                              width: 42,
                              flexShrink: 0,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right Side: Fixed Profile Card */}
            <div className="customer-brand-panel" style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px', borderLeft: '1px solid var(--border)', marginLeft: '10px', background: 'var(--surface-1)' }}>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <div className="customer-avatar-preview" style={{ width: 120, height: 120, borderRadius: '32px', fontSize: 32, boxShadow: '0 8px 20px rgba(0,0,0,0.06)' }}>
                  {avatarPreviewUrl ? (
                    <img src={avatarPreviewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{(form.name || 'CU').slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <label className="customer-avatar-upload" style={{
                  position: 'absolute', bottom: -10, right: -10,
                  width: 42, height: 42, borderRadius: '12px',
                  background: 'var(--brand)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                }}>
                  <Camera size={18} />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                </label>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--tx-1)', marginBottom: 4 }}>Company Branding</div>
                <p style={{ fontSize: 11, color: 'var(--tx-4)', marginBottom: 12 }}>PNG, JPG, up to 2MB</p>
                {avatarFile && (
                  <button type="button" className="customer-avatar-clear" onClick={clearSelectedAvatar} style={{ fontSize: 11, padding: '4px 10px' }}>
                    Remove Image
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─── Industry & Operations ─── */}
          <div className="form-section-container section-tint-teal">
            <div className="form-section-header">
              <div className="studio-step-icon">
                <Rocket size={16} />
              </div>
              <h3>2. Industry & Operations</h3>
            </div>
            <InputField
              label="CR NO"
              placeholder="Commercial registration number"
              value={form.companyInfo?.crNo || ''}
              onChange={(val) => updateNestedField('companyInfo', 'crNo', val)}
            />
            <SelectField
              label="Business Segment"
              placeholder="Select Business Segment"
              value={form.companyInfo?.businessSegment || ''}
              onChange={(val) => updateNestedField('companyInfo', 'businessSegment', val)}
              options={businessSegmentOptions}
              loading={isLoadingBusinessSegments}
            />
            <SelectField
              label="Industry"
              placeholder="Select Industry"
              value={form.industry || form.companyInfo?.industry || ''}
              onChange={handleIndustryChange}
              options={industryOptions}
              loading={isLoadingIndustries}
            />

            <div style={{ gridColumn: 'span 2' }}>
              <SelectField
                label="Industry Group"
                placeholder={selectedIndustryName ? (industryGroupOptions.length === 0 ? 'No groups available' : 'Select Industry Group') : 'Select Industry first'}
                value={form.companyInfo?.industryGroup || ''}
                onChange={(val) => updateNestedField('companyInfo', 'industryGroup', val)}
                options={industryGroupOptions}
                disabled={!selectedIndustryName || industryGroupOptions.length === 0}
              />
            </div>
            <SelectField
              label="Industry Type"
              placeholder="Select Industry Type"
              value={form.companyInfo?.industryType || ''}
              onChange={(val) => updateNestedField('companyInfo', 'industryType', val)}
              options={industryTypeOptions}
              loading={isLoadingIndustryTypes}
            />
          </div>

          {/* ─── Location & Address ─── */}
          <div className="form-section-container section-tint-purple">
            <div className="form-section-header">
              <div className="studio-step-icon">
                <SearchCheck size={16} />
              </div>
              <h3>3. Location & Address</h3>
            </div>
            <InputField
              label="Address"
              placeholder="e.g. Street 123"
              value={form.address || ''}
              onChange={(val) => updateField('address', val)}
            />
            <div style={{ gridColumn: 'span 2' }}>
              <InputField
                label="Full Address"
                placeholder="e.g. Lusail, Building 45, Doha, Qatar"
                value={form.companyInfo?.fullAddress || ''}
                onChange={(val) => updateNestedField('companyInfo', 'fullAddress', val)}
              />
            </div>
            <InputField
              label="Area"
              placeholder="e.g. Al-Dafna"
              value={form.companyInfo?.locationArea || ''}
              onChange={(val) => updateNestedField('companyInfo', 'locationArea', val)}
            />
            <InputField
              label="Website"
              placeholder="e.g. www.company.com"
              value={form.companyInfo?.website || ''}
              onChange={(val) => updateNestedField('companyInfo', 'website', val)}
            />
            <SelectField 
              label="Website Status" 
              value={form.companyInfo?.websiteStatus || ''} 
              onChange={(val) => updateNestedField('companyInfo', 'websiteStatus', val)}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' }
              ]}
              placeholder="Select status"
            />
            </div>

          {/* ─── Managed Branches ─── */}
          <div className="form-section-container section-tint-teal" style={{ display: 'flex', flexDirection: 'column', gap: branchesExpanded && hasBranches ? 20 : 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer'
            }} onClick={() => setBranchesExpanded(!branchesExpanded)}>
              <div className="form-section-header" style={{ marginBottom: 0, width: 'auto' }}>
                <div className="studio-step-icon">
                  <Building2 size={16} />
                </div>
                <h3>4. Managed Branches</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {hasBranches && (
                  <button
                    type="button"
                    className="studio-btn studio-add-btn studio-add-btn-compact"
                    onClick={(e) => {
                      e.stopPropagation();
                      addArrayItem('branches', { branchName: '', locationArea: '', area: '', fullAddress: '', website: '', websiteStatus: 'Active', contactPerson: '', mobile: '', email: '' });
                    }}
                  >
                    <Plus size={14} /> Add Branch
                  </button>
                )}
                <div className={`premium-toggle ${hasBranches ? 'active' : ''}`} onClick={(e) => {
                  e.stopPropagation();
                  handleBranchesToggle(!hasBranches);
                }}>
                  <div className="toggle-thumb" />
                  <div className="toggle-text">{hasBranches ? 'YES' : 'NO'}</div>
                </div>
              </div>
            </div>

            {branchesExpanded && hasBranches && (
              <div style={{ gridColumn: 'span 3', paddingTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                  {(form.branches || []).map((b, idx) => (
                    <div key={idx} className="branch-card-v2" style={{ gridColumn: 'span 3' }}>
                      {idx > 0 && <button type="button" className="branch-remove-btn" onClick={() => removeArrayItem('branches', idx)}><Trash2 size={13} /></button>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                        <InputField label="Branch Name" placeholder="e.g. Doha Main Branch" value={b.branchName || ''} onChange={(val) => updateArrayField('branches', idx, 'branchName', val)} />
                        <InputField label="Address" placeholder="e.g. West Bay, Doha" value={b.locationArea || ''} onChange={(val) => updateArrayField('branches', idx, 'locationArea', val)} />
                        <InputField label="Area" placeholder="e.g. Al Sadd" value={b.area || ''} onChange={(val) => updateArrayField('branches', idx, 'area', val)} />

                        <div style={{ gridColumn: 'span 2' }}>
                          <InputField label="Full Address" placeholder="e.g. Building 10, Street 250, Zone 38" value={b.fullAddress || ''} onChange={(val) => updateArrayField('branches', idx, 'fullAddress', val)} />
                        </div>
                        <InputField label="Website" placeholder="www.branch.com" value={b.website || ''} onChange={(val) => updateArrayField('branches', idx, 'website', val)} />

                        <SelectField 
                          label="Website Status" 
                          value={b.websiteStatus || 'Active'} 
                          onChange={(val) => updateArrayField('branches', idx, 'websiteStatus', val)}
                          options={[
                            { value: 'Active', label: 'Active' },
                            { value: 'Inactive', label: 'Inactive' }
                          ]}
                        />
                        <InputField label="Contact Person" placeholder="e.g. Ahmed Ali" value={b.contactPerson || ''} onChange={(val) => updateArrayField('branches', idx, 'contactPerson', val)} />
                        <InputField label="Mobile" placeholder="+974 — — — —" value={b.mobile || ''} onChange={(val) => updateArrayField('branches', idx, 'mobile', val)} type="tel" />
                        
                        <InputField label="Email ID" placeholder="branch@example.com" value={b.email || ''} onChange={(val) => updateArrayField('branches', idx, 'email', val)} type="email" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Contact Information (Array Format) ─── */}
          <div className="form-section-container section-tint-teal" style={{ gridColumn: 'span 3' }}>
            <div className="form-section-header">
              <div className="studio-step-icon">
                <Headphones size={16} />
              </div>
              <h3>5. Contact Information</h3>
              <button
                type="button"
                className="studio-btn studio-add-btn studio-add-btn-compact"
                style={{ marginLeft: 'auto' }}
                onClick={() => addArrayItem('keyContacts', { contactName: '', designation: '', mobile: '', whatsapp: '', email: '', contactPreference: '', landline: '' })}
              >
                <Plus size={12} /> Add Contact
              </button>
            </div>
            <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
              {(form.keyContacts || []).map((contact, idx) => (
                <div key={idx} className="branch-card-v2" style={{ padding: '24px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ 
                        fontSize: '10.5px', 
                        fontWeight: 800, 
                        color: idx === 0 ? '#4338CA' : idx === 1 ? '#166534' : '#475569',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        background: idx === 0 ? '#E0E7FF' : idx === 1 ? '#DCFCE7' : '#F1F5F9',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        border: idx === 0 ? '1px solid rgba(67, 56, 202, 0.2)' : idx === 1 ? '1px solid rgba(22, 101, 52, 0.2)' : '1px solid rgba(71, 85, 105, 0.2)'
                      }}>
                        {idx === 0 ? <ShieldCheck size={12} /> : idx === 1 ? <User size={12} /> : <Users size={12} />}
                        {idx === 0 ? 'Primary Contact' : idx === 1 ? 'Secondary Contact' : 'Additional Contact'}
                      </span>
                    </div>
                    {idx > 0 && (
                      <button type="button" className="branch-remove-btn" onClick={() => removeArrayItem('keyContacts', idx)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <InputField
                        label="Contact Name"
                        placeholder="e.g. John Doe"
                        value={contact.contactName || ''}
                        onChange={(val) => {
                          updateArrayField('keyContacts', idx, 'contactName', val);
                          if (idx === 0) setForm(prev => ({ ...prev, contact: val }));
                        }}
                      />
                    </div>
                    <InputField
                      label="Designation"
                      placeholder="e.g. Manager"
                      value={contact.designation || ''}
                      onChange={(val) => updateArrayField('keyContacts', idx, 'designation', val)}
                    />
                    <InputField
                      label="Mobile"
                      placeholder="+974 — — — —"
                      value={contact.mobile || ''}
                      type="tel"
                      onChange={(val) => {
                        updateArrayField('keyContacts', idx, 'mobile', val);
                        if (idx === 0) setForm(prev => ({ ...prev, phone: cleanPhone(val) }));
                      }}
                    />
                    <InputField
                      label="Whatsapp"
                      placeholder="+974 — — — —"
                      value={contact.whatsapp || ''}
                      type="tel"
                      onChange={(val) => updateArrayField('keyContacts', idx, 'whatsapp', val)}
                    />
                    <InputField
                      label="Email"
                      placeholder="email@example.com"
                      value={contact.email || ''}
                      onChange={(val) => {
                        updateArrayField('keyContacts', idx, 'email', val);
                        if (idx === 0) setForm(prev => ({ ...prev, email: val }));
                      }}
                    />
                    <SelectField
                      label="Preferred"
                      options={[{ value: 'whatsapp', label: 'Whatsapp' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' }]}
                      value={contact.contactPreference || ''}
                      onChange={(val) => updateArrayField('keyContacts', idx, 'contactPreference', val)}
                    />
                    <div style={{ gridColumn: 'span 2' }}>
                      <InputField
                        label="Landline / Office"
                        placeholder="e.g. 4455 6677"
                        value={contact.landline || ''}
                        onChange={(val) => updateArrayField('keyContacts', idx, 'landline', val)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>



          {/* ─── 3. Product & License ─── */}
          <div className="form-section-container section-tint-purple" style={{ marginTop: 10 }}>
            <div className="form-section-header">
              <div className="studio-step-icon">
                <Rocket size={16} />
              </div>
              <h3>6. Product & License</h3>
            </div>

            {activeModuleSelection && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="product-license-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, textTransform: 'uppercase' }}>
                    {activeModuleSelection === 'amc' ? serviceTitles[activeModuleSelection] : `${serviceTitles[activeModuleSelection]} Details`}
                  </h3>
                  <button type="button" className="studio-btn studio-add-btn studio-add-btn-prominent" onClick={() => addServiceInstance(activeModuleSelection)}>
                    <Plus size={16} /> Add Instance
                  </button>
                </div>

                {selectedServiceInstances.length === 0 ? (
                  <div className="empty-services-placeholder" style={{ padding: '40px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--tx-3)', fontSize: '13px' }}>No {serviceTitles[activeModuleSelection]} instances provisioned yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 16 }}>
                    {selectedServiceInstances.map(({ service: s, index: sIdx }, moduleIdx) => {
                      const serviceType = s.type as ModuleId;
                      const server9Rows = s.server9SerialNos && s.server9SerialNos.length > 0 ? s.server9SerialNos : [{ serialNo: '' }];
                      const supportsAddOnAmc = false;
                      return (
                        <div key={sIdx} className="module-details-panel">
                          <div className="module-details-header" onClick={(e) => toggleServicePanel(sIdx, e)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                                {React.cloneElement(serviceIcons[serviceType] as React.ReactElement, { size: 18 })}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{serviceTitles[serviceType]} <span style={{ color: 'var(--tx-4)', fontWeight: 400, fontSize: '11px', marginLeft: '4px' }}>#{moduleIdx + 1}</span></div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-4)' }}>Status: {s.status?.toUpperCase() || 'ACTIVE'}</div>
                              </div>
                            </div>
                            {moduleIdx > 0 && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeServiceInstance(sIdx); }} style={{ padding: '8px', color: '#ff4d4f', border: 'none', background: 'transparent', cursor: 'pointer' }}><Trash2 size={18} /></button>
                            )}
                            <ChevronDown size={18} className={`module-details-chevron ${openServiceIdx === sIdx ? 'open' : ''}`} />
                          </div>

                          {openServiceIdx === sIdx && (
                            <div style={{ padding: '24px 0 10px', display: 'grid', gap: 22 }}>
                              {s.type === 'amc' ? (
                                <>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                                    <SelectField
                                      label="Product"
                                      loading={isLoadingProducts}
                                      value={s.product || ''}
                                      onChange={(val) => updateServiceInstance(sIdx, 'product', val)}
                                      placeholder="Select product"
                                      options={productOptions.map((p) => ({ value: p, label: p }))}
                                    />
                                    <InputField
                                      label="Release Version"
                                      placeholder="Type release version..."
                                      value={s.releaseVersion || ''}
                                      onChange={(val) => updateServiceInstance(sIdx, 'releaseVersion', val)}
                                    />
                                    <SelectField
                                      label="License Type"
                                      loading={isLoadingLicenceTypes}
                                      value={s.licenceType || ''}
                                      onChange={(val) => updateServiceInstance(sIdx, 'licenceType', val)}
                                      placeholder="Select license type"
                                      options={licenceTypeOptions.map(l => ({ value: l, label: l }))}
                                    />
                                  </div>

                                  <div style={{ marginTop: '10px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Customer Type</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                      {isLoadingCustomerTypes ? (
                                        <div style={{ gridColumn: 'span 4', padding: '20px', textAlign: 'center' }}>
                                          <Spinner size={20} />
                                        </div>
                                      ) : (customerTypesFromApi || []).map((ct, idx) => {
                                        const selectedTypes = Array.isArray(form.customerType) ? form.customerType : [];
                                        const isSelected = selectedTypes.includes(ct.name);
                                        return (
                                          <div
                                            key={ct._id}
                                            onClick={() => {
                                              const newTypes = isSelected 
                                                ? selectedTypes.filter(t => t !== ct.name)
                                                : [...selectedTypes, ct.name];
                                              updateField('customerType', newTypes);
                                            }}
                                            style={{
                                              padding: '12px 16px',
                                              borderRadius: '12px',
                                              border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border)',
                                              background: isSelected ? 'rgba(67, 56, 202, 0.05)' : 'var(--surface-1)',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '12px',
                                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                              position: 'relative',
                                              overflow: 'hidden'
                                            }}
                                            className="customer-type-card"
                                          >
                                            <div style={{
                                              width: '20px',
                                              height: '20px',
                                              borderRadius: '6px',
                                              border: isSelected ? '2px solid var(--brand)' : '2px solid var(--border-3)',
                                              background: isSelected ? 'var(--brand)' : 'transparent',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              color: 'white',
                                              transition: 'all 0.2s'
                                            }}>
                                              {isSelected && <ShieldCheck size={12} />}
                                            </div>
                                            <span style={{ 
                                              fontSize: '13px', 
                                              fontWeight: isSelected ? 600 : 500,
                                              color: isSelected ? 'var(--brand)' : 'var(--tx-2)'
                                            }}>
                                              {idx + 1}. {ct.name}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: '22px' }}>
                                    <InputField
                                      label="No. of Users"
                                      type="number"
                                      value={String(s.noOfUsers || '')}
                                      onChange={(val) => updateServiceInstance(sIdx, 'noOfUsers', toNumberOrUndefined(val))}
                                    />
                                    <InputField
                                      label="License Serial No"
                                      placeholder="e.g. LIC-AB12CD34"
                                      value={s.licenseSerialNo || ''}
                                      onChange={(val) => updateServiceInstance(sIdx, 'licenseSerialNo', val)}
                                    />
                                    <SelectField
                                      label="License Status"
                                      value={s.licenceStatus || 'active'}
                                      onChange={(val) => updateServiceInstance(sIdx, 'licenceStatus', val)}
                                      placeholder="Select license status"
                                      options={LICENSE_STATUS_OPTIONS}
                                    />
                                  </div>

                                  <div className="licensing-quick-row">
                                    <div className="licensing-quick-field licensing-quick-field-partner">
                                      <InputField
                                        label="Partner Name"
                                        placeholder="Enter or select partner..."
                                        value={s.vendorCategory || ''}
                                        onChange={(val) => updateServiceInstance(sIdx, 'vendorCategory', val)}
                                        list="partner-suggestions-list"
                                      />
                                      <datalist id="partner-suggestions-list">
                                        {partnerOptions.map((opt) => (
                                          <option key={opt} value={opt} />
                                        ))}
                                      </datalist>
                                    </div>
                                    <div className="licensing-quick-field">
                                      <InputField
                                        label="Starting Date"
                                        type="date"
                                        value={s.startDate ? String(s.startDate).split('T')[0] : ''}
                                        onChange={(val) => updateServiceInstance(sIdx, 'startDate', val)}
                                      />
                                    </div>
                                    <div className="licensing-quick-field">
                                      <InputField
                                        label="TSS Expiry Date"
                                        type="date"
                                        value={s.tssExpiryDate ? String(s.tssExpiryDate).split('T')[0] : ''}
                                        onChange={(val) => updateServiceInstance(sIdx, 'tssExpiryDate', val)}
                                      />
                                    </div>
                                    <div className="licensing-quick-field">
                                      <div className="form-group">
                                        <label className="form-label">Server 9</label>
                                        <div className={`premium-toggle ${s.isServer9 ? 'active' : ''}`} onClick={() => updateServiceInstance(sIdx, 'isServer9', !s.isServer9)}>
                                          <div className="toggle-thumb" />
                                          <div className="toggle-text">{s.isServer9 ? 'YES' : 'NO'}</div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="licensing-quick-field">
                                      <div className="form-group">
                                        <label className="form-label">Pricing Details?</label>
                                        <div className={`premium-toggle ${s.showPricing ? 'active' : ''}`} onClick={() => updateServiceInstance(sIdx, 'showPricing', !s.showPricing)}>
                                          <div className="toggle-thumb" />
                                          <div className="toggle-text">{s.showPricing ? 'YES' : 'NO'}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {s.isServer9 && (
                                    <div className="licensing-detail-panel">
                                      <div className="licensing-detail-title">Server 9 Serial Nos</div>
                                      <div className="server9-serial-grid">
                                        {s.server9SerialNos?.map((row, rowIdx) => (
                                          <div key={rowIdx} className="server9-serial-row">
                                            <InputField
                                              label={rowIdx === 0 ? 'Serial No' : ''}
                                              placeholder="e.g. SRV9-001245"
                                              value={row.serialNo || ''}
                                              onChange={(val) => updateServiceServer9SerialNo(sIdx, rowIdx, val)}
                                            />
                                            {(s.server9SerialNos || []).length > 1 && (
                                              <button
                                                type="button"
                                                className="licensing-row-remove"
                                                onClick={() => removeServiceServer9SerialNo(sIdx, rowIdx)}
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                        <button
                                          type="button"
                                          className="studio-btn studio-add-btn studio-add-btn-compact licensing-inline-add"
                                          onClick={() => addServiceServer9SerialNo(sIdx)}
                                        >
                                          <Plus size={13} /> Add Serial No
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {s.showPricing && (
                                    <div className="licensing-detail-panel">
                                      <div className="licensing-detail-title">Pricing Details</div>
                                      <div className="licensing-detail-grid">
                                        <InputField label="Actual Price" type="number" value={s.actualPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'actualPrice', toNumberOrUndefined(val))} />
                                        <InputField label="Discount" type="number" value={s.discount || ''} onChange={(val) => updateServiceInstance(sIdx, 'discount', toNumberOrUndefined(val))} />
                                        <InputField label="Current Price" type="number" value={s.currentPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'currentPrice', toNumberOrUndefined(val))} />
                                        <InputField label="Advance 1" type="number" value={s.advance1 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance1', toNumberOrUndefined(val))} />
                                        <InputField label="Advance 2" type="number" value={s.advance2 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance2', toNumberOrUndefined(val))} />
                                        <InputField label="Balance" readOnly value={getRemainingBalance(s)} />
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                         </div>
                       );
                     })}
                   </div>
                 )}
               </div>
             )}
           </div>

          {/* ─── AMC Details ─── */}
          <div className="form-section-container section-tint-teal" style={{ display: 'flex', flexDirection: 'column', gap: amcExpanded && hasAmc ? 20 : 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer'
            }} onClick={() => setAmcExpanded(!amcExpanded)}>
              <div className="form-section-header" style={{ marginBottom: 0, width: 'auto' }}>
                <div className="studio-step-icon">
                  <Layers size={16} />
                </div>
                <h3>7. AMC Details</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                <div className={`premium-toggle ${hasAmc ? 'active' : ''}`} onClick={(e) => {
                  e.stopPropagation();
                  handleAmcToggle(!hasAmc);
                }}>
                  <div className="toggle-thumb" />
                  <div className="toggle-text">{hasAmc ? 'YES' : 'NO'}</div>
                </div>
              </div>
            </div>

            {amcExpanded && hasAmc && (
              <div style={{ paddingTop: '10px', display: 'grid', gap: 22 }}>
                {(form.services || []).map((s, sIdx) => {
                  if (s.type !== 'amc' || !s.isAmcActive) return null;
                  return (
                    <div key={sIdx} className="module-details-panel">
                      <div className="module-details-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338CA' }}>
                            <Layers size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>AMC Details</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-4)' }}>Status: {s.status?.toUpperCase() || 'ACTIVE'}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '24px', display: 'grid', gap: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                          <SelectField label="AMC Status" value={s.status || 'active'} onChange={(val) => updateServiceInstance(sIdx, 'status', val)} options={SERVICE_STATUS_OPTIONS} />
                          <InputField label="AMC Start Date" type="date" value={dateInputValue(s.startDate)} onChange={(val) => updateServiceInstance(sIdx, 'startDate', val)} />
                          <InputField label="AMC End Date" type="date" value={dateInputValue(s.endDate)} onChange={(val) => updateServiceInstance(sIdx, 'endDate', val)} />
                          
                          <InputField label="AMC Value" type="number" value={s.amcValue || ''} onChange={(val) => updateServiceInstance(sIdx, 'amcValue', toNumberOrUndefined(val))} />
                          <InputField label="Salesman 1" placeholder="e.g. Mohamed Hassan" value={s.salesman1 || ''} onChange={(val) => updateServiceInstance(sIdx, 'salesman1', val)} />
                          <InputField label="Salesman 2" placeholder="e.g. Rahul Kumar" value={s.salesman2 || ''} onChange={(val) => updateServiceInstance(sIdx, 'salesman2', val)} />
                          <div style={{ gridColumn: 'span 2' }}>
                            <InputField label="Notes/Remarks" placeholder="e.g. Additional information or notes" value={s.details || ''} onChange={(val) => updateServiceInstance(sIdx, 'details', val)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── 4. TDL Details ─── */}
          <div className="form-section-container section-tint-purple" style={{ display: 'flex', flexDirection: 'column', gap: tdlExpanded && hasTdl ? 20 : 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer'
            }} onClick={() => setTdlExpanded(!tdlExpanded)}>
              <div className="form-section-header" style={{ marginBottom: 0, width: 'auto' }}>
                <div className="studio-step-icon">
                  <ShieldCheck size={16} />
                </div>
                <h3>8. TDL Details</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {hasTdl && (
                  <button type="button" className="studio-btn studio-add-btn studio-add-btn-compact" onClick={(e) => { e.stopPropagation(); addServiceInstance('tdl'); }}>
                    <Plus size={13} /> Add Instance
                  </button>
                )}
                <div className={`premium-toggle ${hasTdl ? 'active' : ''}`} onClick={(e) => {
                  e.stopPropagation();
                  handleTdlToggle(!hasTdl);
                }}>
                  <div className="toggle-thumb" />
                  <div className="toggle-text">{hasTdl ? 'YES' : 'NO'}</div>
                </div>
              </div>
            </div>

            {tdlExpanded && hasTdl && (
              <div style={{ paddingTop: '10px', display: 'grid', gap: 22 }}>

                {(form.services || []).map((s, sIdx) => {
                  if (s.type !== 'tdl') return null;
                  const firstTdlIndex = (form.services || []).findIndex(serv => serv.type === 'tdl');
                  return (
                    <div key={sIdx} className="module-details-panel">
                      <div className="module-details-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
                            <ShieldCheck size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>TDL Add-on</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-4)' }}>Status: {s.status?.toUpperCase() || 'ACTIVE'}</div>
                          </div>
                        </div>
                        {sIdx !== firstTdlIndex && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeServiceInstance(sIdx); }} style={{ padding: '8px', color: '#ff4d4f', border: 'none', background: 'transparent', cursor: 'pointer' }}><Trash2 size={18} /></button>
                        )}
                      </div>
                      <div style={{ padding: '24px', display: 'grid', gap: 22 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                          <SelectField
                            label="TDL Status"
                            value={s.status || 'active'}
                            onChange={(val) => updateServiceInstance(sIdx, 'status', val)}
                            options={SERVICE_STATUS_OPTIONS}
                          />
                          <InputField
                            label="No. Of. Days"
                            type="number"
                            value={s.noOfDays || ''}
                            onChange={(val) => updateServiceInstance(sIdx, 'noOfDays', toNumberOrUndefined(val))}
                          />
                          <InputField
                            label="License Serial No"
                            placeholder="e.g. TDL-AB12CD34"
                            value={s.licenseSerialNo || ''}
                            onChange={(val) => updateServiceInstance(sIdx, 'licenseSerialNo', val)}
                          />
                        </div>

                        <div className="licensing-quick-row">
                          <div className="licensing-quick-field">
                            <InputField
                              label="Start Date"
                              type="date"
                              value={dateInputValue(s.startDate)}
                              onChange={(val) => updateServiceInstance(sIdx, 'startDate', val)}
                            />
                          </div>
                          <div className="licensing-quick-field">
                            <InputField
                              label="End Date"
                              type="date"
                              value={dateInputValue(s.endDate)}
                              onChange={(val) => updateServiceInstance(sIdx, 'endDate', val)}
                            />
                          </div>
                          <div className="licensing-quick-field">
                            <div className="form-group">
                              <label className="form-label">Pricing Details?</label>
                              <div className={`premium-toggle ${s.showPricing ? 'active' : ''}`} onClick={() => updateServiceInstance(sIdx, 'showPricing', !s.showPricing)}>
                                <div className="toggle-thumb" />
                                <div className="toggle-text">{s.showPricing ? 'YES' : 'NO'}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {s.showPricing && (
                          <div className="licensing-detail-panel">
                            <div className="licensing-detail-title">Pricing Details</div>
                            <div className="licensing-detail-grid">
                              <InputField label="Actual Price" type="number" value={s.actualPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'actualPrice', toNumberOrUndefined(val))} />
                              <InputField label="Discount" type="number" value={s.discount || ''} onChange={(val) => updateServiceInstance(sIdx, 'discount', toNumberOrUndefined(val))} />
                              <InputField label="Current Price" type="number" value={s.currentPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'currentPrice', toNumberOrUndefined(val))} />
                              <InputField label="Advance 1" type="number" value={s.advance1 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance1', toNumberOrUndefined(val))} />
                              <InputField label="Advance 2" type="number" value={s.advance2 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance2', toNumberOrUndefined(val))} />
                              <InputField label="Balance" readOnly value={getRemainingBalance(s)} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── 5. Cloud Details ─── */}
          <div className="form-section-container section-tint-teal" style={{ display: 'flex', flexDirection: 'column', gap: cloudExpanded && hasCloud ? 20 : 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer'
            }} onClick={() => setCloudExpanded(!cloudExpanded)}>
              <div className="form-section-header" style={{ marginBottom: 0, width: 'auto' }}>
                <div className="studio-step-icon">
                  <Cloud size={16} />
                </div>
                <h3>9. Cloud Details</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {hasCloud && (
                  <button type="button" className="studio-btn studio-add-btn studio-add-btn-compact" onClick={(e) => { e.stopPropagation(); addServiceInstance('cloud'); }}>
                    <Plus size={13} /> Add Instance
                  </button>
                )}
                <div className={`premium-toggle ${hasCloud ? 'active' : ''}`} onClick={(e) => {
                  e.stopPropagation();
                  handleCloudToggle(!hasCloud);
                }}>
                  <div className="toggle-thumb" />
                  <div className="toggle-text">{hasCloud ? 'YES' : 'NO'}</div>
                </div>
              </div>
            </div>

            {cloudExpanded && hasCloud && (
              <div style={{ paddingTop: '10px', display: 'grid', gap: 22 }}>

                {(form.services || []).map((s, sIdx) => {
                  if (s.type !== 'cloud') return null;
                  const firstCloudIndex = (form.services || []).findIndex(serv => serv.type === 'cloud');
                  return (
                    <div key={sIdx} className="module-details-panel">
                      <div className="module-details-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '10px', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
                            <Cloud size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>Cloud Hub</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-4)' }}>Status: {s.status?.toUpperCase() || 'ACTIVE'}</div>
                          </div>
                        </div>
                        {sIdx !== firstCloudIndex && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeServiceInstance(sIdx); }} style={{ padding: '8px', color: '#ff4d4f', border: 'none', background: 'transparent', cursor: 'pointer' }}><Trash2 size={18} /></button>
                        )}
                      </div>
                      <div style={{ padding: '24px', display: 'grid', gap: 22 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                          <SelectField
                            label="Vendor"
                            value={s.vendor || ''}
                            onChange={(val) => updateServiceInstance(sIdx, 'vendor', val)}
                            placeholder="Select vendor"
                            loading={isLoadingVendorCategories}
                            options={(vendorCategoriesFromApi || []).map((v) => ({ value: v.name, label: v.name }))}
                          />
                          <InputField
                            label="Domain_Link / SUB_ID"
                            placeholder="e.g. cloud.company.com / SUB-1024"
                            value={s.domainLinkSubId || ''}
                            onChange={(val) => updateServiceInstance(sIdx, 'domainLinkSubId', val)}
                          />
                          <InputField
                            label="License Serial No"
                            placeholder="e.g. CLD-AB12CD34"
                            value={s.licenseSerialNo || ''}
                            onChange={(val) => updateServiceInstance(sIdx, 'licenseSerialNo', val)}
                          />
                        </div>

                        <div className="licensing-quick-row">
                          <div className="licensing-quick-field">
                            <InputField
                              label="Cloud Start Date"
                              type="date"
                              value={dateInputValue(s.startDate)}
                              onChange={(val) => updateServiceInstance(sIdx, 'startDate', val)}
                            />
                          </div>
                          <div className="licensing-quick-field">
                            <InputField
                              label="Cloud Expiry Date"
                              type="date"
                              value={dateInputValue(s.endDate)}
                              onChange={(val) => updateServiceInstance(sIdx, 'endDate', val)}
                            />
                          </div>
                          <div className="licensing-quick-field">
                            <InputField
                              label="No. of Users"
                              type="number"
                              placeholder="e.g. 5"
                              value={s.noOfUsers || ''}
                              onChange={(val) => updateServiceInstance(sIdx, 'noOfUsers', toNumberOrUndefined(val))}
                            />
                          </div>
                          <div className="licensing-quick-field" style={{ minWidth: '120px' }}>
                            <div className="form-group">
                              <label className="form-label">Pricing Details?</label>
                              <div className={`premium-toggle ${s.showPricing ? 'active' : ''}`} onClick={() => updateServiceInstance(sIdx, 'showPricing', !s.showPricing)}>
                                <div className="toggle-thumb" />
                                <div className="toggle-text">{s.showPricing ? 'YES' : 'NO'}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="licensing-detail-panel" style={{ marginTop: '20px' }}>
                          <div className="licensing-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <div className="licensing-detail-title" style={{ marginBottom: 0 }}>Users List</div>
                            <button
                              type="button"
                              className="studio-btn studio-add-btn studio-add-btn-compact"
                              onClick={() => addServiceInstanceNestedArray(sIdx, 'users', { username: '', userDetail: '', userLocation: '' })}
                            >
                              <Plus size={12} /> Add User
                            </button>
                          </div>
                          
                          {(s.users || [{ username: '', userDetail: '', userLocation: '' }]).map((user, uIdx) => (
                            <div key={uIdx} className="cloud-user-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 40px', gap: 15, marginBottom: '15px', alignItems: 'end' }}>
                              <InputField
                                label="Username"
                                placeholder="e.g. admin.cloud"
                                value={user.username || ''}
                                onChange={(val) => updateServiceInstanceNestedArray(sIdx, 'users', uIdx, 'username', val)}
                              />
                              <InputField
                                label="User Detail"
                                placeholder="e.g. Finance team login"
                                value={user.userDetail || ''}
                                onChange={(val) => updateServiceInstanceNestedArray(sIdx, 'users', uIdx, 'userDetail', val)}
                              />
                              <InputField
                                label="User Location"
                                placeholder="e.g. Head Office"
                                value={user.userLocation || ''}
                                onChange={(val) => updateServiceInstanceNestedArray(sIdx, 'users', uIdx, 'userLocation', val)}
                              />
                              <button
                                type="button"
                                onClick={() => removeServiceInstanceNestedArray(sIdx, 'users', uIdx)}
                                style={{ marginBottom: '5px', padding: '8px', color: '#ff4d4f', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                disabled={(s.users || []).length <= 1}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {s.showPricing && (
                          <div className="licensing-detail-panel">
                            <div className="licensing-detail-title">Pricing Details</div>
                            <div className="licensing-detail-grid">
                              <InputField label="Actual Price" type="number" value={s.actualPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'actualPrice', toNumberOrUndefined(val))} />
                              <InputField label="Discount" type="number" value={s.discount || ''} onChange={(val) => updateServiceInstance(sIdx, 'discount', toNumberOrUndefined(val))} />
                              <InputField label="Current Price" type="number" value={s.currentPrice || ''} onChange={(val) => updateServiceInstance(sIdx, 'currentPrice', toNumberOrUndefined(val))} />
                              <InputField label="Advance 1" type="number" value={s.advance1 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance1', toNumberOrUndefined(val))} />
                              <InputField label="Advance 2" type="number" value={s.advance2 || ''} onChange={(val) => updateServiceInstance(sIdx, 'advance2', toNumberOrUndefined(val))} />
                              <InputField label="Balance" readOnly value={getRemainingBalance(s)} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Agreement Copy ─── */}
          <div style={{ gridColumn: 'span 3', marginTop: '10px' }}>
            <div className="agreement-copy-card" style={{
              display: 'flex', alignItems: 'center', gap: 20,
              padding: '22px 26px',
              border: '1px solid var(--border)',
              borderLeft: '4px solid var(--brand)',
              borderRadius: 14,
              background: 'var(--surface)',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
              transition: 'all 0.2s',
              marginBottom: 18,
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div className="agreement-copy-icon" style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: agreementCopyFile ? 'rgba(99,102,241,0.12)' : form.agreementCopy ? 'rgba(16,185,129,0.12)' : 'var(--surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: agreementCopyFile ? 'var(--brand)' : form.agreementCopy ? '#10b981' : 'var(--tx-4)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
              }}>
                <Zap size={22} />
              </div>
              <div className="agreement-copy-text" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--tx-1)', marginBottom: 4 }}>10. Agreement Copy</div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', opacity: 0.8 }}>
                  {agreementCopyFile
                    ? `✓ ${agreementCopyFile.name} (${(agreementCopyFile.size / 1024).toFixed(0)} KB)`
                    : form.agreementCopy
                    ? '✓ Legal agreement document is on file'
                    : 'Attach the signed legal agreement (PDF, Word, or Image)'}
                </div>
              </div>
              <div className="agreement-copy-actions" style={{ display: 'flex', gap: 12 }}>
                {form.agreementCopy && !agreementCopyFile && (
                  <a href={toAssetUrl(form.agreementCopy)} target="_blank" rel="noopener noreferrer" className="studio-btn studio-btn-ghost" style={{ padding: '10px 16px', fontSize: '12px', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>View Doc</a>
                )}
                {agreementCopyFile ? (
                  <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => setAgreementCopyFile(null)}>Remove</button>
                ) : (
                  <label className="studio-btn studio-btn-primary" style={{ padding: '10px 20px', fontSize: '12px', cursor: 'pointer', margin: 0, boxShadow: '0 4px 10px rgba(var(--brand-rgb), 0.2)' }}>
                    <Clock size={16} /> Upload Copy <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: 'none' }} onChange={handleAgreementCopyChange} />
                  </label>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  };

  const mutation = useMutation({
    mutationFn: (data: Partial<Customer> | FormData) =>
      isEdit ? api.patch(`/customers/${id}`, data) : api.post('/customers', data),
    meta: {
      invalidateQueryKeys: [
        ['customers'],
        ['customer', id],
        ['customers-stats'],
        ['customers-management-pages'],
        ['customers-management-insights'],
        ['customers-product-list'],
        ['customers-tdl-list'],
        ['customers-cloud-list'],
        ['customers-tss-list'],
      ],
    },
    onSuccess: async (res) => {
      const updatedCustomer = res.data?.data;
      if (updatedCustomer?._id) {
        queryClient.setQueryData(['customer', updatedCustomer._id], updatedCustomer);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customer', id], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-stats'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-management-pages'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-management-insights'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-product-list'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['customers-tss-list'], refetchType: 'all' }),
      ]);
      toast.success('Successfully provisioned');
      const fromDetailsModal = (location.state as any)?.fromDetailsModal;
      navigate('/customers', { state: fromDetailsModal ? { openCustomerId: id } : undefined });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Error saving customer data';
      toast.error(message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex-center" style={{ height: '50vh' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="customer-studio fade-in">
      <div className="studio-layout">
        <main className="studio-main">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              for (const contact of form.keyContacts || []) {
                const mob = cleanPhone(contact.mobile);
                if (mob && !validatePhoneNumber(mob)) {
                  toast.error(`Invalid mobile number format or length${contact.contactName ? ` for ${contact.contactName}` : ''}.`);
                  return;
                }
                const wa = cleanPhone(contact.whatsapp);
                if (wa && !validatePhoneNumber(wa)) {
                  toast.error(`Invalid WhatsApp number format or length${contact.contactName ? ` for ${contact.contactName}` : ''}.`);
                  return;
                }
              }
              mutation.mutate(buildRequestBody());
            }}
          >
            <section className="studio-editor">
              {renderFormContent()}
            </section>

            <div className="customer-form-bottom-actions form-bottom-actions" style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '16px 24px', marginTop: 32,
              boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
            }}>
              <button
                className="btn btn-secondary"
                type="button"
                style={{ borderRadius: 10, padding: '10px 18px', fontWeight: 600 }}
                onClick={() => navigate('/customers')}
              >
                <X size={16} />
                Cancel
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={mutation.isPending}
                style={{ 
                  borderRadius: 12, padding: '10px 24px', fontWeight: 700, 
                  boxShadow: 'var(--sh-brand)', gap: 10 
                }}
              >
                  {mutation.isPending ? (
                    <>
                      <Spinner size={18} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      {isEdit ? 'Update' : 'Register'}
                    </>
                  )}
                </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default CustomerFormPage;
