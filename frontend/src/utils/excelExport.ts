import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type ExportValue = string | number | boolean | Date | null;

export type ExportSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
  columns?: Array<{
    header: string;
    width?: number;
    dateFormat?: string;
  }>;
};

export type ExportFormat = 'excel' | 'pdf';

export type ExportRequest = {
  filename: string;
  sheets: ExportSheet[];
  title?: string;
  defaultFormat?: ExportFormat;
};

export const GLOBAL_EXPORT_EVENT = 'welcometech:global-export';

const safeSheetName = (name: string) =>
  (name || 'Sheet')
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';

const safeFileName = (name: string) => {
  const base = (name || 'export').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'export'}.xlsx`;
};

const titleCase = (value: string) =>
  value
    .replace(/\./g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const scalarValue = (value: unknown): ExportValue => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
};

export const entityName = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (isPlainObject(value)) {
    return String(value.name || value.customerName || value.companyName || value.email || value._id || '');
  }
  return String(value);
};

export const flattenRecord = (record: Record<string, unknown>, prefix = ''): Record<string, ExportValue> => {
  const out: Record<string, ExportValue> = {};

  Object.entries(record || {}).forEach(([key, value]) => {
    if (key === '__v') return;

    if (isPlainObject(value)) {
      if ('name' in value || 'email' in value || '_id' in value) {
        const path = prefix ? `${prefix}.${key}` : key;
        out[prefix ? titleCase(path) : key] = entityName(value);
        return;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(out, flattenRecord(value, path));
      return;
    }

    if (Array.isArray(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out[prefix ? titleCase(path) : key] = value
        .map((item) => (isPlainObject(item) ? JSON.stringify(item) : String(item ?? '')))
        .filter(Boolean)
        .join(' | ');
      return;
    }

    const finalKey = prefix ? titleCase(`${prefix}.${key}`) : key;
    out[finalKey] = scalarValue(value);
  });

  return out;
};

export const renewalRows = (
  ownerRows: Array<Record<string, unknown>>,
  ownerLabel = 'Record'
): Array<Record<string, unknown>> =>
  ownerRows.flatMap((row) => {
    const renewals = Array.isArray(row.renewalHistory)
      ? row.renewalHistory
      : Array.isArray((row as any).amcDetails?.renewalHistory)
        ? (row as any).amcDetails.renewalHistory
        : [];

    return renewals.map((renewal: unknown, idx: number) => ({
      [ownerLabel]: entityName(row.customer) || String(row.name || row.companyName || row.product || row._id || ''),
      RenewalNo: idx + 1,
      ...(isPlainObject(renewal) ? renewal : { value: renewal }),
    }));
  });

export const customerRenewalRows = (customers: Array<Record<string, unknown>>) =>
  customers.flatMap((customer) => {
    const customerName = String(customer.name || (customer.companyInfo as any)?.customerName || customer._id || '');
    const rows: Array<Record<string, unknown>> = [];

    const addRows = (module: string, renewals: unknown) => {
      if (!Array.isArray(renewals)) return;
      renewals.forEach((renewal, idx) => {
        rows.push({
          Customer: customerName,
          Module: module,
          RenewalNo: idx + 1,
          ...(isPlainObject(renewal) ? renewal : { value: renewal }),
        });
      });
    };

    (Array.isArray(customer.services) ? customer.services : []).forEach((service: any) => {
      addRows(String(service?.type || 'Service').toUpperCase(), service?.renewalHistory);
    });
    addRows('AMC', (customer as any).amcDetails?.renewalHistory);
    addRows('TDL', (customer as any).tdlDetails?.renewalHistory);
    addRows('Cloud', (customer as any).cloudDetails?.renewalHistory);
    addRows('TSS', (customer as any).tssDetails?.renewalHistory);

    return rows;
  });

const usefulSheetsOf = (sheets: ExportSheet[]) => sheets.filter((sheet) => sheet.rows.length > 0);

export const downloadExcelWorkbook = (filename: string, sheets: ExportSheet[]) => {
  const usefulSheets = sheets.filter((sheet) => sheet.rows.length > 0);
  if (!usefulSheets.length) {
    toast.error('No data available to export');
    return;
  }

  const workbook = XLSX.utils.book_new();
  usefulSheets.forEach((sheet) => {
    const rows = sheet.rows.map((row) => flattenRecord(row));
    const headers = sheet.columns?.length ? sheet.columns.map((column) => column.header) : Object.keys(rows[0] || {});
    const worksheet = XLSX.utils.json_to_sheet(rows, headers.length ? { header: headers } : undefined);
    worksheet['!cols'] = headers.map((header) => {
      const columnConfig = sheet.columns?.find((column) => column.header === header);
      return {
        wch: columnConfig?.width || Math.min(Math.max(header.length + 4, 14), 42),
      };
    });

    headers.forEach((header, idx) => {
      const dateFormat = sheet.columns?.find((column) => column.header === header)?.dateFormat;
      if (!dateFormat) return;
      const columnLetter = XLSX.utils.encode_col(idx);
      for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
        const address = `${columnLetter}${rowIndex}`;
        if (worksheet[address]) worksheet[address].z = dateFormat;
      }
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheet.name));
  });

  XLSX.writeFile(workbook, safeFileName(filename), { compression: true });
  toast.success('Excel export downloaded');
};

export const downloadPdfWorkbook = (filename: string, sheets: ExportSheet[], title?: string) => {
  const usefulSheets = usefulSheetsOf(sheets);
  if (!usefulSheets.length) {
    toast.error('No data available to export');
    return;
  }

  // Calculate maximum columns across all sheets to determine initial document format
  const sheetDetails = usefulSheets.map((sheet) => {
    const rows = sheet.rows.map((row) => flattenRecord(row));
    const headers = sheet.columns?.length ? sheet.columns.map((column) => column.header) : Object.keys(rows[0] || {});
    return { sheet, rows, headers };
  });

  const maxColCount = Math.max(...sheetDetails.map((s) => s.headers.length), 1);
  const initialFormat = maxColCount > 18 ? 'a2' : maxColCount > 10 ? 'a3' : 'a4';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: initialFormat });
  const generatedAt = new Date().toLocaleString();

  sheetDetails.forEach(({ sheet, rows, headers }, sheetIndex) => {
    const colCount = headers.length;
    const pageFormat = colCount > 18 ? 'a2' : colCount > 10 ? 'a3' : 'a4';

    if (sheetIndex > 0) {
      doc.addPage(pageFormat, 'landscape');
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const body = rows.map((row) => headers.map((header) => {
      const value = row[header];
      if (value instanceof Date) return value.toLocaleDateString();
      if (value === null || value === undefined) return '';
      return String(value);
    }));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(title || sheet.name || filename, 28, 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Sheet: ${sheet.name}  (${rows.length} records)`, 28, 52);
    doc.text(`Generated: ${generatedAt}`, pageWidth - 28, 52, { align: 'right' });

    // Dynamic typography and cell padding based on column density
    const fontSize = colCount > 20 ? 6.5 : colCount > 12 ? 7.5 : 8.5;
    const cellPadding = colCount > 20 ? 2.5 : colCount > 12 ? 3 : 4;

    // Per-column custom styling for sequence numbers, statuses, dates, and amounts
    const columnStyles: Record<number, any> = {};
    headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower === 's no' || lower === 's.no') {
        columnStyles[idx] = { halign: 'center', cellWidth: colCount > 20 ? 28 : 34 };
      } else if (lower.includes('status')) {
        columnStyles[idx] = { halign: 'center' };
      } else if (lower.includes('date') || lower === 'valid for' || lower === 'days') {
        columnStyles[idx] = { halign: 'center' };
      } else if (lower.includes('amount') || lower.includes('value') || lower.includes('qar') || lower.includes('price') || lower.includes('total')) {
        columnStyles[idx] = { halign: 'right' };
      }
    });

    autoTable(doc, {
      head: [headers],
      body,
      startY: 68,
      margin: { left: 24, right: 24, top: 68, bottom: 28 },
      tableWidth: 'auto',
      styles: {
        font: 'helvetica',
        fontSize,
        cellPadding,
        overflow: 'linebreak',
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [104, 39, 213],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        fontSize: fontSize + 0.5,
        cellPadding: cellPadding + 1,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      didDrawPage: () => {
        const pageNo = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${pageNo}`, pageWidth - 28, pageHeight - 14, { align: 'right' });
      },
    } as any);
  });

  doc.save(safeFileName(filename).replace(/\.xlsx$/i, '.pdf'));
  toast.success('PDF export downloaded');
};

export const runWorkbookExport = (request: ExportRequest, format: ExportFormat) => {
  if (format === 'pdf') {
    downloadPdfWorkbook(request.filename, request.sheets, request.title);
    return;
  }
  downloadExcelWorkbook(request.filename, request.sheets);
};

export const requestWorkbookExport = (request: ExportRequest) => {
  const usefulSheets = usefulSheetsOf(request.sheets);
  if (!usefulSheets.length) {
    toast.error('No data available to export');
    return;
  }

  const browserReady = typeof window !== 'undefined' && (window as any).__welcometechGlobalExportReady;
  if (!browserReady) {
    runWorkbookExport({ ...request, sheets: usefulSheets }, request.defaultFormat || 'excel');
    return;
  }

  window.dispatchEvent(new CustomEvent<ExportRequest>(GLOBAL_EXPORT_EVENT, {
    detail: { ...request, sheets: usefulSheets },
  }));
};

export const exportExcelWorkbook = (filename: string, sheets: ExportSheet[]) => {
  requestWorkbookExport({ filename, sheets, defaultFormat: 'excel' });
};

export const exportExcelRows = (filename: string, sheetName: string, rows: Array<Record<string, unknown>>) =>
  exportExcelWorkbook(filename, [{ name: sheetName, rows }]);
