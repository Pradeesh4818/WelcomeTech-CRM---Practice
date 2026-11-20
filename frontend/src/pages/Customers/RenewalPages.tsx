import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import { Customer } from '../../types';
import { fmt, getActiveCurrency } from '../../utils/helpers';
import { SelectField, Modal, InputField, Spinner, Avatar } from '../../components/ui';
import toast from 'react-hot-toast';

const hasTDL = (c: Customer) => c.tdlDetails?.status === 'active' || c.tdlDetails?.status === 'trial' || !!c.serialNoInfo?.[0]?.isAmcActive;
const hasCloud = (c: Customer) => !!c.cloudDetails?.vendor || !!c.cloudDetails?.cloudExpiryDate;
const hasTSS = (c: Customer) => !!c.serialNoInfo?.[0]?.tssExpiryDate || !!c.serialNoInfo?.[0]?.endDate || !!c.tssDetails?.endDate;

const calculateRenewalExpiry = (startDateStr: string, period = '1 Year'): string => {
  if (!startDateStr) return '';
  const rawStr = startDateStr.split('T')[0].trim();
  const parts = rawStr.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const dt = new Date(year, month, day);
  if (period === '6 Months') dt.setMonth(dt.getMonth() + 6);
  else if (period === '2 Years') dt.setFullYear(dt.getFullYear() + 2);
  else if (period === '3 Years') dt.setFullYear(dt.getFullYear() + 3);
  else dt.setFullYear(dt.getFullYear() + 1);

  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ─── SERVICE REMINDER MODAL ────────────────────────
const ServiceReminderModal: React.FC<{ open: boolean; onClose: () => void; customer: Customer | null; serviceType: 'TDL' | 'Cloud' | 'TSS' }> = ({ open, onClose, customer, serviceType }) => {
  const [sending, setSending] = useState(false);
  const [method, setMethod] = useState<'whatsapp' | 'email'>('whatsapp');

  const expiryDate = useMemo(() => {
    if (!customer) return null;
    if (serviceType === 'TDL') return customer.tdlDetails?.endDate;
    if (serviceType === 'Cloud') return customer.cloudDetails?.cloudExpiryDate;
    if (serviceType === 'TSS') return customer.tssDetails?.endDate || customer.serialNoInfo?.[0]?.tssExpiryDate || customer.serialNoInfo?.[0]?.endDate;
    return null;
  }, [customer, serviceType]);

  const handleSend = () => {
    setSending(true);
    api.post('/notifications/reminder', {
      targetType: 'customer',
      targetId: customer?._id,
      method,
      payload: { serviceType, expiryDate },
    }).then(() => {
      toast.success(`Reminder queued for ${customer?.name} via ${method.toUpperCase()}`);
      setSending(false);
      onClose();
    }).catch((err) => {
      setSending(false);
      toast.error(err?.response?.data?.message || 'Failed to queue reminder');
    });
  };

  const msg = `Dear ${customer?.name || 'Customer'},\n\nYour ${serviceType} service is expiring on ${fmt.date(expiryDate)}.\n\nTo ensure uninterrupted service, please renew at your earliest convenience.\n\nThank you,\nWelcomeTech Support`;

  return (
    <Modal open={open} onClose={onClose} title={`Send ${serviceType} Reminder`} footer={
      <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
        {sending ? <Spinner size={14} /> : <RefreshCw size={14} />}
        {sending ? 'Sending...' : `Send via ${method === 'whatsapp' ? 'WhatsApp' : 'Email'}`}
      </button>
    }>
      <div className="form-group">
        <label className="form-label">Customer Contact</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <Avatar name={customer?.name} size="sm" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{customer?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>{customer?.phone || 'No phone'} • {customer?.email || 'No email'}</div>
          </div>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Delivery Method</label>
        <div className="actions-row">
          <button className={`btn btn-sm ${method === 'whatsapp' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMethod('whatsapp')}>WhatsApp</button>
          <button className={`btn btn-sm ${method === 'email' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMethod('email')}>Email</button>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Message Preview</label>
        <textarea className="form-control" rows={8} readOnly value={msg} style={{ fontSize: 12, background: 'var(--surface-3)', color: 'var(--tx-2)' }} />
      </div>
    </Modal>
  );
};

// ─── TDL RENEWAL PAGE ────────────────────────────
export const TDLRenewalPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [remindCustomer, setRemindCustomer] = useState<Customer | null>(null);

  const initialId = searchParams.get('customerId') || '';

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-all'],
    queryFn: async () => { const r = await api.get('/customers?all=true'); return r.data.data as Customer[]; },
  });

  const tdlCustomers = useMemo(() => (customers || []).filter(hasTDL), [customers]);

  const [form, setForm] = useState({
    customerId: initialId,
    newStartDate: '',
    newExpiryDate: '',
    amount: '',
    period: '1 Year',
    paymentMethod: 'Bank Transfer',
    invoiceNo: '',
    notes: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });

  const set = (field: keyof typeof form, value: string) => {
    setForm((p) => {
      const next = { ...p, [field]: value };
      if (field === 'newStartDate' || field === 'period') {
        const start = field === 'newStartDate' ? value : p.newStartDate;
        const period = field === 'period' ? value : p.period;
        if (start) {
          next.newExpiryDate = calculateRenewalExpiry(start, period);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (initialId) set('customerId', initialId);
  }, [initialId]);

  const selected = useMemo(() => tdlCustomers.find((c) => c._id === form.customerId) || null, [tdlCustomers, form.customerId]);

  useEffect(() => {
    if (!selected) return;
    api.get(`/renewals/tdl/${selected._id}/prefill`).then((res) => {
      const data = res.data?.data || {};
      setForm((p) => ({
        ...p,
        newStartDate: data.newStartDate || '',
        newExpiryDate: data.newExpiryDate || '',
        details: data.moduleDetails?.details || '',
        actualPrice: data.moduleDetails?.actualPrice != null ? String(data.moduleDetails.actualPrice) : '',
        discount: data.moduleDetails?.discount != null ? String(data.moduleDetails.discount) : '',
        currentPrice: data.moduleDetails?.currentPrice != null ? String(data.moduleDetails.currentPrice) : '',
        advance1: data.moduleDetails?.advance1 != null ? String(data.moduleDetails.advance1) : '',
        advance2: data.moduleDetails?.advance2 != null ? String(data.moduleDetails.advance2) : '',
        remainingTotal: data.moduleDetails?.remainingTotal != null ? String(data.moduleDetails.remainingTotal) : '',
        others: data.moduleDetails?.others || '',
      }));
    }).catch(() => {});
  }, [selected]);

  const renewMut = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const payload = {
        newStartDate: form.newStartDate,
        newExpiryDate: form.newExpiryDate,
        moduleDetails: {
          companyType: selected?.branchInfo?.isBranch ? 'branch' : 'head_office',
          companyName: selected?.name || undefined,
          address: selected?.address || undefined,
          details: form.details || undefined,
          actualPrice: form.actualPrice ? Number(form.actualPrice) : undefined,
          discount: form.discount ? Number(form.discount) : undefined,
          currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
          advance1: form.advance1 ? Number(form.advance1) : undefined,
          advance2: form.advance2 ? Number(form.advance2) : undefined,
          others: form.others || undefined,
        },
        renewalData: {
          renewedOn: new Date().toISOString(),
          period: form.period,
          amount,
          paymentMethod: form.paymentMethod,
          invoiceNo: form.invoiceNo || undefined,
          notes: form.notes || undefined,
        },
      };
      await api.patch(`/tdl/${form.customerId}/renew`, payload);
    },
    meta: { invalidateQueryKeys: [['customers'], ['customers-all'], ['customers-management-pages'], ['customers-management-insights']] },
    onSuccess: () => {
      toast.success('TDL renewal processed');
      navigate('/tdl/history');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to renew TDL'),
  });

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">TDL Renewals</div><div className="page-subtitle">Process TDL renewals and track history</div></div>
      </div>
      <div className="panel-grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Process TDL Renewal</span></div>
          <div className="card-body">
            <SelectField
              label="Customer"
              value={form.customerId}
              onChange={(v) => {
                set('customerId', v);
                setSearchParams(v ? { customerId: v } : {});
              }}
              options={tdlCustomers.map((c) => ({ value: c._id, label: `${c.name} (exp ${fmt.date(c.tdlDetails?.endDate)})` }))}
              placeholder={customersLoading ? 'Loading customers...' : '— Select Customer —'}
              required
            />
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Company Type</label><input className="form-control" value={selected?.branchInfo?.isBranch ? 'Branch' : 'Head Office'} disabled /></div>
              <div className="form-group"><label className="form-label">Company Name</label><input className="form-control" value={selected?.name || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={selected?.address || '—'} disabled /></div>
              <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
              <div className="form-group"><label className="form-label">Status</label><input className="form-control" value={selected?.tdlDetails?.status || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Serial No</label><input className="form-control" value={selected?.tdlDetails?.licenseSerialNo || '—'} disabled /></div>
              <SelectField
                label="Period"
                value={form.period}
                onChange={(v) => set('period', v)}
                options={[{ value: '6 Months', label: '6 Months' }, { value: '1 Year', label: '1 Year' }, { value: '2 Years', label: '2 Years' }]}
              />
              <InputField label="Renewal Start Date" value={form.newStartDate} onChange={(v) => set('newStartDate', v)} type="date" required />
              <InputField label="Renewal End Date" value={form.newExpiryDate} onChange={(v) => set('newExpiryDate', v)} type="date" required />
              <InputField label={`Amount (${getActiveCurrency()})`} value={form.amount} onChange={(v) => set('amount', v)} type="number" placeholder="e.g. 500" required />
              <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
              <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
              <InputField
                label="Current Price"
                value={form.currentPrice}
                onChange={(v) => set('currentPrice', v)}
                type="number"
              />
              <InputField
                label="Advance 1"
                value={form.advance1}
                onChange={(v) => set('advance1', v)}
                type="number"
              />
              <InputField
                label="Advance 2"
                value={form.advance2}
                onChange={(v) => set('advance2', v)}
                type="number"
              />
              <div className="form-group"><label className="form-label">Remaining Total</label><input className="form-control" value={form.remainingTotal || 'Will calculate after save'} readOnly /></div>
              <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
              <SelectField
                label="Payment Method"
                value={form.paymentMethod}
                onChange={(v) => set('paymentMethod', v)}
                options={[{ value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Cash', label: 'Cash' }, { value: 'Cheque', label: 'Cheque' }, { value: 'QPAY', label: 'QPAY' }]}
              />
              <InputField label="Invoice No" value={form.invoiceNo} onChange={(v) => set('invoiceNo', v)} placeholder="INV-001" />
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            <div className="actions-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => renewMut.mutate()} disabled={renewMut.isPending || !form.customerId}>
                {renewMut.isPending ? <Spinner size={13} /> : <CheckCircle size={13} />} Process Renewal
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRemindCustomer(selected)} disabled={!form.customerId}>Send Reminder</button>
            </div>
          </div>
        </div>
      </div>
      <ServiceReminderModal open={!!remindCustomer} onClose={() => setRemindCustomer(null)} customer={remindCustomer} serviceType="TDL" />
    </div>
  );
};

// ─── CLOUD RENEWAL PAGE ──────────────────────────
export const CloudRenewalPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [remindCustomer, setRemindCustomer] = useState<Customer | null>(null);

  const initialId = searchParams.get('customerId') || '';

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-all'],
    queryFn: async () => { const r = await api.get('/customers?all=true'); return r.data.data as Customer[]; },
  });

  const cloudCustomers = useMemo(() => (customers || []).filter(hasCloud), [customers]);

  const [form, setForm] = useState({
    customerId: initialId,
    newStartDate: '',
    newExpiryDate: '',
    amount: '',
    period: '1 Year',
    paymentMethod: 'Bank Transfer',
    invoiceNo: '',
    notes: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });

  const set = (field: keyof typeof form, value: string) => {
    setForm((p) => {
      const next = { ...p, [field]: value };
      if (field === 'newStartDate' || field === 'period') {
        const start = field === 'newStartDate' ? value : p.newStartDate;
        const period = field === 'period' ? value : p.period;
        if (start) {
          next.newExpiryDate = calculateRenewalExpiry(start, period);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (initialId) set('customerId', initialId);
  }, [initialId]);

  const selected = useMemo(() => cloudCustomers.find((c) => c._id === form.customerId) || null, [cloudCustomers, form.customerId]);

  useEffect(() => {
    if (!selected) return;
    api.get(`/renewals/cloud/${selected._id}/prefill`).then((res) => {
      const data = res.data?.data || {};
      setForm((p) => ({
        ...p,
        newStartDate: data.newStartDate || '',
        newExpiryDate: data.newExpiryDate || '',
        details: data.moduleDetails?.details || '',
        actualPrice: data.moduleDetails?.actualPrice != null ? String(data.moduleDetails.actualPrice) : '',
        discount: data.moduleDetails?.discount != null ? String(data.moduleDetails.discount) : '',
        currentPrice: data.moduleDetails?.currentPrice != null ? String(data.moduleDetails.currentPrice) : '',
        advance1: data.moduleDetails?.advance1 != null ? String(data.moduleDetails.advance1) : '',
        advance2: data.moduleDetails?.advance2 != null ? String(data.moduleDetails.advance2) : '',
        remainingTotal: data.moduleDetails?.remainingTotal != null ? String(data.moduleDetails.remainingTotal) : '',
        others: data.moduleDetails?.others || '',
      }));
    }).catch(() => {});
  }, [selected]);

  const renewMut = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const payload = {
        newStartDate: form.newStartDate,
        newExpiryDate: form.newExpiryDate,
        moduleDetails: {
          companyType: selected?.branchInfo?.isBranch ? 'branch' : 'head_office',
          companyName: selected?.name || undefined,
          address: selected?.address || undefined,
          details: form.details || undefined,
          actualPrice: form.actualPrice ? Number(form.actualPrice) : undefined,
          discount: form.discount ? Number(form.discount) : undefined,
          currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
          advance1: form.advance1 ? Number(form.advance1) : undefined,
          advance2: form.advance2 ? Number(form.advance2) : undefined,
          others: form.others || undefined,
        },
        renewalData: {
          renewedOn: new Date().toISOString(),
          period: form.period,
          amount,
          paymentMethod: form.paymentMethod,
          invoiceNo: form.invoiceNo || undefined,
          notes: form.notes || undefined,
        },
      };
      await api.patch(`/cloud/${form.customerId}/renew`, payload);
    },
    meta: { invalidateQueryKeys: [['customers'], ['customers-all'], ['customers-management-pages'], ['customers-management-insights']] },
    onSuccess: () => {
      toast.success('Cloud renewal processed');
      navigate('/cloud/history');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to renew Cloud'),
  });

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Cloud Renewals</div><div className="page-subtitle">Process Cloud subscription renewals</div></div>
      </div>
      <div className="panel-grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Process Cloud Renewal</span></div>
          <div className="card-body">
            <SelectField
              label="Customer"
              value={form.customerId}
              onChange={(v) => {
                set('customerId', v);
                setSearchParams(v ? { customerId: v } : {});
              }}
              options={cloudCustomers.map((c) => ({ value: c._id, label: `${c.name} (exp ${fmt.date(c.cloudDetails?.cloudExpiryDate)})` }))}
              placeholder={customersLoading ? 'Loading customers...' : '— Select Customer —'}
              required
            />
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Company Type</label><input className="form-control" value={selected?.branchInfo?.isBranch ? 'Branch' : 'Head Office'} disabled /></div>
              <div className="form-group"><label className="form-label">Company Name</label><input className="form-control" value={selected?.name || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={selected?.address || '—'} disabled /></div>
              <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
              <div className="form-group"><label className="form-label">Vendor</label><input className="form-control" value={selected?.cloudDetails?.vendor || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Users</label><input className="form-control" value={selected?.cloudDetails?.noOfUsers || '—'} disabled /></div>
              <SelectField
                label="Period"
                value={form.period}
                onChange={(v) => set('period', v)}
                options={[{ value: '6 Months', label: '6 Months' }, { value: '1 Year', label: '1 Year' }, { value: '2 Years', label: '2 Years' }]}
              />
              <InputField label="Renewal Start Date" value={form.newStartDate} onChange={(v) => set('newStartDate', v)} type="date" required />
              <InputField label="Renewal End Date" value={form.newExpiryDate} onChange={(v) => set('newExpiryDate', v)} type="date" required />
              <InputField label={`Amount (${getActiveCurrency()})`} value={form.amount} onChange={(v) => set('amount', v)} type="number" placeholder="e.g. 1000" required />
              <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
              <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
              <InputField
                label="Current Price"
                value={form.currentPrice}
                onChange={(v) => set('currentPrice', v)}
                type="number"
              />
              <InputField
                label="Advance 1"
                value={form.advance1}
                onChange={(v) => set('advance1', v)}
                type="number"
              />
              <InputField
                label="Advance 2"
                value={form.advance2}
                onChange={(v) => set('advance2', v)}
                type="number"
              />
              <div className="form-group"><label className="form-label">Remaining Total</label><input className="form-control" value={form.remainingTotal || 'Will calculate after save'} readOnly /></div>
              <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
              <SelectField
                label="Payment Method"
                value={form.paymentMethod}
                onChange={(v) => set('paymentMethod', v)}
                options={[{ value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Cash', label: 'Cash' }, { value: 'Cheque', label: 'Cheque' }, { value: 'QPAY', label: 'QPAY' }]}
              />
              <InputField label="Invoice No" value={form.invoiceNo} onChange={(v) => set('invoiceNo', v)} placeholder="INV-001" />
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            <div className="actions-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => renewMut.mutate()} disabled={renewMut.isPending || !form.customerId}>
                {renewMut.isPending ? <Spinner size={13} /> : <CheckCircle size={13} />} Process Renewal
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRemindCustomer(selected)} disabled={!form.customerId}>Send Reminder</button>
            </div>
          </div>
        </div>
      </div>
      <ServiceReminderModal open={!!remindCustomer} onClose={() => setRemindCustomer(null)} customer={remindCustomer} serviceType="Cloud" />
    </div>
  );
};

// ─── TSS RENEWAL PAGE ────────────────────────────
export const TSSRenewalPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [remindCustomer, setRemindCustomer] = useState<Customer | null>(null);

  const initialId = searchParams.get('customerId') || '';

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-all'],
    queryFn: async () => { const r = await api.get('/customers?all=true'); return r.data.data as Customer[]; },
  });

  const tssCustomers = useMemo(() => (customers || []).filter(hasTSS), [customers]);

  const [form, setForm] = useState({
    customerId: initialId,
    newStartDate: '',
    newExpiryDate: '',
    amount: '',
    period: '1 Year',
    paymentMethod: 'Bank Transfer',
    invoiceNo: '',
    notes: '',
    details: '',
    actualPrice: '',
    discount: '',
    currentPrice: '',
    advance1: '',
    advance2: '',
    remainingTotal: '',
    others: '',
  });

  const set = (field: keyof typeof form, value: string) => {
    setForm((p) => {
      const next = { ...p, [field]: value };
      if (field === 'newStartDate' || field === 'period') {
        const start = field === 'newStartDate' ? value : p.newStartDate;
        const period = field === 'period' ? value : p.period;
        if (start) {
          next.newExpiryDate = calculateRenewalExpiry(start, period);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (initialId) set('customerId', initialId);
  }, [initialId]);

  const selected = useMemo(() => tssCustomers.find((c) => c._id === form.customerId) || null, [tssCustomers, form.customerId]);

  useEffect(() => {
    if (!selected) return;
    api.get(`/renewals/tss/${selected._id}/prefill`).then((res) => {
      const data = res.data?.data || {};
      setForm((p) => ({
        ...p,
        newStartDate: data.newStartDate || '',
        newExpiryDate: data.newExpiryDate || '',
        details: data.moduleDetails?.details || '',
        actualPrice: data.moduleDetails?.actualPrice != null ? String(data.moduleDetails.actualPrice) : '',
        discount: data.moduleDetails?.discount != null ? String(data.moduleDetails.discount) : '',
        currentPrice: data.moduleDetails?.currentPrice != null ? String(data.moduleDetails.currentPrice) : '',
        advance1: data.moduleDetails?.advance1 != null ? String(data.moduleDetails.advance1) : '',
        advance2: data.moduleDetails?.advance2 != null ? String(data.moduleDetails.advance2) : '',
        remainingTotal: data.moduleDetails?.remainingTotal != null ? String(data.moduleDetails.remainingTotal) : '',
        others: data.moduleDetails?.others || '',
      }));
    }).catch(() => {});
  }, [selected]);

  const renewMut = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const payload = {
        newStartDate: form.newStartDate,
        newExpiryDate: form.newExpiryDate,
        moduleDetails: {
          companyType: selected?.branchInfo?.isBranch ? 'branch' : 'head_office',
          companyName: selected?.name || undefined,
          address: selected?.address || undefined,
          details: form.details || undefined,
          actualPrice: form.actualPrice ? Number(form.actualPrice) : undefined,
          discount: form.discount ? Number(form.discount) : undefined,
          currentPrice: form.currentPrice ? Number(form.currentPrice) : undefined,
          advance1: form.advance1 ? Number(form.advance1) : undefined,
          advance2: form.advance2 ? Number(form.advance2) : undefined,
          others: form.others || undefined,
        },
        renewalData: {
          renewedOn: new Date().toISOString(),
          period: form.period,
          amount,
          paymentMethod: form.paymentMethod,
          invoiceNo: form.invoiceNo || undefined,
          notes: form.notes || undefined,
        },
      };
      await api.patch(`/tss/${form.customerId}/renew`, payload);
    },
    meta: { invalidateQueryKeys: [['customers'], ['customers-all'], ['customers-management-pages'], ['customers-management-insights']] },
    onSuccess: () => {
      toast.success('TSS renewal processed');
      navigate('/tss/history');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to renew TSS'),
  });

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">TSS Renewals</div><div className="page-subtitle">Process TSS (Tally Software Services) renewals</div></div>
      </div>
      <div className="panel-grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">Process TSS Renewal</span></div>
          <div className="card-body">
            <SelectField
              label="Customer"
              value={form.customerId}
              onChange={(v) => {
                set('customerId', v);
                setSearchParams(v ? { customerId: v } : {});
              }}
              options={tssCustomers.map((c) => ({ value: c._id, label: `${c.name} (exp ${fmt.date(c.tssDetails?.endDate || c.serialNoInfo?.[0]?.tssExpiryDate || c.serialNoInfo?.[0]?.endDate)})` }))}
              placeholder={customersLoading ? 'Loading customers...' : '— Select Customer —'}
              required
            />
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Company Type</label><input className="form-control" value={selected?.branchInfo?.isBranch ? 'Branch' : 'Head Office'} disabled /></div>
              <div className="form-group"><label className="form-label">Company Name</label><input className="form-control" value={selected?.name || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={selected?.address || '—'} disabled /></div>
              <InputField label="Details" value={form.details} onChange={(v) => set('details', v)} />
              <div className="form-group"><label className="form-label">Licence Type</label><input className="form-control" value={selected?.licenceType || '—'} disabled /></div>
              <div className="form-group"><label className="form-label">Current Expiry</label><input className="form-control" value={fmt.date(selected?.tssDetails?.endDate || selected?.serialNoInfo?.[0]?.tssExpiryDate || selected?.serialNoInfo?.[0]?.endDate)} disabled /></div>
              <SelectField
                label="Period"
                value={form.period}
                onChange={(v) => set('period', v)}
                options={[{ value: '1 Year', label: '1 Year' }, { value: '2 Years', label: '2 Years' }]}
              />
              <InputField label="Renewal Start Date" value={form.newStartDate} onChange={(v) => set('newStartDate', v)} type="date" required />
              <InputField label="Renewal End Date" value={form.newExpiryDate} onChange={(v) => set('newExpiryDate', v)} type="date" required />
              <InputField label={`Amount (${getActiveCurrency()})`} value={form.amount} onChange={(v) => set('amount', v)} type="number" placeholder="e.g. 1000" required />
              <InputField label="Actual Price" value={form.actualPrice} onChange={(v) => set('actualPrice', v)} type="number" />
              <InputField label="Discount" value={form.discount} onChange={(v) => set('discount', v)} type="number" />
              <InputField
                label="Current Price"
                value={form.currentPrice}
                onChange={(v) => set('currentPrice', v)}
                type="number"
              />
              <InputField
                label="Advance 1"
                value={form.advance1}
                onChange={(v) => set('advance1', v)}
                type="number"
              />
              <InputField
                label="Advance 2"
                value={form.advance2}
                onChange={(v) => set('advance2', v)}
                type="number"
              />
              <div className="form-group"><label className="form-label">Remaining Total</label><input className="form-control" value={form.remainingTotal || 'Will calculate after save'} readOnly /></div>
              <InputField label="Others" value={form.others} onChange={(v) => set('others', v)} />
              <SelectField
                label="Payment Method"
                value={form.paymentMethod}
                onChange={(v) => set('paymentMethod', v)}
                options={[{ value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Cash', label: 'Cash' }, { value: 'Cheque', label: 'Cheque' }, { value: 'QPAY', label: 'QPAY' }]}
              />
              <InputField label="Invoice No" value={form.invoiceNo} onChange={(v) => set('invoiceNo', v)} placeholder="INV-001" />
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            <div className="actions-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => renewMut.mutate()} disabled={renewMut.isPending || !form.customerId}>
                {renewMut.isPending ? <Spinner size={13} /> : <CheckCircle size={13} />} Process Renewal
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRemindCustomer(selected)} disabled={!form.customerId}>Send Reminder</button>
            </div>
          </div>
        </div>
      </div>
      <ServiceReminderModal open={!!remindCustomer} onClose={() => setRemindCustomer(null)} customer={remindCustomer} serviceType="TSS" />
    </div>
  );
};
