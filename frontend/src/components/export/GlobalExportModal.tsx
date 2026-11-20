import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Modal, Select } from '../ui';
import {
  ExportFormat,
  ExportRequest,
  GLOBAL_EXPORT_EVENT,
  runWorkbookExport,
} from '../../utils/excelExport';

const formatOptions = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
];

const countRows = (request: ExportRequest | null) =>
  request?.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) || 0;

export const GlobalExportModal: React.FC = () => {
  const [request, setRequest] = useState<ExportRequest | null>(null);
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    (window as any).__welcometechGlobalExportReady = true;

    const onExport = (event: Event) => {
      const detail = (event as CustomEvent<ExportRequest>).detail;
      if (!detail) return;
      setRequest(detail);
      setFormat(detail.defaultFormat || 'excel');
      setIsExporting(false);
    };

    window.addEventListener(GLOBAL_EXPORT_EVENT, onExport);
    return () => {
      window.removeEventListener(GLOBAL_EXPORT_EVENT, onExport);
      delete (window as any).__welcometechGlobalExportReady;
    };
  }, []);

  const summary = useMemo(() => {
    if (!request) return '';
    const sheetText = `${request.sheets.length} sheet${request.sheets.length === 1 ? '' : 's'}`;
    const rowText = `${countRows(request).toLocaleString()} row${countRows(request) === 1 ? '' : 's'}`;
    return `${sheetText} • ${rowText}`;
  }, [request]);

  const handleDownload = () => {
    if (!request) return;
    setIsExporting(true);
    window.setTimeout(() => {
      try {
        runWorkbookExport(request, format);
        setRequest(null);
      } finally {
        setIsExporting(false);
      }
    }, 0);
  };

  return (
    <Modal
      open={!!request}
      onClose={() => setRequest(null)}
      title="Download Export"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-cancel" onClick={() => setRequest(null)} disabled={isExporting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={isExporting}>
            <Download size={14} />
            {isExporting ? 'Preparing...' : 'Download'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr',
            gap: 14,
            alignItems: 'center',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--surface-2)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand)',
              background: 'var(--brand-light)',
            }}
          >
            {format === 'pdf' ? <FileText size={21} /> : <FileSpreadsheet size={21} />}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx-1)' }}>
              {request?.title || request?.filename || 'Export'}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--tx-4)' }}>{summary}</div>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase' }}>
            File format
          </span>
          <Select
            value={format}
            onChange={(value) => setFormat(value as ExportFormat)}
            options={formatOptions}
          />
        </label>

        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--tx-4)' }}>
          Choose Excel for editable data workbooks, or PDF for a shareable read-only report.
        </div>
      </div>
    </Modal>
  );
};

export default GlobalExportModal;
