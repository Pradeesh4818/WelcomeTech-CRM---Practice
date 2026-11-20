import React, { useState, useEffect } from 'react';
import { useAppVersion } from './hooks/useAppVersion';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useQuery } from '@tanstack/react-query';
import api from './utils/api';
import { STORAGE_KEYS } from './utils/storageKeys';
import { toAssetUrl } from './utils/helpers';
import { COUNTRY_PHONE_RULES, CountryCode } from './utils/phoneRules';
import { hasPermission } from './utils/rbac';
import { initFCMAndRegisterToken } from './utils/fcmClient';
import { DateFilterProvider } from './context/DateFilterContext';

// ─── Pages ───────────────────────────────────────
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import CustomersPage from './pages/Customers/CustomersPage';
import CustomerFormPage from './pages/Customers/CustomerFormPage';
import ProductListPage from './pages/Customers/ProductListPage';
import {
  CloudDashboardPage,
  CloudListPage,
  TDLDashboardPage,
  TDLListPage,
  TSSDashboardPage,
  TSSListPage,
} from './pages/Customers/CustomerManagementPages';
import CallsPage from './pages/Calls/CallsPage';
import CallFormPage from './pages/Calls/CallFormPage';
import LeadsPage from './pages/Leads/LeadsPage';
import TasksPage from './pages/Tasks/TasksPage';
import { AMCDashboard, AMCListPage } from './pages/AMC/AMCPages';
import { TicketsPage } from './pages/Tickets/TicketsPages';
import ProductsPage from './pages/Products/ProductsPage';
import LicenceTypesPage from './pages/LicenceTypes/LicenceTypesPage';
import CustomerTypesPage from './pages/CustomerTypes/CustomerTypesPage';
import LeadSourcesPage from './pages/LeadSources/LeadSourcesPage';
import LeadStatusesPage from './pages/LeadStatuses/LeadStatusesPage';
import {
  PaymentsPage, PaymentFormPage, OutstandingPage, InvoicesPage
} from './pages/Payments/PaymentsPages';
import {
  ProposalsPage, ProposalFormPage, ProposalTemplatesPage, ProposalTemplateFormPage, EngineersPage, CalendarPage, SettingsPage, RolesPage, EmailTemplatesPage, MediaLibraryPage
} from './pages/Misc/MiscPages';
import QuotationGeneratorPage from './pages/Misc/QuotationGeneratorPage';
import { EmployeeListPage, EmployeeFormPage } from './pages/Employees/EmployeesPage';
import BottomNav from './components/layout/BottomNav';
import AdminUsersPage from './pages/Admin/AdminUsersPage';
import ProfilePage from './pages/Profile/ProfilePage';
import VendorCategoriesPage from './pages/VendorCategories/VendorCategoriesPage';
import TicketCategoriesPage from './pages/TicketCategories/TicketCategoriesPage';
import IndustriesPage from './pages/Industries/IndustriesPage';
import BusinessSegmentsPage from './pages/BusinessSegments/BusinessSegmentsPage';
import IndustryTypesPage from './pages/IndustryTypes/IndustryTypesPage';
import GlobalExportModal from './components/export/GlobalExportModal';

const FALLBACK_TITLE = 'WelcomeTech CRM';

const updateDocumentBranding = (companyName: string, logo: string, country: CountryCode) => {
  const countryLabel = COUNTRY_PHONE_RULES[country]?.label || 'Qatar';
  document.title = `${companyName || FALLBACK_TITLE} — ${countryLabel}`;

  let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  const href = logo ? toAssetUrl(logo) : `${import.meta.env.BASE_URL}favicon.svg`;
  favicon.href = href;
  favicon.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
};

