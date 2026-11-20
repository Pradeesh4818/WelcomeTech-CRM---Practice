import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Download, TrendingUp, AlertCircle, Search, X, Save, ArrowLeft } from 'lucide-react';
import api from '../../utils/api';
import { Payment, Customer } from '../../types';
import { fmt, getActiveCurrency, PAGE_SIZE_OPTIONS } from '../../utils/helpers';
import { exportExcelRows } from '../../utils/excelExport';
import { Select, Badge, Avatar, SkeletonRow, EmptyState, InputField, SelectField, Spinner, Modal, DetailItem, Pagination } from '../../components/ui';
import toast from 'react-hot-toast';
import InvoiceWhatsAppAction from '../../components/whatsapp/InvoiceWhatsAppAction';
import { useDateFilter } from '../../context/DateFilterContext';

const PAYMENT_TYPES = ['AMC Renewal', 'New Implementation', 'TallyPrime Upgrade', 'TDL / Add-on', 'Support Visit Charge', 'AWS / Cloud Setup', 'Other'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'QPAY / QR Pay', 'Credit Card', 'Online Transfer'];

// ─── PAYMENTS LIST ───────────────────────────────
export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<Payment | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  
  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const dateKey = isFiltered ? `${startDate}_${endDate}` : 'all';

  React.useEffect(() => { setPage(1); }, [filter, search, pageSize, isFiltered, startDate, endDate]);
  const { data, isLoading } = useQuery({
    queryKey: ['payments', filter, search, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;
      if (isFiltered && startDate && endDate && filterType !== 'all') {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/payments', { params });
      return r.data as unknown as { data: Payment[]; pages: number; total: number; stats: any };
    },
  });

  const payments: Payment[] = data?.data || [];
  const stats = data?.stats || { monthlyRevenue: 0, totalOutstanding: 0, revenueYtd: 0, outstandingCustomers: 0 };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Payment Records</div><div className="page-subtitle">All customer payments and transactions</div></div>
      </div>

      {/* Stats */}
      <div className="quick-grid-3" style={{ marginBottom: 20 }}>
        {[
          { label: 'Revenue This Month', value: fmt.currency(stats.monthlyRevenue), color: 'var(--green)', icon: <TrendingUp size={16} />, bg: 'var(--green-bg)' },
          { label: 'Total Outstanding', value: fmt.currency(stats.totalOutstanding), color: 'var(--red)', icon: <AlertCircle size={16} />, bg: 'var(--red-bg)' },
          { label: 'Revenue YTD', value: fmt.currency(stats.revenueYtd), color: 'var(--brand)', icon: <TrendingUp size={16} />, bg: 'var(--brand-light)' },
        ].map((s) => (
          <div key={s.label} className="card metric-tile">
            <div>
              <div className="metric-label">{s.label}</div>
              <div className="metric-value" style={{ color: s.color }}>{isLoading ? '—' : s.value}</div>
            </div>
            <div className="metric-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select className="filter-select page-size-select" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={PAGE_SIZE_OPTIONS} />
            <Select className="filter-select" value={filter} onChange={setFilter} options={['all', 'paid', 'pending', 'partial', 'overdue'].map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))} />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={async () => {
                const params: Record<string, string> = { limit: '5000', page: '1' };
                if (filter !== 'all') params.status = filter;
                if (search) params.search = search;
                const res = await api.get('/payments', { params });
                exportExcelRows('payment-records', 'Payments', (res.data?.data || []) as Record<string, unknown>[]);
              }}
            >
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/payments/new')}><PlusCircle size={13} /> Add Payment</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead><tr><th className="sno-col">S NO</th><th>Logo</th><th>Invoice #</th><th>Customer</th><th>Description</th><th>Amount ({getActiveCurrency()})</th><th>Method</th><th>Date</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={11} />) :
                payments.length === 0 ? (
                  <tr><td colSpan={11}><EmptyState icon={<PlusCircle size={22} />} title="No payments found" action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/payments/new')}>Add Payment</button>} /></td></tr>
                ) : (
                  payments.map((p, idx) => {
                    const cust = typeof p.customer === 'object' ? p.customer : null;
                    return (
                      <tr key={p._id}>
                        <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                        <td>{cust && <Avatar name={cust.name} src={cust.avatar} size="sm" />}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{p.invoiceNo}</span></td>
                        <td><span style={{ fontSize: 12.5 }}>{cust?.name || '—'}</span></td>
                        <td><div style={{ fontSize: 12.5, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || p.paymentType}</div></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: p.status === 'paid' ? 'var(--green)' : p.status === 'overdue' ? 'var(--red)' : 'var(--tx-1)' }}>{(p.amount || 0).toLocaleString()}</span></td>
                        <td style={{ fontSize: 12 }}>{p.method}</td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--tx-4)' }}>{fmt.date(p.paymentDate)}</td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: p.status === 'overdue' ? 'var(--red)' : 'var(--tx-4)' }}>{fmt.date(p.dueDate)}</td>
                        <td><Badge status={p.status} /></td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn-ghost btn-xs" onClick={() => { setActivePayment(p); setInvoiceOpen(true); }}>Invoice</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={invoiceOpen && !!activePayment}
        onClose={() => { setInvoiceOpen(false); setActivePayment(null); }}
        title="Invoice"
        size="md"
      >
        {!activePayment ? null : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, color: 'var(--brand)', fontSize: 13 }}>
                  {activePayment.invoiceNo}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activePayment.description || activePayment.paymentType}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 3 }}>
                  {typeof activePayment.customer === 'object' ? activePayment.customer?.name : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 900, color: activePayment.status === 'paid' ? 'var(--green)' : activePayment.status === 'overdue' ? 'var(--red)' : 'var(--tx-1)' }}>
                  {fmt.currency(activePayment.amount || 0)}
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <Badge status={activePayment.status} />
                </div>
              </div>
            </div>

            <div className="details-grid">
              <DetailItem label="Payment Date" value={<span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.date(activePayment.paymentDate)}</span>} />
              <DetailItem label="Due Date" value={activePayment.dueDate ? <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.date(activePayment.dueDate)}</span> : '—'} />
              <DetailItem label="Method" value={activePayment.method} />
              <DetailItem label="Reference" value={activePayment.transactionRef || '—'} />
              <DetailItem label="Type" value={activePayment.paymentType} />
              <DetailItem label="Remarks" value={activePayment.remarks || '—'} />
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <InvoiceWhatsAppAction payment={activePayment} buttonLabel="Send via WhatsApp" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

