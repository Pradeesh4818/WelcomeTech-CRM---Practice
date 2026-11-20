import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PanelLeftClose, Sun, Moon, Bell, BellRing, UserPlus, CalendarClock, Activity, User as UserIcon, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { useNotifications, type Notification as NotificationItem } from '../../hooks/useNotifications';

import { fmt, clsx } from '../../utils/helpers';
import api from '../../utils/api';
import { createPortal } from 'react-dom';
import { Avatar, ConfirmDialog } from '../ui';
import { hasPermission } from '../../utils/rbac';
import { getNotificationPermission, initFCMAndRegisterToken, isNotificationSupported } from '../../utils/fcmClient';
import toast from 'react-hot-toast';
import { DateFilterSelector } from './DateFilterSelector';


const ROUTE_NAMES: Record<string, string> = {
  '/': 'Dashboard',
  '/customers': 'Customer List',
  '/customers/new': 'Add Customer',
  '/customers/product-list': 'Product List',
  '/tdl': 'TDL Dashboard',
  '/tdl/list': 'TDL List',
  '/cloud': 'Cloud Dashboard',
  '/cloud/list': 'Cloud List',
  '/tss': 'TSS Dashboard',
  '/tss/list': 'TSS List',
  '/leads': 'Leads',
  '/calls': 'Call Logs',
  '/calls/new': 'Log New Call',
  '/tasks': 'Tasks',
  '/amc': 'AMC Dashboard',
  '/amc/list': 'AMC List',
  '/tickets': 'Tickets',
  '/tickets/new': 'Raise Ticket',
  '/payments': 'Payment Records',
  '/payments/new': 'Record Payment',
  '/invoices': 'Invoices',
  '/outstanding': 'Outstanding',
  '/proposals': 'Customer Proposals',
  '/proposals/new': 'New Proposal',
  '/proposal-templates': 'Proposal Templates',
  '/proposal-templates/new': 'New Template',
  '/products': 'Products',
  '/licence-types': 'Licence Types',
  '/customer-types': 'Customer Types',
  '/lead-sources': 'Lead Sources',
  '/lead-statuses': 'Lead Status',
  '/ticket-categories': 'Ticket Category',
  '/vendor-categories': 'Vendor Types',
  '/employees': 'Employee List',
  '/employees/new': 'Add Employee',
  '/admin-users': 'Admin Users',
  '/engineers': 'Field Engineers',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
  '/email-templates': 'Email Templates',
  '/media-library': 'Media Library',
  '/roles': 'Roles',
  '/profile': 'User Profile',
};

const titleizePathSegment = (segment: string) =>
  segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

interface TopbarProps {
  onMenuClick: () => void;
  showMenuButton?: boolean;
}

