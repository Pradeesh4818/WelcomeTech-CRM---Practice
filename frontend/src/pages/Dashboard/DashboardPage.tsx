import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, TrendingUp, Ticket, 
  SearchCheck, Cloud, AlertTriangle, 
  ChevronRight, UserPlus, ArrowUpRight,
  Target, ClipboardList, CheckCircle2,
  WalletCards, ShieldCheck, RefreshCw,
  Clock, CheckSquare, Search,
  Mail, FileText, Phone, ExternalLink,
  Layers, Send, Eye, Filter, Sparkles,
  CalendarClock, AlertCircle, User, Calendar, Hash,
  ArrowRight, Activity, DollarSign, Zap, BarChart3,
  Flame, ShieldAlert, PhoneCall, Check, UserCheck
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar 
} from 'recharts';
import api from '../../utils/api';
import { useAuthStore } from '../../store/authStore';
import { DashboardData, Customer } from '../../types';
import { fmt, getActiveCurrency } from '../../utils/helpers';
import { hasPermission, isUserAdmin } from '../../utils/rbac';
import { useDateFilter } from '../../context/DateFilterContext';

interface ServiceRiskRow {
  customer: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    contactPerson?: string;
    contact?: string;
    serialNoInfo?: any;
    products?: string[];
    amcPlan?: string;
    amcExpiry?: string;
    [key: string]: any;
  };
  days: number;
}

interface ServiceInsights {
  tss: { kpi: any; rows: ServiceRiskRow[] };
  cloud: { kpi: any; rows: ServiceRiskRow[] };
  tdl: { kpi: any; rows: ServiceRiskRow[] };
  alerts: Array<{ customer: Customer; days: number | null }>;
  amcTotal: number;
}

