import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PlusCircle, Download, ChevronLeft, ChevronRight, Search, FileText, Check,
  Eye, Send, Trash2, Pencil, Image as ImageIcon, X, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Type, Palette, Undo2, Redo2, Table2, ArrowLeft,
  Calendar, Percent, Layers, MapPin, Tag, Mail, Clock, Paperclip, ChevronDown, ChevronUp, Upload, AlertCircle,
  History, RotateCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import api, { cleanErrorMessage } from '../../utils/api';
import type { Proposal, ProposalTemplate, User, Lead, Task } from '../../types';
import { fmt, toAssetUrl, toApiUrl, getActiveCurrency, getActiveCountry, PAGE_SIZE_OPTIONS } from '../../utils/helpers';
import { fontStackForChoice } from '../../utils/fonts';
import { getCommonDocumentStyles, cleanWordArtifacts, handlePrintKeyboardShortcut } from '../../utils/documentStyles';
import { Select, Badge, Avatar, SkeletonRow, EmptyState, StatRow, Modal, DetailItem, SelectField, InputField, Pagination, ConfirmDialog, Spinner } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { exportExcelRows, exportExcelWorkbook } from '../../utils/excelExport';
import toast from 'react-hot-toast';
import { useDateFilter } from '../../context/DateFilterContext';

import { buildTaskAuditTimeline } from '../../utils/timelineHelpers';
import { estimateTextBlockLines, chunkDocumentBlocksForA4Pages, splitHtmlBlocks, normalizeColonTableToTabular, stripDateSuffix, buildProposalNumber } from '../../utils/quotationHelpers';
import { computeLayoutMetrics, toLayoutMetrics, SerializedLayoutMetrics } from '../../utils/quotationLayout';
import { amountToWords } from '../../utils/amountToWords';
import { SettingsPage } from './SettingsPage';
import { RolesPage } from './RolesPage';
import { EmailTemplatesPage } from './EmailTemplatesPage';
import { MediaLibraryPage, MediaFile } from './MediaLibrary';

export { SettingsPage, RolesPage, EmailTemplatesPage, MediaLibraryPage };

export const proposalsListExportRows = (proposals: Proposal[]) => proposals.map((p, idx) => {
  const cust = typeof p.customer === 'object' ? p.customer : null;
  const lead = typeof (p as any).lead === 'object' ? (p as any).lead : null;
  const task = typeof (p as any).task === 'object' ? (p as any).task : null;
  const customerName =
    (cust as any)?.companyName || (cust as any)?.name ||
    (p as any).customerName ||
    (typeof p.customer === 'string' && p.customer ? p.customer : '') ||
    (lead as any)?.companyName || (lead as any)?.name ||
    (p as any).customerEmail ||
    '—';
  const taskFollowUp = task?.status
    ? task.status.charAt(0).toUpperCase() + task.status.slice(1).replace(/_/g, ' ')
    : lead?.status
      ? lead.status
      : '—';
  const currency = getActiveCurrency();
  return {
    'S NO': idx + 1,
    'Proposal #': p.proposalNo || p.proposalId || '—',
    Customer: customerName,
    Title: p.title || '—',
    [`Amount (${currency})`]: Number(p.total ?? p.amount ?? 0),
    'Valid Until': p.validUntil ? fmt.date(p.validUntil) : '—',
    'Task Follow-Up': taskFollowUp,
    Status: p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : 'Draft',
    Revision: p.revision && p.revision > 0
      ? `Rev ${p.revision}`
      : (p.resentAt || (p.resendCount && p.resendCount > 0))
        ? `Resent (${p.resendCount || 1}x)`
        : 'Original (Rev 0)',
  };
});

export const proposalTemplatesListExportRows = (templates: ProposalTemplate[]) => templates.map((t, idx) => {
  const subtotal = (t.items || []).reduce((s, it) => s + (Number(it.total) || (Number(it.qty) || 1) * (Number(it.unitPrice) || 0)), 0);
  const discount = Number(t.discount) || 0;
  const totalAmt = subtotal - subtotal * discount / 100;
  const status = t.status || (t.isActive === false ? 'inactive' : 'active');
  return {
    'S NO': idx + 1,
    'Template Name': t.name || '—',
    'Proposal Title': t.title || '—',
    'Valid For': `${t.validForDays || 10} days`,
    'Discount (%)': `${discount}%`,
    'Line Items': `${(t.items || []).length} items`,
    'Total Amount': totalAmt,
    Status: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active',
  };
});

const autoGrowTextarea = (element: HTMLTextAreaElement | null) => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

const termsHeadingPattern = /^terms\s*(?:&|and)\s*conditions\s*:?\s*$/i;
const richHtmlPattern = /<\/?[a-z][\s\S]*>/i;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const stripTermsHeading = (value?: string) => {
  return String(value || '').trim();
};

const plainTextToRichHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split(/\n/).map((line) => escapeHtml(line)).join('<br>')}</p>`)
    .join('');

const processTextContentForLists = (html: string): string => {
  const normalizedHtml = html.replace(/\r?\n/g, '<br>');
  const parts = normalizedHtml.split(/<br\s*\/?>/i);

  let result = '';
  let currentList: { type: 'ol' | 'ul'; items: string[] } | null = null;
  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      result += `<p>${currentParagraphLines.join('<br>')}</p>`;
      currentParagraphLines = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      result += `<${currentList.type}>`;
      currentList.items.forEach((item) => {
        result += `<li>${item}</li>`;
      });
      result += `</${currentList.type}>`;
      currentList = null;
    }
  };

  parts.forEach((part) => {
    const rawText = part.replace(/<[^>]*>/g, '').trim();
    const olMatch = rawText.match(/^(\d+)\.\s*(.*)$/);
    const ulMatch = rawText.match(/^[-*]\s*(.*)$/);

    if (olMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(part.replace(/^\s*\d+\.\s*/, ''));
    } else if (ulMatch) {
      flushParagraph();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(part.replace(/^\s*[-*]\s*/, ''));
    } else {
      if (currentList && currentList.items.length > 0) {
        const lastIdx = currentList.items.length - 1;
        if (rawText === '') {
          flushList();
          currentParagraphLines.push(part);
        } else {
          currentList.items[lastIdx] += ' ' + part.trim();
        }
      } else {
        currentParagraphLines.push(part);
      }
    }
  });

  flushParagraph();
  flushList();

  return result;
};

const convertHtmlListsToRealLists = (html: string): string => {
  if (typeof document === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const containers = doc.querySelectorAll('p, div');
  if (containers.length === 0) {
    const bodyHtml = doc.body.innerHTML;
    const converted = processTextContentForLists(bodyHtml);
    if (converted !== bodyHtml) {
      doc.body.innerHTML = converted;
    }
  } else {
    containers.forEach((container) => {
      if (container.closest('table') || container.closest('ol') || container.closest('ul')) return;
      const innerHtml = container.innerHTML;
      const converted = processTextContentForLists(innerHtml);
      if (converted !== innerHtml) {
        container.outerHTML = converted;
      }
    });
  }
  return doc.body.innerHTML;
};

const stripEditorTableControls = (value: string) => {
  if (typeof document === 'undefined') {
    return value
      .replace(/<button[^>]*proposal-table-add[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<button[^>]*proposal-table-delete-column[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<button[^>]*proposal-table-delete-row[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<button[^>]*proposal-table-delete-table[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<span[^>]*proposal-table-resize-column[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<div[^>]*proposal-rich-table-shell[^>]*>/gi, '')
      .replace(/<div[^>]*proposal-rich-table-scroll-wrapper[^>]*>/gi, '')
      .replace(/<\/div>/gi, '');
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = value;
  wrapper.querySelectorAll('.proposal-table-add, .proposal-table-delete-column, .proposal-table-delete-row, .proposal-table-delete-table, .proposal-table-resize-column').forEach((control) => control.remove());
  wrapper.querySelectorAll('.proposal-rich-table-shell').forEach((shell) => {
    const parent = shell.parentNode;
    if (!parent) return;

    const scrollWrapper = shell.querySelector('.proposal-rich-table-scroll-wrapper');
    if (scrollWrapper) {
      while (scrollWrapper.firstChild) shell.insertBefore(scrollWrapper.firstChild, scrollWrapper);
      scrollWrapper.remove();
    }

    while (shell.firstChild) parent.insertBefore(shell.firstChild, shell);
    shell.remove();
  });
  return wrapper.innerHTML;
};

const sanitizeRichHtml = (value: string) =>
  stripEditorTableControls(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\s(on\w+)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

const wrapTablesInScrollWrapper = (html: string): string => {
  if (typeof document === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('proposal-rich-table-scroll-wrapper')) return;
    const scrollWrapper = doc.createElement('div');
    scrollWrapper.className = 'proposal-rich-table-scroll-wrapper';
    table.parentNode?.insertBefore(scrollWrapper, table);
    scrollWrapper.appendChild(table);
  });
  return doc.body.innerHTML;
};
const normalizeRichTerms = (value?: string) => {
  const cleaned = stripTermsHeading(value);
  if (!cleaned) return '';
  let html = richHtmlPattern.test(cleaned) ? cleaned : plainTextToRichHtml(cleaned);
  html = convertHtmlListsToRealLists(html);
  html = wrapTablesInScrollWrapper(html);
  html = normalizeColonTableToTabular(html);
  return sanitizeRichHtml(html);
};

export type ProposalLineDraft = {
  description: string;
  qty: string;
  unitPrice: string;
  total: number;
};

export type ProposalTemplateDraft = {
  name: string;
  title: string;
  discount: string;
  validForDays: string;
  status: string;
  terms: string;
  templateImage: string;
  items: ProposalLineDraft[];
};

export const emptyProposalTemplateDraft = (): ProposalTemplateDraft => ({
  name: '',
  title: '',
  discount: '',
  validForDays: '10',
  status: 'active',
  terms: '',
  templateImage: '',
  items: [],
});

export const buildQuotationDocumentHtml = (
  template: ProposalTemplate | any,
  currentForm?: ProposalTemplateDraft | any,
  options: {
    isPrintAutoTrigger?: boolean;
    /** Letter mode (Email Template PDFs): same A4 chrome and pagination, but no quotation number / recipient cards */
    letter?: { subject?: string };
    /** Real-browser measurements from computeLayoutMetrics – replaces character-count height guesses */
    layoutMetrics?: SerializedLayoutMetrics;
    /** When given, receives every text unit (raw → cleaned) that needs measuring */
    collectUnits?: { units: Map<string, string>; sequences?: Array<Array<[string, string]>> };
  } = {}
): string => {
  const {
    brandColor, proposalWatermark, companyName,
    headingFont, contentFont, headingFontName, contentFontName, headingFontUrl, contentFontUrl,
    proposalNo: storeProposalNo, proposalIncludeDate: storeProposalIncludeDate,
  } = useThemeStore.getState();
  const commonDocStyles = getCommonDocumentStyles({
    headingFont,
    contentFont,
    headingFontName,
    contentFontName,
    headingFontUrl,
    contentFontUrl,
    brandColor: brandColor || '#6d28d9',
  });
  const brand = brandColor || '#6d28d9';
  const watermarkUrl = proposalWatermark ? toAssetUrl(proposalWatermark) : '';
  const headerBanner = (currentForm as any)?.templateImage || (currentForm as any)?.headerImage || (template as any)?.templateImage || (template as any)?.headerImage || '';
  const footerBanner = (currentForm as any)?.templateFooterImage || (currentForm as any)?.footerImage || (template as any)?.templateFooterImage || (template as any)?.footerImage || '';
  const headerUrl = headerBanner ? toAssetUrl(headerBanner) : '';
  const footerUrl = footerBanner ? toAssetUrl(footerBanner) : '';

  const name = currentForm?.name || template.name || 'Template';
  const discount = Number(currentForm?.discount ?? template.discount) || 0;
  const validForDays = Number(currentForm?.validForDays ?? template.validForDays) || 10;

  const company = {
    name: (currentForm as any)?.companyInfo?.name || (template as any)?.companyName || companyName || 'Welcome Tech CRM',
    a1: (currentForm as any)?.companyInfo?.addressLine1 || '',
    a2: (currentForm as any)?.companyInfo?.addressLine2 || '',
    phone: (currentForm as any)?.companyInfo?.contactNo || '',
    email: (currentForm as any)?.companyInfo?.email || ''
  };
  const client = {
    company:
      (currentForm as any)?.customerDetails?.companyName ||
      (currentForm as any)?.customerName ||
      (template as any)?.customerDetails?.companyName ||
      (template as any)?.customerName ||
      '',
    contactName:
      (currentForm as any)?.customerDetails?.contactName ||
      (currentForm as any)?.customerDetails?.contactPerson ||
      (currentForm as any)?.customerContactPerson ||
      (currentForm as any)?.contactName ||
      (currentForm as any)?.contactPerson ||
      (currentForm as any)?.customer?.contact ||
      (currentForm as any)?.lead?.name ||
      (template as any)?.customerDetails?.contactName ||
      (template as any)?.customerDetails?.contactPerson ||
      (template as any)?.customerContactPerson ||
      (template as any)?.contactName ||
      (template as any)?.contactPerson ||
      (template as any)?.customer?.contact ||
      (template as any)?.lead?.name ||
      '',
    a1:
      (currentForm as any)?.customerDetails?.addressLine1 ||
      (currentForm as any)?.customerAddress ||
      (template as any)?.customerDetails?.addressLine1 ||
      (template as any)?.customerAddress ||
      '',
    a2: (currentForm as any)?.customerDetails?.addressLine2 || (template as any)?.customerDetails?.addressLine2 || '',
    phone:
      (currentForm as any)?.customerDetails?.phone ||
      (currentForm as any)?.customerPhone ||
      (template as any)?.customerDetails?.phone ||
      (template as any)?.customerPhone ||
      '',
    email:
      (currentForm as any)?.customerDetails?.email ||
      (currentForm as any)?.customerEmail ||
      (template as any)?.customerDetails?.email ||
      (template as any)?.customerEmail ||
      ''
  };
  const authUser = typeof window !== 'undefined' ? (useAuthStore.getState()?.user as any) : null;
  const senderEmail =
    (currentForm as any)?.senderEmail ||
    (currentForm as any)?.quotationDetails?.senderEmail ||
    (template as any)?.senderEmail ||
    (template as any)?.quotationDetails?.senderEmail ||
    (currentForm as any)?.createdBy?.email ||
    (template as any)?.createdBy?.email ||
    company.email ||
    authUser?.email ||
    'sales@welcometech.qa';

  const senderPhone =
    (currentForm as any)?.senderPhone ||
    (currentForm as any)?.quotationDetails?.senderPhone ||
    (template as any)?.senderPhone ||
    (template as any)?.quotationDetails?.senderPhone ||
    (currentForm as any)?.createdBy?.phone ||
    (template as any)?.createdBy?.phone ||
    company.phone ||
    authUser?.phone ||
    '+97466032346';
  const now = new Date();
  const gb = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' });
  const dateLabel = (value: any, fallback: Date) => {
    if (!value) return gb(fallback);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(trimmed)) {
        return trimmed;
      }
      const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = months[parseInt(dmy[2], 10) - 1] || dmy[2];
        return `${d} ${m} ${dmy[3]}`;
      }
      const ymd = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
      if (ymd) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = months[parseInt(ymd[2], 10) - 1] || ymd[2];
        return `${ymd[3]} ${m} ${ymd[1]}`;
      }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : gb(parsed);
  };
  const effectiveIncludeDate = (currentForm as any)?.quotationDetails?.proposalIncludeDate !== undefined
    ? Boolean((currentForm as any).quotationDetails.proposalIncludeDate)
    : (storeProposalIncludeDate !== undefined ? Boolean(storeProposalIncludeDate) : false);

  const rawProvidedQuoteNo = (currentForm as any)?.quotationDetails?.quoteNo || (template as any)?.quoteNo || (currentForm as any)?.proposalNo || (template as any)?.proposalNo;
  const existingDateSuffixMatch = (rawProvidedQuoteNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
  const baseSerialNo = rawProvidedQuoteNo ? stripDateSuffix(rawProvidedQuoteNo) : (storeProposalNo || 'WT-Q1001');

  let quoteNo = '';
  if (!options.letter) {
    if (existingDateSuffixMatch) {
      quoteNo = rawProvidedQuoteNo.trim();
    } else {
      quoteNo = buildProposalNumber(baseSerialNo, effectiveIncludeDate, (currentForm as any)?.quotationDetails?.quoteDate || now);
    }
  }
  const refLabel = options.letter ? (options.letter.subject || '') : (quoteNo ? `Quotation ${quoteNo}` : '');
  let resolvedQuoteDate = (currentForm as any)?.quotationDetails?.quoteDate;
  if (existingDateSuffixMatch && (!resolvedQuoteDate || String(resolvedQuoteDate).includes('-') || String(resolvedQuoteDate).includes('/'))) {
    resolvedQuoteDate = existingDateSuffixMatch[1];
  }
  const quoteDate = dateLabel(resolvedQuoteDate, now);
  const validUntil = dateLabel((currentForm as any)?.quotationDetails?.validUntil, new Date(now.getTime() + validForDays * 86400000));
  const activeCountry = getActiveCountry();
  const cur = getActiveCurrency(activeCountry);
  const money = (n: number) => `${cur} ${(Number(n) || 0).toFixed(2)}`;

  const legacyItems = (currentForm?.items || template.items || []).filter((it: any) => (it?.description || '').trim());
  const formatDlItems = (list: any[]) => list.map((it: any, i: number) => ({ id: it.id || i + 1, type: it.type || 'item', no: it.no || i + 1, description: it.description, qty: it.qty, unitPrice: it.unitPrice }));
  const srcBlocks: any[] = Array.isArray((currentForm as any)?.blocks) ? [...(currentForm as any).blocks]
    : Array.isArray((template as any)?.blocks) ? [...(template as any).blocks]
      : [];
  const hasPopulatedTableDl = srcBlocks.some(
    (b: any) => b?.type === 'table' && Array.isArray(b?.items) && b.items.filter((it: any) => it?.type !== 'detail' && (it?.description || '').trim()).length > 0
  );
  let rawBlocks: any[] = [...srcBlocks];
  if (!hasPopulatedTableDl && legacyItems.length > 0) {
    const emptyIdx = rawBlocks.findIndex((b: any) => b?.type === 'table');
    const tItems = formatDlItems(legacyItems);
    if (emptyIdx >= 0) {
      rawBlocks[emptyIdx] = { ...rawBlocks[emptyIdx], items: tItems, discountPercent: rawBlocks[emptyIdx].discountPercent !== undefined ? rawBlocks[emptyIdx].discountPercent : discount };
    } else {
      rawBlocks.push({ id: 'pricing_table_block', type: 'table', title: '', discountPercent: discount, items: tItems });
    }
  } else if (rawBlocks.length === 0 && legacyItems.length > 0) {
    rawBlocks = [{ id: 'legacy', type: 'table', title: '', discountPercent: discount, items: formatDlItems(legacyItems) }];
  }

  if ((currentForm?.terms || template?.terms) && !rawBlocks.some((b: any) => b?.type === 'text')) {
    rawBlocks.push({
      id: 'terms_block',
      type: 'text',
      title: 'Terms & Conditions',
      content: currentForm?.terms || template?.terms,
    });
  }

  const esc = (v: any) => escapeHtml(String(v ?? ''));

  const blockTableTotal = (block: any) => {
    const rows = Array.isArray(block?.items) ? block.items : [];
    const sub = rows.reduce((a: number, it: any) => it?.type === 'item' ? a + (Number(it?.qty) || 0) * (Number(it?.unitPrice) || 0) : a, 0);
    const disc = Number(block?.discountPercent !== undefined && block?.discountPercent !== null && block?.discountPercent !== '' ? block.discountPercent : discount) || 0;
    const isAmount = block?.discountType === 'amount';
    const discAmount = isAmount ? Math.min(sub, Math.max(0, disc)) : (sub * disc / 100);
    return { sub, disc, discAmount, isAmount, total: Math.max(0, sub - discAmount) };
  };

  const renderTable = (block: any, slice?: any, pageNum?: number) => {
    const isContinuation = slice?.isTableContinuation ?? false;
    const isEnd = slice?.isTableEnd ?? true;
    const rows = Array.isArray(slice?.itemsSlice) ? slice.itemsSlice : (Array.isArray(block?.items) ? block.items : []);
    const rowsHtml = rows.map((it: any) => {
      if (it?.type === 'detail') {
        return `<tr data-row="${slice?.globalIndex ?? 0}:${(block?.items || []).indexOf(it)}" style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
          <td style="padding:6px 8px;"></td>
          <td style="padding:6px 14px;color:#64748b;font-weight:400;word-break:break-word;">${esc(it?.description)}</td>
          <td style="padding:6px 8px;"></td>
          <td style="padding:6px 14px;"></td>
          <td style="padding:6px 14px;"></td>
        </tr>`;
      }
      const qty = Number(it?.qty) || 0;
      const price = Number(it?.unitPrice) || 0;
      const rowTotal = qty * price;
      return `<tr data-row="${slice?.globalIndex ?? 0}:${(block?.items || []).indexOf(it)}" style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;text-align:center;color:#64748b;font-weight:600;font-size:0.82rem;">${it?.no ?? ''}</td>
        <td style="padding:7px 14px;font-weight:600;color:#0f172a;word-break:break-word;">${esc(it?.description)}</td>
        <td style="padding:6px 8px;text-align:center;">${qty}</td>
        <td style="padding:6px 14px;text-align:right;font-family:monospace;">${price > 0 ? price.toFixed(2) : '<span style="color:#94a3b8;">—</span>'}</td>
        <td style="padding:8px 14px;text-align:right;font-weight:700;font-family:monospace;">${rowTotal > 0 ? `${rowTotal.toFixed(2)}` : '<span style="display:inline-block;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:800;letter-spacing:0.04em;">FREE</span>'}</td>
      </tr>`;
    }).join('');
    const { sub, disc, discAmount, isAmount, total } = blockTableTotal(block);
    return `
      <div class="quote-table-wrap" data-est="${slice?.estWeight ?? ''}" style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#ffffff;">
        ${isContinuation ? `
        <div data-role="table-banner" style="background:#f8fafc;padding:6px 14px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;font-weight:800;color:${brand};text-transform:uppercase;letter-spacing:0.04em;">Pricing Table #${(slice?.globalIndex ?? 0) + 1} (Continued)</span>
          <span style="font-size:10.5px;color:#64748b;font-weight:600;">Continued from Page ${(pageNum ?? 2) - 1}</span>
        </div>` : ''}
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.84rem;table-layout:fixed;">
          <colgroup><col style="width:44px;"><col><col style="width:60px;"><col style="width:158px;"><col style="width:158px;"></colgroup>
          <thead>
            <tr style="background:${brand};color:#fff;">
              <th style="border:none;border-top-left-radius:7px;background:${brand};color:#fff;padding:9px 8px;text-align:center;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">No</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 14px;text-align:left;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Description</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 8px;text-align:center;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Qty</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 14px;text-align:right;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Unit Price (${cur})</th>
              <th style="border:none;border-top-right-radius:7px;background:${brand};color:#fff;padding:9px 14px;text-align:right;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Amount (${cur})</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot data-role="table-tfoot" data-end="${isEnd ? 1 : 0}" data-disc="${discAmount > 0 ? 1 : 0}" style="background:#f8fafc;border-top:2px solid #e2e8f0;">
            ${isEnd ? `
              ${discAmount > 0 ? `
                <tr>
                  <td colspan="4" style="text-align:right;padding:8px 14px;font-weight:600;color:#64748b;font-size:0.84rem;border:none;white-space:nowrap;">Subtotal:</td>
                  <td style="text-align:right;padding:8px 14px;font-weight:700;color:#0f172a;font-family:monospace;font-size:0.88rem;border:none;white-space:nowrap;">${money(sub)}</td>
                </tr>
                <tr>
                  <td colspan="4" style="text-align:right;padding:6px 14px;font-weight:700;color:#dc2626;font-size:0.84rem;border:none;white-space:nowrap;">Discount (${isAmount ? 'Amount' : `${disc}%`}):</td>
                  <td style="text-align:right;padding:6px 14px;font-weight:700;color:#dc2626;font-family:monospace;font-size:0.88rem;border:none;white-space:nowrap;">-${money(discAmount)}</td>
                </tr>
              ` : ''}
              <tr style="border-top:1px solid #e2e8f0;">
                <td colspan="4" style="text-align:right;padding:12px 14px;font-weight:800;color:#0f172a;font-size:0.92rem;border:none;white-space:nowrap;">Table Total:</td>
                <td style="text-align:right;padding:12px 14px;font-weight:900;color:${brand};font-family:monospace;font-size:1.02rem;border:none;white-space:nowrap;">${money(total)}</td>
              </tr>
              <tr style="border-top:1px dashed #e2e8f0;background:#ffffff;">
                <td colspan="5" style="border:none;border-bottom-left-radius:7px;border-bottom-right-radius:7px;padding:10px 14px;font-size:0.80rem;color:#475569;font-style:italic;">
                  <span style="font-weight:700;color:#0f172a;font-style:normal;margin-right:6px;">Amount in Words:</span>
                  ${esc(amountToWords(total, activeCountry))}
                </td>
              </tr>
            ` : `
              <tr>
                <td colspan="5" style="border:none;border-bottom-left-radius:7px;border-bottom-right-radius:7px;padding:9px 14px;font-size:0.80rem;color:${brand};font-weight:700;font-style:italic;text-align:right;">
                  ↳ Pricing Table #${(slice?.globalIndex ?? 0) + 1} continues on Page ${(pageNum ?? 1) + 1}...
                </td>
              </tr>
            `}
          </tfoot>
        </table>
      </div>`;
  };

  const renderText = (block: any, slice?: any, pageNum?: number) => {
    const isContinuation = slice?.isTextContinuation ?? false;
    const rawContent = slice?.contentSlice !== undefined ? slice.contentSlice : (block?.content || '');
    const htmlToRender = normalizeColonTableToTabular(cleanWordArtifacts(rawContent), brand);
    return `
      <div class="textblock" data-est="${slice?.estWeight ?? ''}">
        ${block?.title ? (
        isContinuation
          ? `<div class="textblock-title" data-role="text-title-cont" style="font-size:0.85rem;color:#64748b;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span style="color:${brand};font-weight:800;">${esc(block.title)}</span>
                <span style="font-size:0.75rem;background:#f1f5f9;padding:2px 7px;border-radius:4px;font-weight:700;">(Continued from Page ${(pageNum ?? 2) - 1})</span>
              </div>`
          : `<div class="textblock-title" data-role="text-title">${esc(block.title)}</div>`
      ) : ''}
        <div class="rich">${htmlToRender}</div>
      </div>`;
  };

  // Saved proposals can still hold legacy "Label : Value" / specs tables. Upgrade them to the grid format BEFORE the pages are
  // split (the server PDF does the same), so a tabular column is laid out – and kept on one page – as the grid it will render as.
  rawBlocks = rawBlocks.map((b: any) => (
    b?.type === 'text' && b?.content ? { ...b, content: normalizeColonTableToTabular(b.content, brand) } : b
  ));

  if (options.collectUnits) {
    rawBlocks.forEach((b: any) => {
      if (b?.type !== 'text') return;
      const seq: Array<[string, string]> = splitHtmlBlocks(b?.content || '').map((u) => [u, normalizeColonTableToTabular(cleanWordArtifacts(u), brand)] as [string, string]);
      seq.forEach(([u, c]) => options.collectUnits!.units.set(u, c));
      if (seq.length) (options.collectUnits!.sequences = options.collectUnits!.sequences || []).push(seq);
      if (b?.content) options.collectUnits!.units.set(b.content, normalizeColonTableToTabular(cleanWordArtifacts(b.content), brand));
    });
  }

  const tableCount = rawBlocks.filter((b: any) => b?.type === 'table').length;
  const ot = (currentForm as any)?.overallTotal || (template as any)?.overallTotal || (options as any)?.overallTotal || {};
  const isOtVisible = Boolean(ot?.show === true);
  const chunks = chunkDocumentBlocksForA4Pages(rawBlocks, {
    hasHeaderImage: Boolean(headerUrl),
    hasFooterImage: Boolean(footerUrl),
    isEditor: false,
    honorPageBreaks: false,
    isLetter: Boolean(options.letter),
    metrics: toLayoutMetrics(options.layoutMetrics, tableCount, isOtVisible),
  });

  const grandTotal = rawBlocks.reduce((s: number, b: any) => b?.type === 'table' ? s + blockTableTotal(b).total : s, 0);

  return `
    <html><head>
      <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/" />
      <title>${options.letter ? esc(options.letter.subject || name) : `Quotation – ${esc(name)}`}</title>
      <style>
        ${commonDocStyles}
        html,body{background:#0f172a;}
        .doc{display:flex;flex-direction:column;align-items:center;padding:24px 0;margin:0 auto;width:100%;}
        .page.a4-discrete-sheet{width:210mm;min-height:297mm;height:297mm;background:#fff;padding:0;position:relative;box-shadow:0 18px 48px rgba(0,0,0,.45);border-radius:8px;margin:0 auto 28px auto;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;}
        .page.a4-discrete-sheet:last-child{page-break-after:auto;break-after:auto;margin-bottom:0;}
        .page>*:not(.wm):not(.quotation-footer-banner){position:relative;z-index:1;}
        .wm{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:.06;}
        .wm img{width:min(58%,520px);object-fit:contain;}
        .run-header{text-align:center;padding:0;margin:0;width:100%;border-bottom:1.5px solid #cbd5e1;flex-shrink:0 !important;box-sizing:border-box;}
        .run-header img{width:100%;height:auto;display:block;border-radius:0;}
        .quotation-footer-banner{width:100%;border-top:1.5px solid #cbd5e1;position:relative;z-index:1;margin-top:auto;flex-shrink:0 !important;box-sizing:border-box;}
        .quotation-footer-banner img{width:100%;height:auto;display:block;border-radius:0;}
        .quotation-text-footer{margin-top:auto;width:100%;flex-shrink:0;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;padding:12px 36px;border-top:1px solid #cbd5e1;font-size:11px;color:#94a3b8;background:#ffffff;}
        .inner-content{padding:0 36px 14px 36px;box-sizing:border-box;}

        .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
        .co-name{font-size:1.35rem;color:${brand};font-weight:800;margin-bottom:2px;}
        .co-line{font-size:0.82rem;color:#475569;margin-bottom:2px;}
        .co-kv{display:flex;gap:8px;font-size:0.82rem;margin-top:2px;}
        .co-kv b{font-weight:600;color:#64748b;}
        .qtitle{text-align:right;margin-left:auto;}
        .qtitle h2{margin:0;font-size:1.6rem;font-weight:900;color:#0f172a;letter-spacing:0.08em;}
        .qtitle .qno{font-size:0.85rem;color:${brand};font-weight:700;margin-top:2px;}
        .cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;font-size:0.84rem;break-inside:avoid;page-break-inside:avoid;}
        .meta-card{background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;padding:14px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.02);}
        .meta-card-header{font-weight:800;font-size:11px;color:${brand};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;display:flex;align-items:center;gap:6px;}
        .meta-grid{display:grid;grid-template-columns:105px 12px 1fr;row-gap:5px;align-items:center;font-size:0.82rem;}
        .recipient-grid{display:grid;grid-template-columns:100px 12px 1fr;row-gap:4px;margin-top:4px;font-size:0.82rem;align-items:center;}
        .meta-colon{text-align:center;color:#64748b;font-weight:700;}
        .meta-label{font-weight:600;color:#64748b;}
        .meta-value{font-weight:600;color:#0f172a;}
        .quote-table-wrap{margin-bottom:14px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;background:#ffffff;}
        @media screen and (max-width: 900px) {
          .doc{padding:10px 4px;width:100%;box-sizing:border-box;}
          .page.a4-discrete-sheet{width:100% !important;max-width:100% !important;min-width:0 !important;min-height:auto !important;height:auto !important;border-radius:6px !important;margin:0 auto 16px auto !important;box-shadow:0 4px 16px rgba(0,0,0,.25) !important;}
          .inner-content{padding:0 12px 14px 12px !important;}
          .quotation-text-footer{padding:10px 12px !important;flex-direction:column !important;gap:4px !important;text-align:center !important;}
          .cards-grid{grid-template-columns:1fr !important;gap:10px !important;}
        }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html,body{background:#fff !important;margin:0 !important;padding:0 !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
          .doc{display:block !important;padding:0 !important;margin:0 !important;width:100% !important;}
          .page.a4-discrete-sheet{width:100% !important;min-height:296.5mm !important;height:296.5mm !important;max-height:296.5mm !important;margin:0 !important;padding:0 !important;box-shadow:none !important;border-radius:0 !important;display:flex !important;flex-direction:column !important;justify-content:flex-start !important;overflow:hidden !important;page-break-after:always !important;break-after:page !important;page-break-inside:avoid !important;break-inside:avoid !important;}
          .page.a4-discrete-sheet:last-child{page-break-after:auto !important;break-after:auto !important;}
          .wm{position:fixed;top:40%;left:0;right:0;bottom:auto;height:auto;}
          .run-header{margin:0 !important;padding:0 !important;width:100% !important;border-bottom:1.5px solid #cbd5e1 !important;flex-shrink:0 !important;box-sizing:border-box !important;}
          .run-header img{width:100% !important;height:auto !important;display:block !important;}
          .quotation-footer-banner{position:relative !important;width:100% !important;margin-top:auto !important;border-top:1.5px solid #cbd5e1 !important;flex-shrink:0 !important;box-sizing:border-box !important;}
          .quotation-footer-banner img{width:100% !important;height:auto !important;display:block !important;}
          .quotation-text-footer{margin-top:auto !important;width:100% !important;flex-shrink:0 !important;box-sizing:border-box !important;display:flex !important;justify-content:space-between !important;align-items:center !important;padding:12px 36px !important;border-top:1px solid #cbd5e1 !important;font-size:11px !important;color:#94a3b8 !important;background:#ffffff !important;}
          .inner-content{padding:0 36px 10px 36px !important;box-sizing:border-box !important;}
          .rich div, .rich p { break-inside: auto !important; page-break-inside: auto !important; margin: 0 0 3px 0 !important; }
          .rich li { break-inside: avoid !important; page-break-inside: avoid !important; margin-bottom: 3px !important; }
          .rich ul, .rich ol { margin: 4px 0 8px 20px !important; padding: 0 !important; }
          .rich h1,.rich h2,.rich h3,.textblock-title{break-after:avoid !important;page-break-after:avoid !important;break-inside:avoid !important;page-break-inside:avoid !important;}
          .rich img, .rendered-email-body img {
            max-width: 100% !important;
            max-height: 480px;
            height: auto !important;
            object-fit: contain;
            display: block;
            margin: 8px auto;
            border-radius: 6px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .textblock{break-inside:auto !important;page-break-inside:auto !important;margin-bottom:12px !important;}
          .cards-grid { margin-bottom: 12px !important; gap: 14px !important; break-inside: avoid !important; page-break-inside: avoid !important; }
          .meta-card { padding: 12px 14px !important; border: 1.5px solid #cbd5e1 !important; }
          .quote-table-wrap { overflow: hidden !important; margin-bottom: 12px !important; border-radius: 8px !important; border: 1px solid #cbd5e1 !important; }
          .quote-table-wrap table { width: 100% !important; border-collapse: separate !important; border-spacing: 0 !important; }
          .quote-table-wrap thead tr th { background: ${brand} !important; color: #fff !important; border: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .quote-table-wrap thead tr th:first-child { border-top-left-radius: 7px !important; }
          .quote-table-wrap thead tr th:last-child { border-top-right-radius: 7px !important; }
          .quote-table-wrap tfoot tr:last-child td:first-child { border-bottom-left-radius: 7px !important; }
          .quote-table-wrap tfoot tr:last-child td:last-child { border-bottom-right-radius: 7px !important; }
        }
      </style>
    </head><body>
      <main class="doc">
        ${chunks.map((chunk) => `
          <section class="page a4-discrete-sheet">
            ${watermarkUrl ? `<div class="wm"><img src="${watermarkUrl}" alt="" /></div>` : ''}

            <!-- TOP HEADER SECTION -->
            ${chunk.isFirst ? `
              <div>
                ${headerUrl ? `
                <div class="run-header">
                  <img src="${headerUrl}" alt="header" />
                </div>
                ` : `
                <div class="head" style="padding:24px 36px 0 36px;margin-bottom:16px;">
                  <div style="max-width:420px;">
                    <div class="co-name">${esc(company.name)}</div>
                    ${company.a1 ? `<div class="co-line">${esc(company.a1)}</div>` : ''}
                    ${company.a2 ? `<div class="co-line">${esc(company.a2)}</div>` : ''}
                    ${company.phone ? `<div class="co-kv"><b>Phone:</b><span>${esc(company.phone)}</span></div>` : ''}
                    ${company.email ? `<div class="co-kv"><b>Email:</b><span>${esc(company.email)}</span></div>` : ''}
                  </div>
                  <div class="qtitle">
                    ${quoteNo ? `<div class="qno">${esc(quoteNo)}</div>` : ''}
                  </div>
                </div>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 36px 16px 36px;" />
                `}

                ${(Boolean(client.company || client.email || quoteNo)) ? `
                <div class="inner-content">
                  ${headerUrl && quoteNo && !Boolean(client.company || client.email || quoteNo) ? `
                  <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
                    <div style="font-size:0.85rem;color:${brand};font-weight:700;">${esc(quoteNo)}</div>
                  </div>
                  ` : ''}
                  <div class="cards-grid">
                    <div class="meta-card">
                      <div class="meta-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${brand}" stroke-width="2.5"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
                        <span>Recipient Information</span>
                      </div>
                      ${client.company ? `<div style="font-weight:800;font-size:0.95rem;color:#0f172a;margin-bottom:4px;">${esc(client.company)}</div>` : '<div style="color:#94a3b8;font-style:italic;">Customer / Company Name</div>'}
                      ${client.a1 ? `<div style="color:#64748b;font-size:0.82rem;margin-bottom:4px;">${esc(client.a1)}</div>` : ''}
                      <div class="recipient-grid">
                        ${client.contactName ? `
                          <span class="meta-label">Contact Name</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.contactName)}</span>
                        ` : ''}
                        ${client.phone ? `
                          <span class="meta-label">Phone</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.phone)}</span>
                        ` : ''}
                        ${client.email ? `
                          <span class="meta-label">Email</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.email)}</span>
                        ` : ''}
                      </div>
                    </div>
                    <div class="meta-card">
                      <div class="meta-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${brand}" stroke-width="2.5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                        <span>Document Specifications</span>
                      </div>
                      <div class="meta-grid">
                        <span class="meta-label">Quotation No</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value" style="color:${brand};font-weight:800;letter-spacing:0.02em;">${esc(quoteNo)}</span>

                        <span class="meta-label">Quote Date</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${esc(quoteDate)}</span>

                        <span class="meta-label">Validity Period</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${validForDays} Days</span>

                        <span class="meta-label">Valid Until</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${esc(validUntil)}</span>

                        ${senderEmail ? `
                          <span class="meta-label">Sender Email</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(senderEmail)}</span>
                        ` : ''}

                        ${senderPhone ? `
                          <span class="meta-label">Contact No</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(senderPhone)}</span>
                        ` : ''}

                        ${discount > 0 ? `
                          <span class="meta-label">Overall Discount</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value" style="color:#dc2626;font-weight:800;">${discount}%</span>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>
                ` : (options.letter ? '<div style="height:6px;"></div>' : '')}
              </div>
            ` : `
              <!-- Continuation Page Header (Page 2+) — Matching Create/Edit Canvas Header Banner -->
              <div style="flex-shrink:0;width:100%;box-sizing:border-box;">
              ${headerUrl ? `
              <div class="run-header">
                <img src="${headerUrl}" alt="header" />
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 36px 8px 36px;border-bottom:1px solid #cbd5e1;background:#ffffff;margin-bottom:14px;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-weight:800;font-size:12px;color:${brand};">${esc(company.name)}</span>
                  ${refLabel ? `<span style="font-size:11.5px;color:#64748b;font-weight:600;">· ${esc(refLabel)}</span>` : ''}
                </div>
                <div style="font-size:10.5px;font-weight:800;color:${brand};background:rgba(109,40,217,0.08);padding:2px 8px;border-radius:5px;text-transform:uppercase;letter-spacing:0.04em;">
                  Page ${chunk.pageNum} of ${chunks.length}
                </div>
              </div>
              ` : `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 36px;border-bottom:1.5px solid #cbd5e1;background:#ffffff;margin-bottom:14px;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-weight:800;font-size:13px;color:${brand};">${esc(company.name)}</span>
                  ${refLabel ? `<span style="font-size:12px;color:#64748b;font-weight:600;">· ${esc(refLabel)}</span>` : ''}
                </div>
                <div style="font-size:11px;font-weight:800;color:${brand};background:rgba(109,40,217,0.08);padding:3px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:0.04em;">
                  Page ${chunk.pageNum} of ${chunks.length}
                </div>
              </div>
              `}
              </div>
            `}

            <!-- MIDDLE BLOCKS -->
            <div data-role="page-content" style="padding:0 36px 14px 36px;flex:1;box-sizing:border-box;min-height:0;">
              ${chunk.slices.map((slice: any) => slice.block?.type === 'text' ? renderText(slice.block, slice, chunk.pageNum) : renderTable(slice.block, slice, chunk.pageNum)).join('')}

              ${(() => {
      if (!chunk.isLast || !isOtVisible) return '';
      const otLabel = String(ot.label || 'Overall Quotation Total:').trim();
      const otNotes = ot.notes ? String(ot.notes).trim() : '';
      const showWords = ot.showWords !== false;
      return `
                <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:12px 18px;background:#f8fafc;border-radius:10px;border:2px solid ${brand};margin-top:14px;margin-bottom:18px;">
                  <div style="font-size:0.8rem;color:#475569;text-align:left;max-width:55%;">
                    ${otNotes ? `<div style="font-weight:600;color:#334155;white-space:pre-line;">${esc(otNotes)}</div>` : ''}
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <div style="font-size:1.25rem;font-weight:900;color:#0f172a;display:flex;align-items:center;gap:12px;">
                      <span>${esc(otLabel)}</span>
                      <span style="color:${brand};">${money(grandTotal)}</span>
                    </div>
                    ${showWords ? `
                    <div style="font-size:0.82rem;color:#475569;font-style:italic;">
                      <span style="font-weight:700;color:#0f172a;font-style:normal;margin-right:6px;">Amount in Words:</span>
                      ${esc(amountToWords(grandTotal, activeCountry))}
                    </div>` : ''}
                  </div>
                </div>`;
    })()}
            </div>

            <!-- BOTTOM FOOTER SECTION -->
            ${footerUrl ? `
            <div data-role="page-footer" style="margin-top:auto;width:100%;flex-shrink:0;box-sizing:border-box;">
              <div class="quotation-footer-banner">
                <img src="${footerUrl}" alt="footer" />
              </div>
            </div>
            ` : `
            <div class="quotation-text-footer" data-role="page-footer">
              <span>${esc(company.name)} · Confidential Quotation</span>
              <span style="font-weight:700;color:#64748b;">Page ${chunk.pageNum} of ${chunks.length}</span>
            </div>
            `}
          </section>
        `).join('')}
      </main>
      ${options.isPrintAutoTrigger !== false ? `
      <script>
        window.onload = function() {
          var imgs = document.getElementsByTagName('img');
          var total = imgs.length, loaded = 0;
          var go = function() { setTimeout(function(){ window.print(); window.close(); }, 500); };
          if (!total) { go(); return; }
          for (var i = 0; i < total; i++) {
            if (imgs[i].complete) { if (++loaded === total) go(); }
            else { imgs[i].onload = imgs[i].onerror = function(){ if (++loaded === total) go(); }; }
          }
          setTimeout(go, 3000);
        };
      </script>
      ` : ''}
    </body></html>
  `;
};

/**
 * Same document, but paginated with heights measured in a real browser render (no gaps above the footer,
 * nothing sliding under it). Falls back to the estimated layout if measurement is not possible.
 */
export const buildMeasuredQuotationHtml = async (
  template: ProposalTemplate | any,
  currentForm?: ProposalTemplateDraft | any,
  options: { isPrintAutoTrigger?: boolean; letter?: { subject?: string } } = {}
): Promise<string> => {
  const metrics = await computeLayoutMetrics((m, collect) =>
    buildQuotationDocumentHtml(template, currentForm, { isPrintAutoTrigger: false, letter: options.letter, layoutMetrics: m, collectUnits: collect })
  );
  return buildQuotationDocumentHtml(template, currentForm, { ...options, layoutMetrics: metrics });
};

/** Preview iframe that shows the estimated layout immediately and smoothly updates when measured layout differs. */
export const MeasuredQuotationFrame: React.FC<{ template: any; form?: any; title: string }> = ({ template, form, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [zoomMode, setZoomMode] = useState<'fit' | '100%'>('fit');
  const storeProposalNo = useThemeStore((s) => s.proposalNo);
  const storeProposalIncludeDate = useThemeStore((s) => s.proposalIncludeDate);
  const estimated = useMemo(
    () => buildQuotationDocumentHtml(template, form ?? template, { isPrintAutoTrigger: false }),
    [template, form, storeProposalNo, storeProposalIncludeDate]
  );
  const [html, setHtml] = useState(estimated);
  const currentHtmlRef = useRef(estimated);

  useEffect(() => {
    let cancelled = false;
    currentHtmlRef.current = estimated;
    setHtml(estimated);
    buildMeasuredQuotationHtml(template, form ?? template, { isPrintAutoTrigger: false })
      .then((h) => {
        if (!cancelled && h && h.trim() !== currentHtmlRef.current.trim()) {
          currentHtmlRef.current = h;
          setHtml(h);
        }
      })
      .catch(() => { /* keep the estimated layout */ });
    return () => { cancelled = true; };
  }, [estimated, template, form]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, []);

  const isNarrow = containerWidth > 0 && containerWidth < 840;
  const fitScale = useMemo(() => {
    if (!containerWidth || containerWidth >= 840) return 1;
    return Math.max(0.3, Math.min(1, (containerWidth - 12) / 840));
  }, [containerWidth]);

  const activeScale = isNarrow && zoomMode === 'fit' ? fitScale : 1;
  const isScaled = isNarrow && zoomMode === 'fit';

  return (
    <div
      ref={containerRef}
      className="measured-quotation-wrapper"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f172a',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isNarrow && (
        <div
          className="proposal-preview-zoom-bar no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'rgba(15, 23, 42, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#94a3b8',
            fontSize: 12,
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
            Preview ({Math.round(activeScale * 100)}%)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setZoomMode('fit')}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: zoomMode === 'fit' ? '1px solid #7c3aed' : '1px solid #334155',
                background: zoomMode === 'fit' ? '#7c3aed' : '#1e293b',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Fit Width
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('100%')}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: zoomMode === '100%' ? '1px solid #7c3aed' : '1px solid #334155',
                background: zoomMode === '100%' ? '#7c3aed' : '#1e293b',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              100% (Scroll)
            </button>
          </div>
        </div>
      )}

      <div
        className="proposal-preview-scroll-viewport"
        style={{
          flex: 1,
          width: '100%',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: isScaled ? `${840 * activeScale}px` : (isNarrow ? '840px' : '100%'),
            height: isScaled ? '100%' : '100%',
            minHeight: '100%',
            margin: '0 auto',
            position: 'relative',
            overflow: isScaled ? 'hidden' : 'visible',
          }}
        >
          <iframe
            srcDoc={html}
            title={title}
            style={{
              width: isNarrow ? '840px' : '100%',
              height: isScaled ? `calc(100% / ${activeScale})` : '100%',
              transform: isScaled ? `scale(${activeScale})` : 'none',
              transformOrigin: 'top left',
              border: 'none',
              display: 'block',
              backgroundColor: '#0f172a',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const downloadTemplatePDF = (template: ProposalTemplate, currentForm?: ProposalTemplateDraft | any) => {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) { toast.error('Please allow popups to download the PDF'); return; }
  if (printWindow.document) {
    printWindow.document.title = 'Preparing document…';
  }
  const write = (html: string) => {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  api.get('/settings').then((res) => {
    if (res.data?.data) {
      useThemeStore.getState().setProposalSettings({
        proposalNo: res.data.data.proposalNo,
        proposalIncludeDate: res.data.data.proposalIncludeDate,
      });
    }
  }).catch(() => { }).finally(() => {
    buildMeasuredQuotationHtml(template, currentForm, { isPrintAutoTrigger: true })
      .then(write)
      .catch(() => write(buildQuotationDocumentHtml(template, currentForm, { isPrintAutoTrigger: true })));
  });
};

export const resolveEffectiveProposalTemplate = (
  p: Proposal | any,
  templates: any[] = [],
  defaultTemplate: any = null
) => {
  if (p?.template && typeof p.template === 'object' && (p.template.name || p.template.templateImage)) {
    return p.template;
  }
  const templateId = typeof p?.template === 'string' ? p.template : (p?.template?._id ? String(p.template._id) : null);
  if (templateId) {
    const found = templates.find((t: any) => String(t._id) === String(templateId));
    if (found) return found;
  }
  if (p?.templateName) {
    const found = templates.find((t: any) => t.name === p.templateName);
    if (found) return found;
  }
  return defaultTemplate;
};

export const buildProposalUnifiedData = (
  p: Proposal | any,
  proposalTemplates: any[] = [],
  defaultProposalTemplate: any = null
) => {
  const cust = typeof p.customer === 'object' ? p.customer : null;
  const lead = typeof p.lead === 'object' ? p.lead : null;

  const customerName =
    p.customerName ||
    cust?.companyInfo?.customerName ||
    cust?.companyName ||
    cust?.name ||
    lead?.companyName ||
    lead?.name ||
    p.customerDetails?.companyName ||
    'Valued Customer';

  const customerAddress =
    p.customerAddress ||
    cust?.address ||
    cust?.fullAddress ||
    cust?.companyInfo?.fullAddress ||
    lead?.fullAddress ||
    lead?.locationArea ||
    p.customerDetails?.addressLine1 ||
    '';

  const customerPhone =
    p.customerPhone ||
    cust?.primaryContactInfo?.phone ||
    cust?.primaryContactInfo?.mobile ||
    cust?.phone ||
    lead?.phone ||
    p.customerDetails?.phone ||
    '';

  const customerEmail =
    p.customerEmail ||
    cust?.primaryContactInfo?.email ||
    cust?.email ||
    lead?.email ||
    p.customerDetails?.email ||
    '';

  const customerContactPerson =
    p.customerContactPerson ||
    p.customerDetails?.contactName ||
    p.customerDetails?.contactPerson ||
    p.contactName ||
    p.contactPerson ||
    cust?.contact ||
    cust?.primaryContactInfo?.contactName1 ||
    cust?.primaryContactInfo?.contactName2 ||
    (lead?.companyName ? lead?.name : '') ||
    '';

  const effectiveTemplate = resolveEffectiveProposalTemplate(p, proposalTemplates, defaultProposalTemplate);

  const headerBanner =
    (p.templateImage && String(p.templateImage).trim()) ||
    (effectiveTemplate?.templateImage && String(effectiveTemplate.templateImage).trim()) ||
    '';
  const footerBanner =
    (p.templateFooterImage && String(p.templateFooterImage).trim()) ||
    (effectiveTemplate?.templateFooterImage && String(effectiveTemplate.templateFooterImage).trim()) ||
    '';

  const validForDays = Number(p.validForDays || effectiveTemplate?.validForDays) || 10;
  const discount = Number(p.discount || effectiveTemplate?.discount) || 0;

  const now = new Date();
  const formatSafeDateString = (val: any, fallbackDate?: Date) => {
    if (!val) return fallbackDate ? fallbackDate.toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(trimmed)) {
        return trimmed;
      }
      const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = months[parseInt(dmy[2], 10) - 1] || dmy[2];
        return `${d} ${m} ${dmy[3]}`;
      }
      const ymd = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (ymd && !trimmed.includes('T') && !trimmed.includes('Z')) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = months[parseInt(ymd[2], 10) - 1] || ymd[2];
        return `${ymd[3]} ${m} ${ymd[1]}`;
      }
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' });
  };

  const rawQuoteNo = p.proposalNo || p.quotationDetails?.quoteNo || `WT-Q${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;
  const existingDateSuffix = (rawQuoteNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
  const quoteNo = (p as any)._versionLabel
    ? `${rawQuoteNo} (${(p as any)._versionLabel})`
    : (Number(p.revision) > 0 ? `${rawQuoteNo} (Rev ${p.revision})` : rawQuoteNo);
  let resolvedQuoteDate = p.quoteDate || p.createdAt;
  if (existingDateSuffix) {
    resolvedQuoteDate = existingDateSuffix[1];
  }
  const quoteDate = formatSafeDateString(resolvedQuoteDate, now);
  const validUntil = formatSafeDateString(p.validUntil, new Date(now.getTime() + validForDays * 86400000));

  const legacyItems = (p.items || []).filter((it: any) => (it?.description || '').trim());
  const proposalBlocks: any[] = Array.isArray(p.blocks) ? [...p.blocks] : [];
  const hasPopulatedTable = proposalBlocks.some(
    (b: any) => b?.type === 'table' && Array.isArray(b?.items) && b.items.filter((it: any) => it?.type !== 'detail' && (it?.description || '').trim()).length > 0
  );

  const formatItemsP = (list: any[]) => list.map((it: any, i: number) => ({
    id: it.id || i + 1,
    type: it.type || 'item',
    no: it.no || i + 1,
    description: it.description,
    qty: it.qty,
    unitPrice: it.unitPrice
  }));

  let rawBlocks: any[] = [...proposalBlocks];
  if (!hasPopulatedTable && legacyItems.length > 0) {
    const emptyIdx = rawBlocks.findIndex((b: any) => b?.type === 'table');
    const tItems = formatItemsP(legacyItems);
    if (emptyIdx >= 0) {
      rawBlocks[emptyIdx] = {
        ...rawBlocks[emptyIdx],
        items: tItems,
        discountPercent: rawBlocks[emptyIdx].discountPercent !== undefined ? rawBlocks[emptyIdx].discountPercent : discount
      };
    } else {
      rawBlocks.push({
        id: 'pricing_table_block',
        type: 'table',
        title: p.title || 'Scope of Work & Pricing',
        discountPercent: discount,
        items: tItems
      });
    }
  } else if (rawBlocks.length === 0 && legacyItems.length > 0) {
    rawBlocks = [{
      id: 'legacy',
      type: 'table',
      title: p.title || 'Service Quotation',
      discountPercent: discount,
      items: formatItemsP(legacyItems)
    }];
  }

  const allBlocks: any[] = [...rawBlocks];
  const termsText = p.terms || effectiveTemplate?.terms;
  if (termsText && !rawBlocks.some((b: any) => b?.type === 'text')) {
    allBlocks.push({
      id: 'terms_block',
      type: 'text',
      title: 'Terms & Conditions',
      content: termsText,
    });
  }

  const companyInfo = p.companyInfo || effectiveTemplate?.companyInfo;

  const authUser = typeof window !== 'undefined' ? (useAuthStore.getState()?.user as any) : null;
  const senderEmail =
    (p.senderEmail && String(p.senderEmail).trim()) ||
    (p.quotationDetails?.senderEmail && String(p.quotationDetails.senderEmail).trim()) ||
    (typeof p.createdBy === 'object' && p.createdBy?.email ? String(p.createdBy.email).trim() : '') ||
    (effectiveTemplate?.senderEmail && String(effectiveTemplate.senderEmail).trim()) ||
    (companyInfo?.email && String(companyInfo.email).trim()) ||
    (effectiveTemplate?.companyInfo?.email && String(effectiveTemplate.companyInfo.email).trim()) ||
    (authUser?.email ? String(authUser.email).trim() : '') ||
    'sales@welcometech.qa';

  const senderPhone =
    (p.senderPhone && String(p.senderPhone).trim()) ||
    (p.quotationDetails?.senderPhone && String(p.quotationDetails.senderPhone).trim()) ||
    (typeof p.createdBy === 'object' && p.createdBy?.phone ? String(p.createdBy.phone).trim() : '') ||
    (effectiveTemplate?.senderPhone && String(effectiveTemplate.senderPhone).trim()) ||
    (companyInfo?.contactNo && String(companyInfo.contactNo).trim()) ||
    (effectiveTemplate?.companyInfo?.contactNo && String(effectiveTemplate.companyInfo.contactNo).trim()) ||
    (authUser?.phone ? String(authUser.phone).trim() : '') ||
    '+97466032346';

  const senderName =
    (p.senderName && String(p.senderName).trim()) ||
    (typeof p.createdBy === 'object' && p.createdBy?.name ? String(p.createdBy.name).trim() : '') ||
    (authUser?.name ? String(authUser.name).trim() : '') ||
    'Welcome Trading Co. W.L.L';

  return {
    ...p,
    name: p.title || p.proposalNo || 'Proposal',
    templateImage: headerBanner,
    templateFooterImage: footerBanner,
    companyInfo,
    discount,
    validForDays,
    senderName,
    senderEmail,
    senderPhone,
    customerContactPerson,
    customerDetails: {
      companyName: customerName,
      contactName: customerContactPerson,
      contactPerson: customerContactPerson,
      addressLine1: customerAddress,
      phone: customerPhone,
      email: customerEmail,
    },
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    quotationDetails: {
      ...(p.quotationDetails || {}),
      quoteNo,
      quoteDate,
      validUntil,
      senderEmail,
      senderPhone,
    },
    blocks: allBlocks,
    items: p.items,
  };
};

export interface ProposalVersionItem {
  id: string;
  versionLabel: string;
  versionNumber: number;
  isCurrent: boolean;
  isOriginal: boolean;
  isResend: boolean;
  date?: string | Date;
  authorName: string;
  reason: string;
  total: number;
  previousTotal?: number;
  diff: number;
  items?: any[];
  subtotal?: number;
  discount?: number;
  terms?: string;
  blocks?: any[];
  statusLabel: string;
}

export const buildProposalFromVersion = (
  baseProposal: Proposal,
  version: ProposalVersionItem
): Proposal & { _isOldVersion?: boolean; _versionLabel?: string; _versionStatus?: string } => {
  const versionItems = Array.isArray(version.items) && version.items.length > 0
    ? version.items
    : (baseProposal.items || []);

  return {
    ...baseProposal,
    revision: version.versionNumber,
    total: version.total,
    amount: version.total,
    subtotal: version.subtotal ?? (version.previousTotal ?? version.total),
    discount: version.discount ?? 0,
    items: versionItems,
    terms: version.terms ?? baseProposal.terms,
    blocks: version.blocks ?? baseProposal.blocks,
    quoteDate: version.date ? new Date(version.date).toISOString() : baseProposal.quoteDate,
    createdAt: version.date ? new Date(version.date).toISOString() : baseProposal.createdAt,
    _isOldVersion: !version.isCurrent,
    _versionLabel: version.versionLabel,
    _versionStatus: version.statusLabel,
  };
};

export const buildProposalOldVersionsList = (proposal: Proposal): ProposalVersionItem[] => {
  if (!proposal) return [];
  const currentRev = Number(proposal.revision) || 0;
  const history = Array.isArray(proposal.revisionHistory) ? proposal.revisionHistory : [];
  const creatorName =
    typeof proposal.createdBy === 'object' && proposal.createdBy
      ? (proposal.createdBy as any).name
      : 'Welcome Tech Admin';

  const versions: ProposalVersionItem[] = [];

  // Determine initial quote details
  const initialTotal =
    history.length > 0 && history[0].previousTotal !== undefined
      ? Number(history[0].previousTotal)
      : Number(proposal.total ?? proposal.amount ?? 0);
  const initialSubtotal =
    history.length > 0 && (history[0] as any).previousSubtotal !== undefined
      ? Number((history[0] as any).previousSubtotal)
      : (currentRev === 0 ? (proposal.subtotal !== undefined ? proposal.subtotal : initialTotal) : initialTotal);
  const initialDiscount =
    history.length > 0 && (history[0] as any).previousDiscount !== undefined
      ? Number((history[0] as any).previousDiscount)
      : (currentRev === 0 ? (proposal.discount || 0) : 0);
  const initialItems =
    history.length > 0 && Array.isArray((history[0] as any).previousItems) && (history[0] as any).previousItems.length > 0
      ? (history[0] as any).previousItems
      : proposal.items;
  const initialTerms = (history[0] as any)?.previousTerms || proposal.terms;
  const initialBlocks = (history[0] as any)?.previousBlocks || proposal.blocks;

  const resendCount = Number(proposal.resendCount) || 0;
  const hasResend = Boolean(proposal.resentAt || resendCount > 0);

  // 1. Initial Version: Rev 0 (Original Quote)
  const isOriginalActive = currentRev === 0 && !hasResend && history.length === 0;
  versions.push({
    id: 'ver-rev-0',
    versionLabel: 'Original (Rev 0)',
    versionNumber: 0,
    isCurrent: isOriginalActive,
    isOriginal: true,
    isResend: false,
    date: proposal.createdAt || proposal.quoteDate,
    authorName: creatorName,
    reason: 'Initial proposal quotation created and drafted',
    total: initialTotal,
    previousTotal: undefined,
    diff: 0,
    items: initialItems,
    subtotal: initialSubtotal,
    discount: initialDiscount,
    terms: initialTerms,
    blocks: initialBlocks,
    statusLabel: isOriginalActive ? 'Current Active' : 'Superseded',
  });

  // 2. Each entry in revisionHistory
  history.forEach((entry: any, idx: number) => {
    const isRev = entry.revision !== undefined && Number(entry.revision) > 0;
    const revNum = isRev ? Number(entry.revision) : 0;
    const isLatest = isRev && revNum === currentRev;
    const prevTot = entry.previousTotal !== undefined ? Number(entry.previousTotal) : undefined;
    const newTot =
      entry.newTotal !== undefined
        ? Number(entry.newTotal)
        : (isLatest ? Number(proposal.total ?? proposal.amount ?? 0) : prevTot || 0);
    const diff = prevTot !== undefined ? newTot - prevTot : 0;

    versions.push({
      id: `ver-rev-${revNum || idx + 1}-${idx}`,
      versionLabel: isRev ? `Rev ${revNum}` : 'Resent Quote',
      versionNumber: revNum,
      isCurrent: isLatest,
      isOriginal: false,
      isResend: !isRev,
      date: entry.revisedAt || entry.sentAt || proposal.updatedAt,
      authorName: entry.revisedByName || creatorName,
      reason: entry.reason || (isRev ? 'Proposal quotation negotiated / terms revised' : 'Quotation resent to customer'),
      total: newTot,
      previousTotal: prevTot,
      diff,
      items: isLatest
        ? proposal.items
        : (Array.isArray(entry.previousItems) && entry.previousItems.length > 0 ? entry.previousItems : proposal.items),
      subtotal: isLatest
        ? proposal.subtotal
        : (entry.previousSubtotal !== undefined ? Number(entry.previousSubtotal) : newTot),
      discount: isLatest
        ? proposal.discount
        : (entry.previousDiscount !== undefined ? Number(entry.previousDiscount) : 0),
      terms: isLatest ? proposal.terms : (entry.previousTerms || proposal.terms),
      blocks: isLatest ? proposal.blocks : (entry.previousBlocks || proposal.blocks),
      statusLabel: isLatest ? 'Current Active' : isRev ? 'Superseded' : 'Resent',
    });
  });

  // 3. Fallback: If proposal has resends that are not yet recorded in revisionHistory
  const recordedResendEntries = history.filter((h: any) => !h.revision || Number(h.revision) === 0).length;
  if (resendCount > recordedResendEntries || (hasResend && recordedResendEntries === 0)) {
    const missingCount = Math.max(1, resendCount - recordedResendEntries);
    for (let i = 1; i <= missingCount; i++) {
      const resendSeq = recordedResendEntries + i;
      const isTopResend = resendSeq === resendCount;
      const isCurrentActive = isTopResend && currentRev === 0;
      const resendDate = isTopResend
        ? (proposal.resentAt || proposal.lastSentAt || proposal.updatedAt)
        : (proposal.sentAt || proposal.createdAt);

      versions.push({
        id: `ver-resend-${resendSeq}`,
        versionLabel: resendCount > 1 ? `Resent (${resendSeq}x)` : 'Resent Quote',
        versionNumber: currentRev,
        isCurrent: isCurrentActive,
        isOriginal: false,
        isResend: true,
        date: resendDate,
        authorName: creatorName,
        reason: resendCount > 1
          ? `Proposal quotation resent to customer (Resend #${resendSeq})`
          : 'Proposal quotation resent to customer',
        total: Number(proposal.total ?? proposal.amount ?? 0),
        previousTotal: initialTotal,
        diff: 0,
        items: proposal.items,
        subtotal: proposal.subtotal,
        discount: proposal.discount,
        terms: proposal.terms,
        blocks: proposal.blocks,
        statusLabel: isCurrentActive ? 'Current Active' : 'Superseded',
      });
    }
  }

  // 4. Fallback: If proposal is revised (revision > 0) but history didn't record current revision
  if (currentRev > 0 && !versions.some(v => v.versionNumber === currentRev && !v.isResend)) {
    versions.push({
      id: `ver-rev-${currentRev}-curr`,
      versionLabel: `Rev ${currentRev}`,
      versionNumber: currentRev,
      isCurrent: true,
      isOriginal: false,
      isResend: false,
      date: proposal.revisedAt || proposal.updatedAt,
      authorName: creatorName,
      reason: (proposal as any).revisionReason || 'Proposal quotation negotiated / terms revised',
      total: Number(proposal.total ?? proposal.amount ?? 0),
      previousTotal: initialTotal,
      diff: Number(proposal.total ?? proposal.amount ?? 0) - initialTotal,
      items: proposal.items,
      subtotal: proposal.subtotal,
      discount: proposal.discount,
      terms: proposal.terms,
      blocks: proposal.blocks,
      statusLabel: 'Current Active',
    });
  }

  // Ensure exactly one version is marked isCurrent if possible
  const hasCurrent = versions.some(v => v.isCurrent);
  if (!hasCurrent && versions.length > 0) {
    versions[versions.length - 1].isCurrent = true;
    versions[versions.length - 1].statusLabel = 'Current Active';
  }

  // 5. Return sorted newest first (most recent revision/resend at the top)
  return versions.reverse();
};

// ─── PROPOSALS LIST ──────────────────────────────
export const ProposalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logo, companyName, brandColor, proposalWatermark } = useThemeStore((s) => ({
    logo: s.logo,
    companyName: s.companyName,
    brandColor: s.brandColor,
    proposalWatermark: s.proposalWatermark,
  }));

  const { data: proposalTemplates = [] } = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      const res = await api.get('/proposal-templates');
      return (res.data?.data || res.data || []) as any[];
    },
  });

  const defaultProposalTemplate = useMemo(() => {
    return proposalTemplates.find((pt: any) => pt.isActive || pt.status === 'active') || proposalTemplates[0] || null;
  }, [proposalTemplates]);

  const downloadProposalPDF = (p: Proposal | any) => {
    if (p?._id && !p._isOldVersion) {
      window.open(toApiUrl(`/public/proposals/${p._id}/pdf?download=1`), '_blank');
      return;
    }
    const proposalObj = buildProposalUnifiedData(p, proposalTemplates, defaultProposalTemplate);
    downloadTemplatePDF(proposalObj as any, proposalObj);
  };
  const queryClient = useQueryClient();
  const [pageSize, setPageSize] = useState('10');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);
  const [auditProposal, setAuditProposal] = useState<Proposal | null>(null);
  const [revisionProposal, setRevisionProposal] = useState<Proposal | null>(null);
  const [returnToRevisionProposal, setReturnToRevisionProposal] = useState<Proposal | null>(null);
  const [expandedVersionKey, setExpandedVersionKey] = useState<string | null>(null);
  const [deleteProposalTarget, setDeleteProposalTarget] = useState<Proposal | null>(null);
  const [sendModalTarget, setSendModalTarget] = useState<Proposal | null>(null);
  const [sendRecipientEmail, setSendRecipientEmail] = useState('');
  const [sendCcEmail, setSendCcEmail] = useState('');

  const unifiedActiveProposal = useMemo(() => {
    if (!activeProposal) return null;
    return buildProposalUnifiedData(activeProposal, proposalTemplates, defaultProposalTemplate);
  }, [activeProposal, proposalTemplates, defaultProposalTemplate]);

  const handlePreviewVersion = (ver: ProposalVersionItem) => {
    if (!revisionProposal) return;
    const versionProposal = buildProposalFromVersion(revisionProposal, ver);
    setReturnToRevisionProposal(revisionProposal);
    setRevisionProposal(null);
    setActiveProposal(versionProposal);
    setModalOpen(true);
  };

  const handleDownloadVersionPDF = (ver: ProposalVersionItem) => {
    if (!revisionProposal) return;
    const versionProposal = buildProposalFromVersion(revisionProposal, ver);
    downloadProposalPDF(versionProposal);
  };

  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const dateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  // Reset to page 1 when filter/search/pageSize/date changes
  React.useEffect(() => { setPage(1); }, [filter, search, pageSize, dateKey]);

  React.useEffect(() => {
    if (!activeProposal) return;
    const onKey = (e: KeyboardEvent) => {
      handlePrintKeyboardShortcut(e, () => {
        downloadProposalPDF(activeProposal);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeProposal]);

  const limitNum = Number(pageSize) || 10;

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', filter, search, page, pageSize, dateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: String(limitNum), page: String(page) };
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const r = await api.get('/proposals', { params });
      return r.data as { data: Proposal[]; total: number; pages: number; page: number };
    },
  });

  const proposals = data?.data || [];
  const totalPages = data?.pages || 1;
  const totalCount = data?.total || 0;
  const exportProposals = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (filter !== 'all') params.status = filter;
    if (search.trim()) params.search = search.trim();
    if (hasActiveDateFilter) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    const r = await api.get('/proposals', { params });
    exportExcelWorkbook('proposals', [
      { name: 'Proposals', rows: proposalsListExportRows(r.data?.data || []) },
    ]);
  };

  const refreshProposals = () => {
    queryClient.invalidateQueries({ queryKey: ['proposals'] });
  };

  const sendMutation = useMutation({
    mutationFn: async ({ proposalId, customerEmail, cc }: { proposalId: string; customerEmail?: string; cc?: string }) => {
      const r = await api.patch(`/proposals/${proposalId}`, { status: 'sent', customerEmail, cc });
      return r.data;
    },
    onSuccess: () => {
      toast.success('Proposal sent to customer successfully!');
      setSendModalTarget(null);
      refreshProposals();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to send proposal');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const r = await api.delete(`/proposals/${proposalId}`);
      return r.data;
    },
    onSuccess: () => {
      toast.success('Proposal deleted successfully!');
      refreshProposals();
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['proposals-next-number'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete proposal');
    },
  });

  const kpiCards = [
    { label: 'Total Proposals', value: isLoading ? '—' : totalCount, icon: <FileText size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All records' },
    { label: 'Drafts', value: isLoading ? '—' : proposals.filter(p => p.status === 'draft').length, icon: <FileText size={20} strokeWidth={2.5} />, color: 'var(--tx-3)', bg: 'var(--surface-3)', change: 'This page' },
    { label: 'Sent', value: isLoading ? '—' : proposals.filter(p => p.status === 'sent').length, icon: <FileText size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'This page' },
    { label: 'Accepted', value: isLoading ? '—' : proposals.filter(p => p.status === 'accepted').length, icon: <Check size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'This page' },
  ];

  const getProposalAuditTimeline = (proposal: Proposal) => {
    const task = typeof proposal.task === 'object' && proposal.task ? (proposal.task as Task) : null;
    if (task) {
      return buildTaskAuditTimeline(task);
    }
    const creatorName = typeof proposal.createdBy === 'object' && proposal.createdBy ? (proposal.createdBy as any).name : 'WelcomeTech Admin';
    const events: any[] = [];
    events.push({
      id: 'prop-created',
      title: 'Proposal Created',
      description: proposal.title || 'Proposal Draft Created',
      date: proposal.quoteDate || proposal.createdAt,
      actorName: creatorName,
      followUpType: 'Proposal',
      nextDueDate: proposal.validUntil || undefined,
      actionLabel: 'ASSIGNED',
      badgeStatus: 'badge-purple',
    });

    if (proposal.status === 'sent' || proposal.sentAt) {
      events.unshift({
        id: 'prop-sent',
        title: 'Proposal Sent',
        description: `Proposal sent to customer${proposal.customerEmail ? ` (${proposal.customerEmail})` : ''}`,
        date: proposal.sentAt || proposal.updatedAt || proposal.createdAt,
        actorName: creatorName,
        followUpType: 'Proposal',
        nextDueDate: undefined,
        actionLabel: 'PROPOSAL',
        badgeStatus: 'badge-amber',
      });
    }

    if (proposal.resentAt || (proposal.resendCount && proposal.resendCount > 0)) {
      events.unshift({
        id: 'prop-resent',
        title: `Proposal Resent${proposal.resendCount && proposal.resendCount > 1 ? ` (${proposal.resendCount}x)` : ''}`,
        description: `Proposal quotation resent to customer${proposal.customerEmail ? ` (${proposal.customerEmail})` : ''}`,
        date: proposal.resentAt || proposal.lastSentAt || proposal.updatedAt,
        actorName: creatorName,
        followUpType: 'Proposal',
        nextDueDate: undefined,
        actionLabel: 'RESENT',
        badgeStatus: 'badge-green',
      });
    }

    if (proposal.revisionHistory && Array.isArray(proposal.revisionHistory)) {
      proposal.revisionHistory.forEach((rev: any, idx: number) => {
        events.unshift({
          id: `prop-rev-${rev.revision || idx + 1}`,
          title: `Proposal Altered / Revised (Rev ${rev.revision || idx + 1})`,
          description: `${rev.reason || 'Proposal quotation terms/pricing negotiated'} · Revised Total: ${fmt.currency(rev.newTotal || proposal.total)}`,
          date: rev.revisedAt || proposal.updatedAt,
          actorName: rev.revisedByName || creatorName,
          followUpType: 'Proposal',
          nextDueDate: undefined,
          actionLabel: `REV ${rev.revision || idx + 1}`,
          badgeStatus: 'badge-purple',
        });
      });
    }

    if (proposal.status === 'accepted') {
      events.unshift({
        id: 'prop-accepted',
        title: 'Proposal Accepted',
        description: 'Customer approved and accepted proposal quotation',
        date: proposal.updatedAt || proposal.createdAt,
        actorName: creatorName,
        followUpType: 'Proposal',
        nextDueDate: undefined,
        actionLabel: 'COMPLETED',
        badgeStatus: 'badge-green',
      });
    }

    return events;
  };

  return (
    <div className="proposals-page-container" style={{ width: '100%' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">Proposals</div>
          <div className="page-subtitle">
            Create, track, and manage quotations and commercial proposals
            {hasActiveDateFilter && (
              <span className="ml-2 inline-flex items-center text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                • {headerDateLabel}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="kpi-grid" style={{ width: '100%', marginBottom: '24px' }}>
        {kpiCards.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>{kpi.icon}</div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-change">{kpi.change}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep" style={{ width: '100%' }}>
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search proposals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select
              className="filter-select page-size-select"
              value={pageSize}
              onChange={(v) => { setPageSize(v); setPage(1); }}
              options={PAGE_SIZE_OPTIONS}
            />
            <Select
              value={filter}
              onChange={(v) => { setFilter(v); setPage(1); }}
              options={['all', 'draft', 'sent', 'accepted', 'rejected'].map((f) => ({
                value: f,
                label: f.charAt(0).toUpperCase() + f.slice(1)
              }))}
              className="filter-select-wrap"
              style={{ height: 38, width: 140, fontSize: 12.5 }}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={exportProposals}
            >
              <Download size={13} /> Export
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/proposals/new')}
            >
              <PlusCircle size={13} /> New Proposal
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Proposal</th>
                <th>Customer</th>
                <th>Title</th>
                <th>Amount ({getActiveCurrency()})</th>
                <th>Valid Until</th>
                <th>Task Follow-Up</th>
                <th>Status</th>
                <th>Revision</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: Math.min(limitNum, 10) }).map((_, i) => <SkeletonRow key={i} cols={10} />) :
                proposals.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState icon={<PlusCircle size={22} />} title="No proposals yet" /></td></tr>
                ) : (
                  proposals.map((p, idx) => {
                    const cust = typeof p.customer === 'object' ? p.customer : null;
                    const lead = typeof (p as any).lead === 'object' ? (p as any).lead : null;
                    const task = typeof (p as any).task === 'object' ? (p as any).task : null;
                    const customerDisplayName =
                      (cust as any)?.companyName || (cust as any)?.name ||
                      (p as any).customerName ||
                      (typeof p.customer === 'string' && p.customer ? p.customer : '') ||
                      (lead as any)?.companyName || (lead as any)?.name ||
                      (p as any).customerEmail ||
                      '—';
                    const customerSubText =
                      (p as any).customerEmail && (p as any).customerEmail !== customerDisplayName
                        ? (p as any).customerEmail
                        : ((cust as any)?.email || (lead as any)?.email || (p as any).customerPhone || '');
                    return (
                      <tr key={p._id}>
                        <td className="sno-col">{(page - 1) * limitNum + idx + 1}</td>
                        <td>
                          <button
                            type="button"
                            className="record-id-link proposal-no-btn"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              borderRadius: 6,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--brand)',
                              textDecoration: 'underline',
                              textUnderlineOffset: 3,
                            }}
                            onClick={() => setAuditProposal(p)}
                            title="Click to view Task & Lead Audit History"
                          >
                            {p.proposalNo || p.proposalId || '—'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx-1)' }}>
                              {customerDisplayName}
                            </span>
                            {customerSubText && customerSubText !== customerDisplayName ? (
                              <span style={{ fontSize: 11, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>
                                {customerSubText}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td><div style={{ fontSize: 12.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto' }}>{p.title}</div></td>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{fmt.currency(p.total ?? p.amount ?? 0)}</span></td>
                        <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--tx-4)' }}>{fmt.date(p.validUntil)}</td>
                        <td>
                          {task ? (
                            <Badge status={task.status} />
                          ) : lead?.status ? (
                            <Badge status={lead.status} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--tx-4)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td>
                          {p.revision && p.revision > 0 ? (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <button
                                type="button"
                                onClick={() => setRevisionProposal(p)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: 'rgba(124, 58, 237, 0.12)',
                                  color: '#7c3aed',
                                  border: '1px solid rgba(124, 58, 237, 0.3)',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font-mono)',
                                }}
                                title="Click to view old proposals & revision history"
                              >
                                <History size={12} />
                                Rev {p.revision}
                              </button>
                              <div style={{ fontSize: 10.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <RotateCw size={10} style={{ color: '#7c3aed' }} />
                                <span>{p.revisedAt ? fmt.date(p.revisedAt) : (p.status === 'sent' ? 'Resent' : 'Altered')}</span>
                              </div>
                            </div>
                          ) : (p.resentAt || (p.resendCount && p.resendCount > 0)) ? (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <button
                                type="button"
                                onClick={() => setRevisionProposal(p)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#059669',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'var(--font-mono)',
                                }}
                                title="Proposal quotation was resent to customer. Click to view history."
                              >
                                <RotateCw size={11} />
                                Resent {p.resendCount && p.resendCount > 1 ? `(${p.resendCount}x)` : ''}
                              </button>
                              <span style={{ fontSize: 10, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>
                                {fmt.date(p.resentAt || p.lastSentAt || p.updatedAt)}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <button
                                type="button"
                                onClick={() => setRevisionProposal(p)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  background: 'var(--surface-2)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--tx-3)',
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Click to view proposal version details"
                              >
                                Original (Rev 0)
                              </button>
                              <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>Initial Quote</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-action btn-action-blue"
                              title="View"
                              onClick={() => { setActiveProposal(p); setModalOpen(true); }}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="btn-action btn-action-amber"
                              title="Edit"
                              onClick={() => navigate(`/proposals/${p._id}/edit`)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="btn-action btn-action-brand"
                              title="Download PDF"
                              onClick={() => downloadProposalPDF(p)}
                            >
                              <Download size={15} />
                            </button>
                            <button
                              className="btn-action btn-action-green"
                              title="Send Proposal"
                              disabled={sendMutation.isPending}
                              onClick={() => {
                                const custObj = typeof p.customer === 'object' ? p.customer : null;
                                const leadObj = typeof p.lead === 'object' ? p.lead : null;
                                const email =
                                  custObj?.email ||
                                  (custObj as any)?.primaryContactInfo?.email ||
                                  leadObj?.email ||
                                  (p as any).customerEmail ||
                                  '';
                                sendMutation.reset();
                                setSendRecipientEmail(email);
                                setSendCcEmail(p.cc || '');
                                setSendModalTarget(p);
                              }}
                            >
                              <Send size={15} />
                            </button>
                            <button
                              className="btn-action btn-action-red"
                              title="Delete"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteProposalTarget(p)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              }
            </tbody>
          </table>
        </div>
        {totalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>
              Showing {(page - 1) * limitNum + 1}–{Math.min(page * limitNum, totalCount)} of {totalCount} proposals
            </div>
            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
            )}
          </div>
        )}
      </div>

      {/* ── Task Audit & Lifecycle History Modal (when clicking Proposal #) ── */}
      <Modal
        open={!!auditProposal}
        onClose={() => setAuditProposal(null)}
        title="Task Audit & Lifecycle History"
        headerActions={
          auditProposal ? (() => {
            const task = typeof auditProposal.task === 'object' && auditProposal.task ? (auditProposal.task as Task) : null;
            const taskNo = task?.taskNo || auditProposal.proposalNo;
            const status = task?.status || auditProposal.status;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="handover-taskno-pill">{taskNo}</span>
                <Badge status={status} />
              </div>
            );
          })() : undefined
        }
        size="xl"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-secondary" onClick={() => setAuditProposal(null)}>
              Close
            </button>
          </div>
        }
      >
        {auditProposal && (() => {
          const task = typeof auditProposal.task === 'object' && auditProposal.task ? (auditProposal.task as Task) : null;
          const lead = typeof auditProposal.lead === 'object' && auditProposal.lead ? (auditProposal.lead as Lead) : null;
          const cust = typeof auditProposal.customer === 'object' && auditProposal.customer ? (auditProposal.customer as any) : null;
          const timeline = getProposalAuditTimeline(auditProposal);
          const customerName =
            (auditProposal as any).customerName ||
            cust?.companyName || cust?.name ||
            lead?.companyName || lead?.name ||
            (auditProposal as any).customerEmail ||
            undefined;
          const leadId = lead?.leadId || (typeof task?.lead === 'object' && task?.lead ? (task.lead as any).leadId : undefined);
          const displayTitle = task?.title || auditProposal.title || 'Proposal Follow-up';
          const priority = task?.priority || lead?.priority || 'medium';

          return (
            <div className="task-history-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
              {/* Header Summary Card */}
              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)' }}>
                    {displayTitle}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12, color: 'var(--tx-3)', flexWrap: 'wrap' }}>
                    {customerName && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <MapPin size={13} style={{ color: 'var(--brand)' }} />
                        <strong>Client:</strong> {customerName}
                      </span>
                    )}
                    {leadId && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <Tag size={13} style={{ color: 'var(--brand)' }} />
                        <strong>Lead:</strong> {leadId}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>Priority:</span>
                  <Badge status={priority} />
                </div>
              </div>

              {/* Recent Activities Section Header */}
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)', marginBottom: 4 }}>
                  Recent Activities
                </div>
                <div style={{ width: 48, height: 3, background: 'var(--brand)', borderRadius: 2, marginBottom: 12 }} />

                {/* Table Layout with single line headers and cells */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--brand)', borderBottom: 'none' }}>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Assigned By / To</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Follow-Up Type</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Next Follow-Up</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Description</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', textAlign: 'center' }}>Status / Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--tx-4)' }}>
                            No activity records found
                          </td>
                        </tr>
                      ) : (
                        timeline.map((item, index) => {
                          return (
                            <tr
                              key={item.id || index}
                              style={{
                                borderBottom: index === timeline.length - 1 ? 'none' : '1px solid var(--border)',
                                background: index % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                              }}
                            >
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--tx-1)' }}>
                                {fmt.date(item.date)}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 750, whiteSpace: 'nowrap', color: 'var(--tx-1)' }}>
                                {item.actorName || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--tx-2)' }}>
                                {item.followUpType || 'Task'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--tx-3)' }}>
                                {item.nextDueDate ? fmt.date(item.nextDueDate) : '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--tx-2)', maxWidth: 280 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.description || '—'}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <span
                                  className={`badge ${item.badgeStatus || 'badge-purple'}`}
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    letterSpacing: 0.5,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {item.actionLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Old Proposal List & Revision History Modal (when clicking Revision column) ── */}
      <Modal
        open={!!revisionProposal}
        onClose={() => { setRevisionProposal(null); setExpandedVersionKey(null); }}
        title="Proposal Revision History & Old Versions"
        headerActions={
          revisionProposal ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="handover-taskno-pill">
                {revisionProposal.proposalNo || revisionProposal.proposalId || '—'}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  background: 'rgba(124, 58, 237, 0.12)',
                  color: '#7c3aed',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Rev {revisionProposal.revision || 0}
              </span>
              <Badge status={revisionProposal.status} />
            </div>
          ) : undefined
        }
        size="xxl"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={14} style={{ color: 'var(--brand)' }} />
              <span>Full negotiation, alteration, and previous quotations log</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {revisionProposal && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ gap: 6 }}
                  onClick={() => downloadProposalPDF(revisionProposal)}
                >
                  <Download size={13} />
                  <span>Download PDF</span>
                </button>
              )}
              {revisionProposal && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ gap: 6 }}
                  onClick={() => {
                    const target = revisionProposal;
                    setRevisionProposal(null);
                    setActiveProposal(target);
                    setModalOpen(true);
                  }}
                >
                  <Eye size={13} />
                  <span>Preview Proposal</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setRevisionProposal(null); setExpandedVersionKey(null); }}
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {revisionProposal && (() => {
          const cust = typeof revisionProposal.customer === 'object' ? revisionProposal.customer : null;
          const lead = typeof (revisionProposal as any).lead === 'object' ? (revisionProposal as any).lead : null;
          const customerDisplayName =
            (cust as any)?.companyName || (cust as any)?.name ||
            (revisionProposal as any).customerName ||
            (typeof revisionProposal.customer === 'string' && revisionProposal.customer ? revisionProposal.customer : '') ||
            (lead as any)?.companyName || (lead as any)?.name ||
            (revisionProposal as any).customerEmail ||
            '—';
          const customerEmail =
            (revisionProposal as any).customerEmail ||
            (cust as any)?.email ||
            (cust as any)?.primaryContactInfo?.email ||
            (lead as any)?.email ||
            '';

          const versions = buildProposalOldVersionsList(revisionProposal);
          const currentTotal = Number(revisionProposal.total ?? revisionProposal.amount ?? 0);
          const initialVersion = versions.find(v => v.isOriginal) || versions[versions.length - 1];
          const initialTotal = initialVersion ? initialVersion.total : currentTotal;
          const netChange = currentTotal - initialTotal;

          return (
            <div className="proposal-revision-history-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
              {/* Proposal Summary Card */}
              <div
                style={{
                  padding: '18px 24px',
                  borderRadius: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 20,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--tx-1)' }}>
                      {revisionProposal.proposalNo || revisionProposal.proposalId}
                    </span>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 12,
                        background: 'rgba(124, 58, 237, 0.12)',
                        color: '#7c3aed',
                        border: '1px solid rgba(124, 58, 237, 0.3)',
                        fontSize: 11.5,
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      Rev {revisionProposal.revision || 0} (Current Active)
                    </span>
                    <Badge status={revisionProposal.status} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx-2)' }}>
                    {revisionProposal.title || 'Quotation'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, fontSize: 12, color: 'var(--tx-3)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <MapPin size={13} style={{ color: 'var(--brand)' }} />
                      <strong style={{ color: 'var(--tx-2)' }}>Client:</strong> {customerDisplayName}
                    </span>
                    {customerEmail && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                        <Mail size={13} style={{ color: 'var(--tx-4)' }} />
                        {customerEmail}
                      </span>
                    )}
                    {revisionProposal.cc && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11.5 }} title="CC Recipient(s)">
                        <Mail size={13} style={{ color: 'var(--brand)' }} />
                        <strong style={{ color: 'var(--tx-2)' }}>CC:</strong> {revisionProposal.cc}
                      </span>
                    )}
                    {revisionProposal.validUntil && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={13} style={{ color: 'var(--tx-4)' }} />
                        <strong style={{ color: 'var(--tx-2)' }}>Valid Until:</strong> {fmt.date(revisionProposal.validUntil)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      padding: '12px 20px',
                      borderRadius: 10,
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      textAlign: 'center',
                      minWidth: 180,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--tx-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Current Active Total
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {fmt.currency(currentTotal)}
                    </div>
                    {initialTotal !== currentTotal && (
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          color: netChange < 0 ? '#059669' : '#7c3aed',
                          fontWeight: 700,
                          marginTop: 4,
                          padding: '2px 8px',
                          borderRadius: 8,
                          background: netChange < 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                          display: 'inline-block',
                        }}
                      >
                        {netChange < 0 ? `Savings / Discount: -${fmt.currency(Math.abs(netChange))}` : `Added Scope: +${fmt.currency(netChange)}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Old Proposal Versions & Alteration Log</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: 'var(--surface-3, #f1f5f9)',
                        color: 'var(--tx-2)',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {versions.length} Version{versions.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                    Chronological history of revisions, negotiated pricing, and previous quotations for {revisionProposal.proposalNo}
                  </div>
                </div>
              </div>

              {/* Old Proposals Table with S NO and Center Alignment */}
              <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto', background: 'var(--surface-1)' }}>
                <table className="data-table" style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'var(--brand)', borderBottom: 'none' }}>
                      <th style={{ width: 65, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>S NO</th>
                      <th style={{ width: 140, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>VERSION</th>
                      <th style={{ width: 140, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>STATUS</th>
                      <th style={{ width: 140, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>DATE & TIME</th>
                      <th style={{ width: 170, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>ALTERED / REVISED BY</th>
                      <th style={{ minWidth: 220, textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>NEGOTIATION / ALTERATION REASON</th>
                      <th style={{ width: 150, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>TOTAL AMOUNT</th>
                      <th style={{ width: 120, textAlign: 'center', padding: '12px 14px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((ver, vIdx) => {
                      return (
                        <tr
                          key={ver.id || vIdx}
                          style={{
                            background: ver.isCurrent ? 'rgba(124, 58, 237, 0.04)' : vIdx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.15s ease',
                            textAlign: 'center',
                          }}
                        >
                          {/* S NO */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5, color: 'var(--tx-2)' }}>
                              {vIdx + 1}
                            </span>
                          </td>

                          {/* VERSION */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '3px 9px',
                                  borderRadius: 8,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 800,
                                  fontSize: 11.5,
                                  background: ver.isCurrent
                                    ? 'rgba(124, 58, 237, 0.15)'
                                    : ver.isOriginal
                                      ? 'rgba(37, 99, 235, 0.12)'
                                      : ver.isResend
                                        ? 'rgba(16, 185, 129, 0.12)'
                                        : 'var(--surface-3, #f1f5f9)',
                                  color: ver.isCurrent
                                    ? '#7c3aed'
                                    : ver.isOriginal
                                      ? '#2563eb'
                                      : ver.isResend
                                        ? '#059669'
                                        : 'var(--tx-2)',
                                  border: `1px solid ${ver.isCurrent
                                    ? 'rgba(124, 58, 237, 0.35)'
                                    : ver.isOriginal
                                      ? 'rgba(37, 99, 235, 0.3)'
                                      : ver.isResend
                                        ? 'rgba(16, 185, 129, 0.3)'
                                        : 'var(--border)'
                                    }`,
                                }}
                              >
                                {ver.versionLabel}
                              </span>
                            </div>
                          </td>

                          {/* STATUS */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {ver.isCurrent ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: 10,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  Active
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: 10,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: 'var(--surface-3, #f1f5f9)',
                                    color: 'var(--tx-3)',
                                    border: '1px solid var(--border)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                  }}
                                >
                                  Superseded
                                </span>
                              )}
                              {ver.isCurrent && revisionProposal.status && (
                                <Badge status={revisionProposal.status} />
                              )}
                            </div>
                          </td>

                          {/* DATE & TIME */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--tx-2)', fontWeight: 600 }}>
                                {fmt.date(ver.date)}
                              </span>
                              {ver.date && (
                                <span style={{ fontSize: 10.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>
                                  {new Date(ver.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* ALTERED / REVISED BY */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <div
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  background: 'var(--brand-light, #ede9fe)',
                                  color: 'var(--brand, #7c3aed)',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {(ver.authorName || 'U').charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx-1)' }}>
                                {ver.authorName}
                              </span>
                            </div>
                          </td>

                          {/* NEGOTIATION / ALTERATION REASON */}
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                              <div style={{ fontWeight: 600, color: 'var(--tx-1)', fontSize: 12.5 }}>
                                {ver.reason}
                              </div>
                            </div>
                          </td>

                          {/* TOTAL AMOUNT */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
                                {fmt.currency(ver.total)}
                              </span>
                              {ver.previousTotal !== undefined && ver.previousTotal !== ver.total && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                                  <span style={{ color: 'var(--tx-4)', textDecoration: 'line-through' }}>
                                    {fmt.currency(ver.previousTotal)}
                                  </span>
                                  <span style={{ fontWeight: 700, color: ver.diff < 0 ? '#10b981' : '#7c3aed' }}>
                                    {ver.diff < 0 ? `-${fmt.currency(Math.abs(ver.diff))}` : `+${fmt.currency(ver.diff)}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* ACTIONS */}
                          <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div className="table-actions" style={{ justifyContent: 'center', display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn-action btn-action-blue"
                                onClick={() => handlePreviewVersion(ver)}
                                title={`Preview ${ver.versionLabel}`}
                                aria-label={`Preview ${ver.versionLabel}`}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-action btn-action-amber"
                                onClick={() => {
                                  const id = revisionProposal._id;
                                  setRevisionProposal(null);
                                  navigate(`/proposals/${id}/edit`);
                                }}
                                title="Edit Proposal"
                                aria-label="Edit Proposal"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-action btn-action-brand"
                                onClick={() => handleDownloadVersionPDF(ver)}
                                title={`Download PDF for ${ver.versionLabel}`}
                                aria-label={`Download PDF for ${ver.versionLabel}`}
                              >
                                <Download size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Customer Proposal Preview Modal (Exact Matching UI/UX with Proposal Templates) ── */}
      <Modal
        open={modalOpen && !!activeProposal}
        onClose={() => {
          setModalOpen(false);
          setActiveProposal(null);
          if (returnToRevisionProposal) {
            setRevisionProposal(returnToRevisionProposal);
            setReturnToRevisionProposal(null);
          }
        }}
        title="Proposal Preview"
        size="xxl"
        className="proposal-preview-modal"
        headerActions={
          activeProposal ? (
            <div className="proposal-preview-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'var(--brand)',
                  background: 'var(--brand-light)',
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                {activeProposal.proposalNo || activeProposal.proposalId || '—'}
              </span>
              {(activeProposal as any)?._isOldVersion ? (
                <span
                  style={{
                    padding: '2px 8px',
                    background: 'rgba(234, 88, 12, 0.12)',
                    color: '#ea580c',
                    border: '1px solid rgba(234, 88, 12, 0.3)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {(activeProposal as any)._versionLabel || `Rev ${activeProposal.revision}`} (Superseded Version)
                </span>
              ) : activeProposal.revision && activeProposal.revision > 0 ? (
                <span
                  style={{
                    padding: '2px 8px',
                    background: 'rgba(124, 58, 237, 0.12)',
                    color: '#7c3aed',
                    border: '1px solid rgba(124, 58, 237, 0.3)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  Rev {activeProposal.revision} (Revised)
                </span>
              ) : null}
              <Badge status={activeProposal.status} />
            </div>
          ) : undefined
        }
        footer={
          activeProposal ? (
            <div className="proposal-preview-modal-footer">
              <button
                type="button"
                className="btn btn-secondary proposal-preview-btn-close"
                onClick={() => {
                  setModalOpen(false);
                  setActiveProposal(null);
                  if (returnToRevisionProposal) {
                    setRevisionProposal(returnToRevisionProposal);
                    setReturnToRevisionProposal(null);
                  }
                }}
                style={{ gap: 6 }}
              >
                {returnToRevisionProposal ? <ArrowLeft size={14} /> : null}
                <span>{returnToRevisionProposal ? 'Back to Revisions' : 'Close'}</span>
              </button>
              <div className="proposal-preview-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary proposal-preview-btn-download"
                  style={{ gap: 6, fontSize: 13 }}
                  onClick={() => downloadProposalPDF(activeProposal)}
                >
                  <Download size={14} />
                  <span>Download<span className="proposal-preview-extra-text"> / Print</span> PDF</span>
                </button>
                {!(activeProposal as any)?._isOldVersion && (
                  <>
                    <button
                      type="button"
                      className="btn btn-success proposal-preview-btn-send"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px' }}
                      onClick={() => {
                        const p = activeProposal;
                        const custObj = typeof p.customer === 'object' ? p.customer : null;
                        const leadObj = typeof p.lead === 'object' ? p.lead : null;
                        const email =
                          custObj?.email ||
                          (custObj as any)?.primaryContactInfo?.email ||
                          leadObj?.email ||
                          (p as any).customerEmail ||
                          '';
                        sendMutation.reset();
                        setSendRecipientEmail(email);
                        setSendCcEmail(p.cc || '');
                        setSendModalTarget(p);
                      }}
                    >
                      <Send size={14} />
                      <span>Send Proposal</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary proposal-preview-btn-edit"
                      style={{ gap: 6, fontSize: 13 }}
                      onClick={() => {
                        const id = activeProposal._id;
                        setModalOpen(false);
                        setActiveProposal(null);
                        navigate(`/proposals/${id}/edit`);
                      }}
                    >
                      <Pencil size={14} />
                      <span>Edit Proposal</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        <style>{`
          @media (max-width: 640px) {
            .proposal-preview-modal .modal-footer {
              padding: 10px 12px calc(10px + env(safe-area-inset-bottom)) !important;
              width: 100% !important;
              box-sizing: border-box !important;
              display: block !important;
            }
            .proposal-preview-modal-footer {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px !important;
              width: 100% !important;
              box-sizing: border-box !important;
            }
            .proposal-preview-modal-actions {
              display: contents !important;
            }
            .proposal-preview-modal-footer .btn,
            .proposal-preview-modal-actions .btn {
              width: 100% !important;
              min-width: 0 !important;
              max-width: 100% !important;
              min-height: 44px !important;
              height: 44px !important;
              font-size: 13px !important;
              font-weight: 750 !important;
              border-radius: 11px !important;
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
              gap: 6px !important;
              box-sizing: border-box !important;
              padding: 0 8px !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              margin: 0 !important;
            }
            .proposal-preview-btn-edit { order: 1 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-send { order: 2 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-download { order: 3 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-close { order: 4 !important; grid-column: span 1 !important; margin-right: 0 !important; }
            .proposal-preview-extra-text { display: none !important; }
          }
          @media (max-width: 380px) {
            .proposal-preview-modal-footer {
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }
          }
        `}</style>
        {activeProposal && unifiedActiveProposal && (
          <div>
            {(activeProposal as any)?._isOldVersion && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(234, 88, 12, 0.08)',
                  border: '1px solid rgba(234, 88, 12, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#c2410c', fontWeight: 600 }}>
                  <History size={16} />
                  <span>
                    Viewing Historical Quotation: <strong>{(activeProposal as any)._versionLabel}</strong> (Total: <strong>{fmt.currency(activeProposal.total)}</strong> — Dated: {fmt.date(activeProposal.createdAt || activeProposal.quoteDate)})
                  </span>
                </div>
                {returnToRevisionProposal && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setModalOpen(false);
                      setActiveProposal(null);
                      setRevisionProposal(returnToRevisionProposal);
                      setReturnToRevisionProposal(null);
                    }}
                    style={{ gap: 4 }}
                  >
                    <ArrowLeft size={12} />
                    <span>Back to Revision History</span>
                  </button>
                )}
              </div>
            )}
            <div className="proposal-preview-frame-container" style={{ width: '100%', height: '76vh', background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
              <MeasuredQuotationFrame template={unifiedActiveProposal} form={unifiedActiveProposal} title="Proposal Preview" />
            </div>

            {activeProposal.revisionHistory && activeProposal.revisionHistory.length > 0 && (
              <div style={{ marginTop: 18, padding: '14px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, fontSize: 11.5, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  📋 Negotiation & Revision History
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeProposal.revisionHistory.map((rev: any, rIdx: number) => {
                    const isResend = !rev.revision || rev.revision === 0;
                    return (
                      <div key={rIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '8px 12px', background: '#ffffff', borderRadius: 6, border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontWeight: 800,
                            background: isResend ? 'rgba(16, 185, 129, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                            color: isResend ? '#059669' : '#7c3aed',
                            border: isResend ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(124, 58, 237, 0.25)',
                            padding: '2px 7px',
                            borderRadius: 6,
                            fontSize: 11
                          }}>
                            {isResend ? 'Resent' : `Rev ${rev.revision}`}
                          </span>
                          <span style={{ color: '#0f172a', fontWeight: 600 }}>{rev.reason || 'Terms / pricing revised'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: '#64748b' }}>
                          <span>by <b>{rev.revisedByName || 'CRM User'}</b></span>
                          <span>{fmt.date(rev.revisedAt)}</span>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{fmt.currency(rev.newTotal || activeProposal.total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Send Proposal Confirmation Modal */}
      <Modal
        open={!!sendModalTarget}
        onClose={() => setSendModalTarget(null)}
        title="Send Proposal via Email"
        size="md"
      >
        {!sendModalTarget ? null : (
          <div>
            <div style={{ padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 900, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>{sendModalTarget.proposalNo || sendModalTarget.proposalId || '—'}</span>
                <span style={{ fontWeight: 900, fontFamily: 'var(--font-mono)' }}>{fmt.currency(sendModalTarget.total ?? sendModalTarget.amount ?? 0)}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 750, color: 'var(--tx-1)' }}>
                {typeof sendModalTarget.customer === 'object' ? sendModalTarget.customer?.name : ((sendModalTarget as any).customerName || (typeof sendModalTarget.customer === 'string' ? sendModalTarget.customer : 'Customer'))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>{sendModalTarget.title}</div>
            </div>

            <InputField
              label="Recipient Email Address (To)"
              type="email"
              value={sendRecipientEmail || '—'}
              readOnly
              disabled
            />
            <div style={{ marginTop: 12 }}>
              <InputField
                label="CC Email Address(es)"
                type="text"
                placeholder="e.g. accounts@example.com, manager@example.com"
                value={sendCcEmail}
                onChange={setSendCcEmail}
              />
              <p style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 4 }}>
                Separate multiple CC addresses with commas. All CC recipients will receive a copy of this proposal email.
              </p>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 8, marginBottom: 18 }}>
              The complete proposal quotation, line items, and terms will be dispatched directly via your configured SMTP server.
            </p>

            {sendMutation.isError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 18,
                fontSize: 12.5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                  <AlertCircle size={15} />
                  <span>Email Dispatch Failed</span>
                </div>
                <div style={{ color: 'var(--tx-2)', fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>
                  {cleanErrorMessage((sendMutation.error as any)?.response?.data?.message || (sendMutation.error as any)?.message || 'SMTP Relay delivery failed.')}
                </div>
                {sendRecipientEmail ? (
                  <a
                    href={`mailto:${encodeURIComponent(sendRecipientEmail.trim())}?cc=${encodeURIComponent(sendCcEmail.trim())}&subject=${encodeURIComponent(`Proposal Quotation: ${sendModalTarget.title || sendModalTarget.proposalNo || sendModalTarget.proposalId}`)}&body=${encodeURIComponent(`Dear Customer,\n\nPlease find your proposal quotation details for ${sendModalTarget.proposalNo || sendModalTarget.proposalId} below.\n\nTitle: ${sendModalTarget.title || 'Quotation'}\nTotal Amount: QAR ${(sendModalTarget.total ?? sendModalTarget.amount ?? 0).toLocaleString()}\n\nBest regards,\nWelcome Tech Team`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: 11.5, padding: '6px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
                  >
                    <Mail size={13} />
                    <span>Open in Email Client (Mailto Fallback)</span>
                  </a>
                ) : null}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSendModalTarget(null)}
                disabled={sendMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--brand)', color: '#fff', gap: 6 }}
                disabled={sendMutation.isPending || !sendRecipientEmail.trim()}
                onClick={() => sendMutation.mutate({
                  proposalId: sendModalTarget._id,
                  customerEmail: sendRecipientEmail.trim(),
                  cc: sendCcEmail.trim() || undefined,
                })}
              >
                {sendMutation.isPending ? <Spinner size={14} /> : <Send size={14} />}
                <span>{sendMutation.isPending ? 'Sending Proposal...' : 'Send Proposal'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteProposalTarget}
        title="Delete Proposal"
        message={`Are you sure you want to delete proposal ${deleteProposalTarget?.proposalNo || deleteProposalTarget?.proposalId}? This action cannot be undone.`}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteProposalTarget) {
            deleteMutation.mutate(deleteProposalTarget._id, {
              onSuccess: () => {
                setDeleteProposalTarget(null);
              }
            });
          }
        }}
        onCancel={() => setDeleteProposalTarget(null)}
        variant="danger"
      />
    </div>
  );
};

export const ProposalTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<ProposalTemplate | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<ProposalTemplate | null>(null);

  React.useEffect(() => {
    if (!activeTemplate) return;
    const onKey = (e: KeyboardEvent) => {
      handlePrintKeyboardShortcut(e, () => {
        downloadTemplatePDF(activeTemplate);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTemplate]);

  const { brandColor, proposalWatermark, companyName } = useThemeStore((s) => ({
    brandColor: s.brandColor,
    proposalWatermark: s.proposalWatermark,
    companyName: s.companyName,
  }));

  const { data: templates, isLoading } = useQuery({
    queryKey: ['proposal-templates', search],
    queryFn: async () => {
      const r = await api.get('/proposal-templates', { params: search.trim() ? { search: search.trim() } : {} });
      return r.data.data as ProposalTemplate[];
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => api.delete(`/proposal-templates/${templateId}`),
    onSuccess: () => {
      toast.success('Proposal template deleted');
      queryClient.invalidateQueries({ queryKey: ['proposal-templates'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete proposal template'),
  });

  const [sendTemplateTarget, setSendTemplateTarget] = useState<ProposalTemplate | null>(null);
  const [sendRecipientEmail, setSendRecipientEmail] = useState('');
  const [sendCcEmail, setSendCcEmail] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessageBody, setSendMessageBody] = useState('');
  const { user: currentUser } = useAuthStore();

  const getSenderSignoff = () => {
    const senderName = currentUser?.name || companyName || 'Welcome Trading Co. W.L.L';
    const senderPhone = currentUser?.phone || '';
    const senderEmail = currentUser?.email || '';
    return [
      'Thanks & Best Regards',
      senderName,
      senderPhone ? `Phone: ${senderPhone}` : '',
      senderEmail ? `Email: ${senderEmail}` : '',
    ].filter(Boolean).join('\n');
  };

  const openSendTemplateModal = (template: ProposalTemplate) => {
    sendTemplateMutation.reset();
    setSendTemplateTarget(template);
    setSendRecipientEmail('');
    setSendCcEmail('');
    setSendSubject(`${template.title || template.name || 'Quotation Proposal'} - Quotation`);
    setSendMessageBody(
      `Dear Valued Customer,\n\nPlease find attached our quotation proposal for your review. Please feel free to reach out if you have any questions or require any clarification.\n\n${getSenderSignoff()}`
    );
  };

  const sendTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!sendTemplateTarget || !sendRecipientEmail.trim()) return;
      const template = sendTemplateTarget;
      const subtotal = (template.items || []).reduce((s: number, it: any) => s + (Number(it.total) || (Number(it.qty) || 1) * (Number(it.unitPrice) || 0)), 0);
      const discount = Number(template.discount) || 0;
      const total = subtotal - (subtotal * discount) / 100;
      const payload = {
        to: sendRecipientEmail.trim(),
        cc: sendCcEmail.trim() || undefined,
        subject: sendSubject.trim() || template.title || template.name || 'Quotation Proposal',
        messageBody: sendMessageBody.trim(),
        template: template._id,
        templateName: template.name,
        title: template.title || template.name,
        discount,
        items: template.items || [],
        subtotal,
        total,
        terms: template.terms || '',
        templateImage: template.templateImage || undefined,
        templateFooterImage: template.templateFooterImage || undefined,
        blocks: template.blocks || undefined,
        customerEmail: sendRecipientEmail.trim(),
      };
      const r = await api.post('/proposals/send-direct', payload);
      return r.data;
    },
    onSuccess: () => {
      toast.success('Proposal template email sent successfully!');
      setSendTemplateTarget(null);
      setSendRecipientEmail('');
      setSendCcEmail('');
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to send template email');
    },
  });

  const templatesList = templates || [];
  const totalTemplates = templatesList.length;
  const avgValidity = templatesList.length
    ? Math.round(templatesList.reduce((sum, t) => sum + (Number(t.validForDays) || 10), 0) / templatesList.length)
    : 0;
  const discountedCount = templatesList.filter((t) => (Number(t.discount) || 0) > 0).length;
  const avgItems = templatesList.length
    ? templatesList.reduce((sum, t) => sum + (t.items || []).length, 0) / templatesList.length
    : 0;

  const kpiCards = [
    { label: 'Total Templates', value: isLoading ? '—' : totalTemplates, icon: <FileText size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All records' },
    { label: 'Avg. Validity', value: isLoading ? '—' : (avgValidity ? `${avgValidity} Days` : '—'), icon: <Calendar size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Active span' },
    { label: 'With Discount', value: isLoading ? '—' : discountedCount, icon: <Percent size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Special offer' },
    { label: 'Avg. Line Items', value: isLoading ? '—' : (avgItems ? `${avgItems.toFixed(1)} Items` : '—'), icon: <Layers size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'Template depth' },
  ];

  return (
    <div className="templates-page-container" style={{ width: '100%' }}>
      <div className="kpi-grid" style={{ width: '100%', marginBottom: '24px' }}>
        {kpiCards.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>{kpi.icon}</div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-change">{kpi.change}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep" style={{ width: '100%' }}>
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-actions">
            <button
              className="btn btn-export btn-sm"
              onClick={() => exportExcelWorkbook('proposal-templates', [
                { name: 'Proposal Templates', rows: proposalTemplatesListExportRows(templates || []) },
              ])}
            >
              <Download size={13} /> Export
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/proposal-templates/new')}
            >
              <PlusCircle size={13} /> New Template
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="table-pro table-center">
            <thead>
              <tr>
                <th className="sno-col">S NO</th>
                <th>Template Name</th>
                <th>Proposal Title</th>
                <th>Valid For</th>
                <th>Discount (%)</th>
                <th>Line Items</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={9} />) :
                !templates?.length ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        icon={<FileText size={22} />}
                        title="No proposal templates yet"
                        action={
                          <button className="btn btn-primary btn-sm" onClick={() => navigate('/proposal-templates/new')}>
                            <PlusCircle size={13} /> New Template
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  templates.map((template, idx) => {
                    const subtotal = (template.items || []).reduce((s, it) => s + (Number(it.total) || (Number(it.qty) || 1) * (Number(it.unitPrice) || 0)), 0);
                    const discount = Number(template.discount) || 0;
                    const totalAmt = subtotal - subtotal * discount / 100;
                    const templateStatus = template.status || (template.isActive === false ? 'inactive' : 'active');
                    return (
                      <tr key={template._id}>
                        <td className="sno-col">{idx + 1}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setActiveTemplate(template)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 700,
                              color: 'var(--brand)',
                              textAlign: 'left',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'opacity 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.textDecoration = 'underline';
                              e.currentTarget.style.opacity = '0.85';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.textDecoration = 'none';
                              e.currentTarget.style.opacity = '1';
                            }}
                            title="Click to view template details"
                          >
                            {template.name}
                          </button>
                        </td>
                        <td>
                          <div
                            style={{
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              margin: '0 auto',
                              color: template.title ? 'var(--tx-1)' : 'var(--tx-3)',
                              fontStyle: template.title ? 'normal' : 'italic',
                            }}
                            title={template.title || 'No title set'}
                          >
                            {template.title || '—'}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {template.validForDays || 10} days
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {discount}%
                        </td>
                        <td>
                          {(template.items || []).length} item{(template.items || []).length === 1 ? '' : 's'}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {fmt.currency(totalAmt)}
                          </span>
                        </td>
                        <td>
                          <Badge status={templateStatus} />
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn-action btn-action-blue"
                              title="View Template"
                              onClick={() => setActiveTemplate(template)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-action btn-action-brand"
                              title="Download PDF"
                              onClick={() => downloadTemplatePDF(template)}
                            >
                              <Download size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-action btn-action-green"
                              title="Send Template via Email"
                              disabled={sendTemplateMutation.isPending}
                              onClick={() => openSendTemplateModal(template)}
                            >
                              <Send size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-action btn-action-amber"
                              title="Edit Template"
                              onClick={() => navigate(`/proposal-templates/${template._id}/edit`)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-action btn-action-red"
                              title="Delete Template"
                              onClick={() => setDeleteTemplateTarget(template)}
                              disabled={deleteTemplateMutation.isPending}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Professional Quotation Document Format Preview Modal ── */}
      <Modal
        open={!!activeTemplate}
        onClose={() => setActiveTemplate(null)}
        title="Proposal Template Preview"
        size="xxl"
        className="proposal-preview-modal"
        headerActions={
          activeTemplate ? (
            <div className="proposal-preview-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: 12,
                  color: 'var(--brand)',
                  background: 'var(--brand-light)',
                  padding: '3px 9px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                {activeTemplate.name}
              </span>
              <Badge status={activeTemplate.status || (activeTemplate.isActive === false ? 'inactive' : 'active')} />
            </div>
          ) : undefined
        }
        footer={
          activeTemplate ? (
            <div className="proposal-preview-modal-footer">
              <button
                type="button"
                className="btn btn-secondary proposal-preview-btn-close"
                onClick={() => setActiveTemplate(null)}
              >
                Close
              </button>
              <div className="proposal-preview-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary proposal-preview-btn-download"
                  style={{ gap: 6, fontSize: 13 }}
                  onClick={() => downloadTemplatePDF(activeTemplate)}
                >
                  <Download size={14} />
                  <span>Download<span className="proposal-preview-extra-text"> / Print</span> PDF</span>
                </button>
                <button
                  type="button"
                  className="btn btn-success proposal-preview-btn-send"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px' }}
                  onClick={() => {
                    const t = activeTemplate;
                    setActiveTemplate(null);
                    if (t) openSendTemplateModal(t);
                  }}
                >
                  <Send size={14} />
                  <span>Send Email</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary proposal-preview-btn-edit"
                  style={{ gap: 6, fontSize: 13 }}
                  onClick={() => {
                    const id = activeTemplate._id;
                    setActiveTemplate(null);
                    navigate(`/proposal-templates/${id}/edit`);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit Template</span>
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        <style>{`
          @media (max-width: 640px) {
            .proposal-preview-modal .modal-footer {
              padding: 10px 12px calc(10px + env(safe-area-inset-bottom)) !important;
              width: 100% !important;
              box-sizing: border-box !important;
              display: block !important;
            }
            .proposal-preview-modal-footer {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 8px !important;
              width: 100% !important;
              box-sizing: border-box !important;
            }
            .proposal-preview-modal-actions {
              display: contents !important;
            }
            .proposal-preview-modal-footer .btn,
            .proposal-preview-modal-actions .btn {
              width: 100% !important;
              min-width: 0 !important;
              max-width: 100% !important;
              min-height: 44px !important;
              height: 44px !important;
              font-size: 13px !important;
              font-weight: 750 !important;
              border-radius: 11px !important;
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
              gap: 6px !important;
              box-sizing: border-box !important;
              padding: 0 8px !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              margin: 0 !important;
            }
            .proposal-preview-btn-edit { order: 1 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-send { order: 2 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-download { order: 3 !important; grid-column: span 1 !important; }
            .proposal-preview-btn-close { order: 4 !important; grid-column: span 1 !important; margin-right: 0 !important; }
            .proposal-preview-extra-text { display: none !important; }
          }
          @media (max-width: 380px) {
            .proposal-preview-modal-footer {
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }
          }
        `}</style>
        {activeTemplate && (() => {
          return (
            <div className="proposal-preview-frame-container" style={{ width: '100%', height: '76vh', background: '#0f172a', borderRadius: 8, overflow: 'hidden' }}>
              <MeasuredQuotationFrame template={activeTemplate} title="Template Preview" />
            </div>
          );
        })()}
      </Modal>

      {/* Send Template Email Modal */}
      <Modal
        open={!!sendTemplateTarget}
        onClose={() => setSendTemplateTarget(null)}
        title="Send Proposal via Email"
        size="md"
      >
        {!sendTemplateTarget ? null : (() => {
          const items = sendTemplateTarget.items || [];
          const subtotal = items.reduce((s, it) => s + (Number(it.total) || (Number(it.qty) || 1) * (Number(it.unitPrice) || 0)), 0);
          const discount = Number(sendTemplateTarget.discount) || 0;
          const total = subtotal - (subtotal * discount) / 100;

          return (
            <div>
              <div style={{ padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 900, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>{sendTemplateTarget.name}</span>
                  <span style={{ fontWeight: 900, fontFamily: 'var(--font-mono)' }}>{fmt.currency(total || 0)}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 750, color: 'var(--tx-1)' }}>
                  {sendTemplateTarget.title || 'Proposal Template'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                  Service Quotation Template
                </div>
              </div>

              <InputField
                label="Recipient Email Address *"
                type="email"
                placeholder="client@example.com"
                value={sendRecipientEmail}
                onChange={(val) => setSendRecipientEmail(val)}
                autoFocus
              />
              <p style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 6, marginBottom: 18 }}>
                The complete proposal quotation, line items, and terms will be dispatched directly to this email address via your configured SMTP server.
              </p>

              {sendTemplateMutation.isError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginBottom: 18,
                  fontSize: 12.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                    <AlertCircle size={15} />
                    <span>Email Dispatch Failed</span>
                  </div>
                  <div style={{ color: 'var(--tx-2)', fontSize: 12, lineHeight: 1.45, marginBottom: 10 }}>
                    {cleanErrorMessage((sendTemplateMutation.error as any)?.response?.data?.message || (sendTemplateMutation.error as any)?.message || 'SMTP Relay delivery failed.')}
                  </div>
                  {sendRecipientEmail.trim() ? (
                    <a
                      href={`mailto:${encodeURIComponent(sendRecipientEmail.trim())}?subject=${encodeURIComponent(`Proposal: ${sendTemplateTarget.title || sendTemplateTarget.name}`)}&body=${encodeURIComponent(`Dear Customer,\n\nPlease find proposal details for ${sendTemplateTarget.title || sendTemplateTarget.name} below.\n\nTotal: QAR ${total.toLocaleString()}\n\nBest regards,\nWelcome Tech Team`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: 11.5, padding: '6px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}
                    >
                      <Mail size={13} />
                      <span>Open in Email Client (Mailto Fallback)</span>
                    </a>
                  ) : null}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSendTemplateTarget(null)}
                  disabled={sendTemplateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: 'var(--brand)', color: '#fff', gap: 6 }}
                  disabled={sendTemplateMutation.isPending || !sendRecipientEmail.trim()}
                  onClick={() => sendTemplateMutation.mutate()}
                >
                  {sendTemplateMutation.isPending ? <Spinner size={14} /> : <Send size={14} />}
                  <span>{sendTemplateMutation.isPending ? 'Sending Proposal...' : 'Send Proposal'}</span>
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmDialog
        open={!!deleteTemplateTarget}
        title="Delete Proposal Template"
        message={`Are you sure you want to permanently delete the template "${deleteTemplateTarget?.name || ''}"? This action cannot be undone.`}
        variant="danger"
        loading={deleteTemplateMutation.isPending}
        onConfirm={() => {
          if (deleteTemplateTarget) {
            deleteTemplateMutation.mutate(deleteTemplateTarget._id, {
              onSuccess: () => setDeleteTemplateTarget(null),
            });
          }
        }}
        onCancel={() => setDeleteTemplateTarget(null)}
      />
    </div>
  );
};

export const ProposalTemplateFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();

  const { logo, companyName, brandColor } = useThemeStore((s) => ({
    logo: s.logo,
    companyName: s.companyName,
    brandColor: s.brandColor,
  }));

  const [form, setForm] = useState<ProposalTemplateDraft>(emptyProposalTemplateDraft());
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isTermsImageModalOpen, setIsTermsImageModalOpen] = useState(false);
  const richImageInsertFnRef = useRef<((url: string, alt?: string) => void) | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<ProposalTemplate | null>(null);

  // Fetch template details if editing
  const { data: template, isLoading } = useQuery({
    queryKey: ['proposal-template', id],
    enabled: isEditMode,
    queryFn: async () => {
      const r = await api.get(`/proposal-templates/${id}`);
      return r.data.data as ProposalTemplate;
    },
  });

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name || '',
        title: template.title || '',
        discount: template.discount ? String(template.discount) : '',
        validForDays: template.validForDays ? String(template.validForDays) : '',
        status: template.status || (template.isActive === false ? 'inactive' : 'active'),
        terms: normalizeColonTableToTabular(stripTermsHeading(template.terms || '')),
        templateImage: template.templateImage || '',
        items: (template.items || []).length ? template.items.map((item) => ({
          description: item.description || '',
          qty: item.qty ? String(item.qty) : '',
          unitPrice: item.unitPrice ? String(item.unitPrice) : '',
          total: Number(item.total) || ((Number(item.qty) || 1) * (Number(item.unitPrice) || 0)),
        })) : [{ description: '', qty: '', unitPrice: '', total: 0 }],
      });
    }
  }, [template]);

  const updateTemplateItem = (i: number, field: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => {
        if (idx !== i) return item;
        const updated = { ...item, [field]: value };
        updated.total = (Number(updated.qty) || 0) * (Number(updated.unitPrice) || 0);
        return updated;
      }),
    }));
  };

  const templateSubtotal = form.items.reduce((sum, item) => sum + item.total, 0);
  const templateDiscount = Number(form.discount) || 0;
  const templateTotal = templateSubtotal - (templateSubtotal * templateDiscount / 100);

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const items = form.items
        .map((item) => ({
          description: item.description.trim(),
          qty: Number(item.qty) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: (Number(item.qty) || 1) * (Number(item.unitPrice) || 0),
        }))
        .filter((item) => item.description);
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || form.name.trim(),
        discount: templateDiscount,
        validForDays: Number(form.validForDays) || 10,
        status: form.status || 'active',
        isActive: form.status !== 'inactive',
        terms: normalizeRichTerms(form.terms),
        templateImage: form.templateImage || undefined,
        items,
      };
      const r = isEditMode
        ? await api.patch(`/proposal-templates/${id}`, payload)
        : await api.post('/proposal-templates', payload);
      return r.data.data as ProposalTemplate;
    },
    onSuccess: () => {
      toast.success(isEditMode ? 'Proposal template updated' : 'Proposal template created');
      queryClient.invalidateQueries({ queryKey: ['proposal-templates'] });
      navigate('/proposal-templates');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to save proposal template'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => api.delete(`/proposal-templates/${templateId}`),
    onSuccess: () => {
      toast.success('Proposal template deleted');
      queryClient.invalidateQueries({ queryKey: ['proposal-templates'] });
      navigate('/proposal-templates');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete proposal template'),
  });

  const submitTemplate = () => {
    if (!form.name.trim()) {
      toast.error('Template name is required');
      return;
    }
    saveTemplateMutation.mutate();
  };

  if (isEditMode && isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div className="skeleton" style={{ width: '100%', maxWidth: '980px', height: '400px', borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="templates-page-container proposal-template-form-container" style={{ width: '100%' }}>
      <div className="page-header" style={{ width: '100%', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn-back" onClick={() => navigate('/proposal-templates')} title="Back to list">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="page-title">{isEditMode ? 'Edit Proposal Template' : 'Create Proposal Template'}</div>
            <div className="page-subtitle">
              {isEditMode
                ? `Update reusable proposal values for "${template?.name || 'this template'}"`
                : 'Build reusable pricing, validity, header image, and terms for future proposals'}
            </div>
          </div>
        </div>
        <div className="actions-row">
          {isEditMode && template ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Delete template"
              onClick={() => setDeleteTemplateTarget(template)}
              disabled={deleteTemplateMutation.isPending}
              style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            title="Download template as PDF"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => downloadTemplatePDF(template || {} as ProposalTemplate, form)}
            disabled={!form.name.trim()}
          >
            <Download size={14} /> PDF
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/proposal-templates')}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submitTemplate} disabled={saveTemplateMutation.isPending}>
            {saveTemplateMutation.isPending ? 'Saving...' : isEditMode ? 'Update Template' : 'Save Template'}
          </button>
        </div>
      </div>

      <div className="card proposal-template-editor-card" style={{ width: '100%' }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '24px' }}>
          <div className="proposal-template-field-stack">
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Template Name *</label>
              <input
                className="doc-input-title"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Enter Template Name (e.g. ERP Package)..."
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Proposal Subject / Title</label>
              <input
                className="doc-input-subject"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Enter Proposal Title / Subject (e.g. Business Software Proposal)..."
              />
            </div>
          </div>

          <div className="meta-bar-editor proposal-template-meta-grid" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: '1 1 130px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', transition: 'all 0.2s ease' }}>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Valid For</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={form.validForDays}
                  onChange={(e) => setForm((p) => ({ ...p, validForDays: e.target.value }))}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14.5, fontWeight: 650, color: 'var(--tx-1)', width: '100%', padding: 0 }}
                  placeholder="10"
                />
                <span style={{ fontSize: 11.5, color: 'var(--tx-3)', fontWeight: 600 }}>Days</span>
              </div>
            </div>

            <div style={{ flex: '1 1 130px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', transition: 'all 0.2s ease' }}>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Discount</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={form.discount}
                  onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14.5, fontWeight: 650, color: 'var(--tx-1)', width: '100%', padding: 0 }}
                  placeholder="0"
                />
                <span style={{ fontSize: 13.5, color: 'var(--tx-3)', fontWeight: 700 }}>%</span>
              </div>
            </div>

            <div style={{ flex: '1 1 130px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', transition: 'all 0.2s ease' }}>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Status</span>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13.5, fontWeight: 650, color: 'var(--tx-1)', width: '100%', padding: 0, cursor: 'pointer' }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div style={{ flex: '2 1 240px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 36, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {form.templateImage ? (
                  <img src={toAssetUrl(form.templateImage)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <ImageIcon size={16} color="var(--tx-4)" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 9, fontWeight: 800, color: 'var(--tx-4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Header Image (Rec: 1400×220px)</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--tx-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={form.templateImage || 'None'}>
                  {form.templateImage ? form.templateImage.split('/').pop() : 'No image selected'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" className="btn btn-secondary btn-xs" style={{ padding: '5px 10px', fontSize: 10.5 }} onClick={() => setIsMediaModalOpen(true)}>
                  Select
                </button>
                {form.templateImage && (
                  <button type="button" className="btn btn-ghost btn-icon btn-xs" style={{ color: 'var(--red)' }} onClick={() => setForm((p) => ({ ...p, templateImage: '' }))}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {form.items.length > 0 ? (
            <div className="proposal-line-items" style={{ marginBottom: 0 }}>
              <table className="proposal-line-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${brandColor || 'var(--brand)'}` }}>
                    <th className="sno-col" style={{ width: '8%', padding: '10px 5px', textAlign: 'center', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>S.No</th>
                    <th style={{ width: '52%', padding: '10px 10px', textAlign: 'left', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</th>
                    <th style={{ width: '12%', padding: '10px 5px', textAlign: 'center', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty</th>
                    <th style={{ width: '14%', padding: '10px 5px', textAlign: 'right', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unit Price</th>
                    <th style={{ width: '14%', padding: '10px 5px', textAlign: 'right', color: 'var(--tx-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</th>
                    <th style={{ width: '8%', padding: '10px 5px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="sno-col" style={{ textAlign: 'center', padding: '8px 5px', color: 'var(--tx-3)', fontSize: 12.5 }}>{i + 1}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <textarea
                          className="doc-table-textarea"
                          rows={1}
                          ref={autoGrowTextarea}
                          value={item.description}
                          onChange={(e) => {
                            updateTemplateItem(i, 'description', e.target.value);
                            autoGrowTextarea(e.currentTarget);
                          }}
                          placeholder="Item description..."
                          style={{ minHeight: '34px', fontSize: 12.5 }}
                        />
                      </td>
                      <td style={{ padding: '6px 5px' }}>
                        <input
                          className="doc-table-input"
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateTemplateItem(i, 'qty', e.target.value)}
                          placeholder="1"
                          style={{ textAlign: 'center', fontSize: 12.5 }}
                        />
                      </td>
                      <td style={{ padding: '6px 5px' }}>
                        <input
                          className="doc-table-input"
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateTemplateItem(i, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          style={{ textAlign: 'right', fontSize: 12.5 }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 5px', fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>
                        {(item.total || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 5px' }}>
                        <button
                          type="button"
                          className="btn-action btn-action-red"
                          title="Remove item"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              items: prev.items.filter((_, idx) => idx !== i),
                            }));
                          }}
                          style={{ margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '10px 0' }}>
              <EmptyState
                icon={<Layers size={24} className="text-gray" />}
                title="No template pricing added"
                description="Add line items only if you want this template to pre-fill prices. Otherwise, templates can save just terms and details."
                action={
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setForm((p) => ({ ...p, items: [{ description: '', qty: '', unitPrice: '', total: 0 }] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <PlusCircle size={14} /> Add First Line Item
                  </button>
                }
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            {form.items.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ gap: 6, color: brandColor || 'var(--brand)', fontSize: 12, paddingLeft: 4 }}
                onClick={() => setForm((p) => ({ ...p, items: [...p.items, { description: '', qty: '', unitPrice: '', total: 0 }] }))}
              >
                <PlusCircle size={14} /> Add Line Item
              </button>
            ) : (
              <span />
            )}

            {form.items.length > 0 ? (
              <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--tx-3)' }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: 650, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{fmt.currency(templateSubtotal)}</span>
                </div>
                {templateDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--red)' }}>
                    <span>Discount ({templateDiscount}%)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 650 }}>- {fmt.currency(templateSubtotal * templateDiscount / 100)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, fontWeight: 800, color: brandColor || 'var(--brand)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                  <span>Total</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt.currency(templateTotal)}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="proposal-terms-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} /> Terms & Conditions
            </h4>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-1)' }}>
              <RichTextEditor
                value={form.terms}
                onChange={(value) => setForm((p) => ({ ...p, terms: value }))}
                placeholder="Enter payment terms, validity, support scope, or other conditions..."
                onInsertImageUrl={(insertFn) => {
                  richImageInsertFnRef.current = insertFn;
                  setIsTermsImageModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal open={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} title="Select Template Image" size="xl">
        <MediaLibraryPage
          isPicker
          onSelect={(file: MediaFile) => {
            if (file.type !== 'image') {
              toast.error('Please select an image file');
              return;
            }
            setForm((p) => ({ ...p, templateImage: file.url }));
            setIsMediaModalOpen(false);
          }}
        />
      </Modal>

      <Modal open={isTermsImageModalOpen} onClose={() => setIsTermsImageModalOpen(false)} title="Insert Image into Terms" size="xl">
        <div style={{ height: '68vh', overflow: 'hidden' }}>
          <MediaLibraryPage
            isPicker
            onSelect={(file: MediaFile) => {
              if (file.type !== 'image') { toast.error('Please select an image file'); return; }
              if (richImageInsertFnRef.current) {
                richImageInsertFnRef.current(toAssetUrl(file.url), file.url.split('/').pop() || 'image');
              }
              setIsTermsImageModalOpen(false);
            }}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTemplateTarget}
        title="Delete Proposal Template"
        message={`Are you sure you want to permanently delete the template "${deleteTemplateTarget?.name || ''}"? This action cannot be undone.`}
        variant="danger"
        loading={deleteTemplateMutation.isPending}
        onConfirm={() => {
          if (deleteTemplateTarget) {
            deleteTemplateMutation.mutate(deleteTemplateTarget._id, {
              onSuccess: () => setDeleteTemplateTarget(null),
            });
          }
        }}
        onCancel={() => setDeleteTemplateTarget(null)}
      />
    </div>
  );
};

// ─── NEW PROPOSAL ────────────────────────────────
const RichTextEditor: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onInsertImageUrl?: (insertFn: (url: string, alt?: string) => void) => void;
}> = ({ value, onChange, placeholder, onInsertImageUrl }) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const normalizedValue = normalizeRichTerms(value);

  const decorateTables = (html: string) => {
    if (typeof document === 'undefined') return html;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = stripEditorTableControls(html);
    wrapper.querySelectorAll('table').forEach((table) => {
      const shell = document.createElement('div');
      shell.className = 'proposal-rich-table-shell';
      table.parentNode?.insertBefore(shell, table);

      const scrollWrapper = document.createElement('div');
      scrollWrapper.className = 'proposal-rich-table-scroll-wrapper';
      scrollWrapper.appendChild(table);
      shell.appendChild(scrollWrapper);

      table.classList.add('proposal-rich-table');
      (table as HTMLTableElement).style.tableLayout = 'fixed';

      const deleteTable = document.createElement('button');
      deleteTable.type = 'button';
      deleteTable.className = 'proposal-table-delete-table';
      deleteTable.dataset.tableAction = 'delete-table';
      deleteTable.contentEditable = 'false';
      deleteTable.title = 'Delete table';
      deleteTable.textContent = 'Delete table';
      shell.appendChild(deleteTable);

      Array.from(table.rows[0]?.cells || []).forEach((cell, columnIndex) => {
        cell.classList.add('proposal-rich-table-header-cell');

        const deleteColumn = document.createElement('button');
        deleteColumn.type = 'button';
        deleteColumn.className = 'proposal-table-delete-column';
        deleteColumn.dataset.tableAction = 'delete-column';
        deleteColumn.contentEditable = 'false';
        deleteColumn.title = 'Delete column';
        deleteColumn.textContent = 'x';
        cell.appendChild(deleteColumn);

        const resizeColumn = document.createElement('span');
        resizeColumn.className = 'proposal-table-resize-column';
        resizeColumn.dataset.tableAction = 'resize-column';
        resizeColumn.dataset.columnIndex = String(columnIndex);
        resizeColumn.contentEditable = 'false';
        resizeColumn.title = 'Drag to resize column';
        cell.appendChild(resizeColumn);
      });

      Array.from(table.rows).forEach((row) => {
        const firstCell = row.cells[0] as HTMLTableCellElement | undefined;
        if (!firstCell) return;
        firstCell.classList.add('proposal-rich-table-row-control-cell');

        const deleteRow = document.createElement('button');
        deleteRow.type = 'button';
        deleteRow.className = 'proposal-table-delete-row';
        deleteRow.dataset.tableAction = 'delete-row';
        deleteRow.contentEditable = 'false';
        deleteRow.title = 'Delete row';
        deleteRow.textContent = 'x';
        firstCell.appendChild(deleteRow);
      });

      const addColumn = document.createElement('button');
      addColumn.type = 'button';
      addColumn.className = 'proposal-table-add proposal-table-add-column';
      addColumn.dataset.tableAction = 'add-column';
      addColumn.contentEditable = 'false';
      addColumn.textContent = '+';
      shell.appendChild(addColumn);

      const addRow = document.createElement('button');
      addRow.type = 'button';
      addRow.className = 'proposal-table-add proposal-table-add-row';
      addRow.dataset.tableAction = 'add-row';
      addRow.contentEditable = 'false';
      addRow.textContent = '+';
      shell.appendChild(addRow);
    });
    return wrapper.innerHTML;
  };

  const getCleanEditorHtml = () => stripTermsHeading(stripEditorTableControls(editorRef.current?.innerHTML || ''));

  const refreshDecoratedTables = () => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = decorateTables(getCleanEditorHtml());
  };

  useEffect(() => {
    if (!editorRef.current) return;
    if (normalizeRichTerms(getCleanEditorHtml()) !== normalizedValue) {
      editorRef.current.innerHTML = decorateTables(normalizedValue);
    }
  }, [normalizedValue]);

  const updateValue = () => {
    const html = getCleanEditorHtml();
    onChange(html === '<br>' ? '' : html);
  };

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    updateValue();
  };

  const insertImageUrl = React.useCallback((url: string, alt = 'image') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    document.execCommand('insertHTML', false, `<img src="${fullUrl}" alt="${alt}" style="max-width:100%;height:auto;display:block;border-radius:6px;margin:8px 0;" />`);
    updateValue();
  }, []);

  React.useEffect(() => {
    if (onInsertImageUrl) onInsertImageUrl(insertImageUrl);
  }, [onInsertImageUrl, insertImageUrl]);

  const insertTable = () => {
    const rows = 2;
    const columns = 2;
    const cells = Array.from({ length: rows }, (_, rowIndex) => `
      <tr>
        ${Array.from({ length: columns }, (_, columnIndex) => (
      rowIndex === 0
        ? `<th>Header ${columnIndex + 1}</th>`
        : '<td>Value</td>'
    )).join('')}
      </tr>
    `).join('');
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, `<table class="proposal-rich-table"><tbody>${cells}</tbody></table><p><br></p>`);
    refreshDecoratedTables();
    updateValue();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      document.execCommand('insertText', false, '\t');
      updateValue();
    }
  };

  const handleEditorMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.tableAction;
    if (!action) return;

    event.preventDefault();
    const shell = target.closest('.proposal-rich-table-shell');
    const table = shell?.querySelector('table');
    if (!table) return;

    if (action === 'delete-table') {
      shell?.remove();
      updateValue();
      return;
    }

    if (action === 'resize-column') {
      const cell = target.closest('th,td') as HTMLTableCellElement | null;
      if (!cell) return;
      const columnIndex = cell.cellIndex;
      const startX = event.clientX;
      const startWidth = cell.getBoundingClientRect().width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.max(72, startWidth + moveEvent.clientX - startX);
        Array.from(table.rows).forEach((row) => {
          const resizeCell = row.cells[columnIndex] as HTMLTableCellElement | undefined;
          if (resizeCell) resizeCell.style.width = `${Math.round(nextWidth)}px`;
        });
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        updateValue();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      return;
    }

    if (action === 'delete-column') {
      const cell = target.closest('th,td') as HTMLTableCellElement | null;
      if (!cell || (table.rows[0]?.cells.length || 0) <= 1) return;
      const columnIndex = cell.cellIndex;
      Array.from(table.rows).forEach((row) => row.deleteCell(columnIndex));
      refreshDecoratedTables();
      updateValue();
      return;
    }

    if (action === 'delete-row') {
      const row = target.closest('tr') as HTMLTableRowElement | null;
      if (!row) return;
      if (table.rows.length <= 1) {
        shell?.remove();
        updateValue();
        return;
      }
      row.remove();
      refreshDecoratedTables();
      updateValue();
      return;
    }

    if (action === 'add-row') {
      const columnCount = Math.max(1, table.rows[0]?.cells.length || 1);
      const row = table.insertRow(-1);
      Array.from({ length: columnCount }).forEach(() => {
        const cell = row.insertCell(-1);
        cell.textContent = 'Value';
      });
      refreshDecoratedTables();
    }

    if (action === 'add-column') {
      Array.from(table.rows).forEach((row, rowIndex) => {
        const cell = rowIndex === 0 ? document.createElement('th') : document.createElement('td');
        cell.textContent = rowIndex === 0 ? `Header ${row.cells.length + 1}` : 'Value';
        row.appendChild(cell);
      });
      refreshDecoratedTables();
    }

    updateValue();
  };

  const toolbarButtons = [
    { title: 'Bold', icon: <Bold size={15} />, command: 'bold' },
    { title: 'Italic', icon: <Italic size={15} />, command: 'italic' },
    { title: 'Underline', icon: <Underline size={15} />, command: 'underline' },
    { title: 'Align left', icon: <AlignLeft size={15} />, command: 'justifyLeft' },
    { title: 'Align center', icon: <AlignCenter size={15} />, command: 'justifyCenter' },
    { title: 'Align right', icon: <AlignRight size={15} />, command: 'justifyRight' },
    { title: 'Bullet list', icon: <List size={15} />, command: 'insertUnorderedList' },
    { title: 'Numbered list', icon: <ListOrdered size={15} />, command: 'insertOrderedList' },
  ];

  const imgInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="proposal-rich-editor">
      <div className="proposal-rich-toolbar" aria-label="Terms editor toolbar">
        {toolbarButtons.map((button) => (
          <button
            key={button.title}
            type="button"
            className="proposal-rich-tool"
            title={button.title}
            onMouseDown={(e) => {
              e.preventDefault();
              runCommand(button.command);
            }}
          >
            {button.icon}
          </button>
        ))}
        <span className="proposal-rich-divider" />
        <label className="proposal-rich-select-wrap" title="Text size">
          <Type size={14} />
          <select
            className="proposal-rich-select"
            defaultValue="3"
            onChange={(e) => runCommand('fontSize', e.target.value)}
          >
            <option value="2">Small</option>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">XL</option>
          </select>
        </label>
        <label className="proposal-rich-color" title="Text color">
          <Palette size={14} />
          <input type="color" defaultValue="#111827" onChange={(e) => runCommand('foreColor', e.target.value)} />
        </label>
        <button
          type="button"
          className="proposal-rich-tool proposal-rich-table-tool"
          title="Insert 2 x 2 table"
          onMouseDown={(e) => {
            e.preventDefault();
            insertTable();
          }}
        >
          <Table2 size={14} />
        </button>
        {onInsertImageUrl && (
          <>
            <span className="proposal-rich-divider" />
            <button
              type="button"
              className="proposal-rich-tool"
              title="Insert Image from Media Library"
              onMouseDown={(e) => {
                e.preventDefault();
                /* signal parent to open media modal */
                onInsertImageUrl(insertImageUrl);
              }}
            >
              <ImageIcon size={14} />
            </button>
            <label
              className="proposal-rich-tool"
              title="Upload Image from Computer"
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              <Upload size={13} />
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    if (dataUrl) insertImageUrl(dataUrl, file.name);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
        <span className="proposal-rich-divider" />
        <button type="button" className="proposal-rich-tool" title="Undo" onMouseDown={(e) => { e.preventDefault(); runCommand('undo'); }}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="proposal-rich-tool" title="Redo" onMouseDown={(e) => { e.preventDefault(); runCommand('redo'); }}>
          <Redo2 size={15} />
        </button>
        <button type="button" className="proposal-rich-clear" onMouseDown={(e) => { e.preventDefault(); runCommand('removeFormat'); }}>
          Clear
        </button>
      </div>
      <div
        ref={editorRef}
        className="proposal-rich-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onMouseDown={handleEditorMouseDown}
        onKeyDown={handleKeyDown}
        onInput={updateValue}
        onBlur={updateValue}
      />
    </div>
  );
};

const ProposalTermsPreview: React.FC<{ terms: string }> = ({ terms }) => {
  const termsHtml = normalizeRichTerms(terms);
  if (!termsHtml) return null;
  return <div className="proposal-preview-terms-body" dangerouslySetInnerHTML={{ __html: termsHtml }} />;
};

export const ProposalFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const { user: currentUser } = useAuthStore();
  const proposalWatermark = useThemeStore((s) => s.proposalWatermark);
  const { data: customers } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const r = await api.get('/customers/lookup');
      return r.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: leads } = useQuery({ queryKey: ['leads-list-brief'], queryFn: async () => { const r = await api.get('/leads?limit=500'); return r.data.data as Lead[]; } });
  const { data: proposalTemplates } = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      const r = await api.get('/proposal-templates');
      return r.data.data as ProposalTemplate[];
    },
  });
  const { data: editingProposal } = useQuery({
    queryKey: ['proposal', id],
    enabled: isEditMode,
    queryFn: async () => {
      const r = await api.get(`/proposals/${id}`);
      return r.data.data as Proposal;
    },
  });

  const [customerType, setCustomerType] = useState<'existing' | 'new'>('existing');
  const [customerId, setCustomerId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('');
  const [status, setStatus] = useState<'draft' | 'sent' | 'accepted' | 'rejected'>('draft');
  const [terms, setTerms] = useState('');
  const [templateImage, setTemplateImage] = useState('');
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isTermsImageModalOpen, setIsTermsImageModalOpen] = useState(false);
  const richImageInsertFnRef = useRef<((url: string, alt?: string) => void) | null>(null);
  const [isLetterPreviewOpen, setIsLetterPreviewOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const importedTemplateIdRef = useRef('');
  const templateIdFromQuery = searchParams.get('templateId') || '';

  const [items, setItems] = useState<ProposalLineDraft[]>([{ description: '', qty: '', unitPrice: '', total: 0 }]);

  // Set default terms when currentUser is loaded
  useEffect(() => {
    if (currentUser && !isEditMode && !importedTemplateIdRef.current) {
      const userName = currentUser.name || '';
      const userPhone = currentUser.phone || '';
      const userEmail = currentUser.email || '';
      const getRoleDesignation = (role: string) => {
        switch (role) {
          case 'admin': return 'Administrator';
          case 'manager': return 'Manager';
          case 'engineer': return 'System Engineer';
          case 'sales_executive': return 'Sales Executive';
          default: return role ? role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ') : 'User Designation';
        }
      };
      const userDesignation = currentUser.role ? getRoleDesignation(currentUser.role) : 'User Designation';

      const senderSignoff = [
        'Thanks & Best Regards',
        userName,
        userDesignation,
        userPhone ? `Phone: ${userPhone}` : '',
        userEmail ? `Email: ${userEmail}` : '',
      ].filter(Boolean).join('\n');

      setTerms(`Quotation Validity :  10 days
Delivery           :  Immediate upon confirmation
Payment            :  100% of License cost as advance along with LPO

1. In absence of AMC free support will not applicable, except maximum of 2 weeks after installation. (Via remote access).
2. Service charges will be applicable after the duration of free support & charges will be depending upon the issue/error.
3. Additional customization rather than standard package will be charged separately according to the requirement.
4. Tally .Net subscription renewal will be chargeable every year.


${senderSignoff}`);
    }
  }, [currentUser, isEditMode]);

  useEffect(() => {
    if (!editingProposal) return;
    const customer = typeof editingProposal.customer === 'object' ? editingProposal.customer : null;
    setCustomerType('existing');
    setCustomerId(customer?._id || String(editingProposal.customer || ''));
    setSelectedLeadId('');
    setCustomerName(customer?.name || '');
    setContactPerson(customer?.contact || '');
    setCustomerPhone(customer?.phone || customer?.primaryContactInfo?.mobile || '');
    setCustomerEmail(customer?.email || customer?.primaryContactInfo?.email || '');
    setCustomerAddress(customer?.address || customer?.companyInfo?.fullAddress || '');
    setTitle(editingProposal.title || '');
    setValidUntil(editingProposal.validUntil ? String(editingProposal.validUntil).split('T')[0] : '');
    setDiscount(editingProposal.discount ? String(editingProposal.discount) : '');
    setStatus(editingProposal.status || 'draft');
    setTerms(normalizeColonTableToTabular(stripTermsHeading(editingProposal.terms || '')));
    setTemplateImage(editingProposal.templateImage || '');
    setItems((editingProposal.items || []).length ? editingProposal.items.map((item) => ({
      description: item.description || '',
      qty: item.qty ? String(item.qty) : '',
      unitPrice: item.unitPrice ? String(item.unitPrice) : '',
      total: Number(item.total) || ((Number(item.qty) || 1) * (Number(item.unitPrice) || 0)),
    })) : [{ description: '', qty: '', unitPrice: '', total: 0 }]);
  }, [editingProposal]);

  const leadIdFromQuery = searchParams.get('leadId') || '';
  const customerIdFromQuery = searchParams.get('customerId') || '';

  useEffect(() => {
    if (isEditMode) return;
    if (leadIdFromQuery && leads?.length) {
      const lead = leads.find((l: any) => l._id === leadIdFromQuery);
      if (lead) {
        setCustomerType('new');
        setSelectedLeadId(lead._id);
        setCustomerName(lead.companyName || lead.name || '');
        setContactPerson(lead.name || '');
        setCustomerPhone(lead.phone || '');
        setCustomerEmail(lead.email || '');
        setCustomerAddress(lead.fullAddress || lead.locationArea || '');
      }
    } else if (customerIdFromQuery && customers?.length) {
      setCustomerType('existing');
      setCustomerId(customerIdFromQuery);
    }
  }, [isEditMode, leadIdFromQuery, customerIdFromQuery, leads, customers]);

  const addItem = () => setItems(prev => [...prev, { description: '', qty: '', unitPrice: '', total: 0 }]);
  const updateItem = (i: number, field: string, value: string | number) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: value };
      updated.total = (Number(updated.qty) || 0) * (Number(updated.unitPrice) || 0);
      return updated;
    }));
  };

  const dateAfterDays = (days: number) => {
    const next = new Date();
    next.setDate(next.getDate() + Math.max(1, days || 10));
    return next.toISOString().split('T')[0];
  };

  const applyProposalTemplate = (templateId = selectedTemplateId) => {
    const template = (proposalTemplates || []).find((item) => item._id === templateId);
    if (!template) {
      toast.error('Please select a proposal template');
      return;
    }
    importedTemplateIdRef.current = template._id;
    setSelectedTemplateId(template._id);
    setTitle(template.title || template.name || title);
    setDiscount(template.discount ? String(template.discount) : '');
    setTerms(normalizeColonTableToTabular(stripTermsHeading(template.terms || '')));
    setTemplateImage(template.templateImage || '');
    setValidUntil(dateAfterDays(template.validForDays || 10));
    setItems((template.items || []).length ? template.items.map((item) => ({
      description: item.description || '',
      qty: item.qty ? String(item.qty) : '',
      unitPrice: item.unitPrice ? String(item.unitPrice) : '',
      total: Number(item.total) || ((Number(item.qty) || 1) * (Number(item.unitPrice) || 0)),
    })) : [{ description: '', qty: '', unitPrice: '', total: 0 }]);
    toast.success(`Applied template: ${template.name}`);
  };

  useEffect(() => {
    if (isEditMode || !templateIdFromQuery || !proposalTemplates?.length || importedTemplateIdRef.current === templateIdFromQuery) return;
    const templateExists = proposalTemplates.some((item) => item._id === templateIdFromQuery);
    if (!templateExists) return;

    applyProposalTemplate(templateIdFromQuery);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('templateId');
    setSearchParams(nextParams, { replace: true });
  }, [isEditMode, proposalTemplates, searchParams, setSearchParams, templateIdFromQuery]);

  // Only count items that will actually be saved (handleSubmit filters out blank-description
  // rows). Summing all rows here made the displayed total differ from the persisted total.
  const subtotal = items.filter((i) => (i.description || '').trim()).reduce((s, i) => s + i.total, 0);
  const discountNum = Number(discount) || 0;
  const finalTotal = subtotal - (subtotal * discountNum / 100);
  const previewWatermarkUrl = proposalWatermark ? toAssetUrl(proposalWatermark) : '';
  const selectedProposalTemplate = (proposalTemplates || []).find((item) => item._id === selectedTemplateId);

  const selectedCust = customerType === 'existing' ? (customers || []).find((c: any) => c._id === customerId) : null;

  const previewCustName = customerType === 'existing'
    ? (selectedCust?.name || customerName || '')
    : customerName;

  const previewCustPhone = customerType === 'existing'
    ? (selectedCust?.phone || selectedCust?.amcDetails?.mobile || selectedCust?.primaryContactInfo?.mobile || customerPhone || '')
    : customerPhone;

  const previewCustEmail = customerType === 'existing'
    ? (selectedCust?.email || selectedCust?.primaryContactInfo?.email || customerEmail || '')
    : customerEmail;

  const previewCustAddress = customerType === 'existing'
    ? (selectedCust?.address || selectedCust?.companyInfo?.fullAddress || customerAddress || '')
    : customerAddress;

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = isEditMode
        ? await api.patch(`/proposals/${id}`, payload)
        : await api.post('/proposals', payload);
      return r.data;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables?.status === 'sent' ? 'Proposal sent to customer successfully!' : 'Proposal saved successfully!');
      navigate('/proposals');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save proposal');
    }
  });

  const handleSubmit = (actionStatus?: 'draft' | 'sent' | 'accepted' | 'rejected') => {
    const finalStatus = actionStatus || status || 'draft';
    if (customerType === 'existing' && !customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (customerType === 'new' && !customerName.trim()) {
      toast.error('Please enter customer/company name');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter proposal title');
      return;
    }
    if (!validUntil) {
      toast.error('Please specify valid until date');
      return;
    }
    if (finalStatus === 'sent' && !previewCustEmail.trim()) {
      toast.error('Customer email is required to send the proposal');
      return;
    }

    const proposalItems = items
      .map((item) => ({
        ...item,
        description: item.description.trim(),
        qty: Number(item.qty) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        total: (Number(item.qty) || 1) * (Number(item.unitPrice) || 0),
      }))
      .filter((item) => item.description);

    if (proposalItems.length === 0) {
      toast.error('Please add at least one proposal line item');
      return;
    }

    const payload = {
      customerType,
      customer: customerType === 'existing' ? customerId : undefined,
      customerName: customerType === 'new' ? customerName : undefined,
      contactPerson: customerType === 'new' ? contactPerson : undefined,
      customerPhone: customerType === 'new' ? customerPhone : undefined,
      customerEmail: customerType === 'new' ? customerEmail : undefined,
      customerAddress: customerType === 'new' ? customerAddress : undefined,
      title,
      validUntil,
      discount: discountNum,
      items: proposalItems,
      subtotal: proposalItems.reduce((sum, item) => sum + item.total, 0),
      total: finalTotal,
      terms: normalizeRichTerms(terms),
      templateImage: templateImage || undefined,
      status: finalStatus,
    };
    payload.total = payload.subtotal - (payload.subtotal * discountNum / 100);

    mutation.mutate(payload);
  };

  return (
    <div className="proposal-form-container">
      <div className="page-header">
        <div>
          <div className="page-title">{isEditMode ? 'Edit Proposal' : 'New Proposal'}</div>
          <div className="page-subtitle">{isEditMode ? 'Update and resend proposal details' : 'Create and send a professional proposal'}</div>
        </div>
        <div className="actions-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/proposals')} disabled={mutation.isPending}>Cancel</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setIsLetterPreviewOpen(true)} disabled={mutation.isPending}>
            <FileText size={13} /> Letter Format
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSubmit('draft')} disabled={mutation.isPending}>Save Draft</button>
          <button className="btn btn-primary btn-sm" onClick={() => handleSubmit('sent')} disabled={mutation.isPending}>Send Proposal</button>
        </div>
      </div>
      <div className="proposal-builder-full-wrapper">
        <div className="card">
          <div className="card-header"><span className="card-title">Proposal Builder</span></div>
          <div className="card-body">
            <div className="template-select-block">
              <SelectField
                label="Proposal Template"
                value={selectedTemplateId}
                onChange={(val) => {
                  setSelectedTemplateId(val);
                  if (val) {
                    applyProposalTemplate(val);
                  }
                }}
                options={[
                  { value: '', label: '— No Template —' },
                  ...(proposalTemplates || []).map((template) => ({ value: template._id, label: template.name })),
                ]}
                placeholder="Choose a template only if needed"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: selectedProposalTemplate ? 'var(--brand)' : 'var(--tx-4)', fontWeight: 600 }}>
                  {selectedProposalTemplate
                    ? `✓ ${selectedProposalTemplate.items?.length || 0} line item${(selectedProposalTemplate.items?.length || 0) === 1 ? '' : 's'} & terms auto-applied from template`
                    : 'Select a template above to automatically fill proposal items & terms.'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => applyProposalTemplate()}
                    disabled={!selectedTemplateId}
                  >
                    <FileText size={13} /> {importedTemplateIdRef.current === selectedTemplateId && selectedTemplateId ? 'Re-import Template' : 'Import Template'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/proposal-templates')}>
                    Manage Templates
                  </button>
                </div>
              </div>
            </div>

            <SelectField
              label="Customer Type"
              value={customerType}
              onChange={(v) => {
                setCustomerType(v as 'existing' | 'new');
                setCustomerId('');
                setSelectedLeadId('');
                setCustomerName('');
                setContactPerson('');
                setCustomerPhone('');
                setCustomerEmail('');
                setCustomerAddress('');
              }}
              options={[
                { value: 'existing', label: 'Existing Customer' },
                { value: 'new', label: 'New Customer' },
              ]}
              required
            />

            {customerType === 'existing' ? (
              <SelectField
                label="Customer *"
                value={customerId}
                onChange={setCustomerId}
                options={(customers || []).map((c: { _id: string; name: string }) => ({ value: c._id, label: c.name }))}
                placeholder="— Select Customer —"
                required
              />
            ) : (
              <div className="new-customer-details">
                <SelectField
                  label="Select from Lead (Optional)"
                  value={selectedLeadId}
                  onChange={(val) => {
                    setSelectedLeadId(val);
                    if (!val) {
                      setCustomerName('');
                      setContactPerson('');
                      setCustomerPhone('');
                      setCustomerEmail('');
                      setCustomerAddress('');
                      return;
                    }
                    const lead = (leads || []).find((l: any) => l._id === val);
                    if (lead) {
                      setCustomerName(lead.companyName || lead.name || '');
                      setContactPerson(lead.name || '');
                      setCustomerPhone(lead.phone || '');
                      setCustomerEmail(lead.email || '');
                      setCustomerAddress(lead.fullAddress || lead.locationArea || '');
                    }
                  }}
                  options={[
                    { value: '', label: '— Fill from Lead —' },
                    ...(leads || []).map((l: any) => ({
                      value: l._id,
                      label: l.companyName ? `${l.companyName} (${l.name})` : l.name
                    }))
                  ]}
                />

                <InputField
                  label="Customer/Company Name *"
                  value={customerName}
                  onChange={setCustomerName}
                  placeholder="Enter company name"
                  required
                />
                <div className="form-grid-2">
                  <InputField
                    label="Contact Person"
                    value={contactPerson}
                    onChange={setContactPerson}
                    placeholder="Enter contact person"
                  />
                  <InputField
                    label="Phone Number"
                    value={customerPhone}
                    onChange={setCustomerPhone}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="form-grid-2">
                  <InputField
                    label="Email Address"
                    value={customerEmail}
                    onChange={setCustomerEmail}
                    placeholder="contact@company.com"
                    type="email"
                  />
                  <InputField
                    label="Full Address"
                    value={customerAddress}
                    onChange={setCustomerAddress}
                    placeholder="Doha, Qatar"
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Proposal Title <span className="req">*</span></label>
              <input
                className="form-control"
                placeholder="e.g. TallyPrime Gold Upgrade"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Proposal Media Image</label>
              <div className="media-selector-block">
                <div className="media-preview-box">
                  {templateImage ? (
                    <img src={toAssetUrl(templateImage)} alt="Selected proposal media" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <ImageIcon size={22} color="var(--tx-4)" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)', marginBottom: 3 }}>
                    {templateImage ? 'Selected image will appear in the proposal preview and email.' : 'Add an uploaded media image to the proposal.'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {templateImage || 'No image selected'}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsMediaModalOpen(true)}>
                  <ImageIcon size={13} /> Select from Library
                </button>
                {templateImage && (
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setTemplateImage('')} title="Remove image">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="form-grid-3">
              <InputField label="Valid Until" value={validUntil} onChange={setValidUntil} type="date" />
              <div className="form-group">
                <label className="form-label">Discount (%)</label>
                <input
                  className="form-control"
                  type="number"
                  placeholder="Discount %"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <SelectField
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as any)}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'sent', label: 'Sent' },
                  { value: 'accepted', label: 'Accepted' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
            </div>

            {/* Items table */}
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Line Items</label>
              <div className="proposal-line-items">
                <table className="proposal-line-items-table">
                  <thead><tr><th className="sno-col">S NO</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i}>
                        <td className="sno-col">{i + 1}</td>
                        <td><textarea className="proposal-line-input proposal-line-description" rows={2} ref={autoGrowTextarea} value={item.description} onChange={(e) => { updateItem(i, 'description', e.target.value); autoGrowTextarea(e.currentTarget); }} placeholder="Item description" /></td>
                        <td><input className="proposal-line-input proposal-line-number" type="number" value={item.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} placeholder="Qty" /></td>
                        <td><input className="proposal-line-input proposal-line-number" type="number" value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', e.target.value)} placeholder="0.00" /></td>
                        <td className="proposal-line-total">
                          {(Number(item.total) || 0) > 0 ? (
                            (Number(item.total) || 0).toLocaleString()
                          ) : (
                            <span style={{ display: 'inline-block', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--green, #16a34a)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>
                              FREE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addItem}><PlusCircle size={12} /> Add Item</button>
            </div>

            <div className="proposal-total-box">
              <div className="proposal-total-line">Subtotal: {fmt.currency(subtotal || 0)}</div>
              {discountNum > 0 && <div className="proposal-total-line is-muted">Discount ({discountNum}%): -{fmt.currency(subtotal * discountNum / 100)}</div>}
              <div className="proposal-grand-total">Total: {fmt.currency(finalTotal || 0)}</div>
            </div>

            <div className="form-group proposal-terms-group">
              <RichTextEditor
                value={terms}
                onChange={setTerms}
                placeholder="Payment terms, validity, etc."
                onInsertImageUrl={(insertFn) => {
                  richImageInsertFnRef.current = insertFn;
                  setIsTermsImageModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal open={isLetterPreviewOpen} onClose={() => setIsLetterPreviewOpen(false)} title="Letter Format Preview" size="xl">
        <div className="workspace-desk">
          <div className="proposal-preview-sheet">
            {previewWatermarkUrl && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  opacity: 0.08,
                  zIndex: 0,
                }}
              >
                <img
                  src={previewWatermarkUrl}
                  alt=""
                  style={{ width: '60%', maxWidth: 440, maxHeight: '62%', objectFit: 'contain' }}
                />
              </div>
            )}
            <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
              {templateImage && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fff', overflow: 'hidden', marginBottom: 18, textAlign: 'center' }}>
                  <img
                    src={toAssetUrl(templateImage)}
                    alt="Proposal media"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '2.5px solid var(--brand)' }}>
                <div><div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand)' }}>WelcomeTech Qatar</div><div style={{ fontSize: 10.5, color: 'var(--tx-3)', marginTop: 3 }}>Tally Prime ERP Partner · Doha, Qatar</div></div>
                <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--tx-2)' }}><div style={{ fontWeight: 700 }}>PROPOSAL</div><div style={{ marginTop: 3 }}>Date: {fmt.date(new Date().toISOString())}</div></div>
              </div>

              <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand-muted)', borderRadius: 7, padding: '11px 13px', marginBottom: 14 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-text)', marginBottom: 4 }}>Prepared For</div>
                {previewCustName ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>{previewCustName}</div>
                    {previewCustPhone && <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Phone: {previewCustPhone}</div>}
                    {previewCustEmail && <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Email: {previewCustEmail}</div>}
                    {previewCustAddress && <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>Address: {previewCustAddress}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>Select a customer above</div>
                )}
              </div>

              <div className="proposal-rich-table-scroll-wrapper">
                <table style={{ width: '100%', fontSize: 11.5, margin: 0 }}>
                  <thead>
                    <tr>
                      <th className="sno-col" style={{ background: 'var(--brand)', color: '#fff', padding: '7px 10px', textTransform: 'none', fontSize: 11.5 }}>No</th>
                      <th style={{ background: 'var(--brand)', color: '#fff', padding: '7px 10px', textTransform: 'none', fontSize: 11.5 }}>Description</th>
                      <th style={{ background: 'var(--brand)', color: '#fff', padding: '7px 10px', textTransform: 'none', fontSize: 11.5, textAlign: 'center' }}>Qty</th>
                      <th style={{ background: 'var(--brand)', color: '#fff', padding: '7px 10px', textTransform: 'none', fontSize: 11.5, textAlign: 'right' }}>Amount ({getActiveCurrency()})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter(i => i.description).map((item, i) => (
                      <tr key={i}>
                        <td className="sno-col" style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>{i + 1}</td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'pre-line' }}>{item.description}</td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>{item.qty || '—'}</td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, textAlign: 'right' }}>
                          {(item.total || 0) > 0 ? (
                            (item.total || 0).toLocaleString()
                          ) : (
                            <span style={{ display: 'inline-block', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--green, #16a34a)', border: '1px solid rgba(34, 197, 94, 0.25)', padding: '2px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em' }}>
                              FREE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="proposal-preview-total-row">
                <div className="proposal-preview-validity">
                  {validUntil && `Valid Until: ${fmt.date(validUntil)}`}
                </div>
                <div className="proposal-preview-total-stack">
                  {discountNum > 0 && <div className="proposal-preview-discount">{fmt.currency(subtotal)}</div>}
                  <div className="proposal-preview-total">{fmt.currency(finalTotal || 0)}</div>
                </div>
              </div>
            </div>
            <div className="page-number-indicator">Page 1 {normalizeRichTerms(terms) ? 'of 2' : 'of 1'}</div>
          </div>

          {normalizeRichTerms(terms) && (
            <div className="proposal-preview-sheet">
              {previewWatermarkUrl && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    opacity: 0.08,
                    zIndex: 0,
                  }}
                >
                  <img
                    src={previewWatermarkUrl}
                    alt=""
                    style={{ width: '60%', maxWidth: 440, maxHeight: '62%', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '2.5px solid var(--brand)' }}>
                  <div><div style={{ fontSize: 17, fontWeight: 800, color: 'var(--brand)' }}>WelcomeTech Qatar</div><div style={{ fontSize: 10.5, color: 'var(--tx-3)', marginTop: 3 }}>Tally Prime ERP Partner · Doha, Qatar</div></div>
                  <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--tx-2)' }}><div style={{ fontWeight: 700 }}>TERMS & CONDITIONS</div><div style={{ marginTop: 3 }}>Date: {fmt.date(new Date().toISOString())}</div></div>
                </div>
                <div className="proposal-preview-terms" style={{ marginTop: 0 }}>
                  <ProposalTermsPreview terms={terms} />
                </div>
              </div>
              <div className="page-number-indicator">Page 2 of 2</div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} title="Select Proposal Image" size="xl">
        <MediaLibraryPage
          isPicker
          onSelect={(file: MediaFile) => {
            if (file.type !== 'image') {
              toast.error('Please select an image file');
              return;
            }
            setTemplateImage(file.url);
            setIsMediaModalOpen(false);
          }}
        />
      </Modal>

      <Modal open={isTermsImageModalOpen} onClose={() => setIsTermsImageModalOpen(false)} title="Insert Image into Terms" size="xl">
        <div style={{ height: '68vh', overflow: 'hidden' }}>
          <MediaLibraryPage
            isPicker
            onSelect={(file: MediaFile) => {
              if (file.type !== 'image') { toast.error('Please select an image file'); return; }
              if (richImageInsertFnRef.current) {
                richImageInsertFnRef.current(toAssetUrl(file.url), file.url.split('/').pop() || 'image');
              }
              setIsTermsImageModalOpen(false);
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

// ─── ENGINEERS ───────────────────────────────────
export const EngineersPage: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['engineers'],
    queryFn: async () => { const r = await api.get('/engineers'); return r.data.data as (User & { totalCalls: number; resolvedCalls: number })[]; },
  });

  const engineers = data || [];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Engineers</div><div className="page-subtitle">Team performance and assignment</div></div>
      </div>
      <div className="cards-auto-grid">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '50%' }} />
          </div>
        )) : engineers.map((eng) => (
          <div key={eng._id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Avatar name={eng.name} size="lg" />
              <span className={`badge ${eng.isActive ? 'badge-green' : 'badge-gray'}`}>{eng.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{eng.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginBottom: 12, textTransform: 'capitalize' }}>{eng.role}</div>
            <div className="quick-grid-2" style={{ marginBottom: 12 }}>
              {[
                { label: 'Total Calls', value: eng.totalCalls, color: 'var(--brand)' },
                { label: 'Resolved', value: eng.resolvedCalls, color: 'var(--green)' },
              ].map((s) => (
                <div key={s.label} style={{ background: 'var(--surface-3)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx-4)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Stats</button>
              <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Assign</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── REPORTS ─────────────────────────────────────

// ─── CALENDAR ────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_TYPE_COLORS: Record<string, string> = {
  'amc-expired': 'var(--red)',
  'amc-expiring': 'var(--amber)',
  'payment-due': 'var(--purple)',
  'proposal-expiry': 'var(--teal)',
  'visit': 'var(--green)',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  'amc-expired': 'AMC Expired',
  'amc-expiring': 'AMC Expiring',
  'payment-due': 'Payment Due',
  'proposal-expiry': 'Proposal Expiry',
  'visit': 'Scheduled Visit',
};

interface CalendarEvent {
  id: string;
  date: string;
  label: string;
  type: string;
  module?: 'amc' | 'payment' | 'proposal' | 'visit';
  moduleLabel?: string;
  customerId: string;
  customerName: string;
  targetRoute?: string;
  productName?: string;
  refNo?: string;
  amount?: number;
}

const fmtDateLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export const CalendarPage: React.FC = () => {
  const now = new Date();
  const navigate = useNavigate();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  const prev = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const r = await api.get('/calendar', { params: { year, month } });
      return r.data.events as CalendarEvent[];
    },
  });

  const eventsByDate = React.useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of (data ?? [])) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [data]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: '', events: [] as CalendarEvent[], isToday: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      day: d,
      dateStr,
      events: eventsByDate[dateStr] ?? [],
      isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === d,
    });
  }

  const legendTypes = Object.keys(EVENT_TYPE_COLORS);
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Calendar</div><div className="page-subtitle">Scheduled visits, AMC renewals & events</div></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={prev}><ChevronLeft size={15} /></button>
            <span style={{ fontWeight: 700, fontSize: 14, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={next}><ChevronRight size={15} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {legendTypes.map(t => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tx-4)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: EVENT_TYPE_COLORS[t], display: 'inline-block' }} />
                {EVENT_TYPE_LABELS[t]}
              </span>
            ))}
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDate(todayStr); }}>Today</button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="calendar-week-grid" style={{ marginBottom: 4 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--tx-4)', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>)}
          </div>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-4)', fontSize: 13 }}>Loading events…</div>
          ) : (
            <div className="calendar-week-grid">
              {cells.map((cell, i) => (
                <div
                  key={i}
                  className="calendar-day-cell"
                  onClick={() => cell.day && setSelectedDate(cell.dateStr)}
                  style={{
                    border: `1px solid ${cell.day ? (cell.isToday ? 'var(--brand)' : (selectedDate === cell.dateStr ? 'var(--brand-muted)' : 'var(--border)')) : 'transparent'}`,
                    borderWidth: cell.isToday ? 2 : 1,
                    cursor: cell.day ? 'pointer' : 'default',
                    background: cell.isToday
                      ? 'var(--brand-light)'
                      : selectedDate === cell.dateStr
                        ? 'var(--surface-2)'
                        : cell.day ? 'var(--surface)' : 'transparent',
                  }}
                >
                  {cell.day && <>
                    <div style={{ fontSize: 12, fontWeight: cell.isToday ? 800 : 500, color: cell.isToday ? 'var(--brand)' : 'var(--tx-3)', marginBottom: 3 }}>{cell.day}</div>
                    {cell.events.map((ev, ei) => {
                      const color = EVENT_TYPE_COLORS[ev.type] ?? 'var(--tx-4)';
                      return (
                        <div key={ei} title={ev.label} style={{ fontSize: 9.5, padding: '2px 5px', borderRadius: 3, marginBottom: 2, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: `${color}18`, color, border: `1px solid ${color}40` }}>
                          {ev.label}
                        </div>
                      );
                    })}
                  </>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Date detail section with Tabular Columns & Direct Module Redirection */}
      {selectedDate && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block' }} />
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)' }}>
                Events for {fmtDateLabel(selectedDate)}
              </span>
              <span className="badge badge-purple" style={{ fontSize: 11 }}>
                {selectedEvents.length} {selectedEvents.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>
            {selectedDate !== todayStr && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedDate(todayStr)}>
                Back to Today
              </button>
            )}
          </div>
          <div style={{ padding: 0 }}>
            {selectedEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--tx-4)', fontSize: 13.5 }}>
                No events scheduled for this day.
              </div>
            ) : (
              <div className="tbl-wrap" style={{ border: 'none', borderRadius: '0 0 12px 12px' }}>
                <table className="table-pro">
                  <thead>
                    <tr>
                      <th style={{ width: 60, textAlign: 'center' }}>S NO</th>
                      <th style={{ minWidth: 220 }}>Customer Name</th>
                      <th style={{ minWidth: 160 }}>Module / Service</th>
                      <th style={{ minWidth: 140, textAlign: 'center' }}>Event Type</th>
                      <th style={{ minWidth: 180 }}>Details / Reference</th>
                      <th style={{ width: 220, textAlign: 'center' }}>Actions & Redirection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEvents.map((ev, idx) => {
                      const color = EVENT_TYPE_COLORS[ev.type] ?? 'var(--tx-4)';
                      const isAmc = ev.type.startsWith('amc') || ev.module === 'amc';
                      const isProposal = ev.type === 'proposal-expiry' || ev.module === 'proposal';
                      const isPayment = ev.type === 'payment-due' || ev.module === 'payment';
                      const isVisit = ev.type === 'visit' || ev.module === 'visit';

                      const moduleRoute = isAmc ? '/amc/list' : isProposal ? '/proposals/list' : isPayment ? '/payments' : isVisit ? '/calls' : '/customers';
                      const moduleButtonText = isAmc ? 'Go to AMC' : isProposal ? 'Go to Proposal' : isPayment ? 'Go to Payment' : isVisit ? 'Go to Calls' : 'Open Details';

                      return (
                        <tr key={ev.id || idx}>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--tx-4)' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td>
                            <div style={{ fontWeight: 750, color: 'var(--tx-1)', fontSize: 13 }}>
                              {ev.customerName || 'Unknown Customer'}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-purple" style={{ fontWeight: 700 }}>
                              {isAmc ? 'AMC Contract' : isProposal ? 'Sales Proposal' : isPayment ? 'Account Payment' : isVisit ? 'Client Visit' : (ev.moduleLabel || 'CRM Service')}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 750,
                                padding: '3px 10px',
                                borderRadius: 16,
                                background: `${color}14`,
                                color,
                                border: `1px solid ${color}30`,
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                            </span>
                          </td>
                          <td style={{ fontSize: 12.5, color: 'var(--tx-3)' }}>
                            {ev.refNo ? (
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 650, color: 'var(--tx-2)' }}>{ev.refNo}</span>
                            ) : ev.productName ? (
                              <span style={{ fontWeight: 650, color: 'var(--tx-2)' }}>{ev.productName}</span>
                            ) : (
                              <span>{ev.label}</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 750,
                                  padding: '5px 12px',
                                  borderRadius: 8,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                }}
                                onClick={() => {
                                  const searchTarget = (ev.customerName && ev.customerName !== 'Unknown' && ev.customerName !== 'Unknown Customer')
                                    ? ev.customerName
                                    : (ev.productName || '');
                                  const searchParam = searchTarget ? `?search=${encodeURIComponent(searchTarget)}` : '';
                                  const viewParam = isAmc && ev.id ? (searchParam ? `&viewId=${ev.id}` : `?viewId=${ev.id}`) : '';
                                  navigate(`${moduleRoute}${searchParam}${viewParam}`);
                                }}
                                title={`Navigate to ${moduleButtonText} and filter by ${ev.customerName || ev.productName || 'record'}`}
                              >
                                {moduleButtonText} &rarr;
                              </button>
                              {ev.customerId && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8 }}
                                  onClick={() => navigate(`/customers/${ev.customerId}/edit`)}
                                  title="View Customer Profile"
                                >
                                  Profile
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
