import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  UserPlus, Camera, Save, X, Eye, EyeOff, Upload, Trash2,
  FileText, Search, Edit2, Lock, ShieldCheck, Plus,
  Users, CheckCircle, XCircle, Users2, Download, ArrowLeft,
  User as UserIcon, Mail, Phone, MapPin, CreditCard, Calendar, AlertCircle
} from 'lucide-react';
import api from '../../utils/api';
import { User } from '../../types';
import {
  Avatar, Badge, InputField, Select, SelectField, SkeletonRow, EmptyState,
  Spinner, ConfirmDialog, Pagination, Modal
} from '../../components/ui';
import { toAssetUrl, fmt, getActiveCurrency, PAGE_SIZE_OPTIONS } from '../../utils/helpers';
import { exportExcelRows } from '../../utils/excelExport';
import { validatePhoneNumber } from '../../utils/phoneRules';
import toast from 'react-hot-toast';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

type AssignableRole = {
  _id: string;
  name: string;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
};

const LEGACY_ROLE_OPTIONS = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales_executive', label: 'Sales Executive' },
];

const ROLE_COLORS: Record<string, string> = {
  admin: 'var(--brand)',
  manager: 'var(--teal)',
  engineer: 'var(--green)',
  sales_executive: 'var(--amber)',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  engineer: 'Engineer',
  sales_executive: 'Sales Executive',
};

const roleKey = (role: unknown) =>
  String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const getRoleValue = (role: unknown) => {
  if (!role) return '';
  if (typeof role === 'string') return role;
  const roleObject = role as { _id?: string; id?: string; name?: string };
  return roleObject._id || roleObject.id || roleObject.name || String(role);
};

const getRoleName = (role: unknown) => {
  if (!role) return '';
  if (typeof role === 'string') return role;
  const roleObject = role as { name?: string; _id?: string; id?: string };
  return roleObject.name || roleObject._id || roleObject.id || String(role);
};

const humanizeRole = (role: unknown) => {
  const value = getRoleName(role);
  return value
    ? value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : '—';
};

const findAssignableRole = (role: unknown, roles: AssignableRole[] = []) => {
  const value = getRoleValue(role);
  const key = roleKey(getRoleName(role));
  return roles.find((item) => item._id === value || roleKey(item.name) === key);
};

const roleColor = (role: unknown, roles: AssignableRole[] = []) => {
  const matched = findAssignableRole(role, roles);
  const key = roleKey(matched?.name || getRoleName(role));
  return ROLE_COLORS[key] ?? 'var(--brand)';
};

const roleLabel = (role: unknown, roles: AssignableRole[] = []) => {
  const matched = findAssignableRole(role, roles);
  if (matched) return matched.name;
  const key = roleKey(getRoleName(role));
  return ROLE_LABELS[key] ?? humanizeRole(role);
};

const roleValueForForm = (role: unknown, roles: AssignableRole[] = []) => {
  const matched = findAssignableRole(role, roles);
  return matched?._id || getRoleValue(role);
};

const buildRoleOptions = (
  roles: AssignableRole[] = [],
  currentRole?: unknown,
  includeLegacyFallback = false
) => {
  const nonAdminRoles = roles.filter((r) => !['admin', 'superadmin'].includes(roleKey(r.name)));
  const options = nonAdminRoles.map((role) => ({ value: role._id, label: role.name }));
  const activeKeys = new Set(nonAdminRoles.map((role) => roleKey(role.name)));

  if (includeLegacyFallback && nonAdminRoles.length === 0) {
    LEGACY_ROLE_OPTIONS.forEach((option) => options.push(option));
  }

  const currentValue = getRoleValue(currentRole);
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    const currentKey = roleKey(getRoleName(currentRole));
    if (!activeKeys.has(currentKey) && !['admin', 'superadmin'].includes(currentKey)) {
      options.push({ value: currentValue, label: `${roleLabel(currentRole, roles)} (Current)` });
    }
  }

  return options;
};

const useAssignableRoles = () => useQuery({
  queryKey: ['roles-active'],
  queryFn: async () => {
    const res = await api.get('/roles/active');
    return (res.data?.data || []) as AssignableRole[];
  },
  staleTime: 5 * 60 * 1000,
});

const isImagePath = (p?: string) =>
  !!p && /\.(jpe?g|png|gif|webp|svg)$/i.test(p);

const fileUrl = (p?: string) =>
  p ? toAssetUrl(p) : '';