const BrandingSync: React.FC = () => {
  const {
    setTheme,
    setBrandColor,
    setSidebarColor,
    setTopbarColor,
    setNavbarColor,
    setAppFont,
    setTypography,
    setCountry,
    setCompanyName,
    setLogo,
    setProposalWatermark,
    theme,
    brandColor,
    sidebarColor,
    topbarColor,
    navbarColor,
    appFont,
    headingFont,
    contentFont,
    headingFontName,
    headingFontUrl,
    contentFontName,
    contentFontUrl,
    country,
    companyName,
    logo,
    proposalWatermark,
  } = useThemeStore();

  useEffect(() => {
    updateDocumentBranding(companyName, logo, country);
  }, [companyName, logo, country]);

  useQuery({
    queryKey: ['public-branding'],
    queryFn: async () => {
      const res = await api.get('/public/branding');
      const data = res.data.data;
      if (data) {
        const currentUser = useAuthStore.getState().user;
        const hasUserTheme = Boolean(currentUser?.theme || (typeof localStorage !== 'undefined' && localStorage.getItem('wt_user_theme_set')));
        if (!hasUserTheme && data.theme && data.theme !== theme) {
          setTheme(data.theme);
        }
        if (data.brandColor && data.brandColor !== brandColor) setBrandColor(data.brandColor);
        // Always force-apply layout colors so CSS vars stay in sync even if store value matches
        if (data.sidebarColor) setSidebarColor(data.sidebarColor);
        if (data.topbarColor) setTopbarColor(data.topbarColor);
        if (data.navbarColor) setNavbarColor(data.navbarColor);
        if (data.appFont && data.appFont !== appFont) setAppFont(data.appFont);
        if (
          data.headingFont !== headingFont ||
          data.contentFont !== contentFont ||
          (data.headingFontName || '') !== headingFontName ||
          (data.headingFontUrl || '') !== headingFontUrl ||
          (data.contentFontName || '') !== contentFontName ||
          (data.contentFontUrl || '') !== contentFontUrl
        ) {
          setTypography({
            headingFont: data.headingFont || data.appFont,
            contentFont: data.contentFont || data.appFont,
            headingFontName: data.headingFontName || '',
            headingFontUrl: data.headingFontUrl || '',
            contentFontName: data.contentFontName || '',
            contentFontUrl: data.contentFontUrl || '',
          });
        }
        if (data.country && data.country !== country) setCountry(data.country);
        if (data.companyName && data.companyName !== companyName) setCompanyName(data.companyName);
        if ((data.logo || '') !== logo) setLogo(data.logo || '');
        if ((data.proposalWatermark || '') !== proposalWatermark) setProposalWatermark(data.proposalWatermark || '');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return null;
};

// ─── Protected Route ─────────────────────────────
const ProtectedLayout: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 980);

  // Initialize from localStorage or screen width
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.sidebarOpen);
    if (saved !== null) return saved === 'true';
    return window.innerWidth > 980;
  });

  useEffect(() => {
    if (isAuthenticated) {
      void initFCMAndRegisterToken({ promptUser: false });
    }
  }, [isAuthenticated]);


  const {
    setTheme,
    setBrandColor,
    setSidebarColor,
    setTopbarColor,
    setNavbarColor,
    setAppFont,
    setTypography,
    setCountry,
    setCompanyName,
    setLogo,
    setProposalWatermark,
    setProposalSettings,
    theme,
    brandColor,
    sidebarColor,
    topbarColor,
    navbarColor,
    appFont,
    headingFont,
    contentFont,
    headingFontName,
    headingFontUrl,
    contentFontName,
    contentFontUrl,
    country,
    companyName,
    logo,
    proposalWatermark,
  } = useThemeStore();

  // Sync settings from DB
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      const data = res.data.data;
      if (data) {
        const currentUser = useAuthStore.getState().user;
        const hasUserTheme = Boolean(currentUser?.theme || (typeof localStorage !== 'undefined' && localStorage.getItem('wt_user_theme_set')));
        const activeTheme = useThemeStore.getState().theme;
        if (!hasUserTheme && data.theme && data.theme !== activeTheme) {
          setTheme(data.theme);
        }
        if (data.brandColor && data.brandColor !== brandColor) setBrandColor(data.brandColor);
        // Always force-apply layout colors so CSS vars stay in sync even if store value matches
        if (data.sidebarColor) setSidebarColor(data.sidebarColor);
        if (data.topbarColor) setTopbarColor(data.topbarColor);
        if (data.navbarColor) setNavbarColor(data.navbarColor);
        if (data.appFont && data.appFont !== appFont) setAppFont(data.appFont);
        if (
          data.headingFont !== headingFont ||
          data.contentFont !== contentFont ||
          (data.headingFontName || '') !== headingFontName ||
          (data.headingFontUrl || '') !== headingFontUrl ||
          (data.contentFontName || '') !== contentFontName ||
          (data.contentFontUrl || '') !== contentFontUrl
        ) {
          setTypography({
            headingFont: data.headingFont || data.appFont,
            contentFont: data.contentFont || data.appFont,
            headingFontName: data.headingFontName || '',
            headingFontUrl: data.headingFontUrl || '',
            contentFontName: data.contentFontName || '',
            contentFontUrl: data.contentFontUrl || '',
          });
        }
        if (data.country && data.country !== country) setCountry(data.country);
        if (data.companyName && data.companyName !== companyName) setCompanyName(data.companyName);
        if ((data.logo || '') !== logo) setLogo(data.logo || '');
        if ((data.proposalWatermark || '') !== proposalWatermark) setProposalWatermark(data.proposalWatermark || '');
        if (data.proposalNo !== undefined || data.proposalIncludeDate !== undefined) {
          setProposalSettings({
            proposalNo: data.proposalNo,
            proposalIncludeDate: data.proposalIncludeDate,
          });
        }
      }
      return data;
    },
    // Re-fetch periodically so admin branding/settings changes propagate to
    // other logged-in users without a hard reload.
    staleTime: 5 * 60 * 1000,
  });

  // Sync current user role and permissions from DB
  useQuery({
    queryKey: ['auth-me-session'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      const latestUser = res.data?.user;
      if (latestUser) {
        useAuthStore.getState().setUser(latestUser);
        if (latestUser.theme) {
          if (latestUser.theme !== useThemeStore.getState().theme) {
            useThemeStore.getState().setTheme(latestUser.theme);
          }
          try {
            localStorage.setItem('wt_user_theme_set', 'true');
            localStorage.setItem('wt_theme', latestUser.theme);
          } catch { }
        }
      }
      return latestUser;
    },
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 980;
      setIsMobile(nextIsMobile);
      setSidebarOpen((prev) => {
        if (nextIsMobile) return false;
        const saved = localStorage.getItem(STORAGE_KEYS.sidebarOpen);
        if (saved !== null) return saved === 'true';
        return prev;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      if (!isMobile) {
        localStorage.setItem(STORAGE_KEYS.sidebarOpen, String(next));
      }
      return next;
    });
  };

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className={`app-shell ${!isMobile && !sidebarOpen ? 'sidebar-closed' : ''}`}>
      {!isMobile && (
        <Sidebar mobileOpen={false} onMobileClose={() => setSidebarOpen(false)} isCollapsed={!sidebarOpen} />
      )}
      <div className="main-area">
        <Topbar onMenuClick={toggleSidebar} showMenuButton={!isMobile} />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

const ProtectedPage: React.FC<{ permission: string; children: React.ReactElement }> = ({ permission, children }) => {
  const { user } = useAuthStore();
  return hasPermission(user, permission) ? children : <Navigate to="/dashboard" replace />;
};

// ─── Scroll To Top ───────────────────────────────
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const mainArea = document.querySelector('.main-area');
    if (mainArea) mainArea.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const pageContent = document.querySelector('.page-content');
    if (pageContent) pageContent.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
};

