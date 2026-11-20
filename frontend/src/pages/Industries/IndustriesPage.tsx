import React, { useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, CheckCircle2, XCircle, ListFilter, X, Plus, Download, Building2 } from 'lucide-react';
import api from '../../utils/api';
import { Industry } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type IndustryForm = {
  name: string;
  industryGroups: string[];
  isActive: boolean;
};

const toIndustryForm = (c?: Industry | null): IndustryForm => ({
  name: c?.name || '',
  industryGroups: c?.industryGroups || [],
  isActive: c?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const IndustriesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<Industry | null>(null);
  const [form, setForm] = useState<IndustryForm>(toIndustryForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');

  React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['industries', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/industries', { params });
      return r.data as { data: Industry[]; pages: number; };
    },
  });

  const industries = data?.data || [];
  const exportIndustries = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/industries', { params });
    exportExcelRows('industries', 'Industries', r.data?.data || []);
  };

  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toIndustryForm(null));
    setModalOpen(true);
    setNewGroup('');
  };

  const openEdit = (item: Industry) => {
    setModalMode('edit');
    setActive(item);
    setForm(toIndustryForm(item));
    setModalOpen(true);
    setNewGroup('');
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        industryGroups: form.industryGroups,
      };
      const r = await api.post('/industries', payload);
      return r.data as { data: Industry; pages: number; };
    },
    meta: { invalidateQueryKeys: [['industries'], ['industries', 'customer-form']] },
    onSuccess: () => {
      toast.success('Industry created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create industry')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        industryGroups: form.industryGroups,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/industries/${targetId}`, payload);
      return r.data as { data: Industry; pages: number; };
    },
    meta: { invalidateQueryKeys: [['industries'], ['industries', 'customer-form'], ['customer']] },
    onSuccess: () => {
      toast.success('Industry updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update industry')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/industries/${id}`),
    meta: { invalidateQueryKeys: [['industries'], ['industries', 'customer-form']] },
    onSuccess: () => {
      toast.success('Industry deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete industry')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/industries/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['industries'], ['industries', 'customer-form']] },
    onSuccess: () => {
      toast.success('Industry activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate industry')),
  });

  const addGroup = () => {
    const val = newGroup.trim();
    if (!val) return;
    if (form.industryGroups.includes(val)) {
      toast.error('Industry Group already exists');
      return;
    }
    setForm(f => ({ ...f, industryGroups: [...f.industryGroups, val] }));
    setNewGroup('');
  };

  const removeGroup = (idx: number) => {
    setForm(f => ({ ...f, industryGroups: f.industryGroups.filter((_, i) => i !== idx) }));
  };

  const saving = createMut.isPending || updateMut.isPending;

  const totalCount = industries.length;
  const activeCount = industries.filter(c => c.isActive).length;
  const inactiveCount = industries.filter(c => !c.isActive).length;

  const kpiCards = [
    { label: 'Total Industries', value: totalCount, icon: <ListFilter size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Master list' },
    { label: 'Active', value: activeCount, icon: <CheckCircle2 size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently used' },
    { label: 'Inactive', value: inactiveCount, icon: <XCircle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Disabled' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Industry</div>
          <div className="page-subtitle">Manage industries and their associated industry groups for Customers</div>
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

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search industries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select
              className="filter-select"
              value={includeInactive ? 'all' : 'active'}
              onChange={(value) => setIncludeInactive(value === 'all')}
              options={[{ value: 'all', label: 'Show All' }, { value: 'active', label: 'Active Only' }]}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={exportIndustries}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Industry</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Industry</th>
                <th>Industry Group</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : industries.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Building2 size={22} />}
                      title="No industries found"
                      description="Create your first industry to organize customer operations."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Industry</button>}
                    />
                  </td>
                </tr>
              ) : (
                industries.map((c, idx) => (
                  <tr key={c._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {c.industryGroups && c.industryGroups.length > 0 ? (
                          <>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>{c.industryGroups[0]}</span>
                            {c.industryGroups.length > 1 && (
                              <span className="badge badge-brand" style={{ fontSize: 10 }}>+{c.industryGroups.length - 1}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--tx-4)', fontSize: 11 }}>No industry groups</span>
                        )}
                      </div>
                    </td>
                    <td><Badge status={c.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(c)}>
                          <Edit size={13} />
                        </button>
                        {!c.isActive && (
                          <button className="btn-action btn-action-green" title="Activate" onClick={() => activateMut.mutate(c._id)} disabled={activateMut.isPending}>
                            <CheckCircle2 size={13} />
                          </button>
                        )}
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(c._id)}>
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
        title={modalMode === 'create' ? 'New Industry' : 'Edit Industry'}
        size="lg"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Industry' : 'Save Changes')}
          </button>
        }
      >
        <InputField 
          label="Industry Name" 
          value={form.name} 
          onChange={(v) => setForm((p) => ({ ...p, name: v }))} 
          required 
          placeholder="e.g. Trading" 
        />
        
        <div className="form-group">
          <label className="form-label">Industry Group</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input 
              className="form-control" 
              placeholder="Add industry group..." 
              value={newGroup} 
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup())}
            />
            <button type="button" className="btn btn-secondary btn-icon" onClick={addGroup} style={{ flexShrink: 0 }}>
              <Plus size={16} />
            </button>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40, padding: 12, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {form.industryGroups.length === 0 ? (
              <span style={{ color: 'var(--tx-4)', fontSize: 12, fontStyle: 'italic' }}>No industry groups added yet.</span>
            ) : (
              form.industryGroups.map((grp, i) => (
                <div key={i} className="badge badge-primary" style={{ gap: 8, padding: '4px 8px 4px 12px' }}>
                  {grp}
                  <button 
                    type="button" 
                    onClick={() => removeGroup(i)}
                    style={{ border: 'none', background: 'none', padding: 0, color: 'inherit', display: 'flex', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
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
              {form.isActive ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {form.isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Industry"
        message="This will permanently remove the industry from the master list. Existing customers will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default IndustriesPage;
