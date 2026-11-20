import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Shield, Plus, Pencil, Trash2, Check, X, 
  Layout, Users, Settings, Database, Mail, 
  Smartphone, CreditCard, FileText, Globe, Search, RefreshCw, Download,
  Calendar, Layers, Server, HelpCircle, UserCheck, Zap
} from 'lucide-react';
import api from '../../utils/api';
import { Spinner, InputField, Modal, Badge, EmptyState, SkeletonRow, ConfirmDialog } from '../../components/ui';
import { exportExcelRows } from '../../utils/excelExport';
import { PAGE_PERMISSIONS, PERMISSION_LABELS, expandPermissionsForEditing } from '../../utils/rbac';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

interface Role {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  hasFullAccess?: boolean;
  isSystem: boolean;
  isActive: boolean;
}

const permissionIcon = (permissionId: string, group: string) => {
  if (permissionId === 'dashboard') return <Layout size={15} />;
  if (permissionId === 'calendar') return <Calendar size={15} />;
  if (permissionId.startsWith('customers') || permissionId === 'customerTypes' || permissionId === 'industries' || permissionId === 'businessSegments' || permissionId === 'industryTypes') return <Users size={15} />;
  if (permissionId.startsWith('calls') || permissionId === 'engineers') return <Smartphone size={15} />;
  if (permissionId.startsWith('tickets') || permissionId === 'ticketCategories') return <HelpCircle size={15} />;
  if (permissionId.startsWith('amc')) return <RefreshCw size={15} />;
  if (permissionId.startsWith('tdl')) return <Layers size={15} />;
  if (permissionId.startsWith('cloud')) return <Server size={15} />;
  if (permissionId.startsWith('tss') || permissionId === 'roles') return <Shield size={15} />;
  if (group === 'Finance') return <CreditCard size={15} />;
  if (group === 'Proposals') return <FileText size={15} />;
  if (group === 'Inventory') return <Database size={15} />;
  if (group === 'Team') return <UserCheck size={15} />;
  if (group === 'System') return <Settings size={15} />;
  return <Globe size={15} />;
};