const ResponsiveTableCards = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    let rafId = 0;

    const annotateTables = () => {
      const isMobileTablet = window.innerWidth <= 980;

      document.querySelectorAll<HTMLTableElement>('.tbl-wrap table').forEach((table) => {
        const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'))
          .map((th) => th.textContent?.replace(/\s+/g, ' ').trim() || '');

        if (headers.length === 0) return;

        if (isMobileTablet) {
          table.classList.add('responsive-card-table');
        } else {
          table.classList.remove('responsive-card-table');
        }

        table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
          Array.from(row.cells).forEach((cell) => {
            if (cell.colSpan > 1) {
              if (isMobileTablet) {
                cell.dataset.cardFull = 'true';
              } else {
                cell.removeAttribute('data-card-full');
              }
              cell.removeAttribute('data-label');
              return;
            }

            const label = headers[cell.cellIndex] || '';
            if (label && isMobileTablet) {
              cell.setAttribute('data-label', label);
            } else {
              cell.removeAttribute('data-label');
            }
            cell.removeAttribute('data-card-full');
          });
        });
      });
    };

    const scheduleAnnotate = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(annotateTables);
    };

    scheduleAnnotate();

    const observer = new MutationObserver(scheduleAnnotate);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', scheduleAnnotate);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleAnnotate);
    };
  }, [pathname]);

  return null;
};

