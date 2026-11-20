import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, AlertTriangle, CheckCircle, Clock, Users, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Modal, Select, Spinner } from '../ui';

export interface BulkWhatsAppTarget {
  id: string;
  customerName: string;
  phone: string;
  customMessage?: string;
  templateId?: string;
  dynamicData?: Record<string, string>;
}

export interface BulkWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  targets: BulkWhatsAppTarget[];
  onComplete?: () => void;
}

export const BulkWhatsAppModal: React.FC<BulkWhatsAppModalProps> = ({
  open,
  onClose,
  targets,
  onComplete,
}) => {
  const [messageType, setMessageType] = useState<'template' | 'text'>('template');
  const [templateName, setTemplateName] = useState('acuity_cencelschedule_ter');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [freeformMessage, setFreeformMessage] = useState(
    'Hello, this is a renewal update from WelcomeTech regarding your active service agreement. Please let us know if you need assistance.'
  );

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

  const cleanPhone = (p?: string) => String(p || '').replace(/[^\d]/g, '');
  const validTargets = targets.filter(t => cleanPhone(t.phone).length >= 8);
  const invalidTargets = targets.filter(t => cleanPhone(t.phone).length < 8);

  // Reset state when opening
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

  const handleStartBroadcast = async () => {
    if (validTargets.length === 0) {
      toast.error('No valid recipient phone numbers found');
      return;
    }
    if (messageType === 'template' && !templateName.trim()) {
      toast.error('Please enter a WhatsApp template name');
      return;
    }
    if (messageType === 'text' && !freeformMessage.trim()) {
      toast.error('Please enter a message text');
      return;
    }

    setIsSending(true);
    const total = validTargets.length;
    const initialStatusMap: Record<string, 'pending' | 'sending' | 'sent' | 'failed'> = {};
    validTargets.forEach(t => {
      initialStatusMap[t.id || t.phone] = 'pending';
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
      const key = t.id || t.phone;

      // Update current sending item
      currentStatusMap[key] = 'sending';
      setSendProgress(prev => ({
        ...prev,
        currentName: t.customerName,
        statusMap: { ...currentStatusMap },
      }));

      try {
        await api.post(
          '/broadcast/bulk-whatsapp',
          {
            messageType,
            templateName: templateName.trim(),
            languageCode: languageCode.trim(),
            message: freeformMessage.trim(),
            recipients: [
              {
                customerId: t.id,
                phone: t.phone,
                customerName: t.customerName,
                customMessage: t.customMessage || freeformMessage,
                dynamicData: t.dynamicData,
              },
            ],
          },
          { timeout: 30000 }
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

      // Short delay for smoothness & rate limiting
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
      toast.success(`Bulk WhatsApp Complete: ${successCount} sent, ${failedCount} failed.`);
    } else {
      toast.success(`Successfully sent WhatsApp messages to all ${successCount} contacts!`);
    }
  };

  const handleCloseModal = () => {
    if (isSending && !sendProgress.isCompleted) {
      if (!window.confirm('WhatsApp broadcast is in progress. Are you sure you want to stop watching?')) {
        return;
      }
    }
    onClose();
    if (sendProgress.isCompleted && onComplete) {
      onComplete();
    }
  };

  const progressPercent = sendProgress.total > 0
    ? Math.min(100, Math.round((sendProgress.current / sendProgress.total) * 100))
    : 0;

  return (
    <Modal
      open={open}
      onClose={handleCloseModal}
      title="Bulk WhatsApp Broadcast & Live Sending"
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
              style={{
                background: '#10b981',
                borderColor: '#10b981',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                fontWeight: 700,
              }}
            >
              <CheckCircle size={16} />
              Done & Refresh Table
            </button>
          ) : (
            <button
              className="btn btn-sm"
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                fontWeight: 700,
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
              }}
              onClick={handleStartBroadcast}
              disabled={
                isSending ||
                validTargets.length === 0 ||
                (messageType === 'template' ? !templateName.trim() : !freeformMessage.trim())
              }
            >
              {isSending ? <Spinner size={15} /> : <Send size={15} />}
              {isSending
                ? `Sending WhatsApp (${sendProgress.current} / ${sendProgress.total})...`
                : `Confirm & Send WhatsApp (${validTargets.length})`}
            </button>
          )}
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Recipient breakdown banner */}
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
              <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800 }}>Valid Numbers</div>
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
              <div style={{ fontSize: 10, color: 'var(--tx-4)', textTransform: 'uppercase', fontWeight: 800 }}>Skipped (No Phone)</div>
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
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)',
              border: `1px solid ${sendProgress.isCompleted ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)'}`,
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
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                    <Spinner size={15} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)' }}>
                    {sendProgress.isCompleted ? 'Broadcast Complete' : 'Sending Bulk WhatsApp Messages'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>
                    Sending Ratio: <strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{sendProgress.current} / {sendProgress.total}</strong> Dispatched
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
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
                    : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                  transition: 'width 0.25s ease',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.45)',
                }}
              />
            </div>

            {!sendProgress.isCompleted && sendProgress.currentName && (
              <div style={{ fontSize: 11.5, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span>Currently messaging: <strong style={{ color: 'var(--tx-1)' }}>{sendProgress.currentName}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Mode Selector (disabled while sending) */}
        {!isSending && (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>
                WhatsApp Broadcast Mode
              </label>
              <Select
                value={messageType}
                onChange={(v) => setMessageType(v as 'template' | 'text')}
                options={[
                  { value: 'template', label: 'Meta Approved Template (Recommended - 100% Delivery)' },
                  { value: 'text', label: 'Free-form Text (Within 24h conversation window)' },
                ]}
              />
            </div>

            {messageType === 'template' ? (
              <div className="form-grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    Template Name <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    className="form-control"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. acuity_cencelschedule_ter"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>
                    Language Code
                  </label>
                  <input
                    className="form-control"
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                    placeholder="e.g. en_US"
                  />
                </div>
              </div>
            ) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700 }}>
                  Broadcast Message Content
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={freeformMessage}
                  onChange={(e) => setFreeformMessage(e.target.value)}
                  placeholder="Type your WhatsApp notification message..."
                />
              </div>
            )}
          </>
        )}

        {/* Tabular Customer & Phone Confirmation Table */}
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
                  <th className="col-contact">PHONE NUMBER</th>
                  <th className="col-template">TEMPLATE / MESSAGE</th>
                  <th className="col-status">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t, idx) => {
                  const isValid = cleanPhone(t.phone).length >= 8;
                  const itemKey = t.id || t.phone;
                  const itemStatus = sendProgress.statusMap[itemKey];

                  return (
                    <tr
                      key={t.id || idx}
                      style={{
                        background: itemStatus === 'sending'
                          ? 'rgba(16, 185, 129, 0.08)'
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
                        {t.phone ? (
                          <span style={{ color: 'var(--tx-2)' }}>{t.phone}</span>
                        ) : (
                          <span style={{ color: 'var(--red)', fontStyle: 'italic', fontWeight: 600 }}>No Phone Number</span>
                        )}
                      </td>
                      <td className="col-template">
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-block',
                            maxWidth: '160px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {messageType === 'template' ? templateName : 'Freeform Text'}
                        </span>
                      </td>
                      <td className="col-status">
                        {isSending ? (
                          itemStatus === 'sending' ? (
                            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: 10, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                              <XCircle size={11} style={{ marginRight: 3 }} /> Invalid Phone
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
      </div>
    </Modal>
  );
};

export default BulkWhatsAppModal;
