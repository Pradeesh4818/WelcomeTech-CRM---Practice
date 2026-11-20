import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShieldCheck, Ticket,
  CreditCard, FileText, UserCog, CalendarDays,
  ChevronRight, Settings, Shield, Target, List, Cloud, SearchCheck, Clock, ClipboardList,
  Mail, Image as ImageIcon, Package, UserPlus, Building2, Briefcase, Boxes,
  Receipt, PlusCircle, UserCheck, FileSpreadsheet, LogOut
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Avatar, ConfirmDialog } from '../ui';
import { useThemeStore } from '../../store/themeStore';
import { getCrmModulesByCountry } from '../../utils/crmCountryModules';
import { toAssetUrl } from '../../utils/helpers';
import { hasPermission } from '../../utils/rbac';

interface NavChildItem {
  id: string;
  label: string;
  path: string;
  permission?: string;
  icon?: React.ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string;
  section?: string;
  children?: NavChildItem[];
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  MAIN: <LayoutDashboard size={12} />,
  CRM: <Target size={12} />,
  FINANCE: <CreditCard size={12} />,
  TEAM: <Briefcase size={12} />,
  SYSTEM: <Shield size={12} />,
};

const BASE_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/dashboard', permission: 'dashboard', section: 'MAIN' },
  { id: 'add-customer', label: 'Add Customer', icon: <UserPlus size={18} />, path: '/customers/new', permission: 'customers.add', section: 'CRM' },
  { id: 'customers', label: 'Customer List', icon: <Users size={18} />, path: '/customers', permission: 'customers.list', section: 'CRM' },
  { id: 'product-list', label: 'Product List', icon: <Package size={18} />, path: '/customers/product-list', permission: 'customers.productList', section: 'CRM' },
  { id: 'leads', label: 'Leads', icon: <Target size={18} />, path: '/leads', permission: 'leads.list', section: 'CRM' },
  { id: 'tasks', label: 'Tasks', icon: <ClipboardList size={18} />, path: '/tasks', permission: 'tasks.list', section: 'CRM' },
  { id: 'tickets', label: 'Tickets', icon: <Ticket size={18} />, path: '/tickets', permission: 'tickets.list', section: 'CRM' },
  {
    id: 'proposals', label: 'Proposals', icon: <FileText size={18} />, section: 'FINANCE',
    children: [
      { id: 'prop-templates', label: 'Proposal Templates', path: '/proposal-templates', permission: 'proposalTemplates', icon: <FileSpreadsheet size={14} /> },
      { id: 'prop-list', label: 'Customer Proposals', path: '/proposals', permission: 'proposals.list', icon: <FileText size={14} /> },
      { id: 'email-templates', label: 'Email Templates', path: '/email-templates', permission: 'emailTemplates', icon: <Mail size={14} /> },
      { id: 'media-library', label: 'Media Library', path: '/media-library', permission: 'mediaLibrary', icon: <ImageIcon size={14} /> },
    ],
  },
  {
    id: 'payments', label: 'Payments', icon: <CreditCard size={18} />, section: 'FINANCE',
    children: [
      { id: 'pay-add', label: 'Add Payment', path: '/payments/new', permission: 'payments.add', icon: <PlusCircle size={14} /> },
      { id: 'pay-invoices', label: 'Invoices', path: '/invoices', permission: 'invoices', icon: <Receipt size={14} /> },
      { id: 'pay-list', label: 'Payment Records', path: '/payments', permission: 'payments.records', icon: <CreditCard size={14} /> },
      { id: 'pay-outstanding', label: 'Outstanding', path: '/outstanding', permission: 'outstanding', icon: <Clock size={14} /> },
    ],
  },
  { id: 'employees', label: 'Employees', icon: <UserCog size={18} />, path: '/employees', permission: 'employees.list', section: 'TEAM' },
  { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} />, path: '/calendar', permission: 'calendar', section: 'TEAM' },
  {
    id: 'categories', label: 'Masters', icon: <List size={18} />, section: 'SYSTEM',
    children: [
      { id: 'ticket-categories', label: 'Ticket Category', path: '/ticket-categories', permission: 'ticketCategories', icon: <Ticket size={14} /> },
      { id: 'products', label: 'Products', path: '/products', permission: 'products.list', icon: <Package size={14} /> },
      { id: 'licence-types', label: 'Licence Types', path: '/licence-types', permission: 'licenceTypes', icon: <ShieldCheck size={14} /> },
      { id: 'customer-types', label: 'Customer Types', path: '/customer-types', permission: 'customerTypes', icon: <Users size={14} /> },
      { id: 'industries', label: 'Industry', path: '/industries', permission: 'industries', icon: <Building2 size={14} /> },
      { id: 'business-segments', label: 'Business Segment', path: '/business-segments', permission: 'businessSegments', icon: <Briefcase size={14} /> },
      { id: 'industry-types', label: 'Industry Type', path: '/industry-types', permission: 'industryTypes', icon: <Boxes size={14} /> },
      { id: 'lead-sources', label: 'Lead Sources', path: '/lead-sources', permission: 'leadSources', icon: <Target size={14} /> },
      { id: 'lead-statuses', label: 'Lead Status', path: '/lead-statuses', permission: 'leadStatuses', icon: <ShieldCheck size={14} /> },
      { id: 'vendor-categories', label: 'Vendor Categories', path: '/vendor-categories', permission: 'vendorCategories', icon: <UserCheck size={14} /> },
    ],
  },
  { id: 'roles', label: 'Roles', icon: <Shield size={18} />, path: '/roles', permission: 'roles', section: 'SYSTEM' },
  { id: 'admin-users', label: 'Admin Users', icon: <UserCog size={18} />, path: '/admin-users', permission: 'adminUsers', section: 'SYSTEM' },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} />, path: '/settings', permission: 'settings.general', section: 'SYSTEM' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  isCollapsed?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose, isCollapsed: propCollapsed }) => {
  const { user, logout } = useAuthStore();
  const country = useThemeStore((s) => s.country);
  const logo = useThemeStore((s) => s.logo);
  const companyName = useThemeStore((s) => s.companyName);
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = React.useRef<HTMLElement | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Sync with DOM .app-shell.sidebar-closed class
  const [isShellCollapsed, setIsShellCollapsed] = useState(false);
  React.useEffect(() => {
    const checkShell = () => {
      const isClosed = document.querySelector('.app-shell')?.classList.contains('sidebar-closed') ?? false;
      setIsShellCollapsed(isClosed);
    };
    checkShell();
    const observer = new MutationObserver(checkShell);
    const shellEl = document.querySelector('.app-shell');
    if (shellEl) {
      observer.observe(shellEl, { attributes: true, attributeFilter: ['class'] });
    }
    return () => observer.disconnect();
  }, []);

  const isCollapsed = propCollapsed !== undefined ? propCollapsed : isShellCollapsed;

  // Hover flyout state for collapsed sidebar
  const [hoveredMenu, setHoveredMenu] = useState<{
    item: NavItem;
    top: number;
    left: number;
  } | null>(null);
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close flyout on scroll or navigation or expand
  React.useEffect(() => {
    const handleScroll = () => {
      if (hoveredMenu) setHoveredMenu(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [hoveredMenu]);

  React.useEffect(() => {
    setHoveredMenu(null);
  }, [location.pathname, isCollapsed]);

  // Synchronously compute initial openMenu so submenus open on frame 0 without layout shift
  const [openMenu, setOpenMenu] = useState<string | null>(() => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const matchPath = (path: string) =>
      currentPath === path || (path !== '/' && currentPath.startsWith(`${path}/`));

    for (const item of BASE_NAV) {
      if (item.children?.some((c) => matchPath(c.path))) {
        return item.id;
      }
    }
    return null;
  });

  React.useEffect(() => {
    setLogoLoadError(false);
  }, [logo]);

  const logoUrl = !logoLoadError && logo ? toAssetUrl(logo) : '';

  const countryModules = React.useMemo(
    () =>
      getCrmModulesByCountry(country).map((m) => {
        const icon =
          m.id === 'amc' ? <Clock size={18} /> :
            m.id === 'tdl' ? <ShieldCheck size={18} /> :
              m.id === 'tss' ? <SearchCheck size={18} /> :
                <Cloud size={18} />;
        return {
          id: m.id,
          label: m.label,
          icon,
          section: 'CRM',
          path: `${m.basePath}/list`,
          permission: `${m.id}.list`,
        } as NavItem;
      }),
    [country]
  );

  const canAccess = React.useCallback((permission?: string) => {
    if (!permission) return true;
    return hasPermission(user, permission);
  }, [user]);

  const filterNav = React.useCallback((items: NavItem[]) =>
    items
      .map((item) => {
        const children = item.children?.filter((child) => canAccess(child.permission));
        if (item.children) {
          return children?.length ? { ...item, children } : null;
        }
        return canAccess(item.permission) ? item : null;
      })
      .filter(Boolean) as NavItem[],
  [canAccess]);

  const NAV = React.useMemo(() => {
    const customersIndex = BASE_NAV.findIndex((i) => i.id === 'customers');
    if (customersIndex < 0) return filterNav([...BASE_NAV, ...countryModules]);
    const head = BASE_NAV.slice(0, customersIndex + 2);
    const tail = BASE_NAV.slice(customersIndex + 2);
    return filterNav([...head, ...countryModules, ...tail]);
  }, [countryModules, filterNav]);

  const NAV_GROUPS = React.useMemo(
    () =>
      NAV.reduce<NavGroup[]>((acc, item) => {
        const section = item.section || acc[acc.length - 1]?.section || 'MAIN';
        const last = acc[acc.length - 1];
        if (!last || last.section !== section) {
          acc.push({ section, items: [item] });
        } else {
          last.items.push(item);
        }
        return acc;
      }, []),
    [NAV]
  );

  React.useEffect(() => {
    const matchPath = (path: string) =>
      location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));

    // 1. Check if the current route is a direct top-level item
    const topLevelMatch = NAV.find(item => item.path && matchPath(item.path));
    
    // 2. Find if the current route is a child of a menu group
    const menuGroupMatch = NAV.find((item) => item.children?.some((c) => matchPath(c.path)));

    // Only auto-open the menu group if we're actually on a child route 
    // and NOT on a route that belongs to a different top-level item
    if (menuGroupMatch?.id) {
      if (topLevelMatch && topLevelMatch.id !== menuGroupMatch.id) {
        setOpenMenu(null);
        return;
      }
      setOpenMenu(menuGroupMatch.id);
    } else {
      setOpenMenu(null);
    }
  }, [location.pathname, NAV]);

  const toggleMenu = (id: string) => {
    setOpenMenu((prev) => (prev === id ? null : id));
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    if (location.pathname === path) return true;

    // Special cases: quotation generator alias
    if (location.pathname.startsWith('/quotation-generator')) {
      if (path === '/proposal-templates' && (location.search.includes('template') || location.pathname.includes('template'))) return true;
      if (path === '/proposals') return true;
    }
    
    // Check if this is the best prefix match (no other item has a longer matching path)
    if (location.pathname.startsWith(`${path}/`)) {
      const isBestMatch = !NAV.some(item => {
        if (item.path && item.path !== path && location.pathname.startsWith(item.path) && item.path.length > path.length) return true;
        return item.children?.some(c => c.path !== path && location.pathname.startsWith(c.path) && c.path.length > path.length);
      });
      return isBestMatch;
    }
    return false;
  };

  const isChildActive = (children?: { path: string }[]) =>
    children?.some((c) => isActive(c.path));

  // Maintain sidebar scroll position across refreshes and ensure active item is visible
  React.useEffect(() => {
    const savedScroll = sessionStorage.getItem('wt_sidebar_scroll');
    if (navRef.current && savedScroll !== null) {
      navRef.current.scrollTop = Number(savedScroll);
    }

    const timer = setTimeout(() => {
      if (!navRef.current) return;
      const activeEl = navRef.current.querySelector('.sb-sub-item.active, .sb-nav-item.active, .sb-nav-item.has-active-child') as HTMLElement | null;
      if (activeEl) {
        const navRect = navRef.current.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        if (elRect.top < navRect.top || elRect.bottom > navRect.bottom) {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleNavScroll = (e: React.UIEvent<HTMLElement>) => {
    sessionStorage.setItem('wt_sidebar_scroll', String(e.currentTarget.scrollTop));
  };

  const handleNav = (path: string) => {
    navigate(path);
    if (window.innerWidth <= 980) {
      onMobileClose();
    }
  };

  return (
    <>
      <div className={`sb-overlay ${mobileOpen ? 'open' : ''}`} onClick={onMobileClose} />

      <aside className={`sidebar sidebar-v2 ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sb-top-panel">
          <div className="sb-brand-row" onClick={() => handleNav('/dashboard')} style={{ cursor: 'pointer' }}>
            <div className={`sb-logo-mark ${logoUrl ? 'has-logo' : ''}`} title={companyName || 'WelcomeTech CRM'}>
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={`${companyName || 'WelcomeTech CRM'} logo`} 
                  onError={() => setLogoLoadError(true)} 
                />
              ) : (
                <span className="sb-logo-initial" style={{ fontWeight: 800, fontSize: 16 }}>
                  {(companyName || 'WelcomeTech')[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="sb-brand-text">
              <div className="sb-brand-name" style={{ whiteSpace: 'normal', lineHeight: 1.25, fontSize: companyName && companyName.length > 20 ? '11.5px' : '13px' }}>{companyName || 'WelcomeTech'}</div>
            </div>
          </div>
        </div>

        <nav className="sb-nav-wrap" ref={navRef} onScroll={handleNavScroll}>
          {NAV_GROUPS.map((group) => (
            <section key={group.section} className="sb-nav-group">
              <div className="sb-nav-group-head">
                {SECTION_ICONS[group.section] && (
                  <span className="sb-nav-group-icon">{SECTION_ICONS[group.section]}</span>
                )}
                <span>{group.section}</span>
              </div>
              <div className="sb-nav-group-body">
                {group.items.map((item) => {
                  const isChildActiveState = Boolean(item.children && isChildActive(item.children));
                  const active = item.path ? isActive(item.path) : isChildActiveState;
                  const isClosed = Boolean(
                    isCollapsed ||
                    (typeof document !== 'undefined' && document.querySelector('.app-shell')?.classList.contains('sidebar-closed'))
                  );
                  const isOpen = !isClosed && Boolean(item.children && openMenu === item.id);
                  const hasChildren = Boolean(item.children && item.children.length > 0);
                  const isHovered = hoveredMenu?.item.id === item.id;

                  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
                    const isClosed = Boolean(
                      isCollapsed ||
                      (typeof document !== 'undefined' && document.querySelector('.app-shell')?.classList.contains('sidebar-closed'))
                    );
                    if (!isClosed) return;
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                      hoverTimeoutRef.current = null;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (hasChildren) {
                      const estimatedHeight = 55 + (item.children?.length || 0) * 38;
                      const maxTop = window.innerHeight - estimatedHeight - 16;
                      const calculatedTop = Math.max(12, Math.min(rect.top, maxTop));

                      setHoveredMenu({
                        item,
                        top: calculatedTop,
                        left: rect.right + 6,
                      });
                    } else {
                      const tooltipHeight = 36;
                      const calculatedTop = Math.max(12, Math.min(rect.top + (rect.height - tooltipHeight) / 2, window.innerHeight - tooltipHeight - 12));

                      setHoveredMenu({
                        item,
                        top: calculatedTop,
                        left: rect.right + 8,
                      });
                    }
                  };

                  const handleMouseLeave = () => {
                    const isClosed = Boolean(
                      isCollapsed ||
                      (typeof document !== 'undefined' && document.querySelector('.app-shell')?.classList.contains('sidebar-closed'))
                    );
                    if (!isClosed) return;
                    hoverTimeoutRef.current = setTimeout(() => {
                      setHoveredMenu(null);
                    }, 140);
                  };

                  return (
                    <React.Fragment key={item.id}>
                      <button
                        type="button"
                        className={`sb-nav-item ${active ? 'active' : ''} ${isChildActiveState ? 'has-active-child' : ''} ${isOpen ? 'menu-open' : ''} ${isHovered ? 'hovered' : ''}`}
                        onClick={() => {
                          if (isCollapsed && hasChildren) return;
                          setHoveredMenu(null);
                          item.path ? handleNav(item.path) : toggleMenu(item.id);
                        }}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        title={isClosed ? '' : item.label}
                      >
                        <span className="sb-nav-icon">{item.icon}</span>
                        <span className="sb-nav-label">{item.label}</span>
                        {item.children && (
                          <ChevronRight
                            size={16}
                            className="sb-nav-caret"
                            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          />
                        )}
                      </button>

                      {item.children && (
                        <div className={`sb-sub-menu ${isOpen ? 'open' : ''}`}>
                          {item.children.map((child) => {
                            const isChildCurrent = isActive(child.path);
                            return (
                              <button
                                type="button"
                                key={child.id}
                                className={`sb-sub-item ${isChildCurrent ? 'active' : ''}`}
                                onClick={() => handleNav(child.path)}
                                title={child.label}
                              >
                                <span className="sb-sub-icon">{child.icon || <FileText size={14} />}</span>
                                <span className="sb-sub-label">{child.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="sb-footer-v2">
          <div className="sb-user-card sb-user-card-v2" title={user?.name ? `${user.name} (${user.role})` : 'User Profile'}>
            <div
              className="sb-user-card-main"
              onClick={() => handleNav('/profile')}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <Avatar name={user?.name || 'User'} size="sm" />
              <div className="sb-user-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-user-name">{user?.name}</div>
                <div className="sb-user-role">{user?.role}</div>
              </div>
            </div>

            <button 
              className="sb-logout-icon-btn" 
              onClick={(e) => {
                e.stopPropagation();
                setLogoutConfirmOpen(true);
              }} 
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Confirm Logout"
        message="Are you sure you want to logout from your account?"
        variant="warning"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          logout();
        }}
      />

      {hoveredMenu && typeof document !== 'undefined' && createPortal(
        hoveredMenu.item.children && hoveredMenu.item.children.length > 0 ? (
          <div
            className="sb-flyout-menu"
            style={{
              top: hoveredMenu.top,
              left: hoveredMenu.left,
            }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredMenu(null);
              }, 140);
            }}
          >
            <div className="sb-flyout-header">
              <span className="sb-flyout-title">{hoveredMenu.item.label}</span>
            </div>
            <div className="sb-flyout-body">
              {hoveredMenu.item.children.map((child) => {
                const isChildCurrent = isActive(child.path);
                return (
                  <button
                    type="button"
                    key={child.id}
                    className={`sb-flyout-item ${isChildCurrent ? 'active' : ''}`}
                    onClick={() => {
                      setHoveredMenu(null);
                      handleNav(child.path);
                    }}
                    title={child.label}
                  >
                    <span className="sb-flyout-item-icon">{child.icon || <FileText size={14} />}</span>
                    <span className="sb-flyout-item-label">{child.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="sb-flyout-tooltip"
            style={{
              top: hoveredMenu.top,
              left: hoveredMenu.left,
            }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredMenu(null);
              }, 140);
            }}
            onClick={() => {
              if (hoveredMenu.item.path) {
                handleNav(hoveredMenu.item.path);
                setHoveredMenu(null);
              }
            }}
          >
            <span className="sb-flyout-tooltip-icon">{hoveredMenu.item.icon}</span>
            <span className="sb-flyout-tooltip-label">{hoveredMenu.item.label}</span>
          </div>
        ),
        document.body
      )}
    </>
  );
};

export default Sidebar;