const apiErrorMessage = (error: unknown, fallback: string) => {
  const err = error as { response?: { data?: { message?: string } }; message?: string };
  return err.response?.data?.message || err.message || fallback;
};

// ─── EMPLOYEE LIST PAGE ──────────────────────────────────────────────────────

export const EmployeeListPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'documents'>('overview');
  const { data: activeRoles = [] } = useAssignableRoles();
  const roleFilterOptions = useMemo(() => buildRoleOptions(activeRoles, undefined, true), [activeRoles]);

  const { data: detailEmp, isLoading: detailLoading } = useQuery({
    queryKey: ['employee', detailEmployeeId],
    queryFn: async () => {
      const r = await api.get(`/employees/${detailEmployeeId}`);
      return r.data.data as User;
    },
    enabled: !!detailEmployeeId,
  });
  
  React.useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, pageSize]);
  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, roleFilter, statusFilter, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const r = await api.get('/employees', { params });
      return r.data as unknown as { data: User[]; pages: number; total: number; };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    meta: { invalidateQueryKeys: [['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success('Employee deleted');
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to delete employee'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => {
      const fd = new FormData();
      fd.append('isActive', String(!isActive));
      return api.patch(`/employees/${id}`, fd);
    },
    meta: { invalidateQueryKeys: [['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success('Status updated');
    },
  });

  const employees = data?.data ?? [];
  const total = data?.total ?? employees.length;
  const active = employees.filter((e) => e.isActive).length;
  const inactive = total - active;
  const exportEmployees = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search.trim()) params.search = search.trim();
    if (roleFilter) params.role = roleFilter;
    if (statusFilter) params.status = statusFilter;
    const r = await api.get('/employees', { params });
    exportExcelRows('employees', 'Employees', r.data?.data || []);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Employees</div>
          <div className="page-subtitle">Manage team members, roles &amp; documents</div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid">
        <div className="kpi-card fade-in-up">
          <div className="kpi-icon-wrap" style={{ background: 'var(--brand-light)' }}>
            <Users size={20} strokeWidth={2.5} style={{ color: 'var(--brand)' }} />
          </div>
          <div className="kpi-label">Total Employees</div>
          <div className="kpi-value">{isLoading ? '—' : total}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>Team size</div>
        </div>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '60ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--green-bg)' }}>
            <CheckCircle size={20} strokeWidth={2.5} style={{ color: 'var(--green)' }} />
          </div>
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{isLoading ? '—' : active}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>Currently active</div>
        </div>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '120ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--red-bg)' }}>
            <XCircle size={20} strokeWidth={2.5} style={{ color: 'var(--red)' }} />
          </div>
          <div className="kpi-label">Inactive</div>
          <div className="kpi-value">{isLoading ? '—' : inactive}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>On leave / Resigned</div>
        </div>
      </div>

      <div className="card card-table-sep fade-in-up" style={{ animationDelay: '210ms' }}>
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select className="filter-select page-size-select" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={PAGE_SIZE_OPTIONS} />
            <Select className="filter-select" value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: 'All Roles' }, ...roleFilterOptions]} />
            <Select className="filter-select" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={exportEmployees}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/employees/new')}><UserPlus size={13} /> Add Employee</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col" style={{ textAlign: 'center' }}>S NO</th>
                <th style={{ textAlign: 'center' }}>Logo</th>
                <th style={{ textAlign: 'center' }}>Employee</th>
                <th style={{ textAlign: 'center' }}>Phone</th>
                <th style={{ textAlign: 'center' }}>Salary ({getActiveCurrency()})</th>
                <th style={{ textAlign: 'center' }}>Role</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Calls (T/R)</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center' }}>
                    <EmptyState
                      icon={<Users size={24} />}
                      title="No employees found"
                      description="Add your first team member to get started"
                      action={
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('/employees/new')}>
                          <UserPlus size={13} /> Add Employee
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                employees.map((emp, idx) => {
                  const color = roleColor(emp.role, activeRoles);
                  return (
                    <tr key={emp._id}>
                      <td data-label="S NO" className="sno-col" style={{ textAlign: 'center' }}>{(page - 1) * Number(pageSize) + idx + 1}</td>
                      <td data-label="Logo" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                          <Avatar name={emp.name} src={emp.avatar} size="sm" />
                        </div>
                      </td>
                      <td data-label="Employee" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="customer-name-link"
                            style={{ textAlign: 'center', margin: '0 auto', display: 'block' }}
                            onClick={() => {
                              setDetailEmployeeId(emp._id);
                              setDetailTab('overview');
                            }}
                          >
                            {emp.name}
                          </button>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)', textAlign: 'center' }}>{emp.email}</div>
                        </div>
                      </td>
                      <td data-label="Phone" style={{ fontSize: 12, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{emp.phone || '—'}</td>
                      <td data-label={`Salary (${getActiveCurrency()})`} style={{ fontSize: 12, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)', textAlign: 'center', fontWeight: 600 }}>
                        {typeof emp.salary === 'number' ? emp.salary.toLocaleString() : '—'}
                      </td>
                      <td data-label="Role" style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                          background: `${color}15`, color, border: `1px solid ${color}30`,
                        }}>
                          {roleLabel(emp.role, activeRoles)}
                        </span>
                      </td>
                      <td data-label="Status" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                          <Badge status={emp.isActive ? 'active' : 'inactive'} dot />
                        </div>
                      </td>
                      <td data-label="Calls (T/R)" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                          <div style={{ display: 'flex', gap: 4, fontWeight: 600, justifyContent: 'center' }}>
                            <span style={{ color: 'var(--brand)' }}>{emp.totalCalls ?? 0}</span>
                            <span style={{ color: 'var(--tx-4)' }}>/</span>
                            <span style={{ color: 'var(--green)' }}>{emp.resolvedCalls ?? 0}</span>
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--tx-5)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Total / Res</div>
                        </div>
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'center' }}>
                        <div className="table-actions" style={{ justifyContent: 'center', margin: '0 auto' }}>
                          <button
                            className="btn-action btn-action-blue"
                            title="Edit"
                            onClick={() => navigate(`/employees/${emp._id}/edit`)}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            className="btn-action btn-action-red"
                            title="Delete"
                            onClick={() => setDeleteTarget(emp)}
                          >
                            <Trash2 size={12} />
                          </button>
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
        open={!!deleteTarget}
        title="Delete Employee"
        message={`Are you sure you want to permanently delete ${deleteTarget?.name}? This cannot be undone.`}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Employee Detail Modal */}
      <Modal
        open={!!detailEmployeeId}
        onClose={() => setDetailEmployeeId(null)}
        title="Employee Details Overview"
        size="xxl"
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-cancel" onClick={() => setDetailEmployeeId(null)}>Close</button>
          </div>
        }
      >
        {detailLoading || !detailEmp ? (
          <div className="lead-profile-loading"><Spinner size={18} /> Loading employee details...</div>
        ) : (
          <div className="lead-profile">
            <div className="lead-profile-head">
              <Avatar name={detailEmp.name} src={detailEmp.avatar} size="xl" />
              <div className="lead-profile-title-wrap">
                <div className="lead-profile-title">{detailEmp.name}</div>
                <div className="lead-profile-subtitle">{roleLabel(detailEmp.role, activeRoles)} · {detailEmp.email}</div>
              </div>
              <div className="lead-profile-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setDetailEmployeeId(null);
                    navigate(`/employees/${detailEmp._id}/edit`);
                  }}
                >
                  <Edit2 size={13} /> Edit Profile
                </button>
              </div>
            </div>

            <div className="lead-profile-tabs">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'documents', label: 'Documents' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={detailTab === tab.id ? 'active' : ''}
                  onClick={() => setDetailTab(tab.id as any)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && (
              <div className="lead-profile-card-grid">
                <div className="lead-profile-card">
                  <div className="lead-profile-card-title">Basic Employee Details</div>
                  {[
                    ['Full Name', detailEmp.name],
                    ['Email ID', detailEmp.email],
                    ['Phone Number', detailEmp.phone || '—'],
                    ['Role', roleLabel(detailEmp.role, activeRoles)],
                    ['Salary', detailEmp.salary != null ? fmt.currency(detailEmp.salary) : '—'],
                    ['Status', detailEmp.isActive ? 'Active' : 'Inactive'],
                    ['Address', detailEmp.address || '—'],
                  ].map(([label, value]) => (
                    <div className="lead-profile-row" key={label}>
                      <span>{label}:</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>

                <div className="lead-profile-card">
                  <div className="lead-profile-card-title">Identity &amp; Travel Documents</div>
                  {[
                    ['Passport Number', detailEmp.passportNumber || '—'],
                    ['Passport Expiry Date', fmt.date(detailEmp.passportExpiryDate)],
                    ['QID Number', detailEmp.qidNumber || '—'],
                    ['QID Expiry Date', fmt.date(detailEmp.qidExpiryDate)],
                  ].map(([label, value]) => (
                    <div className="lead-profile-row" key={label}>
                      <span>{label}:</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === 'documents' && (
              <div className="lead-profile-card" style={{ width: '100%' }}>
                <div className="lead-profile-card-title">Uploaded Files</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                  {/* Passport file */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Passport File</div>
                      <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                        {detailEmp.passport ? 'Uploaded' : 'No passport file uploaded'}
                      </div>
                    </div>
                    {detailEmp.passport && (
                      <a
                        href={fileUrl(detailEmp.passport)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Download size={12} /> View / Download
                      </a>
                    )}
                  </div>

                  {/* Additional documents */}
                  {(!detailEmp.documents || detailEmp.documents.length === 0) ? (
                    <div className="lead-profile-empty" style={{ padding: '20px 0' }}>No additional documents uploaded.</div>
                  ) : (
                    detailEmp.documents.map((doc, idx) => (
                      <div key={doc._id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                            {doc.uploadedAt ? `Uploaded on ${fmt.date(doc.uploadedAt)}` : 'Additional Document'}
                          </div>
                        </div>
                        <a
                          href={fileUrl(doc.path)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Download size={12} /> View / Download
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── EMPLOYEE FORM PAGE ──────────────────────────────────────────────────────

type EmpForm = {
  name: string;
  email: string;
  phone: string;
  role: string;
  salary: string;
  address: string;
  password: string;
  confirmPassword: string;
  passportNumber: string;
  passportExpiryDate: string;
  qidNumber: string;
  qidExpiryDate: string;
};

const defaultForm = (): EmpForm => ({
  name: '', email: '', phone: '', role: '',
  salary: '', address: '', password: '', confirmPassword: '',
  passportNumber: '', passportExpiryDate: '',
  qidNumber: '', qidExpiryDate: '',
});

export const EmployeeFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [form, setForm] = useState<EmpForm>(defaultForm());
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Avatar
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Passport
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);
  const [existingPassport, setExistingPassport] = useState<string | null>(null);

  // Qatar ID (QID)
  const [qidFile, setQidFile] = useState<File | null>(null);
  const [qidPreview, setQidPreview] = useState<string | null>(null);
  const [existingQid, setExistingQid] = useState<string | null>(null);

  // Documents
  const [existingDocs, setExistingDocs] = useState<User['documents']>([]);
  const [newDocFiles, setNewDocFiles] = useState<File[]>([]);
  const [removingDoc, setRemovingDoc] = useState<number | null>(null);
  const { data: activeRoles = [], isLoading: rolesLoading } = useAssignableRoles();
  const roleOptions = useMemo(
    () => buildRoleOptions(activeRoles, isEdit ? form.role : undefined, !activeRoles.length),
    [activeRoles, form.role, isEdit]
  );

  // Fetch existing data on edit
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const r = await api.get(`/employees/${id}`);
      return r.data.data as User;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (!empData) return;
    setForm({
      name: empData.name,
      email: empData.email,
      phone: empData.phone ?? '',
      role: roleValueForForm((empData as any).role, activeRoles),
      salary: empData.salary !== undefined ? String(empData.salary) : '',
      address: empData.address ?? '',
      password: '',
      confirmPassword: '',
      passportNumber: (empData as any).passportNumber ?? '',
      passportExpiryDate: (empData as any).passportExpiryDate ? String((empData as any).passportExpiryDate).split('T')[0] : '',
      qidNumber: (empData as any).qidNumber ?? '',
      qidExpiryDate: (empData as any).qidExpiryDate ? String((empData as any).qidExpiryDate).split('T')[0] : '',
    });
    setAvatarPreview(empData.avatar ? fileUrl(empData.avatar) : null);
    setExistingPassport(empData.passport ?? null);
    setExistingQid((empData as any).qidDocument ?? null);
    setExistingDocs(empData.documents ?? []);
  }, [empData, activeRoles]);

  useEffect(() => {
    if (isEdit || form.role || !roleOptions.length) return;
    const defaultEmpRole = roleOptions.find((r) => ['employee', 'engineer', 'staff', 'sales_executive'].includes(roleKey(r.label))) || roleOptions[0];
    if (defaultEmpRole) {
      set('role', defaultEmpRole.value);
    }
  }, [roleOptions, form.role, isEdit]);

  const set = (field: keyof EmpForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Revoke object URLs when the preview changes or the form unmounts (avoid blob leaks).
  useEffect(() => () => {
    if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);
  useEffect(() => () => {
    if (passportPreview && passportPreview.startsWith('blob:')) URL.revokeObjectURL(passportPreview);
  }, [passportPreview]);
  useEffect(() => () => {
    if (qidPreview && qidPreview.startsWith('blob:')) URL.revokeObjectURL(qidPreview);
  }, [qidPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handlePassportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPassportFile(file);
    if (file.type.startsWith('image/')) {
      setPassportPreview(URL.createObjectURL(file));
    } else {
      setPassportPreview(null);
    }
  };

  const handleQidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQidFile(file);
    if (file.type.startsWith('image/')) {
      setQidPreview(URL.createObjectURL(file));
    } else {
      setQidPreview(null);
    }
  };

  const handleAddDocs = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setNewDocFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeNewDoc = (i: number) =>
    setNewDocFiles((prev) => prev.filter((_, idx) => idx !== i));

  const removeExistingDoc = async (i: number) => {
    if (!id) return;
    setRemovingDoc(i);
    try {
      await api.patch(`/employees/${id}/remove-doc`, { docIndex: i });
      setExistingDocs((prev) => (prev ?? []).filter((_, idx) => idx !== i));
      toast.success('Document removed');
    } catch {
      toast.error('Failed to remove document');
    } finally {
      setRemovingDoc(null);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('email', form.email.trim());
      fd.append('phone', form.phone.trim());
      fd.append('role', form.role);
      fd.append('salary', form.salary.trim());
      fd.append('address', form.address.trim());
      fd.append('passportNumber', form.passportNumber.trim());
      fd.append('passportExpiryDate', form.passportExpiryDate.trim());
      fd.append('qidNumber', form.qidNumber.trim());
      fd.append('qidExpiryDate', form.qidExpiryDate.trim());
      if (form.password) {
        fd.append('password', form.password);
        fd.append('confirmPassword', form.confirmPassword);
      }
      if (avatarFile) fd.append('avatar', avatarFile);
      if (passportFile) fd.append('passport', passportFile);
      if (qidFile) fd.append('qidDocument', qidFile);
      newDocFiles.forEach((f) => fd.append('documents', f));

      if (isEdit) {
        const r = await api.patch(`/employees/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return r.data.data as User;
      }
      const r = await api.post('/employees', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return r.data.data as User;
    },
    meta: { invalidateQueryKeys: isEdit ? [['employees'], ['employee', id], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] : [['employees'], ['engineers'], ['task-staff'], ['employees-active-for-leads'], ['employees-active']] },
    onSuccess: () => {
      toast.success(isEdit ? 'Employee updated' : 'Employee created');
      navigate('/employees');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, isEdit ? 'Failed to update employee' : 'Failed to create employee'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) {
      toast.error('Please select an active role');
      return;
    }
    if (!isEdit && !form.password) {
      toast.error('Password is required');
      return;
    }
    if (form.password && form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.phone.trim() && !validatePhoneNumber(form.phone.trim())) {
      toast.error('Invalid phone number for the selected country code');
      return;
    }
    mutation.mutate();
  };

  if ((isEdit && empLoading) || rolesLoading) {
    return <div className="card" style={{ padding: 48, textAlign: 'center' }}><Spinner /> Loading employee details…</div>;
  }

  const selectedRoleLabel = roleOptions.find(r => r.value === form.role)?.label || (form.role ? humanizeRole(form.role) : (roleOptions[0]?.label || 'Employee'));

  return (
    <div className="employee-studio-page fade-in" style={{ paddingTop: 10, paddingBottom: 60 }}>
      {/* ── Top Header Banner ── */}
      <div className="emp-header-banner">
        <button
          type="button"
          className="emp-header-back-btn"
          onClick={() => navigate('/employees')}
          title="Back to Employees"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 20, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>
            <UserIcon size={12} />
            {isEdit ? 'Talent Profile Management' : 'Employee Registration Studio'}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx-1)', margin: 0, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isEdit ? (form.name ? `Edit Employee: ${form.name}` : 'Edit Employee Profile') : 'New Employee Account'}
          </h1>
         
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="emp-studio-layout">
          {/* ── Left Main Form: Personal Information ── */}
          <div className="emp-studio-forms">
            {/* Card 1: Personal & Employment Information */}
            <div className="card emp-card fade-in-up">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-light)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UserIcon size={16} />
                </div>
                <div>
                  <span className="card-title" style={{ fontSize: 14, fontWeight: 700 }}>Personal & Contact Information</span>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-4)' }}>Basic employee identification and direct communication details</div>
                </div>
              </div>
              <div className="card-body" style={{ padding: 20 }}>
                <div className="form-grid-2">
                  <InputField
                    label="Full Name"
                    required
                    value={form.name}
                    onChange={(v) => set('name', v)}
                    placeholder="e.g. Caleb"
                  />
                  <InputField
                    label="Email ID"
                    required
                    type="email"
                    value={form.email}
                    onChange={(v) => set('email', v)}
                    placeholder="employee@welcometech.qa"
                  />
                  <InputField
                    label="Phone Number"
                    type="tel"
                    value={form.phone}
                    onChange={(v) => set('phone', v)}
                    placeholder="+974 xxxx xxxx"
                  />
                  <InputField
                    label={`Salary (${getActiveCurrency()})`}
                    type="number"
                    value={form.salary}
                    onChange={(v) => set('salary', v)}
                    placeholder="e.g. 6500"
                  />
                  <div style={{ gridColumn: 'span 2' }}>
                    <SelectField
                      label="Assigned System Role"
                      required
                      value={form.role}
                      onChange={(v) => set('role', v)}
                      options={roleOptions}
                      placeholder="Select organizational role"
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={12} /> Residential / Physical Address
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="e.g. Building 12, Street 45, Zone 22, Doha, Qatar"
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Column: Identity Studio Profile Card ── */}
          <aside className="emp-studio-aside">
            <div className="card emp-profile-summary-card fade-in-up" style={{ position: 'sticky', top: 20 }}>
              <div style={{ textAlign: 'center', padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 16px' }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: 24, overflow: 'hidden',
                    background: 'var(--surface-2)', border: '3px solid var(--surface)',
                    boxShadow: 'var(--sh-md)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brand)', color: '#fff', fontSize: 32, fontWeight: 800 }}>
                        {(form.name || 'EMP').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label
                    title="Upload profile photo"
                    style={{
                      position: 'absolute', bottom: -4, right: -4,
                      width: 32, height: 32, borderRadius: 10,
                      background: 'var(--brand)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <Camera size={15} />
                    <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
                  </label>
                </div>

                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  {form.name || 'Employee Name'}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {form.email || 'employee@company.com'}
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 700 }}>
                  <ShieldCheck size={12} /> {selectedRoleLabel}
                </div>
              </div>

              {/* Quick Profile Overview Specs */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--tx-4)', display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} /> Phone</span>
                  <span style={{ fontWeight: 600, color: 'var(--tx-1)' }}>{form.phone || '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--tx-4)', display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={13} /> Salary</span>
                  <span style={{ fontWeight: 700, color: 'var(--green)' }}>{form.salary ? `${fmt.currency(Number(form.salary))}` : '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--tx-4)', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={13} /> QID Status</span>
                  <span style={{ fontWeight: 600, color: form.qidNumber ? 'var(--brand)' : 'var(--tx-4)' }}>
                    {form.qidNumber ? (existingQid || qidFile ? 'Configured & Uploaded' : 'Configured') : 'Missing'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--tx-4)', display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={13} /> Passport</span>
                  <span style={{ fontWeight: 600, color: form.passportNumber ? 'var(--teal)' : 'var(--tx-4)' }}>
                    {form.passportNumber ? (existingPassport || passportFile ? 'Configured & Uploaded' : 'Configured') : 'Missing'}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── Full Width Cards: Account Security & Legal Identity Documentation ── */}
        <div className="emp-studio-full-forms">
          {/* Card 2: Account Security & Credentials (Full Width) */}
          <div className="card emp-card fade-in-up" style={{ animationDelay: '40ms' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--amber) 12%, transparent)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Lock size={16} />
              </div>
              <div>
                <span className="card-title" style={{ fontSize: 14, fontWeight: 700 }}>Account Security & Login Access</span>
                <div style={{ fontSize: 11.5, color: 'var(--tx-4)' }}>Secure credentials for CRM dashboard and administrative login</div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 20 }}>
              {isEdit && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                  background: 'var(--amber-bg)', border: '1px solid var(--amber-bd)',
                  fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 8
                }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>Leave the password fields empty to keep the current account password.</span>
                </div>
              )}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">
                    Password{!isEdit && <span className="req"> *</span>}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-control"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-4)', padding: 0 }}
                      onClick={() => setShowPass((p) => !p)}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Confirm Password{!isEdit && <span className="req"> *</span>}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-control"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={form.confirmPassword}
                      onChange={(e) => set('confirmPassword', e.target.value)}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-4)', padding: 0 }}
                      onClick={() => setShowConfirm((p) => !p)}
                    >
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
              {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
                <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={13} /> Passwords do not match
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Legal & Identity Documentation (Full Width) */}
          <div className="card emp-card fade-in-up" style={{ animationDelay: '80ms' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--teal) 12%, transparent)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={16} />
              </div>
              <div>
                <span className="card-title" style={{ fontSize: 14, fontWeight: 700 }}>Legal & Identity Documentation</span>
                <div style={{ fontSize: 11.5, color: 'var(--tx-4)' }}>Official Qatar ID, Passport records, and employment compliance files</div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
              {/* ── Top 2-Column Grid: Qatar ID & Passport Containers ── */}
              <div className="emp-legal-grid">
                {/* ── Qatar ID (QID) Container ── */}
                <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface-2)', border: '1.5px solid color-mix(in srgb, var(--brand) 35%, var(--border))', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>
                      <FileText size={15} style={{ color: 'var(--brand)' }} /> Qatar ID (QID) Details
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', background: 'var(--surface-3)', padding: '3px 9px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Optional
                    </span>
                  </div>

                  <div className="form-grid-2" style={{ gap: 12 }}>
                    <InputField
                      label="QID Number"
                      value={form.qidNumber}
                      onChange={(v) => set('qidNumber', v)}
                      placeholder="11-digit QID number"
                    />
                    <InputField
                      label="QID Expiry Date"
                      type="date"
                      value={form.qidExpiryDate}
                      onChange={(v) => set('qidExpiryDate', v)}
                    />
                  </div>

                  {/* QID Document Attachment inside QID container */}
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                    <label className="form-label" style={{ fontWeight: 650, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <FileText size={13} style={{ color: 'var(--brand)' }} /> QID Document Attachment
                    </label>
                    {existingQid && !qidFile && (
                      <div style={{ marginBottom: 10 }}>
                        {isImagePath(existingQid) ? (
                          <a href={fileUrl(existingQid)} target="_blank" rel="noreferrer" style={{ display: 'block', overflow: 'hidden', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <img
                              src={fileUrl(existingQid)}
                              alt="Qatar ID (QID)"
                              style={{ width: '100%', height: 120, objectFit: 'cover' }}
                            />
                          </a>
                        ) : (
                          <a
                            href={fileUrl(existingQid)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--brand)', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', fontWeight: 600 }}
                          >
                            <FileText size={16} /> View QID Document
                          </a>
                        )}
                      </div>
                    )}
                    {qidFile && (
                      <div style={{ marginBottom: 10 }}>
                        {qidPreview ? (
                          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--brand-light)', height: 120 }}>
                            <img src={qidPreview} alt="QID preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--brand)', padding: '10px 14px', border: '1px solid var(--brand)', borderRadius: 10, background: 'var(--brand-light)', fontWeight: 600 }}>
                            <FileText size={16} /> {qidFile.name}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}>
                        <Upload size={13} />
                        {existingQid || qidFile ? 'Replace QID File' : 'Upload QID File'}
                        <input type="file" hidden accept="image/*,application/pdf" onChange={handleQidChange} />
                      </label>
                      <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>JPG, PNG or PDF (max 5 MB)</span>
                    </div>
                  </div>
                </div>

                {/* ── Passport Details Container ── */}
                <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>
                      <FileText size={15} style={{ color: 'var(--teal)' }} /> Passport Details
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 12 }}>
                      Optional
                    </span>
                  </div>

                  <div className="form-grid-2" style={{ gap: 12 }}>
                    <InputField
                      label="Passport Number"
                      value={form.passportNumber}
                      onChange={(v) => set('passportNumber', v)}
                      placeholder="Enter passport number"
                    />
                    <InputField
                      label="Passport Expiry Date"
                      type="date"
                      value={form.passportExpiryDate}
                      onChange={(v) => set('passportExpiryDate', v)}
                    />
                  </div>

                  {/* Passport File Attachment inside Passport container */}
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                    <label className="form-label" style={{ fontWeight: 650, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <FileText size={13} style={{ color: 'var(--teal)' }} /> Passport File Attachment
                    </label>
                    {existingPassport && !passportFile && (
                      <div style={{ marginBottom: 10 }}>
                        {isImagePath(existingPassport) ? (
                          <a href={fileUrl(existingPassport)} target="_blank" rel="noreferrer" style={{ display: 'block', overflow: 'hidden', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <img
                              src={fileUrl(existingPassport)}
                              alt="Passport"
                              style={{ width: '100%', height: 120, objectFit: 'cover' }}
                            />
                          </a>
                        ) : (
                          <a
                            href={fileUrl(existingPassport)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--brand)', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', fontWeight: 600 }}
                          >
                            <FileText size={16} /> View Passport File
                          </a>
                        )}
                      </div>
                    )}
                    {passportFile && (
                      <div style={{ marginBottom: 10 }}>
                        {passportPreview ? (
                          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--teal-bd)', height: 120 }}>
                            <img src={passportPreview} alt="Passport preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--teal)', padding: '10px 14px', border: '1px solid var(--teal-bd)', borderRadius: 10, background: 'var(--teal-bg)', fontWeight: 600 }}>
                            <FileText size={16} /> {passportFile.name}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}>
                        <Upload size={13} />
                        {existingPassport || passportFile ? 'Replace Passport File' : 'Upload Passport File'}
                        <input type="file" hidden accept="image/*,application/pdf" onChange={handlePassportChange} />
                      </label>
                      <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>JPG, PNG or PDF (max 5 MB)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Separate Dedicated Section: Additional Compliance Files ── */}
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--tx-1)' }}>
                      <Plus size={15} style={{ color: 'var(--amber)' }} /> Additional Compliance & Employment Documents
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 2 }}>
                      Upload employment contracts, academic certificates, visas, or resumes (up to 10 files)
                    </div>
                  </div>

                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}>
                    <Plus size={13} /> Add Extra Files
                    <input type="file" hidden multiple accept="image/*,application/pdf" onChange={handleAddDocs} />
                  </label>
                </div>

                {/* Existing & Queued Documents Grid */}
                {((existingDocs ?? []).length > 0 || newDocFiles.length > 0) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {/* Existing docs */}
                    {(existingDocs ?? []).map((doc, i) => (
                      <div key={`existing-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', gap: 8 }}>
                        <a
                          href={fileUrl(doc.path)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                          title={doc.name}
                        >
                          <FileText size={14} style={{ flexShrink: 0 }} /> {doc.name}
                        </a>
                        <button
                          type="button"
                          className="btn-action btn-action-red"
                          style={{ flexShrink: 0 }}
                          disabled={removingDoc === i}
                          onClick={() => removeExistingDoc(i)}
                          title="Remove document"
                        >
                          {removingDoc === i ? <Spinner size={10} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    ))}

                    {/* Queued new docs */}
                    {newDocFiles.map((f, i) => (
                      <div key={`new-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--teal-bd)', background: 'var(--teal-bg)', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--teal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }} title={f.name}>
                          <FileText size={14} style={{ flexShrink: 0 }} /> {f.name}
                        </span>
                        <button type="button" className="btn-action btn-action-red" style={{ flexShrink: 0 }} onClick={() => removeNewDoc(i)} title="Remove file">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '16px 20px', borderRadius: 10, background: 'var(--surface-2)', border: '1px dashed var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--tx-4)' }}>
                    No extra compliance files attached yet. Click <strong>Add Extra Files</strong> above to upload additional certificates or records.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Form Action Bar ── */}
        <div className="form-bottom-actions" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '16px 24px', marginTop: 32,
          boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
        }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ borderRadius: 10, padding: '10px 18px', fontWeight: 600 }}
            onClick={() => navigate('/employees')}
          >
            <X size={16} /> Cancel
          </button>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={mutation.isPending || !form.role}
            style={{ 
              borderRadius: 12, padding: '10px 24px', fontWeight: 700, 
              boxShadow: 'var(--sh-brand)', gap: 10 
            }}
          >
            {mutation.isPending ? <Spinner size={18} /> : <Save size={18} />}
            {mutation.isPending ? 'Saving...' : isEdit ? 'Update Employee' : 'Register Employee'}
          </button>
        </div>
      </form>
    </div>
  );
};
