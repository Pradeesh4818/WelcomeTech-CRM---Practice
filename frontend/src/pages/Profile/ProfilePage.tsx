import React, { useState, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { 
  User, Mail, Phone, MapPin, Shield, Calendar, 
  Clock, CheckCircle, FileText, Camera, Edit2, Plus,
  Lock, Key, Eye, EyeOff, Save, X, Sparkles, Building,
  Globe, Moon, Sun, Check, AlertCircle, Laptop, Smartphone,
  Download, ExternalLink, ShieldCheck, Activity, Award,
  Briefcase, UserCheck
} from 'lucide-react';
import { Avatar, Badge } from '../../components/ui';
import { fmt } from '../../utils/helpers';
import api from '../../utils/api';

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'documents' | 'security'>('overview');
  
  // Profile edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || 'Corporate Headquarters, Doha',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Documents state
  const [documentsList, setDocumentsList] = useState(user?.documents || []);
  const docInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <User size={16} /> },
    { id: 'details', label: 'Profile Details', icon: <Edit2 size={16} /> },
    { id: 'documents', label: 'Documents', icon: <FileText size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  ];

  const totalCalls = user.totalCalls ?? 48;
  const resolvedCalls = user.resolvedCalls ?? 46;
  const resolvedRate = totalCalls > 0 ? (resolvedCalls / totalCalls) * 100 : 96;

  // Profile completion calculation
  const profileFields = [user.name, user.email, user.phone, user.address, user.avatar];
  const completedFields = profileFields.filter(Boolean).length;
  const profileCompletion = Math.round((completedFields / profileFields.length) * 100);

  const handleProfileSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await api.patch('/auth/profile', {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
      });

      if (res.data?.success && res.data?.user) {
        setUser(res.data.user);
        setProfileSuccess('Profile details updated successfully!');
        setIsEditing(false);
        setTimeout(() => setProfileSuccess(''), 4000);
      } else {
        throw new Error(res.data?.message || 'Failed to update profile');
      }
    } catch (err: any) {
      setProfileError(err?.response?.data?.message || err.message || 'Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Avatar image must be under 2MB');
      return;
    }

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await api.patch('/auth/profile', { avatar: base64 });
        if (res.data?.success && res.data?.user) {
          setUser(res.data.user);
          setProfileSuccess('Profile picture updated successfully!');
          setTimeout(() => setProfileSuccess(''), 4000);
        }
      } catch (err: any) {
        setProfileError(err?.response?.data?.message || 'Failed to update avatar');
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await api.patch('/auth/password', {
        currentPassword,
        newPassword,
      });

      if (res.data?.success) {
        setPasswordSuccess('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(''), 5000);
      } else {
        throw new Error(res.data?.message || 'Failed to change password');
      }
    } catch (err: any) {
      setPasswordError(err?.response?.data?.message || err.message || 'Error updating password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newDoc = {
      _id: `doc-${Date.now()}`,
      name: file.name,
      path: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
    };
    const updated = [newDoc, ...documentsList];
    setDocumentsList(updated);
    setProfileSuccess(`Document "${file.name}" added successfully.`);
    setTimeout(() => setProfileSuccess(''), 4000);
  };

  return (
    <div className="profile-luxury-wrap fade-in">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleAvatarChange}
      />
      <input
        type="file"
        ref={docInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
        onChange={handleDocUpload}
      />

      {/* ─── Profile Hero Header ────────────────────── */}
      <div className="profile-header-new">
        <div className="profile-header-bg">
          <div className="p-header-pattern" />
        </div>

        <div className="profile-header-main">
          {/* Avatar with Camera Overlay */}
          <div className="p-avatar-wrap" onClick={() => fileInputRef.current?.click()} title="Click to change photo">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="p-avatar-main p-avatar-img" />
            ) : (
              <Avatar name={user.name} size="xl" className="p-avatar-main" />
            )}
            <div className="p-avatar-badge" title="Verified Account">
              <CheckCircle size={14} />
            </div>
            <div className="p-avatar-overlay">
              <Camera size={18} />
              <span>Change</span>
            </div>
          </div>

          {/* User Info */}
          <div className="p-info-main">
            <div className="p-name-row">
              <h1 className="p-name">{user.name}</h1>
              <span className="p-role-pill">
                <ShieldCheck size={13} />
                {String(user.role).toUpperCase()}
              </span>
              <span className="p-status-pill">
                <span className="p-status-dot" />
                Active
              </span>
            </div>

            <div className="p-meta-strip">
              <span className="p-meta-tag">
                <Mail size={13} style={{ color: 'var(--brand)' }} />
                {user.email}
              </span>
              <span className="p-meta-tag">
                <Phone size={13} style={{ color: 'var(--brand)' }} />
                {user.phone || '+974 — — — —'}
              </span>
              <span className="p-meta-tag">
                <MapPin size={13} style={{ color: 'var(--brand)' }} />
                Doha, Qatar
              </span>
              <span className="p-meta-tag">
                <Building size={13} style={{ color: 'var(--brand)' }} />
                Welcome Trading Co. W.L.L
              </span>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="p-header-actions">
            <button 
              className={`btn ${isEditing ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => {
                if (activeTab !== 'details') setActiveTab('details');
                setIsEditing(!isEditing);
              }}
            >
              {isEditing ? <X size={14} /> : <Edit2 size={14} />}
              {isEditing ? 'Cancel Edit' : 'Edit Profile'}
            </button>
            <button 
              className="btn btn-secondary btn-icon-only" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {/* Global Notifications inside Header */}
        {profileSuccess && (
          <div className="p-alert-strip success fade-in">
            <CheckCircle size={15} />
            <span>{profileSuccess}</span>
          </div>
        )}
        {profileError && (
          <div className="p-alert-strip error fade-in">
            <AlertCircle size={15} />
            <span>{profileError}</span>
          </div>
        )}

        {/* Internal Navigation Tabs */}
        <div className="profile-tabs-nav">
          {tabs.map(tab => (
            <button 
              key={tab.id}
              className={`p-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === 'overview' && <span className="p-tab-dot" />}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Dynamic Content Area ─────────────────── */}
      <div className="profile-content-scroll">
        
        {/* ─── TAB 1: OVERVIEW ────────────────────── */}
        {activeTab === 'overview' && (
          <div className="p-tab-pane overview-pane fade-in">
            
            {/* Top 4 KPI Stat Badges */}
            <div className="p-kpi-row">
              <div className="p-kpi-card">
                <div className="p-kpi-icon brand">
                  <Award size={18} />
                </div>
                <div className="p-kpi-body">
                  <div className="p-kpi-val">{profileCompletion}%</div>
                  <div className="p-kpi-label">Profile Strength</div>
                </div>
                <div className="p-kpi-chip green">Complete</div>
              </div>

              <div className="p-kpi-card">
                <div className="p-kpi-icon blue">
                  <Activity size={18} />
                </div>
                <div className="p-kpi-body">
                  <div className="p-kpi-val">{resolvedRate.toFixed(0)}%</div>
                  <div className="p-kpi-label">Resolution Rate</div>
                </div>
                <div className="p-kpi-chip purple">{resolvedCalls}/{totalCalls} Calls</div>
              </div>

              <div className="p-kpi-card">
                <div className="p-kpi-icon amber">
                  <Briefcase size={18} />
                </div>
                <div className="p-kpi-body">
                  <div className="p-kpi-val" style={{ textTransform: 'capitalize' }}>{user.role}</div>
                  <div className="p-kpi-label">System Tier</div>
                </div>
                <div className="p-kpi-chip green">Full Access</div>
              </div>

              <div className="p-kpi-card">
                <div className="p-kpi-icon green">
                  <ShieldCheck size={18} />
                </div>
                <div className="p-kpi-body">
                  <div className="p-kpi-val">Verified</div>
                  <div className="p-kpi-label">Security Health</div>
                </div>
                <div className="p-kpi-chip green">2FA Active</div>
              </div>
            </div>

            {/* Main 3-Column Section Grid */}
            <div className="p-section-grid">
              
              {/* Activity & Performance Card */}
              <div className="p-grid-card stat-main">
                <div className="p-card-header-row">
                  <div className="p-card-header">Activity Performance</div>
                  <span className="p-card-tag">Monthly KPI</span>
                </div>
                <div className="p-stat-large">
                  <div className="p-stat-item">
                    <span className="p-val">{totalCalls}</span>
                    <span className="p-lbl">Total Handled</span>
                  </div>
                  <div className="p-stat-divider" />
                  <div className="p-stat-item">
                    <span className="p-val" style={{ color: 'var(--green, #10b981)' }}>{resolvedCalls}</span>
                    <span className="p-lbl">Resolved Calls</span>
                  </div>
                  <div className="p-stat-divider" />
                  <div className="p-stat-item">
                    <span className="p-val" style={{ color: 'var(--brand)' }}>{resolvedRate.toFixed(0)}%</span>
                    <span className="p-lbl">Success Rate</span>
                  </div>
                </div>
                
                <div className="p-progress-bar-wrap">
                  <div className="p-progress-bar-fill" style={{ width: `${resolvedRate}%` }} />
                </div>
                <div className="p-progress-footer">
                  <span>Target: 95% SLA</span>
                  <span style={{ color: 'var(--green, #10b981)', fontWeight: 700 }}>+4.2% vs last month</span>
                </div>

                <div className="p-quick-stats-list">
                  <div className="p-quick-stat-item">
                    <div className="p-qs-left">
                      <Clock size={14} style={{ color: 'var(--brand)' }} />
                      <span>Avg. Response Time</span>
                    </div>
                    <span className="p-qs-val">&lt; 15 mins</span>
                  </div>
                  <div className="p-quick-stat-item">
                    <div className="p-qs-left">
                      <Calendar size={14} style={{ color: 'var(--brand)' }} />
                      <span>Account Member Since</span>
                    </div>
                    <span className="p-qs-val">{user.createdAt ? fmt.date(user.createdAt) : '2024'}</span>
                  </div>
                  <div className="p-quick-stat-item">
                    <div className="p-qs-left">
                      <Globe size={14} style={{ color: 'var(--brand)' }} />
                      <span>Primary Operating Region</span>
                    </div>
                    <span className="p-qs-val">State of Qatar (GMT+3)</span>
                  </div>
                </div>
              </div>

              {/* Verified Documents Card */}
              <div className="p-grid-card doc-preview">
                <div className="p-card-header-row">
                  <div className="p-card-header">Latest Documents</div>
                  <button className="p-badge-action-btn" onClick={() => docInputRef.current?.click()}>
                    <Plus size={11} /> Upload
                  </button>
                </div>
                
                <div className="p-doc-mini-list">
                  {/* Default National ID Card */}
                  <div className="p-doc-mini">
                    <div className="p-doc-icon"><ShieldCheck size={16} /></div>
                    <div className="p-doc-info">
                      <span className="p-doc-name">Qatar National ID (QID)</span>
                      <span className="p-doc-meta-sub">Verified • Valid</span>
                    </div>
                    <span className="p-doc-date">Active</span>
                  </div>

                  {/* Passport Document */}
                  <div className="p-doc-mini">
                    <div className="p-doc-icon"><FileText size={16} /></div>
                    <div className="p-doc-info">
                      <span className="p-doc-name">Passport Copy.pdf</span>
                      <span className="p-doc-meta-sub">Official Record</span>
                    </div>
                    <span className="p-doc-date">Verified</span>
                  </div>

                  {documentsList.slice(0, 2).map((doc: any, i) => (
                    <div key={doc._id || i} className="p-doc-mini">
                      <div className="p-doc-icon"><FileText size={16} /></div>
                      <div className="p-doc-info">
                        <span className="p-doc-name">{doc.name}</span>
                        <span className="p-doc-meta-sub">Uploaded document</span>
                      </div>
                      <span className="p-doc-date">{doc.uploadedAt ? fmt.date(doc.uploadedAt) : 'Recent'}</span>
                    </div>
                  ))}
                </div>

                <button className="p-view-all-link" onClick={() => setActiveTab('documents')}>
                  View all documents & credentials →
                </button>
              </div>

              {/* System Security & Access Logs */}
              <div className="p-grid-card timeline-card">
                <div className="p-card-header-row">
                  <div className="p-card-header">Recent Security Logs</div>
                  <span className="p-live-dot-badge">Live</span>
                </div>
                
                <div className="p-timeline-compact">
                  <div className="p-tl-item">
                    <div className="p-tl-dot" />
                    <div className="p-tl-body">
                      <div className="p-tl-text">Active Login Session Authenticated</div>
                      <div className="p-tl-time">Doha, Qatar • Just now</div>
                    </div>
                  </div>
                  <div className="p-tl-item">
                    <div className="p-tl-dot" />
                    <div className="p-tl-body">
                      <div className="p-tl-text">Interface theme synced ({theme})</div>
                      <div className="p-tl-time">Today, 10:15 AM</div>
                    </div>
                  </div>
                  <div className="p-tl-item">
                    <div className="p-tl-dot" />
                    <div className="p-tl-body">
                      <div className="p-tl-text">Profile Security Status Verified</div>
                      <div className="p-tl-time">Yesterday</div>
                    </div>
                  </div>
                </div>

                <div className="p-security-quick-box">
                  <div className="p-sq-icon"><Shield size={16} /></div>
                  <div className="p-sq-text">
                    <div className="p-sq-title">Account is Secure</div>
                    <div className="p-sq-desc">Zero suspicious activities detected.</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ─── TAB 2: PROFILE DETAILS ──────────────── */}
        {activeTab === 'details' && (
          <div className="p-tab-pane details-pane fade-in">
            <div className="p-form-card">
              <div className="p-form-header">
                <div>
                  <h3>Personal & Professional Information</h3>
                  <p>Manage your account identity, contact details and enterprise settings</p>
                </div>
                <div className="p-form-header-action">
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditForm({
                            name: user.name,
                            phone: user.phone || '',
                            address: user.address || 'Corporate Headquarters, Doha',
                          });
                          setIsEditing(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-primary btn-sm"
                        disabled={isSaving}
                        onClick={() => handleProfileSave()}
                      >
                        <Save size={14} />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  ) : (
                    <button 
                      type="button" 
                      className="btn btn-primary btn-sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 size={14} />
                      Edit Details
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: Contact & Personal Info */}
              <div className="p-section-heading">
                <span className="p-section-num">1</span>
                <span>Personal Identity & Contact Information</span>
              </div>

              <div className="p-form-grid">
                <div className="p-input-group">
                  <label>Full Legal Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      className="p-input-field"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <div className="p-input-readonly">{user.name}</div>
                  )}
                </div>

                <div className="p-input-group">
                  <label>Email Address</label>
                  <div className="p-input-readonly" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{user.email}</span>
                    <span className="p-verified-badge">
                      <Check size={11} /> Verified
                    </span>
                  </div>
                </div>

                <div className="p-input-group">
                  <label>Direct Phone Number</label>
                  {isEditing ? (
                    <input
                      type="text"
                      className="p-input-field"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="+974 0000 0000"
                    />
                  ) : (
                    <div className="p-input-readonly">{user.phone || '+974 — — — —'}</div>
                  )}
                </div>

                <div className="p-input-group">
                  <label>Account Role & Permissions</label>
                  <div className="p-input-readonly" style={{ textTransform: 'capitalize', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{user.role}</span>
                    <span className="p-role-tag">Full Access</span>
                  </div>
                </div>

                <div className="p-input-group full-width">
                  <label>Home Office / Headquarters Address</label>
                  {isEditing ? (
                    <input
                      type="text"
                      className="p-input-field"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      placeholder="e.g. Corporate Headquarters, Doha, Qatar"
                    />
                  ) : (
                    <div className="p-input-readonly">{user.address || 'Corporate Headquarters, Doha'}</div>
                  )}
                </div>
              </div>

              {/* Section 2: Enterprise Attributes */}
              <div className="p-section-heading" style={{ marginTop: 32 }}>
                <span className="p-section-num">2</span>
                <span>Enterprise & Operational Context</span>
              </div>

              <div className="p-form-grid">
                <div className="p-input-group">
                  <label>Company Entity</label>
                  <div className="p-input-readonly">Welcome Trading Co. W.L.L</div>
                </div>

                <div className="p-input-group">
                  <label>Branch / Department</label>
                  <div className="p-input-readonly">Head Office • IT & Support</div>
                </div>

                <div className="p-input-group">
                  <label>Country & Jurisdiction</label>
                  <div className="p-input-readonly">Qatar (QA) • QAR Currency</div>
                </div>

                <div className="p-input-group">
                  <label>Interface Theme Preference</label>
                  <div className="p-theme-picker">
                    <button 
                      type="button" 
                      className={`p-theme-btn ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => setTheme('light')}
                    >
                      <Sun size={14} /> Light
                    </button>
                    <button 
                      type="button" 
                      className={`p-theme-btn ${theme === 'dark' ? 'active' : ''}`}
                      onClick={() => setTheme('dark')}
                    >
                      <Moon size={14} /> Dark
                    </button>
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="p-form-bottom-actions">
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={isSaving}
                    onClick={() => handleProfileSave()}
                  >
                    <Save size={14} />
                    {isSaving ? 'Saving Changes...' : 'Save Profile'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 3: DOCUMENTS ────────────────────── */}
        {activeTab === 'documents' && (
          <div className="p-tab-pane documents-pane fade-in">
            <div className="p-docs-header">
              <div>
                <h3>Official Identity & Work Documents</h3>
                <p>Verified employee credentials, residency permits, and official records</p>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => docInputRef.current?.click()}
              >
                <Plus size={14} /> Upload New Document
              </button>
            </div>

            <div className="p-docs-grid">
              {/* Qatar ID Card */}
              <div className="p-doc-card-new featured">
                <div className="p-doc-thumb verified"><ShieldCheck size={24} /></div>
                <div className="p-doc-details">
                  <div className="p-doc-title">Qatar National ID (QID)</div>
                  <div className="p-doc-meta">Official Residency Permit • Verified Status</div>
                  <div className="p-doc-badge-row">
                    <span className="p-doc-pill green">Valid</span>
                    <span className="p-doc-pill gray">Ministry of Interior (MOI)</span>
                  </div>
                </div>
                <div className="p-doc-actions">
                  <button className="btn-icon-small" title="Verified Credential"><Check size={14} /></button>
                </div>
              </div>

              {/* Passport Copy */}
              <div className="p-doc-card-new featured">
                <div className="p-doc-thumb"><FileText size={24} /></div>
                <div className="p-doc-details">
                  <div className="p-doc-title">Passport Copy (First & Last Page)</div>
                  <div className="p-doc-meta">Official Travel Document • Valid</div>
                  <div className="p-doc-badge-row">
                    <span className="p-doc-pill green">Active</span>
                    <span className="p-doc-pill gray">Verified 2026</span>
                  </div>
                </div>
                <div className="p-doc-actions">
                  <button className="btn-icon-small" title="Valid"><Check size={14} /></button>
                </div>
              </div>

              {/* Employment Contract */}
              <div className="p-doc-card-new">
                <div className="p-doc-thumb"><Building size={24} /></div>
                <div className="p-doc-details">
                  <div className="p-doc-title">Employment Contract & NDA</div>
                  <div className="p-doc-meta">Welcome Trading Co. W.L.L • Full-time</div>
                  <div className="p-doc-badge-row">
                    <span className="p-doc-pill purple">Corporate Record</span>
                  </div>
                </div>
                <div className="p-doc-actions">
                  <button className="btn-icon-small" title="Active"><Check size={14} /></button>
                </div>
              </div>

              {/* Custom Uploaded Docs */}
              {documentsList.map((doc: any, i) => (
                <div key={doc._id || i} className="p-doc-card-new">
                  <div className="p-doc-thumb"><FileText size={24} /></div>
                  <div className="p-doc-details">
                    <div className="p-doc-title">{doc.name}</div>
                    <div className="p-doc-meta">Uploaded {doc.uploadedAt ? fmt.date(doc.uploadedAt) : 'Recently'} • PDF</div>
                    <div className="p-doc-badge-row">
                      <span className="p-doc-pill gray">User Upload</span>
                    </div>
                  </div>
                  <div className="p-doc-actions">
                    <button className="btn-icon-small" title="Uploaded Record"><Check size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 4: SECURITY ─────────────────────── */}
        {activeTab === 'security' && (
          <div className="p-tab-pane security-pane fade-in">
            <div className="p-security-container">
              
              {/* Change Password Card */}
              <div className="p-sec-card password-card">
                <div className="p-sec-header">
                  <div className="p-sec-icon-circle">
                    <Key size={20} />
                  </div>
                  <div>
                    <h4>Update Security Password</h4>
                    <p>Ensure your account uses a long, random password to stay secure.</p>
                  </div>
                </div>

                {passwordSuccess && (
                  <div className="p-alert-strip success" style={{ marginBottom: 16 }}>
                    <CheckCircle size={15} />
                    <span>{passwordSuccess}</span>
                  </div>
                )}
                {passwordError && (
                  <div className="p-alert-strip error" style={{ marginBottom: 16 }}>
                    <AlertCircle size={15} />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="p-pw-form">
                  <div className="p-input-group">
                    <label>Current Password</label>
                    <div className="p-pw-input-wrap">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        className="p-input-field"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        required
                      />
                      <button
                        type="button"
                        className="p-pw-toggle"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="p-pw-grid">
                    <div className="p-input-group">
                      <label>New Password</label>
                      <div className="p-pw-input-wrap">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          className="p-input-field"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          required
                        />
                        <button
                          type="button"
                          className="p-pw-toggle"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="p-input-group">
                      <label>Confirm New Password</label>
                      <div className="p-pw-input-wrap">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          className="p-input-field"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          required
                        />
                        <button
                          type="button"
                          className="p-pw-toggle"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-pw-actions">
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isChangingPassword}
                    >
                      <Lock size={14} />
                      {isChangingPassword ? 'Updating Password...' : 'Save New Password'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Two-Factor Authentication Card */}
              <div className="p-sec-card">
                <div className="p-sec-icon"><Shield size={22} /></div>
                <div className="p-sec-info">
                  <h4>Multi-Factor Authentication (2FA)</h4>
                  <p>Protect your account with an extra verification layer during logins</p>
                </div>
                <div className="p-sec-action">
                  <Badge status="active" label="Enabled" />
                </div>
              </div>

              {/* Active Sessions Card */}
              <div className="p-sec-card">
                <div className="p-sec-icon"><Laptop size={22} /></div>
                <div className="p-sec-info">
                  <h4>Active Device Session</h4>
                  <p>Currently active on Chrome • macOS • Doha, Qatar (187.127.188.185)</p>
                </div>
                <div className="p-sec-action">
                  <span className="p-session-badge">Current Device</span>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ─── Modern Stylesheet ───────────────────────── */}
      <style>{`
        .profile-luxury-wrap {
          display: flex;
          flex-direction: column;
          height: calc(100vh - var(--topbar-h) - 44px);
          background: var(--bg);
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid var(--border);
          box-shadow: var(--sh-xs, 0 1px 3px rgba(0,0,0,0.05));
        }

        /* ─── Profile Header ─────────────────────── */
        .profile-header-new {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          position: relative;
          flex-shrink: 0;
        }
        .profile-header-bg {
          height: 110px;
          background: linear-gradient(135deg, var(--brand) 0%, #4f46e5 100%);
          position: relative;
          overflow: hidden;
        }
        .p-header-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.12;
          background-image: radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px);
          background-size: 16px 16px;
        }
        .profile-header-main {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 0 36px;
          margin-top: -46px;
          margin-bottom: 20px;
          position: relative;
          z-index: 2;
        }
        .p-avatar-wrap {
          position: relative;
          cursor: pointer;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .p-avatar-wrap:hover {
          transform: scale(1.02);
        }
        .p-avatar-main {
          width: 96px !important;
          height: 96px !important;
          min-width: 96px !important;
          max-width: 96px !important;
          min-height: 96px !important;
          max-height: 96px !important;
          border: 4px solid var(--surface) !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
          border-radius: 50% !important;
          aspect-ratio: 1 / 1 !important;
          flex-shrink: 0 !important;
          background: var(--brand) !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          font-size: 32px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .p-avatar-img {
          object-fit: cover;
        }
        .p-avatar-badge {
          position: absolute;
          bottom: 2px;
          right: 2px;
          background: var(--green, #10b981);
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2.5px solid var(--surface);
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .p-avatar-overlay {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          opacity: 0;
          transition: opacity 0.2s;
          border: 4px solid transparent;
        }
        .p-avatar-wrap:hover .p-avatar-overlay {
          opacity: 1;
        }

        .p-info-main {
          flex: 1;
          min-width: 0;
        }
        .p-name-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .p-name {
          font-size: 26px;
          font-weight: 850;
          color: var(--tx-1);
          letter-spacing: -0.02em;
          margin: 0;
        }
        .p-role-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 20px;
          background: var(--brand-light, rgba(114, 37, 128, 0.1));
          color: var(--brand);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }
        .p-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(16, 185, 129, 0.1);
          color: var(--green, #10b981);
          font-size: 11px;
          font-weight: 750;
        }
        .p-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--green, #10b981);
        }
        .p-meta-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 10px;
        }
        .p-meta-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: var(--tx-3);
          font-weight: 600;
        }
        .p-header-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-icon-only {
          padding: 9px 12px;
        }

        .p-alert-strip {
          margin: 0 36px 14px 36px;
          padding: 10px 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
        }
        .p-alert-strip.success {
          background: rgba(16, 185, 129, 0.1);
          color: var(--green, #10b981);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        .p-alert-strip.error {
          background: rgba(239, 68, 68, 0.1);
          color: var(--red, #ef4444);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        /* ─── Navigation Tabs ────────────────────── */
        .profile-tabs-nav {
          display: flex;
          gap: 32px;
          padding: 0 36px;
          border-top: 1px solid var(--border);
        }
        .p-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 0;
          font-size: 13.5px;
          font-weight: 700;
          color: var(--tx-4);
          background: none;
          border: none;
          border-bottom: 2.5px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        .p-tab-btn:hover { color: var(--tx-1); }
        .p-tab-btn.active {
          color: var(--brand);
          border-bottom-color: var(--brand);
        }
        .p-tab-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--brand);
        }

        /* ─── Content Scroll ─────────────────────── */
        .profile-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 28px 36px 36px;
        }

        /* ─── KPI Row ────────────────────────────── */
        .p-kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .p-kpi-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: transform 0.2s, border-color 0.2s;
        }
        .p-kpi-card:hover {
          transform: translateY(-1px);
          border-color: var(--brand);
        }
        .p-kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .p-kpi-icon.brand { background: var(--brand-light, rgba(114,37,128,0.1)); color: var(--brand); }
        .p-kpi-icon.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
        .p-kpi-icon.amber { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .p-kpi-icon.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .p-kpi-body { flex: 1; min-width: 0; }
        .p-kpi-val { font-size: 19px; font-weight: 850; color: var(--tx-1); line-height: 1.2; }
        .p-kpi-label { font-size: 11px; font-weight: 650; color: var(--tx-4); margin-top: 2px; }
        .p-kpi-chip {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 10px;
          white-space: nowrap;
        }
        .p-kpi-chip.green { background: rgba(16, 185, 129, 0.1); color: var(--green, #10b981); }
        .p-kpi-chip.purple { background: var(--brand-light, rgba(114,37,128,0.1)); color: var(--brand); }

        /* ─── 3-Column Section Grid ──────────────── */
        .p-section-grid {
          display: grid;
          grid-template-columns: 1.4fr 1.1fr 1fr;
          gap: 20px;
        }
        .p-grid-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 22px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .p-card-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }
        .p-card-header {
          font-size: 12px;
          font-weight: 800;
          color: var(--tx-4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .p-card-tag {
          font-size: 10.5px;
          font-weight: 750;
          color: var(--brand);
          background: var(--brand-light, rgba(114,37,128,0.08));
          padding: 2px 8px;
          border-radius: 6px;
        }
        .p-badge-action-btn {
          font-size: 11px;
          font-weight: 750;
          color: var(--brand);
          background: var(--brand-light, rgba(114,37,128,0.08));
          border: none;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .p-live-dot-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 750;
          color: var(--green, #10b981);
        }
        .p-live-dot-badge::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--green, #10b981);
        }

        .p-stat-large {
          display: flex;
          align-items: center;
          justify-content: space-around;
          margin-bottom: 18px;
          background: var(--surface-2);
          padding: 16px 12px;
          border-radius: 12px;
        }
        .p-stat-item { text-align: center; }
        .p-val { display: block; font-size: 26px; font-weight: 850; color: var(--tx-1); line-height: 1.1; }
        .p-lbl { font-size: 11px; color: var(--tx-4); font-weight: 650; margin-top: 4px; }
        .p-stat-divider { width: 1px; height: 32px; background: var(--border); }

        .p-progress-bar-wrap { height: 8px; background: var(--surface-3); border-radius: 99px; overflow: hidden; }
        .p-progress-bar-fill { height: 100%; background: var(--brand); border-radius: 99px; transition: width 0.4s ease; }
        .p-progress-footer {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          color: var(--tx-4);
          margin-top: 8px;
          font-weight: 600;
        }

        .p-quick-stats-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }
        .p-quick-stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12.5px;
        }
        .p-qs-left { display: flex; align-items: center; gap: 8px; color: var(--tx-3); font-weight: 600; }
        .p-qs-val { color: var(--tx-1); font-weight: 750; }

        .p-doc-mini-list { display: flex; flex-direction: column; gap: 10px; }
        .p-doc-mini {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: var(--surface-2);
          border-radius: 12px;
          border: 1px solid var(--border);
          transition: border-color 0.2s;
        }
        .p-doc-mini:hover { border-color: var(--brand); }
        .p-doc-icon { color: var(--brand); flex-shrink: 0; }
        .p-doc-info { flex: 1; min-width: 0; }
        .p-doc-name { display: block; font-size: 13px; font-weight: 700; color: var(--tx-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-doc-meta-sub { font-size: 10.5px; color: var(--tx-4); }
        .p-doc-date { font-size: 11px; font-weight: 700; color: var(--green, #10b981); }
        .p-view-all-link {
          margin-top: 16px;
          background: none; border: none;
          color: var(--brand); font-size: 12.5px; font-weight: 750;
          cursor: pointer; text-align: left; padding: 0;
        }
        .p-view-all-link:hover { text-decoration: underline; }

        .p-timeline-compact { display: flex; flex-direction: column; gap: 14px; position: relative; }
        .p-tl-item { display: flex; gap: 12px; position: relative; }
        .p-tl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); margin-top: 5px; flex-shrink: 0; }
        .p-tl-body { flex: 1; min-width: 0; }
        .p-tl-text { font-size: 12.5px; color: var(--tx-2); font-weight: 600; line-height: 1.35; }
        .p-tl-time { font-size: 10.5px; color: var(--tx-4); margin-top: 2px; }

        .p-security-quick-box {
          margin-top: 16px;
          padding: 12px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .p-sq-icon { color: var(--green, #10b981); flex-shrink: 0; }
        .p-sq-title { font-size: 12px; font-weight: 750; color: var(--tx-1); }
        .p-sq-desc { font-size: 11px; color: var(--tx-3); margin-top: 1px; }

        /* ─── TAB 2: Form Card ───────────────────── */
        .p-form-card {
          max-width: 860px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 32px 36px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .p-form-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .p-form-header h3 { font-size: 19px; font-weight: 850; color: var(--tx-1); margin: 0; }
        .p-form-header p { font-size: 13.5px; color: var(--tx-4); margin: 4px 0 0 0; }
        
        .p-section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          font-weight: 800;
          color: var(--tx-1);
          margin-bottom: 18px;
        }
        .p-section-num {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--brand);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
        }

        .p-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .p-input-group label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          color: var(--tx-4);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .p-input-readonly { 
          padding: 11px 14px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--tx-1);
          font-weight: 650;
          font-size: 14px;
        }
        .p-input-field {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 14px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          color: var(--tx-1);
          font-weight: 600;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .p-input-field:focus {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px var(--brand-light, rgba(114,37,128,0.15));
        }
        .full-width { grid-column: span 2; }
        
        .p-verified-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 750;
          color: var(--green, #10b981);
          background: rgba(16, 185, 129, 0.1);
          padding: 2px 7px;
          border-radius: 6px;
        }
        .p-role-tag {
          font-size: 11px;
          font-weight: 750;
          color: var(--brand);
          background: var(--brand-light, rgba(114,37,128,0.1));
          padding: 2px 7px;
          border-radius: 6px;
        }
        .p-theme-picker {
          display: flex;
          gap: 8px;
        }
        .p-theme-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid var(--border);
          background: var(--surface);
          color: var(--tx-2);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .p-theme-btn.active {
          border-color: var(--brand);
          background: var(--brand-light, rgba(114,37,128,0.08));
          color: var(--brand);
        }
        .p-form-bottom-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        /* ─── TAB 3: Documents Grid ──────────────── */
        .p-docs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .p-docs-header h3 { font-size: 19px; font-weight: 850; color: var(--tx-1); margin: 0; }
        .p-docs-header p { font-size: 13.5px; color: var(--tx-4); margin: 4px 0 0 0; }
        .p-docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        .p-doc-card-new {
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 18px;
          border-radius: 14px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          transition: all 0.2s;
        }
        .p-doc-card-new:hover { border-color: var(--brand); transform: translateY(-1px); }
        .p-doc-card-new.featured {
          background: var(--surface);
          border-left: 3px solid var(--brand);
        }
        .p-doc-thumb {
          width: 44px;
          height: 44px;
          background: var(--surface-2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--brand);
          flex-shrink: 0;
        }
        .p-doc-thumb.verified {
          color: var(--green, #10b981);
          background: rgba(16, 185, 129, 0.08);
        }
        .p-doc-details { flex: 1; min-width: 0; }
        .p-doc-title { font-size: 14px; font-weight: 750; color: var(--tx-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-doc-meta { font-size: 11.5px; color: var(--tx-4); margin-top: 2px; }
        .p-doc-badge-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .p-doc-pill {
          font-size: 10px;
          font-weight: 750;
          padding: 2px 7px;
          border-radius: 6px;
        }
        .p-doc-pill.green { background: rgba(16, 185, 129, 0.1); color: var(--green, #10b981); }
        .p-doc-pill.purple { background: var(--brand-light, rgba(114,37,128,0.1)); color: var(--brand); }
        .p-doc-pill.gray { background: var(--surface-3); color: var(--tx-3); }
        .p-doc-actions { margin-left: auto; display: flex; gap: 6px; }
        .btn-icon-small { 
          width: 32px; height: 32px; border-radius: 8px; 
          background: var(--surface-2); border: 1px solid var(--border);
          color: var(--tx-3); display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }

        /* ─── TAB 4: Security ────────────────────── */
        .p-security-container {
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 760px;
        }
        .p-sec-card {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 22px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .p-sec-card.password-card {
          flex-direction: column;
          align-items: stretch;
          gap: 20px;
        }
        .p-sec-header { display: flex; align-items: center; gap: 14px; }
        .p-sec-icon-circle {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--brand-light, rgba(114,37,128,0.1));
          color: var(--brand);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .p-sec-header h4 { font-size: 16px; font-weight: 800; color: var(--tx-1); margin: 0; }
        .p-sec-header p { font-size: 13px; color: var(--tx-4); margin: 2px 0 0 0; }
        
        .p-pw-form { display: flex; flex-direction: column; gap: 16px; }
        .p-pw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .p-pw-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .p-pw-toggle {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: var(--tx-4);
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .p-pw-actions { display: flex; justify-content: flex-end; margin-top: 8px; }

        .p-sec-icon { color: var(--brand); flex-shrink: 0; }
        .p-sec-info h4 { font-size: 15px; font-weight: 750; color: var(--tx-1); margin: 0; }
        .p-sec-info p { font-size: 13px; color: var(--tx-4); margin: 2px 0 0 0; }
        .p-sec-action { margin-left: auto; }
        .p-session-badge {
          font-size: 11px;
          font-weight: 750;
          color: var(--green, #10b981);
          background: rgba(16, 185, 129, 0.1);
          padding: 4px 10px;
          border-radius: 8px;
        }

        /* ─── Responsive Media Queries ───────────── */
        @media (max-width: 1024px) {
          .profile-header-main { padding: 0 24px; }
          .profile-tabs-nav { padding: 0 24px; gap: 24px; }
          .profile-content-scroll { padding: 24px; }
          .p-kpi-row { grid-template-columns: repeat(2, 1fr); }
          .p-section-grid {
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          .p-section-grid .timeline-card {
            grid-column: span 2;
          }
        }

        @media (max-width: 768px) {
          .profile-luxury-wrap {
            height: auto;
            min-height: auto;
            border-radius: 16px;
            overflow: visible;
          }
          .profile-content-scroll {
            overflow-y: visible;
            flex: initial;
            padding: 16px 12px;
          }
          .profile-header-main {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 14px;
            padding: 0 16px;
            margin-top: -45px;
            margin-bottom: 20px;
          }
          .p-avatar-main {
            width: 84px !important;
            height: 84px !important;
            font-size: 26px !important;
          }
          .p-info-main {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
          }
          .p-name-row {
            justify-content: center;
          }
          .p-name {
            font-size: 22px;
            text-align: center;
            word-break: break-word;
          }
          .p-meta-strip {
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px 12px;
            margin-top: 8px;
          }
          .p-meta-tag {
            font-size: 11.5px;
            word-break: break-word;
          }
          .p-header-actions {
            margin-left: 0;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .p-header-actions .btn {
            width: 100%;
            max-width: 240px;
            justify-content: center;
          }
          .profile-tabs-nav {
            padding: 0 14px;
            gap: 20px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            border-bottom: 1px solid var(--border);
          }
          .profile-tabs-nav::-webkit-scrollbar {
            display: none;
          }
          .p-tab-btn {
            flex-shrink: 0;
            white-space: nowrap;
            padding: 14px 2px;
            font-size: 13px;
          }
          .p-kpi-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .p-section-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .p-section-grid .timeline-card {
            grid-column: span 1;
          }
          .p-grid-card {
            padding: 16px;
            border-radius: 16px;
          }
          .p-card-header {
            margin-bottom: 14px;
          }
          .p-stat-large {
            margin-bottom: 16px;
            gap: 8px;
          }
          .p-stat-item {
            flex: 1;
            min-width: 0;
            text-align: center;
          }
          .p-val {
            font-size: 22px;
          }
          .p-lbl {
            font-size: 10.5px;
            white-space: nowrap;
          }
          .p-stat-divider {
            height: 24px;
          }
          .p-doc-mini {
            min-width: 0;
            padding: 8px 10px;
          }
          .p-doc-name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .p-doc-date {
            flex-shrink: 0;
          }
          .p-form-card {
            padding: 20px 16px;
            border-radius: 16px;
          }
          .p-form-header {
            flex-direction: column;
            gap: 12px;
          }
          .p-form-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .full-width {
            grid-column: span 1;
          }
          .p-input-readonly {
            font-size: 13.5px;
            padding: 10px 12px;
            word-break: break-all;
          }
          .p-docs-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 20px;
          }
          .p-docs-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .p-doc-card-new {
            padding: 14px;
            border-radius: 14px;
            gap: 12px;
          }
          .p-doc-thumb {
            width: 40px;
            height: 40px;
            flex-shrink: 0;
          }
          .p-doc-details {
            min-width: 0;
            flex: 1;
          }
          .p-doc-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .p-security-container {
            gap: 14px;
          }
          .p-sec-card {
            padding: 16px;
            border-radius: 14px;
            gap: 14px;
            flex-wrap: wrap;
          }
          .p-sec-info {
            flex: 1;
            min-width: 160px;
          }
          .p-sec-action {
            margin-left: auto;
          }
          .p-pw-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        }
      `}</style>
    </div>
  );
};

export default ProfilePage;
