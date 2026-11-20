import React, { useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, PackageCheck, PackageX, Download } from 'lucide-react';
import api from '../../utils/api';
import { Product } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type ProductForm = {
  name: string;
  isActive: boolean;
};

const toProductForm = (p?: Product | null): ProductForm => ({
  name: p?.name || '',
  isActive: p?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const ProductsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
    const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(toProductForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

    React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['products', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/products', { params });
      return r.data as { data: Product[]; pages: number; };
    },
  });



  const products = data?.data || [];
  const exportProducts = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/products', { params });
    exportExcelRows('products', 'Products', r.data?.data || []);
  };

  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toProductForm(null));
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setModalMode('edit');
    setActive(p);
    setForm(toProductForm(p));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
      };
      const r = await api.post('/products', payload);
      return r.data as { data: Product; pages: number; };
    },
    meta: { invalidateQueryKeys: [['products']] },
    onSuccess: () => {
      toast.success('Product created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create product')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/products/${targetId}`, payload);
      return r.data as { data: Product; pages: number; };
    },
    meta: { invalidateQueryKeys: [['products']] },
    onSuccess: () => {
      toast.success('Product updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update product')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    meta: { invalidateQueryKeys: [['products']] },
    onSuccess: () => {
      toast.success('Product deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete product')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/products/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['products']] },
    onSuccess: () => {
      toast.success('Product activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate product')),
  });

  const saving = createMut.isPending || updateMut.isPending;

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.isActive).length;
  const inactiveProducts = products.filter(p => !p.isActive).length;

  const kpiCards = [
    { label: 'Total Products', value: totalProducts, icon: <PackageCheck size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All visible' },
    { label: 'Active', value: activeProducts, icon: <PackageCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently available' },
    { label: 'Inactive', value: inactiveProducts, icon: <PackageX size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Archived/Hidden' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-subtitle">Manage your product master list (used in Customer creation)</div>
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
              placeholder="Search products..."
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
            <button className="btn btn-export btn-sm" onClick={exportProducts}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Product</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<PlusCircle size={22} />}
                      title="No products found"
                      description="Create your first product to show it in the Customer form."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Product</button>}
                    />
                  </td>
                </tr>
              ) : (
                products.map((p, idx) => (
                  <tr key={p._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{p.name}</td>
                    <td><Badge status={p.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(p)}>
                          <Edit size={13} />
                        </button>
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(p._id)}>
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
        title={modalMode === 'create' ? 'New Product' : 'Edit Product'}
        size="lg"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Product' : 'Save Changes')}
          </button>
        }
      >
        <InputField label="Product Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required placeholder="e.g. TallyPrime 4.0" />
        {modalMode === 'edit' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <button
              type="button"
              className={`btn btn-sm ${form.isActive ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
            >
              {form.isActive ? <PackageCheck size={14} /> : <PackageX size={14} />}
              {form.isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Product"
        message="This will permanently remove the product from the master list. Existing customer records will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default ProductsPage;