const PrivacyPolicyPage: React.FC = () => (
  <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif', color: '#1f2937', lineHeight: 1.6 }}>
    <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>Privacy Policy</h1>
    <p style={{ marginBottom: '12px' }}>WelcomeTech CRM ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how your personal information is collected, used, and disclosed by WelcomeTech CRM.</p>
    <h2 style={{ fontSize: '20px', fontWeight: '600', marginTop: '20px', marginBottom: '8px' }}>1. Information We Collect</h2>
    <p style={{ marginBottom: '12px' }}>We collect information you provide directly to us when using our CRM services, including contact information, support tickets, and customer communications via Meta WhatsApp Business API.</p>
    <h2 style={{ fontSize: '20px', fontWeight: '600', marginTop: '20px', marginBottom: '8px' }}>2. Use of Information</h2>
    <p style={{ marginBottom: '12px' }}>We use collected information solely for operating our CRM platform, managing customer requests, sending notification reminders, and delivering customer service.</p>
    <h2 style={{ fontSize: '20px', fontWeight: '600', marginTop: '20px', marginBottom: '8px' }}>3. Contact Us</h2>
    <p style={{ marginBottom: '12px' }}>If you have any questions about this Privacy Policy, please contact us at <strong>welcometechtrade@gmail.com</strong>.</p>
  </div>
);

