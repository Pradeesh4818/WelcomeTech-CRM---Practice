import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageCircle, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Payment, Customer } from '../../types';
import { Modal, Select } from '../ui';
import { fmt } from '../../utils/helpers';

const cleanText = (value: unknown): string => String(value || '').trim();

export const customerWhatsappNumberOf = (customer?: Customer | null): string => {
  if (!customer) return '';
  return cleanText(customer.primaryContactInfo?.whatsapp) ||
    cleanText(customer.keyContacts?.find((contact) => cleanText(contact.whatsapp))?.whatsapp) ||
    cleanText(customer.secondaryContactInfo?.whatsapp) ||
    cleanText(customer.primaryContactInfo?.mobile) ||
    cleanText(customer.keyContacts?.find((contact) => cleanText(contact.mobile))?.mobile) ||
    cleanText(customer.secondaryContactInfo?.mobile) ||
    cleanText(customer.phone);
};

export const buildInvoiceShareMessage = (payment: Payment): string => {
  const customerName = typeof payment.customer === 'object' ? payment.customer?.name : 'Customer';
  const dueDateStr = payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : 'N/A';
  return [
    `Dear ${customerName},`,
    '',
    `Here are the details of invoice *${payment.invoiceNo}*:`,
    `- Description: ${payment.description || payment.paymentType}`,
    `- Amount: ${fmt.currency(payment.amount || 0)}`,
    `- Due Date: ${dueDateStr}`,
    `- Status: *${String(payment.status || 'pending').toUpperCase()}*`,
    '',
    `Thank you for your business.`,
  ].join('\n');
};

interface InvoiceWhatsAppActionProps {
  payment: Payment;
  buttonLabel?: string;
  iconOnly?: boolean;
  className?: string;
  title?: string;
}

export const InvoiceWhatsAppAction: React.FC<InvoiceWhatsAppActionProps> = ({
  payment,
  buttonLabel = 'WhatsApp',
  iconOnly = false,
  className,
  title,
}) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    messageType: 'text',
    message: '',
    templateName: '',
    languageCode: 'en_US',
  });

  const whatsappMut = useMutation({
    mutationFn: async (payload: any) => {
      if (!payment?._id) throw new Error('Payment ID is required');
      const res = await api.post(`/payments/${payment._id}/whatsapp`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Invoice details sent to customer');
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to send WhatsApp message');
    },
  });

  const openModal = () => {
    if (!payment) {
      toast.error('Invoice details not available');
      return;
    }
    setForm({
      messageType: 'text',
      message: buildInvoiceShareMessage(payment),
      templateName: '',
      languageCode: 'en_US',
    });
    setOpen(true);
  };

  const send = () => {
    const payload = form.messageType === 'template'
      ? { messageType: 'template', templateName: form.templateName, languageCode: form.languageCode }
      : { messageType: 'text', message: form.message };
    whatsappMut.mutate(payload);
  };

  const customerObj = typeof payment.customer === 'object' ? payment.customer : null;
  const number = customerObj ? customerWhatsappNumberOf(customerObj) : '';
  const buttonTitle = title || `Send Invoice via WhatsApp${number ? ` to ${number}` : ''}`;
  const disabled = whatsappMut.isPending || !customerObj;

  return (
    <>
      <button
        type="button"
        className={className || (iconOnly ? 'btn-action btn-action-green' : 'btn btn-success btn-sm')}
        title={buttonTitle}
        onClick={openModal}
        disabled={disabled}
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <MessageCircle size={13} />
        {!iconOnly ? <span>{buttonLabel}</span> : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send Invoice via WhatsApp"
        size="md"
        footer={(
          <div className="flex justify-end gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={send}
              disabled={whatsappMut.isPending || (form.messageType === 'template' ? !form.templateName.trim() : !form.message.trim())}
            >
              <Send size={14} />
              {whatsappMut.isPending ? 'Sending...' : 'Send WhatsApp'}
            </button>
          </div>
        )}
      >
        {customerObj ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bd)', flexShrink: 0 }}>
                <MessageCircle size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--tx-1)' }}>{customerObj.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 2 }}>
                  Invoice: <strong style={{ color: 'var(--brand)' }}>{payment.invoiceNo}</strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx-4)', marginTop: 2 }}>
                  Recipient phone: <strong style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)' }}>{number || 'Not available'}</strong>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Message Type</label>
              <Select
                value={form.messageType}
                onChange={(value) => setForm((prev) => ({ ...prev, messageType: value }))}
                options={[
                  { value: 'text', label: 'Free-form Text' },
                  { value: 'template', label: 'Approved Template' },
                ]}
              />
            </div>

            {form.messageType === 'template' ? (
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Template Name</label>
                  <input className="form-control" value={form.templateName} onChange={(e) => setForm((prev) => ({ ...prev, templateName: e.target.value }))} placeholder="Approved template name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Language Code</label>
                  <input className="form-control" value={form.languageCode} onChange={(e) => setForm((prev) => ({ ...prev, languageCode: e.target.value }))} placeholder="en_US" />
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Invoice Message Preview</label>
                <textarea className="form-control" rows={8} value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} placeholder="Type WhatsApp message..." />
              </div>
            )}

            <div style={{ padding: 12, borderRadius: 12, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.16)', color: 'var(--tx-3)', fontSize: 11.5, lineHeight: 1.55 }}>
              Free-form text works only inside Meta's 24-hour service window. Use an approved template if the customer has not messaged you recently.
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default InvoiceWhatsAppAction;
