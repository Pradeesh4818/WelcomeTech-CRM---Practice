import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Send, AlertTriangle, CheckCircle, Clock, Users, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, Select, Spinner } from '../ui';

export interface BulkEmailTarget {
  id: string;
  customerName: string;
  email: string;
  cc?: string;
  templateId?: string;
  dynamicData?: Record<string, string>;
}

export interface BulkEmailModalProps {
  open: boolean;
  onClose: () => void;
  targets: BulkEmailTarget[];
  initialTemplateId?: string;
  onComplete?: () => void;
}

export const BulkEmailModal: React.FC<BulkEmailModalProps> = ({
  open,
  onClose,
  targets,
  initialTemplateId = '',
  onComplete,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    statusMap: Record<string, 'pending' | 'sending' | 'sent' | 'failed'>;
    errorMap: Record<string, string>;
    isCompleted: boolean;
    successCount: number;
    failedCount: number;
  }>({
    current: 0,
    total: 0,
    currentName: '',
    statusMap: {},
    errorMap: {},
    isCompleted: false,
    successCount: 0,
    failedCount: 0,
  });

  useEffect(() => {
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
    }
  }, [initialTemplateId, open]);

  // Reset progress when modal opens or closes
  useEffect(() => {
    if (open) {
      setIsSending(false);
      setSendProgress({
        current: 0,
        total: 0,
        currentName: '',
        statusMap: {},
        errorMap: {},
        isCompleted: false,
        successCount: 0,
        failedCount: 0,
      });
    }
  }, [open]);

  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const res = await api.get('/email-templates');
      return (res.data?.data || []) as Array<{ _id: string; name: string; subject: string; body: string }>;
    },
    enabled: open,
  });

  const validTargets = targets.filter(t => t.email && t.email.includes('@'));
  const invalidTargets = targets.filter(t => !t.email || !t.email.includes('@'));

  const selectedTemplate = templates?.find(t => t._id === selectedTemplateId);

  const handleStartBroadcast = async () => {
    if (!selectedTemplateId) {
      toast.error('Please select an email template');
      return;
    }
    if (validTargets.length === 0) {
      toast.error('No valid recipient email addresses found');
      return;
    }

    setIsSending(true);
    const total = validTargets.length;
    const initialStatusMap: Record<string, 'pending' | 'sending' | 'sent' | 'failed'> = {};
    validTargets.forEach(t => {
      initialStatusMap[t.id || t.email] = 'pending';
    });

    setSendProgress({
      current: 0,
      total,
      currentName: validTargets[0]?.customerName || '',
      statusMap: initialStatusMap,
      errorMap: {},
      isCompleted: false,
      successCount: 0,
      failedCount: 0,
    });

    let successCount = 0;
    let failedCount = 0;
    const currentStatusMap = { ...initialStatusMap };
    const currentErrorMap: Record<string, string> = {};

    for (let i = 0; i < validTargets.length; i++) {
      const t = validTargets[i];
      const key = t.id || t.email;

      // Update current sending item
      currentStatusMap[key] = 'sending';
      setSendProgress(prev => ({
        ...prev,
        currentName: t.customerName,
        statusMap: { ...currentStatusMap },
      }));

      try {
        await api.post(
          '/email-templates/send',
          {
            to: t.email,
            cc: t.cc,
            templateId: t.templateId || selectedTemplateId,
            dynamicData: t.dynamicData,
          },
          { timeout: 60000 }
        );

        currentStatusMap[key] = 'sent';
        successCount++;
      } catch (err: any) {
        currentStatusMap[key] = 'failed';
        currentErrorMap[key] = err?.response?.data?.message || err?.message || 'Send failed';
        failedCount++;
      }

      setSendProgress(prev => ({
        ...prev,
        current: i + 1,
        successCount,
        failedCount,
        statusMap: { ...currentStatusMap },
        errorMap: { ...currentErrorMap },
      }));

      // Short delay for visual smoothness & SMTP safety
      if (i < validTargets.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    setSendProgress(prev => ({
      ...prev,
      isCompleted: true,
      currentName: '',
    }));

    if (failedCount > 0) {
      toast.success(`Bulk Email Complete: ${successCount} sent, ${failedCount} failed.`);
    } else {
      toast.success(`Successfully sent all ${successCount} emails in bulk!`);
    }
  };

  const handleCloseModal = () => {
    if (isSending && !sendProgress.isCompleted) {
      if (!window.confirm('Broadcast is currently in progress. Are you sure you want to stop watching?')) {
        return;
      }
    }
    onClose();
    if (sendProgress.isCompleted && onComplete) {
      onComplete();
    }
  };

  const templateOptions = (templates || []).map(t => ({
    value: t._id,
    label: t.name || t.subject || 'Untitled Template',
  }));

  const progressPercent = sendProgress.total > 0
    ? Math.min(100, Math.round((sendProgress.current / sendProgress.total) * 100))
    : 0;

  return (
    <Modal
      open={open}
      onClose={handleCloseModal}
      title="Bulk Email Broadcast & Live Sending"
      size="xl"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <button
            className="btn btn-ghost"
            onClick={handleCloseModal}
            disabled={isSending && !sendProgress.isCompleted}
          >
            {sendProgress.isCompleted ? 'Close' : 'Cancel'}
          </button>

          {sendProgress.isCompleted ? (
            <button
              className="btn btn-primary"
              onClick={handleCloseModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', fontWeight: 700 }}
            >
              <CheckCircle size={16} />
              Done & Refresh Table
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleStartBroadcast}
              disabled={isSending || !selectedTemplateId || validTargets.length === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontWeight: 700 }}
            >
              {isSending ? <Spinner size={15} /> : <Send size={15} />}
              {isSending
                ? `Sending Broadcast (${sendProgress.current} / ${sendProgress.total})...`
                : `Confirm & Send Broadcast (${validTargets.length})`}
            </button>
          )}
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Recipient summary cards */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 14,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--brand-light)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800 }}>Total Selected</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)' }}>{targets.length} Records</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--green-bg)',
                color: 'var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle size={18} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800 }}>Valid Recipients</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>{validTargets.length} Ready</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: invalidTargets.length ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface)',
                color: invalidTargets.length ? 'var(--red)' : 'var(--tx-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {invalidTargets.length ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800 }}>Skipped (No Email)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: invalidTargets.length ? 'var(--red)' : 'var(--tx-3)' }}>
                {invalidTargets.length} Records
              </div>
            </div>
          </div>
        </div>

        {/* Live Sending Progress Bar & Ratio (Downloading-style popup card) */}
        {isSending && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 14,
              background: sendProgress.isCompleted
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)'
                : 'linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)',
              border: `1px solid ${sendProgress.isCompleted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(124, 58, 237, 0.25)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {sendProgress.isCompleted ? (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <CheckCircle size={16} />
                  </div>
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
                    <Spinner size={15} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)' }}>
                    {sendProgress.isCompleted ? 'Broadcast Complete' : 'Sending Bulk Email Broadcast'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>
                    Sending Ratio: <strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{sendProgress.current} / {sendProgress.total}</strong> Dispatched
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: sendProgress.isCompleted ? '#10b981' : 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
                  {progressPercent}%
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: sendProgress.failedCount > 0 ? 'var(--red)' : '#10b981' }}>
                  {sendProgress.successCount} Sent{sendProgress.failedCount > 0 ? ` • ${sendProgress.failedCount} Failed` : ''}
                </div>
              </div>
            </div>

            {/* Progress Track & Animated Bar */}
            <div
              style={{
                width: '100%',
                height: 10,
                borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: sendProgress.isCompleted
                    ? (sendProgress.failedCount > 0 ? 'linear-gradient(90deg, #10b981, #f59e0b)' : '#10b981')
                    : 'linear-gradient(90deg, #7c3aed 0%, #6366f1 100%)',
                  transition: 'width 0.25s ease',
                  boxShadow: '0 0 12px rgba(124, 58, 237, 0.45)',
                }}
              />
            </div>

            {!sendProgress.isCompleted && sendProgress.currentName && (
              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
                <span>Currently sending PDF email to: <strong style={{ color: 'var(--tx-1)' }}>{sendProgress.currentName}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Template Selector (disabled while sending) */}
        {!isSending && (
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>
              Broadcast Template <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <Select
              value={selectedTemplateId}
              onChange={setSelectedTemplateId}
              options={[
                { value: '', label: '— Choose an Email Template for Broadcast —' },
                ...templateOptions,
              ]}
              disabled={loadingTemplates || isSending}
            />
          </div>
        )}

        {/* Tabular Customer & Email Confirmation Table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-3)' }}>
              Recipient Verification & Live Progress
            </div>
            <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>
              {isSending ? `${sendProgress.current} of ${sendProgress.total} Processed` : `Showing ${targets.length} recipients`}
            </span>
          </div>

          <div className="bulk-verification-wrap">
            <table className="bulk-verification-table">
              <thead>
                <tr>
                  <th className="col-sno">S NO</th>
                  <th className="col-company">COMPANY NAME</th>
                  <th className="col-contact">MAIL ID</th>
                  <th className="col-template">TEMPLATE</th>
                  <th className="col-status">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t, idx) => {
                  const isValid = t.email && t.email.includes('@');
                  const tplName = (t.templateId && templates?.find(x => x._id === t.templateId)?.name) ||
                                  selectedTemplate?.name ||
                                  'Selected Template';
                  const itemKey = t.id || t.email;
                  const itemStatus = sendProgress.statusMap[itemKey];

                  return (
                    <tr
                      key={t.id || idx}
                      style={{
                        background: itemStatus === 'sending'
                          ? 'rgba(124, 58, 237, 0.06)'
                          : (!isValid ? 'rgba(239, 68, 68, 0.04)' : undefined),
                      }}
                    >
                      <td className="col-sno" style={{ fontSize: 12, color: 'var(--tx-4)', fontWeight: 600 }}>
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="col-company">
                        <div className="col-company-cell">
                          <span className="col-company-name">
                            {t.customerName}
                          </span>
                        </div>
                      </td>
                      <td className="col-contact">
                        {t.email ? (
                          <span style={{ color: 'var(--tx-2)' }}>{t.email}</span>
                        ) : (
                          <span style={{ color: 'var(--red)', fontStyle: 'italic', fontWeight: 600 }}>No Email Address</span>
                        )}
                      </td>
                      <td className="col-template">
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--brand)',
                            background: 'var(--brand-light)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                            maxWidth: '160px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tplName}
                        </span>
                      </td>
                      <td className="col-status">
                        {isSending ? (
                          itemStatus === 'sending' ? (
                            <span className="badge" style={{ background: 'rgba(124, 58, 237, 0.12)', color: 'var(--brand)', fontSize: 10, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Spinner size={10} /> Sending...
                            </span>
                          ) : itemStatus === 'sent' ? (
                            <span className="badge badge-green" style={{ fontSize: 10, padding: '3px 8px' }}>
                              <CheckCircle size={11} style={{ marginRight: 3 }} /> Sent ✓
                            </span>
                          ) : itemStatus === 'failed' ? (
                            <span className="badge badge-red" style={{ fontSize: 10, padding: '3px 8px' }} title={sendProgress.errorMap[itemKey] || 'Failed to send'}>
                              <XCircle size={11} style={{ marginRight: 3 }} /> Failed ✗
                            </span>
                          ) : isValid ? (
                            <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--tx-3)', fontSize: 10, padding: '3px 8px' }}>
                              <Clock size={10} style={{ marginRight: 3 }} /> Queued
                            </span>
                          ) : (
                            <span className="badge badge-red" style={{ fontSize: 10, padding: '3px 8px' }}>
                              <XCircle size={11} style={{ marginRight: 3 }} /> Skipped
                            </span>
                          )
                        ) : (
                          isValid ? (
                            <span className="badge badge-green" style={{ fontSize: 10, padding: '3px 8px' }}>
                              <CheckCircle size={11} style={{ marginRight: 3 }} /> Ready
                            </span>
                          ) : (
                            <span className="badge badge-red" style={{ fontSize: 10, padding: '3px 8px' }}>
                              <XCircle size={11} style={{ marginRight: 3 }} /> Missing Email
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Template Subject Preview */}
        {selectedTemplate && !isSending && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 16px',
              background: 'var(--surface-2)',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--brand)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
              Template Subject Preview (with PDF attachment)
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>
              {selectedTemplate.subject}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkEmailModal;