const Topbar: React.FC<TopbarProps> = ({ onMenuClick, showMenuButton = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggle } = useThemeStore();
  const { user, logout, setUser } = useAuthStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const handleThemeToggle = async () => {
    const currentTheme = useThemeStore.getState().theme;
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    toggle();
    try {
      localStorage.setItem('wt_user_theme_set', 'true');
      localStorage.setItem('wt_theme', nextTheme);
    } catch {}

    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      setUser({ ...currentUser, theme: nextTheme });
    }

    queryClient.setQueryData(['auth-me-session'], (old: any) =>
      old ? { ...old, theme: nextTheme } : old
    );

    try {
      await api.patch('/auth/theme', { theme: nextTheme });
    } catch (err) {
      console.error('Failed to persist theme preference to backend:', err);
    }
  };
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission());
  const [isEnablingPush, setIsEnablingPush] = useState(false);

  const handleEnablePush = async () => {
    setIsEnablingPush(true);
    try {
      const token = await initFCMAndRegisterToken({ promptUser: true });
      setPushPermission(getNotificationPermission());
      if (token) {
        toast.success('Push notifications enabled successfully!');
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
        toast.error('Notifications are blocked in your browser settings.');
      }
    } catch (err: any) {
      toast.error('Failed to enable push notifications.');
    } finally {
      setIsEnablingPush(false);
    }
  };

  const bellRef = React.useRef<HTMLButtonElement>(null);
  const profileBtnRef = React.useRef<HTMLButtonElement>(null);


  const [notificationPopoverStyle, setNotificationPopoverStyle] = useState<React.CSSProperties>({});
  const [profilePopoverStyle, setProfilePopoverStyle] = useState<React.CSSProperties>({});

  const userRole = (typeof user?.role === 'string' ? user.role : (user?.role as any)?.name || '').toLowerCase();
  const canViewSettings = hasPermission(user, 'settings.general') || hasPermission(user, 'settings');

  const getPageName = (path: string) => {
    if (ROUTE_NAMES[path]) return ROUTE_NAMES[path];

    if (path.includes('/edit')) {
      if (path.startsWith('/customers')) return 'Edit Customer';
      if (path.startsWith('/employees')) return 'Edit Employee';
      if (path.startsWith('/calls')) return 'Edit Call Log';
      if (path.startsWith('/tickets')) return 'Edit Support Ticket';
      if (path.startsWith('/proposal-templates')) return 'Edit Template';
      if (path.startsWith('/proposals')) return 'Edit Proposal';
    }

    const routeSegments = path.split('/').filter(Boolean);
    return routeSegments.length > 0
      ? titleizePathSegment(routeSegments[routeSegments.length - 1])
      : 'Dashboard';
  };

  const pageName = getPageName(location.pathname);

  const updateNotificationPos = () => {
    if (!bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth <= 640;
    const popoverWidth = isMobile ? Math.min(320, window.innerWidth - 24) : 320;
    const rightOffset = isMobile ? 12 : Math.max(12, window.innerWidth - rect.right);
    setNotificationPopoverStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      right: rightOffset,
      width: `${popoverWidth}px`,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 1000,
    });
  };

  const updateProfilePos = () => {
    if (!profileBtnRef.current) return;
    const rect = profileBtnRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth <= 640;
    const popoverWidth = isMobile ? Math.min(260, window.innerWidth - 24) : 260;
    const rightOffset = isMobile ? 12 : Math.max(16, window.innerWidth - rect.right);
    setProfilePopoverStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      right: rightOffset,
      width: `${popoverWidth}px`,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 1000,
    });
  };

  React.useEffect(() => {
    if (showNotifications) {
      updateNotificationPos();
      const handleOutside = (e: MouseEvent) => {
        if (bellRef.current?.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest('.notification-popover')) return;
        setShowNotifications(false);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
          setShowNotifications(false);
        }
      };
      window.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updateNotificationPos);
      window.addEventListener('scroll', updateNotificationPos, true);
      return () => {
        window.removeEventListener('mousedown', handleOutside);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', updateNotificationPos);
        window.removeEventListener('scroll', updateNotificationPos, true);
      };
    }
  }, [showNotifications]);

  React.useEffect(() => {
    if (showProfileMenu) {
      updateProfilePos();
      const handleOutside = (e: MouseEvent) => {
        if (profileBtnRef.current?.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest('.topbar-profile-popover')) return;
        setShowProfileMenu(false);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
          setShowProfileMenu(false);
        }
      };
      window.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updateProfilePos);
      window.addEventListener('scroll', updateProfilePos, true);
      return () => {
        window.removeEventListener('mousedown', handleOutside);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', updateProfilePos);
        window.removeEventListener('scroll', updateProfilePos, true);
      };
    }
  }, [showProfileMenu]);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'assignment': return <UserPlus size={14} className="text-brand" />;
      case 'follow_up_reminder': return <CalendarClock size={14} className="text-amber" />;
      case 'status_change': return <Activity size={14} className="text-blue" />;
      default: return <Bell size={14} className="text-gray" />;
    }
  };


  const handleNotificationClick = (n: NotificationItem) => {
    // 1. Mark as read immediately (optimistically removes from dropdown & decrements badge)
    if (!n.isRead) {
      markAsRead(n._id);
    }

    // 2. Close notification popover
    setShowNotifications(false);

    // 3. Smart routing based on notification content
    const msg = (n.message || '').toLowerCase();

    if (msg.includes('via task') || msg.includes('task task-') || msg.includes('assigned task') || msg.includes('task #')) {
      const taskMatch = n.message.match(/TASK-[A-Za-z0-9-]+/i);
      if (taskMatch) {
        navigate(`/tasks?search=${encodeURIComponent(taskMatch[0])}`);
      } else {
        navigate('/tasks');
      }
    } else if (msg.includes('lead') || n.lead) {
      const leadMatch = n.message.match(/LEAD-[A-Za-z0-9-]+/i);
      if (leadMatch) {
        navigate(`/leads?search=${encodeURIComponent(leadMatch[0])}`);
      } else if (n.lead?._id) {
        navigate(`/leads?leadId=${encodeURIComponent(n.lead.leadId || n.lead._id)}`);
      } else {
        navigate('/leads');
      }
    } else if (msg.includes('ticket') || msg.includes('tkt-')) {
      const tktMatch = n.message.match(/TKT-[A-Za-z0-9-]+/i);
      if (tktMatch) {
        navigate(`/tickets?search=${encodeURIComponent(tktMatch[0])}`);
      } else {
        navigate('/tickets');
      }
    } else if (msg.includes('proposal') || msg.includes('quotation') || msg.includes('quote')) {
      navigate('/proposals');
    } else {
      navigate('/leads');
    }
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(false);
    setShowProfileMenu(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="topbar">
      <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {showMenuButton && (
          <button className="btn btn-ghost btn-icon" onClick={onMenuClick} style={{ flexShrink: 0, padding: '4px' }}>
            <PanelLeftClose size={20} strokeWidth={1.5} style={{ color: 'var(--tx-3)' }} />
          </button>
        )}

        <div style={{ width: '4px', height: '22px', background: 'rgba(139, 92, 246, 0.4)', borderRadius: '4px' }} />

        <span 
          key={pageName}
          className="topbar-title-text"
          style={{ 
            fontSize: '15px', 
            fontWeight: 800, 
            letterSpacing: '0.15em', 
            color: 'var(--tx-3)', 
            textTransform: 'uppercase',
            animation: 'pageTitleFade 0.35s ease forwards'
          }}
        >
          {pageName}
        </span>
      </div>

      <div className="topbar-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Global Date & Month Filter (Dual-Mode Filter Pill) */}
        <DateFilterSelector />

        {/* Notification Trigger */}
        <button 
          ref={bellRef}
          className={clsx("btn btn-ghost btn-icon", showNotifications && "active")} 
          title="Notifications" 
          style={{ position: 'relative' }}
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowProfileMenu(false);
          }}
        >
          <Bell size={16} style={{ color: 'var(--tx-2)' }} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: '#ef4444',
              color: '#ffffff',
              fontSize: 10.5,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--topbar-bg, #ffffff)',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.45)',
              lineHeight: 1,
              pointerEvents: 'none'
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Popover */}
        {showNotifications && createPortal(
          <div className="notification-popover fade-in-up" style={notificationPopoverStyle}>
            <div className="notification-header">
              <span className="notification-title">
                Notifications {unreadCount > 0 && <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>({unreadCount})</span>}
              </span>
              {unreadCount > 0 && (
                <button className="notification-mark-all" onClick={() => markAllAsRead()}>
                  Mark all as read
                </button>
              )}
            </div>

            {isNotificationSupported() && pushPermission !== 'granted' && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(59, 130, 246, 0.08)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Enable desktop alerts for tasks & leads
                </span>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={handleEnablePush}
                  disabled={isEnablingPush}
                  style={{ whiteSpace: 'nowrap', fontSize: '11px', height: '26px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <BellRing size={12} /> {isEnablingPush ? 'Enabling...' : 'Enable'}
                </button>
              </div>
            )}

            <div className="notification-list custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="notification-empty" style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <Bell size={26} style={{ opacity: 0.2, margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ fontWeight: 600, color: 'var(--tx-3)', fontSize: 13, margin: 0 }}>All caught up!</p>
                  <span style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 2, display: 'block' }}>No unread notifications</span>
                </div>
              ) : (
                notifications.map((n) => (
                  <div 
                    key={n._id} 
                    className={clsx("notification-item", !n.isRead && "unread")}
                    onClick={() => handleNotificationClick(n)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="notification-icon-wrapper">
                      {getIcon(n.type)}
                    </div>
                    <div className="notification-content">
                      <p className="notification-message" style={{ fontWeight: !n.isRead ? 600 : 400 }}>{n.message}</p>
                      <span className="notification-time">{fmt.relative(n.createdAt)}</span>
                    </div>
                    {!n.isRead && <div className="unread-dot" />}
                  </div>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="notification-footer">
                <button className="btn btn-ghost btn-xs w-full" onClick={() => setShowNotifications(false)}>
                  Close
                </button>
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Dark / Light Mode Toggle (Icon only) */}
        <button
          id="topbar-theme-toggle"
          className="btn btn-ghost btn-icon"
          onClick={handleThemeToggle}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 999,
            border: '1.5px solid var(--border-2)',
            background: theme === 'light'
              ? 'rgba(15,23,42,0.06)'
              : 'rgba(167,139,250,0.13)',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            flexShrink: 0,
          }}
        >
          {theme === 'light' ? (
            <Moon size={16} style={{ color: 'var(--tx-2)' }} />
          ) : (
            <Sun size={16} style={{ color: '#fbbf24' }} />
          )}
        </button>

        {/* ── User Profile Trigger Button ── */}
        <button
          ref={profileBtnRef}
          type="button"
          className={`topbar-profile-btn ${showProfileMenu ? 'active' : ''}`}
          onClick={() => {
            setShowProfileMenu(!showProfileMenu);
            setShowNotifications(false);
          }}
          title={user?.name || 'User Profile'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px 4px 4px',
            borderRadius: 24,
            background: showProfileMenu 
              ? 'color-mix(in srgb, var(--brand) 15%, var(--surface))' 
              : 'var(--surface)',
            border: showProfileMenu 
              ? '1px solid color-mix(in srgb, var(--brand) 50%, var(--border))' 
              : '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: 'var(--sh-xs)'
          }}
        >
          <div style={{ position: 'relative' }}>
            <Avatar src={user?.avatar} name={user?.name || 'User'} size="sm" />
            <span style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--green)',
              border: '1.5px solid var(--topbar-bg)'
            }} />
          </div>
          <span className="topbar-profile-name" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name?.split(' ')[0] || 'Account'}
          </span>
          <ChevronDown 
            className="topbar-profile-chevron"
            size={13} 
            style={{ 
              color: 'var(--tx-4)', 
              transition: 'transform 0.2s ease', 
              transform: showProfileMenu ? 'rotate(180deg)' : 'rotate(0deg)' 
            }} 
          />
        </button>

        {/* ── User Profile Dropdown Popover ── */}
        {showProfileMenu && createPortal(
          <div className="topbar-profile-popover fade-in-up" style={profilePopoverStyle}>
            {/* Header: User Details */}
            <div className="topbar-profile-header" style={{
              padding: '14px 16px',
              borderRadius: 14,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 8
            }}>
              <Avatar src={user?.avatar} name={user?.name || 'User'} size="md" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || 'User Account'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {user?.email || 'user@welcometech.com'}
                </div>
                <span className="topbar-user-role-badge" style={{
                  display: 'inline-block',
                  marginTop: 6,
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 10.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {(user?.role as any)?.name || user?.role || 'Employee'}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button
                type="button"
                className="topbar-profile-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate('/profile');
                }}
              >
                <div className="topbar-profile-item-icon" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}>
                  <UserIcon size={14} />
                </div>
                <span>My Profile</span>
              </button>

              {canViewSettings && (
                <button
                  type="button"
                  className="topbar-profile-item"
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/settings');
                  }}
                >
                  <div className="topbar-profile-item-icon" style={{ background: 'color-mix(in srgb, var(--teal) 12%, transparent)', color: 'var(--teal)' }}>
                    <Settings size={14} />
                  </div>
                  <span>System Settings</span>
                </button>
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <button
                type="button"
                className="topbar-profile-item topbar-profile-logout"
                onClick={() => {
                  setShowProfileMenu(false);
                  setLogoutConfirmOpen(true);
                }}
              >
                <div className="topbar-profile-item-icon" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
                  <LogOut size={14} />
                </div>
                <span>Log Out</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Confirm Logout"
        message="Are you sure you want to sign out from your WelcomeTech CRM account?"
        variant="warning"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />
    </header>
  );
};

export default Topbar;