const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const userRole = (typeof user?.role === 'string' ? user.role : (user?.role as any)?.name || '').toLowerCase();
  const isAdmin = isUserAdmin(user) || hasPermission(user, 'employees.list');

  // ── Permissions Flags ─────────────────────────────────────
  const canViewCustomers = hasPermission(user, 'customers');
  const canAddCustomer = hasPermission(user, 'customers.add') || hasPermission(user, 'customers');
  const canViewLeads = hasPermission(user, 'leads');
  const canAddLead = hasPermission(user, 'leads.list') || hasPermission(user, 'leads');
  const canViewTasks = hasPermission(user, 'tasks');
  const canAddTask = isAdmin;
  const canViewTickets = hasPermission(user, 'tickets');
  const canAddTicket = hasPermission(user, 'tickets.add') || hasPermission(user, 'tickets');
  const canViewPayments = hasPermission(user, 'payments') || hasPermission(user, 'invoices') || hasPermission(user, 'outstanding');
  const canViewTSS = hasPermission(user, 'tss.dashboard') || hasPermission(user, 'tss.list') || hasPermission(user, 'amc');
  const canViewCloud = hasPermission(user, 'cloud.dashboard') || hasPermission(user, 'cloud.list') || hasPermission(user, 'amc');
  const canViewAMC = hasPermission(user, 'amc.dashboard') || hasPermission(user, 'amc.list') || hasPermission(user, 'amc');

  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const dateQueryParam = isFiltered && startDate && endDate && filterType !== 'all' ? { startDate, endDate } : {};
  const dateKey = isFiltered ? `${startDate}_${endDate}` : 'all';

  // ── Core Dashboard Stats ──────────────────────────────────
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard', dateKey],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DashboardData }>('/dashboard', { params: dateQueryParam });
      return res.data.data;
    },
    staleTime: 60000,
  });

  // ── TSS & Cloud Service Details ───────────────────────────
  const { data: serviceInsights } = useQuery({
    queryKey: ['dashboard-service-details', dateKey],
    queryFn: async (): Promise<ServiceInsights> => {
      const customerRes = await api.get('/customers/management-insights', { params: dateQueryParam });
      const customerDash = customerRes.data?.data || {};
      const amcExpiring = customerDash.customerDashboard?.totalExpiring || 0;
      const amcOverdue  = customerDash.customerDashboard?.totalOverdue  || 0;
      return {
        tss: {
          kpi: customerDash.tssDashboard?.kpi || {},
          rows: (customerDash.tssDashboard?.radarRows || []) as ServiceRiskRow[],
        },
        cloud: {
          kpi: customerDash.cloudDashboard?.kpi || {},
          rows: (customerDash.cloudDashboard?.radarRows || []) as ServiceRiskRow[],
        },
        tdl: {
          kpi: customerDash.tdlDashboard?.kpi || {},
          rows: (customerDash.tdlDashboard?.radarRows || []) as ServiceRiskRow[],
        },
        alerts: (customerDash.customerDashboard?.alertRows || []) as any[],
        amcTotal: amcExpiring + amcOverdue,
      };
    },
    enabled: canViewTSS || canViewCloud || canViewAMC,
    staleTime: 60000,
  });

  // ── Leads Stats ──────────────────────────────────────────
  const { data: leadDashData } = useQuery({
    queryKey: ['lead-dashboard', dateKey],
    queryFn: async () => {
      const res = await api.get('/leads/dashboard', { params: dateQueryParam });
      return res.data?.data;
    },
    enabled: canViewLeads,
    staleTime: 60000,
  });

  // ── Tasks Stats ──────────────────────────────────────────
  const { data: taskDashData } = useQuery({
    queryKey: ['task-dashboard', dateKey],
    queryFn: async () => {
      const res = await api.get('/tasks/dashboard', { params: dateQueryParam });
      return res.data?.data;
    },
    enabled: canViewTasks,
    staleTime: 60000,
  });

  // ── Tickets List ─────────────────────────────────────────
  const { data: ticketsList = [] } = useQuery({
    queryKey: ['dashboard-tickets', dateKey],
    queryFn: async () => {
      const res = await api.get('/tickets', { params: { limit: 6, ...dateQueryParam } });
      return (res.data?.data || []) as any[];
    },
    enabled: canViewTickets,
    staleTime: 60000,
  });

  // ── Staff List for Task Assignee Filtering ───────────────
  const { data: staffList = [] } = useQuery({
    queryKey: ['dashboard-staff'],
    queryFn: async () => {
      const res = await api.get('/engineers');
      return (res.data?.data || []) as any[];
    },
    staleTime: 60000,
  });

  const [selectedTaskEmployeeId, setSelectedTaskEmployeeId] = useState<string>('all');
  const [activeWorkTab, setActiveWorkTab] = useState<'tasks' | 'leads' | 'tickets'>('tasks');

  // ── Tasks List ───────────────────────────────────────────
  const { data: tasksList = [] } = useQuery({
    queryKey: ['dashboard-tasks-list', selectedTaskEmployeeId],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 6 };
      if (selectedTaskEmployeeId && selectedTaskEmployeeId !== 'all') {
        params.assignedTo = selectedTaskEmployeeId;
      }
      const res = await api.get('/tasks', { params });
      return (res.data?.data || []) as any[];
    },
    enabled: canViewTasks,
    staleTime: 60000,
  });

  // ── Leads List ───────────────────────────────────────────
  const { data: leadsList = [] } = useQuery({
    queryKey: ['dashboard-leads-list'],
    queryFn: async () => {
      const res = await api.get('/leads', { params: { limit: 6 } });
      return (res.data?.data || []) as any[];
    },
    enabled: canViewLeads,
    staleTime: 60000,
  });

  const kpis = data?.kpis || { totalCustomers: 0, openCalls: 0, openTickets: 0, expiringSoon: 0, monthRevenue: 0 };
  const analytics = data?.analytics || {
    criticalOpenTickets: 0,
    outstandingAmount: 0,
    outstandingCustomers: 0,
    revenueYtd: 0,
    revenueTrend: [],
    callsTrend: [],
  };

  // ── Live Clock ───────────────────────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  // ── Today's Items ─────────────────────────────────────────
  const todayStr = now.toISOString().slice(0, 10);

  const tasksDueToday = tasksList.filter((t: any) => {
    if (!t.dueDate) return false;
    try { return t.dueDate.slice(0, 10) === todayStr && t.status !== 'done' && t.status !== 'cancelled'; }
    catch { return false; }
  });

  const ticketsToday = ticketsList.filter((t: any) => {
    if (!t.createdAt) return false;
    try { return t.createdAt.slice(0, 10) === todayStr; }
    catch { return false; }
  });

  // AMC rows expiring within 7 days
  const amcAlertRows = (serviceInsights?.alerts || []).filter((a: any) => {
    const d = a.days;
    return typeof d === 'number' && d >= 0 && d <= 7;
  });

  const todayItemsCount = tasksDueToday.length + ticketsToday.length + amcAlertRows.length;
  const todayHasItems = todayItemsCount > 0;

  // ── Top Executive Metric Cards (Filtered by RBAC) ──
  const allExecutiveMetrics = [
    {
      key: 'customers',
      label: 'Total Customers',
      value: kpis.totalCustomers,
      badge: 'Active Directory',
      badgeColor: 'var(--brand)',
      badgeBg: 'color-mix(in srgb, var(--brand) 10%, transparent)',
      sub: 'Verified client portfolio',
      icon: <Users size={20} />,
      color: 'var(--brand)',
      accentColor: 'var(--brand)',
      path: '/customers',
      show: canViewCustomers,
    },
    {
      key: 'leads',
      label: 'Active Leads',
      value: leadDashData?.totalLeads ?? leadsList.length,
      badge: `${leadDashData?.wonLeads ?? 0} Won`,
      badgeColor: '#06b6d4',
      badgeBg: 'rgba(6, 182, 212, 0.12)',
      sub: 'Sales funnel pipeline',
      icon: <Target size={20} />,
      color: '#06b6d4',
      accentColor: '#06b6d4',
      path: '/leads',
      show: canViewLeads,
    },
    {
      key: 'tasks',
      label: 'Open Tasks',
      value: taskDashData?.open ?? tasksList.length,
      badge: `${taskDashData?.overdue || 0} Overdue`,
      badgeColor: taskDashData?.overdue ? 'var(--red)' : 'var(--amber)',
      badgeBg: taskDashData?.overdue ? 'var(--red-bg)' : 'color-mix(in srgb, var(--amber) 12%, transparent)',
      sub: 'Deliverables in progress',
      icon: <ClipboardList size={20} />,
      color: 'var(--amber)',
      accentColor: 'var(--amber)',
      path: '/tasks',
      show: canViewTasks,
    },
    {
      key: 'tickets',
      label: 'Support Tickets',
      value: kpis.openTickets,
      badge: `${analytics.criticalOpenTickets || 0} Critical`,
      badgeColor: analytics.criticalOpenTickets ? 'var(--red)' : '#ec4899',
      badgeBg: analytics.criticalOpenTickets ? 'var(--red-bg)' : 'rgba(236, 72, 153, 0.12)',
      sub: 'Client helpdesk queue',
      icon: <Ticket size={20} />,
      color: '#ec4899',
      accentColor: '#ec4899',
      path: '/tickets',
      show: canViewTickets,
    },
    {
      key: 'payments',
      label: 'YTD Inflow',
      value: fmt.currency(analytics.revenueYtd || kpis.monthRevenue),
      badge: 'Collections',
      badgeColor: 'var(--green)',
      badgeBg: 'color-mix(in srgb, var(--green) 12%, transparent)',
      sub: `Month: ${fmt.currency(kpis.monthRevenue)}`,
      icon: <WalletCards size={20} />,
      color: 'var(--green)',
      accentColor: 'var(--green)',
      path: '/payments',
      show: canViewPayments,
    },
  ];
  const executiveMetrics = allExecutiveMetrics.filter((m) => m.show);

  // ── Services Ecosystem Status (Filtered by RBAC) ──
  const allServiceCards = [
    {
      id: 'tss',
      label: 'TSS Licenses',
      icon: <SearchCheck size={16} />,
      path: '/tss/list',
      total: serviceInsights?.tss?.kpi?.total || 0,
      active: serviceInsights?.tss?.kpi?.active || 0,
      expiring: serviceInsights?.tss?.kpi?.expiring || 0,
      expired: serviceInsights?.tss?.kpi?.expired || 0,
      color: 'var(--brand)',
      show: canViewTSS,
    },
    {
      id: 'amc',
      label: 'AMC Contracts',
      icon: <RefreshCw size={16} />,
      path: '/amc/list',
      total: kpis.totalCustomers,
      active: Math.max(kpis.totalCustomers - kpis.expiringSoon, 0),
      expiring: kpis.expiringSoon,
      expired: 0,
      color: 'var(--green)',
      show: canViewAMC,
    },
    {
      id: 'cloud',
      label: 'Cloud Hub',
      icon: <Cloud size={16} />,
      path: '/cloud/list',
      total: serviceInsights?.cloud?.kpi?.total || 0,
      active: serviceInsights?.cloud?.kpi?.total || 0,
      expiring: serviceInsights?.cloud?.kpi?.expiring || 0,
      expired: serviceInsights?.cloud?.kpi?.expired || 0,
      color: '#0284c7',
      show: canViewCloud,
    },
    {
      id: 'tdl',
      label: 'TDL Custom',
      icon: <Layers size={16} />,
      path: '/tdl/list',
      total: serviceInsights?.tdl?.kpi?.total || 0,
      active: serviceInsights?.tdl?.kpi?.active || 0,
      expiring: serviceInsights?.tdl?.kpi?.expiring || 0,
      expired: serviceInsights?.tdl?.kpi?.expired || 0,
      color: '#d97706',
      show: canViewTSS || canViewAMC,
    },
  ];
  const serviceCards = allServiceCards.filter((s) => s.show);

  const expiringLicensesCount = (serviceInsights?.tss?.kpi?.expiring || 0) + (serviceInsights?.cloud?.kpi?.expiring || 0);

  // ── Bottom Launchpad Cards (Filtered by RBAC) ──
  const allLaunchpadCards = [
    {
      title: 'Customer Directory',
      sub: `${kpis.totalCustomers} Accounts`,
      description: 'Manage profiles, serials & AMC records',
      path: '/customers',
      icon: <Users size={18} />,
      color: 'var(--brand)',
      bg: 'color-mix(in srgb, var(--brand) 12%, transparent)',
      show: canViewCustomers,
    },
    {
      title: 'Leads & Funnel',
      sub: `${leadDashData?.totalLeads ?? leadsList.length} Active Leads`,
      description: 'Track stage transitions & conversions',
      path: '/leads',
      icon: <Target size={18} />,
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.12)',
      show: canViewLeads,
    },
    {
      title: 'Tasks & Milestones',
      sub: `${taskDashData?.open ?? tasksList.length} In Progress`,
      description: 'Assign duties, track deliverables & deadlines',
      path: '/tasks',
      icon: <ClipboardList size={18} />,
      color: 'var(--amber)',
      bg: 'color-mix(in srgb, var(--amber) 12%, transparent)',
      show: canViewTasks,
    },
    {
      title: 'Support & Tickets',
      sub: `${kpis.openTickets} Open Tickets`,
      description: 'Client service desk & issue resolution',
      path: '/tickets',
      icon: <Ticket size={18} />,
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.12)',
      show: canViewTickets,
    },
    {
      title: 'TSS License Center',
      sub: `${serviceInsights?.tss?.kpi?.total || 0} Subscriptions`,
      description: 'Tally software subscription renewals',
      path: '/tss/list',
      icon: <SearchCheck size={18} />,
      color: 'var(--green)',
      bg: 'color-mix(in srgb, var(--green) 12%, transparent)',
      show: canViewTSS,
    },
    {
      title: 'Cloud Infrastructure',
      sub: `${serviceInsights?.cloud?.kpi?.total || 0} Cloud Hubs`,
      description: 'Manage AWS / Dedicated Tally instances',
      path: '/cloud/list',
      icon: <Cloud size={18} />,
      color: '#0284c7',
      bg: 'rgba(2, 132, 199, 0.12)',
      show: canViewCloud,
    },
  ];
  const launchpadCards = allLaunchpadCards.filter((c) => c.show);

  // ── Dynamic Adaptive Layout Flags ──
  const showRevenueChart = canViewPayments;
  const showServiceHealth = serviceCards.length > 0;
  const hasActionAlerts = canViewTickets || canViewTasks || canViewTSS || canViewCloud || canViewAMC;

  if (isLoading) {
    return (
      <div className="dash-page" style={{ padding: '24px 0 60px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="skeleton" style={{ height: 56, width: '100%', borderRadius: 16 }} />
        <div className="dash-kpi-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 18 }} />
          ))}
        </div>
        <div className="dash-main-split">
          <div className="skeleton" style={{ height: 380, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 380, borderRadius: 20 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>
      
      {/* ── Top Executive Command Center Header ── */}
      <div className="dash-exec-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--brand) 0%, #4338ca 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 18,
            boxShadow: '0 8px 16px -4px rgba(109, 40, 217, 0.35)',
            flexShrink: 0
          }}>
            {user?.name?.charAt(0).toUpperCase() || 'W'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx-1)', margin: 0, letterSpacing: '-0.02em' }}>
                {greeting}, {user?.name?.split(' ')[0] || 'Executive'}
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 20,
                background: 'color-mix(in srgb, var(--green) 12%, transparent)',
                color: 'var(--green)',
                fontSize: 11.5,
                fontWeight: 700
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                Operational System Live
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--tx-4)', margin: '4px 0 0', fontWeight: 500 }}>
              WelcomeTech Enterprise CRM • <span style={{ color: 'var(--tx-3)', fontWeight: 600 }}>{currentDate}</span>
            </p>
          </div>
        </div>

        {/* Executive Action Controls */}
        <div className="dash-quick-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {canAddCustomer && (
            <button
              type="button"
              onClick={() => navigate('/customers/new')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 15px',
                borderRadius: 12,
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--brand)',
                background: 'color-mix(in srgb, var(--brand) 10%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--brand) 25%, var(--border))',
                cursor: 'pointer',
                transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
                boxShadow: 'var(--sh-xs)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--brand)';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(109, 40, 217, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--brand) 10%, var(--surface))';
                e.currentTarget.style.color = 'var(--brand)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--sh-xs)';
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--brand) 18%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserPlus size={13} />
              </div>
              <span>New Customer</span>
            </button>
          )}

          {canAddLead && (
            <button
              type="button"
              onClick={() => navigate('/leads')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 15px',
                borderRadius: 12,
                fontSize: 12.5,
                fontWeight: 700,
                color: '#0891b2',
                background: 'rgba(6, 182, 212, 0.09)',
                border: '1px solid rgba(6, 182, 212, 0.22)',
                cursor: 'pointer',
                transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
                boxShadow: 'var(--sh-xs)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#06b6d4';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(6, 182, 212, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.09)';
                e.currentTarget.style.color = '#0891b2';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--sh-xs)';
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(6, 182, 212, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={13} />
              </div>
              <span>Add Lead</span>
            </button>
          )}

          {canAddTask && (
            <button
              type="button"
              className="dash-quick-btn dash-quick-btn-task"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('wt:open-quick-task'));
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 15px',
                borderRadius: 12,
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--amber)',
                background: 'color-mix(in srgb, var(--amber) 10%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--amber) 25%, var(--border))',
                cursor: 'pointer',
                transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
                boxShadow: 'var(--sh-xs)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--amber)';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(204, 123, 17, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--amber) 10%, var(--surface))';
                e.currentTarget.style.color = 'var(--amber)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--sh-xs)';
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--amber) 18%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={13} />
              </div>
              <span>New Task</span>
            </button>
          )}

          {canAddTicket && (
            <button
              type="button"
              className="dash-quick-btn dash-quick-btn-ticket"
              onClick={() => navigate('/tickets')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 15px',
                borderRadius: 12,
                fontSize: 12.5,
                fontWeight: 700,
                color: '#db2777',
                background: 'rgba(236, 72, 153, 0.09)',
                border: '1px solid rgba(236, 72, 153, 0.22)',
                cursor: 'pointer',
                transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
                boxShadow: 'var(--sh-xs)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ec4899';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(236, 72, 153, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(236, 72, 153, 0.09)';
                e.currentTarget.style.color = '#db2777';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--sh-xs)';
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(236, 72, 153, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ticket size={13} />
              </div>
              <span>Log Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Today's Summary Card ─────────────────────────── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '20px 24px',
          boxShadow: 'var(--sh-sm)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, position: 'relative' }}>

          {/* Left — Date & Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 15,
              background: todayHasItems
                ? 'color-mix(in srgb, var(--amber) 14%, var(--surface-2))'
                : 'color-mix(in srgb, var(--green) 14%, var(--surface-2))',
              border: `1px solid ${todayHasItems ? 'color-mix(in srgb, var(--amber) 30%, var(--border))' : 'color-mix(in srgb, var(--green) 30%, var(--border))'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: todayHasItems ? 'var(--amber)' : 'var(--green)',
              flexShrink: 0,
            }}>
              <Calendar size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx-1)', letterSpacing: '-0.02em' }}>
                  {currentDate}
                </span>
                <span style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--tx-4)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.03em',
                }}>
                  {currentTime}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 700,
                  color: todayHasItems ? 'var(--amber)' : 'var(--green)',
                  background: todayHasItems
                    ? 'color-mix(in srgb, var(--amber) 12%, transparent)'
                    : 'color-mix(in srgb, var(--green) 12%, transparent)',
                  padding: '2px 9px', borderRadius: 20,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: todayHasItems ? 'var(--amber)' : 'var(--green)' }} />
                  {todayHasItems ? `${todayItemsCount} item${todayItemsCount > 1 ? 's' : ''} need attention today` : 'All clear — no pending items today'}
                </span>
              </div>
            </div>
          </div>

          {/* Right — Quick-glance summary pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

            {/* Tasks Due Today */}
            {canViewTasks && (
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                title={`${tasksDueToday.length} task${tasksDueToday.length !== 1 ? 's' : ''} due today`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 12,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  color: tasksDueToday.length > 0 ? 'var(--amber)' : 'var(--tx-4)',
                  background: tasksDueToday.length > 0
                    ? 'color-mix(in srgb, var(--amber) 11%, var(--surface))'
                    : 'var(--surface-2)',
                  border: `1px solid ${tasksDueToday.length > 0 ? 'color-mix(in srgb, var(--amber) 28%, var(--border))' : 'var(--border)'}`,
                  transition: 'all 0.18s ease', boxShadow: 'var(--sh-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(204,123,17,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--sh-xs)';
                }}
              >
                <CheckSquare size={14} />
                <span>Tasks due</span>
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 6, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: tasksDueToday.length > 0 ? 'var(--amber)' : 'var(--border)',
                  color: tasksDueToday.length > 0 ? '#fff' : 'var(--tx-4)',
                  padding: '0 4px',
                }}>
                  {tasksDueToday.length}
                </span>
              </button>
            )}

            {/* Tickets Opened Today */}
            {canViewTickets && (
              <button
                type="button"
                onClick={() => navigate('/tickets')}
                title={`${ticketsToday.length} ticket${ticketsToday.length !== 1 ? 's' : ''} opened today`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 12,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  color: ticketsToday.length > 0 ? '#ec4899' : 'var(--tx-4)',
                  background: ticketsToday.length > 0
                    ? 'rgba(236,72,153,0.10)'
                    : 'var(--surface-2)',
                  border: `1px solid ${ticketsToday.length > 0 ? 'rgba(236,72,153,0.28)' : 'var(--border)'}`,
                  transition: 'all 0.18s ease', boxShadow: 'var(--sh-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(236,72,153,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--sh-xs)';
                }}
              >
                <Ticket size={14} />
                <span>New tickets</span>
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 6, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: ticketsToday.length > 0 ? '#ec4899' : 'var(--border)',
                  color: ticketsToday.length > 0 ? '#fff' : 'var(--tx-4)',
                  padding: '0 4px',
                }}>
                  {ticketsToday.length}
                </span>
              </button>
            )}

            {/* AMC Expiring ≤7 days */}
            {(canViewAMC || canViewTSS) && (
              <button
                type="button"
                onClick={() => navigate('/amc/list')}
                title={`${amcAlertRows.length} AMC contract${amcAlertRows.length !== 1 ? 's' : ''} expiring within 7 days`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 12,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  color: amcAlertRows.length > 0 ? 'var(--red)' : 'var(--tx-4)',
                  background: amcAlertRows.length > 0
                    ? 'color-mix(in srgb, var(--red) 10%, var(--surface))'
                    : 'var(--surface-2)',
                  border: `1px solid ${amcAlertRows.length > 0 ? 'color-mix(in srgb, var(--red) 28%, var(--border))' : 'var(--border)'}`,
                  transition: 'all 0.18s ease', boxShadow: 'var(--sh-xs)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(220,38,38,0.22)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--sh-xs)';
                }}
              >
                <AlertTriangle size={14} />
                <span>AMC expiring</span>
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 6, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: amcAlertRows.length > 0 ? 'var(--red)' : 'var(--border)',
                  color: amcAlertRows.length > 0 ? '#fff' : 'var(--tx-4)',
                  padding: '0 4px',
                }}>
                  {amcAlertRows.length}
                </span>
              </button>
            )}

          </div>
        </div>

        {/* Inline row of urgent items if any */}
        {todayHasItems && (
          <div style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {tasksDueToday.slice(0, 3).map((t: any) => (
              <div
                key={t._id}
                onClick={() => navigate('/tasks')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 12px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: 'color-mix(in srgb, var(--amber) 8%, var(--surface-2))',
                  border: '1px solid color-mix(in srgb, var(--amber) 22%, var(--border))',
                  color: 'var(--tx-2)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--amber) 14%, var(--surface-2))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--amber) 8%, var(--surface-2))')}
              >
                <CheckSquare size={12} color="var(--amber)" />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title || t.description || 'Task'}
                </span>
                <ChevronRight size={11} color="var(--tx-5)" />
              </div>
            ))}
            {ticketsToday.slice(0, 2).map((t: any) => (
              <div
                key={t._id}
                onClick={() => navigate('/tickets')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 12px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: 'rgba(236,72,153,0.07)',
                  border: '1px solid rgba(236,72,153,0.2)',
                  color: 'var(--tx-2)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(236,72,153,0.13)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(236,72,153,0.07)')}
              >
                <Ticket size={12} color="#ec4899" />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.subject || t.title || 'Ticket'}
                </span>
                <ChevronRight size={11} color="var(--tx-5)" />
              </div>
            ))}
            {amcAlertRows.slice(0, 2).map((a: any, i: number) => (
              <div
                key={a.customer?._id || i}
                onClick={() => navigate('/amc/list')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 12px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: 'color-mix(in srgb, var(--red) 8%, var(--surface-2))',
                  border: '1px solid color-mix(in srgb, var(--red) 22%, var(--border))',
                  color: 'var(--tx-2)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--red) 14%, var(--surface-2))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--red) 8%, var(--surface-2))')}
              >
                <AlertTriangle size={12} color="var(--red)" />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.customer?.name || 'AMC'} — {typeof a.days === 'number' ? (a.days === 0 ? 'expires today' : `${a.days}d left`) : 'expiring'}
                </span>
                <ChevronRight size={11} color="var(--tx-5)" />
              </div>
            ))}
            {todayItemsCount > 7 && (
              <span style={{ fontSize: 11.5, color: 'var(--tx-4)', padding: '5px 6px', fontWeight: 600 }}>
                +{todayItemsCount - 7} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Top Executive Metric Cards Grid ── */}
      {executiveMetrics.length > 0 && (
        <div className="dash-kpi-grid">
          {executiveMetrics.map((kpi, idx) => (
            <div
              key={kpi.label}
              className="dash-kpi-card card fade-in-up"
              onClick={() => navigate(kpi.path)}
              style={{
                animationDelay: `${idx * 40}ms`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = kpi.accentColor;
                e.currentTarget.style.boxShadow = '0 12px 28px -6px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'var(--sh-sm)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 4 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="dash-kpi-title" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-3)', display: 'block' }}>{kpi.label}</span>
                  <span className="dash-kpi-badge" style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: kpi.badgeColor,
                    background: kpi.badgeBg,
                    marginTop: 4
                  }}>
                    {kpi.badge}
                  </span>
                </div>

                <div className="dash-kpi-icon-wrap" style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: kpi.badgeBg,
                  color: kpi.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {kpi.icon}
                </div>
              </div>

              <div>
                <div className="dash-kpi-val" style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx-1)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {kpi.value}
                </div>
                <div className="dash-kpi-sub" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx-4)', marginTop: 4 }}>
                  {kpi.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Analytical & Intelligence Grid ── */}
      <div className="dash-main-split">
        
        {/* ── Primary Main Workspace Column (Left) ── */}
        <div className="dash-primary-col">
          
          {/* Revenue Velocity & Collections Trajectory (If Financial Role) */}
          {showRevenueChart && (
            <div className="dash-card card fade-in-up">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={19} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>Revenue & Collection Velocity</h3>
                    <p style={{ fontSize: 11.5, color: 'var(--tx-4)', margin: '2px 0 0', fontWeight: 500 }}>7-Month financial inflow trajectory</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{
                    padding: '6px 14px',
                    borderRadius: 12,
                    background: 'color-mix(in srgb, var(--green) 12%, transparent)',
                    color: 'var(--green)',
                    fontSize: 12.5,
                    fontWeight: 800,
                    border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)'
                  }}>
                    {fmt.currency(analytics.revenueYtd)} YTD Inflow
                  </div>
                  {analytics.outstandingAmount > 0 && (
                    <div style={{
                      padding: '6px 14px',
                      borderRadius: 12,
                      background: 'var(--amber-bg)',
                      color: 'var(--amber)',
                      fontSize: 12.5,
                      fontWeight: 800,
                      border: '1px solid var(--amber-bd)'
                    }}>
                      {fmt.currency(analytics.outstandingAmount)} Pending
                    </div>
                  )}
                </div>
              </div>

              <div style={{ height: 250, width: '100%', minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.revenueTrend} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--tx-4)' }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--tx-4)' }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload?.length) {
                          return (
                            <div style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 12,
                              padding: '10px 14px',
                              boxShadow: 'var(--sh-md)'
                            }}>
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx-4)' }}>{payload[0].payload.month}</div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand)', marginTop: 2 }}>{fmt.currency(payload[0].value as number)}</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="var(--brand)" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#dashRevGrad)" 
                      dot={{ r: 3.5, fill: 'var(--surface)', stroke: 'var(--brand)', strokeWidth: 2 }} 
                      activeDot={{ r: 6, fill: 'var(--brand)', stroke: '#ffffff', strokeWidth: 2 }} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Services Ecosystem Health (TSS, AMC, Cloud Hub, TDL Custom) */}
          {showServiceHealth && (
            <div className="dash-card card fade-in-up">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'color-mix(in srgb, var(--teal) 12%, transparent)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={19} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>Services Ecosystem Health</h3>
                    <p style={{ fontSize: 11.5, color: 'var(--tx-4)', margin: '2px 0 0', fontWeight: 500 }}>Active subscriptions & license compliance overview</p>
                  </div>
                </div>
              </div>

              <div className="dash-services-grid">
                {serviceCards.map((srv) => {
                  const total = srv.total || 0;
                  const active = srv.active || 0;
                  const expiring = srv.expiring || 0;
                  const expired = srv.expired || 0;
                  const activePct = pct(active, total);
                  const expiringPct = pct(expiring, total);
                  const expiredPct = pct(expired, total);

                  return (
                    <div
                      key={srv.label}
                      onClick={() => navigate(srv.path)}
                      className="dash-service-card"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = srv.color;
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div className="dash-service-card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
                        <div className="dash-service-title-wrap" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                          <span className="dash-service-icon" style={{ color: srv.color, flexShrink: 0, display: 'flex' }}>{srv.icon}</span>
                          <span className="dash-service-title" style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srv.label}</span>
                        </div>
                        <span className="dash-service-total" style={{ fontSize: 12, fontWeight: 800, color: srv.color, flexShrink: 0 }}>{total} Total</span>
                      </div>

                      <div className="dash-service-bar" style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)', gap: 2 }}>
                        <div style={{ width: `${activePct}%`, background: 'var(--green)', borderRadius: 999 }} />
                        <div style={{ width: `${expiringPct}%`, background: 'var(--amber)', borderRadius: 999 }} />
                        <div style={{ width: `${expiredPct}%`, background: 'var(--red)', borderRadius: 999 }} />
                      </div>

                      <div className="dash-service-stats" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 10.5, fontWeight: 700, color: 'var(--tx-4)' }}>
                        <span style={{ color: 'var(--green)' }}>
                          <span className="dash-service-stat-full">{activePct}% Active</span>
                          <span className="dash-service-stat-short">{activePct}% Act</span>
                        </span>
                        <span style={{ color: 'var(--amber)' }}>
                          <span className="dash-service-stat-full">{expiring} Expiring</span>
                          <span className="dash-service-stat-short">{expiring} Exp</span>
                        </span>
                        <span style={{ color: 'var(--red)' }}>
                          <span className="dash-service-stat-full">{expired} Expired</span>
                          <span className="dash-service-stat-short">{expired} End</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unified Operations & Deliverables Workspace (Clean tabbed view: Tasks | Leads | Tickets) */}
          {(canViewTasks || canViewLeads || canViewTickets) && (
            <div className="dash-card card fade-in-up">
              {/* Header with Segmented Workspace Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
                <div className="dash-work-tabs-bar">
                  {canViewTasks && (
                    <button
                      type="button"
                      className="dash-work-tab-btn"
                      onClick={() => setActiveWorkTab('tasks')}
                      style={{
                        background: activeWorkTab === 'tasks' ? 'var(--surface)' : 'transparent',
                        color: activeWorkTab === 'tasks' ? 'var(--tx-1)' : 'var(--tx-4)',
                        boxShadow: activeWorkTab === 'tasks' ? 'var(--sh-xs)' : 'none',
                      }}
                    >
                      <ClipboardList size={14} color={activeWorkTab === 'tasks' ? 'var(--amber)' : 'var(--tx-4)'} />
                      <span className="dash-tab-label-full">Milestone Tasks</span>
                      <span className="dash-tab-label-short">Tasks</span> ({taskDashData?.open ?? tasksList.length})
                    </button>
                  )}
                  {canViewLeads && (
                    <button
                      type="button"
                      className="dash-work-tab-btn"
                      onClick={() => setActiveWorkTab('leads')}
                      style={{
                        background: activeWorkTab === 'leads' ? 'var(--surface)' : 'transparent',
                        color: activeWorkTab === 'leads' ? 'var(--tx-1)' : 'var(--tx-4)',
                        boxShadow: activeWorkTab === 'leads' ? 'var(--sh-xs)' : 'none',
                      }}
                    >
                      <Target size={14} color={activeWorkTab === 'leads' ? '#06b6d4' : 'var(--tx-4)'} />
                      <span className="dash-tab-label-full">Sales Leads</span>
                      <span className="dash-tab-label-short">Leads</span> ({leadDashData?.totalLeads ?? leadsList.length})
                    </button>
                  )}
                  {canViewTickets && (
                    <button
                      type="button"
                      className="dash-work-tab-btn"
                      onClick={() => setActiveWorkTab('tickets')}
                      style={{
                        background: activeWorkTab === 'tickets' ? 'var(--surface)' : 'transparent',
                        color: activeWorkTab === 'tickets' ? 'var(--tx-1)' : 'var(--tx-4)',
                        boxShadow: activeWorkTab === 'tickets' ? 'var(--sh-xs)' : 'none',
                      }}
                    >
                      <Ticket size={14} color={activeWorkTab === 'tickets' ? '#ec4899' : 'var(--tx-4)'} />
                      <span className="dash-tab-label-full">Support Tickets</span>
                      <span className="dash-tab-label-short">Tickets</span> ({kpis.openTickets})
                    </button>
                  )}
                </div>

                <div className="dash-work-controls">
                  {activeWorkTab === 'tasks' && canViewTasks && staffList.length > 0 && (
                    <select
                      value={selectedTaskEmployeeId}
                      onChange={(e) => setSelectedTaskEmployeeId(e.target.value)}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '6px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--surface-2)',
                        color: 'var(--tx-1)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all">👥 All Assignees</option>
                      {staffList.map((emp: any) => (
                        <option key={emp._id} value={emp._id}>
                          👤 {emp.name} {emp._id === user?._id ? '(You)' : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (activeWorkTab === 'tasks') navigate('/tasks');
                      else if (activeWorkTab === 'leads') navigate('/leads');
                      else navigate('/tickets');
                    }}
                    style={{ borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 12, color: 'var(--brand)' }}
                  >
                    Open Full View <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Tab 1: Tasks Queue */}
              {activeWorkTab === 'tasks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasksList.length > 0 ? (
                    tasksList.map((tsk: any) => {
                      const priorityColor = tsk.priority === 'urgent' ? 'var(--red)' : tsk.priority === 'high' ? 'var(--amber)' : 'var(--teal)';
                      const priorityBg = tsk.priority === 'urgent' ? 'var(--red-bg)' : tsk.priority === 'high' ? 'var(--amber-bg)' : 'var(--teal-bg)';
                      return (
                        <div
                          key={tsk._id}
                          onClick={() => navigate('/tasks')}
                          className="dash-work-item"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--amber)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor, flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {tsk.title}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500, marginTop: 2 }}>
                                {tsk.customer?.name || tsk.lead?.companyName || 'General Task'} {tsk.dueDate ? `· Due ${fmt.date(tsk.dueDate)}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="dash-work-item-badges">
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: priorityBg, color: priorityColor, textTransform: 'capitalize' }}>
                              {tsk.priority || 'Normal'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'var(--surface)', color: 'var(--tx-2)', border: '1px solid var(--border)', textTransform: 'capitalize' }}>
                              {tsk.status ? tsk.status.replace(/_/g, ' ') : 'Active'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--tx-4)', fontSize: 12.5, fontWeight: 600 }}>
                      No milestone tasks in this queue
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Leads Funnel */}
              {activeWorkTab === 'leads' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {leadsList.length > 0 ? (
                    leadsList.map((ld: any) => (
                      <div
                        key={ld._id}
                        onClick={() => navigate('/leads')}
                        className="dash-work-item"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#06b6d4';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ld.companyName || ld.contactPerson}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500, marginTop: 2 }}>
                            {ld.contactPerson} {ld.phone ? `· ${ld.phone}` : ''} {ld.source ? `· ${ld.source}` : ''}
                          </div>
                        </div>
                        <div className="dash-work-item-badges">
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(6,182,212,0.12)', color: '#06b6d4', textTransform: 'capitalize' }}>
                            {ld.status || 'New'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--tx-4)', fontSize: 12.5, fontWeight: 600 }}>
                      No active leads available
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Tickets Queue */}
              {activeWorkTab === 'tickets' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ticketsList.length > 0 ? (
                    ticketsList.map((t: any) => (
                      <div
                        key={t._id}
                        onClick={() => navigate('/tickets')}
                        className="dash-work-item"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#ec4899';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.subject || `Ticket #${t.ticketNo}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500, marginTop: 2 }}>
                            {t.customer?.name ? `${t.customer.name} · ` : ''} Ticket #{t.ticketNo || '—'}
                          </div>
                        </div>
                        <div className="dash-work-item-badges">
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 8,
                            background: t.priority === 'critical' ? 'var(--red-bg)' : 'rgba(236,72,153,0.12)',
                            color: t.priority === 'critical' ? 'var(--red)' : '#ec4899',
                            textTransform: 'capitalize'
                          }}>
                            {t.priority || 'Normal'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'var(--surface)', color: 'var(--tx-2)', border: '1px solid var(--border)', textTransform: 'capitalize' }}>
                            {t.status || 'Open'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--tx-4)', fontSize: 12.5, fontWeight: 600 }}>
                      No support tickets in queue
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* ── Secondary Intelligence Column (Right) ── */}
        <div className="dash-secondary-col">
          
          {/* Priority Action Center (Urgent Attention Radar) */}
          {hasActionAlerts && (
            <div className="dash-card card fade-in-up">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 20, background: 'var(--brand)', borderRadius: 4 }} />
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>Priority Action Center</h3>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-4)', background: 'var(--surface-2)', padding: '3px 8px', borderRadius: 6 }}>
                  Attention Required
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Critical Tickets Alert */}
                {canViewTickets && (
                  <div
                    onClick={() => navigate('/tickets')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: analytics.criticalOpenTickets > 0 ? 'var(--red-bg)' : 'var(--surface-2)',
                      border: analytics.criticalOpenTickets > 0 ? '1px solid var(--red-bd)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(3px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--surface)',
                      color: analytics.criticalOpenTickets > 0 ? 'var(--red)' : 'var(--green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      flexShrink: 0
                    }}>
                      {analytics.criticalOpenTickets > 0 ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)' }}>
                        {analytics.criticalOpenTickets} Critical Tickets
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500 }}>
                        {analytics.criticalOpenTickets > 0 ? 'Immediate resolution required' : 'Support queue running smoothly'}
                      </div>
                    </div>
                    <ChevronRight size={15} color="var(--tx-4)" />
                  </div>
                )}

                {/* Overdue / Urgent Tasks Alert */}
                {canViewTasks && (
                  <div
                    onClick={() => navigate('/tasks')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: (taskDashData?.overdue || 0) > 0 ? 'var(--amber-bg)' : 'var(--surface-2)',
                      border: (taskDashData?.overdue || 0) > 0 ? '1px solid color-mix(in srgb, var(--amber) 30%, var(--border))' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(3px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--surface)',
                      color: (taskDashData?.overdue || 0) > 0 ? 'var(--amber)' : 'var(--green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      flexShrink: 0
                    }}>
                      <ClipboardList size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)' }}>
                        {taskDashData?.overdue || taskDashData?.dueToday || 0} Urgent Tasks
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500 }}>
                        {(taskDashData?.overdue || 0) > 0 ? `${taskDashData?.overdue} overdue milestone tasks` : 'All tasks currently on track'}
                      </div>
                    </div>
                    <ChevronRight size={15} color="var(--tx-4)" />
                  </div>
                )}

                {/* Expiring Licenses Alert */}
                {(canViewTSS || canViewCloud || canViewAMC) && (
                  <div
                    onClick={() => navigate('/tss/list')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: expiringLicensesCount > 0 ? 'color-mix(in srgb, var(--brand) 8%, var(--surface-2))' : 'var(--surface-2)',
                      border: expiringLicensesCount > 0 ? '1px solid color-mix(in srgb, var(--brand) 25%, var(--border))' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(3px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--surface)',
                      color: 'var(--brand)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      flexShrink: 0
                    }}>
                      <SearchCheck size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)' }}>
                        {expiringLicensesCount} Expiring Licenses
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500 }}>
                        TSS & Cloud renewals due in 30 days
                      </div>
                    </div>
                    <ChevronRight size={15} color="var(--tx-4)" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Operations Radar & Productivity Pulse */}
          <div className="dash-card card fade-in-up">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 20, background: 'var(--green)', borderRadius: 4 }} />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>Operations Shortcuts</h3>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-4)' }}>Fast Track</span>
            </div>

            <div className="dash-shortcuts-grid">
              <div
                onClick={() => navigate('/proposals')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  minWidth: 0,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ color: 'var(--brand)', marginBottom: 6 }}>
                  <FileText size={18} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx-1)' }}>Quotations</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 2 }}>Draft & send pricing</div>
              </div>

              <div
                onClick={() => navigate('/calendar')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  minWidth: 0,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#06b6d4';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ color: '#06b6d4', marginBottom: 6 }}>
                  <Calendar size={18} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx-1)' }}>Calendar</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 2 }}>Schedules & visits</div>
              </div>

              <div
                onClick={() => navigate('/amc/list')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  minWidth: 0,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--green)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ color: 'var(--green)', marginBottom: 6 }}>
                  <RefreshCw size={18} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx-1)' }}>AMC Renewals</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 2 }}>Annual agreements</div>
              </div>

              <div
                onClick={() => navigate('/cloud/list')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  minWidth: 0,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#0284c7';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ color: '#0284c7', marginBottom: 6 }}>
                  <Cloud size={18} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx-1)' }}>Cloud Server</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 2 }}>Instance management</div>
              </div>
            </div>
          </div>

          {/* ── Workspace Launchpad (right column) ── */}
          {launchpadCards.length > 0 && (
            <div className="dash-card card fade-in-up dash-launchpad-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 20, background: 'var(--brand)', borderRadius: 4 }} />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>Workspaces & Modules</h3>
              </div>

              <div className="dash-launchpad-grid">
                {launchpadCards.map((item) => (
                  <div
                    key={item.title}
                    onClick={() => navigate(item.path)}
                    className="dash-launchpad-card"
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(item.path); }}
                  >
                    <div className="dash-launchpad-icon" style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: item.bg,
                      color: item.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="dash-launchpad-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </div>
                      <div className="dash-launchpad-sub" style={{ fontSize: 11.5, color: item.color, fontWeight: 700, marginTop: 2 }}>
                        {item.sub}
                      </div>
                      <div className="dash-launchpad-desc" style={{ fontSize: 11, color: 'var(--tx-4)', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight className="dash-launchpad-arrow" size={16} color="var(--tx-4)" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>


    </div>
  );
};

export default DashboardPage;
