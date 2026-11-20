import React, { useMemo, useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, ShieldCheck, ShieldAlert, List, Download } from 'lucide-react';
import api from '../../utils/api';
import { VendorCategory } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type VendorCategoryForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const toVendorCategoryForm = (v?: VendorCategory | null): VendorCategoryForm => ({
  name: v?.name || '',
  description: v?.description || '',
  isActive: v?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const VendorCategoriesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
    const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<VendorCategory | null>(null);
  const [form, setForm] = useState<VendorCategoryForm>(toVendorCategoryForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

    React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-categories', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/vendor-categories', { params });
      return r.data as { data: VendorCategory[]; pages: number; };
    },
  });

  const vendorCategories = data?.data || [];
  const exportVendorCategories = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/vendor-categories', { params });
    exportExcelRows('vendor-categories', 'Vendor Categories', r.data?.data || []);
  };
  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toVendorCategoryForm(null));
    setModalOpen(true);
  };

  const openEdit = (v: VendorCategory) => {
    setModalMode('edit');
    setActive(v);
    setForm(toVendorCategoryForm(v));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      const r = await api.post('/vendor-categories', payload);
      return r.data as { data: VendorCategory; pages: number; };
    },
    meta: { invalidateQueryKeys: [['vendor-categories'], ['vendor-categories-all'], ['customer-form-vendor-categories']] },
    onSuccess: () => {
      toast.success('Vendor category created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create vendor category')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/vendor-categories/${targetId}`, payload);
      return r.data as { data: VendorCategory; pages: number; };
    },
    meta: { invalidateQueryKeys: [['vendor-categories'], ['vendor-categories-all'], ['customer-form-vendor-categories']] },
    onSuccess: () => {
      toast.success('Vendor category updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update vendor category')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/vendor-categories/${id}`),
    meta: { invalidateQueryKeys: [['vendor-categories'], ['vendor-categories-all'], ['customer-form-vendor-categories']] },
    onSuccess: () => {
      toast.success('Vendor category deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete vendor category')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/vendor-categories/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['vendor-categories'], ['vendor-categories-all'], ['customer-form-vendor-categories']] },
    onSuccess: () => {
      toast.success('Vendor category activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate vendor category')),
  });

  const saving = createMut.isPending || updateMut.isPending;

  const totalTypes = vendorCategories.length;
  const activeTypes = vendorCategories.filter(v => v.isActive).length;
  const inactiveTypes = vendorCategories.filter(v => !v.isActive).length;

  const kpiCards = [
    { label: 'Total Categories', value: totalTypes, icon: <List size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All visible' },
    { label: 'Active', value: activeTypes, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently available' },
    { label: 'Inactive', value: inactiveTypes, icon: <ShieldAlert size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Archived/Hidden' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Vendor Categories</div>
          <div className="page-subtitle">Manage categories for vendors and service modules</div>
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
              placeholder="Search vendor categories..."
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
            <button className="btn btn-export btn-sm" onClick={exportVendorCategories}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Category</button>
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
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : vendorCategories.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<PlusCircle size={22} />}
                      title="No vendor categories found"
                      description="Create your first vendor category to show it in the service modules."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Category</button>}
                    />
                  </td>
                </tr>
              ) : (
                vendorCategories.map((v, idx) => (
                  <tr key={v._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{v.name}</td>
                    <td><Badge status={v.isActive ? 'active' : 'inactive'} /></td>
                    <td style={{ fontSize: 12, color: 'var(--tx-3)' }}>{v.description || '—'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(v)}>
                          <Edit size={13} />
                        </button>
                        {!v.isActive && (
                          <button className="btn-action btn-action-green" title="Activate" onClick={() => activateMut.mutate(v._id)} disabled={activateMut.isPending}>
                            <ShieldCheck size={13} />
                          </button>
                        )}
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(v._id)}>
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
        title={modalMode === 'create' ? 'New Vendor Category' : 'Edit Vendor Category'}
        size="lg"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Category' : 'Save Changes')}
          </button>
        }
      >
        <InputField label="Category Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required placeholder="e.g. Local Partner, International Vendor" />
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
        title="Delete Vendor Category"
        message="This will permanently remove the vendor category from the master list. Existing customer records will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default VendorCategoriesPage;
