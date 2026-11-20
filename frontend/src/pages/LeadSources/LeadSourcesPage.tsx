import React, { useMemo, useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, ShieldCheck, ShieldAlert, Target, Download } from 'lucide-react';
import api from '../../utils/api';
import { LeadSource } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type LeadSourceForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const toLeadSourceForm = (l?: LeadSource | null): LeadSourceForm => ({
  name: l?.name || '',
  description: l?.description || '',
  isActive: l?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const LeadSourcesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<LeadSource | null>(null);
  const [form, setForm] = useState<LeadSourceForm>(toLeadSourceForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['lead-sources', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/lead-sources', { params });
      return r.data as { data: LeadSource[]; pages: number; };
    },
  });

  const leadSources = data?.data || [];
  const exportLeadSources = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/lead-sources', { params });
    exportExcelRows('lead-sources', 'Lead Sources', r.data?.data || []);
  };
  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toLeadSourceForm(null));
    setModalOpen(true);
  };

  const openEdit = (l: LeadSource) => {
    setModalMode('edit');
    setActive(l);
    setForm(toLeadSourceForm(l));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      const r = await api.post('/lead-sources', payload);
      return r.data as { data: LeadSource; pages: number; };
    },
    meta: { invalidateQueryKeys: [['lead-sources']] },
    onSuccess: () => {
      toast.success('Lead source created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create lead source')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/lead-sources/${targetId}`, payload);
      return r.data as { data: LeadSource; pages: number; };
    },
    meta: { invalidateQueryKeys: [['lead-sources']] },
    onSuccess: () => {
      toast.success('Lead source updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update lead source')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/lead-sources/${id}`),
    meta: { invalidateQueryKeys: [['lead-sources']] },
    onSuccess: () => {
      toast.success('Lead source deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete lead source')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/lead-sources/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['lead-sources']] },
    onSuccess: () => {
      toast.success('Lead source activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate lead source')),
  });

  const saving = createMut.isPending || updateMut.isPending;

  const totalSources = leadSources.length;
  const activeSources = leadSources.filter(l => l.isActive).length;
  const inactiveSources = leadSources.filter(l => !l.isActive).length;

  const kpiCards = [
    { label: 'Total Sources', value: totalSources, icon: <Target size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All visible' },
    { label: 'Active', value: activeSources, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently available' },
    { label: 'Inactive', value: inactiveSources, icon: <ShieldAlert size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Archived/Hidden' },
  ];

  return (
    <div className="lead-sources-page">
      <div className="page-header">
        <div>
          <div className="page-title">Lead Sources</div>
          <div className="page-subtitle">Manage acquisition channels for leads</div>
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

      <div className="card card-table-sep lead-sources-card">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search lead sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            <button className="btn btn-export btn-sm" onClick={exportLeadSources}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Lead Source</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro lead-sources-table">
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
              ) : leadSources.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Target size={22} />}
                      title="No lead sources found"
                      description="Create your first lead source to track where your leads come from."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Lead Source</button>}
                    />
                  </td>
                </tr>
              ) : (
                leadSources.map((l, idx) => (
                  <tr key={l._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td className="lead-source-name-cell">{l.name}</td>
                    <td className="lead-source-status-cell"><Badge status={l.isActive ? 'active' : 'inactive'} /></td>
                    <td className="lead-source-desc-cell">{l.description || '—'}</td>
                    <td className="lead-source-actions-cell">
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(l)}>
                          <Edit size={13} />
                        </button>
                        {!l.isActive && (
                          <button className="btn-action btn-action-green" title="Activate" onClick={() => activateMut.mutate(l._id)} disabled={activateMut.isPending}>
                            <ShieldCheck size={13} />
                          </button>
                        )}
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(l._id)}>
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
        <Pagination currentPage={page} totalPages={data?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} onPageSizeChange={(v) => { setPageSize(v); setPage(1); }} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'create' ? 'New Lead Source' : 'Edit Lead Source'}
        size="md"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Lead Source' : 'Save Changes')}
          </button>
        }
      >
        <InputField label="Lead Source Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required placeholder="e.g. Website, Referral, LinkedIn" />
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-control"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Optional notes..."
          />
        </div>
        {modalMode === 'edit' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <button
              type="button"
              className={`btn btn-sm ${form.isActive ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
            >
              {form.isActive ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              {form.isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Lead Source"
        message="This will permanently remove the lead source from the master list. Existing lead records will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default LeadSourcesPage;