// ─── ADD PAYMENT ─────────────────────────────────
export const PaymentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer: '', paymentType: 'AMC Renewal', description: '', amount: '',
    paymentDate: new Date().toISOString().split('T')[0], dueDate: '',
    method: 'Bank Transfer', transactionRef: '', status: 'paid',
    partialAmount: '', remarks: '',
  });
  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const { data: customers } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const r = await api.get('/customers/lookup');
      return (r.data?.data || []) as Customer[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/payments', d),
    meta: { invalidateQueryKeys: [['payments'], ['payments-outstanding'], ['invoices']] },
    onSuccess: () => { toast.success('Payment saved! Invoice generated.'); navigate('/payments'); },
    onError: () => toast.error('Failed to save payment'),
  });



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };
  return (
    <div className="wt-form-page" style={{ paddingTop: 20 }}>
      <div className="page-header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          className="btn-back"
          onClick={() => navigate('/payments')}
          title="Back to Payments"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="page-title">Add Payment Record</div>
          <div className="page-subtitle">Record payment collection and generate invoice</div>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ paddingBottom: 100 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Payment Details</span></div>
          <div className="card-body">
            <div className="form-grid-2">
              <SelectField
                label="Customer"
                value={form.customer}
                onChange={(v) => set('customer', v)}
                options={(customers || []).map((c) => ({ value: c._id, label: c.name }))}
                placeholder="— Select Customer —"
                required
                disabled={mutation.isPending}
              />
              <InputField label="Invoice / Reference No." value={form.description} onChange={(v) => set('description', v)} placeholder="Auto-generated if blank" />
              <SelectField label="Payment Type" value={form.paymentType} onChange={(v) => set('paymentType', v)} options={PAYMENT_TYPES.map(t => ({ value: t, label: t }))} required />
              <InputField label={`Amount (${getActiveCurrency()})`} value={form.amount} onChange={(v) => set('amount', v)} type="number" required placeholder="0.00" />
              <InputField label="Payment Date" value={form.paymentDate} onChange={(v) => set('paymentDate', v)} type="date" required />
              <InputField label="Due Date" value={form.dueDate} onChange={(v) => set('dueDate', v)} type="date" />
              <SelectField label="Payment Method" value={form.method} onChange={(v) => set('method', v)} options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} required />
              <InputField label="Transaction / Cheque No." value={form.transactionRef} onChange={(v) => set('transactionRef', v)} placeholder="Reference number" />
              <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' }, { value: 'partial', label: 'Partial Payment' }]} />
              {form.status === 'partial' && <InputField label={`Partial Amount (${getActiveCurrency()})`} value={form.partialAmount} onChange={(v) => set('partialAmount', v)} type="number" placeholder="Amount received so far" />}
            </div>
            <div className="form-group"><label className="form-label">Remarks</label><textarea className="form-control" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional notes..." rows={2} /></div>
          </div>
        </div>

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
            onClick={() => navigate('/payments')}
          >
            <X size={16} /> Cancel
          </button>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={mutation.isPending}
            style={{ 
              borderRadius: 12, padding: '10px 24px', fontWeight: 700, 
              boxShadow: 'var(--sh-brand)', gap: 10 
            }}
          >
            {mutation.isPending ? <Spinner size={18} /> : <Save size={18} />}
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── OUTSTANDING ─────────────────────────────────
export const OutstandingPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  React.useEffect(() => { setPage(1); }, [search, pageSize, dateKey]);
  const { data, isLoading } = useQuery({
    queryKey: ['payments-outstanding', page, search, pageSize, dateKey],
    queryFn: async () => {
      const r = await api.get('/payments', {
        params: {
          status: ['overdue', 'pending', 'partial'],
          limit: pageSize,
          page: String(page),
          ...(hasActiveDateFilter ? { startDate, endDate } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      return r.data as unknown as { data: Payment[]; pages: number; total: number; stats: any };
    },
  });
  // Server-side search + server-computed stats, so results and KPIs are not
  // limited to the current 10-row page.
  const payments: Payment[] = data?.data || [];
  const stats = data?.stats || { totalOutstanding: 0, outstandingCustomers: 0, pendingCount: 0, overdueCount: 0, partialCount: 0 };

  const totalOutstandingCount = (stats.pendingCount || 0) + (stats.overdueCount || 0) + (stats.partialCount || 0);
  const overdueCount = stats.overdueCount || 0;
  const partialCount = stats.partialCount || 0;

  const kpiCards = [
    { label: 'Outstanding Invoices', value: totalOutstandingCount, icon: <AlertCircle size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Pending/Overdue' },
    { label: 'Overdue', value: overdueCount, icon: <AlertCircle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', change: 'Requires action' },
    { label: 'Partial Payments', value: partialCount, icon: <AlertCircle size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'Partially paid' },
    { label: 'Total Value', value: fmt.currency(stats.totalOutstanding), icon: <TrendingUp size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'Total outstanding' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Outstanding Payments</div>
          <div className="page-subtitle">
            Overdue and pending collections
            {hasActiveDateFilter && (
              <span className="ml-2 inline-flex items-center text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                • {headerDateLabel}
              </span>
            )}
          </div>
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
              placeholder="Search outstanding payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select className="filter-select page-size-select" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={PAGE_SIZE_OPTIONS} />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={async () => {
                const params: Record<string, any> = {
                  status: ['overdue', 'pending', 'partial'],
                  limit: '5000',
                  page: '1',
                  ...(hasActiveDateFilter ? { startDate, endDate } : {}),
                };
                const res = await api.get('/payments', { params });
                const rows = ((res.data?.data || []) as Payment[]).filter((p) => {
                  if (!search) return true;
                  const s = search.toLowerCase();
                  const cust = typeof p.customer === 'object' ? p.customer : null;
                  return p.invoiceNo.toLowerCase().includes(s) || !!cust?.name.toLowerCase().includes(s) || (p.description || p.paymentType).toLowerCase().includes(s);
                });
                exportExcelRows('outstanding-payments', 'Outstanding', rows as unknown as Record<string, unknown>[]);
              }}
            >
              <Download size={13} /> Export
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead><tr><th className="sno-col">S NO</th><th>Customer</th><th>Invoice #</th><th>Description</th><th>Amount ({getActiveCurrency()})</th><th>Due Date</th><th>Overdue By</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />) :
                payments.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState icon={<AlertCircle size={20} />} title="No outstanding payments" />
                    </td>
                  </tr>
                ) : (
                  payments.map((p, idx) => {
                    const cust = typeof p.customer === 'object' ? p.customer : null;
                    return (
                      <tr key={p._id}>
                        <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{cust && <Avatar name={cust.name} size="sm" />}<span style={{ fontSize: 12.5, fontWeight: 500 }}>{cust?.name || '—'}</span></div></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)' }}>{p.invoiceNo}</span></td>
                        <td style={{ fontSize: 12.5 }}>{p.description || p.paymentType}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>{(p.amount || 0).toLocaleString()}</span></td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{fmt.date(p.dueDate)}</td>
                        <td><span className="badge badge-red">Overdue</span></td>
                        <td><div className="table-actions"><button className="btn btn-ghost btn-xs">Send Reminder</button><button className="btn btn-success btn-xs">Mark Paid</button></div></td>
                      </tr>
                    );
                  })
                )
              }
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
      </div>
    </div>
  );
};

// ─── INVOICES ────────────────────────────────────
export const InvoicesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const { isFiltered, startDate, endDate, filterType } = useDateFilter();
  const dateKey = isFiltered ? `${startDate}_${endDate}` : 'all';

  React.useEffect(() => { setPage(1); }, [search, pageSize, isFiltered, startDate, endDate]);
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, pageSize, dateKey],
    queryFn: async () => { 
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search.trim()) params.search = search.trim();
      if (isFiltered && startDate && endDate && filterType !== 'all') {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/payments', { params }); 
      return r.data as unknown as { data: Payment[]; pages: number; total: number; stats: any }; 
    },
  });
  const payments: Payment[] = data?.data || [];
  const stats = data?.stats || {};

  // KPIs come from server-side aggregates, not the current 10-row page.
  const totalInvoices = stats.totalInvoices ?? data?.total ?? payments.length;
  const paidInvoices = stats.paidCount ?? 0;
  const overdueInvoices = stats.overdueCount ?? 0;
  const totalValue = stats.totalValue ?? 0;

  const kpiCards = [
    { label: 'Total Invoices', value: totalInvoices, icon: <TrendingUp size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All generated' },
    { label: 'Paid', value: paidInvoices, icon: <TrendingUp size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Successfully collected' },
    { label: 'Overdue', value: overdueInvoices, icon: <AlertCircle size={20} strokeWidth={2.5} />, color: 'var(--red)', bg: 'var(--red-bg)', change: 'Pending collection' },
    { label: 'Total Value', value: fmt.currency(totalValue), icon: <TrendingUp size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'All invoices' },
  ];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Invoices</div><div className="page-subtitle">All generated invoices</div></div>
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
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select className="filter-select page-size-select" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={PAGE_SIZE_OPTIONS} />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={async () => {
                const params: Record<string, string> = { limit: '5000', page: '1' };
                if (search.trim()) params.search = search.trim();
                const res = await api.get('/payments', { params });
                exportExcelRows('invoices', 'Invoices', (res.data?.data || []) as Record<string, unknown>[]);
              }}
            >
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm"><PlusCircle size={13} /> Generate Invoice</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead><tr><th className="sno-col">S NO</th><th>Invoice #</th><th>Customer</th><th>Description</th><th>Amount ({getActiveCurrency()})</th><th>Invoice Date</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={9} />) :
                payments.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState icon={<PlusCircle size={20} />} title="No invoices generated yet" />
                    </td>
                  </tr>
                ) : (
                  payments.map((p, idx) => {
                    const cust = typeof p.customer === 'object' ? p.customer : null;
                    return (
                      <tr key={p._id}>
                        <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{p.invoiceNo}</span></td>
                        <td><span style={{ fontSize: 12.5 }}>{cust?.name || '—'}</span></td>
                        <td style={{ fontSize: 12.5 }}>{p.description || p.paymentType}</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(p.amount || 0).toLocaleString()}</span></td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--tx-4)' }}>{fmt.date(p.paymentDate)}</td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--tx-4)' }}>{fmt.date(p.dueDate)}</td>
                        <td><Badge status={p.status} /></td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn-ghost btn-xs" onClick={() => { setActivePayment(p); setInvoiceOpen(true); }}>View</button>
                            <button className="btn btn-ghost btn-xs">Print</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              }
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
      </div>

      <Modal
        open={invoiceOpen && !!activePayment}
        onClose={() => { setInvoiceOpen(false); setActivePayment(null); }}
        title="Invoice"
        size="md"
      >
        {!activePayment ? null : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, color: 'var(--brand)', fontSize: 13 }}>
                  {activePayment.invoiceNo}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activePayment.description || activePayment.paymentType}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 3 }}>
                  {typeof activePayment.customer === 'object' ? activePayment.customer?.name : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 900 }}>
                  {fmt.currency(activePayment.amount || 0)}
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <Badge status={activePayment.status} />
                </div>
              </div>
            </div>

            <div className="details-grid">
              <DetailItem label="Invoice Date" value={<span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.date(activePayment.paymentDate)}</span>} />
              <DetailItem label="Due Date" value={activePayment.dueDate ? <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.date(activePayment.dueDate)}</span> : '—'} />
              <DetailItem label="Method" value={activePayment.method} />
              <DetailItem label="Reference" value={activePayment.transactionRef || '—'} />
              <DetailItem label="Type" value={activePayment.paymentType} />
              <DetailItem label="Remarks" value={activePayment.remarks || '—'} />
            </div>

            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <InvoiceWhatsAppAction payment={activePayment} buttonLabel="Send via WhatsApp" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
