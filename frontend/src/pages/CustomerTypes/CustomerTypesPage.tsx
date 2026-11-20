import React, { useMemo, useState } from 'react';
import { Pagination } from '../../components/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PlusCircle, Search, Edit, Trash2, Users, ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import api from '../../utils/api';
import { CustomerType } from '../../types';
import { Badge, ConfirmDialog, EmptyState, InputField, Modal, Select, SkeletonRow, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';
import { exportExcelRows } from '../../utils/excelExport';

type CustomerTypeForm = {
  name: string;
  description: string;
  isActive: boolean;
};

const toCustomerTypeForm = (ct?: CustomerType | null): CustomerTypeForm => ({
  name: ct?.name || '',
  description: ct?.description || '',
  isActive: ct?.isActive ?? true,
});

const getErrMsg = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback;

const CustomerTypesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
    const [includeInactive, setIncludeInactive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [active, setActive] = useState<CustomerType | null>(null);
  const [form, setForm] = useState<CustomerTypeForm>(toCustomerTypeForm(null));
  const [deleteId, setDeleteId] = useState<string | null>(null);

    React.useEffect(() => { setPage(1); }, [search, includeInactive]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['customer-types', search, includeInactive, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (includeInactive) params.includeInactive = 'true';
      const r = await api.get('/customer-types', { params });
      return r.data as { data: CustomerType[]; pages: number; };
    },
  });

  const customerTypes = data?.data || [];
  const exportCustomerTypes = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search) params.search = search;
    if (includeInactive) params.includeInactive = 'true';
    const r = await api.get('/customer-types', { params });
    exportExcelRows('customer-types', 'Customer Types', r.data?.data || []);
  };
  const openCreate = () => {
    setModalMode('create');
    setActive(null);
    setForm(toCustomerTypeForm(null));
    setModalOpen(true);
  };

  const openEdit = (ct: CustomerType) => {
    setModalMode('edit');
    setActive(ct);
    setForm(toCustomerTypeForm(ct));
    setModalOpen(true);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      const r = await api.post('/customer-types', payload);
      return r.data as { data: CustomerType; pages: number; };
    },
    meta: { invalidateQueryKeys: [['customer-types']] },
    onSuccess: () => {
      toast.success('Customer type created');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to create customer type')),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const targetId = active?._id || '';
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        isActive: !!form.isActive,
      };
      const r = await api.patch(`/customer-types/${targetId}`, payload);
      return r.data as { data: CustomerType; pages: number; };
    },
    meta: { invalidateQueryKeys: [['customer-types']] },
    onSuccess: () => {
      toast.success('Customer type updated');
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to update customer type')),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/customer-types/${id}`),
    meta: { invalidateQueryKeys: [['customer-types']] },
    onSuccess: () => {
      toast.success('Customer type deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to delete customer type')),
  });

  const activateMut = useMutation({
    mutationFn: async (id: string) => api.patch(`/customer-types/${id}`, { isActive: true }),
    meta: { invalidateQueryKeys: [['customer-types']] },
    onSuccess: () => {
      toast.success('Customer type activated');
    },
    onError: (err: any) => toast.error(getErrMsg(err, 'Failed to activate customer type')),
  });

  const saving = createMut.isPending || updateMut.isPending;

  const totalTypes = customerTypes.length;
  const activeTypes = customerTypes.filter(ct => ct.isActive).length;
  const inactiveTypes = customerTypes.filter(ct => !ct.isActive).length;

  const kpiCards = [
    { label: 'Total Types', value: totalTypes, icon: <Users size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All visible' },
    { label: 'Active', value: activeTypes, icon: <ShieldCheck size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently available' },
    { label: 'Inactive', value: inactiveTypes, icon: <ShieldAlert size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Archived/Hidden' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Types</div>
          <div className="page-subtitle">Manage customer types (used in Customer creation)</div>
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
              placeholder="Search customer types..."
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
            <button className="btn btn-export btn-sm" onClick={exportCustomerTypes}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Customer Type</button>
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
              ) : customerTypes.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<PlusCircle size={22} />}
                      title="No customer types found"
                      description="Create your first customer type to show it in the Customer form."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><PlusCircle size={13} /> New Customer Type</button>}
                    />
                  </td>
                </tr>
              ) : (
                customerTypes.map((ct, idx) => (
                  <tr key={ct._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{ct.name}</td>
                    <td><Badge status={ct.isActive ? 'active' : 'inactive'} /></td>
                    <td style={{ fontSize: 12, color: 'var(--tx-3)' }}>{ct.description || '—'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(ct)}>
                          <Edit size={13} />
                        </button>
                        {!ct.isActive && (
                          <button className="btn-action btn-action-green" title="Activate" onClick={() => activateMut.mutate(ct._id)} disabled={activateMut.isPending}>
                            <ShieldCheck size={13} />
                          </button>
                        )}
                        <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(ct._id)}>
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
        title={modalMode === 'create' ? 'New Customer Type' : 'Edit Customer Type'}
        size="lg"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => (modalMode === 'create' ? createMut.mutate() : updateMut.mutate())}
            disabled={saving}
          >
            {saving ? <Spinner size={14} /> : (modalMode === 'create' ? <PlusCircle size={14} /> : <Edit size={14} />)}
            {saving ? 'Saving...' : (modalMode === 'create' ? 'Create Customer Type' : 'Save Changes')}
          </button>
        }
      >
        <InputField label="Customer Type Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required placeholder="e.g. Retail, Wholesale, Corporate" />
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
        title="Delete Customer Type"
        message="This will permanently remove the customer type from the master list. Existing customer records will keep their current text values."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deactivateMut.mutate(deleteId)}
        loading={deactivateMut.isPending}
        variant="danger"
      />
    </div>
  );
};

export default CustomerTypesPage;