export const RolesPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasFullAccess: false,
    permissions: [] as string[]
  });

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles', search],
    queryFn: async () => {
      const res = await api.get('/roles', { params: search.trim() ? { search: search.trim() } : {} });
      return res.data.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingRole) {
        return api.patch(`/roles/${editingRole._id}`, data);
      }
      return api.post('/roles', data);
    },
    meta: { invalidateQueryKeys: [['roles']] },
    onSuccess: async () => {
      toast.success(`Role ${editingRole ? 'updated' : 'created'} successfully`);
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data?.user) {
          useAuthStore.getState().setUser(meRes.data.user);
        }
      } catch {
        // ignore
      }
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Something went wrong');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    meta: { invalidateQueryKeys: [['roles']] },
    onSuccess: () => {
      toast.success('Role deleted successfully');
      setRoleToDelete(null);
    },
    onError: (err: any) => {
      setRoleToDelete(null);
      toast.error(err.response?.data?.message || 'Failed to delete role');
    }
  });

  const openModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      const isFull = !!role.hasFullAccess || role.name?.toLowerCase() === 'admin' || (Array.isArray(role.permissions) && role.permissions.includes('*'));
      const rawPerms = Array.isArray(role.permissions) ? role.permissions.filter(p => p !== '*') : [];
      const activePerms = rawPerms.length > 0 
        ? expandPermissionsForEditing(rawPerms) 
        : (isFull ? PAGE_PERMISSIONS.map(p => p.id) : []);
      setFormData({
        name: role.name,
        description: role.description || '',
        hasFullAccess: isFull,
        permissions: activePerms
      });
    } else {
      setEditingRole(null);
      setFormData({
        name: '',
        description: '',
        hasFullAccess: false,
        permissions: [],
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
  };

  const handleToggleFullAccess = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      hasFullAccess: checked,
      permissions: checked && prev.permissions.length === 0
        ? PAGE_PERMISSIONS.map(p => p.id)
        : prev.permissions
    }));
  };

  const togglePermission = (permId: string) => {
    setFormData(prev => {
      const current = Array.isArray(prev.permissions) ? prev.permissions : [];
      const exists = current.includes(permId);
      const next = exists 
        ? current.filter(p => p !== permId)
        : [...current, permId];
      
      return { ...prev, permissions: next };
    });
  };

  const selectAll = () => {
    const allIds = PAGE_PERMISSIONS.map(p => p.id);
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.length === allIds.length ? [] : allIds
    }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      hasFullAccess: formData.hasFullAccess,
      permissions: formData.permissions.length > 0 
        ? formData.permissions 
        : (formData.hasFullAccess ? ['*'] : [])
    };
    mutation.mutate(payload);
  };

  const totalRoles = roles?.length || 0;
  const systemRoles = roles?.filter((r: Role) => r.isSystem).length || 0;
  const activeRoles = roles?.filter((r: Role) => r.isActive).length || 0;
  const customRoles = totalRoles - systemRoles;

  const kpiCards = [
    { label: 'Total Roles', value: totalRoles, icon: <Shield size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All defined roles' },
    { label: 'System Roles', value: systemRoles, icon: <Settings size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Default templates' },
    { label: 'Custom Roles', value: customRoles, icon: <Users size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'User created' },
    { label: 'Active Roles', value: activeRoles, icon: <Check size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Currently in use' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Role Management</div>
          <div className="page-subtitle">Define user roles and control page-level access permissions</div>
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
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={() => exportExcelRows('roles', 'Roles', roles || [])}><Download size={13} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={() => openModal()}><Plus size={13} /> New Role</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Role Name</th>
                <th>Description</th>
                <th className="text-center">Permissions</th>
                <th className="text-center">Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : roles?.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState 
                      icon={<Shield size={22} />} 
                      title="No roles found" 
                      action={<button className="btn btn-primary btn-sm" onClick={() => openModal()}>Create New Role</button>}
                    />
                  </td>
                </tr>
              ) : (
                roles?.map((role: Role, idx: number) => (
                  <tr key={role._id}>
                    <td className="sno-col">{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx-1)' }}>{role.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--tx-2)' }}>{role.description || '—'}</td>
                    <td className="text-center">
                      <div className="role-permission-summary">
                        {role.hasFullAccess || role.name?.toLowerCase() === 'admin' || (Array.isArray(role.permissions) && role.permissions.includes('*')) ? (
                          <span 
                            className="role-permission-primary" 
                            style={{ 
                              background: 'rgba(139, 92, 246, 0.12)', 
                              color: 'var(--brand)', 
                              border: '1px solid rgba(139, 92, 246, 0.25)', 
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >
                            <Zap size={12} fill="currentColor" /> Full Access
                          </span>
                        ) : expandPermissionsForEditing(role.permissions).length > 0 ? (
                          <>
                            <span className="role-permission-primary">
                              {PERMISSION_LABELS[expandPermissionsForEditing(role.permissions)[0]] || expandPermissionsForEditing(role.permissions)[0]}
                            </span>
                            {expandPermissionsForEditing(role.permissions).length > 1 && (
                              <span className="role-permission-count">+{expandPermissionsForEditing(role.permissions).length - 1}</span>
                            )}
                          </>
                        ) : (
                          <span className="role-permission-empty">—</span>
                        )}
                      </div>
                    </td>
                    <td className="text-center"><Badge status={role.isActive ? 'active' : 'expired'} label={role.isActive ? 'Active' : 'Inactive'} /></td>
                    <td className="text-center">
                      <div className="table-actions" style={{ justifyContent: 'center' }}>
                        <button className="btn-action btn-action-blue" onClick={() => openModal(role)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        {!role.isSystem && (
                          <button 
                            className="btn-action btn-action-red" 
                            onClick={() => setRoleToDelete(role)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Neat, Clean, and Elegant Role Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingRole ? 'Edit Role' : 'Create Role'}
        size="xl"
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ fontSize: 12.5, color: 'var(--tx-3)', fontWeight: 600 }}>
              {formData.hasFullAccess ? (
                <span style={{ color: 'var(--brand)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} fill="currentColor" /> Full Access Active (Admin Privileges) • {formData.permissions.length} baseline permissions saved
                </span>
              ) : (
                <>
                  <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{formData.permissions.length}</span> of {PAGE_PERMISSIONS.length} permissions selected
                </>
              )}
            </div>
            <div className="actions-row" style={{ margin: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleSubmit}
                disabled={mutation.isPending || !formData.name.trim()}
                style={{ minWidth: 120 }}
              >
                {mutation.isPending && <Spinner size={14} />}
                {editingRole ? 'Update Role' : 'Create Role'}
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Top Form Fields */}
          <div className="form-grid-2">
            <InputField 
              label="ROLE NAME" 
              value={formData.name} 
              onChange={(v) => setFormData(p => ({ ...p, name: v }))} 
              placeholder="e.g. Admin, Sales Manager"
              required
            />
            <InputField 
              label="DESCRIPTION" 
              value={formData.description} 
              onChange={(v) => setFormData(p => ({ ...p, description: v }))} 
              placeholder="Full system access and management permissions"
            />
          </div>

          {/* Full Access Toggle Card */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 14,
              background: formData.hasFullAccess 
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(124, 58, 237, 0.05) 100%)' 
                : 'var(--surface-2)',
              border: `1.5px solid ${formData.hasFullAccess ? 'var(--brand)' : 'var(--border)'}`,
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div 
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: formData.hasFullAccess ? 'var(--brand)' : 'var(--surface-3)',
                  color: formData.hasFullAccess ? '#ffffff' : 'var(--tx-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <Zap size={18} fill={formData.hasFullAccess ? '#ffffff' : 'none'} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: formData.hasFullAccess ? 'var(--brand)' : 'var(--tx-1)' }}>
                    Full System Access (Admin Privileges)
                  </span>
                  {formData.hasFullAccess && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'var(--brand)',
                      color: '#ffffff'
                    }}>
                      All Unlocked
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 2 }}>
                  {formData.hasFullAccess 
                    ? 'Role grants complete unrestricted administrative access across every CRM page, API, and tool.' 
                    : 'Switch ON to grant full admin-level access, or leave OFF to pick custom permissions below.'}
                </div>
              </div>
            </div>

            {/* Interactive Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ 
                fontSize: 11.5, 
                fontWeight: 700, 
                letterSpacing: 0.3,
                color: formData.hasFullAccess ? 'var(--brand)' : 'var(--tx-3)' 
              }}>
                {formData.hasFullAccess ? 'FULL ACCESS ON' : 'CUSTOM ACCESS'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={formData.hasFullAccess}
                onClick={() => handleToggleFullAccess(!formData.hasFullAccess)}
                style={{
                  position: 'relative',
                  width: 48,
                  height: 26,
                  borderRadius: 20,
                  background: formData.hasFullAccess ? 'var(--brand)' : 'var(--border)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  transition: 'background-color 0.2s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#ffffff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transform: formData.hasFullAccess ? 'translateX(22px)' : 'translateX(0px)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Page Access Permissions
              </div>
              {formData.hasFullAccess && (
                <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>
                  (Full Access overrides all • Selected below are preserved when Full Access is turned OFF)
                </span>
              )}
            </div>
            <button 
              type="button"
              onClick={selectAll}
              style={{
                background: 'transparent',
                border: 0,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--brand)',
                cursor: 'pointer',
                padding: '2px 4px'
              }}
            >
              {formData.permissions.length === PAGE_PERMISSIONS.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {/* Clean 3-Column Permissions List */}
          <div 
            className="roles-permissions-grid"
            style={{ 
              maxHeight: 460, 
              overflowY: 'auto', 
              paddingRight: 4,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              scrollbarWidth: 'thin',
            }}
          >
            {PAGE_PERMISSIONS.map(perm => {
              const isSelected = formData.permissions.includes(perm.id);
              return (
                <button 
                  type="button"
                  key={perm.id}
                  onClick={() => togglePermission(perm.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: '1.5px solid',
                    borderColor: isSelected ? 'var(--brand)' : 'var(--border)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.06)' : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 6px rgba(139, 92, 246, 0.12)' : 'none',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                      e.currentTarget.style.background = 'var(--surface-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--surface)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div 
                      style={{ 
                        width: 34, 
                        height: 34, 
                        borderRadius: 10, 
                        background: isSelected ? 'var(--brand)' : 'var(--surface-3)', 
                        color: isSelected ? '#ffffff' : 'var(--tx-3)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s'
                      }}
                    >
                      {permissionIcon(perm.id, perm.group)}
                    </div>
                    <span 
                      style={{ 
                        fontSize: 13, 
                        fontWeight: 700, 
                        color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {perm.label}
                    </span>
                  </div>

                  <div 
                    style={{ 
                      width: 22, 
                      height: 22, 
                      borderRadius: '50%', 
                      background: isSelected ? 'var(--brand)' : 'transparent', 
                      border: isSelected ? 'none' : '1.5px solid var(--border)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                      color: '#ffffff'
                    }}
                  >
                    {isSelected && <Check size={13} strokeWidth={3.5} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!roleToDelete}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${roleToDelete?.name || ''}"? This action cannot be undone.`}
        onConfirm={() => {
          if (roleToDelete) deleteMutation.mutate(roleToDelete._id);
        }}
        onCancel={() => setRoleToDelete(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
};

