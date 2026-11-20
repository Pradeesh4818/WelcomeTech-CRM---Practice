import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Users, UserPlus, Search, ShieldCheck, CheckCircle, XCircle, Eye, Edit2, Lock, Trash2, Upload, Download,
} from 'lucide-react';
import api from '../../utils/api';
import { User } from '../../types';
import {
  Avatar, Badge, ConfirmDialog, DetailItem, EmptyState, InputField, Modal, Select, SelectField, SkeletonRow, Spinner, Pagination
} from '../../components/ui';
import { exportExcelRows } from '../../utils/excelExport';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

type AdminForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
  isActive: boolean;
};

const defaultForm = (): AdminForm => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  password: '',
  confirmPassword: '',
  isActive: true,
});

const toDate = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<AdminForm>(defaultForm());
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [page, setPage] = useState(1);
      React.useEffect(() => { setPage(1); }, [search, statusFilter]);
  const [pageSize, setPageSize] = useState('10');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, statusFilter, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { role: 'admin', limit: pageSize, page: String(page) };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const r = await api.get('/employees', { params });
      return r.data as unknown as { data: User[]; pages: number; total: number; };
    },
  });

  const admins = data?.data || [];
  const total = data?.total || 0;
  const active = admins.filter((u) => u.isActive).length;
  const inactive = total - active;
  const exportAdmins = async () => {
    const params: Record<string, string> = { role: 'admin', limit: '5000', page: '1' };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    const r = await api.get('/employees', { params });
    exportExcelRows('admin-users', 'Admin Users', r.data?.data || []);
  };

  const set = (field: keyof AdminForm, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const openCreate = () => {
    setEditingUser(null);
    setForm(defaultForm());
    setAvatarFile(null);
    setAvatarPreview(null);
    setUpsertOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      password: '',
      confirmPassword: '',
      isActive: !!user.isActive,
    });
    setAvatarFile(null);
    setAvatarPreview(user.avatar || null);
    setUpsertOpen(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('email', form.email.trim());
      fd.append('phone', form.phone.trim());
      fd.append('address', form.address.trim());
      fd.append('isActive', String(form.isActive));
      fd.append('role', 'admin');
      if (avatarFile) fd.append('avatar', avatarFile);
      if (form.password) {
        fd.append('password', form.password);
        fd.append('confirmPassword', form.confirmPassword);
      }

      if (editingUser) {
        await api.patch(`/employees/${editingUser._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return;
      }
      await api.post('/employees', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    meta: { invalidateQueryKeys: [['admin-users'], ['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success(editingUser ? 'Admin updated' : 'Admin created');
      setUpsertOpen(false);
      setEditingUser(null);
      setForm(defaultForm());
      setAvatarFile(null);
      setAvatarPreview(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to save admin'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: User) => {
      const fd = new FormData();
      fd.append('isActive', String(!user.isActive));
      await api.patch(`/employees/${user._id}`, fd);
    },
    meta: { invalidateQueryKeys: [['admin-users'], ['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/employees/${id}`);
    },
    meta: { invalidateQueryKeys: [['admin-users'], ['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success('Admin deleted');
      setDeleteTarget(null);
      if (activeUser?._id === deleteTarget?._id) setActiveUser(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to delete admin'),
  });


  const newestLogin = useMemo(() => {
    const times = admins
      .map((u) => (u.lastLogin ? new Date(u.lastLogin).getTime() : 0))
      .filter((t) => t > 0);
    if (!times.length) return '—';
    return new Date(Math.max(...times)).toLocaleString();
  }, [admins]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Admin User Details</div>
          <div className="page-subtitle">Manage admin accounts, security, and access status</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card fade-in-up">
          <div className="kpi-icon-wrap" style={{ background: 'var(--brand-light)' }}><Users size={20} style={{ color: 'var(--brand)' }} /></div>
          <div className="kpi-label">Total Admins</div>
          <div className="kpi-value">{isLoading ? '—' : total}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>All admin users</div>
        </div>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '60ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--green-bg)' }}><CheckCircle size={20} style={{ color: 'var(--green)' }} /></div>
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{isLoading ? '—' : active}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>Currently active</div>
        </div>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '120ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--red-bg)' }}><XCircle size={20} style={{ color: 'var(--red)' }} /></div>
          <div className="kpi-label">Inactive</div>
          <div className="kpi-value">{isLoading ? '—' : inactive}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>Disabled accounts</div>
        </div>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '180ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--amber-bg)' }}><ShieldCheck size={20} style={{ color: 'var(--amber)' }} /></div>
          <div className="kpi-label">Latest Login</div>
          <div className="kpi-value" style={{ fontSize: 13 }}>{isLoading ? '—' : newestLogin}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>Recent admin activity</div>
        </div>
      </div>

      <div className="card card-table-sep fade-in-up" style={{ animationDelay: '280ms' }}>
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search admin users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select className="filter-select" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={exportAdmins}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}><UserPlus size={13} /> Add Admin User</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Logo</th>
                <th>Admin User</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<ShieldCheck size={24} />}
                      title="No admin users found"
                      description="Create your first admin account."
                      action={<button className="btn btn-primary btn-sm" onClick={openCreate}><UserPlus size={13} /> Add Admin User</button>}
                    />
                  </td>
                </tr>
              ) : (
                admins.map((admin, idx) => (
                  <tr key={admin._id}>
                    <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Avatar name={admin.name} src={admin.avatar} size="sm" />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{admin.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>Admin</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{admin.phone || '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{admin.email}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{toDate(admin.lastLogin)}</td>
                    <td><Badge status={admin.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'center' }}>
                        <button className="btn-action btn-action-blue" title="View Details" onClick={() => setActiveUser(admin)}><Eye size={12} /></button>
                        <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(admin)}><Edit2 size={12} /></button>
                        {(() => {
                          const isPrimaryAdmin = (admin.email || '').toLowerCase().trim() === 'admin@welcometech.qa' || (admin.email || '').toLowerCase().trim() === 'admin@welcomtech.qa';
                          const isSelf = !!currentUser?._id && String(admin._id) === String(currentUser._id);
                          const deleteDisabled = isPrimaryAdmin || isSelf;
                          const deleteTooltip = isPrimaryAdmin
                            ? 'Primary system administrator account cannot be deleted'
                            : isSelf
                              ? 'Cannot delete your own account'
                              : 'Delete Admin';

                          return (
                            <button
                              className="btn-action btn-action-red"
                              title={deleteTooltip}
                              disabled={deleteDisabled}
                              style={deleteDisabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                              onClick={() => {
                                if (deleteDisabled) return;
                                setDeleteTarget(admin);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} onPageSizeChange={(v) => { setPageSize(v); setPage(1); }} />
      </div>

      <Modal
        open={!!activeUser}
        onClose={() => setActiveUser(null)}
        title="Admin User Details"
        size="lg"
        footer={<button className="btn btn-primary" onClick={() => activeUser && openEdit(activeUser)}><Edit2 size={13} /> Edit Admin</button>}
      >
        {!activeUser ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={activeUser.name} src={activeUser.avatar} size="lg" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{activeUser.name}</div>
                  <div style={{ color: 'var(--tx-4)', fontSize: 12.5 }}>{activeUser.email}</div>
                </div>
              </div>
              <Badge status={activeUser.isActive ? 'active' : 'inactive'} />
            </div>
            <div className="details-grid">
              <DetailItem label="Role" value="Admin" />
              <DetailItem label="Phone" value={activeUser.phone || '—'} />
              <DetailItem label="Address" value={activeUser.address || '—'} />
              <DetailItem label="Last Login" value={toDate(activeUser.lastLogin)} />
              <DetailItem label="Created At" value={toDate(activeUser.createdAt)} />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={upsertOpen}
        onClose={() => setUpsertOpen(false)}
        title={editingUser ? 'Edit Admin User' : 'Add Admin User'}
        size="lg"
        footer={
          <>
            <button className="btn btn-cancel" onClick={() => setUpsertOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? <Spinner size={14} /> : <UserPlus size={14} />}
              {upsertMutation.isPending ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Admin'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Profile Photo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={form.name || 'Admin'} src={avatarPreview || undefined} size="lg" />
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={13} /> {avatarPreview ? 'Replace Photo' : 'Upload Photo'}
              <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
            </label>
          </div>
        </div>
        <div className="form-grid-2">
          <InputField label="Full Name" value={form.name} onChange={(v) => set('name', v)} required />
          <InputField label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} required />
          <InputField label="Phone" type="tel" value={form.phone} onChange={(v) => set('phone', v)} />
          <InputField label="Password" type="password" value={form.password} onChange={(v) => set('password', v)} required={!editingUser} />
          <InputField label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => set('confirmPassword', v)} required={!editingUser} />
          <SelectField 
            label="Account Status" 
            value={form.isActive ? 'active' : 'inactive'} 
            onChange={(v: string) => setForm((p) => ({ ...p, isActive: v === 'active' }))}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <textarea className="form-control" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Enter address..." />
        </div>
      </Modal>


      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Admin User"
        message={`Are you sure you want to delete ${deleteTarget?.name}? This cannot be undone.`}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default AdminUsersPage;
