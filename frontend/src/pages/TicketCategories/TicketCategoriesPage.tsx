import React, { useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, CheckCircle2, XCircle, ListFilter, X, Plus, Download } from 'lucide-react';
import api from '../../utils/api';
import { TicketCategory } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type CategoryForm = {
  name: string;
  subCategories: string[];
  isActive: boolean;
};

const toCategoryForm = (c?: TicketCategory | null): CategoryForm => ({
  name: c?.name || '',
  subCategories: c?.subCategories || [],
  isActive: c?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const TicketCategoriesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
    const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<TicketCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(toCategoryForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newSub, setNewSub] = useState('');

    React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['ticket-categories', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/ticket-categories', { params });
      return r.data as { data: TicketCategory[]; pages: number; };
    },
  });

  const categories = data?.data || [];
  const exportTicketCategories = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/ticket-categories', { params });
    exportExcelRows('ticket-categories', 'Ticket Categories', r.data?.data || []);
  };

  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toCategoryForm(null));
    setModalOpen(true);
    setNewSub('');
  };

  const openEdit = (c: TicketCategory) => {
    setModalMode('edit');
    setActive(c);
    setForm(toCategoryForm(c));
    setModalOpen(true);
    setNewSub('');
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        subCategories: form.subCategories,
      };
      const r = await api.post('/ticket-categories', payload);
      return r.data as { data: TicketCategory; pages: number; };
    },
    meta: { invalidateQueryKeys: [['ticket-categories']] },
    onSuccess: () => {
      toast.success('Category created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create category')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        subCategories: form.subCategories,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/ticket-categories/${targetId}`, payload);
      return r.data as { data: TicketCategory; pages: number; };
    },
    meta: { invalidateQueryKeys: [['ticket-categories']] },
    onSuccess: () => {
      toast.success('Category updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update category')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/ticket-categories/${id}`),
    meta: { invalidateQueryKeys: [['ticket-categories']] },
    onSuccess: () => {
      toast.success('Category deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete category')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/ticket-categories/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['ticket-categories']] },
    onSuccess: () => {
      toast.success('Category activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate category')),
  });

  const addSub = () => {
    const val = newSub.trim();
    if (!val) return;
    if (form.subCategories.includes(val)) {
      toast.error('Subcategory already exists');
      return;
    }
    setForm(f => ({ ...f, subCategories: [...f.subCategories, val] }));
    setNewSub('');
  };

  const removeSub = (idx: number) => {
    setForm(f => ({ ...f, subCategories: f.subCategories.filter((_, i) => i !== idx) }));
  };

  const saving = createMut.isPending || updateMut.isPending;

  const totalCount = categories.length;
  const activeCount = categories.filter(c => c.isActive).length;
  const inactiveCount = categories.filter(c => !c.isActive).length;

  const kpiCards = [
    { label: 'Total Categories', value: totalCount, icon: <ListFilter size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Master list' },
    { label: 'Active', value: activeCount, icon: <CheckCircle2 size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently used' },
    { label: 'Inactive', value: inactiveCount, icon: <XCircle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Disabled' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Ticket Categories</div>
          <div className="page-subtitle">Manage ticket categories and their subcategories for Support Tickets</div>
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
              placeholder="Search categories..."
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
            <button className="btn btn-export btn-sm" onClick={exportTicketCategories}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Category</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Ticket Category</th>
                <th>Sub Categories</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<PlusCircle size={22} />}
                      title="No categories found"
                      description="Create your first ticket category to organize support requests."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Category</button>}
                    />
                  </td>
                </tr>
              ) : (
                categories.map((c, idx) => (
                  <tr key={c._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                        {c.subCategories.length > 0 ? (
                          <>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>{c.subCategories[0]}</span>
                            {c.subCategories.length > 1 && (
                              <span className="badge badge-brand" style={{ fontSize: 10 }}>+{c.subCategories.length - 1}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--tx-4)', fontSize: 11 }}>No subcategories</span>
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
        title={modalMode === 'create' ? 'New Ticket Category' : 'Edit Ticket Category'}
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
        <InputField 
          label="Category Name" 
          value={form.name} 
          onChange={(v) => setForm((p) => ({ ...p, name: v }))} 
          required 
          placeholder="e.g. Technical Support" 
        />
        
        <div className="form-group">
          <label className="form-label">Sub Categories</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input 
              className="form-control" 
              placeholder="Add subcategory..." 
              value={newSub} 
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub())}
            />
            <button type="button" className="btn btn-secondary btn-icon" onClick={addSub} style={{ flexShrink: 0 }}>
              <Plus size={16} />
            </button>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40, padding: 12, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {form.subCategories.length === 0 ? (
              <span style={{ color: 'var(--tx-4)', fontSize: 12, fontStyle: 'italic' }}>No subcategories added yet.</span>
            ) : (
              form.subCategories.map((sub, i) => (
                <div key={i} className="badge badge-primary" style={{ gap: 8, padding: '4px 8px 4px 12px' }}>
                  {sub}
                  <button 
                    type="button" 
                    onClick={() => removeSub(i)}
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
        title="Delete Category"
        message="This will permanently remove the category from the master list. Existing tickets will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default TicketCategoriesPage;
