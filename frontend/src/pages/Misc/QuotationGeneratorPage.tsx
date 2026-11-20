import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { MediaLibraryPage, MediaFile } from './MediaLibrary';
import { downloadTemplatePDF } from './MiscPages';
import { getCommonDocumentStyles, handlePrintKeyboardShortcut, cleanWordArtifacts } from '../../utils/documentStyles';
import { Modal, Select, ConfirmDialog } from '../../components/ui';
import { ThemeDropdown } from '../../components/common/ThemeDropdown';
import { getActiveCurrency, toAssetUrl, toApiUrl } from '../../utils/helpers';
import {
  getNextQuotationNumber,
  buildProposalNumber,
  stripDateSuffix,
  estimateTextBlockLines,
  mergeEmailRecipients,
  chunkDocumentBlocksForA4Pages,
  joinHtmlUnits,
  normalizeColonTableToTabular,
  FLOW_BREAK_ATTR,
  FLOW_BREAK_HTML,
  removePageFromBlocks,
  A4PageChunk,
  ChunkBlockSlice
} from '../../utils/quotationHelpers';
import { amountToWords } from '../../utils/amountToWords';
import { filterProposalEligibleTasks, isTaskProposalAlreadySent } from '../../utils/proposalTaskFilter';
import {
  Printer,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Building,
  ArrowLeft,
  ChevronLeft,
  Truck,
  Wrench,
  Image as ImageIcon,
  Upload,
  X,
  Table,
  Palette,
  AlignLeft,
  Scissors,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo,
  Redo,
  ChevronUp,
  ChevronDown,
  PlusCircle,
  Calendar,
  FileText,
  CheckCircle2,
  Paperclip,
  Sparkles,
  Type,
  Eraser,
  Send,
  Download,
  Calculator,
  Edit3
} from 'lucide-react';

export interface OverallTotalConfig {
  show?: boolean;
  label?: string;
  notes?: string;
  showWords?: boolean;
}

export type DocumentBlockType = 'text' | 'table';

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  title?: string;
  content?: string;
  items?: QuotationItem[];
  discountPercent?: number;
  discountType?: 'percent' | 'amount';
  pageBreak?: boolean;
}

interface RichTextContainerProps {
  block: DocumentBlock;
  index: number;
  totalBlocks: number;
  onTitleChange: (id: string, val: string) => void;
  onContentChange: (id: string, htmlContent: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
  onTogglePageBreak?: (id: string) => void;
  onSplitBlock?: (id: string, contentBefore: string, contentAfter: string) => void;
  sliceIndex?: number;
  contentSlice?: string;
  isContinuation?: boolean;
  isEnd?: boolean;
  pageNum?: number;
  /** Pagination budget (px) still unused on this slice's page; undefined = unknown */
  pageRoom?: number;
}

const FONT_SIZE_OPTIONS = [
  { value: '1', label: '8pt', desc: 'Extra small / fine print' },
  { value: '2', label: '10pt', desc: 'Small text / footnotes' },
  { value: '3', label: '12pt', desc: 'Standard paragraph text' },
  { value: '4', label: '14pt', desc: 'Large text / sub-headings' },
  { value: '5', label: '18pt', desc: 'XL text / section titles' },
  { value: '6', label: '24pt', desc: '2XL text / main headers' },
  { value: '7', label: '36pt', desc: '3XL text / display title' },
];

const FONT_STYLE_OPTIONS = [
  { value: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'Default', desc: 'Modern System Sans' },
  { value: 'Arial', label: 'Arial', desc: 'Clean, neutral sans-serif' },
  { value: 'Georgia', label: 'Georgia', desc: 'Elegant editorial serif' },
  { value: 'Times New Roman', label: 'Times New Roman', desc: 'Classic formal serif' },
  { value: 'Garamond', label: 'Garamond', desc: 'Traditional book serif' },
  { value: 'Tahoma', label: 'Tahoma', desc: 'Compact, readable sans' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS', desc: 'Distinctive geometric sans' },
  { value: 'Verdana', label: 'Verdana', desc: 'Wide, open letterforms' },
  { value: 'Courier New', label: 'Courier New', desc: 'Fixed-width typewriter mono' },
];

const RichTextContainer: React.FC<RichTextContainerProps> = ({
  block,
  index,
  totalBlocks,
  onTitleChange,
  onContentChange,
  onMove,
  onRemove,
  onTogglePageBreak,
  onSplitBlock,
  sliceIndex = 0,
  contentSlice,
  isContinuation = false,
  isEnd = true,
  pageNum = 1,
  pageRoom
}) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const savedSelectionRef = React.useRef<Range | null>(null);
  const selectedImageRef = React.useRef<HTMLImageElement | null>(null);
  const [activeImg, setActiveImg] = React.useState<HTMLImageElement | null>(null);
  const [imgAlign, setImgAlign] = React.useState<'left' | 'center' | 'right'>('left');
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [isFormatMenuOpen, setIsFormatMenuOpen] = React.useState(false);
  const [selectedFormatLabel, setSelectedFormatLabel] = React.useState('T Normal');
  const [formatDropUp, setFormatDropUp] = React.useState(false);

  const fontStyleMenuRef = React.useRef<HTMLDivElement>(null);
  const [isFontStyleMenuOpen, setIsFontStyleMenuOpen] = React.useState(false);
  const [selectedFontStyleLabel, setSelectedFontStyleLabel] = React.useState('Default');
  const [fontStyleDropUp, setFontStyleDropUp] = React.useState(false);

  const fontSizeMenuRef = React.useRef<HTMLDivElement>(null);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = React.useState(false);
  const [selectedFontSizeLabel, setSelectedFontSizeLabel] = React.useState('12pt');
  const [fontSizeDropUp, setFontSizeDropUp] = React.useState(false);

  const handleInsertPageBreakAtCursor = () => {
    if (!contentRef.current) return;
    let splitHtmlBefore = contentRef.current.innerHTML;
    let splitHtmlAfter = '';

    let range: Range | null = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && contentRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0).cloneRange();
    } else if (savedSelectionRef.current && contentRef.current.contains(savedSelectionRef.current.commonAncestorContainer)) {
      range = savedSelectionRef.current.cloneRange();
    }

    if (range) {
      try {
        range.setEndAfter(contentRef.current.lastChild || contentRef.current);
        const docFrag = range.extractContents();
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(docFrag);
        splitHtmlAfter = tempDiv.innerHTML.trim();
        splitHtmlBefore = contentRef.current.innerHTML.trim();
      } catch (err) {
        console.warn('Page break selection split fallback', err);
      }
    }

    // If cursor was at the end of the text, split creates an empty continuation block on the next page
    if (!splitHtmlAfter && (range || !contentRef.current.innerHTML.trim())) {
      splitHtmlAfter = '<p><br></p>';
    }

