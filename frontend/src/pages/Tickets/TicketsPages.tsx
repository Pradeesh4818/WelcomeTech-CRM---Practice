import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Ticket as TicketIcon, Search, Edit, Trash2, Download, CalendarPlus, UserPlus } from 'lucide-react';
import api from '../../utils/api';
import { Ticket, Customer, User, TicketCategory } from '../../types';
import { fmt, PAGE_SIZE_OPTIONS, combineDateTime, extractDate, extractTime } from '../../utils/helpers';
import { Badge, Avatar, SkeletonRow, EmptyState, InputField, Select, SelectField, Spinner, Modal, DetailItem, Pagination, ConfirmDialog } from '../../components/ui';
import { exportExcelRows } from '../../utils/excelExport';
import { openTaskCountLabel } from '../../utils/taskAssignment';
import toast from 'react-hot-toast';
import { useDateFilter } from '../../context/DateFilterContext';

type TicketEditForm = {
  customer: string;
  contactPerson: string;
  mailId: string;
  phoneNumber: string;
  assignedTo: string;
  subject: string;
  description: string;
  category: string;
  subCategory: string;
  status: Ticket['status'];
  priority: Ticket['priority'];
  ticketRaisedDate: string;
  ticketRaisedTime?: string;
  completedDate: string;
  completedTime?: string;
  tags: string;
};

const toTicketEditForm = (t: Ticket): TicketEditForm => ({
  customer: typeof t.customer === 'object' ? t.customer._id : t.customer,
  contactPerson: t.contactPerson || '',
  mailId: t.mailId || '',
  phoneNumber: t.phoneNumber || '',
  assignedTo: typeof t.assignedTo === 'object' ? t.assignedTo._id : t.assignedTo,
  subject: t.subject || '',
  description: t.description || '',
  category: t.category || '',
  subCategory: t.subCategory || '',
  status: t.status,
  priority: t.priority,
  ticketRaisedDate: extractDate(t.ticketRaisedDate),
  ticketRaisedTime: extractTime(t.ticketRaisedDate),
  completedDate: extractDate(t.completedDate),
  completedTime: extractTime(t.completedDate),
  tags: Array.isArray(t.tags) ? t.tags.join(', ') : '',
});

const createDefaultTicketForm = (): TicketEditForm => ({
  customer: '',
  contactPerson: '',
  mailId: '',
  phoneNumber: '',
  assignedTo: '',
  subject: '',
  description: '',
  category: '',
  subCategory: '',
  status: 'open',
  priority: 'medium',
  ticketRaisedDate: extractDate(new Date()),
  ticketRaisedTime: extractTime(new Date()),
  completedDate: '',
  completedTime: '',
  tags: '',
});

const FOLLOW_UP_TYPE_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'visit', label: 'Site Visit' },
  { value: 'sms', label: 'SMS' },
];
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((h) => ({ value: h, label: h }));
const MINUTE_OPTIONS = ['00', '15', '30', '45'].map((m) => ({ value: m, label: m }));
const PERIOD_OPTIONS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];

