import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Target, Ticket, MoreHorizontal,
  Clock, ShieldCheck, SearchCheck, Cloud, List,
  FileText, UserCog, Settings, LogOut, X, Zap,
  CreditCard, CalendarDays, Shield, ClipboardList,
  Package, UserPlus, Mail, Image as ImageIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getCrmModulesByCountry } from '../../utils/crmCountryModules';
import { ConfirmDialog } from '../ui';
import { hasPermission } from '../../utils/rbac';

const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const country = useThemeStore((s) => s.country);
  const [showMore, setShowMore] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const currentPath = location.pathname.replace(/\/+$/, '') || '/';

  const isActive = (path: string) => {
    const targetPath = path.replace(/\/+$/, '') || '/';
    if (targetPath === '/') return currentPath === '/';
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  };

  const canAccess = (permission?: string) => {
    if (!permission) return true;
    return hasPermission(user, permission);
  };

  const navItems = [
    { label: 'Dash', icon: <LayoutDashboard size={20} />, path: '/dashboard', permission: 'dashboard' },
    { label: 'Customers', icon: <Users size={20} />, path: '/customers', permission: 'customers.list' },
    { label: 'Leads', icon: <Target size={20} />, path: '/leads', permission: 'leads.list' },
    { label: 'Tickets', icon: <Ticket size={20} />, path: '/tickets', permission: 'tickets.list' },
  ].filter((item) => canAccess(item.permission));

  const countryModuleItems = getCrmModulesByCountry(country).map((m) => ({
    label: m.label,
    icon: m.id === 'amc' ? <Clock size={18} /> : m.id === 'tdl' ? <ShieldCheck size={18} /> : m.id === 'tss' ? <SearchCheck size={18} /> : <Cloud size={18} />,
    path: `${m.basePath}/list`,
    permission: `${m.id}.list`,
  })).filter((item) => canAccess(item.permission));

  const customerMoreItems = [
    { label: 'Add Customer', icon: <UserPlus size={18} />, path: '/customers/new', permission: 'customers.add' },
    { label: 'Product List', icon: <Package size={18} />, path: '/customers/product-list', permission: 'customers.productList' },
  ];

  const categoryMoreItems = [
    { label: 'Ticket Category', icon: <Ticket size={18} />, path: '/ticket-categories', permission: 'ticketCategories' },
    { label: 'Products', icon: <Package size={18} />, path: '/products', permission: 'products.list' },
    { label: 'Licence Types', icon: <ShieldCheck size={18} />, path: '/licence-types', permission: 'licenceTypes' },
    { label: 'Customer Types', icon: <Users size={18} />, path: '/customer-types', permission: 'customerTypes' },
    { label: 'Industry', icon: <List size={18} />, path: '/industries', permission: 'industries' },
    { label: 'Business Segment', icon: <List size={18} />, path: '/business-segments', permission: 'businessSegments' },
    { label: 'Industry Type', icon: <List size={18} />, path: '/industry-types', permission: 'industryTypes' },
    { label: 'Lead Sources', icon: <Target size={18} />, path: '/lead-sources', permission: 'leadSources' },
    { label: 'Lead Status', icon: <SearchCheck size={18} />, path: '/lead-statuses', permission: 'leadStatuses' },
    { label: 'Vendor Categories', icon: <List size={18} />, path: '/vendor-categories', permission: 'vendorCategories' },
  ];

  const paymentMoreItems = [
    { label: 'Add Payment', icon: <CreditCard size={18} />, path: '/payments/new', permission: 'payments.add' },
    { label: 'Invoices', icon: <FileText size={18} />, path: '/invoices', permission: 'invoices' },
    { label: 'Payment Records', icon: <CreditCard size={18} />, path: '/payments', permission: 'payments.records' },
    { label: 'Outstanding', icon: <FileText size={18} />, path: '/outstanding', permission: 'outstanding' },
  ];

  const proposalMoreItems = [
    { label: 'Templates', icon: <FileText size={18} />, path: '/proposal-templates', permission: 'proposalTemplates' },
    { label: 'Customer Proposals', icon: <FileText size={18} />, path: '/proposals', permission: 'proposals.list' },
  ];

  const employeeMoreItems = [
    { label: 'Add Employee', icon: <UserCog size={18} />, path: '/employees/new', permission: 'employees.add' },
    { label: 'Employee List', icon: <UserCog size={18} />, path: '/employees', permission: 'employees.list' },
  ];

  const assetMoreItems = [
    { label: 'Email Templates', icon: <Mail size={18} />, path: '/email-templates', permission: 'emailTemplates' },
    { label: 'Media Library', icon: <ImageIcon size={18} />, path: '/media-library', permission: 'mediaLibrary' },
  ];

  const moreItems = [
    // CRM section matching desktop
    ...customerMoreItems, // Add Customer, Product List
    ...countryModuleItems, // AMC, TDL, Cloud, TSS
    { label: 'Tasks', icon: <ClipboardList size={18} />, path: '/tasks', permission: 'tasks.list' },
    ...categoryMoreItems, // Ticket Category, Products, Licence Types, Customer Types, Lead Sources, Lead Status, Vendor Categories

    // Finance section matching desktop
    ...proposalMoreItems, // New Proposal, Templates, All Proposals
    ...paymentMoreItems, // Add Payment, Invoices, Payment Records, Outstanding

    // Team section matching desktop
    ...employeeMoreItems, // Add Employee, Employee List
    { label: 'Calendar', icon: <CalendarDays size={18} />, path: '/calendar', permission: 'calendar' },

    // System section matching desktop
    { label: 'Roles', icon: <Shield size={18} />, path: '/roles', permission: 'roles' },
    { label: 'Admin Users', icon: <UserCog size={18} />, path: '/admin-users', permission: 'adminUsers' },
    ...assetMoreItems, // Email Templates, Media Library
    { label: 'Settings', icon: <Settings size={18} />, path: '/settings', permission: 'settings.general' },
  ].filter((item) => canAccess(item.permission));

  const exactActiveMorePath = moreItems.find((item) => {
    const itemPath = item.path.replace(/\/+$/, '') || '/';
    return itemPath === currentPath;
  })?.path;

  const isMoreItemActive = (path: string) => {
    if (exactActiveMorePath) {
      return (path.replace(/\/+$/, '') || '/') === (exactActiveMorePath.replace(/\/+$/, '') || '/');
    }
    return isActive(path);
  };

  const hasActiveMoreItem = moreItems.some((item) => isMoreItemActive(item.path));

  const handleNav = (path: string) => {
    navigate(path);
    setShowMore(false);
  };

  return (
    <>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`bn-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => handleNav(item.path)}
          >
            <div className="bn-icon">{item.icon}</div>
            <span className="bn-label">{item.label}</span>
          </button>
        ))}
        <button 
          className={`bn-item ${showMore || hasActiveMoreItem ? 'active' : ''}`}
          onClick={() => setShowMore(true)}
        >
          <div className="bn-icon"><MoreHorizontal size={20} /></div>
          <span className="bn-label">More</span>
        </button>
      </nav>

      {/* More Menu Overlay */}
      <div className={`bn-overlay ${showMore ? 'open' : ''}`} onClick={() => setShowMore(false)}>
        <div className="bn-sheet" onClick={e => e.stopPropagation()}>
          <div className="bn-sheet-handle" />
          <div className="bn-sheet-header">
            <div className="bn-sheet-title">
              <Zap size={16} className="text-brand" />
              <span>Menu</span>
            </div>
            <button className="bn-sheet-close" onClick={() => setShowMore(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="bn-sheet-grid">
            {moreItems.map((item) => (
              <button
                key={item.path}
                className={`bn-sheet-item ${isMoreItemActive(item.path) ? 'active' : ''}`}
                onClick={() => handleNav(item.path)}
              >
                <div className="bn-sheet-icon">{item.icon}</div>
                <span className="bn-sheet-label">{item.label}</span>
              </button>
            ))}
            <button
              className="bn-sheet-item text-red"
              onClick={() => {
                setShowMore(false);
                setLogoutConfirmOpen(true);
              }}
            >
              <div className="bn-sheet-icon"><LogOut size={18} /></div>
              <span className="bn-sheet-label">Logout</span>
            </button>
          </div>
        </div>
      </div>

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
    </>
  );
};

export default BottomNav;
