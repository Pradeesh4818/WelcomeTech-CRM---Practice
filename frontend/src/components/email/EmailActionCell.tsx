import React, { useMemo, useState } from 'react';
import { Mail, Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEmailTemplates, useSendEmailTemplate } from '../../hooks/useEmailTemplate';
import { Select, Modal } from '../ui';
import { useThemeStore } from '../../store/themeStore';
import api from '../../utils/api';
import { toAssetUrl } from '../../utils/helpers';

interface EmailActionCellProps {
  email: string | undefined;
  customerName: string;
  dynamicData: any;
  emailOptions?: string[];
  onSuccess?: () => void;
}

interface EmailTemplateControlProps extends EmailActionCellProps {
  selectedTemplateId: string;
  onTemplateChange?: (value: string) => void;
}

const cleanEmails = (...values: unknown[]): string[] => {
  const seen = new Set<string>();
  return values
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[,\n;]/))
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== '—' && value.includes('@'))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const textValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text !== '—') return text;
  }
  return '—';
};

export const deriveStartDate = (expiryStr: string): string => {
  if (!expiryStr || expiryStr === '—' || expiryStr.startsWith('[')) return '—';
  let d = new Date(expiryStr);
  if (isNaN(d.getTime()) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(expiryStr)) {
    const parts = expiryStr.split('/');
    d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  if (isNaN(d.getTime()) && /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(expiryStr)) {
    d = new Date(expiryStr.replace(/-/g, ' '));
  }
  if (isNaN(d.getTime())) return '—';
  const start = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(expiryStr)) {
    const day = String(start.getDate()).padStart(2, '0');
    const month = String(start.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${start.getFullYear()}`;
  }
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(expiryStr)) {
    const day = String(start.getDate()).padStart(2, '0');
    const month = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${day}-${month}-${start.getFullYear()}`;
  }
  return start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const processTemplateText = (text: string, data: Record<string, any>) => {
  let res = text || '';
  const serialVal = data.serialNo || data.serial_no || data.licenseSerialNo || data.licenceSerialNo || '—';
  const expiryVal = data.expiryDate || data.expiry_date || data.tssExpiryDate || data.tss_expiry_date || data.dueDate || data.due_date || data.endDate || data.end_date || '—';
  const rawStart = data.startDate || data.start_date || data.tssStartDate || data.tss_start_date || data.fromDate || data.from_date || '';
  const startVal = (rawStart && rawStart !== '—') ? String(rawStart) : deriveStartDate(String(expiryVal));

  const safeData: Record<string, any> = {
    ...data,
    startDate: startVal,
    start_date: startVal,
    tss_start_date: startVal,
    service_start_date: startVal,
    fromDate: startVal,
    from_date: startVal,
    expiryDate: expiryVal,
    expiry_date: expiryVal,
    tss_expiry_date: expiryVal,
    toDate: expiryVal,
    to_date: expiryVal,
  };

  Object.entries(safeData).forEach(([k, v]) => {
    const val = (v === undefined || v === null || v === '' || v === '—') ? '—' : String(v);
    res = res.replace(new RegExp(`{{${k}}}`, 'g'), val);
  });

  // Paired date range placeholders: e.g. "Renewal Period: [DD/MM/YYYY] to [DD/MM/YYYY]", "from [DD/MM/YYYY] to [DD/MM/YYYY]"
  const dateRangeRegex = /(from\s+)?(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])\s*(to|-|until|through|–|—)\s*(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi;
  res = res.replace(dateRangeRegex, (_m, fromPrefix, _p1, sep, _p2) => {
    return `${fromPrefix || ''}${startVal} ${sep} ${expiryVal}`;
  });

  // Standalone directional date placeholders
  res = res.replace(/(from\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${startVal}`);
  res = res.replace(/(to\s+)(\[(?:DD\/MM\/YYYY|MM\/DD\/YYYY|YYYY-MM-DD|Date)\])/gi, `$1${expiryVal}`);

  res = res
    .replace(/\[Company Name\]/gi, data.customerName || data.company_name || '—')
    .replace(/\[Client Name\]/gi, data.customerName || data.company_name || '—')
    .replace(/\[Product\/Service Name\]/gi, data.product || data.productName || 'the service')
    .replace(/\[Product Name\]/gi, data.product || data.productName || 'the service')
    .replace(/\[Release\]/gi, data.release || data.releaseVersion || '—')
    .replace(/\[Serial No\]/gi, serialVal)
    .replace(/\[Serial Number\]/gi, serialVal)
    .replace(/\[Start Date\]/gi, startVal)
    .replace(/\[From Date\]/gi, startVal)
    .replace(/\[End Date\]/gi, expiryVal)
    .replace(/\[To Date\]/gi, expiryVal)
    .replace(/\[Expiry Date\]/gi, expiryVal)
    .replace(/\[TSS Expiry Date\]/gi, expiryVal)
    .replace(/\[Amount\]/gi, data.amount || '—')
    .replace(/\[Due Date\]/gi, expiryVal)
    .replace(/\[Phone Number\]/gi, data.phone || data.mobile || '—')
    .replace(/\[Email Address\]/gi, data.email || data.email_id || '—')
    .replace(/\[x{4,}\]/gi, serialVal)
    // Any remaining standalone date placeholder gets expiryVal
    .replace(/\[DD\/MM\/YYYY\]/gi, expiryVal)
    .replace(/\[MM\/DD\/YYYY\]/gi, expiryVal)
    .replace(/\[YYYY-MM-DD\]/gi, expiryVal)
    .replace(/\[Date\]/gi, expiryVal)
    .replace(/{{[^}]+}}/g, '—');
  return res;
};

const formatLetterBody = (body: string) => {
  let html = body.replace(/\r\n/g, '\n');
  html = html
    .replace(/^[ \t]*# (.*$)/gim, '<h1 style="font-size: 30px; font-weight: 850; color: #111827; margin: 0 0 26px; padding-bottom: 22px; border-bottom: 1px solid #d8dee8;">$1</h1>')
    .replace(/^[ \t]*## (.*$)/gim, '<h2 style="font-size: 22px; font-weight: 800; color: #111827; margin: 30px 0 14px;">$1</h2>')
    .replace(/^[ \t]*### (.*$)/gim, '<h3 style="font-size: 18px; font-weight: 800; color: #111827; margin: 24px 0 10px;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #111827; font-weight: 850;">$1</strong>')
    .replace(/{{(.*?)}}/g, '<span style="background: #eadcff; color: #6d28d9; padding: 0 6px; border-radius: 7px; font-weight: 850;">{{$1}}</span>');

  const paragraphs = html.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[1-3]|div|img|table|ul|ol|li|blockquote)/i.test(trimmed)) return trimmed.replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 24px;">${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('');
};

const RecipientPicker: React.FC<{
  label: string;
  mode: 'single' | 'multi';
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}> = ({ label, mode, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const remaining = options.filter((item) => !value.some((v) => v.toLowerCase() === item.toLowerCase()));

  const handleAddCustom = () => {
    const raw = customInput.trim();
    if (raw && raw.includes('@') && !value.some((v) => v.toLowerCase() === raw.toLowerCase())) {
      onChange(mode === 'single' ? [raw] : [...value, raw]);
      setCustomInput('');
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '82px 1fr 34px', gap: 8, alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        {value.length ? value.map((mail) => (
          <span key={mail} className="badge badge-gray" style={{ gap: 6, maxWidth: '100%' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{mail}</span>
            <button
              type="button"
              aria-label={`Remove ${mail}`}
              title={`Remove ${mail}`}
              onClick={() => onChange(value.filter((item) => item !== mail))}
              style={{ border: 0, background: 'transparent', display: 'flex', padding: 0, cursor: 'pointer', color: 'inherit' }}
            >
              <X size={11} />
            </button>
          </span>
        )) : <span style={{ fontSize: 12, color: 'var(--tx-5)' }}>No {label.toLowerCase()} selected</span>}
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        title={`Add ${label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={14} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 20, width: 290, maxHeight: 260, overflowY: 'auto', background: 'var(--menu-surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--sh-md)', padding: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              type="email"
              placeholder={`Type ${label.toLowerCase()} email...`}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface-1)', color: 'var(--tx-1)', outline: 'none' }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
              disabled={!customInput.trim() || !customInput.includes('@')}
              onClick={handleAddCustom}
            >
              Add
            </button>
          </div>
          {(mode === 'single' ? options : remaining).length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx-4)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>Suggested Contacts</div>
              {(mode === 'single' ? options : remaining).map((mail) => (
                <button
                  key={mail}
                  type="button"
                  onClick={() => {
                    onChange(mode === 'single' ? [mail] : [...value, mail]);
                    setOpen(false);
                  }}
                  style={{ width: '100%', border: 0, background: value.includes(mail) ? 'var(--brand-light)' : 'transparent', color: value.includes(mail) ? 'var(--brand)' : 'var(--tx-2)', padding: '7px 8px', borderRadius: 6, textAlign: 'left', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  {mail}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const EmailTemplateSelect: React.FC<{
  selectedTemplateId: string;
  onTemplateChange: (value: string) => void;
}> = ({ selectedTemplateId, onTemplateChange }) => {
  const { data: templates = [], isLoading: isLoadingTemplates } = useEmailTemplates();

  const templateOptions = [
    { value: '', label: 'Choose Template' },
    ...templates.map((t) => ({ value: t._id, label: t.name })),
  ];

  return (
    <div className="email-template-select" style={{ flex: 1, minWidth: 120 }}>
      <Select
        value={selectedTemplateId}
        onChange={onTemplateChange}
        options={templateOptions}
        placeholder="Choose Template"
        loading={isLoadingTemplates}
        style={{ height: 30, fontSize: 12 }}
      />
    </div>
  );
};

export const EmailTemplateSendButton: React.FC<EmailTemplateControlProps> = ({
  email,
  customerName,
  dynamicData,
  emailOptions = [],
  selectedTemplateId,
  onSuccess,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [toList, setToList] = useState<string[]>([]);
  const [ccList, setCcList] = useState<string[]>([]);
  const { data: templates = [] } = useEmailTemplates();
  const sendEmailMutation = useSendEmailTemplate();
  const { logo, companyName } = useThemeStore();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data?.data;
    },
    staleTime: 5 * 60 * 1000,
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

  const proposalHeaderImage = activeProposalTemplate?.templateImage || activeProposalTemplate?.headerImage || settings?.proposalHeaderImage;
  const proposalFooterImage = activeProposalTemplate?.templateFooterImage || activeProposalTemplate?.footerImage || settings?.proposalFooterImage;

  const allEmails = useMemo(() => cleanEmails(
    email,
    emailOptions,
    dynamicData?.emailOptions,
    dynamicData?.emails,
    dynamicData?.email,
    dynamicData?.email_id,
    dynamicData?.cc,
    dynamicData?.ccOptions,
  ), [email, emailOptions, dynamicData]);

  const primaryEmail = allEmails[0] || '';

  if (!primaryEmail) {
    return <span style={{ color: 'var(--tx-4)', fontSize: 11 }}>No Email</span>;
  }

  const selectedTemplate = templates.find(t => t._id === selectedTemplateId);

  const handleSendClick = () => {
    if (!selectedTemplateId) return;
    setToList((prev) => prev.length ? prev : [primaryEmail]);
    setShowConfirm(true);
  };

  const activeEmail = toList[0] || primaryEmail;
  const allData: Record<string, any> = {
    ...dynamicData,
    customerName,
    email: activeEmail,
    org_name: customerName,
    company_name: customerName,
    companyName: customerName,
    contactPerson: textValue(dynamicData?.contactPerson, dynamicData?.contact_person, dynamicData?.contactName, dynamicData?.contact_name, 'Valued Customer'),
    contact_person: textValue(dynamicData?.contactPerson, dynamicData?.contact_person, dynamicData?.contactName, dynamicData?.contact_name, 'Valued Customer'),
    contact_name: textValue(dynamicData?.contactPerson, dynamicData?.contact_person, dynamicData?.contactName, dynamicData?.contact_name, 'Valued Customer'),
    product: textValue(dynamicData?.product, dynamicData?.productName, dynamicData?.serviceName),
    productName: textValue(dynamicData?.productName, dynamicData?.product, dynamicData?.serviceName),
    serviceName: textValue(dynamicData?.serviceName, dynamicData?.product, dynamicData?.productName),
    release: textValue(dynamicData?.release, dynamicData?.releaseVersion),
    releaseVersion: textValue(dynamicData?.releaseVersion, dynamicData?.release),
    serialNo: textValue(dynamicData?.serialNo, dynamicData?.serial_no),
    serial_no: textValue(dynamicData?.serialNo, dynamicData?.serial_no),
    tss_expiry_date: textValue(dynamicData?.expiryDate, dynamicData?.tss_expiry_date, dynamicData?.expiry_date),
    expiryDate: textValue(dynamicData?.expiryDate, dynamicData?.tss_expiry_date, dynamicData?.expiry_date),
    expiry_date: textValue(dynamicData?.expiryDate, dynamicData?.tss_expiry_date, dynamicData?.expiry_date),
    dueDate: textValue(dynamicData?.dueDate, dynamicData?.due_date, dynamicData?.expiryDate),
    due_date: textValue(dynamicData?.dueDate, dynamicData?.due_date, dynamicData?.expiryDate),
    startDate: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.tssStartDate, dynamicData?.tss_start_date),
    start_date: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.tssStartDate, dynamicData?.tss_start_date),
    tss_start_date: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.tssStartDate, dynamicData?.tss_start_date),
    service_start_date: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.tssStartDate, dynamicData?.tss_start_date),
    fromDate: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.fromDate, dynamicData?.from_date),
    from_date: textValue(dynamicData?.startDate, dynamicData?.start_date, dynamicData?.fromDate, dynamicData?.from_date),
    endDate: textValue(dynamicData?.endDate, dynamicData?.end_date, dynamicData?.expiryDate),
    end_date: textValue(dynamicData?.endDate, dynamicData?.end_date, dynamicData?.expiryDate),
    toDate: textValue(dynamicData?.endDate, dynamicData?.end_date, dynamicData?.expiryDate),
    to_date: textValue(dynamicData?.endDate, dynamicData?.end_date, dynamicData?.expiryDate),
    phone: textValue(dynamicData?.phone, dynamicData?.mobile),
    mobile: textValue(dynamicData?.mobile, dynamicData?.phone),
    salesman: textValue(dynamicData?.salesman),
    email_id: activeEmail,
  };
  const processedSubject = selectedTemplate ? processTemplateText(selectedTemplate.subject, allData) : '';
  const processedBody = selectedTemplate ? processTemplateText(selectedTemplate.body, allData) : '';
  const formattedBody = formatLetterBody(processedBody);

  const handleConfirmSend = async () => {
    await sendEmailMutation.mutateAsync({
      email: toList,
      cc: ccList,
      templateId: selectedTemplateId,
      dynamicData: {
        ...dynamicData,
        customerName,
        email: toList[0],
        email_id: toList[0],
        cc: ccList,
      },
    });
    setShowConfirm(false);
    onSuccess?.();
  };

  return (
    <>
      <button
        type="button"
        title="Send Email"
        disabled={!selectedTemplateId || sendEmailMutation.isPending}
        onClick={handleSendClick}
        className="btn-icon-zen"
        style={{ opacity: selectedTemplateId ? 1 : 0.6, cursor: selectedTemplateId ? 'pointer' : 'not-allowed' }}
      >
        <Mail size={14} />
      </button>

      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Email"
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', width: '100%', padding: '0 4px' }}>
            <button className="btn" style={{ flex: 1, height: 48, borderRadius: 14, background: '#fff', border: '1px solid var(--border)', color: 'var(--tx-2)', boxShadow: 'var(--sh-xs)' }} onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ flex: 1, height: 48, borderRadius: 14, boxShadow: 'var(--sh-brand)' }} onClick={handleConfirmSend} disabled={sendEmailMutation.isPending || !toList.length}>
              {sendEmailMutation.isPending ? 'Sending...' : 'Confirm'}
            </button>
          </div>
        }
      >
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--tx-3)', margin: 0 }}>
            Review the email details for <strong>{customerName}</strong>:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <RecipientPicker label="Send Mail" mode="single" options={allEmails} value={toList} onChange={setToList} />
            <RecipientPicker
              label="CC"
              mode="multi"
              options={allEmails.filter((mail) => !toList.some((to) => to.toLowerCase() === mail.toLowerCase()))}
              value={ccList}
              onChange={setCcList}
            />
          </div>

          <div style={{ padding: '16px 20px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-4)', marginBottom: 8, letterSpacing: '0.05em' }}>
              Subject
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)' }}>{processedSubject}</div>
          </div>

          <div style={{ background: '#eef2f7', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-4)', letterSpacing: '0.05em' }}>
              Official Letterhead & PDF Preview
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto', padding: '24px 16px' }}>
              <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)', overflow: 'hidden', color: '#334155', fontFamily: 'var(--font-content)' }}>
                {/* Header Banner */}
                {proposalHeaderImage ? (
                  <div style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <img src={toAssetUrl(proposalHeaderImage)} alt="Header Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                  </div>
                ) : logo ? (
                  <div style={{ padding: '24px 32px 16px 32px', borderBottom: '1px solid #e2e8f0' }}>
                    <img src={toAssetUrl(logo)} alt={companyName || 'Logo'} style={{ height: 44, objectFit: 'contain' }} />
                  </div>
                ) : null}

                {/* Letter Body */}
                <div style={{ padding: '32px 40px', fontSize: 14, lineHeight: 1.75 }}>
                  <div dangerouslySetInnerHTML={{ __html: formattedBody }} />
                </div>

                {/* Footer Banner */}
                {proposalFooterImage ? (
                  <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16 }}>
                    <img src={toAssetUrl(proposalFooterImage)} alt="Footer Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </Modal>
    </>
  );
};

const EmailActionCell: React.FC<EmailActionCellProps> = (props) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <EmailTemplateSelect selectedTemplateId={selectedTemplateId} onTemplateChange={setSelectedTemplateId} />
      <EmailTemplateSendButton {...props} selectedTemplateId={selectedTemplateId} />
    </div>
  );
};

export default EmailActionCell;