// ─── TICKETS LIST ────────────────────────────────
export const TicketsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TicketEditForm>(createDefaultTicketForm);

  const [page, setPage] = useState(1);
  const [detailTab, setDetailTab] = useState<'overview' | 'activities' | 'history'>('overview');

  const [followUpForm, setFollowUpForm] = useState({
    followUpType: 'call',
    remarks: '',
    scheduledDate: '',
    scheduledHour: '10',
    scheduledMinute: '00',
    scheduledPeriod: 'AM',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    assignedTo: '',
    assignedAt: new Date().toISOString().slice(0, 10),
    description: '',
  });
  const [deleteFollowUpId, setDeleteFollowUpId] = useState<string | null>(null);
  const [deleteActivityId, setDeleteActivityId] = useState<string | null>(null);
  
  const [pageSize, setPageSize] = useState('10');
  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';
  
  React.useEffect(() => { setPage(1); }, [search, statusFilter, pageSize, dateKey]);
  const { data, isLoading: isLoadingTickets } = useQuery({
    queryKey: ['tickets', statusFilter, search, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/tickets', { params });
      return r.data as unknown as { data: Ticket[]; pages: number; total: number; stats?: any };
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await api.patch(`/tickets/${id}`, payload);
      return res.data.data as Ticket;
    },
    meta: { invalidateQueryKeys: [['tickets'], ['engineers'], ['task-staff'], ['employees-active-for-leads']] },
    onSuccess: () => {
      toast.success('Ticket updated');
      setModalOpen(false);
      setModalMode('view');
      setActiveTicket(null);
    },
    onError: () => toast.error('Failed to update ticket'),
  });

  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ['ticket-detail', activeTicket?._id],
    queryFn: async () => {
      const res = await api.get(`/tickets/${activeTicket?._id}`);
      return res.data;
    },
    enabled: !!activeTicket?._id && modalMode === 'view',
  });

  const { data: staffData } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const res = await api.get('/engineers');
      return res.data.data as User[];
    },
    enabled: modalOpen,
  });

  const staff = staffData || [];
  const staffNameById = new Map(staff.map((s) => [s._id, s.name]));
  const userNameFromId = (id?: string | null, fallback = '—') => {
    if (!id) return fallback;
    return staffNameById.get(String(id)) || fallback;
  };

  const detailTicket = detailData?.data || activeTicket;
  const detailFollowUps = detailData?.followUps || [];
  const detailActivities = detailData?.activities || [];

  const activityFromValue = (activity: any) => {
    if (activity.metadata?.from) return userNameFromId(activity.metadata.from, String(activity.metadata.from));
    return '—';
  };
  const activityToValue = (activity: any) => {
    if (activity.metadata?.to) return userNameFromId(activity.metadata.to, String(activity.metadata.to));
    if (activity.metadata?.assignedTo) return userNameFromId(activity.metadata.assignedTo, String(activity.metadata.assignedTo));
    return '—';
  };
  const activityDateValue = (activity: any) => activity.metadata?.assignedAt || activity.createdAt;

  const entityName = (userObj: any, fallback = '—') => {
    if (!userObj) return fallback;
    if (typeof userObj === 'object') return userObj.name || fallback;
    return userNameFromId(userObj, userObj);
  };

  const followUpTypeLabel = (value?: string) => {
    if (!value) return 'Call';
    const mapping: Record<string, string> = {
      call: 'Call',
      email: 'Email',
      whatsapp: 'WhatsApp',
      meeting: 'Meeting',
      visit: 'Site Visit',
      sms: 'SMS',
    };
    return mapping[value.toLowerCase()] || value;
  };

  const detailAssigneeName = entityName(detailTicket?.assignedTo);
  const detailCreatorName = entityName(detailTicket?.createdBy);

  const detailFollowUpItems = detailTicket ? [
    ...detailFollowUps.map((item: any) => ({
      id: item._id,
      date: item.scheduledAt || item.createdAt,
      title: item.remarks ? `${followUpTypeLabel(item.followUpType)} - ${item.remarks}` : `${followUpTypeLabel(item.followUpType)} scheduled`,
      actor: entityName(item.createdBy || item.assignedTo, detailAssigneeName),
      canDelete: true,
    })),
    ...(detailTicket.lastFollowupDate ? [{
      id: 'last-followup',
      date: detailTicket.lastFollowupDate,
      title: 'Last follow-up',
      actor: detailAssigneeName,
      canDelete: false,
    }] : []),
    ...(detailTicket.nextFollowupDate ? [{
      id: 'next-followup',
      date: detailTicket.nextFollowupDate,
      title: 'Next follow-up',
      actor: detailAssigneeName,
      canDelete: false,
    }] : []),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()) : [];

  const assignmentRows = detailTicket ? [
    ...(detailTicket.assignedTo ? [{
      id: 'initial-assignment',
      date: detailTicket.createdAt,
      from: '—',
      to: detailAssigneeName,
      changedBy: detailCreatorName,
      description: 'Initial assignment',
    }] : []),
    ...detailActivities
      .filter((activity: any) => ['assigned', 'reassigned'].includes(activity.type))
      .map((activity: any) => ({
        id: activity._id,
        date: activityDateValue(activity),
        from: activityFromValue(activity),
        to: activityToValue(activity),
        changedBy: entityName(activity.actor),
        description: activity.message || '—',
      })),
  ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()) : [];

  const assignMut = useMutation({
    mutationFn: async ({ id, userId, assignedAt, description }: { id: string; userId: string; assignedAt: string; description?: string }) => {
      const res = await api.patch(`/tickets/${id}/assign`, { assignedTo: userId, assignedAt, description });
      return res.data.data;
    },
    meta: { invalidateQueryKeys: [['tickets'], ['engineers'], ['ticket-detail']] },
    onSuccess: () => {
      refetchDetail();
      toast.success('Ticket assigned');
      setAssignmentForm((p) => ({ ...p, assignedTo: '', description: '' }));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign ticket'),
   });

  const followUpMut = useMutation({
    mutationFn: async () => {
      if (!detailTicket) throw new Error('No ticket selected');
      const { scheduledDate, scheduledHour, scheduledMinute, scheduledPeriod, followUpType, remarks } = followUpForm;
      if (!scheduledDate) throw new Error('Please select a follow-up date');

      let hourNum = parseInt(scheduledHour, 10);
      if (scheduledPeriod === 'PM' && hourNum < 12) hourNum += 12;
      if (scheduledPeriod === 'AM' && hourNum === 12) hourNum = 0;
      
      const scheduledAt = new Date(`${scheduledDate}T${String(hourNum).padStart(2, '0')}:${scheduledMinute}:00`);
      
      const res = await api.post(`/tickets/${detailTicket._id}/followups`, {
        scheduledAt: scheduledAt.toISOString(),
        followUpType,
        remarks,
      });
      return res.data;
    },
    meta: { invalidateQueryKeys: [['tickets'], ['ticket-detail']] },
    onSuccess: () => {
      refetchDetail();
      toast.success('Follow-up scheduled');
      setFollowUpForm({ followUpType: 'call', remarks: '', scheduledDate: '', scheduledHour: '10', scheduledMinute: '00', scheduledPeriod: 'AM' });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to schedule follow-up'),
  });

  const deleteFollowUpMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/tickets/followups/${id}`);
      return res.data;
    },
    meta: { invalidateQueryKeys: [['tickets'], ['ticket-detail']] },
    onSuccess: () => {
      refetchDetail();
      toast.success('Follow-up deleted');
      setDeleteFollowUpId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete follow-up'),
  });

  const deleteActivityMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/tickets/activities/${id}`);
      return res.data;
    },
    meta: { invalidateQueryKeys: [['tickets'], ['ticket-detail']] },
    onSuccess: () => {
      refetchDetail();
      toast.success('Activity deleted');
      setDeleteActivityId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete activity'),
  });

  const createMut = useMutation({
    mutationFn: (payload: any) => api.post("/tickets", payload),
    meta: { invalidateQueryKeys: [['tickets'], ['engineers'], ['task-staff'], ['employees-active-for-leads']] },
    onSuccess: () => {
      toast.success("Ticket created!");
      setModalOpen(false);
      setModalMode('view');
      setEditForm(createDefaultTicketForm());
      setSearchParams({}, { replace: true });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to create ticket"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/tickets/${id}`),
    meta: { invalidateQueryKeys: [['tickets']] },
    onSuccess: () => {
      toast.success('Ticket deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete ticket'),
  });

  const { data: engineers, isLoading: isLoadingEngineers } = useQuery({
    queryKey: ['engineers'],
    queryFn: async () => { const r = await api.get('/engineers'); return r.data.data as User[]; },
    enabled: modalOpen,
  });

  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const r = await api.get('/customers/lookup');
      return (r.data?.data || []) as Customer[];
    },
    enabled: modalOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: ticketCategories, isLoading: isLoadingTicketCategories } = useQuery({
    queryKey: ['ticket-categories', 'ticket-form'],
    queryFn: async () => {
      const r = await api.get('/ticket-categories', { params: { limit: 500 } });
      return r.data.data as TicketCategory[];
    },
  });

  const tickets: Ticket[] = data?.data || [];
  const exportTickets = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (statusFilter !== 'all') params.status = statusFilter;
    if (search.trim()) params.search = search.trim();
    if (hasActiveDateFilter) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    const r = await api.get('/tickets', { params });
    exportExcelRows('tickets', 'Tickets', r.data?.data || []);
  };
  const selectedEditCategory = (ticketCategories || []).find((c) => c.name === editForm.category);
  const editSubCategoryOptions = selectedEditCategory?.subCategories || [];

  const companyOptions = React.useMemo(() => {
    const list = (customers || [])
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    if (activeTicket && typeof activeTicket.customer === 'object' && activeTicket.customer?._id) {
      const custObj = activeTicket.customer as any;
      if (!list.some((c) => c._id === custObj._id)) {
        list.unshift(custObj);
      }
    }
    return list.map((c) => ({ value: c._id, label: c.name }));
  }, [customers, activeTicket]);

  const openCreateTicketModal = React.useCallback(() => {
    setActiveTicket(null);
    setEditForm(createDefaultTicketForm());
    setModalMode('create');
    setModalOpen(true);
  }, []);

  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateTicketModal();
    }
  }, [openCreateTicketModal, searchParams]);

  const closeTicketModal = () => {
    setModalOpen(false);
    setModalMode('view');
    setActiveTicket(null);
    if (searchParams.get('new') === '1') {
      setSearchParams({}, { replace: true });
    }
  };

  const handleCompanyChange = (customerId: string) => {
    const customer = customers?.find((c) => c._id === customerId);
    setEditForm((p) => ({
      ...p,
      customer: customerId,
      contactPerson: customer?.contact || customer?.primaryContactInfo?.contactName1 || customer?.keyContacts?.[0]?.contactName || p.contactPerson,
      mailId: customer?.email || customer?.primaryContactInfo?.email || customer?.keyContacts?.[0]?.email || p.mailId,
      phoneNumber: customer?.phone || customer?.primaryContactInfo?.mobile || customer?.keyContacts?.[0]?.mobile || p.phoneNumber,
    }));
  };

  const buildTicketPayload = (editingTicket: any = null) => {
    const now = new Date();
    const isCompleted = editForm.status === 'resolved' || editForm.status === 'closed';
    const raisedTime = editForm.ticketRaisedTime || extractTime(now);
    const completedTime = editForm.completedTime || (isCompleted ? extractTime(now) : undefined);

    return {
      customer: editForm.customer,
      contactPerson: editForm.contactPerson || undefined,
      mailId: editForm.mailId || undefined,
      phoneNumber: editForm.phoneNumber || undefined,
      assignedTo: editForm.assignedTo as any,
      subject: editForm.subject,
      description: editForm.description || undefined,
      category: editForm.category,
      subCategory: editForm.subCategory || undefined,
      status: editForm.status,
      priority: editForm.priority,
      ticketRaisedDate: combineDateTime(editForm.ticketRaisedDate || extractDate(now), raisedTime) || now,
      completedDate: editForm.completedDate
        ? combineDateTime(editForm.completedDate, completedTime)
        : isCompleted
        ? now
        : undefined,
      // Ticket.tags is string[]; the form holds a comma-separated string.
      tags: editForm.tags
        ? editForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
    };
  };

  // KPIs come from server-side aggregates, not just the current page's rows.
  const ticketStats = (data as any)?.stats || {};
  const totalTickets = ticketStats.total ?? data?.total ?? tickets.length;
  const openTickets = ticketStats.open ?? 0;
  const criticalTickets = ticketStats.critical ?? 0;
  const resolvedTickets = ticketStats.resolved ?? 0;

  const kpiCards = [
    { label: 'Total Tickets', value: totalTickets, icon: <TicketIcon size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Total visible' },
    { label: 'Open Tickets', value: openTickets, icon: <TicketIcon size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Awaiting support' },
    { label: 'Critical', value: criticalTickets, icon: <TicketIcon size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', change: 'Needs immediate action' },
    { label: 'Resolved / Closed', value: resolvedTickets, icon: <TicketIcon size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Completed' },
  ];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Support Tickets</div><div className="page-subtitle">{data?.total || 0} total tickets {hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: 'var(--brand)' }}>• {headerDateLabel}</span>}</div></div>
      </div>

      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg }}><span style={{ color: kpi.color }}>{kpi.icon}</span></div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{isLoadingTickets ? '—' : kpi.value}</div>
            <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
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
              options={['all', 'open', 'in-progress', 'pending-customer', 'resolved', 'closed'].map((s) => ({
                value: s,
                label: s === 'all' ? 'All Tickets' : s === 'in-progress' ? 'In Progress' : s === 'pending-customer' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1),
              }))}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={exportTickets}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreateTicketModal}><TicketIcon size={13} /> New Ticket</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead><tr><th className="sno-col">S NO</th><th>Logo</th><th>Ticket ID</th><th>Company Name</th><th>Contact Person</th><th>Subject</th><th>Category</th><th>Subcategory</th><th style={{ textAlign: 'center' }}>Assigned To</th><th>Priority</th><th>Status</th><th>Assign Date</th><th>Completed</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoadingTickets ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={14} />) :
                tickets.length === 0 ? (
                  <tr><td colSpan={14}><EmptyState icon={<TicketIcon size={22} />} title="No tickets found" action={<button className="btn btn-primary btn-sm" onClick={openCreateTicketModal}><TicketIcon size={13} /> New Ticket</button>} /></td></tr>
                ) : (
                  tickets.map((t, idx) => {
                    const cust = typeof t.customer === 'object' ? t.customer : null;
                    const eng = typeof t.assignedTo === 'object' ? t.assignedTo : null;
                    return (
                      <tr key={t._id}>
                        <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                        <td>{cust && <Avatar name={cust.name} src={cust.avatar} size="sm" />}</td>
                        <td>
                          <button
                            type="button"
                            className="record-id-link"
                            onClick={() => { setActiveTicket(t); setDetailTab('overview'); setModalMode('view'); setModalOpen(true); }}
                          >
                            {t.ticketNo}
                          </button>
                        </td>
                        <td><span style={{ fontSize: 12.5 }}>{cust?.name || '—'}</span></td>
                        <td>
                          <div style={{ fontSize: 12.5 }}>{t.contactPerson || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{t.phoneNumber || t.mailId || ''}</div>
                        </td>
                        <td><div style={{ fontWeight: 500, fontSize: 12.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div></td>
                        <td style={{ fontSize: 12 }}>{t.category}</td>
                        <td style={{ fontSize: 12 }}>{t.subCategory || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{eng?.name || '—'}</span>
                        </td>
                        <td><Badge status={t.priority} /></td>
                        <td><Badge status={t.status} /></td>
                        <td style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 650, color: 'var(--tx-2)' }}>{fmt.date(t.ticketRaisedDate || t.createdAt)}</span>
                            {extractTime(t.ticketRaisedDate || t.createdAt) && extractTime(t.ticketRaisedDate || t.createdAt) !== '00:00' && (
                              <span style={{ fontSize: 10.5, color: 'var(--tx-4)' }}>{fmt.time(t.ticketRaisedDate || t.createdAt)}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>
                          {t.completedDate ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 650, color: 'var(--tx-2)' }}>{fmt.date(t.completedDate)}</span>
                              {extractTime(t.completedDate) && extractTime(t.completedDate) !== '00:00' && (
                                <span style={{ fontSize: 10.5, color: 'var(--tx-4)' }}>{fmt.time(t.completedDate)}</span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-action btn-action-amber"
                              onClick={() => { setActiveTicket(t); setEditForm(toTicketEditForm(t)); setModalMode('edit'); setModalOpen(true); }}
                              title="Edit"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              className="btn-action btn-action-red"
                              onClick={() => setDeleteId(t._id)}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              }
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeTicketModal}
        title={modalMode === 'create' ? 'Create New Ticket' : modalMode === 'edit' ? 'Edit Ticket' : 'Ticket Details'}
        size={modalMode === 'view' ? 'xxl' : 'xl'}
        footer={(() => {
          if (modalMode === 'view' && !activeTicket) return null;

          if (modalMode === 'view') {
            return (
              <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-cancel" onClick={closeTicketModal}>Close</button>
                <button className="btn btn-primary" onClick={() => { if (activeTicket) { setEditForm(toTicketEditForm(activeTicket)); setModalMode('edit'); } }}>
                  <Edit size={13} /> Edit
                </button>
              </div>
            );
          }

          if (modalMode === 'create') {
            return (
              <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-cancel" onClick={closeTicketModal}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => createMut.mutate(buildTicketPayload())}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? <Spinner size={14} /> : <TicketIcon size={14} />}
                  {createMut.isPending ? 'Creating...' : 'Register Support Ticket'}
                </button>
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-cancel" onClick={() => setModalMode('view')}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!activeTicket) return;
                  updateMut.mutate({
                    id: activeTicket._id,
                    payload: buildTicketPayload(activeTicket) as Record<string, unknown>,
                  });
                }}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? <Spinner size={14} /> : null}
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          );
        })()}
      >
        {modalMode === 'create' || modalMode === 'edit' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid-2">
              <SelectField
                label="Company Name"
                value={editForm.customer}
                onChange={handleCompanyChange}
                options={companyOptions}
                placeholder="— Select Company —"
                required
                disabled={createMut.isPending || updateMut.isPending}
                loading={isLoadingCustomers}
              />
              <InputField
                label="Contact Person"
                value={editForm.contactPerson}
                onChange={(v) => setEditForm((p) => ({ ...p, contactPerson: v }))}
                placeholder="Contact person name"
              />
              <InputField
                label="Mail Id"
                type="email"
                value={editForm.mailId}
                onChange={(v) => setEditForm((p) => ({ ...p, mailId: v }))}
                placeholder="contact@company.com"
              />
              <InputField
                label="Phone Number"
                type="tel"
                value={editForm.phoneNumber}
                onChange={(v) => setEditForm((p) => ({ ...p, phoneNumber: v }))}
                placeholder="Phone number"
              />
              <SelectField
                label="Assigned To"
                value={editForm.assignedTo}
                onChange={(v) => setEditForm((p) => ({ ...p, assignedTo: v }))}
                options={(engineers || []).map((e) => ({ value: e._id, label: openTaskCountLabel(e) }))}
                placeholder="— Select Engineer —"
                required
                disabled={createMut.isPending || updateMut.isPending}
                loading={isLoadingEngineers}
              />
              <SelectField
                label="Category"
                value={editForm.category}
                onChange={(v) => setEditForm((p) => ({ ...p, category: v, subCategory: '' }))}
                options={(ticketCategories || []).map((c) => ({ value: c.name, label: c.name }))}
                placeholder="Select category"
                required
                loading={isLoadingTicketCategories}
              />
              {editForm.category ? (
                <SelectField
                  label="Subcategory"
                  value={editForm.subCategory}
                  onChange={(v) => setEditForm((p) => ({ ...p, subCategory: v }))}
                  options={editSubCategoryOptions.map((sub) => ({ value: sub, label: sub }))}
                  placeholder={editSubCategoryOptions.length ? 'Select subcategory' : 'No subcategories available'}
                  disabled={!editSubCategoryOptions.length}
                />
              ) : null}
              <InputField
                label="Tags (comma separated)"
                value={editForm.tags}
                onChange={(v) => setEditForm((p) => ({ ...p, tags: v }))}
                placeholder="e-invoice, tss, urgent"
              />
              <SelectField
                label="Priority"
                value={editForm.priority}
                onChange={(v) => setEditForm((p) => ({ ...p, priority: v as Ticket['priority'] }))}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
              <SelectField
                label="Status"
                value={editForm.status}
                onChange={(v) => {
                  const newStatus = v as Ticket['status'];
                  const isResolvedOrClosed = newStatus === 'resolved' || newStatus === 'closed';
                  const now = new Date();
                  setEditForm((p) => ({
                    ...p,
                    status: newStatus,
                    completedDate: isResolvedOrClosed
                      ? (p.completedDate || extractDate(now))
                      : '',
                    completedTime: isResolvedOrClosed
                      ? (p.completedTime || extractTime(now))
                      : '',
                  }));
                }}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'in-progress', label: 'In Progress' },
                  { value: 'pending-customer', label: 'Pending Customer' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <InputField
                  label="Assign Date"
                  type="date"
                  value={editForm.ticketRaisedDate}
                  onChange={(v) => setEditForm((p) => ({ ...p, ticketRaisedDate: v }))}
                />
                <InputField
                  label="Time"
                  type="time"
                  value={editForm.ticketRaisedTime || ''}
                  onChange={(v) => setEditForm((p) => ({ ...p, ticketRaisedTime: v }))}
                />
              </div>
              {(editForm.status === 'resolved' || editForm.status === 'closed') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                  <InputField
                    label="Completed Date"
                    type="date"
                    value={editForm.completedDate}
                    onChange={(v) => setEditForm((p) => ({ ...p, completedDate: v }))}
                  />
                  <InputField
                    label="Time"
                    type="time"
                    value={editForm.completedTime || ''}
                    onChange={(v) => setEditForm((p) => ({ ...p, completedTime: v }))}
                  />
                </div>
              )}
            </div>

            <InputField
              label="Subject"
              value={editForm.subject}
              onChange={(v) => setEditForm((p) => ({ ...p, subject: v }))}
              required
              placeholder="Brief description of the issue"
            />

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detailed problem description..."
                rows={4}
                disabled={createMut.isPending || updateMut.isPending}
              />
            </div>
          </div>
        ) : !activeTicket ? null : (
          <div className="lead-profile">
            <div className="lead-profile-head">
              <Avatar name={typeof activeTicket.customer === 'object' ? activeTicket.customer?.name : '—'} size="xl" />
              <div className="lead-profile-title-wrap">
                <div className="lead-profile-title">{activeTicket.subject}</div>
                <div className="lead-profile-subtitle">
                  {typeof activeTicket.customer === 'object' ? activeTicket.customer?.name : 'No company'} · {activeTicket.ticketNo}
                </div>
              </div>
              <div className="lead-profile-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <Badge status={activeTicket.priority} />
                <Badge status={activeTicket.status} />
              </div>
            </div>

            <div className="lead-profile-tabs">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'activities', label: 'Activities' },
                { id: 'history', label: 'Assignment History' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={detailTab === tab.id ? 'active' : ''}
                  onClick={() => setDetailTab(tab.id as any)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && detailTicket && (
              <>
                <div className="lead-profile-card-grid">
                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">Basic Ticket Details</div>
                    {[
                      ['Company Name', typeof detailTicket.customer === 'object' ? detailTicket.customer?.name : '—'],
                      ['Contact Person', detailTicket.contactPerson || '—'],
                      ['Mail ID', detailTicket.mailId || '—'],
                      ['Phone Number', detailTicket.phoneNumber || '—'],
                      ['Created Date', fmt.dateTime(detailTicket.createdAt)],
                    ].map(([label, value]) => (
                      <div className="lead-profile-row" key={label}>
                        <span>{label}:</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">Issue Details</div>
                    <div className="lead-profile-row"><span>Subject:</span><strong>{detailTicket.subject}</strong></div>
                    <div className="lead-profile-row"><span>Category:</span><strong>{detailTicket.category || '—'}</strong></div>
                    <div className="lead-profile-row"><span>Subcategory:</span><strong>{detailTicket.subCategory || '—'}</strong></div>
                    <div className="lead-profile-row"><span>Tags:</span><strong>{detailTicket.tags?.length ? detailTicket.tags.join(', ') : '—'}</strong></div>
                    <div className="lead-profile-row lead-profile-row-block"><span>Description:</span><strong>{detailTicket.description || '—'}</strong></div>
                  </div>

                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">Assignment Details</div>
                    <div className="lead-profile-row"><span>Assigned To:</span><strong>{detailAssigneeName}</strong></div>
                    <div className="lead-profile-row"><span>Assign Date:</span><strong>{detailTicket.ticketRaisedDate ? fmt.dateTime(detailTicket.ticketRaisedDate) : '—'}</strong></div>
                    <div className="lead-profile-row"><span>Completed Date:</span><strong>{detailTicket.completedDate ? fmt.dateTime(detailTicket.completedDate) : '—'}</strong></div>
                    <div className="lead-profile-row"><span>Last Follow-Up:</span><strong>{fmt.dateTime(detailTicket.lastFollowupDate)}</strong></div>
                    <div className="lead-profile-row"><span>Next Follow-Up:</span><strong>{fmt.dateTime(detailTicket.nextFollowupDate)}</strong></div>
                    <div className="lead-profile-row"><span>Priority:</span><strong>{detailTicket.priority.toUpperCase()}</strong></div>
                    <div className="lead-profile-row"><span>Status:</span><strong>{detailTicket.status.toUpperCase()}</strong></div>
                  </div>
                </div>

                <div className="lead-profile-lower-grid">
                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">Follow-Up Activities</div>
                    <div className="lead-followup-content">
                      <div className="lead-followup-timeline">
                        {detailFollowUpItems.slice(0, 8).length === 0 ? (
                          <div className="lead-profile-empty">No follow-up activity yet.</div>
                        ) : (
                          detailFollowUpItems.slice(0, 8).map((item: any, idx: number) => (
                            <div className="lead-followup-row" key={item.id || idx}>
                              <span className="lead-followup-dot" />
                              <strong>{idx === 0 && fmt.date(item.date) === fmt.date(new Date()) ? 'Today' : fmt.date(item.date)}</strong>
                              <span className="lead-followup-dash">—</span>
                              <span className="lead-followup-title">{item.title}</span>
                              <span className="lead-followup-by">by</span>
                              <em>{item.actor}</em>
                              {item.canDelete && (
                                <button
                                  type="button"
                                  className="lead-followup-delete"
                                  title="Delete follow-up"
                                  onClick={() => setDeleteFollowUpId(item.id)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      <div className="lead-inline-followup" id="lead-inline-followup">
                        <div className="lead-inline-followup-title">
                          <CalendarPlus size={15} />
                          Add Follow-Up
                        </div>
                        <SelectField
                          label="Follow-Up Type"
                          value={followUpForm.followUpType}
                          onChange={(v) => setFollowUpForm((p) => ({ ...p, followUpType: v }))}
                          options={FOLLOW_UP_TYPE_OPTIONS}
                        />
                        <div className="form-group">
                          <label className="form-label">Notes</label>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={followUpForm.remarks}
                            onChange={(e) => setFollowUpForm((p) => ({ ...p, remarks: e.target.value }))}
                            placeholder="Brief reminder/notes..."
                          />
                        </div>
                        <div className="lead-followup-datetime">
                          <InputField
                            label="Next Follow-Up"
                            value={followUpForm.scheduledDate}
                            onChange={(v) => setFollowUpForm((p) => ({ ...p, scheduledDate: v }))}
                            type="date"
                            required
                          />
                          <div className="lead-followup-time-grid">
                            <SelectField
                              label="Hour"
                              value={followUpForm.scheduledHour}
                              onChange={(v) => setFollowUpForm((p) => ({ ...p, scheduledHour: v }))}
                              options={HOUR_OPTIONS}
                            />
                            <SelectField
                              label="Minute"
                              value={followUpForm.scheduledMinute}
                              onChange={(v) => setFollowUpForm((p) => ({ ...p, scheduledMinute: v }))}
                              options={MINUTE_OPTIONS}
                            />
                            <SelectField
                              label="AM/PM"
                              value={followUpForm.scheduledPeriod}
                              onChange={(v) => setFollowUpForm((p) => ({ ...p, scheduledPeriod: v }))}
                              options={PERIOD_OPTIONS}
                            />
                          </div>
                        </div>
                        <div className="lead-inline-followup-actions">
                          <button
                            className="btn btn-primary"
                            onClick={() => followUpMut.mutate()}
                            disabled={followUpMut.isPending || !followUpForm.scheduledDate}
                          >
                            {followUpMut.isPending ? <Spinner size={14} /> : <CalendarPlus size={14} />}
                            {followUpMut.isPending ? 'Adding...' : 'Add Activity'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lead-profile-card">
                    <div className="lead-profile-card-title">Recent Activities</div>
                    <div className="ticket-assign-inline">
                      <InputField
                        label="Assign Date"
                        value={assignmentForm.assignedAt}
                        onChange={(v) => setAssignmentForm((p) => ({ ...p, assignedAt: v }))}
                        type="date"
                        required
                      />
                      <SelectField
                        label="Engineer"
                        value={assignmentForm.assignedTo}
                        onChange={(v) => setAssignmentForm((p) => ({ ...p, assignedTo: v }))}
                        options={[{ value: '', label: 'Select engineer' }, ...(engineers || []).map((e) => ({ value: e._id, label: openTaskCountLabel(e) }))]}
                      />
                      <InputField
                        label="Description"
                        value={assignmentForm.description}
                        onChange={(v) => setAssignmentForm((p) => ({ ...p, description: v }))}
                        placeholder="Notes or description..."
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          if (!assignmentForm.assignedTo) {
                            toast.error('Please select an engineer');
                            return;
                          }
                          if (!assignmentForm.assignedAt) {
                            toast.error('Please select assign date');
                            return;
                          }
                          assignMut.mutate({
                            id: detailTicket._id,
                            userId: assignmentForm.assignedTo,
                            assignedAt: assignmentForm.assignedAt,
                            description: assignmentForm.description,
                          });
                        }}
                        disabled={assignMut.isPending || !assignmentForm.assignedTo || !assignmentForm.assignedAt}
                      >
                        {assignMut.isPending ? <Spinner size={14} /> : <UserPlus size={14} />}
                        {assignMut.isPending ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                    <div className="ticket-recent-table">
                      <div className="ticket-recent-head"><span>Date / Time</span><span>From</span><span>To</span><span>Changed By</span><span>Description</span><span></span></div>
                      {detailActivities.slice(0, 6).length === 0 ? (
                        <div className="lead-profile-empty">No activity recorded.</div>
                      ) : detailActivities.slice(0, 6).map((activity: any) => (
                        <div className="ticket-recent-row" key={activity._id}>
                          <span className="lead-act-cell lead-act-date" data-label="Date / Time">
                            <div style={{ fontWeight: 800 }}>{fmt.date(activityDateValue(activity))}</div>
                            <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                              {fmt.time(activityDateValue(activity))}
                            </div>
                          </span>
                          <span className="lead-act-cell" data-label="From">{activityFromValue(activity)}</span>
                          <span className="lead-act-cell" data-label="To">{activityToValue(activity)}</span>
                          <span className="lead-act-cell" data-label="Changed By">{entityName(activity.actor)}</span>
                          <span className="lead-act-cell lead-act-desc" data-label="Description">{activity.message || '—'}</span>
                          <div className="lead-act-cell lead-act-actions" data-label="Actions">
                            <button
                              type="button"
                              className="lead-row-delete"
                              title="Delete activity"
                              onClick={() => setDeleteActivityId(activity._id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {detailTab === 'activities' && (
              <div className="lead-profile-card">
                <div className="lead-profile-card-title">Activities</div>
                <div className="lead-timeline">
                  {detailActivities.length === 0 ? (
                    <div className="lead-profile-empty">No activity recorded.</div>
                  ) : (
                    detailActivities.map((activity: any) => (
                      <div className="lead-timeline-row" key={activity._id}>
                        <span className="lead-timeline-dot" />
                        <strong>{fmt.dateTime(activity.createdAt)}</strong>
                        <span>{activity.message}</span>
                        <em>{entityName(activity.actor)}</em>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {detailTab === 'history' && (
              <div className="lead-profile-card">
                <div className="lead-profile-card-title">Assignment History</div>
                <div className="ticket-history-table">
                  <div className="ticket-history-head">
                    <span>Date & Time</span>
                    <span>From</span>
                    <span>To</span>
                    <span>Changed By</span>
                    <span>Description</span>
                  </div>
                  {assignmentRows.length === 0 ? (
                    <div className="lead-profile-empty">No assignment history recorded.</div>
                  ) : (
                    assignmentRows.map((row: any) => (
                      <div className="ticket-history-row" key={row.id}>
                        <span className="lead-hist-cell lead-hist-date" data-label="Date & Time">
                          <div style={{ fontWeight: 800 }}>{fmt.date(row.date)}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                            {fmt.time(row.date)}
                          </div>
                        </span>
                        <span className="lead-hist-cell" data-label="From">{row.from}</span>
                        <span className="lead-hist-cell" data-label="To">{row.from && row.from !== '—' ? `> ${row.to}` : row.to}</span>
                        <span className="lead-hist-cell" data-label="Changed By">{row.changedBy}</span>
                        <span className="lead-hist-cell lead-hist-desc" data-label="Description">{row.description}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}


          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Ticket"
        message="This ticket will be permanently deleted. Continue?"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteFollowUpId}
        title="Delete Follow-Up"
        message="This follow-up will be permanently deleted. Continue?"
        onConfirm={() => deleteFollowUpId && deleteFollowUpMut.mutate(deleteFollowUpId)}
        onCancel={() => setDeleteFollowUpId(null)}
        loading={deleteFollowUpMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteActivityId}
        title="Delete Activity"
        message="This activity will be permanently deleted. Continue?"
        onConfirm={() => deleteActivityId && deleteActivityMut.mutate(deleteActivityId)}
        onCancel={() => setDeleteActivityId(null)}
        loading={deleteActivityMut.isPending}
      />
    </div>
  );
};