// ─── App ─────────────────────────────────────────
const App: React.FC = () => {
  useAppVersion(); // Auto-detects new deployments and prompts users to refresh

  useEffect(() => {
    const timer = setTimeout(() => {
      document.body.classList.remove('preload');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <DateFilterProvider>
      <BrandingSync />
      <ScrollToTop />
      <ResponsiveTableCards />
      <GlobalExportModal />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--tx-1)',
            border: '1px solid var(--border)',
            fontSize: 13,
            boxShadow: 'var(--sh-md)',
          },
          success: { iconTheme: { primary: 'var(--green)', secondary: '#fff' } },
          error: { iconTheme: { primary: 'var(--red)', secondary: '#fff' } },
        }}
      />
      <Routes>
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Customers */}
          <Route path="/customers" element={<ProtectedPage permission="customers.list"><CustomersPage /></ProtectedPage>} />
          <Route path="/customers/product-list" element={<ProtectedPage permission="customers.productList"><ProductListPage /></ProtectedPage>} />
          <Route path="/customers/new" element={<ProtectedPage permission="customers.add"><CustomerFormPage /></ProtectedPage>} />
          <Route path="/customers/:id/edit" element={<ProtectedPage permission="customers.add"><CustomerFormPage /></ProtectedPage>} />
          <Route path="/tdl" element={<ProtectedPage permission="tdl.dashboard"><TDLDashboardPage /></ProtectedPage>} />
          <Route path="/tdl/list" element={<ProtectedPage permission="tdl.list"><TDLListPage /></ProtectedPage>} />
          <Route path="/cloud" element={<ProtectedPage permission="cloud.dashboard"><CloudDashboardPage /></ProtectedPage>} />
          <Route path="/cloud/list" element={<ProtectedPage permission="cloud.list"><CloudListPage /></ProtectedPage>} />
          <Route path="/tss" element={<ProtectedPage permission="tss.dashboard"><TSSDashboardPage /></ProtectedPage>} />
          <Route path="/tss/list" element={<ProtectedPage permission="tss.list"><TSSListPage /></ProtectedPage>} />
          <Route path="/leads" element={<ProtectedPage permission="leads.list"><LeadsPage /></ProtectedPage>} />
          <Route path="/tasks" element={<ProtectedPage permission="tasks.list"><TasksPage /></ProtectedPage>} />

          {/* Calls */}
          <Route path="/calls" element={<ProtectedPage permission="calls.list"><CallsPage /></ProtectedPage>} />
          <Route path="/calls/new" element={<ProtectedPage permission="calls.add"><CallFormPage /></ProtectedPage>} />

          {/* Products */}
          <Route path="/products" element={<ProtectedPage permission="products.list"><ProductsPage /></ProtectedPage>} />
          <Route path="/licence-types" element={<ProtectedPage permission="licenceTypes"><LicenceTypesPage /></ProtectedPage>} />
          <Route path="/customer-types" element={<ProtectedPage permission="customerTypes"><CustomerTypesPage /></ProtectedPage>} />
          <Route path="/industries" element={<ProtectedPage permission="industries"><IndustriesPage /></ProtectedPage>} />
          <Route path="/business-segments" element={<ProtectedPage permission="businessSegments"><BusinessSegmentsPage /></ProtectedPage>} />
          <Route path="/industry-types" element={<ProtectedPage permission="industryTypes"><IndustryTypesPage /></ProtectedPage>} />
          <Route path="/lead-sources" element={<ProtectedPage permission="leadSources"><LeadSourcesPage /></ProtectedPage>} />
          <Route path="/lead-statuses" element={<ProtectedPage permission="leadStatuses"><LeadStatusesPage /></ProtectedPage>} />
          <Route path="/vendor-categories" element={<ProtectedPage permission="vendorCategories"><VendorCategoriesPage /></ProtectedPage>} />
          <Route path="/ticket-categories" element={<ProtectedPage permission="ticketCategories"><TicketCategoriesPage /></ProtectedPage>} />

          {/* AMC */}
          <Route path="/amc" element={<ProtectedPage permission="amc.dashboard"><AMCDashboard /></ProtectedPage>} />
          <Route path="/amc/list" element={<ProtectedPage permission="amc.list"><AMCListPage /></ProtectedPage>} />

          {/* Tickets */}
          <Route path="/tickets" element={<ProtectedPage permission="tickets.list"><TicketsPage /></ProtectedPage>} />
          <Route path="/tickets/new" element={<ProtectedPage permission="tickets.add"><Navigate to="/tickets?new=1" replace /></ProtectedPage>} />

          {/* Payments */}
          <Route path="/payments" element={<ProtectedPage permission="payments.records"><PaymentsPage /></ProtectedPage>} />
          <Route path="/payments/new" element={<ProtectedPage permission="payments.add"><PaymentFormPage /></ProtectedPage>} />
          <Route path="/invoices" element={<ProtectedPage permission="invoices"><InvoicesPage /></ProtectedPage>} />
          <Route path="/outstanding" element={<ProtectedPage permission="outstanding"><OutstandingPage /></ProtectedPage>} />

          {/* Proposals */}
          <Route path="/proposals" element={<ProtectedPage permission="proposals.list"><ProposalsPage /></ProtectedPage>} />
          <Route path="/proposals/new" element={<ProtectedPage permission="proposals.list"><QuotationGeneratorPage /></ProtectedPage>} />
          <Route path="/proposals/:id/edit" element={<ProtectedPage permission="proposals.list"><QuotationGeneratorPage /></ProtectedPage>} />
          <Route path="/quotation-generator" element={<ProtectedPage permission="proposals.list"><QuotationGeneratorPage /></ProtectedPage>} />
          <Route path="/proposal-templates" element={<ProtectedPage permission="proposalTemplates"><ProposalTemplatesPage /></ProtectedPage>} />
          <Route path="/proposal-templates/new" element={<ProtectedPage permission="proposalTemplates"><QuotationGeneratorPage /></ProtectedPage>} />
          <Route path="/proposal-templates/:id/edit" element={<ProtectedPage permission="proposalTemplates"><QuotationGeneratorPage /></ProtectedPage>} />

          {/* Employees */}
          <Route path="/employees" element={<ProtectedPage permission="employees.list"><EmployeeListPage /></ProtectedPage>} />
          <Route path="/employees/new" element={<ProtectedPage permission="employees.add"><EmployeeFormPage /></ProtectedPage>} />
          <Route path="/employees/:id/edit" element={<ProtectedPage permission="employees.add"><EmployeeFormPage /></ProtectedPage>} />
          <Route path="/admin-users" element={<ProtectedPage permission="adminUsers"><AdminUsersPage /></ProtectedPage>} />

          {/* Other */}
          <Route path="/engineers" element={<ProtectedPage permission="engineers"><EngineersPage /></ProtectedPage>} />
          <Route path="/calendar" element={<ProtectedPage permission="calendar"><CalendarPage /></ProtectedPage>} />
          <Route path="/settings" element={<ProtectedPage permission="settings.general"><SettingsPage /></ProtectedPage>} />
          <Route path="/email-templates" element={<ProtectedPage permission="emailTemplates"><EmailTemplatesPage /></ProtectedPage>} />
          <Route path="/media-library" element={<ProtectedPage permission="mediaLibrary"><MediaLibraryPage /></ProtectedPage>} />
          <Route path="/roles" element={<ProtectedPage permission="roles"><RolesPage /></ProtectedPage>} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </DateFilterProvider>
  );
};

export default App;
