import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, FileText, ExternalLink, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Customer } from '../../types';
import { Modal, Select } from '../ui';
import { useEmailTemplates } from '../../hooks/useEmailTemplate';
import { toAssetUrl } from '../../utils/helpers';

const cleanText = (value: unknown): string => String(value || '').trim();

export const customerWhatsappNumberOf = (customer?: Customer | null): string => {
  if (!customer) return '';
  const candidates = [
    cleanText(customer.primaryContactInfo?.whatsapp),
    cleanText(customer.keyContacts?.find((contact) => cleanText(contact.whatsapp))?.whatsapp),
    cleanText(customer.secondaryContactInfo?.whatsapp),
    cleanText(customer.primaryContactInfo?.mobile),
    cleanText(customer.keyContacts?.find((contact) => cleanText(contact.mobile))?.mobile),
    cleanText(customer.secondaryContactInfo?.mobile),
    cleanText(customer.phone),
  ].filter(Boolean);

  if (candidates.length === 0) return '';
  const primary = candidates[0];
  if (primary.startsWith('+')) return primary;

  const cleanedPrimary = primary.replace(/[^\d]/g, '');
  const withPlus = candidates.find((c) => {
    if (!c.startsWith('+')) return false;
    const cleaned = c.replace(/[^\d]/g, '');
    return cleaned.endsWith(cleanedPrimary) || cleanedPrimary.endsWith(cleaned);
  });

  return withPlus || primary;
};

export const buildCustomerShareMessage = (customer: Customer, context?: string): string => {
  const contactName = cleanText(customer.primaryContactInfo?.contactName1) ||
    cleanText(customer.keyContacts?.[0]?.contactName) ||
    cleanText(customer.contact) ||
    'Customer';
  const products = Array.from(new Set([
    ...(customer.products || []),
    ...(customer.services || []).map((service) => service.product),
    ...(customer.serialNoInfo || []).map((row) => row.product),
  ].map((value) => cleanText(value)).filter(Boolean)));

  return [
    `Hello ${contactName},`,
    '',
    `Sharing your WelcomeTech ${context || 'customer'} details:`,
    `Customer: ${customer.name || customer.companyInfo?.customerName || '-'}`,
    `Products: ${products.length ? products.join(', ') : '-'}`,
    `AMC Status: ${customer.amcStatus || '-'}`,
    '',
    'Thank you.',
  ].join('\n');
};

const interpolateTemplateText = (text: string, data: Record<string, any>): string => {
  let res = text || '';
  Object.entries(data).forEach(([k, v]) => {
    const val = (v === undefined || v === null || v === '' || v === '—') ? '—' : String(v);
    res = res.replace(new RegExp(`{{${k}}}`, 'g'), val);
  });
  res = res
    .replace(/\[Company Name\]/g, data.customerName || data.company_name || '—')
    .replace(/\[Client Name\]/g, data.customerName || data.company_name || '—')
    .replace(/\[Contact Person\]/g, data.contactPerson || data.contact_person || 'Valued Customer')
    .replace(/\[Product\/Service Name\]/g, data.product || data.productName || 'the service')
    .replace(/\[Release\]/g, data.release || data.releaseVersion || '—')
    .replace(/\[Serial No\]/g, data.serialNo || data.serial_no || '—')
    .replace(/\[Expiry Date\]/g, data.expiryDate || data.expiry_date || '—')
    .replace(/\[Amount\]/g, data.amount || '—')
    .replace(/\[Due Date\]/g, data.dueDate || data.due_date || data.expiryDate || data.expiry_date || '—')
    .replace(/\[Start Date\]/g, data.startDate || data.start_date || '—')
    .replace(/\[End Date\]/g, data.endDate || data.end_date || data.expiryDate || data.expiry_date || '—')
    .replace(/\[Phone Number\]/g, data.phone || data.mobile || '—')
    .replace(/\[Email Address\]/g, data.email || data.email_id || '—')
    .replace(/{{[^}]+}}/g, '—');
  return res;
};

interface CustomerWhatsAppActionProps {
  customer?: Customer | null;
  defaultMessage?: string;
  contextLabel?: string;
  buttonLabel?: string;
  iconOnly?: boolean;
  className?: string;
  title?: string;
  selectedTemplateId?: string;
  dynamicData?: Record<string, any>;
  onSuccess?: () => void;
}

