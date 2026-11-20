import React from 'react';
import { Mail, MessageCircle, Download, X, CheckSquare, Square } from 'lucide-react';
import { useEmailTemplates } from '../../hooks/useEmailTemplate';
import { Select } from '../ui';

export interface BulkActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onSelectAllPage?: () => void;
  isAllPageSelected?: boolean;
  selectedTemplateId?: string;
  onSelectTemplate?: (templateId: string) => void;
  onOpenBulkEmail: () => void;
  onOpenBulkWhatsApp: () => void;
  onExportSelected?: () => void;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAllPage,
  isAllPageSelected = false,
  selectedTemplateId = '',
  onSelectTemplate,
  onOpenBulkEmail,
  onOpenBulkWhatsApp,
}) => {
  const { data: templates = [], isLoading: loadingTemplates } = useEmailTemplates();

  if (selectedCount === 0) return null;

  const hasTemplate = Boolean(selectedTemplateId && selectedTemplateId.trim() !== '');

  const templateOptions = [
    { value: '', label: '— Choose Template —' },
    ...templates.map((t) => ({ value: t._id, label: t.name })),
  ];

  return (
    <div
      className="bulk-action-toolbar"
      style={{
        position: 'fixed',
        bottom: '28px',
        zIndex: 999,
        background: 'var(--surface, #ffffff)',
        color: 'var(--tx-1, #0f172a)',
        padding: '10px 18px',
        borderRadius: '16px',
        border: '1px solid var(--border, #e2e8f0)',
        boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        backdropFilter: 'blur(16px)',
        minWidth: '420px',
        maxWidth: '94vw',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Left side: Selection pill & Select Page button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            height: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: 'linear-gradient(135deg, var(--brand, #7c3aed) 0%, #6d28d9 100%)',
            color: '#ffffff',
            padding: '0 14px',
            borderRadius: '10px',
            fontSize: '12.5px',
            fontWeight: 700,
            letterSpacing: '0.01em',
            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 6px #4ade80',
              display: 'inline-block',
            }}
          />
          <span>{selectedCount} Selected</span>
        </div>

        {onSelectAllPage && totalCount > 0 && (
          <button
            type="button"
            onClick={onSelectAllPage}
            style={{
              height: '36px',
              background: isAllPageSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : 'var(--surface-2, #f8fafc)',
              border: isAllPageSelected ? '1px solid var(--brand, #7c3aed)' : '1px solid var(--border, #e2e8f0)',
              color: isAllPageSelected ? 'var(--brand, #7c3aed)' : 'var(--tx-2, #64748b)',
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              padding: '0 14px',
              borderRadius: '10px',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--brand, #7c3aed)';
              e.currentTarget.style.borderColor = 'var(--brand, #7c3aed)';
              e.currentTarget.style.background = 'var(--brand-light, rgba(124, 58, 237, 0.1))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isAllPageSelected ? 'var(--brand-light, rgba(124, 58, 237, 0.08))' : 'var(--surface-2, #f8fafc)';
              e.currentTarget.style.borderColor = isAllPageSelected ? 'var(--brand, #7c3aed)' : 'var(--border, #e2e8f0)';
              e.currentTarget.style.color = isAllPageSelected ? 'var(--brand, #7c3aed)' : 'var(--tx-2, #64748b)';
            }}
            title={isAllPageSelected ? 'Deselect all rows on this page' : 'Select all rows on this page'}
          >
            {isAllPageSelected ? <CheckSquare size={14} strokeWidth={2.5} /> : <Square size={14} strokeWidth={2} />}
            <span>{isAllPageSelected ? 'Deselect Page' : 'Select Page'}</span>
          </button>
        )}

        {/* Bulk Template Selector */}
        {onSelectTemplate && (
          <div style={{ minWidth: '160px', height: '36px' }}>
            <Select
              value={selectedTemplateId}
              onChange={onSelectTemplate}
              options={templateOptions}
              placeholder="Apply Template..."
              loading={loadingTemplates}
              style={{
                height: '36px',
                fontSize: '12.5px',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            />
          </div>
        )}
      </div>

      {/* Right side: Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={hasTemplate ? onOpenBulkEmail : undefined}
          disabled={!hasTemplate}
          style={{
            height: '36px',
            background: hasTemplate ? 'var(--brand, #7c3aed)' : 'var(--surface-2, #f1f5f9)',
            color: hasTemplate ? '#ffffff' : 'var(--tx-4, #94a3b8)',
            border: hasTemplate ? 'none' : '1px solid var(--border, #e2e8f0)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
            fontSize: '12.5px',
            padding: '0 14px',
            borderRadius: '10px',
            boxShadow: hasTemplate ? '0 2px 8px rgba(124, 58, 237, 0.25)' : 'none',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
            cursor: hasTemplate ? 'pointer' : 'not-allowed',
            opacity: hasTemplate ? 1 : 0.6,
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          title={hasTemplate ? 'Send Bulk Email' : 'Please choose a template first'}
        >
          <Mail size={14} />
          Bulk Email
        </button>

        <button
          type="button"
          onClick={hasTemplate ? onOpenBulkWhatsApp : undefined}
          disabled={!hasTemplate}
          style={{
            height: '36px',
            background: hasTemplate ? '#10b981' : 'var(--surface-2, #f1f5f9)',
            color: hasTemplate ? '#ffffff' : 'var(--tx-4, #94a3b8)',
            border: hasTemplate ? 'none' : '1px solid var(--border, #e2e8f0)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
            fontSize: '12.5px',
            padding: '0 14px',
            borderRadius: '10px',
            boxShadow: hasTemplate ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
            cursor: hasTemplate ? 'pointer' : 'not-allowed',
            opacity: hasTemplate ? 1 : 0.6,
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          title={hasTemplate ? 'Send Bulk WhatsApp' : 'Please choose a template first'}
        >
          <MessageCircle size={14} />
          Bulk WhatsApp
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          style={{
            width: '36px',
            height: '36px',
            background: 'var(--surface-2, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            color: 'var(--tx-3, #94a3b8)',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxSizing: 'border-box',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-2, #f8fafc)';
            e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
            e.currentTarget.style.color = 'var(--tx-3, #94a3b8)';
          }}
          title="Clear Selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default BulkActionToolbar;
