import React, { useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, ShieldCheck, ShieldAlert, ListChecks, Download } from 'lucide-react';
import api from '../../utils/api';
import { LeadStatusMaster } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type LeadStatusForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const toLeadStatusForm = (l?: LeadStatusMaster | null): LeadStatusForm => ({
  name: l?.name || '',
  description: l?.description || '',
  isActive: l?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const LeadStatusesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
    const [includeInactive, setIncludeInactive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<LeadStatusMaster | null>(null);
  const [form, setForm] = useState<LeadStatusForm>(toLeadStatusForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

    React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['lead-statuses', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/lead-statuses', { params });
      return r.data as { data: LeadStatusMaster[]; pages: number; };
    },
  });

  const leadStatuses = data?.data || [];
  const exportLeadStatuses = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/lead-statuses', { params });
    exportExcelRows('lead-statuses', 'Lead Statuses', r.data?.data || []);
  };

  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toLeadStatusForm(null));
    setModalOpen(true);
  };

  const openEdit = (l: LeadStatusMaster) => {
    setModalMode('edit');
    setActive(l);
    setForm(toLeadStatusForm(l));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await api.post('/lead-statuses', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      return r.data as { data: LeadStatusMaster; pages: number; };
    },
    meta: { invalidateQueryKeys: [['lead-statuses']] },
    onSuccess: () => {
      toast.success('Lead status created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create lead status')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const r = await api.patch(`/lead-statuses/${active?._id || ''}`, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: !!form.isActive,
      });
      return r.data as { data: LeadStatusMaster; pages: number; };
    },
    meta: { invalidateQueryKeys: [['lead-statuses'], ['lead-statuses-active']] },
    onSuccess: () => {
      toast.success('Lead status updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update lead status')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/lead-statuses/${id}`),
    meta: { invalidateQueryKeys: [['lead-statuses'], ['lead-statuses-active']] },
    onSuccess: () => {
      toast.success('Lead status deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete lead status')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/lead-statuses/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['lead-statuses'], ['lead-statuses-active']] },
    onSuccess: () => toast.success('Lead status activated'),
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate lead status')),
  });

  const saving = createMut.isPending || updateMut.isPending;
  const activeCount = leadStatuses.filter(l => l.isActive).length;
  const inactiveCount = leadStatuses.filter(l => !l.isActive).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Lead Status</div>
          <div className="page-subtitle">Manage lead pipeline statuses shown in the lead form</div>
        </div>
      </div>

      <div className="kpi-grid">
        {[
          { label: 'Total Statuses', value: leadStatuses.length, icon: <ListChecks size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All visible' },
          { label: 'Active', value: activeCount, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Shown in leads' },
          { label: 'Inactive', value: inactiveCount, icon: <ShieldAlert size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Hidden from form' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg }}><span style={{ color: kpi.color }}>{kpi.icon}</span></div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{isLoading ? '-' : kpi.value}</div>
            <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input className="search-input" placeholder="Search lead statuses..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-group">
            <Select
              className="filter-select"
              value={includeInactive ? 'all' : 'active'}
              onChange={(v) => setIncludeInactive(v === 'all')}
              options={[{ value: 'all', label: 'Show All' }, { value: 'active', label: 'Active Only' }]}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={exportLeadStatuses}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Lead Status</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Name</th>
                <th>Status</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : leadStatuses.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<ListChecks size={22} />}
                      title="No lead statuses found"
                      description="Create statuses to control the lead form dropdown."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Lead Status</button>}
                    />
                  </td>
                </tr>
              ) : (
                leadStatuses.map((l, idx) => (
                  <tr key={l._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{l.name}</td>
                    <td><Badge status={l.isActive ? 'active' : 'inactive'} /></td>
                    <td style={{ fontSize: 12, color: 'var(--tx-3)' }}>{l.description || '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(l)}><Edit size={13} /></button>
                        {!l.isActive && (
                          <button className="btn-action btn-action-green" title="Activate" onClick={() => activateMut.mutate(l._id)} disabled={activateMut.isPending}><ShieldCheck size={13} /></button>
                        )}
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(l._id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={data?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} onPageSizeChange={(v) => { setPageSize(v); setPage(1); }} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'create' ? 'New Lead Status' : 'Edit Lead Status'}
        size="lg"
        footer={
          <button className="btn btn-primary" onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())} disabled={saving || !form.name.trim()}>
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Lead Status' : 'Save Changes')}
          </button>
        }
      >
        <InputField label="Lead Status Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required placeholder="e.g. New, Followup, Won" />
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional notes..." />
        </div>
        {modalMode === 'edit' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <button type="button" className={`btn btn-sm ${form.isActive ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {form.isActive ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              {form.isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Lead Status"
        message="This will permanently remove the lead status from the master list. Existing lead records will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default LeadStatusesPage;