    if (onSplitBlock && splitHtmlAfter) {
      onSplitBlock(block.id, splitHtmlBefore, splitHtmlAfter);
    } else if (onTogglePageBreak) {
      onTogglePageBreak(block.id);
    }
  };

  const tableMenuRef = React.useRef<HTMLDivElement>(null);
  const [isTableMenuOpen, setIsTableMenuOpen] = React.useState(false);
  const [tableDropUp, setTableDropUp] = React.useState(false);
  const activeTableRef = React.useRef<HTMLTableElement | null>(null);
  const activeRowRef = React.useRef<HTMLTableRowElement | null>(null);

  const checkTablePlacement = (triggerEl: HTMLElement | null) => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const cardEl = triggerEl.closest('.quotation-card') || triggerEl.closest('.proposals-page-container');
    const spaceToCardBottom = cardEl ? (cardEl.getBoundingClientRect().bottom - rect.bottom) : spaceBelow;

    // Pop up above if near bottom of viewport or near bottom edge of document card
    if ((spaceBelow < 440 || spaceToCardBottom < 440) && rect.top > 200) {
      setTableDropUp(true);
    } else if (spaceBelow < 300 && rect.top > spaceBelow) {
      setTableDropUp(true);
    } else {
      setTableDropUp(false);
    }
  };

  const checkFormatPlacement = (triggerEl: HTMLElement | null) => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const cardEl = triggerEl.closest('.quotation-card') || triggerEl.closest('.proposals-page-container');
    const spaceToCardBottom = cardEl ? (cardEl.getBoundingClientRect().bottom - rect.bottom) : spaceBelow;

    if ((spaceBelow < 340 || spaceToCardBottom < 340) && rect.top > 180) {
      setFormatDropUp(true);
    } else if (spaceBelow < 260 && rect.top > spaceBelow) {
      setFormatDropUp(true);
    } else {
      setFormatDropUp(false);
    }
  };

  const checkFontStylePlacement = (triggerEl: HTMLElement | null) => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const cardEl = triggerEl.closest('.quotation-card') || triggerEl.closest('.proposals-page-container');
    const spaceToCardBottom = cardEl ? (cardEl.getBoundingClientRect().bottom - rect.bottom) : spaceBelow;

    if ((spaceBelow < 340 || spaceToCardBottom < 340) && rect.top > 180) {
      setFontStyleDropUp(true);
    } else if (spaceBelow < 260 && rect.top > spaceBelow) {
      setFontStyleDropUp(true);
    } else {
      setFontStyleDropUp(false);
    }
  };

  const checkFontSizePlacement = (triggerEl: HTMLElement | null) => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const cardEl = triggerEl.closest('.quotation-card') || triggerEl.closest('.proposals-page-container');
    const spaceToCardBottom = cardEl ? (cardEl.getBoundingClientRect().bottom - rect.bottom) : spaceBelow;

    if ((spaceBelow < 340 || spaceToCardBottom < 340) && rect.top > 180) {
      setFontSizeDropUp(true);
    } else if (spaceBelow < 260 && rect.top > spaceBelow) {
      setFontSizeDropUp(true);
    } else {
      setFontSizeDropUp(false);
    }
  };

  React.useLayoutEffect(() => {
    if (isTableMenuOpen && tableMenuRef.current) {
      const triggerBtn = tableMenuRef.current.querySelector('button');
      if (triggerBtn) {
        checkTablePlacement(triggerBtn);
      }
    }
  }, [isTableMenuOpen]);

  React.useLayoutEffect(() => {
    if (isFormatMenuOpen && dropdownRef.current) {
      const triggerBtn = dropdownRef.current.querySelector('button');
      if (triggerBtn) {
        checkFormatPlacement(triggerBtn);
      }
    }
  }, [isFormatMenuOpen]);

  React.useLayoutEffect(() => {
    if (isFontStyleMenuOpen && fontStyleMenuRef.current) {
      const triggerBtn = fontStyleMenuRef.current.querySelector('button');
      if (triggerBtn) {
        checkFontStylePlacement(triggerBtn);
      }
    }
  }, [isFontStyleMenuOpen]);

  React.useLayoutEffect(() => {
    if (isFontSizeMenuOpen && fontSizeMenuRef.current) {
      const triggerBtn = fontSizeMenuRef.current.querySelector('button');
      if (triggerBtn) {
        checkFontSizePlacement(triggerBtn);
      }
    }
  }, [isFontSizeMenuOpen]);

  // Detect image alignment from style or parent text-align
  const detectImgAlignment = (img: HTMLImageElement): 'left' | 'center' | 'right' => {
    if (img.style.marginLeft === 'auto' && img.style.marginRight === 'auto') return 'center';
    if (img.style.marginRight === '0px' || img.style.marginRight === '0') return 'right';
    const parentAlign = img.parentElement?.style.textAlign;
    if (parentAlign === 'center') return 'center';
    if (parentAlign === 'right') return 'right';
    return 'left';
  };

  const selectImage = (img: HTMLImageElement | null) => {
    selectedImageRef.current = img;
    setActiveImg(img);
    if (img) {
      setImgAlign(detectImgAlignment(img));
    }
    if (contentRef.current) {
      contentRef.current.querySelectorAll('img').forEach((el) => {
        if (el === img) {
          el.classList.add('quote-img-selected');
        } else {
          el.classList.remove('quote-img-selected');
        }
      });
    }
  };

  const alignImage = (img: HTMLImageElement, alignment: 'left' | 'center' | 'right') => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';

    if (alignment === 'center') {
      img.style.display = 'block';
      img.style.marginLeft = 'auto';
      img.style.marginRight = 'auto';
      img.style.float = 'none';
    } else if (alignment === 'right') {
      img.style.display = 'block';
      img.style.marginLeft = 'auto';
      img.style.marginRight = '0';
      img.style.float = 'none';
    } else {
      img.style.display = 'block';
      img.style.marginLeft = '0';
      img.style.marginRight = 'auto';
      img.style.float = 'none';
    }

    const parent = img.parentElement;
    if (parent && parent !== contentRef.current) {
      parent.style.textAlign = alignment;
    }

    setImgAlign(alignment);

    if (contentRef.current) {
      img.classList.remove('quote-img-selected');
      onContentChange(block.id, contentRef.current.innerHTML);
      img.classList.add('quote-img-selected');
    }
  };

  const contentToRender = contentSlice !== undefined ? contentSlice : (block.content || '');
  const [isFullEditOpen, setIsFullEditOpen] = React.useState(false);
  const [fullEditContent, setFullEditContent] = React.useState(block.content || '');

  React.useEffect(() => {
    setFullEditContent(block.content || '');
  }, [block.content]);

  // Sync content to contentEditable ref:
  // 1. If not focused, sync whenever innerHTML differs from contentToRender.
  // 2. If focused, BUT contentToRender is shorter than innerHTML (indicating overflow slicing moved content to next page),
  //    truncate this container to contentToRender and seamlessly move focus/cursor to the next page!
  React.useEffect(() => {
    if (!contentRef.current) return;
    const currentHtml = contentRef.current.innerHTML;
    const targetHtml = contentToRender || '';

    if (document.activeElement !== contentRef.current) {
      if (currentHtml !== targetHtml) {
        contentRef.current.innerHTML = targetHtml;
      }
    } else {
      const currentClean = currentHtml.replace(/<[^>]+>/g, '').trim();
      const targetClean = targetHtml.replace(/<[^>]+>/g, '').trim();

      // If user typed/pasted content that exceeds this page's A4 limit:
      if ((currentClean.length > targetClean.length && targetClean.length > 0) || (currentHtml.length > targetHtml.length + 10 && targetHtml.length > 0)) {
        contentRef.current.innerHTML = targetHtml;

        let attempts = 0;
        const focusNextSlice = () => {
          const nextSliceEl = document.querySelector<HTMLDivElement>(
            `[data-slice-id="${block.id}_slice_${sliceIndex + 1}"]`
          );
          if (nextSliceEl) {
            nextSliceEl.focus();
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(nextSliceEl);
              range.collapse(true); // Automatically move to TOP of next page
              sel.removeAllRanges();
              sel.addRange(range);
            }
            nextSliceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (attempts < 10) {
            attempts++;
            setTimeout(focusNextSlice, 40);
          }
        };
        setTimeout(focusNextSlice, 40);
      }
    }
  }, [block.id, contentToRender, sliceIndex]);

  // Close dropdowns on outside click
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFormatMenuOpen(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setIsTableMenuOpen(false);
      }
      if (fontStyleMenuRef.current && !fontStyleMenuRef.current.contains(e.target as Node)) {
        setIsFontStyleMenuOpen(false);
      }
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(e.target as Node)) {
        setIsFontSizeMenuOpen(false);
      }
    };
    if (isFormatMenuOpen || isTableMenuOpen || isFontStyleMenuOpen || isFontSizeMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isFormatMenuOpen, isTableMenuOpen, isFontStyleMenuOpen, isFontSizeMenuOpen]);

  const updateActiveTableAndRow = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && contentRef.current) {
      let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
      let foundRow: HTMLTableRowElement | null = null;
      let foundTable: HTMLTableElement | null = null;
      while (node && node !== contentRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.tagName === 'TR' && !foundRow) foundRow = el as HTMLTableRowElement;
          if (el.tagName === 'TABLE' && !foundTable) foundTable = el as HTMLTableElement;
        }
        node = node.parentNode;
      }
      activeRowRef.current = foundRow;
      activeTableRef.current = foundTable || contentRef.current.querySelector('table');
    } else if (contentRef.current) {
      activeTableRef.current = contentRef.current.querySelector('table');
    }
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
    updateActiveTableAndRow();
  };

  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
    } else if (contentRef.current) {
      contentRef.current.focus();
    }
  };

  const [isImgModalOpen, setIsImgModalOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const insertImageUrl = (url: string, alt = 'image') => {
    restoreSelection();
    const fullUrl = url.startsWith('http') || url.startsWith('data:') ? url : (window.location.origin + toAssetUrl(url));
    if (contentRef.current) {
      contentRef.current.focus();
    }
    document.execCommand('insertHTML', false, `<div style="text-align: left; margin: 10px 0;"><img src="${fullUrl}" alt="${alt}" style="max-width: 100%; height: auto; display: block; margin: 0 auto 0 0; border-radius: 6px;" /></div>`);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertImageUrl(reader.result, file.name);
        toast.success('Image inserted');
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const execCmd = (command: string, value: string = '') => {
    // 1. Check if an image is selected or currently targeted by selection
    let targetImg = selectedImageRef.current;
    if (!targetImg && contentRef.current) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer;
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.tagName === 'IMG') targetImg = el as HTMLImageElement;
          else if (el.querySelector('img')) targetImg = el.querySelector('img');
        } else if (node.parentElement) {
          if (node.parentElement.tagName === 'IMG') targetImg = node.parentElement as HTMLImageElement;
          else if (node.parentElement.querySelector('img')) targetImg = node.parentElement.querySelector('img');
        }
      }
    }

    if (targetImg && ['justifyLeft', 'justifyCenter', 'justifyRight'].includes(command)) {
      const align = command === 'justifyCenter' ? 'center' : command === 'justifyRight' ? 'right' : 'left';
      alignImage(targetImg, align);
      return;
    }

    // 2. Standard text formatting
    restoreSelection();
    if (contentRef.current) {
      contentRef.current.focus();
    }
    if (command === 'formatBlock') {
      try {
        document.execCommand('formatBlock', false, `<${value}>`);
      } catch {
        document.execCommand('formatBlock', false, value);
      }
    } else {
      document.execCommand(command, false, value);
    }
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    saveSelection();
  };

  const handleFormatSelect = (tag: string, label: string) => {
    setSelectedFormatLabel(label);
    setIsFormatMenuOpen(false);
    execCmd('formatBlock', tag);
  };

  const handleFontStyleSelect = (value: string, label: string) => {
    setSelectedFontStyleLabel(label);
    setIsFontStyleMenuOpen(false);
    restoreSelection();
    if (contentRef.current) contentRef.current.focus();
    document.execCommand('fontName', false, value);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    saveSelection();
  };

  const handleFontSizeSelect = (value: string, label: string) => {
    setSelectedFontSizeLabel(label);
    setIsFontSizeMenuOpen(false);
    restoreSelection();
    if (contentRef.current) contentRef.current.focus();
    document.execCommand('fontSize', false, value);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    saveSelection();
  };

  const detectSelectionStyles = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !contentRef.current) return;
    if (!contentRef.current.contains(sel.anchorNode)) return;

    try {
      let node: Node | null = sel.anchorNode;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const el = node as HTMLElement | null;
      if (!el) return;

      // 1. Detect format block (p, h2, h3, blockquote)
      let curr: HTMLElement | null = el;
      while (curr && curr !== contentRef.current) {
        const tagName = curr.tagName.toLowerCase();
        if (tagName === 'h2') { setSelectedFormatLabel('Heading 2'); break; }
        if (tagName === 'h3') { setSelectedFormatLabel('Heading 3'); break; }
        if (tagName === 'blockquote') { setSelectedFormatLabel('Quote Block'); break; }
        if (tagName === 'p') { setSelectedFormatLabel('T Normal'); break; }
        curr = curr.parentElement;
      }

      // 2. Detect font size from <font size="..."> or computed style
      const fontEl = el.closest('font[size]') as HTMLElement | null;
      if (fontEl) {
        const s = fontEl.getAttribute('size');
        const match = FONT_SIZE_OPTIONS.find((o) => o.value === s);
        if (match) {
          setSelectedFontSizeLabel(match.label);
        }
      } else {
        const comp = window.getComputedStyle(el);
        const px = parseFloat(comp.fontSize);
        if (px) {
          if (px <= 11.5) setSelectedFontSizeLabel('8pt');
          else if (px <= 13.5) setSelectedFontSizeLabel('10pt');
          else if (px <= 16.5) setSelectedFontSizeLabel('12pt');
          else if (px <= 20) setSelectedFontSizeLabel('14pt');
          else if (px <= 27) setSelectedFontSizeLabel('18pt');
          else if (px <= 38) setSelectedFontSizeLabel('24pt');
          else setSelectedFontSizeLabel('36pt');
        }
      }

      // 3. Detect font style / family
      const faceEl = el.closest('font[face]') as HTMLElement | null;
      if (faceEl) {
        const f = faceEl.getAttribute('face') || '';
        const match = FONT_STYLE_OPTIONS.find((o) =>
          o.value.toLowerCase().includes(f.toLowerCase()) ||
          o.label.toLowerCase() === f.toLowerCase() ||
          f.toLowerCase().includes(o.label.toLowerCase())
        );
        if (match) setSelectedFontStyleLabel(match.label);
      } else {
        const comp = window.getComputedStyle(el);
        const compFont = comp.fontFamily;
        if (compFont) {
          const match = FONT_STYLE_OPTIONS.find((o) =>
            o.label !== 'Default' && compFont.toLowerCase().includes(o.label.toLowerCase())
          );
          if (match) setSelectedFontStyleLabel(match.label);
          else setSelectedFontStyleLabel('Default');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const insertSpecTable = () => {
    restoreSelection();
    if (contentRef.current) contentRef.current.focus();
    const html = `
<table class="quote-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 10pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
  <thead>
    <tr style="background: #722580; color: #ffffff;">
      <th style="background: #722580; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; width: 48px; border: none; border-top-left-radius: 7px;">NO</th>
      <th style="background: #722580; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 32%; border: none;">ITEM / PARAMETER</th>
      <th style="background: #722580; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; border: none; border-top-right-radius: 7px;">DETAILS / SPECIFICATION</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0;">
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">1</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Deployment Platform</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">Cloud / On-Premise Server</td>
    </tr>
    <tr style="background: #fafbfc; border-bottom: 1px solid #e2e8f0;">
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">2</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Operating System</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">Windows 10 / 11 Pro 64-bit</td>
    </tr>
    <tr style="background: #ffffff;">
      <td style="border: none; border-bottom-left-radius: 7px; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">3</td>
      <td style="border: none; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Support Window</td>
      <td style="border: none; border-bottom-right-radius: 7px; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">Standard Business Hours (9 AM - 6 PM)</td>
    </tr>
  </tbody>
</table><p><br/></p>`;
    document.execCommand('insertHTML', false, html);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    setIsTableMenuOpen(false);
    toast.success('Specification table inserted');
  };

  const insertTermsTable = () => {
    restoreSelection();
    if (contentRef.current) contentRef.current.focus();
    const html = `
<table class="quote-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 10pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
  <thead>
    <tr style="background: #722580; color: #ffffff;">
      <th style="background: #722580; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; width: 48px; border: none; border-top-left-radius: 7px;">NO</th>
      <th style="background: #722580; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 32%; border: none;">TERMS &amp; CONDITIONS</th>
      <th style="background: #722580; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; border: none; border-top-right-radius: 7px;">DETAILS</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0;">
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">1</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Quotation Validity</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">7 days from the date of quotation</td>
    </tr>
    <tr style="background: #fafbfc; border-bottom: 1px solid #e2e8f0;">
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">2</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Delivery</td>
      <td style="border: none; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">Immediate upon confirmation</td>
    </tr>
    <tr style="background: #ffffff;">
      <td style="border: none; border-bottom-left-radius: 7px; padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">3</td>
      <td style="border: none; padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 32%; font-size: 10pt;">Payment</td>
      <td style="border: none; border-bottom-right-radius: 7px; padding: 10px 14px; color: #0f172a; vertical-align: top; font-size: 10pt;">100% advance payment along with LPO</td>
    </tr>
  </tbody>
</table><p><br/></p>`;
    document.execCommand('insertHTML', false, html);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    setIsTableMenuOpen(false);
    toast.success('Terms & Conditions table inserted');
  };

  const insertGridTable = (rows = 3, cols = 3) => {
    restoreSelection();
    if (contentRef.current) contentRef.current.focus();
    let rowsHtml = '';
    for (let r = 0; r < rows; r++) {
      rowsHtml += '<tr>';
      for (let c = 0; c < cols; c++) {
        if (r === 0) {
          rowsHtml += `<th style="border: 1px solid #cbd5e1; padding: 7px 10px; background: #f8fafc; font-weight: 700; font-size: 12px; text-align: left;">Header ${c + 1}</th>`;
        } else {
          rowsHtml += `<td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 12px;">Data ${r},${c + 1}</td>`;
        }
      }
      rowsHtml += '</tr>';
    }
    const html = `<table class="quote-grid-table" style="width: 100%; border-collapse: collapse; margin: 10px 0;"><tbody>${rowsHtml}</tbody></table><p><br/></p>`;
    document.execCommand('insertHTML', false, html);
    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    setIsTableMenuOpen(false);
    toast.success(`${rows}×${cols} Table inserted`);
  };

  const applyTablePreset = (preset: 'clean' | 'striped' | 'branded' | 'bordered') => {
    updateActiveTableAndRow();
    const table = activeTableRef.current || contentRef.current?.querySelector('table');
    if (!table) {
      toast.error('No table found in this section. Insert a table first.');
      return;
    }

    const rows = table.querySelectorAll('tr');
    if (preset === 'clean') {
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      rows.forEach((tr, i) => {
        (tr as HTMLElement).style.backgroundColor = 'transparent';
        tr.querySelectorAll('td, th').forEach((cell) => {
          const el = cell as HTMLElement;
          el.style.border = '1px solid #e2e8f0';
          el.style.backgroundColor = i === 0 && cell.tagName === 'TH' ? '#f8fafc' : 'transparent';
          el.style.borderRadius = '0';
          el.style.padding = '8px 12px';
        });
      });
      table.classList.add('quote-grid-table');
      toast.success('Clean minimal table style applied');
    } else if (preset === 'striped') {
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      table.classList.add('quote-grid-table');
      rows.forEach((tr, i) => {
        const isHeader = i === 0 && tr.querySelector('th') !== null;
        const bg = isHeader ? '#f1f5f9' : (i % 2 === 0 ? '#f8fafc' : '#ffffff');
        (tr as HTMLElement).style.backgroundColor = bg;
        tr.querySelectorAll('td, th').forEach((cell) => {
          const el = cell as HTMLElement;
          el.style.border = '1px solid #cbd5e1';
          el.style.backgroundColor = bg;
          el.style.borderRadius = '0';
          el.style.padding = '8px 12px';
        });
      });
      toast.success('Striped zebra style applied');
    } else if (preset === 'branded') {
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      table.classList.add('quote-grid-table');
      rows.forEach((tr, i) => {
        const isHeader = i === 0;
        const bg = isHeader ? 'rgba(109, 40, 217, 0.08)' : (i % 2 === 0 ? '#faf5ff' : '#ffffff');
        (tr as HTMLElement).style.backgroundColor = bg;
        tr.querySelectorAll('td, th').forEach((cell) => {
          const el = cell as HTMLElement;
          el.style.border = '1px solid rgba(109, 40, 217, 0.18)';
          el.style.backgroundColor = bg;
          el.style.borderRadius = '0';
          el.style.padding = '8px 12px';
          if (isHeader) el.style.fontWeight = '700';
        });
      });
      toast.success('Branded executive style applied');
    } else if (preset === 'bordered') {
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      table.classList.add('quote-grid-table');
      rows.forEach((tr, i) => {
        const isHeader = i === 0 && tr.querySelector('th') !== null;
        const bg = isHeader ? '#f8fafc' : '#ffffff';
        (tr as HTMLElement).style.backgroundColor = bg;
        tr.querySelectorAll('td, th').forEach((cell) => {
          const el = cell as HTMLElement;
          el.style.border = '1px solid #cbd5e1';
          el.style.backgroundColor = bg;
          el.style.borderRadius = '0';
          el.style.padding = '8px 12px';
        });
      });
      toast.success('Bordered grid style applied');
    }

    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
    setIsTableMenuOpen(false);
  };

  const applyRowColor = (color: string) => {
    updateActiveTableAndRow();
    const row = activeRowRef.current;
    const table = activeTableRef.current || contentRef.current?.querySelector('table');

    if (row) {
      row.style.backgroundColor = color;
      row.querySelectorAll('td, th').forEach((c) => {
        (c as HTMLElement).style.backgroundColor = color;
      });
      toast.success('Row background color updated');
    } else if (table) {
      table.querySelectorAll('tr').forEach((r) => {
        (r as HTMLElement).style.backgroundColor = color;
        r.querySelectorAll('td, th').forEach((c) => {
          (c as HTMLElement).style.backgroundColor = color;
        });
      });
      toast.success('Table background color updated');
    } else {
      toast.error('No row or table selected');
      return;
    }

    if (contentRef.current) {
      onContentChange(block.id, contentRef.current.innerHTML);
    }
  };

  const addTableRow = () => {
    updateActiveTableAndRow();
    const table = activeTableRef.current || contentRef.current?.querySelector('table');
    if (!table) {
      toast.error('No table found in this section');
      return;
    }
    const targetRow = activeRowRef.current || table.querySelector('tbody tr:last-child') || table.querySelector('tr:last-child');
    if (targetRow) {
      const isSpecs = table.classList.contains('specs-table') || table.getAttribute('data-type') === 'specs';
      const isGrid = table.classList.contains('quote-grid-table');
      const newRow = targetRow.cloneNode(true) as HTMLTableRowElement;
      newRow.querySelectorAll('td, th').forEach((cell, idx) => {
        if (isSpecs && idx === 1) {
          (cell as HTMLElement).textContent = ':';
        } else {
          (cell as HTMLElement).textContent = '';
        }
      });
      targetRow.parentElement?.insertBefore(newRow, targetRow.nextSibling);

      if (isGrid) {
        // Keep the grid's look: running "NO", zebra stripes, divider lines and rounded corners only on the last row
        const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
        bodyRows.forEach((r, i) => {
          const isLast = i === bodyRows.length - 1;
          r.style.background = i % 2 === 1 ? '#fafbfc' : '#ffffff';
          r.style.borderBottom = isLast ? '' : '1px solid #e2e8f0';
          (Array.from(r.children) as HTMLElement[]).forEach((c, ci, all) => {
            c.style.borderBottom = isLast ? '' : '1px solid #e2e8f0';
            c.style.borderBottomLeftRadius = isLast && ci === 0 ? '7px' : '';
            c.style.borderBottomRightRadius = isLast && ci === all.length - 1 ? '7px' : '';
          });
          const noCell = r.children[0] as HTMLElement | undefined;
          if (noCell && (/^\d*$/.test((noCell.textContent || '').trim()))) noCell.textContent = String(i + 1);
        });
      }
      // The new row can end up on the next page after re-pagination, so mark it, let every slice re-sync (blur), and then
      // put the cursor into it wherever it landed.
      newRow.setAttribute('data-new-row', '1');
      if (contentRef.current) {
        onContentChange(block.id, contentRef.current.innerHTML);
        if (document.activeElement === contentRef.current) contentRef.current.blur();
      }
      const placeCaretInNewRow = (attempt: number) => {
        const row = document.querySelector<HTMLTableRowElement>('tr[data-new-row="1"]');
        if (!row) {
          if (attempt < 15) setTimeout(() => placeCaretInNewRow(attempt + 1), 60);
          return;
        }
        const host = row.closest<HTMLElement>('[data-slice-id]');
        const cell = (row.children[1] || row.children[0]) as HTMLElement | undefined;
        row.removeAttribute('data-new-row');
        if (host && cell) {
          host.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(cell);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
          cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
          // drop the temporary marker from the saved content
          host.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      setTimeout(() => placeCaretInNewRow(0), 120);
      toast.success('New row added');
    }
  };

  const deleteTableRow = () => {
    updateActiveTableAndRow();
    const table = activeTableRef.current || contentRef.current?.querySelector('table');
    if (!table) return;
    const targetRow = activeRowRef.current || table.querySelector('tbody tr:last-child') || table.querySelector('tr:last-child');
    if (targetRow) {
      const allRows = table.querySelectorAll('tr');
      if (allRows.length <= 1) {
        table.remove();
        toast.success('Table removed');
      } else {
        targetRow.remove();
        toast.success('Row deleted');
      }
      if (contentRef.current) {
        onContentChange(block.id, contentRef.current.innerHTML);
      }
    }
  };

  /** "+ Add Row" under a table: adds below the row the cursor is in, otherwise at the end of the last table. */
  const addRowFromButton = () => {
    updateActiveTableAndRow();
    if (!activeRowRef.current) {
      const tables = contentRef.current?.querySelectorAll('table');
      activeTableRef.current = (tables && tables.length ? tables[tables.length - 1] : null) as HTMLTableElement | null;
    }
    addTableRow();
  };

  const deleteRowFromButton = () => {
    updateActiveTableAndRow();
    if (!activeRowRef.current) {
      const tables = contentRef.current?.querySelectorAll('table');
      activeTableRef.current = (tables && tables.length ? tables[tables.length - 1] : null) as HTMLTableElement | null;
    }
    deleteTableRow();
  };

  const hasTitle = (block.title || '').trim().length > 0;

  const formatOptions = [
    { tag: 'p', label: 'T Normal', desc: 'Standard paragraph text' },
    { tag: 'h2', label: 'Heading 2', desc: 'Large section heading' },
    { tag: 'h3', label: 'Heading 3', desc: 'Medium subsection title' },
    { tag: 'blockquote', label: 'Quote Block', desc: 'Callout or highlighted quotation' },
  ];

  return (
    <div
      className={`quote-rich-text-container ${block.pageBreak ? 'quote-page-break-before' : ''}`}
      style={{
        flexShrink: 0,
        // A continuation page is just the text flowing on – no card, border, header bar or buttons around it
        marginBottom: isContinuation ? 8 : 24,
        background: '#ffffff',
        borderRadius: isContinuation ? 0 : 12,
        border: isContinuation ? 'none' : '1px solid var(--border)',
        boxShadow: isContinuation ? 'none' : '0 4px 14px rgba(0, 0, 0, 0.05)',
        overflow: 'visible',
        position: 'relative',
        zIndex: (isFormatMenuOpen || isTableMenuOpen || isFontStyleMenuOpen || isFontSizeMenuOpen) ? 9999 : 1
      }}
    >
      {/* Modern Card Header Bar (not shown on continuation pages) */}
      {!isContinuation && (
      <div className={`quote-rich-text-header ${!hasTitle ? 'empty-title' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: isContinuation ? 'var(--surface-2, #f8fafc)' : '#ffffff', borderBottom: '1px solid var(--border)', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 }}>
          <span className="no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: isContinuation ? 'var(--tx-3, #64748b)' : 'var(--brand)', color: '#ffffff', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(109, 40, 217, 0.25)' }}>
            <AlignLeft size={12} /> Section #{index + 1}{isContinuation ? ' (Continued)' : ''}
          </span>
          {isContinuation ? (
            <span className="quote-print-continuation-title" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>
              {block.title || 'Section'} <span style={{ fontSize: '0.78rem', color: 'var(--tx-3)', fontWeight: 600 }}>(Continued from Page {(pageNum || 2) - 1})</span>
            </span>
          ) : (
            <input
              className="quote-input-clean"
              value={block.title || ''}
              onChange={(e) => onTitleChange(block.id, e.target.value)}
              placeholder="Enter Section Heading (e.g. Scope of Work, Project Deliverables, Terms)..."
              style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand)', width: '100%', letterSpacing: '-0.01em' }}
            />
          )}
        </div>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {(!isEnd || isContinuation) && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                setFullEditContent(block.content || '');
                setIsFullEditOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--brand)', borderColor: 'var(--brand)' }}
              title="Edit full content for this multi-page section"
            >
              <FileText size={12} />
              <span>Edit Full Section</span>
            </button>
          )}
          {!isContinuation && onTogglePageBreak && (
            <button
              type="button"
              className="quote-tool-btn-text"
              onClick={() => onTogglePageBreak(block.id)}
              style={{
                color: block.pageBreak ? 'var(--brand)' : 'var(--tx-3)',
                background: block.pageBreak ? 'var(--brand-light, rgba(109,40,217,0.1))' : 'transparent',
                border: block.pageBreak ? '1px solid var(--brand)' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '0 8px',
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              title={block.pageBreak ? "A4 Page Break active (Starts on new page) — Click to remove" : "Click to force this section to start on a new A4 page"}
            >
              <FileText size={13} />
              <span>{block.pageBreak ? 'Page Break' : 'A4 Break'}</span>
            </button>
          )}
          {!isContinuation && (
            <>
              <button type="button" className="quote-tool-btn" disabled={index === 0} onClick={() => onMove(index, 'up')} title="Move Section Up"><ChevronUp size={14} /></button>
              <button type="button" className="quote-tool-btn" disabled={index === totalBlocks - 1} onClick={() => onMove(index, 'down')} title="Move Section Down"><ChevronDown size={14} /></button>
              <button type="button" className="quote-tool-btn" style={{ color: '#ef4444' }} onClick={() => onRemove(block.id)} title="Delete Section"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      </div>
      )}

      {/* Modern Formatting Ribbon (no-print) */}
      {!isContinuation && (
      <div className="no-print quote-editor-toolbar" style={{ position: 'relative', zIndex: (isFormatMenuOpen || isTableMenuOpen || isFontStyleMenuOpen || isFontSizeMenuOpen) ? 10000 : 30, borderTop: 'none', borderBottom: '1px solid var(--border)', background: '#ffffff', padding: '6px 14px' }}>
        {/* Format Selection Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="quote-format-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              checkFormatPlacement(e.currentTarget);
              setIsFormatMenuOpen(!isFormatMenuOpen);
            }}
            title="Change text style"
          >
            <Type size={13} color="var(--brand)" />
            <span>{selectedFormatLabel}</span>
            <ChevronDown size={11} style={{ opacity: 0.6, transform: isFormatMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {isFormatMenuOpen && (
            <div
              className="quote-editor-dropdown-scroll"
              onWheel={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: formatDropUp ? 'auto' : 'calc(100% + 4px)',
                bottom: formatDropUp ? 'calc(100% + 4px)' : 'auto',
                left: 0,
                zIndex: 100000,
                minWidth: 195,
                maxHeight: 'min(320px, calc(100vh - 140px))',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                border: '1px solid rgba(15, 23, 42, 0.16)',
                borderRadius: 8,
                boxShadow: formatDropUp
                  ? '0 -16px 36px -4px rgba(15, 23, 42, 0.22), 0 -6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)'
                  : '0 16px 36px -4px rgba(15, 23, 42, 0.22), 0 6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              {formatOptions.map((opt) => {
                const isSelected = selectedFormatLabel === opt.label;
                return (
                  <button
                    key={opt.tag}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFormatSelect(opt.tag, opt.label);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
                      color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: opt.tag === 'p' ? 500 : opt.tag === 'h2' ? 700 : opt.tag === 'h3' ? 600 : 500,
                      fontStyle: opt.tag === 'blockquote' ? 'italic' : 'normal',
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.12)' : 'var(--surface-hover, #f1f5f9)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: isSelected ? 700 : (opt.tag === 'p' ? 500 : opt.tag === 'h2' ? 800 : opt.tag === 'h3' ? 700 : 400) }}>{opt.label}</span>
                      {isSelected && (
                        <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: isSelected ? 'var(--brand)' : 'var(--tx-4)', fontStyle: 'normal', fontWeight: 400, opacity: 0.85, marginTop: 1 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="quote-tool-divider" />

        {/* Theme-based Font Style (Family) Dropdown */}
        <div ref={fontStyleMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="quote-format-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              checkFontStylePlacement(e.currentTarget);
              setIsFontStyleMenuOpen(!isFontStyleMenuOpen);
            }}
            title="Change font family / style"
            style={{
              padding: '0 8px',
              minWidth: 84,
              gap: 4,
              background: isFontStyleMenuOpen ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
              borderColor: isFontStyleMenuOpen ? 'var(--brand)' : 'var(--border)',
            }}
          >
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx-1)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFontStyleLabel}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6, transform: isFontStyleMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {isFontStyleMenuOpen && (
            <div
              className="quote-editor-dropdown-scroll"
              onWheel={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: fontStyleDropUp ? 'auto' : 'calc(100% + 4px)',
                bottom: fontStyleDropUp ? 'calc(100% + 4px)' : 'auto',
                left: 0,
                zIndex: 100000,
                minWidth: 195,
                maxHeight: 'min(320px, calc(100vh - 140px))',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                border: '1px solid rgba(15, 23, 42, 0.16)',
                borderRadius: 8,
                boxShadow: fontStyleDropUp
                  ? '0 -16px 36px -4px rgba(15, 23, 42, 0.22), 0 -6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)'
                  : '0 16px 36px -4px rgba(15, 23, 42, 0.22), 0 6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              {FONT_STYLE_OPTIONS.map((opt) => {
                const isSelected = selectedFontStyleLabel === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFontStyleSelect(opt.value, opt.label);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
                      color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.12)' : 'var(--surface-hover, #f1f5f9)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: isSelected ? 800 : 600, fontFamily: opt.value }}>{opt.label}</span>
                      {isSelected && (
                        <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: isSelected ? 'var(--brand)' : 'var(--tx-4)', fontStyle: 'normal', fontWeight: 400, opacity: 0.85, marginTop: 1 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Theme-based Font Size Dropdown */}
        <div ref={fontSizeMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="quote-format-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              checkFontSizePlacement(e.currentTarget);
              setIsFontSizeMenuOpen(!isFontSizeMenuOpen);
            }}
            title="Change font size"
            style={{
              padding: '0 8px',
              minWidth: 68,
              gap: 4,
              background: isFontSizeMenuOpen ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
              borderColor: isFontSizeMenuOpen ? 'var(--brand)' : 'var(--border)',
            }}
          >
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>
              {selectedFontSizeLabel}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6, transform: isFontSizeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {isFontSizeMenuOpen && (
            <div
              className="quote-editor-dropdown-scroll"
              onWheel={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: fontSizeDropUp ? 'auto' : 'calc(100% + 4px)',
                bottom: fontSizeDropUp ? 'calc(100% + 4px)' : 'auto',
                left: 0,
                zIndex: 100000,
                minWidth: 180,
                maxHeight: 'min(320px, calc(100vh - 140px))',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                border: '1px solid rgba(15, 23, 42, 0.16)',
                borderRadius: 8,
                boxShadow: fontSizeDropUp
                  ? '0 -16px 36px -4px rgba(15, 23, 42, 0.22), 0 -6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)'
                  : '0 16px 36px -4px rgba(15, 23, 42, 0.22), 0 6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              {FONT_SIZE_OPTIONS.map((opt) => {
                const isSelected = selectedFontSizeLabel === opt.label;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFontSizeSelect(opt.value, opt.label);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
                      color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 12,
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.12)' : 'var(--surface-hover, #f1f5f9)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: isSelected ? 800 : 600, fontFamily: 'var(--font-mono)' }}>{opt.label}</span>
                      {isSelected && (
                        <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: isSelected ? 'var(--brand)' : 'var(--tx-4)', fontStyle: 'normal', fontWeight: 400, opacity: 0.85, marginTop: 1 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="quote-tool-divider" />

        {/* Inline Text Styles */}
        <button
          type="button"
          className="quote-tool-btn"
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('bold');
          }}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Italic (Ctrl+I)"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('italic');
          }}
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Underline (Ctrl+U)"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('underline');
          }}
        >
          <Underline size={14} />
        </button>

        <div className="quote-tool-divider" />

        {/* Alignment */}
        <button
          type="button"
          className="quote-tool-btn"
          title="Align Left"
          style={activeImg && imgAlign === 'left' ? { background: 'rgba(109, 40, 217, 0.15)', color: 'var(--brand)' } : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('justifyLeft');
          }}
        >
          <AlignLeft size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Align Center"
          style={activeImg && imgAlign === 'center' ? { background: 'rgba(109, 40, 217, 0.15)', color: 'var(--brand)' } : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('justifyCenter');
          }}
        >
          <AlignCenter size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Align Right"
          style={activeImg && imgAlign === 'right' ? { background: 'rgba(109, 40, 217, 0.15)', color: 'var(--brand)' } : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('justifyRight');
          }}
        >
          <AlignRight size={14} />
        </button>

        <div className="quote-tool-divider" />

        {/* Lists */}
        <button
          type="button"
          className="quote-tool-btn"
          title="Bullet List"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('insertUnorderedList');
          }}
        >
          <List size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Numbered List"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('insertOrderedList');
          }}
        >
          <ListOrdered size={14} />
        </button>

        <div className="quote-tool-divider" />

        {/* History */}
        <button
          type="button"
          className="quote-tool-btn"
          title="Undo"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('undo');
          }}
        >
          <Undo size={14} />
        </button>
        <button
          type="button"
          className="quote-tool-btn"
          title="Redo"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('redo');
          }}
        >
          <Redo size={14} />
        </button>

        <div className="quote-tool-divider" />

        {/* Clear Formatting */}
        <button
          type="button"
          className="quote-tool-btn-text"
          title="Clear Formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            execCmd('removeFormat');
          }}
        >
          <Eraser size={13} />
          <span>Clear</span>
        </button>

        <div className="quote-tool-divider" />

        {/* Media Library */}
        <button
          type="button"
          className="quote-tool-btn"
          title="Insert Image from Media Library"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setIsImgModalOpen(true);
          }}
        >
          <ImageIcon size={14} />
        </button>

        {/* Upload from Computer */}
        <label
          className="quote-tool-btn"
          title="Upload Image from Computer"
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={() => saveSelection()}
        >
          <Upload size={14} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </label>

        <div className="quote-tool-divider" />

        {/* Tabular Style & Table Manager */}
        <div ref={tableMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="quote-format-btn"
            title="Tabular Formatting & Colors"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              updateActiveTableAndRow();
              checkTablePlacement(e.currentTarget);
              setIsTableMenuOpen(!isTableMenuOpen);
            }}
            style={{
              padding: '0 9px',
              gap: 5,
              background: isTableMenuOpen ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
              borderColor: isTableMenuOpen ? 'var(--brand)' : 'var(--border)',
              color: isTableMenuOpen ? 'var(--brand)' : 'var(--tx-1)'
            }}
          >
            <Table size={13} color="var(--brand)" />
            <Palette size={11} style={{ opacity: 0.7 }} />
            <span>Table</span>
            <ChevronDown size={11} style={{ opacity: 0.6, transform: isTableMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {isTableMenuOpen && (
            <div
              className="quote-editor-dropdown-scroll"
              onWheel={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: tableDropUp ? 'auto' : 'calc(100% + 4px)',
                bottom: tableDropUp ? 'calc(100% + 4px)' : 'auto',
                left: 0,
                zIndex: 100000,
                minWidth: 265,
                maxHeight: 'min(420px, calc(100vh - 140px))',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                background: '#ffffff',
                border: '1px solid rgba(15, 23, 42, 0.16)',
                borderRadius: 10,
                boxShadow: tableDropUp
                  ? '0 -16px 36px -4px rgba(15, 23, 42, 0.22), 0 -6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)'
                  : '0 16px 36px -4px rgba(15, 23, 42, 0.22), 0 6px 16px -2px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05)',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Table size={12} /> Tabular Colors & Style
                </span>
                <span style={{ fontSize: 10, color: 'var(--tx-4)' }}>Presets</span>
              </div>

              {/* Style Presets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTablePreset('clean');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                    color: 'var(--tx-1)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid #cbd5e1', background: '#ffffff', display: 'inline-block' }} />
                  <div>
                    <div style={{ lineHeight: 1.2 }}>Clean Minimal (No Pill)</div>
                    <div style={{ fontSize: 9.5, color: 'var(--tx-4)', fontWeight: 400 }}>White background, thin dividers (specs style)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTablePreset('striped');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                    color: 'var(--tx-1)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid #cbd5e1', background: 'linear-gradient(to bottom, #ffffff 50%, #f1f5f9 50%)', display: 'inline-block' }} />
                  <div>
                    <div style={{ lineHeight: 1.2 }}>Striped Zebra</div>
                    <div style={{ fontSize: 9.5, color: 'var(--tx-4)', fontWeight: 400 }}>Alternating soft grey rows without rounded pills</div>
                  </div>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTablePreset('branded');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                    color: 'var(--tx-1)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--brand)', background: 'rgba(109, 40, 217, 0.15)', display: 'inline-block' }} />
                  <div>
                    <div style={{ lineHeight: 1.2 }}>Executive Branded</div>
                    <div style={{ fontSize: 9.5, color: 'var(--tx-4)', fontWeight: 400 }}>Purple tinted header & refined borders</div>
                  </div>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTablePreset('bordered');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: '#ffffff',
                    color: 'var(--tx-1)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid #94a3b8', background: '#ffffff', display: 'inline-block' }} />
                  <div>
                    <div style={{ lineHeight: 1.2 }}>Bordered Grid</div>
                    <div style={{ fontSize: 9.5, color: 'var(--tx-4)', fontWeight: 400 }}>Classic borders on all cells</div>
                  </div>
                </button>
              </div>

              {/* Row Color Swatches */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Palette size={11} /> Row / Table Color
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { color: 'transparent', label: 'None', border: '#cbd5e1' },
                    { color: '#ffffff', label: 'White', border: '#cbd5e1' },
                    { color: '#f8fafc', label: 'Slate', border: '#94a3b8' },
                    { color: '#eff6ff', label: 'Blue', border: '#93c5fd' },
                    { color: '#faf5ff', label: 'Purple', border: '#d8b4fe' },
                    { color: '#f0fdf4', label: 'Green', border: '#86efac' },
                    { color: '#fffbeb', label: 'Amber', border: '#fde68a' },
                  ].map((swatch) => (
                    <button
                      key={swatch.label}
                      type="button"
                      title={swatch.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyRowColor(swatch.color);
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: swatch.color === 'transparent' ? '#ffffff' : swatch.color,
                        border: `1.5px solid ${swatch.border}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                      }}
                    >
                      {swatch.color === 'transparent' && (
                        <span style={{ width: '100%', height: 1.5, background: '#ef4444', transform: 'rotate(45deg)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Insert Table & Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)' }}>
                  Insert Table
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertTermsTable();
                    }}
                    style={{
                      padding: '5px 8px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-hover, #f8fafc)',
                      color: 'var(--brand)',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    + Terms Table
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertSpecTable();
                    }}
                    style={{
                      padding: '5px 8px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-hover, #f8fafc)',
                      color: 'var(--tx-1)',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    + Specs Table
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, marginTop: 2 }}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertGridTable(3, 3);
                    }}
                    style={{
                      padding: '5px 8px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-hover, #f8fafc)',
                      color: 'var(--tx-1)',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    + 3×3 Grid
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 2 }}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTableRow();
                    }}
                    style={{
                      padding: '4px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 5,
                      border: '1px solid var(--border)',
                      background: '#ffffff',
                      color: 'var(--tx-2)',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    + Add Row
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      deleteTableRow();
                    }}
                    style={{
                      padding: '4px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 5,
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      background: '#ffffff',
                      color: '#ef4444',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    - Delete Row
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="quote-tool-divider" />

        {/* Page Break button (MS Word style) */}
        <button
          type="button"
          className="quote-tool-btn-text"
          title="Insert Page Break (Ctrl+Enter / Cmd+Enter)"
          onMouseDown={(e) => {
            e.preventDefault();
            handleInsertPageBreakAtCursor();
          }}
          style={{
            gap: 5,
            padding: '0 9px',
            height: 28,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--brand)',
            background: 'rgba(109, 40, 217, 0.08)',
            border: '1px solid rgba(109, 40, 217, 0.2)',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <Scissors size={12} />
          <span>Page Break</span>
        </button>
      </div>
      )}

      {/* Selected Image Quick Alignment & Sizing Toolbar */}
      {activeImg && (
        <div
          className="no-print quote-img-actions-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'rgba(109, 40, 217, 0.06)',
            borderBottom: '1px solid var(--border)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--brand)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ImageIcon size={14} />
            <span>Image Align:</span>
          </div>
          <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', background: '#ffffff' }}>
            <button
              type="button"
              className="quote-tool-btn"
              style={{ background: imgAlign === 'left' ? 'rgba(109, 40, 217, 0.15)' : '#ffffff', color: imgAlign === 'left' ? 'var(--brand)' : 'var(--tx-2)' }}
              title="Align Left"
              onClick={() => alignImage(activeImg, 'left')}
            >
              <AlignLeft size={13} />
            </button>
            <button
              type="button"
              className="quote-tool-btn"
              style={{ background: imgAlign === 'center' ? 'rgba(109, 40, 217, 0.15)' : '#ffffff', color: imgAlign === 'center' ? 'var(--brand)' : 'var(--tx-2)' }}
              title="Align Center"
              onClick={() => alignImage(activeImg, 'center')}
            >
              <AlignCenter size={13} />
            </button>
            <button
              type="button"
              className="quote-tool-btn"
              style={{ background: imgAlign === 'right' ? 'rgba(109, 40, 217, 0.15)' : '#ffffff', color: imgAlign === 'right' ? 'var(--brand)' : 'var(--tx-2)' }}
              title="Align Right"
              onClick={() => alignImage(activeImg, 'right')}
            >
              <AlignRight size={13} />
            </button>
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

          <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>Width:</span>
          {['25%', '50%', '75%', '100%'].map((w) => (
            <button
              key={w}
              type="button"
              className="btn btn-secondary btn-xs"
              style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700 }}
              onClick={() => {
                activeImg.style.width = w;
                activeImg.style.maxWidth = '100%';
                if (contentRef.current) {
                  activeImg.classList.remove('quote-img-selected');
                  onContentChange(block.id, contentRef.current.innerHTML);
                  activeImg.classList.add('quote-img-selected');
                }
              }}
            >
              {w}
            </button>
          ))}

          <button
            type="button"
            className="btn btn-secondary btn-xs"
            style={{ marginLeft: 'auto', color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.3)', padding: '2px 8px', fontSize: 11 }}
            onClick={() => {
              activeImg.remove();
              selectImage(null);
              if (contentRef.current) {
                onContentChange(block.id, contentRef.current.innerHTML);
              }
            }}
          >
            <Trash2 size={12} style={{ marginRight: 4 }} /> Remove
          </button>
        </div>
      )}

      {/* Spacious Writing Surface */}
      <div
        ref={contentRef}
        data-slice-id={`${block.id}_slice_${sliceIndex}`}
        data-block-id={block.id}
        data-slice-index={sliceIndex}
        className="quote-rich-text-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Type section description, scope details, technical specifications, or terms here..."
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target && target.tagName === 'IMG') {
            selectImage(target as HTMLImageElement);
          } else {
            selectImage(null);
          }
          detectSelectionStyles();
        }}
        onInput={() => {
          if (contentRef.current) {
            onContentChange(block.id, contentRef.current.innerHTML);
          }
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleInsertPageBreakAtCursor();
            return;
          }

          if (e.key === 'Enter') {
            // "Page completed" = there is a next slice to jump to, or the page has no room left for another line.
            // (An A4 card is always >= 1060px tall, so its height says nothing about whether the page is full.)
            const isPageCompleted = !isEnd || (pageRoom !== undefined && pageRoom < 42);

            const isAtEndOfPage = (): boolean => {
              if (!contentRef.current) return false;
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0) return false;
              try {
                const range = sel.getRangeAt(0);
                if (!contentRef.current.contains(range.endContainer)) return false;
                const testRange = range.cloneRange();
                testRange.selectNodeContents(contentRef.current);
                testRange.setStart(range.endContainer, range.endOffset);
                const remaining = testRange.toString().replace(/[\s\u200B\u00A0]+/g, '');
                return remaining.length === 0;
              } catch {
                return false;
              }
            };

            if (isPageCompleted && isAtEndOfPage()) {
              e.preventDefault();

              // Check if continuation slice already exists on the next page
              const nextSliceEl = document.querySelector<HTMLDivElement>(
                `[data-slice-id="${block.id}_slice_${sliceIndex + 1}"]`
              );

              if (nextSliceEl) {
                nextSliceEl.focus();
                const sel = window.getSelection();
                if (sel) {
                  const range = document.createRange();
                  range.selectNodeContents(nextSliceEl);
                  range.collapse(true); // Jump directly to TOP of next page!
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
                nextSliceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
              }

              // End of the section on a full page: keep typing in the SAME section on the next page
              // (a continuation slice), instead of spawning a separate block/container.
              if (contentRef.current) {
                onContentChange(block.id, contentRef.current.innerHTML + FLOW_BREAK_HTML);
                let attempts = 0;
                const focusContinuation = () => {
                  const el = document.querySelector<HTMLDivElement>(
                    `[data-slice-id="${block.id}_slice_${sliceIndex + 1}"]`
                  );
                  if (el) {
                    el.focus();
                    const sel = window.getSelection();
                    if (sel) {
                      const range = document.createRange();
                      range.selectNodeContents(el);
                      range.collapse(true);
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  } else if (attempts < 12) {
                    attempts++;
                    setTimeout(focusContinuation, 40);
                  }
                };
                setTimeout(focusContinuation, 40);
              }
              return;
            }
          }

          // Backspace at the very start of a continuation page: pull the text back into the previous page
          if (e.key === 'Backspace' && sliceIndex > 0 && contentRef.current) {
            const sel = window.getSelection();
            const atStart = (() => {
              if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
              const r = sel.getRangeAt(0);
              if (!contentRef.current!.contains(r.startContainer)) return false;
              const probe = document.createRange();
              probe.selectNodeContents(contentRef.current!);
              probe.setEnd(r.startContainer, r.startOffset);
              return probe.toString().replace(/[\s\u200B\u00A0]+/g, '').length === 0;
            })();
            const first = contentRef.current.firstElementChild as HTMLElement | null;
            if (atStart && first && first.hasAttribute(FLOW_BREAK_ATTR)) {
              e.preventDefault();
              const blank = !(first.textContent || '').replace(/[\s\u200B\u00A0]+/g, '');
              if (blank) first.remove(); else first.removeAttribute(FLOW_BREAK_ATTR);
              const prevId = `${block.id}_slice_${sliceIndex - 1}`;
              onContentChange(block.id, contentRef.current.innerHTML);
              let attempts = 0;
              const focusPrevEnd = () => {
                const el = document.querySelector<HTMLDivElement>(`[data-slice-id="${prevId}"]`);
                if (el) {
                  el.focus();
                  const sel2 = window.getSelection();
                  if (sel2) {
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel2.removeAllRanges();
                    sel2.addRange(range);
                  }
                } else if (attempts < 12) {
                  attempts++;
                  setTimeout(focusPrevEnd, 40);
                }
              };
              setTimeout(focusPrevEnd, 60);
              return;
            }
          }
        }}
        onKeyUp={() => {
          saveSelection();
          detectSelectionStyles();
        }}
        onMouseUp={(e) => {
          const target = e.target as HTMLElement;
          if (target && target.tagName === 'IMG') {
            selectImage(target as HTMLImageElement);
          }
          saveSelection();
          detectSelectionStyles();
        }}
        onSelect={() => {
          saveSelection();
          detectSelectionStyles();
        }}
        onFocus={() => {
          saveSelection();
          detectSelectionStyles();
        }}
        onBlur={() => {
          saveSelection();
          if (contentRef.current) {
            // A continuation page that only holds the (still empty) flow-break line is not needed – drop it
            const only = contentRef.current.children.length === 1 ? (contentRef.current.firstElementChild as HTMLElement) : null;
            const isEmptyFlowBreak =
              sliceIndex > 0 && !!only && only.hasAttribute(FLOW_BREAK_ATTR) &&
              !(contentRef.current.textContent || '').replace(/[\s\u200B\u00A0]+/g, '') &&
              !contentRef.current.querySelector('img,table');
            onContentChange(block.id, isEmptyFlowBreak ? '' : contentRef.current.innerHTML);
          }
        }}
        style={{
          minHeight: isContinuation ? '32px' : '130px',
          width: '100%',
          outline: 'none',
          fontSize: '0.96rem',
          lineHeight: '1.65',
          color: 'var(--tx-1)',
          padding: isContinuation ? '4px 24px' : '20px 24px',
          background: '#ffffff',
          textAlign: 'left',
          borderBottomLeftRadius: isContinuation ? 0 : 12,
          borderBottomRightRadius: isContinuation ? 0 : 12,
        }}
      />

      {/* Visible "+ Add Row" for tabular sections (like "+ Add Item" on pricing tables) */}
      {/<table\b/i.test(contentToRender) && (
        <div
          className="no-print"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px 14px', borderTop: '1px dashed var(--border)' }}
        >
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onMouseDown={(e) => { e.preventDefault(); addRowFromButton(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}
            title="Add a row below the one your cursor is in (or at the end of the table)"
          >
            <Plus size={13} /> Add Row
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onMouseDown={(e) => { e.preventDefault(); deleteRowFromButton(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}
            title="Delete the row your cursor is in (or the last row)"
          >
            <Trash2 size={13} /> Delete Row
          </button>
        </div>
      )}

      {isImgModalOpen && (
        <Modal
          open={isImgModalOpen}
          onClose={() => setIsImgModalOpen(false)}
          title="Select Image from Media Library"
          size="xxl"
        >
          <div style={{ height: '70vh', overflow: 'hidden' }}>
            <MediaLibraryPage
              isPicker
              onSelect={(file: MediaFile) => {
                if (file.type !== 'image') {
                  toast.error('Please select an image file');
                  return;
                }
                insertImageUrl(toAssetUrl(file.url), file.name);
                setIsImgModalOpen(false);
                toast.success('Image inserted');
              }}
            />
          </div>
        </Modal>
      )}

      {!isEnd && (
        <div className="no-print" style={{ padding: '8px 18px', background: 'var(--surface-2, #f8fafc)', borderTop: '1px dashed var(--border)', fontSize: '11px', color: 'var(--brand)', fontWeight: 700, fontStyle: 'italic', textAlign: 'right' }}>
          ↳ Section #{index + 1} continues on Page {(pageNum || 1) + 1}...
        </div>
      )}

      {isFullEditOpen && (
        <Modal
          open={isFullEditOpen}
          onClose={() => setIsFullEditOpen(false)}
          title={`Edit Section #${index + 1}: ${block.title || 'Rich Text Content'}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>
              This section is automatically paginated across multiple A4 pages. Edit the entire content below; pages and footers will automatically adjust.
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setFullEditContent(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: fullEditContent }}
              style={{
                minHeight: '300px',
                maxHeight: '55vh',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '16px 20px',
                fontSize: '0.96rem',
                lineHeight: 1.65,
                outline: 'none',
                background: '#ffffff',
                color: 'var(--tx-1)'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsFullEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onContentChange(block.id, fullEditContent);
                  setIsFullEditOpen(false);
                  toast.success('Section updated across pages');
                }}
              >
                Save & Update Pages
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export interface QuotationItem {
  id: number;
  type: 'item' | 'detail';
  no?: number;
  description: string;
  qty: number | string;
  unitPrice: number | string;
}

export interface ClientInfo {
  company: string;
  contactName?: string;
  address1: string;
  address2: string;
  phone: string;
  whatsapp: string;
  email: string;
}

export interface CompanyInfo {
  name: string;
  addressLine1: string;
  addressLine2: string;
  contactNo: string;
  email: string;
}

export interface TermsInfo {
  footnote: string;
  validity: string;
  paymentTerms: string;
  note: string;
}

const filterDefaultDetailRows = (itemsList: QuotationItem[]): QuotationItem[] => {
  const defaultLabels = [
    'Route:',
    'Cargo Specifications:',
    'Operational Support:',
    'Target Vehicle:',
    'Process:',
    'Customization:',
    'Vehicle:',
    'Scope:',
    'Quality Assurance:',
    'Maintenance Package:',
    'Insurance & Permit:',
    'Backup Fleet:',
    'Security:',
    'Facility Features:',
    'Requirements:'
  ];
  return (itemsList || []).filter(item => {
    if (item.type === 'detail') {
      const desc = item.description || '';
      if (defaultLabels.some(label => desc.trim().startsWith(label))) {
        return false;
      }
    }
    return true;
  });
};

// Re-exported for backward compatibility; implementation lives in utils/quotationHelpers.
export { getNextQuotationNumber };

export default function QuotationGeneratorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const isTemplateMode = location.pathname.includes('/proposal-templates');
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId');
  const leadId = searchParams.get('leadId');
  const customerId = searchParams.get('customerId');
  const paramProposalNo = searchParams.get('proposalNo');
  const paramQuoteDate = searchParams.get('quoteDate');

  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const defaultValidForDays = 10;
  const initialValidUntilDate = new Date(Date.now() + defaultValidForDays * 24 * 60 * 60 * 1000);
  const validUntilStr = initialValidUntilDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Fetch task if taskId passed
  const { data: taskData } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await api.get(`/tasks/${taskId}`);
      return res.data?.data || null;
    },
    enabled: !!taskId
  });

  // Fetch tasks for selector - only proposal-eligible tasks that are not yet sent
  const { data: tasksList } = useQuery({
    queryKey: ['tasks-list-proposal-eligible'],
    queryFn: async () => {
      const res = await api.get('/tasks', {
        params: {
          proposalOnly: true,
          notSentOnly: true,
          limit: 'all',
        },
      });
      return res.data?.data || [];
    },
  });

  // Fetch proposals to cross-reference tasks that already had proposals sent
  const { data: existingProposalsList } = useQuery({
    queryKey: ['proposals-sent-lookup'],
    queryFn: async () => {
      const res = await api.get('/proposals', { params: { limit: 'all' } });
      return res.data?.data || [];
    },
    staleTime: 60 * 1000,
  });

  // Fetch customers for selector
  const { data: customers } = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: async () => {
      const res = await api.get('/customers/lookup');
      return res.data?.data || res.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch lead if leadId passed
  const { data: leadData } = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const res = await api.get(`/leads/${leadId}`);
      return res.data?.data || res.data || null;
    },
    enabled: !!leadId
  });

  // Fetch Proposal Templates for selector
  const { data: proposalTemplates } = useQuery({
    queryKey: ['proposal-templates-selector'],
    queryFn: async () => {
      const res = await api.get('/proposal-templates');
      return res.data?.data || [];
    }
  });

  // Fetch Email Templates for the email modal selector
  const { data: emailTemplates } = useQuery({
    queryKey: ['email-templates-selector'],
    queryFn: async () => {
      const res = await api.get('/email-templates');
      return res.data?.data || [];
    }
  });

  // Fetch Leads for selector (only leads where proposal was requested)
  const { data: leadsList } = useQuery({
    queryKey: ['leads-list-proposal-eligible'],
    queryFn: async () => {
      const res = await api.get('/leads', { params: { proposalOnly: true, limit: 'all' } });
      return res.data?.data || [];
    }
  });

  // Fetch template details if editing existing proposal template
  const { data: existingTemplate } = useQuery({
    queryKey: ['proposal-template', id],
    enabled: isTemplateMode && isEditMode,
    queryFn: async () => {
      const r = await api.get(`/proposal-templates/${id}`);
      return r.data.data;
    },
  });

  // Fetch proposal details if editing existing proposal
  const { data: existingProposal } = useQuery({
    queryKey: ['proposal', id],
    enabled: !isTemplateMode && isEditMode,
    queryFn: async () => {
      const r = await api.get(`/proposals/${id}`);
      return r.data?.data || r.data;
    },
  });

  // State declarations
  const [customerType, setCustomerType] = useState<'task' | 'lead' | 'existing'>(
    taskId ? 'task' : leadId ? 'lead' : customerId ? 'existing' : 'task'
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string>(taskId || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Filter only proposal category tasks where proposals have not yet been sent
  const allTasks = useMemo(() => {
    const rawList = [...(tasksList || [])];
    if (taskData && !rawList.some((t: any) => t._id === taskData._id)) {
      if (isEditMode || !isTaskProposalAlreadySent(taskData)) {
        rawList.unshift(taskData);
      }
    }
    const propTask = typeof existingProposal?.task === 'object' ? existingProposal.task : null;
    if (propTask && propTask._id && !rawList.some((t: any) => t._id === propTask._id)) {
      rawList.unshift(propTask);
    }

    const activeId = isEditMode
      ? (selectedTaskId || taskId || (typeof existingProposal?.task === 'object' ? existingProposal.task?._id : existingProposal?.task))
      : undefined;

    const filtered = filterProposalEligibleTasks({
      tasks: rawList,
      sentProposals: existingProposalsList,
      currentTaskId: activeId ? String(activeId) : undefined,
      isEditMode,
    });

    return filtered.sort((a: any, b: any) => {
      if (activeId && String(a._id) === String(activeId)) return -1;
      if (activeId && String(b._id) === String(activeId)) return 1;
      return (b.taskNo || '').localeCompare(a.taskNo || '');
    });
  }, [tasksList, taskData, existingProposal?.task, existingProposalsList, selectedTaskId, taskId, isEditMode]);

  // Merge existingProposal template into proposalTemplates list if not present
  const templateOptions = useMemo(() => {
    const list = [...(proposalTemplates || [])];
    const propTemplate = typeof existingProposal?.template === 'object' ? existingProposal.template : null;
    if (propTemplate && propTemplate._id && !list.some((t: any) => t._id === propTemplate._id)) {
      list.unshift(propTemplate);
    } else if (existingProposal?.template && typeof existingProposal.template === 'string' && existingProposal.templateName && !list.some((t: any) => t._id === existingProposal.template)) {
      list.unshift({ _id: existingProposal.template, name: existingProposal.templateName });
    }
    return list;
  }, [proposalTemplates, existingProposal?.template, existingProposal?.templateName]);

  // Dynamic Document Blocks State
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setBlocks([]);
      setHeaderImage('');
      setFooterImage('');
      setTermsInfo({ footnote: '', validity: '', paymentTerms: '', note: '' });
      setDiscountPercent(0);
      setValidForDays(10);
      return;
    }

    let t = (proposalTemplates || []).find((pt: any) => pt._id === templateId);
    try {
      const res = await api.get(`/proposal-templates/${templateId}`);
      if (res.data?.data) {
        t = res.data.data;
      }
    } catch {
      // fallback to in-memory template
    }

    if (t) {
      if (t.name) setTemplateName(t.name);
      if (t.title) setTemplateTitle(t.title);
      if (t.validForDays) setValidForDays(Number(t.validForDays) || 10);
      if (t.discount !== undefined && t.discount !== null) setDiscountPercent(Number(t.discount) || 0);
      if (t.terms) setTermsInfo(prev => ({ ...prev, footnote: t.terms, note: t.terms }));
      setHeaderImage(t.templateImage || '');
      setFooterImage(t.templateFooterImage || '');
      if (t.companyInfo) {
        setCompanyInfo({
          name: t.companyInfo.name || '',
          addressLine1: t.companyInfo.addressLine1 || '',
          addressLine2: t.companyInfo.addressLine2 || '',
          contactNo: t.companyInfo.contactNo || '',
          email: t.companyInfo.email || ''
        });
      }
      if (t.senderEmail) setSenderEmail(t.senderEmail);
      if (t.senderPhone) setSenderPhone(t.senderPhone);

      // Prefer the full saved document structure (text containers + tables + order).
      if (Array.isArray(t.blocks) && t.blocks.length > 0) {
        const parsedBlocks = t.blocks.map((b: any, bIdx: number) => ({
          id: b.id || `block-${Date.now()}-${bIdx}`,
          type: b.type || (b.items ? 'table' : 'text'),
          title: b.title || '',
          content: normalizeColonTableToTabular(b.content || ''),
          pageBreak: Boolean(b.pageBreak) ? true : undefined,
          discountPercent: Number(b.discountPercent) || 0,
          discountType: (b.discountType === 'amount' ? 'amount' : 'percent') as 'percent' | 'amount',
          items: Array.isArray(b.items)
            ? b.items.map((it: any, iIdx: number) => ({
                id: it.id || Date.now() + iIdx,
                type: it.type || 'item',
                no: it.no || iIdx + 1,
                description: it.description || '',
                qty: Number(it.qty) || 1,
                unitPrice: Number(it.unitPrice) || 0
              }))
            : undefined
        }));
        setBlocks(parsedBlocks as DocumentBlock[]);
      } else {
        const newBlocks: DocumentBlock[] = [];
        if (Array.isArray(t.items) && t.items.length > 0) {
          newBlocks.push({
            id: `template_items_block_${Date.now()}`,
            type: 'table',
            title: t.title || 'Scope of Work & Pricing',
            items: t.items.map((it: any, idx: number) => ({
              id: Date.now() + idx,
              type: 'item',
              no: it.no || idx + 1,
              description: it.description || '',
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0
            }))
          });
        }
        if (t.terms && typeof t.terms === 'string') {
          newBlocks.push({
            id: `template_terms_block_${Date.now() + 1}`,
            type: 'text',
            title: 'Terms & Conditions',
            content: normalizeColonTableToTabular(t.terms.replace(/\n/g, '<br/>'))
          });
        }
        setBlocks(newBlocks);
      }
      if (t.overallTotal) {
        setOverallTotalConfig({
          show: Boolean(t.overallTotal.show === true),
          label: t.overallTotal.label || 'Overall Quotation Total:',
          notes: t.overallTotal.notes || '',
          showWords: t.overallTotal.showWords !== false,
        });
      } else {
        setOverallTotalConfig({
          show: false,
          label: 'Overall Quotation Total:',
          notes: '',
          showWords: true,
        });
      }
      toast.success(`Template "${t.name}" loaded into document!`);
    }
  };

  const { data: systemSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data?.data || res.data || null;
    }
  });

  const {
    companyName,
    brandColor,
    country,
    proposalWatermark,
    headingFont,
    contentFont,
    headingFontName,
    contentFontName,
    headingFontUrl,
    contentFontUrl,
    proposalNo: storeProposalNo,
    proposalIncludeDate: storeProposalIncludeDate,
  } = useThemeStore();
  const { user: currentUser } = useAuthStore();
  const brand = brandColor || 'var(--brand, #722580)';

  const commonDocStyles = useMemo(() => getCommonDocumentStyles({
    headingFont,
    contentFont,
    headingFontName,
    contentFontName,
    headingFontUrl,
    contentFontUrl,
    brandColor: brandColor || '#6d28d9',
  }), [
    brandColor,
    headingFont,
    contentFont,
    headingFontName,
    contentFontName,
    headingFontUrl,
    contentFontUrl,
  ]);

  const handleTaskSelect = async (task: any) => {
    if (!task) return;
    setSelectedTaskId(task._id);

    let t = task;
    if (task._id && (!task.customer?.email && !task.lead?.phone)) {
      try {
        const res = await api.get(`/tasks/${task._id}`);
        if (res.data?.data) t = res.data.data;
      } catch {
        // fallback to task
      }
    }

    if (t.customer) {
      setCustomerType('existing');
      const cust = t.customer;
      const custId = cust._id || cust;
      setSelectedCustomerId(custId);
      setSelectedLeadId('');
      const custEmail = cust.email || cust.primaryContactInfo?.email || '';
      const custPhone = cust.phone || cust.primaryContactInfo?.mobile || '';
      const custAddr = cust.address || cust.companyInfo?.fullAddress || '';
      const custAddr2 = cust.companyInfo?.locationArea || cust.location || '';
      const custComp = cust.name || cust.companyName || cust.companyInfo?.customerName || '';
      const custContact = cust.contact || cust.primaryContactInfo?.contactName1 || cust.primaryContactInfo?.contactName2 || '';
      setClientInfo({
        company: custComp,
        contactName: custContact,
        address1: custAddr,
        address2: custAddr2,
        phone: custPhone,
        whatsapp: custPhone,
        email: custEmail
      });
      if (custEmail) setToEmailTags([custEmail]);
      toast.success(`Task ${t.taskNo || ''} customer details loaded`);
    } else if (t.lead) {
      setCustomerType('lead');
      const lead = t.lead;
      const lId = lead._id || lead;
      setSelectedLeadId(lId);
      setSelectedCustomerId('');
      const leadEmail = lead.email || '';
      const leadPhone = lead.phone || '';
      const leadAddr1 = lead.fullAddress || lead.locationArea || '';
      const leadAddr2 = lead.locationArea && lead.fullAddress ? lead.locationArea : '';
      const leadComp = lead.companyName || lead.name || '';
      const leadContact = lead.companyName ? lead.name : (lead.contactPerson || '');
      setClientInfo({
        company: leadComp,
        contactName: leadContact,
        address1: leadAddr1,
        address2: leadAddr2,
        phone: leadPhone,
        whatsapp: leadPhone,
        email: leadEmail
      });
      if (leadEmail) setToEmailTags([leadEmail]);
      if (lead.interestedProduct || lead.requirementDescription || t.title) {
        setSelectedService(lead.interestedProduct || lead.requirementDescription || t.title || 'Service Quotation');
      }
      toast.success(`Task ${t.taskNo || ''} lead details loaded`);
    } else if (t.ticket) {
      setCustomerType('task');
      setSelectedCustomerId('');
      setSelectedLeadId('');
      const ticket = t.ticket;
      const ticketEmail = ticket.mailId || '';
      const ticketPhone = ticket.phoneNumber || '';
      const ticketComp = ticket.contactPerson || ticket.title || ticket.subject || 'Ticket Client';
      const ticketContact = ticket.contactPerson || '';
      setClientInfo({
        company: ticketComp,
        contactName: ticketContact,
        address1: '',
        address2: '',
        phone: ticketPhone,
        whatsapp: ticketPhone,
        email: ticketEmail
      });
      if (ticketEmail) setToEmailTags([ticketEmail]);
      toast.success(`Task ${t.taskNo || ''} ticket client details loaded`);
    } else {
      setCustomerType('task');
      setSelectedCustomerId('');
      setSelectedLeadId('');
      setClientInfo({
        company: t.title || 'General Task Client',
        contactName: '',
        address1: '',
        address2: '',
        phone: '',
        whatsapp: '',
        email: ''
      });
      toast.success(`Task ${t.taskNo || ''} details loaded`);
    }
  };

  const handleCustomerSelect = (cust: any) => {
    if (!cust) return;
    const custEmail = cust.email || cust.primaryContactInfo?.email || '';
    const custContact = cust.contact || cust.primaryContactInfo?.contactName1 || cust.primaryContactInfo?.contactName2 || '';
    setClientInfo({
      company: cust.name || cust.companyInfo?.customerName || '',
      contactName: custContact,
      address1: cust.address || cust.companyInfo?.fullAddress || '',
      address2: cust.companyInfo?.locationArea || '',
      phone: cust.phone || cust.primaryContactInfo?.mobile || '',
      whatsapp: cust.phone || cust.primaryContactInfo?.mobile || '',
      email: custEmail
    });
    if (custEmail) {
      setToEmailTags([custEmail]);
    }
    toast.success(`Customer details loaded`);
  };

  const handleLeadSelect = (lead: any) => {
    if (!lead) return;
    const leadEmail = lead.email || '';
    const leadContact = lead.companyName ? lead.name : (lead.contactPerson || '');
    setClientInfo({
      company: lead.companyName || lead.name || '',
      contactName: leadContact,
      address1: lead.fullAddress || lead.locationArea || '',
      address2: lead.locationArea && lead.fullAddress ? lead.locationArea : '',
      phone: lead.phone || '',
      whatsapp: lead.phone || '',
      email: leadEmail
    });
    if (leadEmail) {
      setToEmailTags([leadEmail]);
    }
    if (lead.interestedProduct || lead.requirementDescription) {
      setSelectedService(lead.interestedProduct || lead.requirementDescription || 'Service Quotation');
    }
    toast.success(`Lead ${lead.leadId || ''} details loaded`);
  };

  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    company: '',
    contactName: '',
    address1: '',
    address2: '',
    phone: '',
    whatsapp: '',
    email: ''
  });

  const effectiveProposalNo = systemSettings?.nextProposalNo || systemSettings?.proposalNo || storeProposalNo || 'WT-Q1001';
  const effectiveIncludeDate = systemSettings?.proposalIncludeDate !== undefined
    ? Boolean(systemSettings.proposalIncludeDate)
    : (storeProposalIncludeDate !== undefined ? Boolean(storeProposalIncludeDate) : false);

  const [quotationDetails, setQuotationDetails] = useState({
    quoteNo: paramProposalNo
      ? paramProposalNo
      : (!isTemplateMode && !isEditMode)
      ? (systemSettings?.nextProposalNo || buildProposalNumber(effectiveProposalNo, effectiveIncludeDate, todayStr))
      : '',
    quoteDate: paramQuoteDate
      ? (isNaN(new Date(paramQuoteDate).getTime()) ? todayStr : new Date(paramQuoteDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
      : todayStr,
    validUntil: validUntilStr
  });

  // Query fresh next proposal number from backend based on proposals in DB
  const { data: nextProposalNumberData } = useQuery({
    queryKey: ['proposals-next-number', todayStr],
    queryFn: async () => {
      const res = await api.get('/proposals/next-number', { params: { date: todayStr } });
      return res.data?.data || null;
    },
    enabled: !isEditMode && !isTemplateMode && !paramProposalNo,
    staleTime: 0,
  });

  // Dynamically sync quoteNo from backend nextProposalNo or Admin Settings proposalNo if not editing existing proposal
  useEffect(() => {
    if (!isEditMode && !isTemplateMode) {
      if (paramProposalNo) {
        return;
      }
      const serverNext = nextProposalNumberData?.nextProposalNo || systemSettings?.nextProposalNo;
      if (serverNext) {
        setQuotationDetails((prev) => {
          const prevBase = stripDateSuffix(prev.quoteNo);
          const settingsBase = stripDateSuffix(systemSettings?.proposalNo || storeProposalNo || '');
          if (!prev.quoteNo || prevBase === settingsBase || /^WT-Q/i.test(prev.quoteNo) || prev.quoteNo.startsWith('PROP-')) {
            return {
              ...prev,
              quoteNo: serverNext
            };
          }
          return prev;
        });
      } else if (systemSettings?.proposalNo || storeProposalNo) {
        const activeNo = systemSettings?.proposalNo || storeProposalNo || 'WT-Q1001';
        const activeIncludeDate = systemSettings?.proposalIncludeDate !== undefined
          ? Boolean(systemSettings.proposalIncludeDate)
          : Boolean(storeProposalIncludeDate);
        setQuotationDetails((prev) => {
          const prevBase = stripDateSuffix(prev.quoteNo);
          const settingsBase = stripDateSuffix(activeNo);
          if (!prev.quoteNo || prevBase === settingsBase || /^WT-Q/i.test(prev.quoteNo) || prev.quoteNo.startsWith('PROP-')) {
            return {
              ...prev,
              quoteNo: buildProposalNumber(activeNo, activeIncludeDate, prev.quoteDate || todayStr)
            };
          }
          return prev;
        });
      }
    }
  }, [nextProposalNumberData?.nextProposalNo, systemSettings?.nextProposalNo, systemSettings?.proposalNo, systemSettings?.proposalIncludeDate, storeProposalNo, storeProposalIncludeDate, isEditMode, isTemplateMode]);

  const [revisionReason, setRevisionReason] = useState<string>('');
  const [ccEmailTags, setCcEmailTags] = useState<string[]>(() => {
    const paramCc = searchParams.get('cc');
    if (paramCc) {
      return paramCc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  });
  const [ccEmailInput, setCcEmailInput] = useState<string>('');
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('');
  const [senderEmail, setSenderEmail] = useState<string>(() => currentUser?.email || systemSettings?.companyEmail || 'sales@welcometech.qa');
  const [senderPhone, setSenderPhone] = useState<string>(() => currentUser?.phone || systemSettings?.companyPhone || '+97466032346');

  // Sync cc from searchParams if navigated with ?cc= parameter
  useEffect(() => {
    if (!isEditMode) {
      const paramCc = searchParams.get('cc');
      if (paramCc) {
        const parsed = paramCc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        if (parsed.length > 0) {
          setCcEmailTags(prev => {
            const merged = [...prev];
            parsed.forEach(p => { if (!merged.includes(p)) merged.push(p); });
            return merged;
          });
        }
      }
    }
  }, [searchParams, isEditMode]);

  // Keep senderEmail / senderPhone populated from currentUser if creating quotation
  useEffect(() => {
    if (!isEditMode) {
      if (!senderEmail) setSenderEmail(currentUser?.email || systemSettings?.companyEmail || 'sales@welcometech.qa');
      if (!senderPhone) setSenderPhone(currentUser?.phone || systemSettings?.companyPhone || '+97466032346');
    }
  }, [currentUser?.email, currentUser?.phone, systemSettings?.companyEmail, systemSettings?.companyPhone, isEditMode]);

  const getSenderSignoff = () => {
    const senderName = currentUser?.name || companyInfo?.name || companyName || 'Welcome Tech CRM';
    const sPhone = senderPhone || currentUser?.phone || companyInfo?.contactNo || '';
    const sEmail = senderEmail || currentUser?.email || companyInfo?.email || '';
    return [
      'Thanks & Best Regards',
      senderName,
      sPhone ? `Phone: ${sPhone}` : '',
      sEmail ? `Email: ${sEmail}` : '',
    ].filter(Boolean).join('\n');
  };

  const [emailSubject, setEmailSubject] = useState<string>(`Quotation Proposal ${quotationDetails.quoteNo}`);
  const [emailBody, setEmailBody] = useState<string>(() => {
    const senderName = currentUser?.name || companyName || 'Welcome Tech CRM';
    const sPhone = currentUser?.phone || '';
    const sEmail = currentUser?.email || '';
    const signoff = [
      'Thanks & Best Regards',
      senderName,
      sPhone ? `Phone: ${sPhone}` : '',
      sEmail ? `Email: ${sEmail}` : '',
    ].filter(Boolean).join('\n');
    return `Dear Valued Customer,\n\nPlease find attached our quotation proposal ${quotationDetails.quoteNo}.\n\nThank you for choosing our services.\n\n${signoff}`;
  });

  // Sync email subject and body dynamically when quotationDetails.quoteNo updates
  useEffect(() => {
    if (quotationDetails.quoteNo) {
      setEmailSubject(`Quotation Proposal ${quotationDetails.quoteNo}`);
      setEmailBody((prev) => {
        if (!prev || prev.includes('Quotation Proposal') || prev.includes('quotation proposal')) {
          return `Dear Valued Customer,\n\nPlease find attached our quotation proposal ${quotationDetails.quoteNo}.\n\nThank you for choosing our services.\n\n${getSenderSignoff()}`;
        }
        return prev;
      });
    }
  }, [quotationDetails.quoteNo, senderEmail, senderPhone]);

  const handleEmailTemplateSelect = (templateId: string) => {
    setSelectedEmailTemplateId(templateId);
    if (!templateId) return;
    const found = (emailTemplates || []).find((t: any) => t._id === templateId);
    if (!found) return;

    const resolvedQuoteNo = quotationDetails.quoteNo || 'QUOTATION';
    const clientName = clientInfo.company || 'Valued Customer';
    const grandTotal = calculateTotal();
    const currencyStr = getActiveCurrency();

    // Fill merge tags in subject and body
    const applyTokens = (str: string) => {
      if (!str) return '';
      return str
        .replace(/{{contact_person}}/gi, clientName)
        .replace(/{{org_name}}/gi, clientName)
        .replace(/{{customer_name}}/gi, clientName)
        .replace(/{{company_name}}/gi, companyName || 'Welcome Trading Co. w.l.l')
        .replace(/{{quote_no}}/gi, resolvedQuoteNo)
        .replace(/{{proposal_no}}/gi, resolvedQuoteNo)
        .replace(/{{grand_total}}/gi, `${currencyStr} ${grandTotal.toLocaleString()}`)
        .replace(/{{product}}/gi, selectedService || 'Services');
    };

    if (found.subject) {
      setEmailSubject(applyTokens(found.subject));
    }
    if (found.body) {
      // If template body has HTML markup, convert simple breaks or keep text
      const cleanBody = found.body
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      setEmailBody(applyTokens(cleanBody || found.body));
    }
    toast.success(`Applied template: ${found.name}`);
  };

  // ── TO EMAIL tags ────────────────────────────────────────────
  const [toEmailTags, setToEmailTags] = useState<string[]>([]);
  const [toEmailInput, setToEmailInput] = useState<string>('');

  const addToEmailTag = (raw: string) => {
    const emails = raw.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.length > 0 && e.includes('@'));
    if (emails.length === 0) return;
    setToEmailTags(prev => {
      const merged = [...prev];
      emails.forEach(e => { if (!merged.includes(e)) merged.push(e); });
      return merged;
    });
    // Keep clientInfo.email in sync with primary recipient for document display
    setClientInfo(ci => ({ ...ci, email: emails[0] }));
    setToEmailInput('');
  };

  const removeToEmailTag = (idx: number) => {
    const updated = toEmailTags.filter((_, i) => i !== idx);
    setToEmailTags(updated);
    // Keep the two setState calls at top level — never nest a setter inside another updater.
    setClientInfo(ci => ({ ...ci, email: updated[0] || '' }));
  };

  // ── CC EMAIL tags ─────────────────────────────────────────────
  // Helper: add current ccEmailInput as a tag (on comma or Enter)
  const addCcEmailTag = (raw: string) => {
    const emails = raw.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.length > 0 && e.includes('@'));
    if (emails.length === 0) return;
    setCcEmailTags(prev => {
      const merged = [...prev];
      emails.forEach(e => { if (!merged.includes(e)) merged.push(e); });
      return merged;
    });
    setCcEmailInput('');
  };

  const removeCcEmailTag = (idx: number) => {
    setCcEmailTags(prev => prev.filter((_, i) => i !== idx));
  };

  // Derived: cc as comma string for API / mailto
  const ccEmailString = ccEmailTags.join(', ');

  const handleSendEmail = async () => {
    if (toEmailTags.length === 0 && !toEmailInput.trim()) {
      toast.error('At least one recipient email address is required');
      return;
    }
    // Build recipient lists synchronously — setState is async, so reading toEmailTags/
    // ccEmailTags right after calling the add* setters would use stale (pre-update) values.
    const toList = mergeEmailRecipients(toEmailTags, toEmailInput);
    const ccList = mergeEmailRecipients(ccEmailTags, ccEmailInput);
    // Reflect the flushed inputs in the UI too.
    if (toEmailInput.trim()) addToEmailTag(toEmailInput);
    if (ccEmailInput.trim()) addCcEmailTag(ccEmailInput);
    if (toList.length === 0) {
      toast.error('At least one valid recipient email address is required');
      return;
    }
    const to = toList.join(', ');
    const cc = ccList.length > 0 ? ccList.join(', ') : undefined;

    const proposalItems = blocks
      .filter(b => b.type === 'table')
      .flatMap(b => (b.items || []).filter(i => i.type === 'item' && i.description.trim() !== ''))
      .map(i => ({
        description: i.description.trim(),
        qty: Number(i.qty) || 1,
        unitPrice: Number(i.unitPrice) || 0,
        total: (Number(i.qty) || 1) * (Number(i.unitPrice) || 0)
      }));

    const activeIncludeDate = systemSettings?.proposalIncludeDate !== undefined
      ? Boolean(systemSettings.proposalIncludeDate)
      : Boolean(storeProposalIncludeDate);
    const rawQuote = quotationDetails.quoteNo.trim()
      || systemSettings?.proposalNo
      || storeProposalNo
      || 'WT-Q1001';
    const resolvedQuoteNo = buildProposalNumber(
      rawQuote,
      activeIncludeDate,
      quotationDetails.quoteDate
    );
    const grandSubtotal = blocks.reduce((acc, block) => acc + calculateBlockSubtotal(block), 0);
    const calculatedTotal = calculateTotal();
    const effectiveDiscount = grandSubtotal > 0
      ? Math.round(((grandSubtotal - calculatedTotal) / grandSubtotal) * 100 * 100) / 100
      : 0;

    const formatSafeIsoDate = (val?: string | null): string => {
      if (!val) return new Date().toISOString();
      const trimmed = val.trim();
      const ymd = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (ymd) {
        return `${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00.000Z`;
      }
      const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const m = dmy[2].padStart(2, '0');
        const y = dmy[3];
        return `${y}-${m}-${d}T12:00:00.000Z`;
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}T12:00:00.000Z`;
      }
      return new Date().toISOString();
    };

    const resolvedQuoteDate = formatSafeIsoDate(quotationDetails.quoteDate);

    const resolvedValidUntil = quotationDetails.validUntil && !isNaN(new Date(quotationDetails.validUntil).getTime())
      ? new Date(quotationDetails.validUntil).toISOString()
      : new Date(Date.now() + (validForDays || 7) * 24 * 60 * 60 * 1000).toISOString();

    const sanitizedTemplateId = selectedTemplateId && selectedTemplateId.trim()
      ? selectedTemplateId.trim()
      : undefined;

    const payload = {
      id: isEditMode ? id : undefined,
      proposalNo: quotationDetails.quoteNo ? resolvedQuoteNo : undefined,
      to,
      cc,
      subject: emailSubject,
      messageBody: emailBody,
      customerType,
      customer: customerType === 'existing' ? selectedCustomerId : undefined,
      lead: customerType === 'lead' ? (selectedLeadId || leadId || undefined) : undefined,
      template: sanitizedTemplateId,
      templateName: sanitizedTemplateId ? (proposalTemplates?.find((pt: any) => pt._id === sanitizedTemplateId)?.name || templateName) : undefined,
      customerName: clientInfo.company,
      customerContactPerson: clientInfo.contactName || undefined,
      customerDetails: {
        companyName: clientInfo.company,
        contactName: clientInfo.contactName || '',
        contactPerson: clientInfo.contactName || '',
        addressLine1: clientInfo.address1,
        addressLine2: clientInfo.address2,
        phone: clientInfo.phone,
        email: clientInfo.email,
      },
      customerPhone: clientInfo.phone,
      customerEmail: clientInfo.email,
      customerAddress: `${clientInfo.address1} ${clientInfo.address2}`.trim(),
      companyInfo,
      senderEmail: senderEmail.trim(),
      senderPhone: senderPhone.trim(),
      senderName: currentUser?.name || undefined,
      title: `${selectedService} Quotation (${resolvedQuoteNo})`,
      quoteDate: resolvedQuoteDate,
      proposalDate: resolvedQuoteDate,
      validUntil: resolvedValidUntil,
      discount: effectiveDiscount,
      items: proposalItems,
      subtotal: grandSubtotal,
      total: calculatedTotal,
      terms: `${termsInfo.validity}\n${termsInfo.paymentTerms}\n${termsInfo.note}`,
      templateImage: headerImage || '',
      templateFooterImage: footerImage || '',
      blocks,
    };

    try {
      await api.post('/proposals/send-direct', payload);
      toast.success(`Proposal email sent to ${to}${cc ? ` (CC: ${cc})` : ''}!`);
      setShareModal({ isOpen: false, type: null });
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (id) queryClient.invalidateQueries({ queryKey: ['proposal', id] });

      const targetTaskId = selectedTaskId || taskId;
      if (targetTaskId) {
        setTimeout(() => {
          navigate(`/tasks?followUpTaskId=${targetTaskId}`);
        }, 500);
      }
    } catch (e: any) {
      console.error('Failed to send proposal email directly:', e);
      const errorMsg = e?.response?.data?.message;
      if (errorMsg) {
        toast.error(errorMsg);
      } else {
        const mailtoUrl = `mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc || '')}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        window.open(mailtoUrl, '_blank');
        toast.success(`Opened email client for ${to}${cc ? ` (CC: ${cc})` : ''}`);
        setShareModal({ isOpen: false, type: null });
        const targetTaskId = selectedTaskId || taskId;
        if (targetTaskId) {
          setTimeout(() => {
            navigate(`/tasks?followUpTaskId=${targetTaskId}`);
          }, 600);
        }
      }
    }
  };

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: 'WelcomeTech CRM',
    addressLine1: '',
    addressLine2: '',
    contactNo: '',
    email: ''
  });

  useEffect(() => {
    if (systemSettings || companyName) {
      setCompanyInfo(prev => ({
        name: systemSettings?.companyName || companyName || prev.name || 'WelcomeTech CRM',
        addressLine1: systemSettings?.companyAddressLine1 || systemSettings?.companyAddress || prev.addressLine1 || '',
        addressLine2: systemSettings?.companyAddressLine2 || prev.addressLine2 || '',
        contactNo: systemSettings?.companyPhone || prev.contactNo || '',
        email: systemSettings?.companyEmail || systemSettings?.senderEmail || prev.email || '',
      }));
    }
  }, [systemSettings, companyName]);

  const [termsInfo, setTermsInfo] = useState<TermsInfo>({
    footnote: '',
    validity: '',
    paymentTerms: '',
    note: ''
  });

  const [selectedService, setSelectedService] = useState('Service Quotation');
  // page waiting for delete confirmation (themed dialog), by 0-based index
  const [pageToDelete, setPageToDelete] = useState<number | null>(null);
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; type: 'whatsapp' | 'email' | null }>({
    isOpen: false,
    type: null
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [resetStatus, setResetStatus] = useState<'idle' | 'confirm'>('idle');

  // Header & Footer Image upload states
  const [headerImage, setHeaderImage] = useState<string>('');
  const [footerImage, setFooterImage] = useState<string>('');
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<'header' | 'footer' | null>(null);
  
  // Valid For (Days) & Discount (%) state
  const [validForDays, setValidForDays] = useState<number>(10);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [quoteStatus, setQuoteStatus] = useState<string>('draft');

  // Overall Quotation Total summary settings & edit state
  const [overallTotalConfig, setOverallTotalConfig] = useState<OverallTotalConfig>({
    show: false,
    label: 'Overall Quotation Total:',
    notes: '',
    showWords: true,
  });
  const [isEditingOverallTotal, setIsEditingOverallTotal] = useState(false);

  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState<string>('');
  const [templateTitle, setTemplateTitle] = useState<string>('');

  useEffect(() => {
    if (existingTemplate) {
      if (existingTemplate.name) setTemplateName(existingTemplate.name);
      if (existingTemplate.title) setTemplateTitle(existingTemplate.title);
      if (existingTemplate.validForDays) {
        const days = Number(existingTemplate.validForDays) || 10;
        setValidForDays(days);
      }
      if (existingTemplate.discount !== undefined && existingTemplate.discount !== null) {
        setDiscountPercent(Number(existingTemplate.discount) || 0);
      }
      if (existingTemplate.status) setQuoteStatus(existingTemplate.status);
      if (existingTemplate.overallTotal) {
        setOverallTotalConfig({
          show: Boolean(existingTemplate.overallTotal.show === true),
          label: existingTemplate.overallTotal.label || 'Overall Quotation Total:',
          notes: existingTemplate.overallTotal.notes || '',
          showWords: existingTemplate.overallTotal.showWords !== false,
        });
      } else {
        setOverallTotalConfig({
          show: false,
          label: 'Overall Quotation Total:',
          notes: '',
          showWords: true,
        });
      }
      if (existingTemplate.terms) {
        setTermsInfo(prev => ({ ...prev, footnote: existingTemplate.terms, note: existingTemplate.terms }));
      }
      setHeaderImage(existingTemplate.templateImage || '');
      setFooterImage(existingTemplate.templateFooterImage || '');
      if (existingTemplate.companyInfo) {
        setCompanyInfo({
          name: existingTemplate.companyInfo.name || '',
          addressLine1: existingTemplate.companyInfo.addressLine1 || '',
          addressLine2: existingTemplate.companyInfo.addressLine2 || '',
          contactNo: existingTemplate.companyInfo.contactNo || '',
          email: existingTemplate.companyInfo.email || ''
        });
      }
      if ((existingTemplate as any).senderEmail) {
        setSenderEmail((existingTemplate as any).senderEmail);
      }
      if ((existingTemplate as any).senderPhone) {
        setSenderPhone((existingTemplate as any).senderPhone);
      }

      // Load blocks: prefer saved blocks structure, else build from items
      const hasBlocks = Array.isArray(existingTemplate.blocks) && existingTemplate.blocks.length > 0;
      const hasItems = Array.isArray(existingTemplate.items) && existingTemplate.items.length > 0;

      if (hasBlocks) {
        // Ensure each block has required fields
        const parsedBlocks = (existingTemplate.blocks as any[]).map((b: any, bIdx: number) => ({
          id: b.id || `block-${Date.now()}-${bIdx}`,
          type: b.type || (Array.isArray(b.items) && b.items.length > 0 ? 'table' : 'text'),
          title: b.title || '',
          content: normalizeColonTableToTabular(b.content || ''),
          pageBreak: Boolean(b.pageBreak) ? true : undefined,
          discountPercent: Number(b.discountPercent) || 0,
          discountType: (b.discountType === 'amount' ? 'amount' : 'percent') as 'percent' | 'amount',
          items: Array.isArray(b.items)
            ? b.items.map((it: any, iIdx: number) => ({
                id: it.id || Date.now() + iIdx,
                type: it.type || 'item',
                no: it.no || iIdx + 1,
                description: it.description || '',
                qty: Number(it.qty) || 1,
                unitPrice: Number(it.unitPrice) || 0
              }))
            : undefined
        }));
        setBlocks(parsedBlocks as DocumentBlock[]);
      } else if (hasItems) {
        // Legacy templates — rebuild a single table block from items.
        setBlocks([
          {
            id: `template_items_block_${Date.now()}`,
            type: 'table',
            title: existingTemplate.title || 'Scope of Work & Pricing',
            items: (existingTemplate.items as any[]).map((it: any, idx: number) => ({
              id: Date.now() + idx,
              type: 'item',
              no: it.no || idx + 1,
              description: it.description || '',
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0
            }))
          }
        ]);
      }
    }
  }, [existingTemplate]);

  useEffect(() => {
    if (existingProposal) {
      setHeaderImage(existingProposal.templateImage || '');
      setFooterImage(existingProposal.templateFooterImage || '');
      if (existingProposal.companyInfo) {
        setCompanyInfo({
          name: existingProposal.companyInfo.name || '',
          addressLine1: existingProposal.companyInfo.addressLine1 || '',
          addressLine2: existingProposal.companyInfo.addressLine2 || '',
          contactNo: existingProposal.companyInfo.contactNo || '',
          email: existingProposal.companyInfo.email || ''
        });
      }
      if (existingProposal.senderEmail) {
        setSenderEmail(existingProposal.senderEmail);
      } else if (existingProposal.createdBy && typeof existingProposal.createdBy === 'object' && (existingProposal.createdBy as any).email) {
        setSenderEmail((existingProposal.createdBy as any).email);
      } else if (currentUser?.email) {
        setSenderEmail(currentUser.email);
      } else if (existingProposal.companyInfo?.email) {
        setSenderEmail(existingProposal.companyInfo.email);
      } else {
        setSenderEmail(systemSettings?.companyEmail || 'sales@welcometech.qa');
      }

      if (existingProposal.senderPhone) {
        setSenderPhone(existingProposal.senderPhone);
      } else if (existingProposal.createdBy && typeof existingProposal.createdBy === 'object' && (existingProposal.createdBy as any).phone) {
        setSenderPhone((existingProposal.createdBy as any).phone);
      } else if (currentUser?.phone) {
        setSenderPhone(currentUser.phone);
      } else if (existingProposal.companyInfo?.contactNo) {
        setSenderPhone(existingProposal.companyInfo.contactNo);
      } else {
        setSenderPhone(systemSettings?.companyPhone || '+97466032346');
      }
      if (existingProposal.status) setQuoteStatus(existingProposal.status);

      // Extract service name from existing proposal title if present
      if (existingProposal.title) {
        const match = existingProposal.title.match(/^(.*?)\s+Quotation\s*\(/i) || existingProposal.title.match(/^(.*?)\s+Proposal\s*\(/i);
        if (match && match[1]) {
          setSelectedService(match[1].trim());
        } else if (!existingProposal.title.startsWith('PROP-') && !existingProposal.title.startsWith('PR-')) {
          setSelectedService(existingProposal.title.replace(/\s*\([^)]*\)\s*$/, '').trim());
        }
      }

      const pQuoteNo = existingProposal.proposalNo || existingProposal.proposalId || '';
      const pRawQuoteDate = existingProposal.quoteDate || existingProposal.proposalDate || existingProposal.createdAt;
      const existingDateSuffix = (pQuoteNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
      let pQuoteDate = todayStr;
      if (existingDateSuffix) {
        const [d, m, y] = existingDateSuffix[1].split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(m, 10) - 1] || m;
        pQuoteDate = `${d} ${monthName} ${y}`;
      } else if (pRawQuoteDate) {
        pQuoteDate = new Date(pRawQuoteDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' });
      }

      const pValidUntil = existingProposal.validUntil
        ? new Date(existingProposal.validUntil).toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' })
        : validUntilStr;

      setQuotationDetails({
        quoteNo: pQuoteNo,
        quoteDate: pQuoteDate,
        validUntil: pValidUntil
      });

      if (existingProposal.validUntil && pRawQuoteDate) {
        const diffTime = Math.abs(new Date(existingProposal.validUntil).getTime() - new Date(pRawQuoteDate).getTime());
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) setValidForDays(diffDays);
      }

      if (existingProposal.discount) {
        setDiscountPercent(Number(existingProposal.discount) || 0);
      }

      // Populate customer or lead info
      if (existingProposal.customer) {
        setCustomerType('existing');
        const custObj = typeof existingProposal.customer === 'object' ? existingProposal.customer : null;
        let custId = custObj?._id || (typeof existingProposal.customer === 'string' && existingProposal.customer.match(/^[0-9a-fA-F]{24}$/) ? existingProposal.customer : '');

        // If string customer is not an ObjectId, try to find matching customer in customers list
        if (!custId && typeof existingProposal.customer === 'string' && customers && customers.length > 0) {
          const rawName = existingProposal.customer.trim().toLowerCase();
          const matched = customers.find((c: any) =>
            c.name?.trim().toLowerCase() === rawName ||
            c.companyInfo?.customerName?.trim().toLowerCase() === rawName
          );
          if (matched) {
            custId = matched._id;
          }
        }

        setSelectedCustomerId(custId || '');
        const email = custObj?.email || custObj?.primaryContactInfo?.email || existingProposal.customerEmail || '';
        const contactName =
          existingProposal.customerContactPerson ||
          existingProposal.customerDetails?.contactName ||
          existingProposal.customerDetails?.contactPerson ||
          existingProposal.contactName ||
          custObj?.contact ||
          custObj?.primaryContactInfo?.contactName1 ||
          custObj?.primaryContactInfo?.contactName2 ||
          '';
        setClientInfo({
          company: custObj?.name || custObj?.companyInfo?.customerName || existingProposal.customerName || (typeof existingProposal.customer === 'string' ? existingProposal.customer : ''),
          contactName,
          address1: custObj?.address || custObj?.companyInfo?.fullAddress || existingProposal.customerAddress || '',
          address2: custObj?.companyInfo?.locationArea || '',
          phone: custObj?.phone || custObj?.primaryContactInfo?.mobile || existingProposal.customerPhone || '',
          whatsapp: custObj?.phone || custObj?.primaryContactInfo?.mobile || existingProposal.customerPhone || '',
          email
        });
        if (email) setToEmailTags([email]);
      } else if (existingProposal.lead) {
        setCustomerType('lead');
        const leadObj = typeof existingProposal.lead === 'object' ? existingProposal.lead : null;
        const lId = leadObj?._id || existingProposal.lead;
        setSelectedLeadId(lId);
        const email = leadObj?.email || existingProposal.customerEmail || '';
        const contactName =
          existingProposal.customerContactPerson ||
          existingProposal.customerDetails?.contactName ||
          existingProposal.customerDetails?.contactPerson ||
          existingProposal.contactName ||
          (leadObj?.companyName ? leadObj?.name : (leadObj?.contactPerson || ''));
        setClientInfo({
          company: leadObj?.companyName || leadObj?.name || existingProposal.customerName || '',
          contactName,
          address1: leadObj?.fullAddress || leadObj?.locationArea || existingProposal.customerAddress || '',
          address2: leadObj?.locationArea && leadObj?.fullAddress ? leadObj?.locationArea : '',
          phone: leadObj?.phone || existingProposal.customerPhone || '',
          whatsapp: leadObj?.phone || existingProposal.customerPhone || '',
          email
        });
        if (email) setToEmailTags([email]);
      } else {
        const email = existingProposal.customerEmail || '';
        const contactName =
          existingProposal.customerContactPerson ||
          existingProposal.customerDetails?.contactName ||
          existingProposal.customerDetails?.contactPerson ||
          existingProposal.contactName ||
          '';
        setClientInfo({
          company: existingProposal.customerName || '',
          contactName,
          address1: existingProposal.customerAddress || '',
          address2: '',
          phone: existingProposal.customerPhone || '',
          whatsapp: existingProposal.customerPhone || '',
          email
        });
        if (email) setToEmailTags([email]);
      }

      if (existingProposal.cc) {
        const ccTags = String(existingProposal.cc)
          .split(/[,;]+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        setCcEmailTags(ccTags);
      }

      // Populate document blocks / items
      if (Array.isArray(existingProposal.blocks) && existingProposal.blocks.length > 0) {
        const parsedBlocks = (existingProposal.blocks as any[]).map((b: any, bIdx: number) => ({
          id: b.id || `block-${Date.now()}-${bIdx}`,
          type: b.type || (Array.isArray(b.items) && b.items.length > 0 ? 'table' : 'text'),
          title: b.title || '',
          content: normalizeColonTableToTabular(b.content || ''),
          pageBreak: Boolean(b.pageBreak) ? true : undefined,
          discountPercent: Number(b.discountPercent) || 0,
          discountType: (b.discountType === 'amount' ? 'amount' : 'percent') as 'percent' | 'amount',
          items: Array.isArray(b.items)
            ? b.items.map((it: any, iIdx: number) => ({
                id: it.id || Date.now() + iIdx,
                type: it.type || 'item',
                no: it.no || iIdx + 1,
                description: it.description || '',
                qty: Number(it.qty) || 1,
                unitPrice: Number(it.unitPrice) || 0
              }))
            : undefined
        }));
        setBlocks(parsedBlocks as DocumentBlock[]);
      } else if (existingProposal.items && existingProposal.items.length > 0) {
        setBlocks([
          {
            id: 'proposal_items_block',
            type: 'table',
            title: 'Scope of Work & Pricing',
            items: existingProposal.items.map((it: any, idx: number) => ({
              id: Date.now() + idx,
              type: 'item',
              no: idx + 1,
              description: it.description || '',
              qty: it.qty || 1,
              unitPrice: it.unitPrice || 0
            }))
          }
        ]);
      } else {
        // Fallback for legacy proposals with no blocks and no items so live preview renders
        const itemAmount = Number(existingProposal.total ?? existingProposal.amount ?? 0);
        setBlocks([
          {
            id: 'proposal_items_block',
            type: 'table',
            title: 'Scope of Work & Pricing',
            discountPercent: 0,
            items: [
              {
                id: Date.now(),
                type: 'item',
                no: 1,
                description: existingProposal.title || 'Professional Services & Deliverables',
                qty: 1,
                unitPrice: itemAmount
              }
            ]
          }
        ]);
      }
      if (existingProposal.overallTotal) {
        setOverallTotalConfig({
          show: Boolean(existingProposal.overallTotal.show === true),
          label: existingProposal.overallTotal.label || 'Overall Quotation Total:',
          notes: existingProposal.overallTotal.notes || '',
          showWords: existingProposal.overallTotal.showWords !== false,
        });
      } else {
        setOverallTotalConfig({
          show: false,
          label: 'Overall Quotation Total:',
          notes: '',
          showWords: true,
        });
      }
    }
  }, [existingProposal, customers]);

  // Auto-select template if editing existing proposal
  useEffect(() => {
    if (existingProposal && !selectedTemplateId) {
      let matchedId = '';
      const propTemplateId = typeof existingProposal.template === 'object' ? existingProposal.template?._id : existingProposal.template;
      if (propTemplateId) {
        matchedId = String(propTemplateId);
      } else if (existingProposal.templateName && proposalTemplates && proposalTemplates.length > 0) {
        const found = proposalTemplates.find((pt: any) => pt.name?.trim().toLowerCase() === existingProposal.templateName?.trim().toLowerCase());
        if (found) matchedId = String(found._id);
      } else if (existingProposal.title && proposalTemplates && proposalTemplates.length > 0) {
        const found = proposalTemplates.find((pt: any) => 
          pt.name?.trim().toLowerCase() === existingProposal.title?.trim().toLowerCase() || 
          pt.title?.trim().toLowerCase() === existingProposal.title?.trim().toLowerCase()
        );
        if (found) matchedId = String(found._id);
      } else if (proposalTemplates && proposalTemplates.length > 0 && (existingProposal.items?.length || existingProposal.blocks?.length)) {
        // Match by line item description
        const firstDesc = existingProposal.items?.[0]?.description || 
          (existingProposal.blocks && existingProposal.blocks.find((b: any) => b.type === 'table')?.items?.[0]?.description);
        if (firstDesc) {
          const found = proposalTemplates.find((pt: any) =>
            pt.items?.some((it: any) => it.description && firstDesc.toLowerCase().includes(it.description.toLowerCase().trim()))
          );
          if (found) matchedId = String(found._id);
        }
      }

      if (matchedId) {
        setSelectedTemplateId(matchedId);
      }
    }
  }, [existingProposal, proposalTemplates, selectedTemplateId]);

  // Auto-select task if editing existing proposal and task is not yet selected
  useEffect(() => {
    if (existingProposal && !selectedTaskId) {
      const propTaskId = typeof existingProposal.task === 'object' ? existingProposal.task?._id : existingProposal.task;
      if (propTaskId) {
        setSelectedTaskId(String(propTaskId));
      } else if (allTasks && allTasks.length > 0) {
        const custId = typeof existingProposal.customer === 'object' ? existingProposal.customer?._id : existingProposal.customer;
        const leadId = typeof existingProposal.lead === 'object' ? existingProposal.lead?._id : existingProposal.lead;
        if (custId) {
          const matchingTask = allTasks.find((t: any) => {
            const tCustId = typeof t.customer === 'object' ? t.customer?._id : t.customer;
            return tCustId && String(tCustId) === String(custId);
          });
          if (matchingTask) {
            setSelectedTaskId(String(matchingTask._id));
          }
        } else if (leadId) {
          const matchingTask = allTasks.find((t: any) => {
            const tLeadId = typeof t.lead === 'object' ? t.lead?._id : t.lead;
            return tLeadId && String(tLeadId) === String(leadId);
          });
          if (matchingTask) {
            setSelectedTaskId(String(matchingTask._id));
          }
        }
      }
    }
  }, [existingProposal, allTasks, selectedTaskId]);

  // In create mode (new list), if selectedTaskId points to a task that has already had its proposal sent, clear selection
  useEffect(() => {
    if (!isEditMode && selectedTaskId && allTasks && allTasks.length > 0) {
      const isStillAvailable = allTasks.some((t: any) => String(t._id) === String(selectedTaskId));
      if (!isStillAvailable) {
        setSelectedTaskId('');
      }
    }
  }, [isEditMode, selectedTaskId, allTasks]);

  const handleValidForDaysChange = (days: number) => {
    setValidForDays(days);
    if (days >= 0) {
      const baseDate = quotationDetails.quoteDate ? new Date(quotationDetails.quoteDate) : new Date();
      if (!isNaN(baseDate.getTime())) {
        const validUntilDate = new Date(baseDate);
        validUntilDate.setDate(validUntilDate.getDate() + days);
        const formatted = validUntilDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        setQuotationDetails(prev => ({ ...prev, validUntil: formatted }));
      }
    }
  };

  const handleQuoteDateChange = (val: string) => {
    let formatted = val;
    let d = new Date(val);
    let isValid = false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parts = val.split('-');
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      isValid = !isNaN(d.getTime());
    } else {
      isValid = !isNaN(d.getTime());
    }

    const validUntilDate = isValid ? new Date(d) : new Date();
    validUntilDate.setDate(validUntilDate.getDate() + (validForDays || 7));
    const formattedValidUntil = validUntilDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    setQuotationDetails(prev => {
      const activeIncludeDate = systemSettings?.proposalIncludeDate !== undefined
        ? Boolean(systemSettings.proposalIncludeDate)
        : Boolean(storeProposalIncludeDate);
      const baseNo = stripDateSuffix(prev.quoteNo || systemSettings?.proposalNo || storeProposalNo || 'WT-Q1001');
      const nextQuoteNo = (!isEditMode && !isTemplateMode && activeIncludeDate)
        ? buildProposalNumber(baseNo, true, isValid ? d : val)
        : prev.quoteNo;
      return {
        ...prev,
        quoteNo: nextQuoteNo,
        quoteDate: isValid ? formatted : val,
        validUntil: formattedValidUntil
      };
    });
  };

  const getIsoQuoteDate = () => {
    const val = quotationDetails.quoteDate;
    if (!val) return '';
    const textMonth = val.match(/^(\d{1,2})[-/\s]+([A-Za-z]+)[-/\s]+(\d{4})/);
    if (textMonth) {
      const d = textMonth[1].padStart(2, '0');
      const monthNames: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const mStr = textMonth[2].slice(0, 3).toLowerCase();
      const m = monthNames[mStr];
      if (m) {
        return `${textMonth[3]}-${m}-${d}`;
      }
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  };

  // Print / PDF uses the same measured A4 renderer as View, Download PDF and the emailed PDF, built from the
  // editor's current (even unsaved) content – not a print of the editing canvas.
  const handlePrintQuotation = () => {
    toast('Tip: In the print dialog, select Margins: "None" & check "Background graphics" for full-bleed edge-to-edge.', {
      icon: '🖨️',
      duration: 5000,
    });
    const draft: any = {
      name: isTemplateMode ? (templateName || 'Proposal Template') : (quotationDetails.quoteNo || 'Quotation'),
      discount: discountPercent,
      validForDays,
      companyInfo,
      customerContactPerson: clientInfo.contactName || undefined,
      customerDetails: {
        companyName: clientInfo.company,
        contactName: clientInfo.contactName || '',
        contactPerson: clientInfo.contactName || '',
        addressLine1: clientInfo.address1,
        addressLine2: clientInfo.address2,
        phone: clientInfo.phone,
        email: clientInfo.email,
      },
      quotationDetails: {
        quoteNo: quotationDetails.quoteNo,
        quoteDate: quotationDetails.quoteDate,
        validUntil: quotationDetails.validUntil,
        senderEmail: senderEmail.trim(),
        senderPhone: senderPhone.trim(),
        proposalIncludeDate: systemSettings?.proposalIncludeDate !== undefined
          ? Boolean(systemSettings.proposalIncludeDate)
          : Boolean(storeProposalIncludeDate),
      },
      senderEmail: senderEmail.trim(),
      senderPhone: senderPhone.trim(),
      items: [],
      blocks,
      templateImage: headerImage || '',
      templateFooterImage: footerImage || '',
    };
    downloadTemplatePDF(draft, draft);
  };

  // Keyboard Shortcut: Ctrl + P / Cmd + P for Direct Quotation / Proposal Print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      handlePrintKeyboardShortcut(e, handlePrintQuotation);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    existingTemplate,
    templateName,
    templateTitle,
    discountPercent,
    validForDays,
    headerImage,
    footerImage,
    blocks,
    termsInfo,
    companyInfo,
    clientInfo,
    quotationDetails,
  ]);

  const handleAddBlock = (type: DocumentBlockType, atIndex?: number, forcePageBreak?: boolean) => {
    const newBlock: DocumentBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      title: type === 'text' ? '' : undefined,
      content: type === 'text' ? '' : undefined,
      pageBreak: forcePageBreak ? true : undefined,
      discountPercent: 0,
      discountType: 'percent',
      items: type === 'table' ? [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: '',
          qty: 1,
          unitPrice: ''
        }
      ] : undefined
    };

    setBlocks((prev) => {
      if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= prev.length) {
        const next = [...prev];
        next.splice(atIndex, 0, newBlock);
        return next;
      }
      return [...prev, newBlock];
    });

    toast.success(`${type === 'text' ? 'Text Container' : 'Tabular Column'} inserted into document`);
  };

  const handleTogglePageBreak = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, pageBreak: !b.pageBreak ? true : undefined } : b))
    );
    toast.success('A4 Page Break updated');
  };

  /** Asks (themed dialog) before deleting everything that sits on one A4 page. */
  const handleDeletePage = (pageIndex: number) => {
    const chunk = pageChunks[pageIndex];
    if (!chunk) return;
    if (pageChunks.length <= 1) {
      toast.error('A document needs at least one page');
      return;
    }
    if (chunk.slices.length === 0) {
      toast('This page has no content to delete');
      return;
    }
    setPageToDelete(pageIndex);
  };

  /** Removes the content of the confirmed page (sections that continue elsewhere only lose their part on this page). */
  const confirmDeletePage = () => {
    const pageIndex = pageToDelete;
    setPageToDelete(null);
    if (pageIndex === null) return;
    const chunk = pageChunks[pageIndex];
    if (!chunk) return;
    const result = removePageFromBlocks(blocks, pageChunks, pageIndex);
    setBlocks(result.blocks);
    toast.success(`Page ${chunk.pageNum} deleted (${result.removedBlocks} section${result.removedBlocks === 1 ? '' : 's'} removed${result.trimmedBlocks ? `, ${result.trimmedBlocks} trimmed` : ''})`);
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    toast.success('Element removed');
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    setBlocks((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleBlockTextChange = (blockId: string, field: 'title' | 'content', val: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, [field]: val } : b)));
  };

  const handleBlockSliceChange = (blockId: string, sliceIndex: number, newSliceHtml: string) => {
    setBlocks((prev) => {
      return prev.map((b) => {
        if (b.id !== blockId) return b;
        const blockSlices = pageChunks.flatMap((c) => c.slices.filter((s) => s.block.id === blockId));
        if (blockSlices.length <= 1) {
          return { ...b, content: newSliceHtml };
        }
        const updatedUnits = blockSlices.map((s, idx) => (idx === sliceIndex ? newSliceHtml : (s.contentSlice || '')));
        return {
          ...b,
          content: joinHtmlUnits(updatedUnits),
        };
      });
    });
  };

  const handleSplitBlock = (blockId: string, contentBefore: string, contentAfter: string) => {
    const newId = 'block_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const currentBlock = prev[idx];
      const updatedCurrent = {
        ...currentBlock,
        content: contentBefore || '<p><br></p>',
      };
      const newNextBlock = {
        id: newId,
        type: 'text' as const,
        title: currentBlock.title ? `${currentBlock.title} (Continued)` : '',
        content: contentAfter || '<p><br></p>',
        pageBreak: true, // Forces next page in MS Word style!
      };
      const copy = [...prev];
      copy.splice(idx, 1, updatedCurrent, newNextBlock);
      return copy;
    });

    let attempts = 0;
    const focusNewBlock = () => {
      const newEl = document.querySelector<HTMLDivElement>(`[data-block-id="${newId}"]`);
      if (newEl) {
        newEl.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(newEl);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(focusNewBlock, 40);
      }
    };
    setTimeout(focusNewBlock, 40);

    toast.success('Page break inserted (Moved to next page)');
  };

  const handleBlockAddItem = (blockId: string) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.items) return b;
      const mainItemsCount = b.items.filter(i => i.type === 'item').length;
      return {
        ...b,
        items: [
          ...b.items,
          {
            id: Date.now(),
            type: 'item',
            no: mainItemsCount + 1,
            description: '',
            qty: 1,
            unitPrice: ''
          }
        ]
      };
    }));
  };

  const handleBlockAddDetailLine = (blockId: string) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.items) return b;
      return {
        ...b,
        items: [
          ...b.items,
          {
            id: Date.now(),
            type: 'detail',
            description: 'Specification / detail line',
            qty: '',
            unitPrice: ''
          }
        ]
      };
    }));
  };

  const handleBlockRemoveItem = (blockId: string, itemId: number) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.items) return b;
      const updated = b.items.filter(i => i.id !== itemId);
      let currentNo = 1;
      const renumbered = updated.map(item => {
        if (item.type === 'item') {
          return { ...item, no: currentNo++ };
        }
        return item;
      });
      return { ...b, items: renumbered };
    }));
  };

  const handleBlockItemFieldChange = (blockId: string, itemId: number, field: keyof QuotationItem, val: any) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.items) return b;
      return {
        ...b,
        items: b.items.map(item => item.id === itemId ? { ...item, [field]: val } : item)
      };
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'header' | 'footer') => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          if (target === 'header') setHeaderImage(reader.result);
          else setFooterImage(reader.result);
          toast.success(`${target === 'header' ? 'Header' : 'Footer'} image uploaded`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Populate client from task, customer selection, or lead param
  useEffect(() => {
    if (!isTemplateMode && isEditMode) return;
    if (taskData) {
      setCustomerType('task');
      setSelectedTaskId(taskData._id);
      handleTaskSelect(taskData);
    } else if (customerId && customers?.length) {
      const found = customers.find((c: any) => c._id === customerId);
      if (found) {
        setCustomerType('existing');
        setSelectedCustomerId(found._id);
        const foundEmail = found.email || found.primaryContactInfo?.email || '';
        const foundContact = found.contact || found.primaryContactInfo?.contactName1 || found.primaryContactInfo?.contactName2 || '';
        setClientInfo({
          company: found.name || found.companyInfo?.customerName || '',
          contactName: foundContact,
          address1: found.address || found.companyInfo?.fullAddress || '',
          address2: found.companyInfo?.locationArea || '',
          phone: found.phone || found.primaryContactInfo?.mobile || '',
          whatsapp: found.phone || found.primaryContactInfo?.mobile || '',
          email: foundEmail
        });
        if (foundEmail) setToEmailTags([foundEmail]);
      }
    } else if (leadData) {
      setCustomerType('lead');
      setSelectedLeadId(leadData._id);
      const leadEmail = leadData.email || '';
      const leadContact = leadData.companyName ? leadData.name : (leadData.contactPerson || '');
      setClientInfo({
        company: leadData.companyName || leadData.name || '',
        contactName: leadContact,
        address1: leadData.fullAddress || leadData.locationArea || '',
        address2: leadData.locationArea && leadData.fullAddress ? leadData.locationArea : '',
        phone: leadData.phone || '',
        whatsapp: leadData.phone || '',
        email: leadEmail
      });
      if (leadEmail) setToEmailTags([leadEmail]);
      if (leadData.interestedProduct || leadData.requirementDescription) {
        setSelectedService(leadData.interestedProduct || leadData.requirementDescription || 'Service Quotation');
      }
    }
  }, [customerId, customers, leadData, taskData]);

  const getServiceSpecificQuotationItems = (serviceType: string): QuotationItem[] => {
    const defaultBudget = leadData?.budget ? parseFloat(leadData.budget.replace(/[^0-9.]/g, '')) : null;

    if (serviceType === 'Lorry Transport') {
      return [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: 'Lorry Freight Transport Service (10 Ton Curtain-Sider)',
          qty: 1,
          unitPrice: defaultBudget || 3500.00
        }
      ];
    } else if (serviceType === 'Painting Services') {
      return [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: 'Commercial Fleet Paint Service - Full Exterior Coating',
          qty: 1,
          unitPrice: defaultBudget || 5000.00
        }
      ];
    } else if (serviceType === 'Repair & Maintenance') {
      return [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: 'Commercial Vehicle Repair & Comprehensive Servicing',
          qty: 1,
          unitPrice: defaultBudget || 1800.00
        }
      ];
    } else if (serviceType === 'Rental Services') {
      return [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: 'Fleet Vehicle Rental Lease (Monthly Commercial Lease)',
          qty: 1,
          unitPrice: defaultBudget || 12000.00
        }
      ];
    } else if (serviceType === 'Lorry Parking Depot') {
      return [
        {
          id: Date.now(),
          type: 'item',
          no: 1,
          description: 'Depot Parking Bay Reservation (Dedicated 40ft Bay)',
          qty: 1,
          unitPrice: defaultBudget || 2200.00
        }
      ];
    }

    return [
      {
        id: Date.now(),
        type: 'item',
        no: 1,
        description: `${serviceType} - Custom Corporate Solution`,
        qty: 1,
        unitPrice: defaultBudget || 5000.00
      }
    ];
  };

  const getInitialItems = (serviceName: string): QuotationItem[] => {
    let itemsList: QuotationItem[] = [];
    const customTemplate = localStorage.getItem(`wt_quote_template_${serviceName}`);
    if (customTemplate) {
      try {
        itemsList = JSON.parse(customTemplate);
      } catch (e) {
        console.error('Failed to parse template', e);
      }
    }
    if (!itemsList || itemsList.length === 0) {
      itemsList = getServiceSpecificQuotationItems(serviceName);
    }
    return filterDefaultDetailRows(itemsList);
  };

  const [items, setItems] = useState<QuotationItem[]>(() => getInitialItems(selectedService));

  const handleServiceChange = (serviceName: string) => {
    setSelectedService(serviceName);
    let templateItems: QuotationItem[] = [];
    const customTemplate = localStorage.getItem(`wt_quote_template_${serviceName}`);
    if (customTemplate) {
      try {
        templateItems = JSON.parse(customTemplate);
      } catch (e) {
        console.error('Failed to parse template', e);
      }
    }
    if (!templateItems || templateItems.length === 0) {
      templateItems = getServiceSpecificQuotationItems(serviceName);
    }
    setItems(filterDefaultDetailRows(templateItems));
  };

  const saveCurrentTemplate = () => {
    try {
      localStorage.setItem(`wt_quote_template_${selectedService}`, JSON.stringify(items));
      setSaveStatus('saved');
      toast.success(`Template structure for "${selectedService}" saved successfully!`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e: any) {
      toast.error(`Failed to save template: ${e.message}`);
    }
  };

  const resetToDefaultTemplate = () => {
    if (resetStatus === 'idle') {
      setResetStatus('confirm');
      return;
    }
    try {
      localStorage.removeItem(`wt_quote_template_${selectedService}`);
      setItems(getServiceSpecificQuotationItems(selectedService));
      setResetStatus('idle');
      toast.success(`Template for "${selectedService}" reset to defaults!`);
    } catch (e: any) {
      toast.error(`Failed to reset template: ${e.message}`);
    }
  };

  const calculateBlockSubtotal = (block: DocumentBlock): number => {
    if (block.type !== 'table' || !block.items) return 0;
    return block.items.reduce((acc, item) => {
      if (item.type === 'item') {
        const qty = parseFloat(String(item.qty)) || 0;
        const price = parseFloat(String(item.unitPrice)) || 0;
        return acc + (qty * price);
      }
      return acc;
    }, 0);
  };

  const calculateBlockDiscount = (block: DocumentBlock): number => {
    const subtotal = calculateBlockSubtotal(block);
    const type = block.discountType || 'percent';
    const val = Number(block.discountPercent) || 0;
    if (val <= 0) return 0;
    if (type === 'amount') {
      return Math.min(subtotal, Math.max(0, val));
    }
    return (subtotal * val) / 100;
  };

  const calculateBlockTotal = (block: DocumentBlock): number => {
    const subtotal = calculateBlockSubtotal(block);
    const discount = calculateBlockDiscount(block);
    return Math.max(0, subtotal - discount);
  };

  const calculateTotal = (): number => {
    return blocks.reduce((acc, block) => {
      if (block.type === 'table') {
        return acc + calculateBlockTotal(block);
      }
      return acc;
    }, 0);
  };

  const finalGrandTotal = calculateTotal();

  const pageChunks = useMemo<A4PageChunk[]>(() => {
    return chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: Boolean(headerImage),
      hasFooterImage: Boolean(footerImage),
      isEditor: false,
    });
  }, [blocks, headerImage, footerImage]);

  const pageToDeleteChunk = pageToDelete !== null ? pageChunks[pageToDelete] : undefined;

  const handleBlockDiscountChange = (blockId: string, val: number) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, discountPercent: Math.max(0, val) } : b)));
  };

  const handleBlockDiscountTypeChange = (blockId: string, type: 'percent' | 'amount') => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, discountType: type } : b)));
  };

  const tableCount = blocks.filter(b => b.type === 'table').length;
  const isOverallTotalVisible = Boolean(overallTotalConfig.show === true);

  const handleDeleteOverallTotal = () => {
    setOverallTotalConfig(prev => ({ ...prev, show: false }));
    setIsEditingOverallTotal(false);
    toast.success('Overall Total section removed');
  };

  const handleAddOverallTotal = () => {
    setOverallTotalConfig(prev => ({ ...prev, show: true }));
    toast.success('Overall Total section added');
  };

  const handleAddItem = () => {
    const mainItemsCount = items.filter(i => i.type === 'item').length;
    setItems([
      ...items,
      {
        id: Date.now(),
        type: 'item',
        no: mainItemsCount + 1,
        description: '',
        qty: 1,
        unitPrice: ''
      }
    ]);
  };

  const handleAddDetailLine = () => {
    setItems([
      ...items,
      {
        id: Date.now(),
        type: 'detail',
        description: 'Additional specification / scope detail line',
        qty: '',
        unitPrice: ''
      }
    ]);
  };

  const handleRemoveItem = (id: number) => {
    const updated = items.filter(i => i.id !== id);
    let currentNo = 1;
    const renumbered = updated.map(item => {
      if (item.type === 'item') {
        return { ...item, no: currentNo++ };
      }
      return item;
    });
    setItems(renumbered);
  };

  const handleItemChange = (id: number, field: keyof QuotationItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleNewQuotation = () => {
    const activeIncludeDate = systemSettings?.proposalIncludeDate !== undefined
      ? Boolean(systemSettings.proposalIncludeDate)
      : Boolean(storeProposalIncludeDate);
    const serverNext = nextProposalNumberData?.nextProposalNo || systemSettings?.nextProposalNo;
    const nextQuoteNo = serverNext || getNextQuotationNumber(
      true,
      systemSettings?.proposalNo || storeProposalNo,
      activeIncludeDate,
      todayStr
    );
    setQuotationDetails({
      quoteNo: nextQuoteNo,
      quoteDate: todayStr,
      validUntil: validUntilStr
    });
    // Keep the email subject/body in sync with the new quotation number.
    setEmailSubject(`Quotation Proposal ${nextQuoteNo} - Welcome Tech CRM`);
    setEmailBody(`Dear Valued Customer,\n\nPlease find attached our quotation proposal ${nextQuoteNo}.\n\nThank you for choosing Welcome Tech CRM.\n\n${getSenderSignoff()}`);
    setItems([
      {
        id: Date.now(),
        type: 'item',
        no: 1,
        description: `${selectedService} - Standard Package`,
        qty: 1,
        unitPrice: ''
      }
    ]);
    toast.success(`Generated New Quotation ${nextQuoteNo}`);
  };

  // Mutation to save quotation or proposal template to CRM backend
  const saveProposalMutation = useMutation({
    mutationFn: async (status: 'draft' | 'sent') => {
      const tableItems = blocks
        .filter(b => b.type === 'table' && Array.isArray(b.items))
        .flatMap(b => b.items!)
        .filter(i => i.type === 'item' && String(i.description || '').trim())
        .map(i => ({
          description: String(i.description || '').trim(),
          qty: Number(i.qty) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          total: (Number(i.qty) || 1) * (Number(i.unitPrice) || 0)
        }));

      const fallbackItems = items
        .filter(i => i.type === 'item' && String(i.description || '').trim())
        .map(i => ({
          description: String(i.description || '').trim(),
          qty: Number(i.qty) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          total: (Number(i.qty) || 1) * (Number(i.unitPrice) || 0)
        }));

      const proposalItems = tableItems.length > 0
        ? tableItems
        : (fallbackItems.length > 0
            ? fallbackItems
            : [{
                description: `${selectedService || 'Professional Services'} - Standard Package`,
                qty: 1,
                unitPrice: 0,
                total: 0
              }]);

      if (isTemplateMode) {
        // Build blocks from current state; if nothing was added yet, preserve existing items from DB
        const hasLiveBlocks = blocks.length > 0;
        const payload: Record<string, unknown> = {
          name: templateName.trim() || 'Untitled Proposal Template',
          title: templateTitle.trim() || `${selectedService} Template`,
          companyInfo,
          discount: Number(discountPercent) || 0,
          validForDays: Number(validForDays) || 10,
          senderName: currentUser?.name || undefined,
          senderEmail: senderEmail.trim() || undefined,
          senderPhone: senderPhone.trim() || undefined,
          status: quoteStatus === 'inactive' ? 'inactive' : 'active',
          isActive: quoteStatus !== 'inactive',
          terms: `${termsInfo.validity}\n${termsInfo.paymentTerms}\n${termsInfo.note}`.trim() || undefined,
          templateImage: headerImage || '',
          templateFooterImage: footerImage || '',
          overallTotal: overallTotalConfig,
        };
        // Only send blocks/items if there's actual content — prevents wiping existing data
        if (hasLiveBlocks) {
          payload.blocks = blocks.map(b => ({
            ...b,
            pageBreak: Boolean(b.pageBreak) ? true : undefined,
          }));
          payload.items = tableItems.length > 0 ? tableItems : proposalItems;
        }
        const res = (isTemplateMode && isEditMode)
          ? await api.patch(`/proposal-templates/${id}`, payload)
          : await api.post('/proposal-templates', payload);
        return { isTemplate: true, data: res.data };
      }

      const activeIncludeDate = systemSettings?.proposalIncludeDate !== undefined
        ? Boolean(systemSettings.proposalIncludeDate)
        : Boolean(storeProposalIncludeDate);
      const rawQuote = quotationDetails.quoteNo.trim()
        || existingProposal?.proposalNo
        || existingProposal?.proposalId
        || systemSettings?.proposalNo
        || storeProposalNo
        || 'WT-Q1001';
      const resolvedQuoteNo = buildProposalNumber(
        rawQuote,
        activeIncludeDate,
        quotationDetails.quoteDate
      );
      const grandSubtotal = blocks.reduce((acc, block) => acc + calculateBlockSubtotal(block), 0);
      const calculatedTotal = calculateTotal();
      const effectiveDiscount = grandSubtotal > 0
        ? Math.round(((grandSubtotal - calculatedTotal) / grandSubtotal) * 100 * 100) / 100
        : 0;

      const formatSafeIsoDate = (val?: string | null): string => {
        if (!val) return new Date().toISOString();
        const trimmed = val.trim();
        const ymd = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
        if (ymd) {
          return `${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00.000Z`;
        }
        const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (dmy) {
          const d = dmy[1].padStart(2, '0');
          const m = dmy[2].padStart(2, '0');
          const y = dmy[3];
          return `${y}-${m}-${d}T12:00:00.000Z`;
        }
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          const y = parsed.getFullYear();
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const d = String(parsed.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}T12:00:00.000Z`;
        }
        return new Date().toISOString();
      };

      const resolvedQuoteDate = formatSafeIsoDate(quotationDetails.quoteDate);

      const resolvedValidUntil = quotationDetails.validUntil && !isNaN(new Date(quotationDetails.validUntil).getTime())
        ? new Date(quotationDetails.validUntil).toISOString()
        : new Date(Date.now() + (validForDays || 7) * 24 * 60 * 60 * 1000).toISOString();

      const sanitizedCustomerId = customerType === 'existing' && selectedCustomerId && selectedCustomerId.trim()
        ? selectedCustomerId.trim()
        : undefined;
      const sanitizedLeadId = customerType === 'lead' && (selectedLeadId || leadId) && String(selectedLeadId || leadId).trim()
        ? String(selectedLeadId || leadId).trim()
        : undefined;
      const sanitizedTaskId = selectedTaskId && selectedTaskId.trim()
        ? selectedTaskId.trim()
        : undefined;
      const sanitizedTemplateId = selectedTemplateId && selectedTemplateId.trim()
        ? selectedTemplateId.trim()
        : undefined;

      const payload: Record<string, any> = {
        proposalNo: resolvedQuoteNo,
        customerType,
        customer: sanitizedCustomerId,
        lead: sanitizedLeadId,
        task: sanitizedTaskId,
        template: sanitizedTemplateId,
        templateName: sanitizedTemplateId ? (proposalTemplates?.find((pt: any) => pt._id === sanitizedTemplateId)?.name || templateName) : undefined,
        customerName: clientInfo.company,
        customerContactPerson: clientInfo.contactName || undefined,
        customerDetails: {
          companyName: clientInfo.company,
          contactName: clientInfo.contactName || '',
          contactPerson: clientInfo.contactName || '',
          addressLine1: clientInfo.address1,
          addressLine2: clientInfo.address2,
          phone: clientInfo.phone,
          email: clientInfo.email,
        },
        customerPhone: clientInfo.phone,
        customerEmail: clientInfo.email,
        cc: ccEmailTags.length > 0 ? ccEmailTags.join(', ') : (ccEmailInput.trim() || undefined),
        customerAddress: `${clientInfo.address1} ${clientInfo.address2}`.trim(),
        companyInfo,
        senderEmail: senderEmail.trim() || undefined,
        senderPhone: senderPhone.trim() || undefined,
        senderName: currentUser?.name || undefined,
        title: `${selectedService} Quotation (${resolvedQuoteNo})`,
        quoteDate: resolvedQuoteDate,
        proposalDate: resolvedQuoteDate,
        validUntil: resolvedValidUntil,
        discount: effectiveDiscount,
        items: proposalItems,
        subtotal: grandSubtotal,
        total: calculatedTotal,
        terms: `${termsInfo.validity}\n${termsInfo.paymentTerms}\n${termsInfo.note}`,
        templateImage: headerImage || '',
        templateFooterImage: footerImage || '',
        overallTotal: overallTotalConfig,
        blocks: blocks.map(b => ({
          ...b,
          pageBreak: Boolean(b.pageBreak) ? true : undefined,
        })),
        status: status || (quoteStatus as any) || 'draft',
        revisionReason: isEditMode && revisionReason.trim() ? revisionReason.trim() : undefined,
      };

      const res = isEditMode
        ? await api.patch(`/proposals/${id}`, payload)
        : await api.post('/proposals', payload);
      return { isTemplate: false, data: res.data };
    },
    onSuccess: (res: any, status) => {
      if (res?.isTemplate) {
        toast.success(isEditMode ? 'Proposal template updated!' : 'Proposal template saved to list!');
        queryClient.invalidateQueries({ queryKey: ['proposal-templates'] });
        queryClient.invalidateQueries({ queryKey: ['proposal-templates-selector'] });
        if (id) {
          queryClient.invalidateQueries({ queryKey: ['proposal-template', id] });
        }
        navigate('/proposal-templates');
      } else {
        const updatedProposal = res?.data?.data || res?.data;
        const revLabel = updatedProposal?.revision ? ` (Rev ${updatedProposal.revision})` : '';
        toast.success(isEditMode ? `Proposal updated successfully${revLabel}!` : (status === 'sent' ? 'Proposal created & sent successfully!' : 'Proposal saved to CRM!'));
        queryClient.invalidateQueries({ queryKey: ['proposals'] });
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        if (id) {
          queryClient.invalidateQueries({ queryKey: ['proposal', id] });
        }
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        if (leadId || selectedLeadId) {
          queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId || selectedLeadId] });
        }
        navigate('/proposals');
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save proposal');
    }
  });

  const confirmShare = () => {
    const type = shareModal.type;
    setShareModal({ isOpen: false, type: null });
    handlePrintQuotation();
  };

  // Compact header shown on continuation pages (page 2+)
  const renderContinuationHeader = (chunk: any) => (
    <div className="quotation-continuation-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 10, borderBottom: `2px solid ${brand || 'var(--brand)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!headerImage && <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>{companyInfo.name}</span>}
        <span style={{ fontSize: 11.5, color: 'var(--tx-3)', fontWeight: 600 }}>Quotation: {quotationDetails.quoteNo || '—'}</span>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Page {chunk.pageNum} of {pageChunks.length}
      </div>
    </div>
  );

  return (
    <div className="proposals-page-container" style={{ width: '100%', paddingBottom: '60px' }}>
      <style>{`
        ${commonDocStyles}

        /* ── Remove card accent bar on printable quotation canvas ── */
        .quotation-card::before,
        .quotation-card::after {
          display: none !important;
          content: none !important;
        }

        /* ── Screen-only UI helpers ────────────────────────────── */
        .quote-input-clean { border: none; border-bottom: 1.5px solid transparent; background: transparent; font-weight: 700; width: 100%; padding: 3px 0px; color: var(--tx-1); text-align: left; }
        .quote-input-clean-normal { border: none; border-bottom: 1.5px solid transparent; background: transparent; font-weight: 400; width: 100%; padding: 2px 0px; color: var(--tx-2); text-align: left; }
        .quote-table-input { border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px; color: var(--tx-1); background: #ffffff; font-weight: 600; font-size: 13px; transition: all 0.15s ease; }
        .quote-table-input:focus { border-color: var(--brand); outline: none; box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.12); }
        div[contenteditable]:empty::before { content: attr(data-placeholder); color: var(--tx-4); font-style: italic; pointer-events: none; display: block; text-align: left; }
        .quote-rich-text-content, .quote-rich-text-content :not([style*="font-family"]):not(font[face]) { font-family: var(--font-content, var(--font-sans)); }
        .quote-rich-text-content font[size="1"], font[size="1"] { font-size: 8pt !important; line-height: 1.35 !important; }
        .quote-rich-text-content font[size="2"], font[size="2"] { font-size: 10pt !important; line-height: 1.45 !important; }
        .quote-rich-text-content font[size="3"], font[size="3"] { font-size: 12pt !important; line-height: 1.55 !important; }
        .quote-rich-text-content font[size="4"], font[size="4"] { font-size: 14pt !important; line-height: 1.55 !important; }
        .quote-rich-text-content font[size="5"], font[size="5"] { font-size: 18pt !important; line-height: 1.45 !important; }
        .quote-rich-text-content font[size="6"], font[size="6"] { font-size: 24pt !important; line-height: 1.35 !important; }
        .quote-rich-text-content font[size="7"], font[size="7"] { font-size: 36pt !important; line-height: 1.25 !important; }

        .quote-rich-text-content font[face*="Arial"], font[face*="Arial"], [style*="Arial"] { font-family: Arial, Helvetica, sans-serif !important; }
        .quote-rich-text-content font[face*="Georgia"], font[face*="Georgia"], [style*="Georgia"] { font-family: Georgia, serif !important; }
        .quote-rich-text-content font[face*="Times"], font[face*="Times"], [style*="Times"] { font-family: "Times New Roman", Times, serif !important; }
        .quote-rich-text-content font[face*="Garamond"], font[face*="Garamond"], [style*="Garamond"] { font-family: Garamond, "EB Garamond", Georgia, serif !important; }
        .quote-rich-text-content font[face*="Tahoma"], font[face*="Tahoma"], [style*="Tahoma"] { font-family: Tahoma, Verdana, sans-serif !important; }
        .quote-rich-text-content font[face*="Trebuchet"], font[face*="Trebuchet"], [style*="Trebuchet"] { font-family: "Trebuchet MS", "Lucida Grande", sans-serif !important; }
        .quote-rich-text-content font[face*="Verdana"], font[face*="Verdana"], [style*="Verdana"] { font-family: Verdana, Geneva, sans-serif !important; }
        .quote-rich-text-content font[face*="Courier"], font[face*="Courier"], [style*="Courier"] { font-family: "Courier New", Courier, monospace !important; }
        .quote-rich-text-content h1, .quote-rich-text-content h2, .quote-rich-text-content h3, .quote-rich-text-header .quote-input-clean, .quotation-items-table thead th { font-family: var(--font-heading, var(--font-sans)) !important; }
        .quote-rich-text-content {
          text-align: left;
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 12px;
          font-size: 0.96rem;
          line-height: 1.6;
        }
        .quote-rich-text-content [align="left"], .quote-rich-text-content [style*="text-align: left"], .quote-rich-text-content [style*="text-align:left"], .quote-rich-text-content .text-left { text-align: left !important; }
        .quote-rich-text-content [align="center"], .quote-rich-text-content [style*="text-align: center"], .quote-rich-text-content [style*="text-align:center"], .quote-rich-text-content .text-center { text-align: center !important; }
        .quote-rich-text-content [align="right"], .quote-rich-text-content [style*="text-align: right"], .quote-rich-text-content [style*="text-align:right"], .quote-rich-text-content .text-right { text-align: right !important; }
        .quote-rich-text-content [align="justify"], .quote-rich-text-content [style*="text-align: justify"], .quote-rich-text-content [style*="text-align:justify"], .quote-rich-text-content .text-justify { text-align: justify !important; }
        .quote-rich-text-content p { margin: 0 0 6px 0; }
        .quote-rich-text-content ul { list-style-type: disc !important; padding-left: 22px !important; margin: 4px 0 8px !important; }
        .quote-rich-text-content ol { list-style-type: decimal !important; padding-left: 22px !important; margin: 4px 0 8px !important; }
        .quote-rich-text-content li { display: list-item !important; margin-bottom: 3px !important; }
        .quote-rich-text-content h1 { font-size: 1.35rem; font-weight: 800; margin: 10px 0 6px; color: var(--brand); }
        .quote-rich-text-content h2 { font-size: 1.2rem; font-weight: 800; margin: 8px 0 5px; color: var(--brand); }
        .quote-rich-text-content h3 { font-size: 1.05rem; font-weight: 700; margin: 6px 0 4px; color: var(--tx-1); }
        .quote-rich-text-content blockquote { border-left: 3px solid var(--brand); padding: 4px 12px; margin: 6px 0; color: var(--tx-2); font-style: italic; background: rgba(0,0,0,0.02); border-radius: 0 6px 6px 0; }
        .quote-rich-text-content img {
          cursor: pointer;
          transition: outline 0.15s ease, box-shadow 0.15s ease;
          border-radius: 6px;
        }
        .quote-rich-text-content img:hover {
          outline: 1.5px dashed var(--brand);
          outline-offset: 2px;
        }
        .quote-rich-text-content img.quote-img-selected {
          outline: 2.5px solid var(--brand) !important;
          outline-offset: 3px !important;
          box-shadow: 0 4px 16px rgba(109, 40, 217, 0.25) !important;
        }

        /* ── Editor Screen Tables Reset (Eliminates CRM dashboard 12px pill styling) ── */
        .quote-rich-text-content table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 10px 0 !important;
        }
        .quote-rich-text-content table tbody tr td,
        .quote-rich-text-content table tbody tr th {
          border-radius: 0 !important;
          transition: background-color 0.12s ease !important;
        }
        .quote-rich-text-content table tbody tr:hover td {
          border-radius: 0 !important;
        }
        /* ── Tabular Column Tables (quote-grid-table) ── */
        .quote-rich-text-content table.quote-grid-table,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) {
          width: 100% !important;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          margin: 12px 0 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          overflow: hidden !important;
          background: #ffffff !important;
        }
        .quote-rich-text-content table.quote-grid-table th,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th {
          background: var(--brand-color, #722580) !important;
          border: none !important;
          border-left: none !important;
          border-right: none !important;
          border-top: none !important;
          border-bottom: none !important;
          padding: 10px 14px !important;
          font-weight: 800 !important;
          color: #ffffff !important;
          text-align: left !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          font-size: 11px !important;
        }
        .quote-rich-text-content table.quote-grid-table th:first-child,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:first-child {
          border-top-left-radius: 7px !important;
        }
        .quote-rich-text-content table.quote-grid-table th:last-child,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:last-child {
          border-top-right-radius: 7px !important;
        }
        .quote-rich-text-content table.quote-grid-table td,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) td {
          border: none !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding: 10px 14px !important;
          font-size: 10pt !important;
          line-height: 1.5 !important;
          color: #0f172a !important;
          vertical-align: top !important;
        }
        .quote-rich-text-content table.quote-grid-table tr:last-child td,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td {
          border-bottom: none !important;
        }
        .quote-rich-text-content table.quote-grid-table tr:last-child td:first-child,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child {
          border-bottom-left-radius: 7px !important;
        }
        .quote-rich-text-content table.quote-grid-table tr:last-child td:last-child,
        .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child {
          border-bottom-right-radius: 7px !important;
        }
        .quote-rich-text-content table.quote-grid-table tbody tr:nth-child(even) td {
          background: #fafbfc !important;
        }
        .quote-rich-text-content table.quote-grid-table tbody tr:hover td {
          background: rgba(114, 37, 128, 0.04) !important;
        }

        .quote-rich-text-content table.specs-table,
        .quote-rich-text-content table[data-type="specs"] {
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          border: 1px solid #e2e8f0 !important;
        }
        .quote-rich-text-content table.specs-table td,
        .quote-rich-text-content table[data-type="specs"] td {
          border: 1px solid #e2e8f0 !important;
          padding: 6px 10px !important;
          font-size: 10pt !important;
          line-height: 1.5 !important;
          background: transparent !important;
        }
        .quote-rich-text-content table.specs-table td:first-child,
        .quote-rich-text-content table[data-type="specs"] td:first-child {
          width: 190px !important;
          min-width: 190px !important;
          max-width: 190px !important;
          font-weight: 700 !important;
          white-space: nowrap !important;
          vertical-align: top !important;
          color: #334155 !important;
        }
        .quote-rich-text-content table.specs-table td:nth-child(2),
        .quote-rich-text-content table[data-type="specs"] td:nth-child(2) {
          width: 25px !important;
          min-width: 25px !important;
          max-width: 25px !important;
          text-align: center !important;
          vertical-align: top !important;
          font-weight: 700 !important;
          color: #64748b !important;
        }
        .quote-rich-text-content table.specs-table td:nth-child(3),
        .quote-rich-text-content table[data-type="specs"] td:nth-child(3) {
          vertical-align: top !important;
          word-break: break-word !important;
        }
        .quote-rich-text-content table.specs-table tr,
        .quote-rich-text-content table[data-type="specs"] tr {
          background: transparent !important;
        }
        .quote-rich-text-content table.specs-table tbody tr:nth-child(even) td,
        .quote-rich-text-content table[data-type="specs"] tbody tr:nth-child(even) td {
          background: transparent !important;
        }
        .quote-rich-text-content table.specs-table tbody tr:hover td,
        .quote-rich-text-content table[data-type="specs"] tbody tr:hover td {
          background: rgba(109, 40, 217, 0.03) !important;
        }

        /* ── Quotation Table Clean Curved Row Styling ── */
        .quotation-items-table {
          width: 100% !important;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          border-radius: 8px !important;
          margin: 0 !important;
        }
        .quotation-items-table tr,
        .quotation-items-table thead tr,
        .quotation-items-table tbody tr,
        .quotation-items-table tfoot tr {
          box-shadow: none !important;
          transform: none !important;
          margin: 0 !important;
        }
        .quotation-items-table th,
        .quotation-items-table td,
        .quotation-items-table tbody td {
          box-shadow: none !important;
          transform: none !important;
        }
        .quotation-items-table thead th:first-child {
          border-top-left-radius: 7px !important;
        }
        .quotation-items-table thead th:last-child {
          border-top-right-radius: 7px !important;
        }
        .quotation-items-table tbody tr:hover td {
          transform: none !important;
          box-shadow: none !important;
        }

        /* ── Dropdown Custom Smooth Scrollbar ── */
        .quote-editor-dropdown-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(15, 23, 42, 0.22) transparent;
          overscroll-behavior: contain;
        }
        .quote-editor-dropdown-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .quote-editor-dropdown-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .quote-editor-dropdown-scroll::-webkit-scrollbar-thumb {
          background: rgba(15, 23, 42, 0.2);
          border-radius: 999px;
        }
        .quote-editor-dropdown-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--brand);
        }

        /* ── Rich Text Editor Toolbar ────────────────────────────── */
        .quote-editor-toolbar {
          display: flex;
          align-items: center;
          gap: 3px;
          flex-wrap: wrap;
          padding: 5px 8px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          user-select: none;
        }
        .quote-tool-btn {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 6px;
          color: var(--tx-2);
          cursor: pointer;
          transition: all 0.12s ease;
          padding: 0;
          flex-shrink: 0;
        }
        .quote-tool-btn:hover {
          background: var(--surface-hover, #f1f5f9);
          color: var(--tx-1);
          border-color: var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .quote-tool-btn:active {
          transform: scale(0.94);
        }
        .quote-tool-btn-text {
          height: 28px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 6px;
          color: var(--tx-2);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .quote-tool-btn-text:hover {
          background: var(--surface-hover, #f1f5f9);
          color: var(--tx-1);
          border-color: var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .quote-tool-divider {
          width: 1px;
          height: 16px;
          background: var(--border);
          margin: 0 3px;
          flex-shrink: 0;
        }
        .quote-format-btn {
          height: 28px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--border);
          background: #ffffff;
          border-radius: 6px;
          color: var(--tx-1);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .quote-format-btn:hover {
          border-color: var(--brand);
          color: var(--brand);
          background: var(--surface-hover, #f8fafc);
        }

        /* ── Screen Layout for Quotation Print Table ─────────────── */
        table.quotation-print-table-layout {
          display: flex;
          flex-direction: column;
          width: 100%;
          border-collapse: collapse;
          min-height: 1120px;
          justify-content: space-between;
        }
        table.quotation-print-table-layout > thead,
        table.quotation-print-table-layout > tbody,
        table.quotation-print-table-layout > tfoot {
          display: block;
          width: 100%;
        }
        table.quotation-print-table-layout > thead > tr,
        table.quotation-print-table-layout > tbody > tr,
        table.quotation-print-table-layout > tfoot > tr {
          display: block;
          width: 100%;
        }
        table.quotation-print-table-layout > thead > tr > td,
        table.quotation-print-table-layout > tbody > tr > td,
        table.quotation-print-table-layout > tfoot > tr > td {
          display: block;
          width: 100%;
          padding: 0;
          border: none;
        }
        table.quotation-print-table-layout > tbody {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        table.quotation-print-table-layout > tbody > tr {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        table.quotation-print-table-layout > tbody > tr > td {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ── Top-level Page rules for zero-margin printing ─────── */
        @page {
          size: A4 portrait;
          margin: 0;
        }

        /* ── Print / PDF fixes ─────────────────────────────────── */
        @media print {
          /* Hide all UI chrome */
          .no-print { display: none !important; width: 0 !important; height: 0 !important; padding: 0 !important; margin: 0 !important; overflow: hidden !important; }

          html, body {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Unconstrain app shell, main-area, and page-content scroll container so Chrome paginates all sheets */
          .app-shell,
          .main-area,
          .page-content {
            display: block !important;
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
            flex: none !important;
            background: transparent !important;
          }

          /* Outer wrapper — remove any screen padding and allow natural document flow */
          .proposals-page-container {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            width: 100% !important;
          }
          .quotation-sheets-container {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            border: none !important;
            width: 100% !important;
          }

          /* Each discrete A4 page sheet in print */
          .quotation-page-sheet {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 296.5mm !important;
            max-height: 296.5mm !important;
            height: 296.5mm !important;
            background: #ffffff !important;
            display: block !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .quotation-page-sheet:last-of-type,
          .quotation-page-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .quote-page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }

          /* Card itself — full printable page canvas */
          .quotation-card {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            min-height: 296.5mm !important;
            max-height: 296.5mm !important;
            height: 296.5mm !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .quotation-header-banner {
            width: 100% !important;
            overflow: hidden !important;
            flex-shrink: 0 !important;
          }
          .quotation-header-banner img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
            border-radius: 0 !important;
          }

          .quotation-running-subhead {
            width: 100% !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            flex-shrink: 0 !important;
            background: #ffffff !important;
          }

          .quotation-card-body {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
          }

          .quotation-footer-banner {
            width: 100% !important;
            margin-top: auto !important;
            position: relative !important;
            z-index: 1 !important;
            border-top: 1.5px solid #cbd5e1 !important;
            background: #ffffff !important;
            flex-shrink: 0 !important;
          }
          .quotation-footer-banner img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
            border-radius: 0 !important;
          }

          .quotation-text-footer {
            margin-top: auto !important;
            width: 100% !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            flex-shrink: 0 !important;
            background: #ffffff !important;
          }

          /* Table Print Structure for Running Header & Bottom Footer */
          table.quotation-print-table-layout {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: auto !important;
          }
          table.quotation-print-table-layout > thead {
            display: table-header-group !important;
          }
          table.quotation-print-table-layout > tfoot {
            display: table-footer-group !important;
          }
          table.quotation-print-table-layout > tbody {
            display: table-row-group !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          table.quotation-print-table-layout > thead > tr,
          table.quotation-print-table-layout > tfoot > tr,
          table.quotation-print-table-layout > tbody > tr {
            display: table-row !important;
          }
          table.quotation-print-table-layout > thead > tr > td,
          table.quotation-print-table-layout > tfoot > tr > td,
          table.quotation-print-table-layout > tbody > tr > td {
            display: table-cell !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            vertical-align: top !important;
          }

          /* Prevent inner content pricing tables from repeating tfoot across pages */
          table:not(.quotation-print-table-layout) tfoot {
            display: table-row-group !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Header Banner Image (touches exact top edge 0mm) with clean gap below */
          .quotation-header-banner {
            margin: 0 0 16px 0 !important;
            width: 100% !important;
            border-radius: 0 !important;
            overflow: visible !important;
            display: block !important;
            border-bottom: 1.5px solid #cbd5e1 !important;
          }
          .quotation-header-banner img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
          }

          /* Footer Banner Image — anchored firmly to bottom of each sheet */
          .quotation-footer-banner {
            display: block !important;
            position: relative !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            margin-top: auto !important;
            width: 100% !important;
            padding: 0 !important;
            background: #ffffff !important;
            border-top: 1.5px solid #cbd5e1 !important;
            z-index: 10 !important;
          }
          .quotation-footer-banner img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
          }

          /* Discrete A4 sheet print flow — ensures each sheet naturally houses header and footer banners */
          .card.quotation-card.a4-discrete-sheet {
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            min-height: 297mm !important;
            height: 297mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .card.quotation-card.a4-discrete-sheet .quotation-footer-banner {
            position: relative !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            margin-top: auto !important;
            width: 100% !important;
          }

          /* Universal print shadow & radius resets to eliminate grey halo artifacts */
          *, *::before, *::after {
            box-shadow: none !important;
            text-shadow: none !important;
          }

          /* foot-spacer reserves space on every page (footer image 32mm or minimal 10mm) */
          .quotation-foot-spacer {
            height: ${footerImage ? '32mm' : '10mm'} !important;
            min-height: ${footerImage ? '32mm' : '10mm'} !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Full-page centered watermark in print */
          .quotation-watermark {
            position: fixed !important;
            inset: 0 !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            pointer-events: none !important;
            opacity: 0.04 !important;
            z-index: 0 !important;
          }
          .quotation-watermark img {
            width: min(60%, 520px) !important;
            height: auto !important;
            object-fit: contain !important;
          }

          /* Inner printable body matching exact screen canvas padding (36px horizontal) */
          .quotation-card-body {
            padding: 16px 36px 20px 36px !important;
            display: block !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
          }

          /* Customer & Quote Details Grid in print */
          .quotation-client-details-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
            margin-bottom: 16px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            align-items: stretch !important;
          }
          .quotation-client-details-grid > div {
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 8px !important;
            box-shadow: none !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
          }

          /* Content blocks & tables — allow natural page break splitting */
          .quote-text-container, .quote-table-container, .quote-rich-text-container, .rich, tr, table {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          /* Inputs become clean text */
          input, textarea, select {
            border: none !important;
            border-bottom: none !important;
            background: transparent !important;
            padding: 0 !important;
            outline: none !important;
            color: #0f172a !important;
            -webkit-appearance: none !important;
            appearance: none !important;
            box-shadow: none !important;
          }

          /* Rich Text Containers in print (flush alignment & multi-page natural flow) */
          .quote-rich-text-container {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 6px 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            display: block !important;
          }
          .quote-rich-text-header.empty-title {
            display: none !important;
          }
          .quote-rich-text-header {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin-bottom: 6px !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            border-bottom: none !important;
          }
          .quote-rich-text-header .quote-input-clean,
          .quote-rich-text-header .quote-print-continuation-title {
            font-size: 11pt !important;
            font-weight: 800 !important;
            color: ${brandColor || '#6d28d9'} !important;
            margin-bottom: 4px !important;
            display: block !important;
            width: 100% !important;
          }
          .quote-editor-box {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .quote-rich-text-content, .quote-rich-text-content :not([style*="font-family"]):not(font[face]) {
            font-family: var(--font-content, var(--font-sans)) !important;
          }
          .quote-rich-text-content h1,
          .quote-rich-text-content h2,
          .quote-rich-text-content h3,
          .quote-rich-text-header .quote-input-clean,
          .quotation-items-table thead th {
            font-family: var(--font-heading, var(--font-sans)) !important;
          }
          .quote-rich-text-content {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 10pt !important;
            line-height: 1.6 !important;
            color: #0f172a !important;
            min-height: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            display: block !important;
          }
          .quote-rich-text-content h1,
          .quote-rich-text-content h2,
          .quote-rich-text-content h3,
          .quote-rich-text-content h4,
          .quote-rich-text-header {
            break-after: avoid !important;
            page-break-after: avoid !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin: 0 0 6px 0 !important;
          }
          .quote-rich-text-content p {
            break-inside: auto !important;
            page-break-inside: auto !important;
            margin: 0 0 4px 0 !important;
          }
          .quote-rich-text-content li {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 3px !important;
          }
          .quote-rich-text-content div {
            break-inside: auto !important;
            page-break-inside: auto !important;
            margin: 0 0 3px 0 !important;
          }
          .quote-rich-text-content ul, .quote-rich-text-content ol {
            margin: 4px 0 8px 20px !important;
            padding: 0 !important;
          }

          /* Table Container in print */
          .quote-table-container {
            border: 1px solid #cbd5e1 !important;
            border-radius: 8px !important;
            margin: 10px 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            box-shadow: none !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .quote-table-wrapper {
            overflow: visible !important;
          }

          .quote-table-container table {
            width: 100% !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            table-layout: fixed !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          .quote-table-container table colgroup col:last-child {
            width: 0 !important;
            display: none !important;
          }

          /* Table header */
          .quote-table-container thead {
            display: table-header-group !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .quote-table-container thead tr, .quote-table-container thead th {
            background: ${brandColor || '#722580'} !important;
            color: #ffffff !important;
            border: none !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
            border-bottom: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .quote-table-container thead th {
            padding: 8px 10px !important;
            font-size: 8.5pt !important;
            font-weight: 700 !important;
            white-space: nowrap !important;
          }
          .quote-table-container thead th:first-child {
            border-top-left-radius: 7px !important;
          }
          .quote-table-container thead th:nth-child(5) {
            border-top-right-radius: 7px !important;
          }
          .quote-table-container tfoot tr:last-child td:first-child {
            border-bottom-left-radius: 7px !important;
          }
          .quote-table-container tfoot tr:last-child td:last-child,
          .quote-table-container tfoot tr:last-child td:nth-child(5) {
            border-bottom-right-radius: 7px !important;
          }

          /* Table body rows */
          .quote-table-container tbody tr {
            border-bottom: 1px solid #e2e8f0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .quote-table-container tfoot tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .quote-table-container tbody td {
            padding: 6px 10px !important;
            font-size: 8.5pt !important;
            color: #0f172a !important;
            vertical-align: middle !important;
          }

          /* Column Alignments & Synchronized Widths */
          .quote-table-container thead th:first-child,
          .quote-table-container tbody td:first-child { text-align: center !important; width: 44px !important; }

          .quote-table-container thead th:nth-child(2),
          .quote-table-container tbody td:nth-child(2) { text-align: left !important; word-break: break-word !important; }
          .quote-table-container tbody td:nth-child(2) input { width: 100% !important; display: block !important; white-space: normal !important; word-break: break-word !important; }

          .quote-table-container thead th:nth-child(3),
          .quote-table-container tbody td:nth-child(3) { text-align: center !important; width: 68px !important; }

          .quote-table-container thead th:nth-child(4),
          .quote-table-container tbody td:nth-child(4) { text-align: right !important; width: 130px !important; }
          .quote-table-container tbody td:nth-child(4) { font-family: ui-monospace, monospace !important; }

          .quote-table-container thead th:nth-child(5),
          .quote-table-container tbody td:nth-child(5) { text-align: right !important; width: 140px !important; }
          .quote-table-container tbody td:nth-child(5) { font-weight: 700 !important; font-family: ui-monospace, monospace !important; }

          .quote-table-container thead th:last-child,
          .quote-table-container tbody td:last-child { display: none !important; width: 0 !important; padding: 0 !important; }

          .quote-table-container tfoot td {
            padding: 6px 10px !important;
            font-size: 8.5pt !important;
          }

          /* Rich text custom tables (e.g. Hardware specs table) */
          .quote-rich-text-content table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 8px 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .quote-rich-text-content table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .quote-rich-text-content table.specs-table,
          .quote-rich-text-content table[data-type="specs"] {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          .quote-rich-text-content table.specs-table td,
          .quote-rich-text-content table[data-type="specs"] td {
            border: none !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding: 5px 8px 5px 0 !important;
            font-size: 9pt !important;
            line-height: 1.5 !important;
          }
          .quote-rich-text-content table.specs-table td:first-child,
          .quote-rich-text-content table[data-type="specs"] td:first-child {
            width: 190px !important;
            min-width: 190px !important;
            max-width: 190px !important;
            font-weight: 700 !important;
            white-space: nowrap !important;
            vertical-align: top !important;
            color: #334155 !important;
          }
          .quote-rich-text-content table.specs-table td:nth-child(2),
          .quote-rich-text-content table[data-type="specs"] td:nth-child(2) {
            width: 25px !important;
            min-width: 25px !important;
            max-width: 25px !important;
            text-align: center !important;
            vertical-align: top !important;
            font-weight: 700 !important;
            color: #64748b !important;
          }
          .quote-rich-text-content table.specs-table td:nth-child(3),
          .quote-rich-text-content table[data-type="specs"] td:nth-child(3) {
            vertical-align: top !important;
            word-break: break-word !important;
          }
          .quote-rich-text-content table.quote-grid-table,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) {
            width: 100% !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
            margin: 10px 0 !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 8px !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          .quote-rich-text-content table.quote-grid-table th,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th {
            background: ${brandColor || '#722580'} !important;
            border: none !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
            border-bottom: none !important;
            padding: 8px 12px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
            text-align: left !important;
            font-size: 8pt !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            line-height: 1.4 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .quote-rich-text-content table.quote-grid-table th:first-child,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:first-child {
            border-top-left-radius: 7px !important;
          }
          .quote-rich-text-content table.quote-grid-table th:last-child,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:last-child {
            border-top-right-radius: 7px !important;
          }
          .quote-rich-text-content table.quote-grid-table td,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) td {
            border: none !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding: 8px 12px !important;
            font-size: 8.5pt !important;
            line-height: 1.45 !important;
            color: #0f172a !important;
            vertical-align: top !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .quote-rich-text-content table.quote-grid-table tr:last-child td,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td {
            border-bottom: none !important;
          }
          .quote-rich-text-content table.quote-grid-table tr:last-child td:first-child,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child {
            border-bottom-left-radius: 7px !important;
          }
          .quote-rich-text-content table.quote-grid-table tr:last-child td:last-child,
          .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child {
            border-bottom-right-radius: 7px !important;
          }
          .quote-rich-text-content .MsoListParagraph,
          .quote-rich-text-content .MsoListParagraphCxSpFirst,
          .quote-rich-text-content .MsoListParagraphCxSpMiddle,
          .quote-rich-text-content .MsoListParagraphCxSpLast,
          .quote-rich-text-content .MsoNormal {
            text-indent: 0 !important;
            margin: 0 0 4px 0 !important;
            padding-left: 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* Table footer / totals bar */
          .quote-table-total-bar {
            background: #f8fafc !important;
            border-top: 1.5px solid #cbd5e1 !important;
            padding: 8px 14px !important;
            display: flex !important;
            justify-content: flex-end !important;
            align-items: center !important;
            font-size: 9.5pt !important;
            font-weight: 800 !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Images fill width properly */
          img { max-width: 100% !important; height: auto !important; }
          .quote-img-selected { outline: none !important; box-shadow: none !important; }

          /* Remove colored backgrounds on detail rows */
          tbody tr[data-type="detail"] { background: #f8fafc !important; }
        }

        .quote-page-header {
          min-height: 72px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 16px !important;
          background: var(--surface, #ffffff) !important;
          border: 1px solid var(--border) !important;
          border-radius: 12px !important;
          padding: 12px 18px !important;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.02) !important;
        }
        .dark .quote-page-header {
          background: var(--surface, #1e293b) !important;
          border-color: var(--border, #334155) !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
        }
        .quote-page-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }
        .quote-page-header .btn-back {
          width: 36px !important;
          height: 36px !important;
          min-width: 36px !important;
          min-height: 36px !important;
          border-radius: 8px !important;
          background: var(--surface-2) !important;
          border: 1px solid var(--border) !important;
          color: var(--tx-2) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
        }
        .quote-page-header .btn-back:hover {
          background: var(--surface) !important;
          color: var(--brand) !important;
          border-color: var(--brand) !important;
        }
        .quote-page-header .page-title {
          display: block !important;
          font-size: 17px !important;
          font-weight: 700 !important;
          color: var(--tx-1) !important;
          letter-spacing: -0.01em !important;
          margin: 0 !important;
          line-height: 1.2 !important;
          text-transform: none !important;
        }
        .quote-page-header .page-subtitle {
          display: block !important;
          font-size: 12px !important;
          color: var(--tx-4) !important;
          margin-top: 2px !important;
          font-weight: 500 !important;
          line-height: 1.25 !important;
        }
        .quote-actions-row {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          flex-wrap: wrap !important;
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .quote-toolbar-v-divider {
          width: 1px !important;
          height: 22px !important;
          background: var(--border, #e2e8f0) !important;
          flex-shrink: 0 !important;
          margin: 0 2px !important;
        }
        .dark .quote-toolbar-v-divider {
          background: var(--border, #334155) !important;
        }
        .quote-action-group {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          background: var(--surface, #ffffff) !important;
          padding: 4px !important;
          border-radius: 9px !important;
          border: 1px solid var(--border, #e2e8f0) !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
        }
        .dark .quote-action-group {
          background: var(--surface, #1e293b) !important;
          border-color: var(--border, #334155) !important;
        }
        .quote-action-group-accent {
          background: color-mix(in srgb, var(--brand, #6d28d9) 6%, var(--surface, #ffffff)) !important;
          border-color: color-mix(in srgb, var(--brand, #6d28d9) 28%, var(--border, #e2e8f0)) !important;
        }
        .dark .quote-action-group-accent {
          background: rgba(109, 40, 217, 0.12) !important;
          border-color: rgba(167, 139, 250, 0.28) !important;
        }
        .quote-topbar-btn {
          height: 33px !important;
          min-height: 33px !important;
          max-height: 33px !important;
          padding: 0 11px !important;
          border-radius: 6px !important;
          font-size: 12.5px !important;
          font-weight: 650 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          background: transparent !important;
          color: var(--tx-2, #475569) !important;
          border: 1px solid transparent !important;
          box-shadow: none !important;
          cursor: pointer !important;
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
          white-space: nowrap !important;
        }
        .dark .quote-topbar-btn {
          color: var(--tx-2, #cbd5e1) !important;
        }
        .quote-topbar-btn:hover:not(:disabled) {
          background: var(--surface-2, #f1f5f9) !important;
          color: var(--brand, #6d28d9) !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
        }
        .dark .quote-topbar-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
        }
        .quote-topbar-accent-btn {
          color: var(--brand, #6d28d9) !important;
          font-weight: 750 !important;
        }
        .dark .quote-topbar-accent-btn {
          color: #c4b5fd !important;
        }
        .quote-topbar-accent-btn:hover:not(:disabled) {
          background: var(--brand, #6d28d9) !important;
          color: #ffffff !important;
          box-shadow: 0 2px 8px rgba(109, 40, 217, 0.28) !important;
        }
        .dark .quote-topbar-accent-btn:hover:not(:disabled) {
          background: var(--brand, #7c3aed) !important;
          color: #ffffff !important;
        }
        .quote-topbar-pill {
          height: 33px !important;
          min-height: 33px !important;
          max-height: 33px !important;
          padding: 0 8px 0 10px !important;
          border-radius: 6px !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          background: color-mix(in srgb, var(--brand, #6d28d9) 12%, var(--surface, #ffffff)) !important;
          color: var(--brand, #6d28d9) !important;
          border: 1px solid color-mix(in srgb, var(--brand, #6d28d9) 32%, var(--border, #e2e8f0)) !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
          white-space: nowrap !important;
        }
        .dark .quote-topbar-pill {
          background: rgba(109, 40, 217, 0.2) !important;
          color: #c4b5fd !important;
          border-color: rgba(167, 139, 250, 0.4) !important;
        }
        .quote-topbar-remove-btn {
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          max-width: 18px !important;
          min-height: 18px !important;
          max-height: 18px !important;
          border-radius: 50% !important;
          background: rgba(239, 68, 68, 0.14) !important;
          color: #dc2626 !important;
          border: 1px solid rgba(239, 68, 68, 0.32) !important;
          padding: 0 !important;
          cursor: pointer !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          transition: all 0.15s ease !important;
          box-shadow: none !important;
          margin-left: 2px !important;
        }
        .dark .quote-topbar-remove-btn {
          background: rgba(239, 68, 68, 0.25) !important;
          color: #f87171 !important;
          border-color: rgba(239, 68, 68, 0.45) !important;
        }
        .quote-topbar-remove-btn:hover {
          background: #dc2626 !important;
          color: #ffffff !important;
          border-color: #dc2626 !important;
          transform: scale(1.12) !important;
        }
        .quote-topbar-remove-btn svg {
          width: 10px !important;
          height: 10px !important;
          stroke: currentColor !important;
          stroke-width: 2.8px !important;
          display: block !important;
        }
        .quote-topbar-primary-btn {
          height: 38px !important;
          min-height: 38px !important;
          max-height: 38px !important;
          padding: 0 18px !important;
          border-radius: 9px !important;
          font-size: 13px !important;
          font-weight: 750 !important;
          letter-spacing: 0.01em !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          background: linear-gradient(135deg, var(--brand, #7c3aed) 0%, color-mix(in srgb, var(--brand, #6d28d9) 85%, #000000) 100%) !important;
          color: #ffffff !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow: 0 4px 12px rgba(109, 40, 217, 0.35) !important;
          cursor: pointer !important;
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
          white-space: nowrap !important;
        }
        .dark .quote-topbar-primary-btn {
          background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45) !important;
        }
        .quote-topbar-primary-btn:hover:not(:disabled) {
          transform: translateY(-1.5px) !important;
          box-shadow: 0 6px 18px rgba(109, 40, 217, 0.45) !important;
          filter: brightness(1.06) !important;
        }
        .quote-media-thumb {
          height: 16px;
          width: 26px;
          object-fit: contain;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--surface-2);
        }
        .quote-template-name-label {
          font-size: 10px;
          font-weight: 800;
          color: var(--tx-4);
          text-transform: uppercase;
          letter-spacing: 0;
        }
        @media (max-width: 900px) {
          .proposals-page-container {
            width: 100% !important;
            max-width: 100vw !important;
            padding: 0 4px 60px !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          .quote-page-header,
          .quote-studio-header {
            width: 100% !important;
            max-width: 100% !important;
            padding: 12px 14px !important;
            gap: 12px !important;
            box-sizing: border-box !important;
            border-radius: 14px !important;
            margin-bottom: 14px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .quote-studio-header-title {
            width: 100% !important;
            gap: 10px !important;
          }
          .quote-actions-row,
          .quote-studio-header-actions {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            justify-content: flex-start !important;
          }
          .quotation-sheet-toolbar {
            width: 100% !important;
            max-width: 100% !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
          }
          .quotation-canvas-badge,
          .quotation-canvas-actions,
          .quotation-add-page-btn {
            width: 100% !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }
          .quotation-sheets-container {
            width: 100% !important;
            max-width: 100% !important;
            padding: 14px 6px 40px !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          .quotation-page-sheet,
          .a4-discrete-sheet,
          .card.quotation-card {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            min-height: auto !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            border-radius: 12px !important;
          }
          .quotation-sheet-header {
            padding: 16px 14px 0 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quotation-client-details-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            margin-bottom: 14px !important;
          }
          .quotation-card-body {
            padding: 12px 14px 20px 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quotation-text-footer {
            padding: 12px 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
        }
        @media (max-width: 640px) {
          .proposals-page-container {
            padding: 0 0 60px !important;
          }
          .quote-page-heading {
            width: 100%;
          }
          .quote-studio-header {
            padding: 10px 12px !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
          }
          .quote-studio-header .quote-topbar-primary-btn {
            width: 100% !important;
            min-height: 46px !important;
            height: 46px !important;
            font-size: 14px !important;
            font-weight: 750 !important;
            border-radius: 12px !important;
            order: -1 !important;
            justify-content: center !important;
          }
          .quote-studio-header .btn {
            min-height: 38px !important;
            height: 38px !important;
            font-size: 12px !important;
            border-radius: 10px !important;
          }
          .quote-config-panel {
            padding: 12px 14px !important;
            border-radius: 14px !important;
            margin-bottom: 12px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quote-config-top-grid,
          .quote-config-bottom-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .quote-config-field input.input {
            height: 44px !important;
            min-height: 44px !important;
            border-radius: 12px !important;
            font-size: 13.5px !important;
          }
          .quotation-sheets-container {
            padding: 10px 4px 36px !important;
            border-radius: 12px !important;
          }
          .a4-discrete-sheet,
          .card.quotation-card {
            border-radius: 12px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
          }
          .quotation-sheet-header {
            padding: 12px 10px 0 10px !important;
          }
          .quotation-client-details-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            margin-bottom: 14px !important;
          }
          .quote-details-card,
          .quotation-client-details-grid > div {
            padding: 12px 12px !important;
            border-radius: 10px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            min-width: 0 !important;
          }
          .quote-spec-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 6px 8px !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .quote-spec-row > span:first-child {
            font-size: 11.5px !important;
            flex-shrink: 0 !important;
          }
          .quote-spec-row input.quote-input-clean-normal {
            max-width: 100% !important;
            min-width: 0 !important;
            width: auto !important;
            flex: 1 1 120px !important;
            text-align: right !important;
          }
          .quotation-card-body {
            padding: 8px 8px 16px 8px !important;
          }
          .quotation-empty-canvas {
            padding: 24px 12px !important;
            border-radius: 10px !important;
            margin: 12px 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quotation-empty-canvas-actions {
            width: 100% !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .quotation-empty-canvas-actions .btn {
            width: 100% !important;
            min-height: 44px !important;
            height: 44px !important;
            font-size: 13.5px !important;
            font-weight: 700 !important;
            border-radius: 11px !important;
            justify-content: center !important;
          }
          .quote-rich-text-container {
            border-radius: 10px !important;
            margin-bottom: 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quote-rich-text-header {
            padding: 10px 10px !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            border-top-left-radius: 10px !important;
            border-top-right-radius: 10px !important;
          }
          .quote-rich-text-header > div:first-child {
            width: 100% !important;
            flex: 1 1 100% !important;
            margin-right: 0 !important;
          }
          .quote-rich-text-header > div:last-child {
            width: 100% !important;
            justify-content: flex-end !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          .quote-editor-toolbar {
            padding: 6px 6px !important;
            gap: 4px !important;
            flex-wrap: wrap !important;
          }
          .quote-editor-toolbar .quote-format-btn,
          .quote-editor-toolbar .quote-tool-btn,
          .quote-editor-toolbar .quote-tool-btn-text {
            min-height: 32px !important;
            height: 32px !important;
          }
          .quote-rich-text-content {
            padding: 10px 10px !important;
            font-size: 13px !important;
          }
          .quote-table-container {
            border-radius: 10px !important;
            margin-bottom: 14px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quote-table-container .no-print:first-child {
            padding: 10px 10px !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .quote-table-wrapper {
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          .quotation-items-table {
            min-width: 520px !important;
          }
          .quote-table-container .no-print:last-child {
            padding: 10px 10px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .quote-table-container .no-print:last-child button {
            width: 100% !important;
            min-height: 40px !important;
            height: 40px !important;
            font-size: 13px !important;
            border-radius: 10px !important;
            justify-content: center !important;
          }
          .quote-block-inserter {
            flex-direction: column !important;
            gap: 8px !important;
            width: 100% !important;
            margin: 14px 0 !important;
          }
          .quote-block-inserter .btn {
            width: 100% !important;
            min-height: 42px !important;
            height: 42px !important;
            font-size: 13px !important;
            border-radius: 10px !important;
            justify-content: center !important;
          }
          .quote-overall-total-container {
            border-radius: 10px !important;
            margin: 14px 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .quote-overall-total-container .no-print:first-child {
            padding: 8px 10px !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          .quote-overall-total-container > div:last-child {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            padding: 12px 10px !important;
          }
          .quote-overall-total-container > div:last-child > div:last-child {
            align-items: flex-start !important;
          }
          .quotation-text-footer {
            padding: 10px 8px !important;
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 4px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      {/* Top Professional Studio Toolbar */}
      <div
        className="no-print quote-studio-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '10px 18px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          marginBottom: 20,
          width: '100%',
        }}
      >
        <div className="quote-studio-header-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(isTemplateMode ? '/proposal-templates' : '/proposals')}
            title={isTemplateMode ? 'Back to Proposal Templates' : 'Back to Proposals'}
            style={{ width: 34, height: 34, minWidth: 34, padding: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tx-1)', letterSpacing: '-0.01em' }}>
                {isTemplateMode ? 'Proposal Templates' : 'Quotation Generator'}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(109, 40, 217, 0.1)',
                  color: 'var(--brand)',
                  border: '1px solid rgba(109, 40, 217, 0.2)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                {isTemplateMode ? (isEditMode ? 'Edit Template' : 'New Template') : (isEditMode ? 'Edit Proposal' : 'New Proposal')}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx-3)', marginTop: 1 }}>
              {isTemplateMode ? 'Design, customize, and manage reusable proposal templates' : 'Build, print, and export professional quotations'}
            </div>
          </div>
        </div>

        <div className="quote-studio-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Group 1: Branding / Banners Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--surface-2)',
              padding: '3px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              gap: 2,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setMediaTarget('header'); setIsMediaModalOpen(true); }}
              title="Select Header Banner Image (Recommended: 1400 x 220 px)"
              style={{
                height: 30,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 650,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                borderRadius: 6,
                background: headerImage ? 'var(--surface)' : 'transparent',
                border: headerImage ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <ImageIcon size={13} />
              <span>Header</span>
              {headerImage && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} title="Active" />
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setMediaTarget('footer'); setIsMediaModalOpen(true); }}
              title="Select Footer Banner Image (Recommended: 1400 x 110 px)"
              style={{
                height: 30,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 650,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                borderRadius: 6,
                background: footerImage ? 'var(--surface)' : 'transparent',
                border: footerImage ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <ImageIcon size={13} />
              <span>Footer</span>
              {footerImage && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} title="Active" />
              )}
            </button>
          </div>

          {/* Group 2: Insert Blocks */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleAddBlock('text')}
            title="Insert a text section"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, fontSize: 12.5, fontWeight: 650, padding: '0 11px' }}
          >
            <AlignLeft size={14} />
            <span>Add Text</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleAddBlock('table')}
            title="Insert a pricing table"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, fontSize: 12.5, fontWeight: 650, padding: '0 11px' }}
          >
            <Table size={14} />
            <span>Add Table</span>
          </button>

          {/* Group 3: Send Email / Send Proposal */}
          <button
            type="button"
            className="btn btn-success quote-topbar-btn"
            onClick={() => setShareModal({ isOpen: true, type: 'email' })}
            title={isTemplateMode ? "Send template directly via Email" : "Send proposal directly to client via Email"}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              fontSize: 12.5,
              fontWeight: 750,
              padding: '0 14px',
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
            }}
          >
            <Send size={14} />
            <span>{isTemplateMode ? 'Send Email' : 'Send Proposal'}</span>
          </button>

          {/* Direct 1-Click Server High-Res PDF Download (0 Margins, Full Bleed) */}
          {!isTemplateMode && (id || existingProposal?._id) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const targetId = id || existingProposal?._id;
                window.open(toApiUrl(`/public/proposals/${targetId}/pdf?download=1`), '_blank');
              }}
              title="Download 100% full-bleed PDF directly from server (No print dialog required)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, fontSize: 12.5, fontWeight: 700, padding: '0 13px', background: 'rgba(109, 40, 217, 0.08)', color: 'var(--brand)', borderColor: 'rgba(109, 40, 217, 0.25)' }}
            >
              <Download size={14} />
              <span>Download PDF</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrintQuotation}
            title="Print or export PDF (Ctrl+P / ⌘P)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, fontSize: 12.5, fontWeight: 700, padding: '0 13px' }}
          >
            <Printer size={14} />
            <span>Print / PDF</span>
            <kbd style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.06)',
              border: '1px solid rgba(0,0,0,0.12)',
              color: 'var(--tx-3)',
              fontWeight: 700,
              marginLeft: 2,
            }}>
              ⌘P
            </kbd>
          </button>

          <button
            type="button"
            className="btn btn-primary quote-topbar-primary-btn"
            onClick={() => saveProposalMutation.mutate('draft')}
            disabled={saveProposalMutation.isPending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, fontSize: 12.5, fontWeight: 750, padding: '0 16px' }}
          >
            <Save size={14} />
            <span>{isTemplateMode ? (isEditMode ? 'Update Template' : 'Save Template') : (isEditMode ? 'Update Proposal' : 'Save to CRM')}</span>
          </button>
        </div>
      </div>

      {/* Proposal Revision & Alteration Banner (when editing an existing proposal) */}
      {!isTemplateMode && isEditMode && (
        <div className="no-print" style={{ width: '100%', maxWidth: 794, margin: '0 auto 16px auto' }}>
          <div style={{
            background: 'rgba(124, 58, 237, 0.06)',
            border: '1px solid rgba(124, 58, 237, 0.25)',
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: '#7c3aed',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                Rev {(existingProposal?.revision || 0) + 1} Alteration
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--tx-1)' }}>
                  Proposal Revision & Negotiation Mode
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx-3)' }}>
                  Currently editing {existingProposal?.proposalNo || 'Proposal'} (Current: Rev {existingProposal?.revision || 0}). Updating will save as <b>Rev {(existingProposal?.revision || 0) + 1}</b>.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260, maxWidth: 500 }}>
              <input
                type="text"
                className="quote-input-clean-normal"
                placeholder="Negotiation note / reason for alteration (e.g. 10% discount negotiated)..."
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--surface-1)',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Top Template Configuration Panel (Template Name & Proposal Title) - shown when managing a template */}
      {isTemplateMode && (
        <div className="no-print" style={{ width: '100%', maxWidth: 794, margin: '0 auto 20px auto' }}>
          <div className="quote-config-panel no-print" style={{ marginBottom: 0 }}>
            <div className="quote-config-top-grid">
              <div className="quote-config-field">
                <label className="quote-config-label">
                  TEMPLATE NAME *
                </label>
                <input
                  className="input"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Enter reusable template name (e.g. Standard Proposal Template)..."
                  style={{
                    height: 42,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--tx-1)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '0 14px',
                    width: '100%'
                  }}
                />
              </div>

              <div className="quote-config-field">
                <label className="quote-config-label">
                  PROPOSAL TITLE
                </label>
                <input
                  className="input"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  placeholder="Enter proposal title (e.g. Service Quotation Template)..."
                  style={{
                    height: 42,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--tx-1)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '0 14px',
                    width: '100%'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Proposal Configuration Bar (Template, Customer Type, Select Lead) - shown when generating a proposal */}
      {!isTemplateMode && (
        <div className="no-print" style={{ width: '100%', maxWidth: 794, margin: '0 auto 20px auto' }}>
          <div className="quote-config-panel no-print" style={{ marginBottom: 0 }}>
          
          {/* Top Row: Template, Customer Type, Target Record */}
          <div className="quote-config-top-grid">
            {/* Proposal Template Selector */}
            <div className="quote-config-field">
              <label className="quote-config-label">
                PROPOSAL TEMPLATE
              </label>
              <Select
                value={selectedTemplateId}
                onChange={(val) => handleTemplateSelect(val)}
                options={[
                  { value: '', label: '— Select Template (Optional) —' },
                  ...templateOptions.map((t: any) => ({
                    value: t._id,
                    label: t.name
                  }))
                ]}
                placeholder="Search template..."
              />
            </div>

            {/* Task Dropdown */}
            <div className="quote-config-field">
              <label className="quote-config-label">
                SELECT TASK PROPOSAL {isEditMode ? '(OPTIONAL)' : '*'}
              </label>
              <Select
                value={selectedTaskId}
                onChange={(val) => {
                  setSelectedTaskId(val);
                  const t = (allTasks || []).find((tk: any) => tk._id === val);
                  handleTaskSelect(t);
                }}
                options={[
                  { value: '', label: '— Choose Task Proposal —' },
                  ...(allTasks || []).map((tk: any) => {
                    const clientName = tk.customer?.name || tk.lead?.companyName || tk.lead?.name || tk.ticket?.contactPerson || '';
                    return {
                      value: tk._id,
                      label: `${tk.taskNo ? `[${tk.taskNo}] ` : ''}${tk.title || 'Proposal Task'}${clientName ? ` — ${clientName}` : ''}${tk.assignedTo?.name ? ` (${tk.assignedTo.name})` : ''}`.trim()
                    };
                  })
                ]}
                placeholder="Search task proposal by ID or title..."
              />
            </div>
          </div>

          {/* Bottom Row: Recipient Emails */}
          {Boolean(selectedTaskId) && (
            <div className="quote-config-bottom-grid">
              {/* To Email — chip/tag multi-email input */}
              <div className="quote-config-field">
                <label className="quote-config-label">
                  TO EMAIL * <span className="quote-config-sublabel">(press Enter or comma to add multiple)</span>
                </label>
                <div
                  className="quote-email-chips-container"
                  onClick={(e) => { (e.currentTarget as HTMLElement).querySelector('input')?.focus(); }}
                >
                  {toEmailTags.map((tag, idx) => (
                    <span key={idx} className="quote-email-chip">
                      {tag}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeToEmailTag(idx); }}
                        className="quote-email-chip-remove"
                        title="Remove"
                      >×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={toEmailInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.endsWith(',') || val.endsWith(';')) { addToEmailTag(val.slice(0, -1)); }
                      else setToEmailInput(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addToEmailTag(toEmailInput); }
                      else if (e.key === 'Backspace' && toEmailInput === '' && toEmailTags.length > 0) removeToEmailTag(toEmailTags.length - 1);
                    }}
                    onBlur={() => { if (toEmailInput.trim()) addToEmailTag(toEmailInput); }}
                    placeholder={toEmailTags.length === 0 ? 'customer@email.com  ← press Enter' : 'Add another...'}
                    className="quote-email-chip-input"
                  />
                </div>
              </div>

              {/* CC Email — tag/chip multi-email input */}
              <div className="quote-config-field">
                <label className="quote-config-label">
                  CC EMAIL <span className="quote-config-sublabel">(optional · press Enter or comma to add)</span>
                </label>
                <div
                  className="quote-email-chips-container"
                  onClick={(e) => {
                    const inp = (e.currentTarget as HTMLElement).querySelector('input');
                    inp?.focus();
                  }}
                >
                  {ccEmailTags.map((tag, idx) => (
                    <span key={idx} className="quote-email-chip">
                      {tag}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeCcEmailTag(idx); }}
                        className="quote-email-chip-remove"
                        title="Remove"
                      >×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={ccEmailInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.endsWith(',') || val.endsWith(';')) {
                        addCcEmailTag(val.slice(0, -1));
                      } else {
                        setCcEmailInput(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addCcEmailTag(ccEmailInput);
                      } else if (e.key === 'Backspace' && ccEmailInput === '' && ccEmailTags.length > 0) {
                        removeCcEmailTag(ccEmailTags.length - 1);
                      }
                    }}
                    onBlur={() => { if (ccEmailInput.trim()) addCcEmailTag(ccEmailInput); }}
                    placeholder={ccEmailTags.length === 0 ? 'manager@email.com  ← press Enter' : 'Add another...'}
                    className="quote-email-chip-input"
                  />
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Main Layout: Discrete A4 Document Sheets */}
      <div className="quotation-sheets-container" style={{
        width: '100%',
        padding: '32px 24px 60px',
        background: 'var(--surface-2, #f1f5f9)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
      }}>
        {/* A4 Paper Sheets Summary Header */}
        <div className="no-print quotation-sheet-toolbar" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 794,
          maxWidth: '100%',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div className="quotation-canvas-badge" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--brand)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <FileText size={14} />
            <span>A4 Document Canvas · {pageChunks.length} {pageChunks.length === 1 ? 'Page' : 'Pages'} (210 × 297 mm)</span>
          </div>

          <div className="quotation-canvas-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm quotation-add-page-btn"
              onClick={() => handleAddBlock('text', blocks.length, true)}
              title="Add a new text section on a new A4 page"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
            >
              <Plus size={13} color="var(--brand)" />
              <span>+ New A4 Page</span>
            </button>
          </div>
        </div>

        {/* Page Sheets Mapping */}
        {pageChunks.map((chunk) => (
          <React.Fragment key={chunk.pageNum}>
            <div className="quotation-page-sheet" style={{ width: 794, maxWidth: '100%', margin: '0 auto' }}>
              {/* Printable Document Card — Discrete A4 white sheet */}
              <div
                className="card quotation-card a4-discrete-sheet"
                style={{
                  width: 794,
                  maxWidth: '100%',
                  background: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid rgba(0,0,0,0.12)',
                  padding: 0,
                  boxShadow: '0 8px 30px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  minHeight: 1123,
                  boxSizing: 'border-box',
                }}
              >
                {/* Floating Page Badge (no-print) */}
                <div className="no-print floating-page-badge" style={{
                  position: 'absolute',
                  top: 12,
                  right: 14,
                  zIndex: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 9px',
                  borderRadius: 6,
                  background: 'rgba(15, 23, 42, 0.82)',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  backdropFilter: 'blur(4px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>
                  <span>PAGE {chunk.pageNum} OF {pageChunks.length}</span>
                  {pageChunks.length > 1 && (
                    <button
                      type="button"
                      data-testid={`delete-page-${chunk.pageNum}`}
                      onClick={() => handleDeletePage(chunk.pageNum - 1)}
                      title={`Delete page ${chunk.pageNum}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        marginLeft: 4,
                        padding: '2px 7px',
                        border: '1px solid rgba(248, 113, 113, 0.7)',
                        borderRadius: 5,
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={11} /> Delete page
                    </button>
                  )}
                </div>

                {/* Watermark in background */}
                {proposalWatermark && (
                  <div
                    className="quotation-watermark"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      zIndex: 0,
                      opacity: 0.04,
                    }}
                  >
                    <img
                      src={toAssetUrl(proposalWatermark)}
                      alt="Watermark"
                      style={{
                        width: 'min(60%, 520px)',
                        height: 'auto',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                )}

                {/* TOP HEADER SECTION */}
                {chunk.isFirst ? (
                  <div>
                    {/* Header Image Banner (if set) */}
                    {headerImage && (
                      <div
                        className="quotation-header-banner"
                        style={{
                          width: '100%',
                          overflow: 'hidden',
                          borderTopLeftRadius: '6px',
                          borderTopRightRadius: '6px',
                          borderBottom: '1.5px solid var(--border, #e2e8f0)',
                          background: '#ffffff',
                          zIndex: 1,
                        }}
                      >
                        <img
                          src={toAssetUrl(headerImage)}
                          alt="Header Banner"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                    )}

                    <div className="quotation-sheet-header" style={{ padding: headerImage ? '24px 36px 0 36px' : '32px 36px 0 36px', position: 'relative', zIndex: 1 }}>
                      {/* Document Header & Metadata Box */}
                      {!headerImage ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
                            <div style={{ maxWidth: '420px', width: '100%' }}>
                              <input
                                className="quote-input-clean"
                                value={companyInfo.name}
                                onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                                placeholder="Company Name"
                                style={{ fontSize: '1.4rem', color: 'var(--brand)', fontWeight: 800, marginBottom: '4px' }}
                              />
                              <input
                                className="quote-input-clean-normal"
                                value={companyInfo.addressLine1}
                                onChange={(e) => setCompanyInfo({ ...companyInfo, addressLine1: e.target.value })}
                                placeholder="Company Address Line 1"
                                style={{ fontSize: '0.82rem' }}
                              />
                              <input
                                className="quote-input-clean-normal"
                                value={companyInfo.addressLine2}
                                onChange={(e) => setCompanyInfo({ ...companyInfo, addressLine2: e.target.value })}
                                placeholder="Company Address Line 2"
                                style={{ fontSize: '0.82rem' }}
                              />
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-3)' }}>Phone:</span>
                                <input
                                  className="quote-input-clean-normal"
                                  value={companyInfo.contactNo}
                                  onChange={(e) => setCompanyInfo({ ...companyInfo, contactNo: e.target.value })}
                                  placeholder="Company Phone"
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-3)' }}>Email:</span>
                                <input
                                  className="quote-input-clean-normal"
                                  value={companyInfo.email}
                                  onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                                  placeholder="Company Email"
                                />
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              {quotationDetails.quoteNo ? (
                                <div style={{ fontSize: '0.85rem', color: 'var(--brand)', fontWeight: 700, marginTop: '4px' }}>
                                  {quotationDetails.quoteNo}{existingProposal?.revision && existingProposal.revision > 0 ? ` (Rev ${existingProposal.revision})` : ''}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
                        </>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                          {quotationDetails.quoteNo ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--brand)', fontWeight: 700 }}>
                              {quotationDetails.quoteNo}{existingProposal?.revision && existingProposal.revision > 0 ? ` (Rev ${existingProposal.revision})` : ''}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Customer & Quote Details Grid */}
                      <div className="quotation-client-details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px', fontSize: '0.85rem' }}>
                        {/* Recipient Details Card */}
                        <div className="quote-details-card" style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-3)', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                            <Building size={14} color="var(--brand)" />
                            <span>Recipient Information</span>
                          </div>
                          {isTemplateMode ? (
                            <div style={{ padding: '14px 16px', background: 'rgba(109, 40, 217, 0.03)', borderRadius: '10px', border: '1px dashed rgba(109, 40, 217, 0.25)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.86rem', color: 'var(--brand)' }}>
                                <Sparkles size={14} />
                                <span>Dynamic Client & Lead Details</span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--tx-3)', lineHeight: 1.5 }}>
                                Client company name, phone, address, and email will be dynamically populated when creating a proposal from a Task or Lead.
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <input
                                className="quote-input-clean"
                                value={clientInfo.company}
                                onChange={(e) => setClientInfo({ ...clientInfo, company: e.target.value })}
                                placeholder="Client / Company Name"
                                style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--tx-1)', marginBottom: '2px' }}
                              />
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-3)', width: 90, fontSize: 12 }}>Contact Name:</span>
                                <input
                                  className="quote-input-clean-normal"
                                  value={clientInfo.contactName || ''}
                                  onChange={(e) => setClientInfo({ ...clientInfo, contactName: e.target.value })}
                                  placeholder="Contact Person Name"
                                />
                              </div>
                              <input
                                className="quote-input-clean-normal"
                                value={clientInfo.address1}
                                onChange={(e) => setClientInfo({ ...clientInfo, address1: e.target.value })}
                                placeholder="Client Address Line 1"
                              />
                              <input
                                className="quote-input-clean-normal"
                                value={clientInfo.address2}
                                onChange={(e) => setClientInfo({ ...clientInfo, address2: e.target.value })}
                                placeholder="Client Address Line 2"
                              />
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-3)', width: 90, fontSize: 12 }}>Phone:</span>
                                <input className="quote-input-clean-normal" value={clientInfo.phone} onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })} placeholder="Phone / Mobile" />
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-3)', width: 90, fontSize: 12 }}>Email:</span>
                                <input className="quote-input-clean-normal" value={clientInfo.email} onChange={(e) => setClientInfo({ ...clientInfo, email: e.target.value })} placeholder="customer@email.com" />
                              </div>
                              {ccEmailTags.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--tx-3)', width: 90, fontSize: 12, paddingTop: 2 }}>CC Email:</span>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                                    {ccEmailTags.map((tag, idx) => (
                                      <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--brand)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
                                        {tag}
                                        <button type="button" onClick={() => removeCcEmailTag(idx)} className="no-print" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, fontWeight: 900 }}>×</button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Template / Quotation Specifications Card */}
                        <div className="quote-details-card" style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-3)', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                            <FileText size={14} color="var(--brand)" />
                            <span>{isTemplateMode ? 'Template Specifications' : 'Document Specifications'}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {!isTemplateMode && (
                              <>
                                <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Quote Number:</span>
                                  <input className="quote-input-clean-normal" value={quotationDetails.quoteNo} onChange={(e) => setQuotationDetails({ ...quotationDetails, quoteNo: e.target.value })} placeholder="Quote No (e.g. WT-Q20260101)" style={{ maxWidth: 160, textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }} />
                                </div>

                                {existingProposal?.revision && existingProposal.revision > 0 ? (
                                  <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Revision:</span>
                                    <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: 12 }}>
                                      Rev {existingProposal.revision} (Revised)
                                    </span>
                                  </div>
                                ) : null}

                                <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Quote Date:</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                                    <input
                                      className="quote-input-clean-normal"
                                      value={quotationDetails.quoteDate}
                                      onChange={(e) => handleQuoteDateChange(e.target.value)}
                                      placeholder="e.g. 28 Aug 2026"
                                      style={{ width: 110, textAlign: 'right' }}
                                    />
                                    <label className="no-print" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tx-3)', position: 'relative' }} title="Pick Quote Date">
                                      <Calendar size={14} />
                                      <input
                                        type="date"
                                        value={getIsoQuoteDate()}
                                        onChange={(e) => handleQuoteDateChange(e.target.value)}
                                        style={{
                                          position: 'absolute',
                                          opacity: 0,
                                          width: '100%',
                                          height: '100%',
                                          cursor: 'pointer',
                                          top: 0,
                                          left: 0
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </>
                            )}

                            <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Validity Period:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <input
                                  type="number"
                                  className="quote-input-clean-normal"
                                  value={validForDays}
                                  onChange={(e) => setValidForDays(parseInt(e.target.value) || 0)}
                                  style={{ width: 36, fontWeight: 800, textAlign: 'center', padding: 0 }}
                                />
                                <span style={{ fontSize: '0.78rem', color: 'var(--tx-4)', fontWeight: 700 }}>Days</span>
                              </div>
                            </div>

                            {!isTemplateMode && (
                              <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Valid Until:</span>
                                <input className="quote-input-clean-normal" value={quotationDetails.validUntil} onChange={(e) => setQuotationDetails({ ...quotationDetails, validUntil: e.target.value })} style={{ maxWidth: 120, textAlign: 'right' }} />
                              </div>
                            )}

                            <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Sender Email:</span>
                              <input
                                className="quote-input-clean-normal"
                                value={senderEmail}
                                onChange={(e) => setSenderEmail(e.target.value)}
                                placeholder={currentUser?.email || "sender@welcometech.qa"}
                                style={{ maxWidth: 170, textAlign: 'right' }}
                              />
                            </div>

                            <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Contact No:</span>
                              <input
                                className="quote-input-clean-normal"
                                value={senderPhone}
                                onChange={(e) => setSenderPhone(e.target.value)}
                                placeholder={currentUser?.phone || "+974 ..."}
                                style={{ maxWidth: 140, textAlign: 'right' }}
                              />
                            </div>

                            {(isTemplateMode || (discountPercent !== undefined && discountPercent > 0)) && (
                              <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Default Discount:</span>
                                <span style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 800 }}>
                                  {discountPercent || 0}%
                                </span>
                              </div>
                            )}

                            <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Status:</span>
                              <ThemeDropdown
                                aria-label="Status"
                                value={quoteStatus}
                                onChange={(val) => setQuoteStatus(val)}
                                size="sm"
                                align="right"
                                minMenuWidth={120}
                                options={
                                  isTemplateMode
                                    ? [
                                        { value: 'active', label: 'Active', dotColor: '#16a34a' },
                                        { value: 'inactive', label: 'Inactive', dotColor: '#64748b' },
                                        { value: 'draft', label: 'Draft', dotColor: '#f59e0b' },
                                      ]
                                    : [
                                        { value: 'draft', label: 'Draft', dotColor: '#f59e0b' },
                                        { value: 'sent', label: 'Sent', dotColor: '#3b82f6' },
                                        { value: 'accepted', label: 'Accepted', dotColor: '#16a34a' },
                                        { value: 'rejected', label: 'Rejected', dotColor: '#ef4444' },
                                      ]
                                }
                              />
                            </div>

                            <div className="quote-spec-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: 'var(--tx-2)', fontSize: 12 }}>Overall Total:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: isOverallTotalVisible ? 'var(--brand)' : 'var(--tx-4)' }}>
                                  {isOverallTotalVisible ? 'Visible' : 'Hidden'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isOverallTotalVisible) {
                                      handleDeleteOverallTotal();
                                    } else {
                                      handleAddOverallTotal();
                                    }
                                  }}
                                  style={{
                                    background: isOverallTotalVisible ? 'rgba(239, 68, 68, 0.08)' : 'var(--brand-surface, rgba(109, 40, 217, 0.08))',
                                    border: isOverallTotalVisible ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--brand)',
                                    color: isOverallTotalVisible ? '#dc2626' : 'var(--brand)',
                                    borderRadius: 6,
                                    padding: '2px 8px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isOverallTotalVisible ? 'Delete' : 'Add'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Continuation Page Header for Page 2+
                  headerImage ? (
                    <div>
                      <div
                        className="quotation-header-banner"
                        style={{
                          width: '100%',
                          overflow: 'hidden',
                          borderTopLeftRadius: '6px',
                          borderTopRightRadius: '6px',
                          borderBottom: '1.5px solid var(--border, #e2e8f0)',
                          background: '#ffffff',
                          zIndex: 1,
                        }}
                      >
                        <img
                          src={toAssetUrl(headerImage)}
                          alt="Header Banner"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 36px 8px 36px',
                        borderBottom: '1px solid var(--border)',
                        background: '#ffffff',
                        position: 'relative',
                        zIndex: 1
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--brand)' }}>{companyInfo.name || companyName || 'WelcomeTech CRM'}</span>
                          {quotationDetails.quoteNo && (
                            <span style={{ fontSize: 11.5, color: 'var(--tx-3)', fontWeight: 600 }}>· Quotation {quotationDetails.quoteNo}</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: 'var(--brand)',
                          background: 'var(--brand-light, rgba(109,40,217,0.08))',
                          padding: '2px 8px',
                          borderRadius: 5,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}>
                          Page {chunk.pageNum} of {pageChunks.length}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Running Page Header without Header Image for Page 2+
                    <div
                      className="quotation-running-subhead"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 36px',
                        borderBottom: '1px solid var(--border, #e2e8f0)',
                        background: '#ffffff',
                        position: 'relative',
                        zIndex: 1,
                        width: '100%',
                        boxSizing: 'border-box',
                        flexShrink: 0
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>{companyInfo.name || companyName || 'WelcomeTech CRM'}</span>
                        {quotationDetails.quoteNo && (
                          <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 600 }}>· Quotation {quotationDetails.quoteNo}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--brand)',
                        background: 'var(--brand-light, rgba(109,40,217,0.08))',
                        padding: '3px 10px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        Page {chunk.pageNum} of {pageChunks.length}
                      </div>
                    </div>
                  )
                )}

                {/* MIDDLE CONTENT: BLOCKS FOR THIS PAGE */}
                <div
                  className="quotation-card-body"
                  style={{
                    padding: '16px 36px 20px 36px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    zIndex: 1,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {chunk.slices.length === 0 ? (
                    <div className="no-print quotation-empty-canvas" style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '36px 20px', textAlign: 'center', background: 'var(--surface-2)', margin: '20px 0' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)', marginBottom: 6 }}>Document Canvas Empty</div>
                      <div style={{ fontSize: 12, color: 'var(--tx-4)', marginBottom: 20 }}>Insert a Text Container or Tabular Column to build your quotation document.</div>
                      <div className="quotation-empty-canvas-actions" style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAddBlock('text')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <AlignLeft size={14} /> + Add Text Container
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddBlock('table')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Table size={14} /> + Add Tabular Column
                        </button>
                      </div>
                    </div>
                  ) : (
                    chunk.slices.map((slice) => {
                      const { block, globalIndex, sliceIndex, itemsSlice, isTableContinuation, isTableEnd } = slice;
                      const itemsToRender = itemsSlice !== undefined ? itemsSlice : (block.items || []);
                      return (
                        <React.Fragment key={`${block.id}_slice_${sliceIndex}`}>
                          {block.type === 'text' ? (
                            <RichTextContainer
                              key={`${block.id}_slice_${sliceIndex}`}
                              block={block}
                              index={globalIndex}
                              totalBlocks={blocks.length}
                              sliceIndex={sliceIndex}
                              contentSlice={slice.contentSlice}
                              isContinuation={slice.isTextContinuation}
                              isEnd={slice.isTextEnd}
                              pageNum={chunk.pageNum}
                              pageRoom={chunk.maxWeight !== undefined && chunk.usedWeight !== undefined ? chunk.maxWeight - chunk.usedWeight : undefined}
                              onTitleChange={(id, val) => handleBlockTextChange(id, 'title', val)}
                              onContentChange={(id, htmlContent) => handleBlockSliceChange(id, sliceIndex, htmlContent)}
                              onMove={(idx, dir) => handleMoveBlock(idx, dir)}
                              onRemove={(id) => handleRemoveBlock(id)}
                              onTogglePageBreak={() => handleTogglePageBreak(block.id)}
                              onSplitBlock={(id, before, after) => handleSplitBlock(id, before, after)}
                            />
                          ) : (
                            <div className={`quote-table-container ${block.pageBreak && !isTableContinuation ? 'quote-page-break-before' : ''}`} style={{ flexShrink: 0, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#ffffff', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)' }}>
                              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--brand)', color: '#ffffff', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(109, 40, 217, 0.25)' }}>
                                    <Table size={12} /> Pricing Table #{globalIndex + 1}{isTableContinuation ? ' (Continued)' : ''}
                                  </span>
                                  {isTableContinuation ? (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: 'rgba(109,40,217,0.08)', padding: '2px 8px', borderRadius: 5 }}>
                                      Continued from Page {chunk.pageNum - 1} · {itemsToRender.length} items on this page
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-3)' }}>
                                      {(block.items || []).filter((i: any) => i.type === 'item').length} Line Items Total
                                    </span>
                                  )}
                                </div>
                                {!isTableContinuation && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <button
                                      type="button"
                                      className="quote-tool-btn-text"
                                      onClick={() => handleTogglePageBreak(block.id)}
                                      style={{
                                        color: block.pageBreak ? 'var(--brand)' : 'var(--tx-3)',
                                        background: block.pageBreak ? 'var(--brand-light, rgba(109,40,217,0.1))' : 'transparent',
                                        border: block.pageBreak ? '1px solid var(--brand)' : '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: '0 8px',
                                        height: 28,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                      }}
                                      title={block.pageBreak ? "A4 Page Break active (Starts on new page) — Click to remove" : "Click to force this table to start on a new A4 page"}
                                    >
                                      <FileText size={13} />
                                      <span>{block.pageBreak ? 'Page Break' : 'A4 Break'}</span>
                                    </button>
                                    <button type="button" className="quote-tool-btn" disabled={globalIndex === blocks.length - 1} onClick={() => handleMoveBlock(globalIndex, 'down')} title="Move Table Down"><ChevronDown size={14} /></button>
                                    <button type="button" className="quote-tool-btn" style={{ color: '#ef4444' }} onClick={() => handleRemoveBlock(block.id)} title="Remove Table"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </div>

                              <div className="quote-table-wrapper" style={{ overflowX: 'auto', background: '#ffffff', borderRadius: 'inherit' }}>
                                <table className="table quotation-items-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', fontSize: '0.85rem', margin: 0, background: '#ffffff' }}>
                                  <colgroup>
                                    <col style={{ width: 44 }} />
                                    <col />
                                    <col style={{ width: 68 }} />
                                    <col style={{ width: 130 }} />
                                    <col style={{ width: 140 }} />
                                    <col className="no-print" style={{ width: 36 }} />
                                  </colgroup>
                                  <thead>
                                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
                                      <th style={{ width: 44, textAlign: 'center', padding: '11px 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-2)', borderTopLeftRadius: isTableContinuation ? 7 : 0 }}>No</th>
                                      <th style={{ padding: '11px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-2)' }}>Description</th>
                                      <th style={{ width: 68, textAlign: 'center', padding: '11px 8px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-2)' }}>Qty</th>
                                      <th style={{ width: 130, textAlign: 'right', padding: '11px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-2)' }}>Unit Price ({getActiveCurrency()})</th>
                                      <th style={{ width: 140, textAlign: 'right', padding: '11px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-2)' }}>Amount ({getActiveCurrency()})</th>
                                      <th className="no-print" style={{ width: 36, textAlign: 'center', padding: '11px 4px', borderTopRightRadius: isTableContinuation ? 7 : 0 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody style={{ background: '#ffffff' }}>
                                    {itemsToRender.map((item: any, itemIdx: number) => {
                                      const lineAmount = item.type === 'item' ? (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.unitPrice)) || 0) : 0;
                                      if (item.type === 'detail') {
                                        return (
                                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0, 0, 0, 0.015)' }}>
                                            <td style={{ padding: '6px 8px' }}></td>
                                            <td style={{ padding: '6px 14px' }}>
                                              <textarea
                                                className="quote-input-clean-normal"
                                                value={item.description}
                                                onChange={(e) => handleBlockItemFieldChange(block.id, item.id, 'description', e.target.value)}
                                                placeholder="Specification / note detail..."
                                                rows={Math.max(1, (item.description || '').split('\n').length)}
                                                style={{ fontWeight: 400, color: 'var(--tx-3)', width: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word', resize: 'none', overflow: 'hidden', display: 'block', lineHeight: 1.45, fontFamily: 'inherit', fontSize: 'inherit', border: 'none', background: 'transparent', padding: '2px 0' }}
                                              />
                                            </td>
                                            <td style={{ padding: '6px 8px' }}></td>
                                            <td style={{ padding: '6px 14px' }}></td>
                                            <td style={{ padding: '6px 14px' }}></td>
                                            <td className="no-print" style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                                              <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleBlockRemoveItem(block.id, item.id)}
                                                style={{ padding: '2px 6px', color: '#ef4444' }}
                                                title="Remove item"
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      }
                                      return (
                                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
                                          <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--tx-3)', fontWeight: 600, fontSize: '0.82rem', verticalAlign: 'middle' }}>
                                            {item.no}
                                          </td>
                                          <td style={{ padding: '7px 14px', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                            <textarea
                                              className="quote-input-clean-normal"
                                              value={item.description}
                                              onChange={(e) => handleBlockItemFieldChange(block.id, item.id, 'description', e.target.value)}
                                              placeholder="Item description..."
                                              rows={Math.max(1, (item.description || '').split('\n').length)}
                                              style={{ fontWeight: 600, color: 'var(--tx-1)', width: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word', resize: 'none', overflow: 'hidden', display: 'block', lineHeight: 1.45, fontFamily: 'inherit', fontSize: 'inherit', border: 'none', background: 'transparent', padding: '2px 0' }}
                                            />
                                          </td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                            <input
                                              type="number"
                                              className="quote-table-input"
                                              value={item.qty}
                                              onChange={(e) => handleBlockItemFieldChange(block.id, item.id, 'qty', e.target.value)}
                                              style={{ width: '100%', maxWidth: '52px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td style={{ padding: '6px 14px', textAlign: 'right', verticalAlign: 'middle' }}>
                                            <input
                                              type="number"
                                              step="0.01"
                                              className="quote-table-input"
                                              value={item.unitPrice}
                                              onChange={(e) => handleBlockItemFieldChange(block.id, item.id, 'unitPrice', e.target.value)}
                                              style={{ width: '100%', maxWidth: '96px', textAlign: 'right' }}
                                              placeholder="0.00"
                                            />
                                          </td>
                                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, verticalAlign: 'middle' }}>
                                            {lineAmount > 0 ? (
                                              <span style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono, monospace)' }}>
                                                {lineAmount.toFixed(2)}
                                              </span>
                                            ) : (
                                              <span
                                                style={{
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: 3,
                                                  background: 'rgba(34, 197, 94, 0.14)',
                                                  color: '#16a34a',
                                                  border: '1px solid rgba(34, 197, 94, 0.35)',
                                                  padding: '2px 8px',
                                                  borderRadius: 6,
                                                  fontSize: '0.74rem',
                                                  fontWeight: 800,
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase'
                                                }}
                                              >
                                                FREE
                                              </span>
                                            )}
                                          </td>
                                          <td className="no-print" style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                                            <button
                                              className="btn btn-ghost btn-sm"
                                              onClick={() => handleBlockRemoveItem(block.id, item.id)}
                                              style={{ padding: '2px 6px', color: '#ef4444' }}
                                              title="Remove item"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot style={{ background: '#ffffff' }}>
                                    {isTableEnd ? (
                                      <>
                                        {calculateBlockDiscount(block) > 0 ? (
                                          <>
                                            <tr style={{ borderTop: '1px solid var(--border)' }}>
                                              <td colSpan={4} style={{ textAlign: 'right', padding: '8px 14px', fontWeight: 600, color: 'var(--tx-3)', fontSize: '0.84rem', border: 'none', whiteSpace: 'nowrap' }}>
                                                Subtotal:
                                              </td>
                                              <td style={{ textAlign: 'right', padding: '8px 14px', fontWeight: 700, color: 'var(--tx-1)', fontFamily: 'monospace', fontSize: '0.88rem', border: 'none', whiteSpace: 'nowrap' }}>
                                                {getActiveCurrency()} {calculateBlockSubtotal(block).toFixed(2)}
                                              </td>
                                              <td className="no-print" style={{ width: 36, border: 'none' }}></td>
                                            </tr>
                                            <tr>
                                              <td colSpan={4} style={{ textAlign: 'right', padding: '6px 14px', fontWeight: 700, color: '#dc2626', fontSize: '0.84rem', border: 'none', whiteSpace: 'nowrap' }}>
                                                Discount ({block.discountType === 'amount' ? 'Amount' : `${block.discountPercent}%`}):
                                              </td>
                                              <td style={{ textAlign: 'right', padding: '6px 14px', fontWeight: 700, color: '#dc2626', fontFamily: 'monospace', fontSize: '0.88rem', border: 'none', whiteSpace: 'nowrap' }}>
                                                -{getActiveCurrency()} {calculateBlockDiscount(block).toFixed(2)}
                                              </td>
                                              <td className="no-print" style={{ width: 36, border: 'none' }}></td>
                                            </tr>
                                          </>
                                        ) : null}
                                        <tr style={{ borderTop: '1px solid var(--border)', background: '#ffffff' }}>
                                          <td colSpan={4} style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 800, color: 'var(--tx-1)', fontSize: '0.92rem', border: 'none', whiteSpace: 'nowrap' }}>
                                            Table Total:
                                          </td>
                                          <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 900, color: 'var(--brand)', fontFamily: 'monospace', fontSize: '1.08rem', border: 'none', whiteSpace: 'nowrap' }}>
                                            {getActiveCurrency()} {calculateBlockTotal(block).toFixed(2)}
                                          </td>
                                          <td className="no-print" style={{ width: 36, border: 'none' }}></td>
                                        </tr>
                                        <tr style={{ borderTop: '1px solid var(--border)', background: '#ffffff' }}>
                                          <td colSpan={5} style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--tx-2)', border: 'none', borderBottomLeftRadius: 7 }}>
                                            <span style={{ fontWeight: 800, color: 'var(--tx-3)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 8 }}>Amount in Words:</span>
                                            <span style={{ color: 'var(--tx-1)', fontWeight: 600, fontStyle: 'italic' }}>{amountToWords(calculateBlockTotal(block), country)}</span>
                                          </td>
                                          <td className="no-print" style={{ width: 36, border: 'none', borderBottomRightRadius: 7 }}></td>
                                        </tr>
                                      </>
                                    ) : (
                                      <tr style={{ borderTop: '1.5px dashed var(--border)', background: 'var(--surface-2, #f8fafc)' }}>
                                        <td colSpan={5} style={{ padding: '9px 14px', fontSize: '0.82rem', color: 'var(--brand)', textAlign: 'right', fontWeight: 700, fontStyle: 'italic', border: 'none', borderBottomLeftRadius: 7 }}>
                                          ↳ Pricing Table #{globalIndex + 1} continues on Page {chunk.pageNum + 1}...
                                        </td>
                                        <td className="no-print" style={{ width: 36, border: 'none', borderBottomRightRadius: 7 }}></td>
                                      </tr>
                                    )}
                                  </tfoot>
                                </table>
                              </div>

                              {isTableEnd && (
                                <div className="quote-table-total-bar no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#ffffff', borderTop: '1px solid var(--border)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, flexWrap: 'wrap', gap: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      onClick={() => handleBlockAddItem(block.id)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                      <Plus size={14} />
                                      <span>Add Item</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => handleBlockAddDetailLine(block.id)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                      <Plus size={14} />
                                      <span>Add Note / Detail</span>
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Table Discount:</span>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '3px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                      <input
                                        type="number"
                                        step={block.discountType === 'amount' ? "1" : "0.1"}
                                        min="0"
                                        className="quote-input-clean"
                                        value={block.discountPercent ?? 0}
                                        onChange={(e) => handleBlockDiscountChange(block.id, parseFloat(e.target.value) || 0)}
                                        style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', width: block.discountType === 'amount' ? 64 : 44, padding: 0, textAlign: 'center' }}
                                      />
                                      <ThemeDropdown<'percent' | 'amount'>
                                        aria-label="Table Discount Type"
                                        value={block.discountType || 'percent'}
                                        onChange={(val) => handleBlockDiscountTypeChange(block.id, val)}
                                        size="sm"
                                        align="right"
                                        minMenuWidth={95}
                                        options={[
                                          { value: 'percent', label: '%' },
                                          { value: 'amount', label: 'Amount' },
                                        ]}
                                        triggerStyle={{
                                          border: 'none',
                                          background: 'transparent',
                                          padding: '1px 3px',
                                          fontSize: 12,
                                          fontWeight: 800,
                                          color: 'var(--brand)',
                                          boxShadow: 'none',
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline Section Inserter */}
                          {isTableEnd !== false && slice.isTextEnd !== false && (
                            <div className="no-print quote-block-inserter" style={{ flexShrink: 0, margin: '22px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleAddBlock('text', globalIndex + 1)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                <AlignLeft size={14} color="var(--brand)" />
                                <span>+ Text Section</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleAddBlock('table', globalIndex + 1)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                <Table size={14} color="var(--brand)" />
                                <span>+ Pricing Table</span>
                              </button>
                              {!isOverallTotalVisible && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={handleAddOverallTotal}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                  title="Add Overall Quotation Total summary section"
                                >
                                  <Calculator size={14} color="var(--brand)" />
                                  <span>+ Overall Total</span>
                                </button>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}

                  {/* Overall Quotation Summary Row on last page */}
                  {chunk.isLast && isOverallTotalVisible && (
                    <div
                      className="quote-overall-total-container"
                      style={{
                        position: 'relative',
                        marginBottom: '20px',
                        marginTop: '16px',
                        border: '2px solid var(--brand)',
                        borderRadius: 10,
                        background: 'var(--surface-2)',
                        overflow: 'hidden',
                        boxShadow: '0 4px 14px rgba(109, 40, 217, 0.08)',
                      }}
                    >
                      {/* Section Toolbar Header (no-print) */}
                      <div
                        className="no-print"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'var(--surface, #ffffff)',
                          padding: '8px 16px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              background: 'var(--brand)',
                              color: '#ffffff',
                              padding: '3px 8px',
                              borderRadius: 5,
                              boxShadow: '0 1px 3px rgba(109, 40, 217, 0.25)',
                            }}
                          >
                            <Calculator size={12} /> Overall Quotation Summary
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-4)' }}>
                            Auto-calculated from {tableCount} table{tableCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="quote-tool-btn-text"
                            onClick={() => setIsEditingOverallTotal(prev => !prev)}
                            style={{
                              color: isEditingOverallTotal ? '#ffffff' : 'var(--brand)',
                              background: isEditingOverallTotal ? 'var(--brand)' : 'var(--brand-light, rgba(109, 40, 217, 0.08))',
                              border: '1px solid var(--brand)',
                              borderRadius: 6,
                              padding: '0 10px',
                              height: 28,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="Edit Title, Notes, or display options"
                          >
                            <Edit3 size={12} />
                            <span>{isEditingOverallTotal ? 'Close Settings' : 'Edit Section'}</span>
                          </button>

                          <button
                            type="button"
                            className="quote-tool-btn"
                            style={{ color: '#ef4444' }}
                            onClick={handleDeleteOverallTotal}
                            title="Delete Overall Total Section"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Edit Settings Drawer (no-print) */}
                      {isEditingOverallTotal && (
                        <div
                          className="no-print"
                          style={{
                            padding: '12px 16px',
                            background: 'var(--surface-hover, #f1f5f9)',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', marginBottom: 4 }}>
                                Custom Summary Title / Label:
                              </label>
                              <input
                                className="quote-input-clean-normal"
                                value={overallTotalConfig.label ?? 'Overall Quotation Total:'}
                                onChange={(e) => setOverallTotalConfig(prev => ({ ...prev, label: e.target.value }))}
                                placeholder="Overall Quotation Total:"
                                style={{
                                  width: '100%',
                                  background: 'var(--surface, #ffffff)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: 'var(--tx-1)',
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', marginBottom: 4 }}>
                                Display Options:
                              </label>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--tx-2)', cursor: 'pointer', marginTop: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={overallTotalConfig.showWords !== false}
                                  onChange={(e) => setOverallTotalConfig(prev => ({ ...prev, showWords: e.target.checked }))}
                                  style={{ accentColor: 'var(--brand)', cursor: 'pointer' }}
                                />
                                Show "Amount in Words"
                              </label>
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx-3)', marginBottom: 4 }}>
                              Summary Notes / Payment Schedule / Terms (Shown on Left Side):
                            </label>
                            <textarea
                              rows={2}
                              value={overallTotalConfig.notes ?? ''}
                              onChange={(e) => setOverallTotalConfig(prev => ({ ...prev, notes: e.target.value }))}
                              placeholder="e.g. Prices valid for 30 days. Payment terms: 50% advance, 50% upon completion."
                              style={{
                                width: '100%',
                                background: 'var(--surface, #ffffff)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '6px 10px',
                                fontSize: 12,
                                color: 'var(--tx-1)',
                                outline: 'none',
                                resize: 'vertical',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Main Overall Total Box Content */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-end',
                          gap: 16,
                          padding: '14px 18px',
                        }}
                      >
                        {/* Left Side: Notes or empty space */}
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          {overallTotalConfig.notes ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--tx-2)', whiteSpace: 'pre-line', lineHeight: 1.45, fontWeight: 550 }}>
                              {overallTotalConfig.notes}
                            </div>
                          ) : (
                            isEditingOverallTotal ? (
                              <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--tx-4)' }}>
                                (Type notes above to display them here)
                              </span>
                            ) : null
                          )}
                        </div>

                        {/* Right Side: Total & Words */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--tx-1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span>{overallTotalConfig.label || 'Overall Quotation Total:'}</span>
                            <span style={{ color: 'var(--brand)' }}>{getActiveCurrency()} {finalGrandTotal.toFixed(2)}</span>
                          </div>
                          {overallTotalConfig.showWords !== false && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--tx-2)', fontStyle: 'italic' }}>
                              <span style={{ fontWeight: 700, color: 'var(--tx-1)', fontStyle: 'normal', marginRight: 6 }}>Amount in Words:</span>
                              {amountToWords(finalGrandTotal, country)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTTOM FOOTER SECTION */}
                {footerImage ? (
                  <div style={{ marginTop: 'auto', width: '100%' }}>
                    <div
                      className="quotation-footer-banner"
                      style={{
                        width: '100%',
                        overflow: 'hidden',
                        borderTop: '1.5px solid var(--border, #cbd5e1)',
                        background: '#ffffff',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      <img
                        src={toAssetUrl(footerImage)}
                        alt="Footer Banner"
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          borderRadius: 0,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  // Running Page Footer without footer image on all pages
                  <div
                    className="quotation-text-footer"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 36px',
                      borderTop: '1px solid var(--border, #e2e8f0)',
                      fontSize: 11,
                      color: 'var(--tx-4)',
                      background: '#ffffff',
                      position: 'relative',
                      zIndex: 1,
                      marginTop: 'auto',
                      width: '100%',
                      boxSizing: 'border-box',
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--tx-2)' }}>{companyInfo.name || companyName || 'WelcomeTech CRM'}</span>
                      <span style={{ color: 'var(--tx-4)' }}>·</span>
                      <span>Confidential Quotation</span>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--tx-3)' }}>
                      Page {chunk.pageNum} of {pageChunks.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Page Break Divider between A4 Sheets */}
            {!chunk.isLast && (
              <div className="no-print a4-page-divider" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                margin: '28px auto',
                width: 794,
                maxWidth: '100%'
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--tx-3)',
                  letterSpacing: '0.04em',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}>
                  <FileText size={12} color="var(--brand)" />
                  <span>END OF PAGE {chunk.pageNum} · NEXT: PAGE {chunk.pageNum + 1}</span>
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Media Library Picker Modal */}
      <Modal
        open={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        title={`Select ${mediaTarget === 'header' ? 'Header Image / Logo' : 'Footer Banner'} from Media Library`}
        size="xl"
      >
        <div style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-1)' }}>
              {mediaTarget === 'header' ? '📐 Recommended Header Banner Dimension:' : '📐 Recommended Footer Banner Dimension:'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
              {mediaTarget === 'header' 
                ? 'Optimal Canvas: 1400 × 220 px (or 1200 × 190 px, ~6.5:1 ratio). Transparent or white background.' 
                : 'Optimal Canvas: 1400 × 110 px (or 1200 × 90 px, ~13:1 ratio). Transparent or white background.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {((mediaTarget === 'header' && headerImage) || (mediaTarget === 'footer' && footerImage)) && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (mediaTarget === 'header') {
                    setHeaderImage('');
                    toast.success('Header image removed');
                  } else {
                    setFooterImage('');
                    toast.success('Footer image removed');
                  }
                  setIsMediaModalOpen(false);
                }}
                style={{ color: '#dc2626', borderColor: '#fecaca', fontSize: 12, height: 32, fontWeight: 700 }}
              >
                <Trash2 size={13} /> Remove Banner
              </button>
            )}
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)', background: 'var(--brand-light)', padding: '6px 12px', borderRadius: 8 }}>
              {mediaTarget === 'header' ? '1400 × 220 px' : '1400 × 110 px'}
            </span>
          </div>
        </div>

        <MediaLibraryPage
          isPicker
          onSelect={(file: MediaFile) => {
            if (file.type !== 'image') {
              toast.error('Please select an image file');
              return;
            }
            if (mediaTarget === 'header') {
              setHeaderImage(file.url);
              toast.success('Header image applied');
            } else if (mediaTarget === 'footer') {
              setFooterImage(file.url);
              toast.success('Footer image applied');
            }
            setIsMediaModalOpen(false);
          }}
        />
      </Modal>

      {/* Send Proposal Email Modal */}
      <ConfirmDialog
        open={pageToDelete !== null && !!pageToDeleteChunk}
        title={`Delete Page ${pageToDeleteChunk?.pageNum ?? ''}`}
        message={
          pageToDeleteChunk
            ? `This removes everything on page ${pageToDeleteChunk.pageNum} (section ${Array.from(new Set(pageToDeleteChunk.slices.map((sl) => sl.globalIndex + 1))).map((n) => `#${n}`).join(', ')}). Sections that continue on other pages keep their other parts. This can't be undone once you save.`
            : ''
        }
        variant="danger"
        onConfirm={confirmDeletePage}
        onCancel={() => setPageToDelete(null)}
      />

      {shareModal.isOpen && shareModal.type === 'email' && (
        <Modal
          open={shareModal.isOpen}
          onClose={() => setShareModal({ isOpen: false, type: null })}
          title="Send Proposal via Email"
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 6, display: 'block' }}>
                Recipient Email (To) * <span style={{ fontWeight: 400, color: 'var(--tx-4)', fontSize: 11 }}>(press Enter or comma to add multiple)</span>
              </label>
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-1)', cursor: 'text', minHeight: 42, alignItems: 'center' }}
                onClick={(e) => { (e.currentTarget as HTMLElement).querySelector('input')?.focus(); }}
              >
                {toEmailTags.map((tag, idx) => (
                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--brand)', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                    {tag}
                    <button onClick={() => removeToEmailTag(idx)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={toEmailInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.endsWith(',') || val.endsWith(';')) { addToEmailTag(val.slice(0, -1)); }
                    else setToEmailInput(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addToEmailTag(toEmailInput); }
                    else if (e.key === 'Backspace' && toEmailInput === '' && toEmailTags.length > 0) removeToEmailTag(toEmailTags.length - 1);
                  }}
                  onBlur={() => { if (toEmailInput.trim()) addToEmailTag(toEmailInput); }}
                  placeholder={toEmailTags.length === 0 ? 'customer@company.com  ← press Enter to add' : 'Add another recipient...'}
                  style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--tx-1)', fontSize: 13, flex: 1, minWidth: 160, padding: '2px 4px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 6, display: 'block' }}>
                CC Email Address <span style={{ fontWeight: 400, color: 'var(--tx-4)', fontSize: 11 }}>(optional · press Enter or comma to add multiple)</span>
              </label>
              <div
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 5,
                  padding: '5px 8px', borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface-1)', cursor: 'text',
                  minHeight: 42, alignItems: 'center'
                }}
                onClick={(e) => { (e.currentTarget as HTMLElement).querySelector('input')?.focus(); }}
              >
                {ccEmailTags.map((tag, idx) => (
                  <span key={idx} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--brand)', color: '#fff',
                    borderRadius: 20, padding: '3px 10px',
                    fontSize: 12, fontWeight: 700
                  }}>
                    {tag}
                    <button onClick={() => removeCcEmailTag(idx)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={ccEmailInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.endsWith(',') || val.endsWith(';')) { addCcEmailTag(val.slice(0, -1)); }
                    else setCcEmailInput(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCcEmailTag(ccEmailInput); }
                    else if (e.key === 'Backspace' && ccEmailInput === '' && ccEmailTags.length > 0) removeCcEmailTag(ccEmailTags.length - 1);
                  }}
                  onBlur={() => { if (ccEmailInput.trim()) addCcEmailTag(ccEmailInput); }}
                  placeholder={ccEmailTags.length === 0 ? 'manager@company.com  ← press Enter to add' : 'Add another email...'}
                  style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--tx-1)', fontSize: 13, flex: 1, minWidth: 160, padding: '2px 4px' }}
                />
              </div>
            </div>

            {/* Quick Email Template Picker */}
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} />
                  Choose Email Template (Optional)
                </label>
                {selectedEmailTemplateId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmailTemplateId('');
                      setEmailSubject(`Quotation Proposal ${quotationDetails.quoteNo}`);
                      setEmailBody(`Dear Valued Customer,\n\nPlease find attached our quotation proposal ${quotationDetails.quoteNo}.\n\nThank you for choosing our services.\n\n${getSenderSignoff()}`);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--tx-4)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <select
                value={selectedEmailTemplateId}
                onChange={(e) => handleEmailTemplateSelect(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--tx-1)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">— Standard Quotation Message (Default) —</option>
                {(emailTemplates || []).map((t: any) => (
                  <option key={t._id} value={t._id}>
                    ✉️ {t.name} {t.subject ? `— "${t.subject}"` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 4, display: 'block' }}>
                Email Subject *
              </label>
              <input
                className="quote-table-input"
                style={{ width: '100%', padding: '8px 12px' }}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject line..."
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-2)', marginBottom: 4, display: 'block' }}>
                Message Body
              </label>
              <textarea
                className="quote-table-input"
                style={{ width: '100%', padding: '10px 12px', minHeight: 110, lineHeight: 1.6 }}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                placeholder="Write your email message here..."
              />
            </div>

            {/* Attached PDF Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--brand) 8%, var(--surface))',
              border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'var(--brand)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Paperclip size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{quotationDetails.quoteNo || 'Quotation'}.pdf</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'var(--brand)', color: '#ffffff' }}>ATTACHED</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx-4)' }}>
                    Generated with official letterhead & pricing calculation
                  </div>
                </div>
              </div>
              <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShareModal({ isOpen: false, type: null })}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSendEmail} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Mail size={14} /> Send Proposal with PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
