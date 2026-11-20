import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus, Search, UserPlus, Edit, Trash2, UserCheck, Users, TrendingUp, AlertTriangle, Trophy, Download, FileText, CheckCircle2, XCircle, ArrowRight, Clock, Send, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Customer, Lead, LeadStatus, LeadSource, LeadStatusMaster, Product, TaskStatus, User } from '../../types';
import { Avatar, Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SelectField, SkeletonRow, Spinner, Pagination } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isUserAdmin } from '../../utils/rbac';
import { fmt, PAGE_SIZE_OPTIONS, combineDateTime, extractDate, extractTime } from '../../utils/helpers';
import { exportExcelRows } from '../../utils/excelExport';
import { openTaskCountLabel } from '../../utils/taskAssignment';
import { useDateFilter } from '../../context/DateFilterContext';

const FALLBACK_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'New', label: 'New' },
  { value: 'Assigned', label: 'Assigned' },
  { value: 'Contacted', label: 'Contacted' },
  { value: 'Followup', label: 'Followup' },
  { value: 'Interested', label: 'Interested' },
  { value: 'Quotation Sent', label: 'Quotation Sent' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Won', label: 'Won' },
  { value: 'Lost', label: 'Not Interested' },
  { value: 'Junk', label: 'Junk' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const LEAD_TYPE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'existing', label: 'Existing' },
];

const FOLLOW_UP_TYPE_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'visit', label: 'Visit' },
  { value: 'sms', label: 'SMS' },
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const value = String(idx + 1).padStart(2, '0');
  return { value, label: value };
});

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const value = String(idx * 5).padStart(2, '0');
  return { value, label: value };
});

const PERIOD_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

const followUpTypeLabel = (value?: string) =>
  FOLLOW_UP_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Follow-up';

const buildDateTimeValue = (date: string, hour: string, minute: string, period: string) => {
  if (!date || !hour || !minute || !period) return '';
  const rawHour = Number(hour);
  if (!Number.isFinite(rawHour)) return '';
  let hour24 = rawHour % 12;
  if (period === 'PM') hour24 += 12;
  return `${date}T${String(hour24).padStart(2, '0')}:${minute}`;
};

const todayInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatLeadStatusLabel = (status?: string): string => {
  if (!status) return '—';
  if (status.toLowerCase() === 'lost') return 'Not Interested';
  return status;
};

const leadStatusToBadge = (status: LeadStatus): string => {
  const normalized = (status || '').toLowerCase().trim();
  if (['converted', 'won', 'accepted'].includes(normalized)) return 'done';
  if (['rejected', 'lost', 'not interested', 'junk'].includes(normalized)) return 'expired';
  if (['quotation sent', 'proposal sent', 'proposal'].includes(normalized)) return 'review';
  if (['follow_up', 'followup', 'in-progress', 'in_progress', 'negotiation'].includes(normalized)) return 'expiring';
  if (['new'].includes(normalized)) return 'active';
  return 'open';
};

const entityName = (value: User | string | undefined, fallback = '—') => (
  typeof value === 'object' && value ? value.name : fallback
);

const moneyValue = (value?: number) => (value != null ? fmt.currency(value) : '—');

const assignerValue = (value: User | string | undefined) => {
  if (typeof value === 'object' && value) return value._id || '';
  const raw = String(value || '').trim();
  return raw.toLowerCase() === 'unassigned' ? '' : raw;
};

const customerProductList = (customer?: Customer): string[] => {
  if (!customer) return [];
  return Array.from(new Set([
    ...(customer.products || []),
    ...(customer.services || []).map((service) => service.product),
    ...(customer.serialNoInfo || []).map((row) => row.product),
  ].map((product) => String(product || '').trim()).filter(Boolean)));
};

const LeadsPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const userRole = (typeof currentUser?.role === 'string' ? currentUser.role : (currentUser?.role as any)?.name || '').toLowerCase();
  const isAdmin = isUserAdmin(currentUser) || hasPermission(currentUser, 'employees.list');

  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [status, setStatus] = useState('all');
  const [taskStatus, setTaskStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [assignedTo, setAssignedTo] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setSearch(q);
    }
  }, [searchParams]);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'activities' | 'history' | 'conversion'>('overview');
  const [followUpLeadId, setFollowUpLeadId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFollowUpId, setDeleteFollowUpId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const getInitialForm = () => ({
    leadType: 'new',
    customerId: '',
    leadDate: todayInputValue(),
    leadTime: extractTime(new Date()),
    source: '',
    name: '',
    email: '',
    phone: '',
    companyName: '',
    locationArea: '',
    fullAddress: '',
    existingProducts: [] as string[],
    interestedProduct: '',
    requirementDescription: '',
    pricing: '',
    status: '' as LeadStatus,
    priority: 'medium',
    expectedClosingDate: '',
    lastFollowupDate: '',
    nextFollowupDate: '',
    nextFollowupTime: '',
    notes: '',
    assignedTo: '',
    createdBy: currentUser?._id || '',
  });

  const [form, setForm] = useState(() => getInitialForm());

  const [followUpForm, setFollowUpForm] = useState({
    followUpType: 'call',
    scheduledDate: '',
    scheduledHour: '10',
    scheduledMinute: '00',
    scheduledPeriod: 'AM',
    remarks: '',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    assignedTo: '',
    assignedAt: todayInputValue(),
    description: '',
    actionType: 'assign' as 'assign' | 'proposal',
  });
  const [unifiedForm, setUnifiedForm] = useState({
    date: todayInputValue(),
    action: 'assign' as 'assign' | 'followup' | 'proposal',
    assignedTo: '',
    followUpType: 'call',
    nextFollowupDate: '',
    description: '',
  });
  const [isSubmittingUnified, setIsSubmittingUnified] = useState(false);

  const { data: staffData } = useQuery({
    queryKey: ['employees-active-for-leads'],
    queryFn: async () => {
      const res = await api.get('/engineers');
      return res.data.data as User[];
    },
  });

  const staff = (staffData || []).filter((emp) => emp?._id && emp?.name && emp.isActive !== false);
  const staffOptions = staff.map((s) => ({ value: s._id, label: s.name }));
  const assignmentStaffOptions = staff.map((s) => ({ value: s._id, label: openTaskCountLabel(s) }));

  const { data: sourcesData } = useQuery({
    queryKey: ['lead-sources-active'],
    queryFn: async () => {
      const res = await api.get('/lead-sources');
      return res.data.data as LeadSource[];
    },
  });

  const leadSourcesList = sourcesData || [];

  const { data: customersData } = useQuery({
    queryKey: ['lead-existing-customers'],
    queryFn: async () => {
      const res = await api.get('/customers/lookup');
      return (res.data?.data || []) as Customer[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: selectedCustomerDoc } = useQuery({
    queryKey: ['single-customer-for-lead', form.customerId],
    queryFn: async () => {
      if (!form.customerId) return null;
      const res = await api.get(`/customers/${form.customerId}`);
      return (res.data?.data || null) as Customer | null;
    },
    enabled: !!form.customerId && form.leadType === 'existing',
    staleTime: 5 * 60 * 1000,
  });

  const customers = customersData || [];
  const customerOptions = useMemo(() => {
    const list: Customer[] = [...customers];
    if (selectedCustomerDoc && !list.some((c) => c._id === selectedCustomerDoc._id)) {
      list.unshift(selectedCustomerDoc);
    }
    return list
      .map((customer) => ({
        value: customer._id,
        label: customer.companyInfo?.customerName || customer.name || 'Company',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [customers, selectedCustomerDoc]);

  const { data: productData } = useQuery({
    queryKey: ['products-active-for-leads'],
    queryFn: async () => {
      const res = await api.get('/products', { params: { limit: '500' } });
      return res.data.data as Product[];
    },
  });

  const products = productData || [];
  const selectedExistingCustomer = selectedCustomerDoc || customers.find((customer) => customer._id === form.customerId);
  const existingCustomerProducts = Array.from(new Set([
    ...customerProductList(selectedExistingCustomer),
    ...(form.existingProducts || []),
  ]));

  const { data: leadStatusesData } = useQuery({
    queryKey: ['lead-statuses-active'],
    queryFn: async () => {
      const res = await api.get('/lead-statuses', { params: { limit: '500' } });
      return res.data.data as LeadStatusMaster[];
    },
  });

  const statusOptions = (leadStatusesData && leadStatusesData.length
    ? leadStatusesData.map((s) => ({
        value: s.name,
        label: s.name.toLowerCase() === 'lost' ? 'Not Interested' : s.name,
      }))
    : FALLBACK_STATUS_OPTIONS);

  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  
  React.useEffect(() => { setPage(1); }, [search, status, source, assignedTo, taskStatus, pageSize, dateKey]);

  const { data: leadData, isLoading } = useQuery({
    queryKey: ['leads', search, status, source, assignedTo, taskStatus, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.status = status;
      if (source !== 'all') params.source = source;
      if (assignedTo !== 'all') params.assignedTo = assignedTo;
      if (taskStatus !== 'all') params.taskStatus = taskStatus;
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/leads', { params });
      return res.data as unknown as { data: Lead[]; pages: number; total: number; };
    },
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['lead-dashboard', dateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/leads/dashboard', { params });
      return res.data.data;
    },
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['lead-detail', detailLeadId],
    enabled: !!detailLeadId,
    retry: 1,
    queryFn: async () => {
      const res = await api.get(`/leads/${detailLeadId}`);
      return res.data as {
        data: Lead;
        statusHistory: Array<any>;
        followUps: Array<any>;
        activities: Array<any>;
        notes: Array<any>;
      };
    },
  });

  const leads: Lead[] = leadData?.data || [];
  const exportLeads = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search.trim()) params.search = search.trim();
    if (status !== 'all') params.status = status;
    if (source !== 'all') params.source = source;
    if (assignedTo !== 'all') params.assignedTo = assignedTo;
    if (hasActiveDateFilter) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    const res = await api.get('/leads', { params });
    exportExcelRows('leads', 'Leads', res.data?.data || []);
  };
  const selectedListLead = detailLeadId ? leads.find((lead) => lead._id === detailLeadId) : undefined;
  const refreshLeadViews = async (leadId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads'] }),
      queryClient.invalidateQueries({ queryKey: ['lead-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['task-staff'] }),
      queryClient.invalidateQueries({ queryKey: ['engineers'] }),
      queryClient.invalidateQueries({ queryKey: ['employees-active-for-leads'] }),
      ...(leadId ? [queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] })] : []),
    ]);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = { ...form };
      if (payload.leadDate) {
        payload.leadDate = combineDateTime(payload.leadDate, payload.leadTime) || payload.leadDate;
      }
      delete payload.leadTime;
      if (String(payload.assignedTo || '').toLowerCase() === 'unassigned') payload.assignedTo = '';
      if (!payload.assignedTo) delete payload.assignedTo;
      if (!payload.createdBy) delete payload.createdBy;
      if (payload.leadType !== 'existing') delete payload.customerId;
      if (payload.leadType !== 'existing') payload.existingProducts = [];
      if (!payload.source) delete payload.source;
      if (!payload.status) payload.status = statusOptions[0]?.value || 'New';
      if (!payload.pricing) delete payload.pricing;
      if (!payload.expectedClosingDate) delete payload.expectedClosingDate;
      if (!payload.lastFollowupDate) delete payload.lastFollowupDate;
      if (payload.nextFollowupDate) {
        payload.nextFollowupDate = combineDateTime(payload.nextFollowupDate, payload.nextFollowupTime) || payload.nextFollowupDate;
      } else {
        delete payload.nextFollowupDate;
      }
      delete payload.nextFollowupTime;
      const res = await api.post('/leads', payload);
      return res.data.data as Lead;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['employees-active-for-leads'], ['task-staff'], ['engineers']] },
    onSuccess: () => {
      toast.success('Lead created');
      setModalOpen(false);
      setForm(getInitialForm());
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create lead'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!activeLead) return;
      const payload: Record<string, any> = { ...form };
      if (payload.leadDate) {
        payload.leadDate = combineDateTime(payload.leadDate, payload.leadTime) || payload.leadDate;
      }
      delete payload.leadTime;
      if (String(payload.assignedTo || '').toLowerCase() === 'unassigned') payload.assignedTo = '';
      if (!payload.assignedTo) payload.assignedTo = null;
      if (!payload.createdBy) delete payload.createdBy;
      if (payload.leadType !== 'existing') payload.customerId = null;
      if (payload.leadType !== 'existing') payload.existingProducts = [];
      if (!payload.pricing) payload.pricing = undefined;
      if (!payload.expectedClosingDate) payload.expectedClosingDate = undefined;
      if (!payload.lastFollowupDate) payload.lastFollowupDate = undefined;
      if (payload.nextFollowupDate) {
        payload.nextFollowupDate = combineDateTime(payload.nextFollowupDate, payload.nextFollowupTime) || payload.nextFollowupDate;
      } else {
        payload.nextFollowupDate = undefined;
      }
      delete payload.nextFollowupTime;
      const res = await api.patch(`/leads/${activeLead._id}`, payload);
      return res.data.data as Lead;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['employees-active-for-leads'], ['task-staff'], ['engineers']] },
    onSuccess: () => {
      toast.success('Lead updated');
      setModalOpen(false);
      setForm(getInitialForm());
      setActiveLead(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update lead'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/leads/${id}`),
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard']] },
    onSuccess: () => {
      toast.success('Lead deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete lead'),
  });

  const deleteFollowUpMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/leads/followups/${id}`),
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId], ['employees-active-for-leads'], ['task-staff'], ['engineers']] },
    onSuccess: async () => {
      await refreshLeadViews(detailLeadId);
      toast.success('Follow-up deleted');
      setDeleteFollowUpId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete follow-up'),
  });

  const deleteActivityMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/leads/activities/${id}`),
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId], ['tasks'], ['tasks-dashboard']] },
    onSuccess: async () => {
      await refreshLeadViews(detailLeadId);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-dashboard'] });
      toast.success('Activity deleted');
      setDeleteActivityId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete activity'),
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${id}`),
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId], ['tasks'], ['tasks-dashboard']] },
    onSuccess: async () => {
      await refreshLeadViews(detailLeadId);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-dashboard'] });
      toast.success('Task deleted');
      setDeleteTaskId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete task'),
  });

  const taskStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/tasks/${id}`, { status });
      return res.data.data;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId], ['tasks'], ['tasks-dashboard']] },
    onSuccess: async () => {
      if (detailLeadId) await refreshLeadViews(detailLeadId);
      toast.success('Task status updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update task status'),
  });

  const followUpStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/leads/follow-ups/${id}`, { status });
      return res.data.data;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId]] },
    onSuccess: async () => {
      if (detailLeadId) await refreshLeadViews(detailLeadId);
      toast.success('Follow-up status updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update follow-up status'),
  });

  const [handoverTask, setHandoverTask] = useState<any | null>(null);
  const [handoverForm, setHandoverForm] = useState({
    status: 'done' as TaskStatus,
    actionType: 'complete' as 'review' | 'forward' | 'complete' | 'proposal' | 'lost',
    completionDate: '',
    completionTime: '',
    assignedTo: '',
    dueDate: '',
    description: '',
    reason: '',
    proposalNotes: '',
    additionalNotes: '',
    scheduleFollowUp: false,
    nextAssignee: '',
    nextDueDate: '',
    nextType: 'call' as 'call' | 'meeting' | 'email' | 'task' | 'demo',
    nextDescription: '',
  });

  const openHandover = (task: any, targetStatus: TaskStatus = 'done') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const defaultDate = `${yyyy}-${mm}-${dd}`;
    const defaultTime = `${hh}:${min}`;

    setHandoverTask(task);
    setHandoverForm({
      status: targetStatus,
      actionType: targetStatus === 'review' ? 'review' : 'complete',
      completionDate: defaultDate,
      completionTime: defaultTime,
      assignedTo: '',
      dueDate: '',
      description: '',
      reason: '',
      proposalNotes: '',
      additionalNotes: '',
      scheduleFollowUp: false,
      nextAssignee: '',
      nextDueDate: '',
      nextType: 'call',
      nextDescription: '',
    });
  };

  const handoverMut = useMutation({
    mutationFn: async () => {
      if (!handoverTask) return null;
      const targetStatus =
        handoverForm.actionType === 'lost' || handoverForm.actionType === 'proposal'
          ? 'done'
          : handoverForm.actionType === 'review'
          ? 'review'
          : handoverForm.actionType === 'forward'
          ? 'todo'
          : 'done';

      let completedAt: string | undefined = undefined;
      if (handoverForm.completionDate) {
        const timePart = handoverForm.completionTime || '00:00';
        completedAt = new Date(`${handoverForm.completionDate}T${timePart}:00`).toISOString();
      }

      const payload: Record<string, unknown> = {
        status: targetStatus,
        actionType: handoverForm.actionType,
        completedAt: (handoverForm.actionType === 'complete' || handoverForm.actionType === 'lost') ? completedAt : undefined,
        leadOutcome: handoverForm.actionType === 'lost' ? 'lost' : undefined,
        description: (
          handoverForm.actionType === 'proposal' ? handoverForm.proposalNotes
          : handoverForm.actionType === 'lost' ? (handoverForm.additionalNotes || handoverForm.reason)
          : handoverForm.description
        ) || undefined,
      };

      if ((handoverForm.actionType === 'forward' || handoverForm.actionType === 'proposal') && handoverForm.assignedTo) {
        payload.assignedTo = handoverForm.assignedTo;
        if (handoverForm.dueDate) {
          payload.dueDate = handoverForm.dueDate;
        }
      } else if (handoverForm.actionType === 'proposal' && handoverForm.dueDate) {
        payload.dueDate = handoverForm.dueDate;
      }

      if (handoverForm.actionType === 'review' && handoverForm.assignedTo) {
        payload.assignedTo = handoverForm.assignedTo;
      }

      if (handoverForm.actionType === 'complete' && handoverForm.scheduleFollowUp) {
        payload.scheduleFollowUp = true;
        if (handoverForm.nextAssignee) payload.nextAssignee = handoverForm.nextAssignee;
        if (handoverForm.nextDueDate) payload.nextDueDate = handoverForm.nextDueDate;
        if (handoverForm.nextType) payload.nextType = handoverForm.nextType;
        if (handoverForm.nextDescription) payload.nextDescription = handoverForm.nextDescription;
      }

      const res = await api.patch(`/tasks/${handoverTask._id}`, payload);
      return res.data.data;
    },
    meta: {
      invalidateQueryKeys: [
        ['leads'],
        ['lead-dashboard'],
        ['lead-detail', detailLeadId],
        ['tasks'],
        ['tasks-dashboard'],
      ],
    },
    onSuccess: async () => {
      if (detailLeadId) await refreshLeadViews(detailLeadId);
      const nextStaffName = staff.find((s) => s._id === (handoverForm.actionType === 'forward' ? handoverForm.assignedTo : handoverForm.nextAssignee))?.name;
      if (handoverForm.actionType === 'lost') {
        toast.success('Task completed and lead marked as Not Interested');
      } else if (handoverForm.actionType === 'forward' && nextStaffName) {
        toast.success(`Task forwarded to ${nextStaffName}!`);
      } else if (handoverForm.actionType === 'review') {
        toast.success('Task submitted for review!');
      } else if (handoverForm.actionType === 'proposal') {
        toast.success('Task completed! Redirecting to proposal creation...');
        const leadId = detailLead?._id || (typeof handoverTask?.lead === 'object' && handoverTask?.lead ? (handoverTask.lead as any)._id : handoverTask?.lead);
        const custId = detailLead?.customerId ? (typeof detailLead.customerId === 'object' ? (detailLead.customerId as any)._id : detailLead.customerId) : undefined;
        const taskId = handoverTask?._id;
        setHandoverTask(null);
        const qp = new URLSearchParams();
        if (taskId) qp.set('taskId', taskId);
        if (leadId) qp.set('leadId', leadId);
        if (custId) qp.set('customerId', custId);
        navigate(`/proposals/new?${qp.toString()}`);
        return;
      } else {
        if (handoverForm.scheduleFollowUp && handoverForm.nextDueDate) {
          toast.success(`Task completed & next follow-up scheduled!`);
        } else {
          toast.success(`Task marked as Completed!`);
        }
      }
      setHandoverTask(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update task'),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: LeadStatus }) => {
      const res = await api.patch(`/leads/${id}/status`, { status: next });
      return res.data.data as Lead;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId]] },
    onSuccess: async (_updated, variables) => {
      await refreshLeadViews(variables.id);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });

  const convertMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/leads/${id}/convert`);
      return res.data.data as { mode: 'created' | 'linked_existing'; customer: Customer; lead: Lead };
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['customers'], ['customers-stats'], ['customers-all'], ['customers-management-pages'], ['customers-management-insights'], ['lead-detail', detailLeadId]] },
    onSuccess: async (data, variables) => {
      const targetId = variables || detailLeadId;
      if (targetId) {
        await refreshLeadViews(targetId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['customers-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['customers-all'] }),
        queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] }),
        queryClient.invalidateQueries({ queryKey: ['customers-management-insights'] }),
        queryClient.invalidateQueries({ queryKey: ['lead-detail'] }),
      ]);
      const customerName = data.customer?.companyInfo?.customerName || data.customer?.name || 'Customer';
      toast.success(
        data.mode === 'created'
          ? `Customer "${customerName}" created from lead`
          : `Lead linked to existing customer "${customerName}"`
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to convert lead'),
  });

  const assignMut = useMutation({
    mutationFn: async ({ id, userId, assignedAt, description }: { id: string; userId: string; assignedAt: string; description?: string }) => {
      const res = await api.patch(`/leads/${id}/assign`, { assignedTo: userId, assignedAt, description });
      return res.data.data as Lead;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId]] },
    onSuccess: async (_updated, variables) => {
      await refreshLeadViews(variables.id);
      toast.success(assignmentForm.actionType === 'proposal' ? 'Proposal request recorded' : 'Lead assigned');
      setAssignmentForm((p) => ({ ...p, assignedTo: '', description: '', actionType: 'assign' }));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign lead'),
  });

  const followUpMut = useMutation({
    mutationFn: async () => {
      const targetLeadId = followUpLeadId || detailLeadId;
      // Throw (not return null) so onSuccess/toast don't fire when nothing was sent.
      if (!targetLeadId) throw new Error('No lead selected');
      if (!followUpForm.scheduledDate) throw new Error('Please select a follow-up date');
      const res = await api.post(`/leads/${targetLeadId}/followups`, {
        followUpType: followUpForm.followUpType,
        scheduledAt: buildDateTimeValue(
          followUpForm.scheduledDate,
          followUpForm.scheduledHour,
          followUpForm.scheduledMinute,
          followUpForm.scheduledPeriod
        ),
        remarks: followUpForm.remarks,
      });
      return res.data.data;
    },
    meta: { invalidateQueryKeys: [['leads'], ['lead-dashboard'], ['lead-detail', detailLeadId]] },
    onSuccess: async () => {
      const refreshedLeadId = followUpLeadId || detailLeadId;
      await refreshLeadViews(refreshedLeadId);
      toast.success('Follow-up scheduled');
      setFollowUpLeadId(null);
      setFollowUpForm({ followUpType: 'call', scheduledDate: '', scheduledHour: '10', scheduledMinute: '00', scheduledPeriod: 'AM', remarks: '' });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to schedule follow-up'),
  });



  const openCreate = () => {
    setModalMode('create');
    setActiveLead(null);
    setForm(getInitialForm());
    setModalOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setModalMode('edit');
    setActiveLead(lead);
    setForm({
      leadType: lead.leadType || 'new',
      customerId: typeof lead.customerId === 'object' ? lead.customerId?._id || '' : String(lead.customerId || ''),
      leadDate: extractDate(lead.leadDate || lead.createdAt) || (lead.leadDate || lead.createdAt || '').slice(0, 10),
      leadTime: extractTime(lead.leadDate || lead.createdAt) || '',
      source: lead.source || '',
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName || '',
      locationArea: lead.locationArea || '',
      fullAddress: lead.fullAddress || '',
      existingProducts: lead.existingProducts || [],
      interestedProduct: lead.interestedProduct || '',
      requirementDescription: lead.requirementDescription || '',
      pricing: lead.pricing != null ? String(lead.pricing) : '',
      status: lead.status,
      priority: lead.priority,
      expectedClosingDate: lead.expectedClosingDate ? lead.expectedClosingDate.slice(0, 10) : '',
      lastFollowupDate: lead.lastFollowupDate ? lead.lastFollowupDate.slice(0, 10) : '',
      nextFollowupDate: extractDate(lead.nextFollowupDate) || (lead.nextFollowupDate ? lead.nextFollowupDate.slice(0, 10) : ''),
      nextFollowupTime: extractTime(lead.nextFollowupDate) || '',
      notes: lead.notes || '',
      assignedTo: assignerValue(lead.assignedTo),
      createdBy: typeof lead.createdBy === 'object' ? lead.createdBy?._id || '' : String(lead.createdBy || ''),
    });
    setModalOpen(true);
  };

  const fillFromCustomer = (customerId: string) => {
    const customer = (selectedCustomerDoc && selectedCustomerDoc._id === customerId)
      ? selectedCustomerDoc
      : customers.find((c) => c._id === customerId);
    if (!customer) {
      setForm((p) => ({ ...p, customerId }));
      return;
    }

    const primary = customer.primaryContactInfo;
    const firstKeyContact = customer.keyContacts?.[0];
    const branch = customer.branches?.[0];
    const contactName = primary?.contactName1 || firstKeyContact?.contactName || customer.contact || '';
    const email = primary?.email || firstKeyContact?.email || branch?.email || customer.email || '';
    const phone = primary?.mobile || firstKeyContact?.mobile || branch?.mobile || customer.phone || '';
    const companyName = customer.companyInfo?.customerName || customer.name || '';
    const locationArea = customer.companyInfo?.locationArea || branch?.locationArea || branch?.area || '';
    const fullAddress = customer.companyInfo?.fullAddress || branch?.fullAddress || customer.address || '';

    setForm((p) => ({
      ...p,
      customerId,
      name: contactName,
      companyName,
      email,
      phone,
      locationArea,
      fullAddress,
      existingProducts: (p.existingProducts || []).filter((product) => customerProductList(customer).includes(product)),
    }));
  };

  useEffect(() => {
    if (form.leadType === 'existing' && form.customerId && selectedCustomerDoc && selectedCustomerDoc._id === form.customerId) {
      const fullProducts = customerProductList(selectedCustomerDoc);
      if (fullProducts.length > 0) {
        setForm((p) => ({
          ...p,
          existingProducts: Array.from(new Set([...(p.existingProducts || []), ...fullProducts])),
        }));
      }
    }
  }, [form.leadType, form.customerId, selectedCustomerDoc]);

  const handleLeadTypeChange = (leadType: string) => {
    setForm((p) => {
      const isSwitching = p.leadType !== leadType;
      return {
        ...p,
        leadType,
        customerId: leadType === 'existing' ? p.customerId : '',
        ...(isSwitching ? {
          name: '',
          companyName: '',
          email: '',
          phone: '',
          locationArea: '',
          fullAddress: '',
          existingProducts: [],
        } : {})
      };
    });
  };

  const toggleExistingProduct = (product: string) => {
    setForm((p) => {
      const current = p.existingProducts || [];
      const next = current.includes(product)
        ? current.filter((item) => item !== product)
        : [...current, product];
      return { ...p, existingProducts: next };
    });
  };

  const detailLead = detailData?.data || selectedListLead;
  const detailIsConverted = !!detailLead && (
    ['won', 'converted'].includes(String(detailLead.status || '').toLowerCase()) ||
    !!detailLead.convertedAt
  );
  const detailActivities = detailData?.activities || [];
  const detailFollowUps = detailData?.followUps || [];
  const detailNotes = detailData?.notes || [];
  const detailTasks = (detailData as any)?.tasks || [];
  const detailAssigneeName = entityName(detailLead?.assignedTo);
  const detailCreatorName = entityName(detailLead?.createdBy, currentUser?.name || '—');
  const staffNameById = new Map(staff.map((s) => [s._id, s.name]));
  const userNameFromId = (id?: string | null, fallback = '—') => {
    if (!id) return fallback;
    return staffNameById.get(String(id)) || fallback;
  };
  const activityFromValue = (activity: any) => {
    const fromId = String(activity.metadata?.from || activity.actor?._id || activity.actor || '');
    if (detailLead?.createdBy) {
      const creatorId = String((detailLead.createdBy as any)?._id || detailLead.createdBy || '');
      if (fromId && fromId === creatorId) return detailCreatorName;
    }
    if (detailLead?.assignedTo) {
      const assigneeId = String((detailLead.assignedTo as any)?._id || detailLead.assignedTo || '');
      if (fromId && fromId === assigneeId) return detailAssigneeName;
    }
    if (activity.metadata?.from) return userNameFromId(activity.metadata.from, String(activity.metadata.from));
    if (activity.type === 'lead_created' || activity.type === 'assigned') {
      if (activity.actor) return entityName(activity.actor);
      if (detailLead?.createdBy) return entityName(detailLead.createdBy);
      return detailCreatorName || '—';
    }
    if (activity.actor) return entityName(activity.actor);
    return '—';
  };
  const activityToValue = (activity: any) => {
    const toId = String(activity.metadata?.to || activity.metadata?.assignedTo || activity.assignedTo?._id || activity.assignedTo || '');
    if (detailLead?.assignedTo) {
      const assigneeId = String((detailLead.assignedTo as any)?._id || detailLead.assignedTo || '');
      if (toId && toId === assigneeId) return detailAssigneeName;
    }
    if (detailLead?.createdBy) {
      const creatorId = String((detailLead.createdBy as any)?._id || detailLead.createdBy || '');
      if (toId && toId === creatorId) return detailCreatorName;
    }
    if (activity.metadata?.to) return userNameFromId(activity.metadata.to, String(activity.metadata.to));
    if (activity.metadata?.assignedTo) return userNameFromId(activity.metadata.assignedTo, String(activity.metadata.assignedTo));
    if (activity.assignedTo) return entityName(activity.assignedTo);
    if (activity.type === 'assigned' || activity.type === 'reassigned') {
      if (detailLead?.assignedTo) return entityName(detailLead.assignedTo);
    }
    return '—';
  };
  const activityDateValue = (activity: any) => activity.metadata?.assignedAt || activity.createdAt;
  const detailFollowUpItems = detailLead ? [
    ...detailFollowUps.map((item: any) => ({
      id: item._id,
      date: item.scheduledAt || item.createdAt,
      title: item.remarks ? `${followUpTypeLabel(item.followUpType)} - ${item.remarks}` : `${followUpTypeLabel(item.followUpType)} scheduled`,
      actor: entityName(item.createdBy || item.assignedTo, detailAssigneeName),
      canDelete: true,
    })),
    ...(detailLead.lastFollowupDate ? [{
      id: 'last-followup',
      date: detailLead.lastFollowupDate,
      title: 'Last follow-up',
      actor: detailAssigneeName,
      canDelete: false,
    }] : []),
    ...(detailLead.nextFollowupDate ? [{
      id: 'next-followup',
      date: detailLead.nextFollowupDate,
      title: 'Next follow-up',
      actor: detailAssigneeName,
      canDelete: false,
    }] : []),
    ...detailNotes.map((item: any) => ({
      id: item._id,
      date: item.createdAt,
      title: item.text || 'Lead note',
      actor: entityName(item.createdBy, detailCreatorName),
      canDelete: true,
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()) : [];
  const assignmentRows = React.useMemo(() => {
    if (!detailLead) return [];
    const list: any[] = [];

    detailActivities
      .filter((activity: any) =>
        ['assigned', 'reassigned', 'lead_created', 'status_changed'].includes(activity.type) ||
        activity.metadata?.to ||
        activity.metadata?.assignedTo ||
        activity.message?.toLowerCase().includes('proposal')
      )
      .forEach((activity: any) => {
        let actionLabel = 'Assigned';
        let badgeStatus = 'assigned';
        if (activity.type === 'lead_created') {
          actionLabel = 'Created';
          badgeStatus = 'created';
        } else if (activity.type === 'reassigned') {
          actionLabel = 'Reassigned';
          badgeStatus = 'reassigned';
        } else if (activity.type === 'status_changed') {
          actionLabel = 'Status Changed';
          badgeStatus = 'neutral';
        } else if (activity.message?.toLowerCase().includes('proposal')) {
          actionLabel = 'Proposal';
          badgeStatus = 'proposal';
        }

        const from = activityFromValue(activity);
        const to = activityToValue(activity);
        const desc = (activity.metadata?.description as string) || (activity.metadata?.remarks as string) || activity.message || '—';

        list.push({
          id: activity._id,
          date: activity.metadata?.assignedAt || activity.createdAt,
          actionLabel,
          badgeStatus,
          from,
          to,
          description: desc,
          changedBy: entityName(activity.actor, detailCreatorName),
        });
      });

    if (list.length === 0 && detailLead.assignedTo) {
      list.push({
        id: 'initial-assignment',
        date: detailLead.createdAt,
        actionLabel: 'Assigned',
        badgeStatus: 'assigned',
        from: '—',
        to: detailAssigneeName,
        description: detailLead.requirementDescription || 'Initial assignment',
        changedBy: detailCreatorName,
      });
    }

    return list.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  }, [detailLead, detailActivities, detailAssigneeName, detailCreatorName]);

  const unifiedActivities = React.useMemo(() => {
    if (!detailLead) return [];
    const list: any[] = [];

    // 1. Initial Assignment from Create Lead form (ALWAYS Row 1: Shows Assigned By creator with form details)
    if (detailLead.assignedTo) {
      list.push({
        id: `initial-assign-${detailLead._id}`,
        type: 'initial_assignment',
        date: detailLead.leadDate || detailLead.createdAt,
        createdAt: detailLead.createdAt,
        actionLabel: 'Assigned',
        badgeStatus: 'assigned',
        rawStatus: 'assigned',
        fromEmployee: detailCreatorName,
        toEmployee: detailCreatorName,
        followUpType: 'Task',
        nextFollowUp: detailLead.nextFollowupDate || null,
        description: detailLead.notes || detailLead.requirementDescription || '—',
        canDelete: false,
      });
    }

    // 2. Map Follow-Ups (calls, visits, whatsapp, meetings created for this lead)
    detailFollowUps.forEach((f: any) => {
      if (f.followUpType === 'task') return;

      const isCompleted = f.status === 'completed';
      // Skip initial creation follow-up placeholder if still pending, since Row 1 already represents the initial assignment
      const isInitialCreationFollowUp =
        !isCompleted &&
        detailLead.createdAt &&
        Math.abs(new Date(f.createdAt || 0).getTime() - new Date(detailLead.createdAt).getTime()) < 15000 &&
        (!f.remarks || f.remarks === detailLead.notes || f.remarks === 'Initial follow-up');

      if (isInitialCreationFollowUp) {
        return;
      }

      list.push({
        id: f._id,
        type: 'followup',
        date: isCompleted ? (f.completedAt || f.updatedAt || f.scheduledAt || f.createdAt) : (f.scheduledAt || f.createdAt),
        createdAt: f.createdAt,
        actionLabel: isCompleted ? 'Completed' : 'Follow-Up',
        badgeStatus: isCompleted ? 'resolved' : 'followup',
        rawStatus: f.status || (isCompleted ? 'completed' : 'pending'),
        isCompleted,
        fromEmployee: entityName(f.createdBy, detailCreatorName),
        toEmployee: entityName(f.assignedTo, detailAssigneeName),
        followUpType: followUpTypeLabel(f.followUpType),
        nextFollowUp: isCompleted ? (f.scheduledAt || null) : null,
        description: isCompleted ? (f.remarks || 'Follow-up completed') : (f.remarks || '—'),
        canDelete: true,
      });
    });

    // 3. Map Task status progress (Row 2 onwards: Assigned employee's task progression)
    const openTasks = detailTasks.filter((t: any) => t.status !== 'done' && t.status !== 'completed');
    if (openTasks.length > 0) {
      openTasks.forEach((t: any) => {
        const isTodo = !t.status || t.status === 'todo';

        const statusLabel =
          t.status === 'in_progress' ? 'In Progress' :
          t.status === 'review' ? 'Review' :
          'TODO';
        const badgeStatus =
          t.status === 'in_progress' ? 'in_progress' :
          t.status === 'review' ? 'review' :
          'todo';

        list.push({
          id: t._id,
          type: 'task',
          date: t.updatedAt || t.taskDate || t.createdAt,
          createdAt: t.createdAt,
          actionLabel: statusLabel,
          badgeStatus,
          rawStatus: t.status || 'todo',
          rawTask: t,
          fromEmployee: entityName(t.createdBy, detailCreatorName),
          toEmployee: entityName(t.assignedTo, detailAssigneeName),
          followUpType: isTodo ? '—' : (t.taskType ? followUpTypeLabel(t.taskType) : 'Task'),
          nextFollowUp: isTodo ? null : (t.dueDate || null),
          description: isTodo ? '—' : (t.description || '—'),
          canDelete: true,
        });
      });
    } else if (detailLead.assignedTo) {
      // Initial TODO row before task loads or if newly assigned
      list.push({
        id: `initial-todo-${detailLead._id}`,
        type: 'task',
        date: detailLead.leadDate || detailLead.createdAt,
        createdAt: detailLead.createdAt,
        actionLabel: 'TODO',
        badgeStatus: 'todo',
        rawStatus: 'todo',
        fromEmployee: detailCreatorName,
        toEmployee: detailAssigneeName,
        followUpType: '—',
        nextFollowUp: null,
        description: '—',
        canDelete: false,
      });
    }

    // 4. Map Activities (completed tasks with forwarding details, proposals, manual reassignments, and deal lost)
    detailActivities.forEach((a: any) => {
      if (a.type === 'lead_created' || a.type === 'assigned') return;

      // Deal Lost / Not Interested event
      if (a.type === 'lead_lost' || a.metadata?.status === 'Lost' || a.metadata?.status === 'Not Interested' || a.message?.toLowerCase().includes('marked as lost') || a.message?.toLowerCase().includes('not interested')) {
        list.push({
          id: a._id,
          type: 'activity',
          date: (a.metadata?.completedAt as string) || a.createdAt,
          createdAt: a.createdAt,
          actionLabel: 'Not Interested',
          badgeStatus: 'danger',
          fromEmployee: entityName(a.actor || a.metadata?.completedBy, detailCreatorName),
          toEmployee: entityName(a.actor || a.metadata?.completedBy, detailCreatorName),
          followUpType: 'Lead / Deal',
          nextFollowUp: null,
          description: (a.metadata?.description as string) || a.message || 'Deal marked as Not Interested',
          canDelete: true,
        });
        return;
      }

      // Review submission event: already represented by detailTasks
      if (a.metadata?.status === 'review' || a.message?.toLowerCase().includes('review')) {
        return;
      }

      // Completed & Forwarded task events
      if (a.type === 'task_completed' || a.message?.toLowerCase().includes('task completed') || a.message?.toLowerCase().includes('completed by') || a.message?.toLowerCase().includes('forwarded by')) {
        const nextDate = a.metadata?.scheduledAt ? a.metadata.scheduledAt : null;
        const isForwarded = a.metadata?.actionType === 'forward' || a.message?.toLowerCase().includes('forwarded by') || (a.metadata?.to && a.metadata.to !== String(a.actor));
        list.push({
          id: a._id,
          type: 'activity',
          date: (a.metadata?.completedAt as string) || a.createdAt,
          createdAt: a.createdAt,
          actionLabel: isForwarded ? 'Forwarded' : 'Completed',
          badgeStatus: isForwarded ? 'forwarded' : 'resolved',
          fromEmployee: entityName(a.actor || a.metadata?.completedBy, detailCreatorName),
          toEmployee: isForwarded
            ? entityName(a.metadata?.to, detailAssigneeName)
            : entityName(a.actor || a.metadata?.completedBy, detailCreatorName),
          followUpType: 'Task',
          nextFollowUp: nextDate,
          description: (a.metadata?.description as string) || a.message || (isForwarded ? 'Task forwarded' : 'Task completed'),
          canDelete: true,
        });
        return;
      }

      // Assigned / Reassigned events
      if (a.type === 'reassigned') {
        list.push({
          id: a._id,
          type: 'activity',
          date: a.metadata?.assignedAt || a.createdAt,
          createdAt: a.createdAt,
          actionLabel: 'Reassigned',
          badgeStatus: 'reassigned',
          fromEmployee: activityFromValue(a),
          toEmployee: activityToValue(a),
          followUpType: 'Task',
          nextFollowUp: a.metadata?.scheduledAt || null,
          description: (a.metadata?.description as string) || a.metadata?.remarks || a.message || '—',
          canDelete: true,
        });
        return;
      }

      // Exclude generic internal notifications
      if (['follow_up_added', 'follow_up_updated', 'follow_up_deleted', 'lead_created', 'assigned', 'status_changed'].includes(a.type)) {
        return;
      }
      if (
        a.message?.toLowerCase().includes('follow-up scheduled') ||
        a.message?.toLowerCase().includes('follow-up deleted') ||
        a.message?.toLowerCase().includes('lead created') ||
        a.message?.toLowerCase().includes('lead assigned') ||
        a.message?.toLowerCase().includes('review')
      ) {
        return;
      }

      let actionLabel = 'Follow-Up';
      let badgeStatus = 'followup';
      let rowDesc = (a.metadata?.description as string) || a.metadata?.remarks || a.message || '—';

      if (a.message?.toLowerCase().includes('proposal')) {
        actionLabel = 'Proposal';
        badgeStatus = 'proposal';
      } else {
        if (!a.metadata?.to && !a.metadata?.assignedTo && !a.assignedTo) {
          return;
        }
      }

      list.push({
        id: a._id,
        type: 'activity',
        date: a.metadata?.assignedAt || a.createdAt,
        createdAt: a.createdAt,
        actionLabel,
        badgeStatus,
        fromEmployee: entityName(a.actor, detailCreatorName),
        toEmployee: activityToValue(a),
        followUpType: a.metadata?.followUpType ? followUpTypeLabel(a.metadata.followUpType as string) : 'Task',
        nextFollowUp: a.metadata?.scheduledAt || null,
        description: rowDesc,
        canDelete: true,
      });
    });

    // Sort ascending: Initial assignment is always Row 1, followed by chronological actions
    return list.sort((a, b) => {
      if (a.type === 'initial_assignment') return -1;
      if (b.type === 'initial_assignment') return 1;
      return new Date(a.date || a.createdAt || 0).getTime() - new Date(b.date || b.createdAt || 0).getTime();
    });
  }, [detailLead, detailFollowUps, detailTasks, detailActivities, detailAssigneeName, detailCreatorName]);

  const handleUnifiedSubmit = async () => {
    if (!detailLead) return;
    const currentAssignee = typeof detailLead.assignedTo === 'object' && detailLead.assignedTo ? String((detailLead.assignedTo as any)._id) : String(detailLead.assignedTo || '');
    const targetUserId = unifiedForm.assignedTo || currentAssignee;

    if (!targetUserId && !unifiedForm.nextFollowupDate) {
      toast.error('Please select an employee or follow-up date');
      return;
    }

    setIsSubmittingUnified(true);
    try {
      if (unifiedForm.assignedTo && unifiedForm.assignedTo !== currentAssignee) {
        await api.patch(`/leads/${detailLead._id}/assign`, {
          assignedTo: unifiedForm.assignedTo,
          assignedAt: unifiedForm.date || new Date().toISOString(),
          dueDate: unifiedForm.nextFollowupDate ? new Date(`${unifiedForm.nextFollowupDate}T10:00:00`).toISOString() : undefined,
          description: unifiedForm.description || 'Lead assigned & forwarded',
        });
      } else if (unifiedForm.nextFollowupDate) {
        const scheduledAt = new Date(`${unifiedForm.nextFollowupDate}T10:00:00`);
        await api.post(`/leads/${detailLead._id}/follow-ups`, {
          assignedTo: targetUserId || undefined,
          followUpType: unifiedForm.followUpType || 'call',
          scheduledAt: scheduledAt.toISOString(),
          remarks: unifiedForm.description || 'Follow-up scheduled',
        });
      } else if (unifiedForm.description) {
        await api.post(`/leads/${detailLead._id}/follow-ups`, {
          assignedTo: targetUserId || undefined,
          followUpType: unifiedForm.followUpType || 'call',
          scheduledAt: new Date().toISOString(),
          remarks: unifiedForm.description || 'Activity recorded',
        });
      }
      toast.success(unifiedForm.assignedTo && unifiedForm.assignedTo !== currentAssignee ? 'Lead assigned & forwarded' : 'Activity recorded');
      setUnifiedForm((p) => ({ ...p, description: '', nextFollowupDate: '', assignedTo: '' }));
      await refreshLeadViews(detailLead._id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to process activity');
    } finally {
      setIsSubmittingUnified(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Lead Management</div>
          <div className="page-subtitle">
            Track, assign, convert and report sales leads
            {hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: 'var(--brand)' }}>• {headerDateLabel}</span>}
          </div>
        </div>
      </div>

      {(() => {
        const wonCount = dashboardData?.byStatus
          ?.filter((s: any) => ['won', 'converted'].includes(String(s._id).toLowerCase()))
          .reduce((sum: number, s: any) => sum + (s.count || 0), 0) || 0;

        const kpis = [
          { label: 'Total Leads', value: dashboardData?.totalLeads || 0, icon: <Users size={20} />, bg: 'var(--brand-light)', color: 'var(--brand)', hint: 'All registered leads' },
          { label: 'Conversion Rate', value: `${dashboardData?.conversionRate || 0}%`, icon: <TrendingUp size={20} />, bg: 'var(--teal-bg)', color: 'var(--teal)', hint: 'Leads converted to won' },
          { label: 'Missed Follow-ups', value: dashboardData?.missedFollowUps || 0, icon: <AlertTriangle size={20} />, bg: 'var(--red-bg)', color: 'var(--red)', hint: 'Attention needed' },
          { label: 'Won / Converted', value: wonCount, icon: <Trophy size={20} />, bg: 'var(--green-bg)', color: 'var(--green)', hint: 'Successfully closed' },
        ];

        return (
          <div className="kpi-grid" style={{ marginBottom: 14 }}>
            {kpis.map((kpi, i) => (
              <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="kpi-icon-wrap" style={{ background: kpi.bg }}><span style={{ color: kpi.color }}>{kpi.icon}</span></div>
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>{kpi.hint}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="card card-table-sep fade-in-up" style={{ animationDelay: '200ms' }}>
        <div className="card-header table-toolbar-row">
            <div className="search-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="search"
                id="lead-board-search"
                name="lead_board_search_query"
                className="search-input"
                placeholder="Search name, email, phone..."
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <Select className="filter-select page-size-select" value={pageSize} onChange={setPageSize} options={PAGE_SIZE_OPTIONS} />
              <Select className="filter-select" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All Status' }, ...statusOptions]} />
              <Select className="filter-select" value={source} onChange={setSource} options={[{ value: 'all', label: 'All Sources' }, ...leadSourcesList.map((s) => ({ value: s.name, label: s.name }))]} />
            </div>
            <div className="toolbar-actions">
              <button className="btn btn-export btn-sm" onClick={exportLeads}><Download size={13} /> Export</button>
              <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={13} /> New Lead</button>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="table-pro table-center">
              <thead>
                <tr>
                  <th className="sno-col">S NO</th>
                  <th>Lead ID</th>
                  <th>Lead</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Date / Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={11} />)
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={11}><EmptyState icon={<UserPlus size={22} />} title="No leads found" description="Try adjusting filters or create a new lead." /></td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => (
                    <tr key={lead._id}>
                      <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                      <td style={{ fontWeight: 800, color: 'var(--brand)', fontSize: 12 }}>
                        <button
                          type="button"
                          className="record-id-link"
                          onClick={() => { setDetailLeadId(lead._id); setDetailTab('overview'); }}
                        >
                          {lead.leadId}
                        </button>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{lead.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{lead.email ? `${lead.email} · ` : ''}{lead.phone}</div>
                        </div>
                      </td>
                      <td>{lead.companyName || '—'}</td>
                      <td>{lead.interestedProduct || '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{lead.source || 'manual'}</td>
                      <td><Badge status={leadStatusToBadge(lead.status)} label={formatLeadStatusLabel(lead.status)} /></td>
                      <td><Badge status={lead.priority === 'critical' || lead.priority === 'high' ? 'expired' : lead.priority === 'medium' ? 'expiring' : 'active'} label={lead.priority.toUpperCase()} dot={false} /></td>
                      <td>
                        <span className="lead-assigned-chip">
                          {typeof lead.assignedTo === 'object' ? lead.assignedTo?.name || 'Unassigned' : 'Unassigned'}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 650, color: 'var(--tx-2)' }}>{fmt.date(lead.leadDate || lead.createdAt)}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--tx-4)' }}>{fmt.time(lead.leadDate || lead.createdAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn-action btn-action-amber" title="Edit Lead" onClick={() => openEdit(lead)}>
                            <Edit size={13} />
                          </button>
                          <button className="btn-action btn-action-red" title="Delete Lead" onClick={() => setDeleteId(lead._id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={(leadData as any)?.pages || 1} onPageChange={setPage} total={(leadData as any)?.total} pageSize={pageSize} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'create' ? 'Create Lead' : 'Edit Lead'}
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())} disabled={createMut.isPending || updateMut.isPending || !form.name || !form.phone}>
              {createMut.isPending || updateMut.isPending ? <Spinner size={14} /> : (modalMode === 'create' ? <Plus size={14} /> : <Edit size={14} />)}
              {createMut.isPending || updateMut.isPending ? 'Saving...' : (modalMode === 'create' ? 'Create Lead' : 'Save Changes')}
            </button>
          </div>
        }
      >
        <div className="form-section-title">Basic Lead Details</div>
        <div className="form-grid-2">
          <SelectField label="Lead Type" value={form.leadType} onChange={handleLeadTypeChange} options={LEAD_TYPE_OPTIONS} />
          {form.leadType === 'existing' ? (
            <SelectField
              label="Company"
              value={form.customerId}
              onChange={fillFromCustomer}
              options={[{ value: '', label: 'Select company' }, ...customerOptions]}
            />
          ) : (
            <InputField label="Company Name" value={form.companyName} onChange={(v) => setForm((p) => ({ ...p, companyName: v }))} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
            <InputField label="Lead Date" value={form.leadDate} onChange={(v) => setForm((p) => ({ ...p, leadDate: v }))} type="date" />
            <InputField label="Lead Time" value={form.leadTime || ''} onChange={(v) => setForm((p) => ({ ...p, leadTime: v }))} type="time" />
          </div>
          <InputField label="Person Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
          <SelectField
            label="Lead Source"
            value={form.source}
            onChange={(v) => setForm((p) => ({ ...p, source: v }))}
            options={leadSourcesList.map(s => ({ value: s.name, label: s.name }))}
            placeholder="Select lead source"
          />
          <InputField label="Email ID" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} type="email" />
          <InputField label="Phone Number" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} type="tel" required />
          <InputField label="Location/Area" value={form.locationArea} onChange={(v) => setForm((p) => ({ ...p, locationArea: v }))} />
          <InputField label="Full Address" value={form.fullAddress} onChange={(v) => setForm((p) => ({ ...p, fullAddress: v }))} className="col-span-2" style={{ gridColumn: '1 / -1' }} />
          {form.leadType === 'existing' && form.customerId && (
            <div className="existing-products-field col-span-2" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Existing Product</label>
              {existingCustomerProducts.length === 0 ? (
                <div className="lead-profile-empty">No purchased products found for this customer.</div>
              ) : (
                <div className="existing-products-grid">
                  {existingCustomerProducts.map((product) => (
                    <label className="existing-product-check" key={product}>
                      <input
                        type="checkbox"
                        checked={(form.existingProducts || []).includes(product)}
                        onChange={() => toggleExistingProduct(product)}
                      />
                      <span>{product}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-section-title">Requirement Details</div>
        <div className="form-grid-2">
          <SelectField label="Interested Product" value={form.interestedProduct} onChange={(v) => setForm((p) => ({ ...p, interestedProduct: v }))} options={products.map((p) => ({ value: p.name, label: p.name }))} placeholder="Select product" />
          <InputField label="Pricing" value={form.pricing} onChange={(v) => setForm((p) => ({ ...p, pricing: v }))} type="number" />
          <SelectField label="Priority" value={form.priority} onChange={(v) => setForm((p) => ({ ...p, priority: v as any }))} options={PRIORITY_OPTIONS} />
          <InputField label="Expected Closing Date" value={form.expectedClosingDate} onChange={(v) => setForm((p) => ({ ...p, expectedClosingDate: v }))} type="date" />
          <div className="form-group col-span-2" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Requirement Description</label>
            <textarea className="form-control" rows={3} value={form.requirementDescription} onChange={(e) => setForm((p) => ({ ...p, requirementDescription: e.target.value }))} />
          </div>
        </div>

        <div className="form-section-title">Assignment Details</div>
        <div className="form-grid-2">
          <SelectField label="Assigned To" value={form.assignedTo} onChange={(v) => setForm((p) => ({ ...p, assignedTo: v }))} options={[{ value: '', label: 'Select the assigner' }, ...assignmentStaffOptions]} />
          <SelectField label="Lead Status" value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v as LeadStatus }))} options={statusOptions.map((s) => ({ value: s.value, label: s.label }))} />
          <InputField label="Next Followup Date" value={form.nextFollowupDate} onChange={(v) => setForm((p) => ({ ...p, nextFollowupDate: v }))} type="date" />
          <InputField label="Next Followup Time" value={form.nextFollowupTime || ''} onChange={(v) => setForm((p) => ({ ...p, nextFollowupTime: v }))} type="time" />
          <div className="form-group col-span-2" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Lead"
        message="Are you sure you want to delete this lead? This action cannot be undone."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
        variant="danger"
      />

      <ConfirmDialog
        open={!!deleteFollowUpId}
        title="Delete Follow-Up"
        message="Are you sure you want to delete this follow-up activity?"
        onCancel={() => setDeleteFollowUpId(null)}
        onConfirm={() => deleteFollowUpId && deleteFollowUpMut.mutate(deleteFollowUpId)}
        loading={deleteFollowUpMut.isPending}
        variant="danger"
      />

      <ConfirmDialog
        open={!!deleteActivityId}
        title="Delete Activity"
        message="Are you sure you want to delete this recent activity row?"
        onCancel={() => setDeleteActivityId(null)}
        onConfirm={() => deleteActivityId && deleteActivityMut.mutate(deleteActivityId)}
        loading={deleteActivityMut.isPending}
        variant="danger"
      />

      <ConfirmDialog
        open={!!deleteTaskId}
        title="Delete Task"
        message="Are you sure you want to delete this task?"
        onCancel={() => setDeleteTaskId(null)}
        onConfirm={() => deleteTaskId && deleteTaskMut.mutate(deleteTaskId)}
        loading={deleteTaskMut.isPending}
        variant="danger"
      />

      <Modal
        open={!!detailLeadId}
        onClose={() => setDetailLeadId(null)}
        title="Lead Status Overview"
        size="xxl"
        className="lead-detail-modal"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-cancel" onClick={() => setDetailLeadId(null)}>Close</button>
          </div>
        }
      >
        {detailLoading || !detailLead ? (
          <div className="lead-profile-loading"><Spinner size={18} /> Loading lead details...</div>
        ) : (
          <div className="lead-profile">
            <div className="lead-profile-head">
              <Avatar name={detailLead.name} size="xl" />
              <div className="lead-profile-title-wrap">
                <div className="lead-profile-title">{detailLead.name}</div>
                <div className="lead-profile-subtitle">{detailLead.companyName || 'No company'} · {detailLead.leadId}</div>
              </div>
              <div className="lead-profile-actions">
                <button className={`btn btn-sm ${detailIsConverted ? 'btn-secondary' : 'btn-primary'}`} onClick={() => !detailIsConverted && convertMut.mutate(detailLead._id)} disabled={convertMut.isPending || detailIsConverted}>
                  {convertMut.isPending ? <Spinner size={13} /> : <UserCheck size={13} />}
                  {convertMut.isPending ? 'Converting...' : detailIsConverted ? 'Converted Customer' : 'Convert to Customer'}
                </button>
              </div>
            </div>

            <div className="lead-profile-tabs">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'history', label: 'Assignment History' },
                { id: 'conversion', label: 'Conversion Info' },
              ].map((tab) => (
                <button key={tab.id} type="button" className={detailTab === tab.id ? 'active' : ''} onClick={() => setDetailTab(tab.id as any)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && (
              <>
                <div className="lead-profile-card-grid">
                  <div className="lead-profile-card lead-profile-card-main">
                    <div className="lead-profile-card-title">Basic Lead Details</div>
                    {[
                      ['Lead Type', detailLead.leadType === 'existing' ? 'Existing' : 'New'],
                      ['Lead Source', detailLead.source || '—'],
                      ['Lead ID', detailLead.leadId],
                      ['Lead Date', fmt.dateTime(detailLead.leadDate || detailLead.createdAt)],
                      ['Person Name', detailLead.name],
                      ['Company Name', detailLead.companyName || '—'],
                      ['Email ID', detailLead.email || '—'],
                      ['Phone Number', detailLead.phone],
                      ['Location/Area', detailLead.locationArea || '—'],
                      ['Full Address', detailLead.fullAddress || '—'],
                      ...(detailLead.leadType === 'existing' ? [['Existing Product', (detailLead.existingProducts || []).join(', ') || '—']] : []),
                    ].map(([label, value]) => (
                      <div className="lead-profile-row" key={label}>
                        <span>{label}:</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="lead-profile-side-stack">
                    <div className="lead-profile-card">
                      <div className="lead-profile-card-title">Requirement Details</div>
                      <div className="lead-profile-row"><span>Interested Product:</span><strong>{detailLead.interestedProduct || '—'}</strong></div>
                      <div className="lead-profile-row"><span>Pricing:</span><strong>{moneyValue(detailLead.pricing)}</strong></div>
                      <div className="lead-profile-row"><span>Priority:</span><strong className={`lead-priority-${detailLead.priority}`}>{detailLead.priority.toUpperCase()}</strong></div>
                      <div className="lead-profile-row"><span>Expected Closing:</span><strong>{fmt.date(detailLead.expectedClosingDate)}</strong></div>
                      <div className="lead-profile-row lead-profile-row-block"><span>Requirement:</span><strong>{detailLead.requirementDescription || '—'}</strong></div>
                    </div>

                    <div className="lead-profile-card">
                      <div className="lead-profile-card-title">Assignment Details</div>
                      <div className="lead-profile-row"><span>Assigned To:</span><strong>{detailAssigneeName}</strong></div>
                      <div className="lead-profile-row"><span>Created By:</span><strong>{detailCreatorName}</strong></div>
                      <div className="lead-profile-row"><span>Last Follow-Up:</span><strong>{fmt.date(detailLead.lastFollowupDate)}</strong></div>
                      <div className="lead-profile-row">
                        <span>Next Follow-Up:</span>
                        <strong>
                          {detailLead.nextFollowupDate
                            ? (extractTime(detailLead.nextFollowupDate) && extractTime(detailLead.nextFollowupDate) !== '00:00'
                                ? fmt.dateTime(detailLead.nextFollowupDate)
                                : fmt.date(detailLead.nextFollowupDate))
                            : '—'}
                        </strong>
                      </div>
                      {(() => {
                        const latestActivity = unifiedActivities.length > 0 ? unifiedActivities[unifiedActivities.length - 1] : null;
                        const displayBadge = latestActivity ? latestActivity.badgeStatus : leadStatusToBadge(detailLead.status);
                        const displayLabel = latestActivity ? latestActivity.actionLabel : formatLeadStatusLabel(detailLead.status);
                        return (
                          <div className="lead-profile-row">
                            <span>Lead Status:</span>
                            <Badge status={displayBadge} label={displayLabel} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="lead-profile-lower-grid">
                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Recent Activities</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 9px', borderRadius: 6 }}>
                          {unifiedActivities.length} {unifiedActivities.length === 1 ? 'activity' : 'activities'}
                        </span>
                      </div>
                    </div>
                    <div className="lead-recent-table">
                      <div className="lead-recent-head">
                        <span>Date / Time</span>
                        <span>Assigned By / To</span>
                        <span>Follow-Up Type</span>
                        <span>Next Follow-Up</span>
                        <span>Description</span>
                        <span>Status</span>
                        <span>Updated At</span>
                        <span className="lead-th-action">Actions</span>
                      </div>
                      <div className="lead-recent-body">
                        {unifiedActivities.length === 0 ? (
                          <div className="lead-profile-empty">No activity recorded.</div>
                        ) : (
                          unifiedActivities.map((act: any) => {
                            const employeeDisplay = act.toEmployee || detailAssigneeName || '—';
                            return (
                              <div className="lead-recent-row" key={act.id}>
                                <span className="lead-act-cell lead-act-date" data-label="Date / Time">
                                  <div style={{ fontWeight: 800 }}>{fmt.date(act.date)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                                    {fmt.time(act.date)}
                                  </div>
                                </span>
                                <span className="lead-act-cell lead-act-employee" data-label="Assigned By / To" title={employeeDisplay}>
                                  {employeeDisplay}
                                </span>
                                <span className="lead-act-cell lead-act-type" data-label="Follow-Up Type">{act.followUpType || '—'}</span>
                                <span className="lead-act-cell lead-act-next" data-label="Next Follow-Up">{act.nextFollowUp ? fmt.date(act.nextFollowUp) : '—'}</span>
                                <span className="lead-act-cell lead-act-desc" data-label="Description" title={act.description}>{act.description || '—'}</span>
                                <span className="lead-act-cell lead-act-status lead-col-status" data-label="Status">
                                  <Badge status={act.badgeStatus} label={act.actionLabel} />
                                </span>
                                <span className="lead-act-cell lead-act-updated lead-col-updated-at" data-label="Updated At">
                                  <div style={{ fontWeight: 800 }}>{fmt.date(act.statusUpdatedAt || act.date)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                                    {fmt.time(act.statusUpdatedAt || act.date)}
                                  </div>
                                </span>
                                <div className="lead-act-cell lead-act-actions lead-col-actions" data-label="Actions" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                  {act.type === 'task' && act.rawTask && act.rawStatus !== 'done' && act.rawStatus !== 'completed' && (
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-outline"
                                      style={{ color: 'var(--green)', borderColor: 'var(--green)', padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                                      title="Complete Task"
                                      onClick={() => openHandover(act.rawTask, 'done')}
                                    >
                                      <CheckCircle2 size={12} /> Complete
                                    </button>
                                  )}
                                  {act.canDelete ? (
                                    <button
                                      type="button"
                                      className="lead-row-delete"
                                      title="Delete activity"
                                      onClick={() => {
                                        if (act.type === 'followup') setDeleteFollowUpId(act.id);
                                        else if (act.type === 'task') setDeleteTaskId(act.id);
                                        else setDeleteActivityId(act.id);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  ) : (
                                    <span>—</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {detailTab === 'history' && (
              <div className="lead-profile-card">
                <div className="lead-profile-card-title">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Assignment History</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 9px', borderRadius: 6 }}>
                      {assignmentRows.length} {assignmentRows.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                </div>
                <div className="lead-history-table">
                  <div className="lead-history-head">
                    <span>Date & Time</span>
                    <span>Action</span>
                    <span>From</span>
                    <span>To</span>
                    <span>Description / Remarks</span>
                    <span>Changed By</span>
                  </div>
                  <div className="lead-history-body">
                    {assignmentRows.length === 0 ? (
                      <div className="lead-profile-empty">No assignment history recorded.</div>
                    ) : (
                      assignmentRows.map((row: any) => (
                        <div className="lead-history-row" key={row.id}>
                          <span className="lead-hist-cell lead-hist-date" data-label="Date & Time">
                            <div style={{ fontWeight: 800 }}>{fmt.date(row.date)}</div>
                            <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                              {fmt.time(row.date)}
                            </div>
                          </span>
                          <span className="lead-hist-cell lead-hist-action" data-label="Action"><Badge status={row.badgeStatus} label={row.actionLabel} /></span>
                          <span className="lead-hist-cell lead-hist-from" data-label="From">{row.from}</span>
                          <span className="lead-hist-cell lead-hist-to" data-label="To">{row.to}</span>
                          <span className="lead-hist-cell lead-hist-desc" data-label="Description / Remarks" title={row.description}>{row.description || '—'}</span>
                          <span className="lead-hist-cell lead-hist-by" data-label="Changed By">{row.changedBy}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'conversion' && (
              <div className="lead-profile-card">
                <div className="lead-profile-card-title">Conversion Info</div>
                <div className="lead-profile-card-grid single">
                  {(() => {
                    const latestActivity = unifiedActivities.length > 0 ? unifiedActivities[unifiedActivities.length - 1] : null;
                    const displayBadge = latestActivity ? latestActivity.badgeStatus : leadStatusToBadge(detailLead.status);
                    const displayLabel = latestActivity ? latestActivity.actionLabel : formatLeadStatusLabel(detailLead.status);
                    return (
                      <div className="lead-profile-row">
                        <span>Current Status:</span>
                        <Badge status={displayBadge} label={displayLabel} />
                      </div>
                    );
                  })()}
                  <div className="lead-profile-row"><span>Converted At:</span><strong>{fmt.date(detailLead.convertedAt)}</strong></div>
                  <div className="lead-profile-row"><span>Rejected At:</span><strong>{fmt.date(detailLead.rejectedAt)}</strong></div>
                  {detailLead.customerId && (
                    <div className="lead-profile-row" style={{ alignItems: 'center' }}>
                      <span>Linked Customer:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <strong>
                          {typeof detailLead.customerId === 'object' && (detailLead.customerId as any).name
                            ? (detailLead.customerId as any).name
                            : detailLead.companyName || 'Linked to Customer Record'}
                        </strong>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            const searchParam = typeof detailLead.customerId === 'object' && (detailLead.customerId as any).name
                              ? (detailLead.customerId as any).name
                              : detailLead.companyName || '';
                            setDetailLeadId(null);
                            navigate(`/customers?search=${encodeURIComponent(searchParam)}`);
                          }}
                        >
                          View in Customer List →
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="lead-profile-row lead-profile-row-block"><span>Notes:</span><strong>{detailLead.notes || '—'}</strong></div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!handoverTask}
        onClose={() => setHandoverTask(null)}
        title={
          handoverForm.actionType === 'review'
            ? 'Submit Task for Review'
            : handoverForm.actionType === 'forward'
            ? 'Forward Task to Colleague'
            : handoverForm.actionType === 'proposal'
            ? 'Complete Task & Create Proposal'
            : handoverForm.actionType === 'lost'
            ? 'Mark Lead as Not Interested'
            : 'Complete Task'
        }
        headerActions={handoverTask?.taskNo ? <span className="handover-taskno-pill">{handoverTask.taskNo}</span> : undefined}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setHandoverTask(null)} disabled={handoverMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handoverMut.mutate()}
              disabled={
                handoverMut.isPending ||
                (handoverForm.actionType === 'forward' && !handoverForm.assignedTo) ||
                (handoverForm.actionType === 'proposal' && !handoverForm.assignedTo) ||
                (handoverForm.actionType === 'complete' && handoverForm.scheduleFollowUp && !handoverForm.nextDueDate) ||
                (handoverForm.actionType === 'lost' && !handoverForm.reason)
              }
            >
              {handoverMut.isPending ? (
                <Spinner size={14} />
              ) : handoverForm.actionType === 'lost' ? (
                <XCircle size={14} />
              ) : handoverForm.actionType === 'proposal' ? (
                <FileText size={14} />
              ) : handoverForm.actionType === 'forward' ? (
                <Send size={14} />
              ) : handoverForm.actionType === 'review' ? (
                <Clock size={14} />
              ) : (
                <Check size={14} />
              )}
              {handoverForm.actionType === 'lost'
                ? 'Mark as Not Interested'
                : handoverForm.actionType === 'proposal'
                ? 'Submit Proposal'
                : handoverForm.actionType === 'forward'
                ? 'Forward Task'
                : handoverForm.actionType === 'review'
                ? 'Submit for Review'
                : handoverForm.scheduleFollowUp
                ? 'Complete & Schedule Follow-Up'
                : 'Complete Task'}
            </button>
          </div>
        }
      >
        {handoverTask && (
          <div className="handover-modal-body">

            {/* Task Info Bar */}
            <div className="handover-info-bar">
              <span className="handover-info-title">{handoverTask.title || 'Task'}</span>
              <div className="handover-info-flow">
                <span className="handover-flow-dot" style={{ background: '#f59e0b' }} />
                <span className="handover-flow-label">{handoverTask.status ? handoverTask.status.charAt(0).toUpperCase() + handoverTask.status.slice(1).replace(/_/g, ' ') : 'In Progress'}</span>
                <ArrowRight size={12} style={{ color: 'var(--tx-4)' }} />
                <span className="handover-flow-dot" style={{ background: '#22c55e' }} />
                <span className="handover-flow-label">Completed</span>
              </div>
            </div>

            {/* Segmented Tab Control */}
            <div className="handover-segmented-control" role="tablist" aria-label="Next Action" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <button
                type="button" role="tab"
                aria-selected={handoverForm.actionType === 'review'}
                className={`handover-tab-btn ${handoverForm.actionType === 'review' ? 'active' : ''}`}
                onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'review' }))}
              >
                <Clock size={14} />
                <span>Review</span>
              </button>
              <button
                type="button" role="tab"
                aria-selected={handoverForm.actionType === 'forward'}
                className={`handover-tab-btn ${handoverForm.actionType === 'forward' ? 'active' : ''}`}
                onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'forward' }))}
              >
                <Send size={14} />
                <span>Forward</span>
              </button>
              <button
                type="button" role="tab"
                aria-selected={handoverForm.actionType === 'complete'}
                className={`handover-tab-btn ${handoverForm.actionType === 'complete' ? 'active' : ''}`}
                onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'complete' }))}
              >
                <CheckCircle2 size={14} />
                <span>Complete</span>
              </button>
              <button
                type="button" role="tab"
                aria-selected={handoverForm.actionType === 'proposal'}
                className={`handover-tab-btn ${handoverForm.actionType === 'proposal' ? 'active' : ''}`}
                onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'proposal' }))}
              >
                <FileText size={14} />
                <span>Proposal</span>
              </button>
              <button
                type="button" role="tab"
                aria-selected={handoverForm.actionType === 'lost'}
                className={`handover-tab-btn ${handoverForm.actionType === 'lost' ? 'active' : ''}`}
                onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'lost' }))}
              >
                <XCircle size={14} />
                <span>Not Interested</span>
              </button>
            </div>

            {/* ── 1. Review ── */}
            {handoverForm.actionType === 'review' && (
              <div className="handover-tab-content">
                <SelectField
                  label="ASSIGN REVIEWER (Optional)"
                  value={handoverForm.assignedTo}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, assignedTo: v }))}
                  options={[{ value: '', label: '— Manager / Admin —' }, ...assignmentStaffOptions]}
                />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">REVIEW SUBMISSION REMARKS <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={handoverForm.description}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Summary of completed work submitted for approval..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* ── 2. Forward ── */}
            {handoverForm.actionType === 'forward' && (
              <div className="handover-tab-content">
                <SelectField
                  label="FORWARD TO *"
                  value={handoverForm.assignedTo}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, assignedTo: v }))}
                  options={[{ value: '', label: '— Select Colleague —' }, ...assignmentStaffOptions]}
                  required
                />
                <InputField
                  label="FOLLOW-UP DATE (Optional)"
                  value={handoverForm.dueDate}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, dueDate: v }))}
                  type="date"
                />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">HANDOVER NOTES *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.description}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What should your colleague do next?"
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* ── 3. Complete ── */}
            {handoverForm.actionType === 'complete' && (
              <div className="handover-tab-content">
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 12 }}>
                  <InputField
                    label="COMPLETION DATE *"
                    value={handoverForm.completionDate}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionDate: v }))}
                    type="date"
                    required
                  />
                  <InputField
                    label="COMPLETION TIME *"
                    value={handoverForm.completionTime}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionTime: v }))}
                    type="time"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">COMPLETION REMARKS <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.description}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What was done? / Outcome of this task..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Professional Toggle Switch for Next Follow-Up */}
                <div 
                  className="handover-toggle-card"
                  onClick={() => setHandoverForm((p) => ({ ...p, scheduleFollowUp: !p.scheduleFollowUp }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${handoverForm.scheduleFollowUp ? 'var(--brand)' : 'var(--border)'}`,
                    background: handoverForm.scheduleFollowUp ? 'var(--brand-light)' : 'var(--surface-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: handoverForm.scheduleFollowUp ? 'var(--brand)' : 'var(--surface-3)',
                      color: handoverForm.scheduleFollowUp ? '#fff' : 'var(--tx-3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}>
                      <CalendarPlus size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 650, color: 'var(--tx-1)' }}>Schedule Next Follow-Up?</div>
                      <div style={{ fontSize: '11px', color: 'var(--tx-3)' }}>Automatically queue the next follow-up date and assignee</div>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <div style={{
                    width: 40, height: 22, borderRadius: 12,
                    background: handoverForm.scheduleFollowUp ? 'var(--brand)' : 'var(--border-strong, #d1d5db)',
                    padding: 2, display: 'flex', alignItems: 'center',
                    justifyContent: handoverForm.scheduleFollowUp ? 'flex-end' : 'flex-start',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>

                {/* Expandable Follow-Up Details */}
                {handoverForm.scheduleFollowUp && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 12,
                    padding: '14px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface-1)', animation: 'handoverSlideFade 0.2s ease'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      <SelectField
                        label="ASSIGN FOLLOW-UP TO"
                        value={handoverForm.nextAssignee}
                        onChange={(v) => setHandoverForm((p) => ({ ...p, nextAssignee: v }))}
                        options={[{ value: '', label: '— Current Assignee —' }, ...assignmentStaffOptions]}
                      />
                      <div>
                        <InputField
                          label="FOLLOW-UP DATE *"
                          value={handoverForm.nextDueDate}
                          onChange={(v) => setHandoverForm((p) => ({ ...p, nextDueDate: v }))}
                          type="date"
                          required
                        />
                        {/* Quick Date Pills */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {[
                            { label: 'Today', days: 0 },
                            { label: 'Tomorrow', days: 1 },
                            { label: '+3 Days', days: 3 },
                            { label: '+1 Week', days: 7 },
                          ].map((pill) => {
                            const d = new Date();
                            d.setDate(d.getDate() + pill.days);
                            const val = d.toISOString().split('T')[0];
                            const isSelected = handoverForm.nextDueDate === val;
                            return (
                              <button
                                key={pill.label}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHandoverForm((p) => ({ ...p, nextDueDate: val }));
                                }}
                                style={{
                                  fontSize: '10.5px', fontWeight: 600, padding: '2px 8px',
                                  borderRadius: 6, border: '1px solid',
                                  borderColor: isSelected ? 'var(--brand)' : 'var(--border)',
                                  background: isSelected ? 'var(--brand)' : 'var(--surface-2)',
                                  color: isSelected ? '#fff' : 'var(--tx-3)',
                                  cursor: 'pointer'
                                }}
                              >
                                {pill.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      <SelectField
                        label="FOLLOW-UP TYPE"
                        value={handoverForm.nextType}
                        onChange={(v) => setHandoverForm((p) => ({ ...p, nextType: v as any }))}
                        options={[
                          { value: 'call', label: '📞 Phone Call' },
                          { value: 'meeting', label: '🤝 Meeting / Visit' },
                          { value: 'email', label: '✉️ Email' },
                          { value: 'task', label: '📋 Task / Demo' },
                        ]}
                      />
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">NEXT STEP NOTES <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Discuss pricing discount"
                          value={handoverForm.nextDescription}
                          onChange={(e) => setHandoverForm((p) => ({ ...p, nextDescription: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. Proposal ── */}
            {handoverForm.actionType === 'proposal' && (
              <div className="handover-tab-content">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <SelectField
                    label="ASSIGN PROPOSAL TO *"
                    value={handoverForm.assignedTo}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, assignedTo: v }))}
                    options={[{ value: '', label: '— Select Colleague —' }, ...assignmentStaffOptions]}
                    required
                  />
                  <InputField
                    label="PROPOSAL FOLLOW-UP DATE"
                    value={handoverForm.dueDate}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, dueDate: v }))}
                    type="date"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">PROPOSAL NOTES & SCOPE *</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={handoverForm.proposalNotes}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, proposalNotes: e.target.value }))}
                    placeholder="Add proposal requirements, pricing notes, or scope details..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* ── 5. Not Interested ── */}
            {handoverForm.actionType === 'lost' && (
              <div className="handover-tab-content">
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 12 }}>
                  <InputField
                    label="DATE *"
                    value={handoverForm.completionDate}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionDate: v }))}
                    type="date"
                    required
                  />
                  <InputField
                    label="TIME *"
                    value={handoverForm.completionTime}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionTime: v }))}
                    type="time"
                    required
                  />
                </div>
                <SelectField
                  label="REASON *"
                  value={handoverForm.reason}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, reason: v }))}
                  options={[
                    { value: '', label: '— Select Reason —' },
                    { value: 'Budget constraints', label: 'Budget constraints' },
                    { value: 'Went with competitor', label: 'Went with competitor' },
                    { value: 'No response', label: 'No response' },
                    { value: 'Requirements changed', label: 'Requirements changed' },
                    { value: 'Project cancelled', label: 'Project cancelled' },
                    { value: 'Other', label: 'Other' },
                  ]}
                  required
                />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">ADDITIONAL NOTES <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.additionalNotes}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, additionalNotes: e.target.value }))}
                    placeholder="Add any additional notes..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

    </div>
  );
};

export default LeadsPage;
