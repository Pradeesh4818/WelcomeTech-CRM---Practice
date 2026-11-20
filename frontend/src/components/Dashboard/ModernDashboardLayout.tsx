import React from 'react';
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';

export interface KPI {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  bottom: string;
}

export interface DonutData {
  active: number;
  expiring: number;
  expired: number;
  total: number;
}

export interface ModernDashboardLayoutProps {
  title: string;
  subtitle: string;
  headerActions?: React.ReactNode;
  kpiCards: KPI[];
  donutData?: DonutData;
  recentTableTitle?: string;
  tableSearch?: React.ReactNode;
  tableActions?: React.ReactNode;
  tableFilterContent?: React.ReactNode;
  tableHeaders: React.ReactNode;
  tableBody: React.ReactNode;
  isLoading?: boolean;
  analyticsContent?: React.ReactNode;
  statusContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  tableFooter?: React.ReactNode;
}

export const ModernDashboardLayout: React.FC<ModernDashboardLayoutProps> = ({
  title,
  subtitle,
  headerActions,
  kpiCards,
  donutData,
  recentTableTitle,
  tableSearch,
  tableActions,
  tableFilterContent,
  tableHeaders,
  tableBody,
  isLoading,
  analyticsContent,
  statusContent,
  footerContent,
  tableFooter,
}) => {
  const activePct = donutData?.total ? (donutData.active / donutData.total) * 100 : 0;
  const expiringPct = donutData?.total ? (donutData.expiring / donutData.total) * 100 : 0;
  const expiredPct = donutData?.total ? (donutData.expired / donutData.total) * 100 : 0;
  
  const donutR = 40;
  const donutC = 2 * Math.PI * donutR;
  const activeDash = (activePct / 100) * donutC;
  const expiringDash = (expiringPct / 100) * donutC;
  const expiredDash = (expiredPct / 100) * donutC;

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-title">{title}</div>
          <div className="page-subtitle">{subtitle}</div>
        </div>
        {headerActions && (
          <div className="actions-row">
            {headerActions}
          </div>
        )}
      </div>

      {/* Top KPI Cards */}
      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div
            key={kpi.label}
            className="kpi-card fade-in-up"
            style={{
              animationDelay: `${i * 60}ms`,
              ['--kpi-border' as any]: kpi.color || 'var(--brand)',
              ['--kpi-accent' as any]: kpi.color || 'var(--brand)',
            }}
          >
            <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>
              {kpi.icon}
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{isLoading ? '—' : kpi.value}</div>
            <div className="kpi-change">{kpi.bottom}</div>
          </div>
        ))}
      </div>

      {/* Middle Split Row */}
      {(donutData || analyticsContent || statusContent) && (
        <div className="dashboard-layout-main-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {/* Left: Analytics Overview */}
          {analyticsContent ? analyticsContent : (
            <div className="fade-in-up" style={{ background: 'var(--surface)', borderRadius: '24px', padding: '32px', border: '1px solid var(--border)', boxShadow: 'var(--sh-sm)', animationDelay: '200ms', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tx-1)' }}>Analytics Overview</h3>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand)' }} /><span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }} /><span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Expiring</span></div>
                </div>
              </div>
              
              <div style={{ width: '100%', height: '240px', position: 'relative' }}>
                <svg viewBox="0 0 800 240" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  <line x1="0" y1="40" x2="800" y2="40" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />
                  <line x1="0" y1="120" x2="800" y2="120" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />
                  <line x1="0" y1="200" x2="800" y2="200" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />
                  
                  <path d="M 0 120 C 200 120, 300 40, 500 80 S 700 20, 800 60 L 800 240 L 0 240 Z" fill="url(#chart-grad)" />
                  <path d="M 0 120 C 200 120, 300 40, 500 80 S 700 20, 800 60" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', padding: '0 10px' }}>
                  {['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'].map(day => (
                    <span key={day} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-3)' }}>{day}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right: Status Overview */}
          {statusContent ? statusContent : (donutData && (
            <div className="fade-in-up" style={{ background: 'var(--surface)', borderRadius: '24px', padding: '32px', border: '1px solid var(--border)', boxShadow: 'var(--sh-sm)', display: 'flex', flexDirection: 'column', animationDelay: '300ms' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tx-1)', marginBottom: '32px' }}>Status Overview</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--amber-bg)', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                     <div style={{ color: 'var(--amber)', background: 'var(--surface)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--sh-sm)' }}><AlertTriangle size={16} /></div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>Expiring Soon</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', background: 'var(--surface)', padding: '6px 14px', borderRadius: '24px' }}>{donutData.expiring} Items</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--red-bg)', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ color: 'var(--red)', background: 'var(--surface)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--sh-sm)' }}><Clock size={16} /></div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>Expired</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--red)', background: 'var(--surface)', padding: '6px 14px', borderRadius: '24px' }}>{donutData.expired} Items</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--green-bg)', borderRadius: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ color: 'var(--green)', background: 'var(--surface)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--sh-sm)' }}><CheckCircle size={16} /></div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-1)' }}>Active</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)', background: 'var(--surface)', padding: '6px 14px', borderRadius: '24px' }}>{donutData.active} Ready</span>
                </div>
              </div>

              <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>Distribution</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                <div style={{ width: '100px', height: '100px', flexShrink: 0 }}>
                  <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', overflow: 'visible' }}>
                    <circle cx="50" cy="50" r={donutR} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
                    {activeDash > 0 && <circle cx="50" cy="50" r={donutR} fill="none" stroke="var(--green)" strokeWidth="12" strokeDasharray={`${activeDash} ${donutC}`} strokeDashoffset={0} strokeLinecap={activePct === 100 ? "butt" : "round"} />}
                    {expiringDash > 0 && <circle cx="50" cy="50" r={donutR} fill="none" stroke="var(--amber)" strokeWidth="12" strokeDasharray={`${expiringDash} ${donutC}`} strokeDashoffset={-activeDash} strokeLinecap={expiringPct === 100 ? "butt" : "round"} />}
                    {expiredDash > 0 && <circle cx="50" cy="50" r={donutR} fill="none" stroke="var(--red)" strokeWidth="12" strokeDasharray={`${expiredDash} ${donutC}`} strokeDashoffset={-(activeDash + expiringDash)} strokeLinecap={expiredPct === 100 ? "butt" : "round"} />}
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} /><span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-2)' }}>Active</span></div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-1)' }}>{donutData.active}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }} /><span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-2)' }}>Expiring</span></div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-1)' }}>{donutData.expiring}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)' }} /><span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-2)' }}>Expired</span></div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-1)' }}>{donutData.expired}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Table */}
      <div className="fade-in-up card card-table-sep dashboard-table-card" style={{ background: 'var(--surface)', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--sh-sm)', overflow: 'hidden', animationDelay: '400ms' }}>
        <div className="card-header table-toolbar-row dashboard-table-header">
          {tableSearch ? (
            <div className="search-wrap">
              {tableSearch}
            </div>
          ) : recentTableTitle ? (
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-1)', margin: 0 }}>{recentTableTitle}</h3>
          ) : (
            <div />
          )}
          <div className="toolbar-actions">
            {tableActions}
          </div>
        </div>
        {tableFilterContent && (
          <div className="dashboard-table-filter" style={{ padding: '14px 32px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            {tableFilterContent}
          </div>
        )}
        
        <div className="tbl-wrap dashboard-table-scroll" style={{ width: '100%', overflowX: 'auto' }}>
          <table className="table-pro" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'center', minWidth: '900px' }}>
            <thead>
              <tr>{tableHeaders}</tr>
            </thead>
            <tbody>
              {tableBody}
            </tbody>
          </table>
        </div>
        {tableFooter}
      </div>
      
      {footerContent}
    </div>
  );
};
