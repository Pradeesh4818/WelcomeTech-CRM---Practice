import React, { useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, CheckCircle2, XCircle, ListFilter, Download, Layers } from 'lucide-react';
import api from '../../utils/api';
import { BusinessSegment } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type BusinessSegmentForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const toBusinessSegmentForm = (s?: BusinessSegment | null): BusinessSegmentForm => ({
  name: s?.name || '',
  description: s?.description || '',
  isActive: s?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const BusinessSegmentsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<BusinessSegment | null>(null);
  const [form, setForm] = useState<BusinessSegmentForm>(toBusinessSegmentForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

  React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['business-segments', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/business-segments', { params });
      return r.data as { data: BusinessSegment[]; pages: number; };
    },
  });

  const segments = data?.data || [];
  const exportSegments = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/business-segments', { params });
    exportExcelRows('business-segments', 'Business Segments', r.data?.data || []);
  };

  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toBusinessSegmentForm(null));
    setModalOpen(true);
  };

  const openEdit = (item: BusinessSegment) => {
    setModalMode('edit');
    setActive(item);
    setForm(toBusinessSegmentForm(item));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      const r = await api.post('/business-segments', payload);
      return r.data as { data: BusinessSegment; pages: number; };
    },
    meta: { invalidateQueryKeys: [['business-segments'], ['business-segments', 'customer-form']] },
    onSuccess: () => {
      toast.success('Business segment created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create business segment')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/business-segments/${targetId}`, payload);
      return r.data as { data: BusinessSegment; pages: number; };
    },
    meta: { invalidateQueryKeys: [['business-segments'], ['business-segments', 'customer-form'], ['customer']] },
    onSuccess: () => {
      toast.success('Business segment updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update business segment')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/business-segments/${id}`),
    meta: { invalidateQueryKeys: [['business-segments'], ['business-segments', 'customer-form']] },
    onSuccess: () => {
      toast.success('Business segment deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete business segment')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/business-segments/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['business-segments'], ['business-segments', 'customer-form']] },
    onSuccess: () => {
      toast.success('Business segment activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate business segment')),
  });

  const saving = createMut.isPending || updateMut.isPending;

  const totalCount = segments.length;
  const activeCount = segments.filter(c => c.isActive).length;
  const inactiveCount = segments.filter(c => !c.isActive).length;

  const kpiCards = [
    { label: 'Total Segments', value: totalCount, icon: <ListFilter size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Master list' },
    { label: 'Active', value: activeCount, icon: <CheckCircle2 size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently used' },
    { label: 'Inactive', value: inactiveCount, icon: <XCircle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Disabled' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Business Segment</div>
          <div className="page-subtitle">Manage business segments for Customer classification and operations</div>
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
              placeholder="Search segments..."
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
            <button className="btn btn-export btn-sm" onClick={exportSegments}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Business Segment</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Business Segment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
              ) : segments.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<Layers size={22} />}
                      title="No business segments found"
                      description="Create your first business segment to categorize customer accounts."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Business Segment</button>}
                    />
                  </td>
                </tr>
              ) : (
                segments.map((c, idx) => (
                  <tr key={c._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</td>
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
        title={modalMode === 'create' ? 'New Business Segment' : 'Edit Business Segment'}
        size="md"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Segment' : 'Save Changes')}
          </button>
        }
      >
        <InputField 
          label="Business Segment Name" 
          value={form.name} 
          onChange={(v) => setForm((p) => ({ ...p, name: v }))} 
          required 
          placeholder="e.g. Corporate / Retail / SME" 
        />
        
        <InputField 
          label="Description" 
          value={form.description} 
          onChange={(v) => setForm((p) => ({ ...p, description: v }))} 
          placeholder="Optional description" 
        />

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
        title="Delete Business Segment"
        message="This will permanently remove the business segment from the master list. Existing customers will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default BusinessSegmentsPage;
