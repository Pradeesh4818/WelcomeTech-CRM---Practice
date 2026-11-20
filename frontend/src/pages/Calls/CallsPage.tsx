import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PhoneCall, Search, Download, Edit, Trash2, Filter, Eye } from 'lucide-react';
import api from '../../utils/api';
import { Call, Customer, User } from '../../types';
import { fmt, getActiveCurrency, PAGE_SIZE_OPTIONS } from '../../utils/helpers';
import { exportExcelRows } from '../../utils/excelExport';
import { Badge, Avatar, SkeletonRow, EmptyState, ConfirmDialog, Modal, DetailItem, InputField, Select, SelectField, Spinner, Pagination } from '../../components/ui';
import toast from 'react-hot-toast';
import { useDateFilter } from '../../context/DateFilterContext';

const STATUSES = ['all', 'open', 'in-progress', 'resolved', 'closed'];
const TYPES = ['all', 'remote', 'visit', 'phone', 'email'];
const ISSUE_TYPES = ['E-Invoice / TSS', 'Installation', 'Data Migration', 'Product Updates', 'Sync Issues', 'AWS / Cloud', 'TDL Issues', 'User Training', 'Configuration', 'Other'];

type CallEditForm = {
  customer: string;
  engineer: string;
  type: Call['type'];
  issueType: string;
  subject: string;
  description: string;
  status: Call['status'];
  priority: Call['priority'];
  callDate: string;
  chargeApplicable: boolean;
  chargeAmount: string;
  resolution: string;
};

const toDateInput = (v?: string) => (v ? v.split('T')[0] : '');

const toCallEditForm = (call: Call): CallEditForm => ({
  customer: typeof call.customer === 'object' ? call.customer._id : call.customer,
  engineer: typeof call.engineer === 'object' ? call.engineer._id : call.engineer,
  type: call.type,
  issueType: call.issueType || '',
  subject: call.subject || '',
  description: call.description || '',
  status: call.status,
  priority: call.priority,
  callDate: toDateInput(call.callDate),
  chargeApplicable: !!call.chargeApplicable,
  chargeAmount: call.chargeAmount != null ? String(call.chargeAmount) : '',
  resolution: call.resolution || '',
});

const CallsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [editForm, setEditForm] = useState<CallEditForm>({
    customer: '', engineer: '', type: 'remote', issueType: '', subject: '',
    description: '', status: 'open', priority: 'medium',
    callDate: new Date().toISOString().split('T')[0],
    chargeApplicable: false, chargeAmount: '', resolution: '',
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  
  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  React.useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, pageSize, dateKey]);
  const { data, isLoading } = useQuery({
    queryKey: ['calls', statusFilter, typeFilter, search, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (search.trim()) params.search = search.trim();
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/calls', { params });
      return res.data as unknown as { data: Call[]; pages: number; total: number; };
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/calls/${id}`),
    meta: { invalidateQueryKeys: [['calls']] },
    onSuccess: () => {
      toast.success('Call deleted');
      setDeleteId(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Call> }) => {
      const res = await api.patch(`/calls/${id}`, payload);
      return res.data.data as Call;
    },
    meta: { invalidateQueryKeys: [['calls']] },
    onSuccess: () => {
      toast.success('Call updated');
      setModalOpen(false);
      setModalMode('view');
      setActiveCall(null);
    },
    onError: () => toast.error('Failed to update call'),
  });

  const { data: customersList } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const r = await api.get('/customers/lookup');
      return (r.data?.data || []) as Customer[];
    },
    enabled: modalOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: engineers } = useQuery({
    queryKey: ['engineers'],
    queryFn: async () => { const r = await api.get('/engineers'); return r.data.data as User[]; },
    enabled: modalOpen,
  });

  const calls: Call[] = data?.data || [];

  const totalCalls = data?.total ?? calls.length;
  const openCalls = calls.filter((c) => c.status === 'open').length;
  const inProgressCalls = calls.filter((c) => c.status === 'in-progress').length;
  const resolvedCalls = calls.filter((c) => c.status === 'resolved' || c.status === 'closed').length;

  const kpiCards = [
    { label: 'Total Calls', value: totalCalls, icon: <PhoneCall size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Total visible' },
    { label: 'Open Calls', value: openCalls, icon: <PhoneCall size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Needs action' },
    { label: 'In Progress', value: inProgressCalls, icon: <PhoneCall size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'Currently active' },
    { label: 'Resolved / Closed', value: resolvedCalls, icon: <PhoneCall size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Completed' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Call Log</div>
          <div className="page-subtitle">
            {data?.total || 0} total calls logged
            {hasActiveDateFilter && (
              <span className="ml-2 inline-flex items-center text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                • {headerDateLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg }}><span style={{ color: kpi.color }}>{kpi.icon}</span></div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{isLoading ? '—' : kpi.value}</div>
            <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search calls..."
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
              options={STATUSES.map((s) => ({ value: s, label: s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ') }))}
            />
            <Select
              className="filter-select"
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPES.map((t) => ({ value: t, label: t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={async () => {
                const params: Record<string, string> = { limit: '5000', page: '1' };
                if (statusFilter !== 'all') params.status = statusFilter;
                if (typeFilter !== 'all') params.type = typeFilter;
                if (search.trim()) params.search = search.trim();
                if (hasActiveDateFilter) {
                  params.startDate = startDate;
                  params.endDate = endDate;
                }
                const res = await api.get('/calls', { params });
                exportExcelRows('call-log', 'Calls', (res.data?.data || []) as unknown as Record<string, unknown>[]);
              }}
            >
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/calls/new')}><PhoneCall size={13} /> Log Call</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Logo</th>
                <th>Customer</th>
                <th>Subject</th>
                <th>Engineer</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={10} />)
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState icon={<PhoneCall size={22} />} title="No calls found" description="Log your first call or adjust filters." action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/calls/new')}><PhoneCall size={13} /> Log Call</button>} />
                  </td>
                </tr>
              ) : (
                calls.map((call, idx) => {
                  const customer = typeof call.customer === 'object' ? call.customer : null;
                  const engineer = typeof call.engineer === 'object' ? call.engineer : null;
                  return (
                    <tr key={call._id}>
                      <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                      <td>
                        {customer && <Avatar name={customer.name} src={customer.avatar} size="sm" />}
                      </td>
                      <td>
                        <span style={{ fontWeight: 500, fontSize: 12.5 }}>{customer?.name || '—'}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 12.5 }}>{call.subject}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-4)', marginTop: 1 }}>{call.issueType}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {engineer && <Avatar name={engineer.name} size="sm" />}
                          <span style={{ fontSize: 12 }}>{engineer?.name || '—'}</span>
                        </div>
                      </td>
                      <td><Badge status={call.type} /></td>
                      <td><Badge status={call.priority} /></td>
                      <td><Badge status={call.status} /></td>
                      <td style={{ fontSize: 11.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>{fmt.date(call.callDate)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn-action btn-action-blue"
                            onClick={() => { setActiveCall(call); setModalMode('view'); setModalOpen(true); }}
                            title="View"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            className="btn-action btn-action-amber"
                            onClick={() => { setActiveCall(call); setEditForm(toCallEditForm(call)); setModalMode('edit'); setModalOpen(true); }}
                            title="Edit"
                          >
                            <Edit size={13} />
                          </button>
                          <button className="btn-action btn-action-red" onClick={() => setDeleteId(call._id)} title="Delete"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Call"
        message="This action cannot be undone. Delete this call record?"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />

      <Modal
        open={modalOpen && !!activeCall}
        onClose={() => { setModalOpen(false); setModalMode('view'); setActiveCall(null); }}
        title={modalMode === 'edit' ? 'Edit Call' : 'Call Details'}
        size="lg"
        footer={(() => {
          if (!activeCall) return null;

          if (modalMode === 'view') {
            return (
              <>
                <button className="btn btn-primary" onClick={() => { setEditForm(toCallEditForm(activeCall)); setModalMode('edit'); }}>
                  <Edit size={13} /> Edit
                </button>
              </>
            );
          }

          return (
            <>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!activeCall) return;
                  updateMut.mutate({
                    id: activeCall._id,
                    payload: {
                      customer: editForm.customer as any,
                      engineer: editForm.engineer as any,
                      type: editForm.type,
                      issueType: editForm.issueType,
                      subject: editForm.subject,
                      description: editForm.description || undefined,
                      status: editForm.status,
                      priority: editForm.priority,
                      callDate: editForm.callDate,
                      resolution: editForm.resolution || undefined,
                      chargeApplicable: editForm.chargeApplicable,
                      chargeAmount: editForm.chargeApplicable && editForm.chargeAmount ? Number(editForm.chargeAmount) : null,
                    } as Partial<Call>,
                  });
                }}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? <Spinner size={14} /> : null}
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          );
        })()}
      >
        {!activeCall ? null : modalMode === 'view' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeCall.subject}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 2 }}>
                  {activeCall.issueType || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <Badge status={activeCall.priority} />
                <Badge status={activeCall.status} />
              </div>
            </div>

            <div className="details-grid">
              <DetailItem
                label="Customer"
                value={typeof activeCall.customer === 'object' ? activeCall.customer?.name : '—'}
                subvalue={typeof activeCall.customer === 'object' ? activeCall.customer?.phone : undefined}
              />
              <DetailItem
                label="Engineer"
                value={typeof activeCall.engineer === 'object' ? activeCall.engineer?.name : '—'}
              />
              <DetailItem label="Type" value={<Badge status={activeCall.type} />} />
              <DetailItem label="Call Date" value={<span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.date(activeCall.callDate)}</span>} />
              <DetailItem label="Charge" value={activeCall.chargeApplicable ? fmt.currency(activeCall.chargeAmount || 0) : 'No'} />
              <DetailItem label="Resolution" value={activeCall.resolution || '—'} />
              <DetailItem label="Description" value={activeCall.description || '—'} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid-2">
              <SelectField
                label="Customer"
                value={editForm.customer}
                onChange={(v) => setEditForm((p) => ({ ...p, customer: v }))}
                options={(customersList || []).map((c) => ({ value: c._id, label: c.name }))}
                placeholder="— Select Customer —"
                required
                disabled={updateMut.isPending}
              />
              <SelectField
                label="Assigned Engineer"
                value={editForm.engineer}
                onChange={(v) => setEditForm((p) => ({ ...p, engineer: v }))}
                options={(engineers || []).map((e) => ({ value: e._id, label: e.name }))}
                placeholder="— Select Engineer —"
                required
                disabled={updateMut.isPending}
              />
              <SelectField
                label="Call Type"
                value={editForm.type}
                onChange={(v) => setEditForm((p) => ({ ...p, type: v as Call['type'] }))}
                options={[{ value: 'remote', label: 'Remote' }, { value: 'visit', label: 'Site Visit' }, { value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }]}
              />
              <SelectField
                label="Issue Type"
                value={editForm.issueType}
                onChange={(v) => setEditForm((p) => ({ ...p, issueType: v }))}
                options={ISSUE_TYPES.map((i) => ({ value: i, label: i }))}
                placeholder="Select issue"
                required
              />
              <InputField label="Subject" value={editForm.subject} onChange={(v) => setEditForm((p) => ({ ...p, subject: v }))} required />
              <InputField label="Call Date" value={editForm.callDate} onChange={(v) => setEditForm((p) => ({ ...p, callDate: v }))} type="date" required />
              <SelectField
                label="Status"
                value={editForm.status}
                onChange={(v) => setEditForm((p) => ({ ...p, status: v as Call['status'] }))}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'in-progress', label: 'In Progress' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
              <SelectField
                label="Priority"
                value={editForm.priority}
                onChange={(v) => setEditForm((p) => ({ ...p, priority: v as Call['priority'] }))}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detailed problem description..."
                rows={3}
                disabled={updateMut.isPending}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Resolution</label>
              <textarea
                className="form-control"
                value={editForm.resolution}
                onChange={(e) => setEditForm((p) => ({ ...p, resolution: e.target.value }))}
                placeholder="Steps taken to resolve..."
                rows={2}
                disabled={updateMut.isPending}
              />
            </div>

            <div className="soft-alert" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.chargeApplicable}
                  onChange={(e) => setEditForm((p) => ({ ...p, chargeApplicable: e.target.checked }))}
                  disabled={updateMut.isPending}
                />
                Charge Applicable
              </label>
              {editForm.chargeApplicable ? (
                <div style={{ width: 200 }}>
                  <InputField
                    label={`Charge Amount (${getActiveCurrency()})`}
                    value={editForm.chargeAmount}
                    onChange={(v) => setEditForm((p) => ({ ...p, chargeAmount: v }))}
                    type="number"
                    placeholder="0.00"
                    className={undefined}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CallsPage;
