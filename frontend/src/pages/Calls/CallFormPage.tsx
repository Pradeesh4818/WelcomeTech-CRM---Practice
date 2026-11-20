import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, X, PlusCircle, ArrowLeft } from 'lucide-react';
import api from '../../utils/api';
import { Customer, User } from '../../types';
import { InputField, SelectField, Spinner } from '../../components/ui';
import { getActiveCurrency } from '../../utils/helpers';
import toast from 'react-hot-toast';

const ISSUE_TYPES = ['E-Invoice / TSS', 'Installation', 'Data Migration', 'Product Updates', 'Sync Issues', 'AWS / Cloud', 'TDL Issues', 'User Training', 'Configuration', 'Other'];

const CallFormPage: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    customer: '', engineer: '', type: 'remote', issueType: '', subject: '',
    description: '', status: 'open', priority: 'medium',
    callDate: new Date().toISOString().split('T')[0],
    chargeApplicable: false, chargeAmount: '', resolution: '',
  });

  const set = (f: string, v: string | boolean) => setForm((prev) => ({ ...prev, [f]: v }));

  const { data: customers } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const r = await api.get('/customers/lookup');
      return (r.data?.data || []) as Customer[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: engineers } = useQuery({
    queryKey: ['engineers'],
    queryFn: async () => { const r = await api.get('/engineers'); return r.data.data as User[]; },
  });

  const mutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/calls', { ...d, chargeAmount: d.chargeAmount ? Number(d.chargeAmount) : undefined }),
    meta: { invalidateQueryKeys: [['calls']] },
    onSuccess: () => { toast.success('Call logged!'); navigate('/calls'); },
    onError: () => toast.error('Failed to log call'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };
  return (
    <div style={{ paddingTop: 20 }}>
      <div className="page-header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          className="btn-back"
          onClick={() => navigate('/calls')}
          title="Back to Calls"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="page-title">Log Service / Support Call</div>
          <div className="page-subtitle">Record customer issue details, assign engineer and resolution</div>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ paddingBottom: 100 }}>
        <div className="panel-grid-2">
          <div className="card">
            <div className="card-header"><span className="card-title">Call Details</span></div>
            <div className="card-body">
              <SelectField
                label="Customer"
                value={form.customer}
                onChange={(v) => set('customer', v)}
                options={(customers || []).map((c) => ({ value: c._id, label: c.name }))}
                placeholder="— Select Customer —"
                required
                disabled={mutation.isPending}
              />
              <SelectField
                label="Assigned Engineer"
                value={form.engineer}
                onChange={(v) => set('engineer', v)}
                options={(engineers || []).map((e) => ({ value: e._id, label: e.name }))}
                placeholder="— Select Engineer —"
                required
                disabled={mutation.isPending}
              />
              <div className="form-grid-2">
                <SelectField label="Call Type" value={form.type} onChange={(v) => set('type', v)} options={[{ value: 'remote', label: 'Remote' }, { value: 'visit', label: 'Site Visit' }, { value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }]} />
                <SelectField label="Issue Type" value={form.issueType} onChange={(v) => set('issueType', v)} options={ISSUE_TYPES.map((i) => ({ value: i, label: i }))} placeholder="Select issue" required />
              </div>
              <InputField label="Subject" value={form.subject} onChange={(v) => set('subject', v)} required placeholder="Brief description of the issue" />
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Detailed problem description..." rows={4} />
              </div>
            </div>
          </div>
          <div className="panel-stack">
            <div className="card">
              <div className="card-header"><span className="card-title">Status & Priority</span></div>
              <div className="card-body">
                <div className="form-grid-2">
                  <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'in-progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} />
                  <SelectField label="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]} />
                </div>
                <InputField label="Call Date" value={form.callDate} onChange={(v) => set('callDate', v)} type="date" required />
                <div className="form-group">
                  <label className="form-label">Resolution</label>
                  <textarea className="form-control" value={form.resolution} onChange={(e) => set('resolution', e.target.value)} placeholder="Steps taken to resolve..." rows={3} />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Billing</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.chargeApplicable} onChange={(e) => set('chargeApplicable', e.target.checked)} />
                    Charge Applicable
                  </label>
                </div>
                {form.chargeApplicable && (
                  <InputField label={`Charge Amount (${getActiveCurrency()})`} value={form.chargeAmount} onChange={(v) => set('chargeAmount', v)} type="number" placeholder="0.00" />
                )}
              </div>
            </div>
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
            onClick={() => navigate('/calls')}
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

export default CallFormPage;