export const CustomerWhatsAppAction: React.FC<CustomerWhatsAppActionProps> = ({
  customer,
  defaultMessage,
  contextLabel = 'customer',
  buttonLabel = 'WhatsApp',
  iconOnly = true,
  className,
  title,
  selectedTemplateId,
  dynamicData,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const { data: templates = [] } = useEmailTemplates();
  const [modalTemplateId, setModalTemplateId] = useState<string>('');

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data?.data || res.data;
    },
    staleTime: 60000,
  });

  const { data: propTemplates = [] } = useQuery<any[]>({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      const res = await api.get('/proposal-templates');
      return res.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeProposalTemplate = useMemo(() => {
    return propTemplates.find((t: any) => t.isActive !== false) || propTemplates[0];
  }, [propTemplates]);

  const effectiveHeaderImage = activeProposalTemplate?.templateImage || activeProposalTemplate?.headerImage || settings?.proposalHeaderImage || '';
  const effectiveFooterImage = activeProposalTemplate?.templateFooterImage || activeProposalTemplate?.footerImage || settings?.proposalFooterImage || '';

  const effectiveTemplateId = modalTemplateId || selectedTemplateId || '';

  const selectedEmailTemplate = useMemo(() => {
    if (!effectiveTemplateId) return undefined;
    return templates.find((t) => t._id === effectiveTemplateId);
  }, [templates, effectiveTemplateId]);

  const allData = useMemo(() => {
    const customerName = customer?.name || (customer as any)?.companyInfo?.customerName || (customer as any)?.companyName || 'Valued Customer';
    return {
      ...(dynamicData || {}),
      customerName,
      companyName: customerName,
      contactPerson: customer?.contact || customer?.primaryContactInfo?.contactName1 || 'Valued Customer',
      phone: customer?.phone || customer?.primaryContactInfo?.mobile || '',
      mobile: customer?.primaryContactInfo?.mobile || customer?.phone || '',
      email: customer?.email || customer?.primaryContactInfo?.email || '',
    };
  }, [customer, dynamicData]);

  const [form, setForm] = useState({
    includePdf: true,
  });

  const whatsappMut = useMutation({
    mutationFn: async (payload: any) => {
      if (!customer?._id) throw new Error('Customer is required');
      const res = await api.post(`/customers/${customer._id}/whatsapp`, payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      if (data?.data?.warning) {
        toast(data.data.warning, { icon: '!' });
      } else {
        toast.success(data?.message || 'WhatsApp message submitted to Meta');
      }
      setOpen(false);
      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: ['amcs'] });
      queryClient.invalidateQueries({ queryKey: ['customers-management-pages'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-tdl-list'] });
      queryClient.invalidateQueries({ queryKey: ['customers-cloud-list'] });
      queryClient.invalidateQueries({ queryKey: ['customers-tss-list'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to send WhatsApp message');
    },
  });

  const openModal = () => {
    if (!customer) {
      toast.error('Customer details not available');
      return;
    }

    const tplId = selectedTemplateId || '';
    setModalTemplateId(tplId);
    setForm({ includePdf: true });
    setOpen(true);
  };

  const handleTemplateChange = (newTplId: string) => {
    setModalTemplateId(newTplId);
    setForm({ includePdf: true });
  };

  const handlePreviewPdf = async () => {
    if (!customer?._id || !effectiveTemplateId) return;
    try {
      setIsPreviewing(true);
      const res = await api.post(`/customers/${customer._id}/template-pdf`, {
        templateId: effectiveTemplateId,
        dynamicData: allData,
      }, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      toast.error('Failed to generate PDF preview');
    } finally {
      setIsPreviewing(false);
    }
  };

  const send = () => {
    const payload: Record<string, any> = {
      messageType: 'template',
      templateId: effectiveTemplateId || undefined,
      templateName: settings?.whatsappDefaultTemplateName || undefined,
      languageCode: settings?.whatsappDefaultLanguageCode || 'en_US',
      dynamicData: allData,
      includePdf: form.includePdf,
    };

    whatsappMut.mutate(payload);
  };

  const requiresTemplate = selectedTemplateId !== undefined;
  const hasSelectedTemplate = !requiresTemplate || !!effectiveTemplateId;
  const disabled = !customer || whatsappMut.isPending || !hasSelectedTemplate;
  const number = customerWhatsappNumberOf(customer);
  const buttonTitle = !hasSelectedTemplate
    ? 'Choose a template to enable WhatsApp'
    : title || `Send WhatsApp${number ? ` to ${number}` : ''}`;

  return (
    <>
      <button
        type="button"
        className={className || (iconOnly ? 'btn-action btn-action-green' : 'btn btn-secondary btn-sm')}
        title={buttonTitle}
        onClick={openModal}
        disabled={disabled}
        style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <MessageCircle size={13} />
        {!iconOnly ? <span>{buttonLabel}</span> : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send WhatsApp Message"
        size="md"
        footer={(
          <div className="flex justify-end gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={send}
              disabled={whatsappMut.isPending}
            >
              <Send size={14} />
              {whatsappMut.isPending ? 'Sending...' : 'Send WhatsApp'}
            </button>
          </div>
        )}
      >
        {customer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Customer Recipient Badge */}
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bd)', flexShrink: 0 }}>
                <MessageCircle size={18} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, color: 'var(--tx-1)' }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-4)', marginTop: 2 }}>
                  Sending to WhatsApp/mobile: <strong style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)' }}>{number || 'Not available'}</strong>
                </div>
              </div>
            </div>

            {/* Letterhead & PDF Live Preview Card */}
            <div style={{ background: '#eef2f7', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-4)', letterSpacing: '0.05em' }}>
                  Official Document Preview ({selectedEmailTemplate?.name || 'Notice'})
                </div>
                {effectiveTemplateId ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={handlePreviewPdf}
                    disabled={isPreviewing}
                    style={{ fontSize: 11, padding: '3px 8px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    title="Open full PDF document in new tab"
                  >
                    {isPreviewing ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                    <span>Open PDF</span>
                  </button>
                ) : null}
              </div>

              <div style={{ maxHeight: 380, overflowY: 'auto', padding: '18px 14px' }}>
                <div style={{ maxWidth: 640, margin: '0 auto', background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)', overflow: 'hidden', color: '#334155', fontFamily: 'var(--font-content)' }}>
                  {/* Top Header Banner / Logo */}
                  {effectiveHeaderImage ? (
                    <div style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <img src={toAssetUrl(effectiveHeaderImage)} alt="Header Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </div>
                  ) : settings?.logo ? (
                    <div style={{ padding: '20px 28px 14px 28px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={toAssetUrl(settings.logo)} alt={settings?.companyName || 'Logo'} style={{ height: 38, objectFit: 'contain' }} />
                      <span style={{ fontWeight: 800, color: 'var(--brand)', fontSize: 16 }}>{settings?.companyName || 'WelcomeTech CRM'}</span>
                    </div>
                  ) : null}

                  {/* Letter Content */}
                  <div style={{ padding: '24px 30px', fontSize: 13.5, lineHeight: 1.7 }}>
                    {selectedEmailTemplate?.subject ? (
                      <div style={{ fontWeight: 800, color: 'var(--brand)', marginBottom: 12, fontSize: 14 }}>
                        SUBJECT: {selectedEmailTemplate.subject}
                      </div>
                    ) : null}
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedEmailTemplate?.body ? selectedEmailTemplate.body
                        .replace(/\[Company Name\]/gi, (allData as any).customerName || 'Valued Customer')
                        .replace(/\[Client Name\]/gi, (allData as any).customerName || 'Valued Customer')
                        .replace(/\[Expiry Date\]/gi, (allData as any).expiryDate || '—')
                        .replace(/\[DD\/MM\/YYYY\]/gi, (allData as any).expiryDate || '—')
                        .replace(/\[Serial No(?:umber)?\]/gi, (allData as any).serialNo || '—')
                        .replace(/\[x{4,}\]/gi, (allData as any).serialNo || '—')
                        .replace(/\[Product\/Service Name\]/gi, (allData as any).product || 'Tally Software Services')
                        .replace(/\[Product Name\]/gi, (allData as any).product || 'Tally Software Services')
                        : 'Official document will be generated and dispatched.'}
                    </div>
                  </div>

                  {/* Bottom Footer Banner */}
                  {effectiveFooterImage ? (
                    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 12 }}>
                      <img src={toAssetUrl(effectiveFooterImage)} alt="Footer Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default CustomerWhatsAppAction;
