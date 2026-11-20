import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Mail, Plus, Image as ImageIcon, Eye, Code, Type, Save,
  Search, Trash2, Download, Pencil, ArrowLeft, PlusCircle, RefreshCw, Send,
  X, Layers, Upload, FileText, Bold, Italic, List, ChevronDown,
  Minus, AlignLeft, AlignCenter, AlignRight, Maximize2
} from 'lucide-react';
import api from '../../utils/api';
import { EmptyState, Spinner, Modal, ConfirmDialog, SkeletonRow, InputField } from '../../components/ui';
import toast from 'react-hot-toast';
import { useThemeStore } from '../../store/themeStore';
import { toAssetUrl } from '../../utils/helpers';
import { fontStackForChoice } from '../../utils/fonts';
import { getCommonDocumentStyles, renderCommonDocumentBody, handlePrintKeyboardShortcut, cleanWordArtifacts } from '../../utils/documentStyles';
import { chunkDocumentBlocksForA4Pages } from '../../utils/quotationHelpers';
import { MediaLibraryPage, MediaFile } from './MediaLibrary';

export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  body: string;
  headerImage?: string;
  footerImage?: string;
  lastUsed?: string;
  updatedAt: string;
}

export const splitIntoA4Pages = (rawBody: string): string[] => {
  if (!rawBody || !rawBody.trim()) return [''];
  const normalized = rawBody.replace(/<!--\s*page-?break\s*-->|\[\s*page-?break\s*\]|---page-?break---|style="page-break-after:\s*always;?"/gi, '___A4_PAGE_BREAK___');
  const parts = normalized.split('___A4_PAGE_BREAK___');
  const filtered = parts.map(p => p.trim()).filter((p, i) => i === 0 || p.length > 0);
  return filtered.length > 0 ? filtered : [''];
};

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

export const EmailTemplatesPage: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'html' | 'text'>('visual');
  const [previewMode, setPreviewMode] = useState<'a4' | 'inbox'>('a4');
  const [search, setSearch] = useState('');
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'header' | 'footer' | 'body'>('body');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [sendTemplateTarget, setSendTemplateTarget] = useState<EmailTemplate | null>(null);
  const [sendRecipientEmail, setSendRecipientEmail] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<EmailTemplate | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const visualEditorRef = React.useRef<HTMLDivElement>(null);
  const savedSelectionRef = React.useRef<Range | null>(null);

  const fontStyleMenuRef = React.useRef<HTMLDivElement>(null);
  const [isFontStyleMenuOpen, setIsFontStyleMenuOpen] = useState(false);
  const [selectedFontStyleLabel, setSelectedFontStyleLabel] = useState('Default');

  const fontSizeMenuRef = React.useRef<HTMLDivElement>(null);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
  const [selectedFontSizeLabel, setSelectedFontSizeLabel] = useState('12pt');

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
    } else if (visualEditorRef.current) {
      visualEditorRef.current.focus();
    }
  }, []);

  const handleFontStyleSelect = (value: string, label: string) => {
    setSelectedFontStyleLabel(label);
    setIsFontStyleMenuOpen(false);
    restoreSelection();
    visualEditorRef.current?.focus();
    document.execCommand('fontName', false, value);
    setForm(p => ({ ...p, body: visualEditorRef.current?.innerHTML || '' }));
    saveSelection();
  };

  const handleFontSizeSelect = (value: string, label: string) => {
    setSelectedFontSizeLabel(label);
    setIsFontSizeMenuOpen(false);
    restoreSelection();
    visualEditorRef.current?.focus();
    document.execCommand('fontSize', false, value);
    setForm(p => ({ ...p, body: visualEditorRef.current?.innerHTML || '' }));
    saveSelection();
  };

  const detectSelectionStyles = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current) return;
    if (!visualEditorRef.current.contains(sel.anchorNode)) return;

    try {
      let node: Node | null = sel.anchorNode;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const el = node as HTMLElement | null;
      if (!el) return;

      // 1. Detect font size from <font size="..."> or computed style
      const fontEl = el.closest('font[size]') as HTMLElement | null;
      if (fontEl) {
        const s = fontEl.getAttribute('size');
        const match = FONT_SIZE_OPTIONS.find((o) => o.value === s);
        if (match) setSelectedFontSizeLabel(match.label);
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

      // 2. Detect font style / family
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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (fontStyleMenuRef.current && !fontStyleMenuRef.current.contains(e.target as Node)) {
        setIsFontStyleMenuOpen(false);
      }
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(e.target as Node)) {
        setIsFontSizeMenuOpen(false);
      }
    };
    if (isFontStyleMenuOpen || isFontSizeMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isFontStyleMenuOpen, isFontSizeMenuOpen]);

  const { logo, companyName, brandColor, proposalWatermark } = useThemeStore();
  const [form, setForm] = useState({ name: '', subject: '', body: '', headerImage: '', footerImage: '' });
  const [selectedProposalTemplateId, setSelectedProposalTemplateId] = useState<string>('');

  const { data: proposalTemplates = [] } = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: async () => {
      const res = await api.get('/proposal-templates');
      return (res.data?.data || res.data || []) as any[];
    },
  });

  const activeProposalTemplate = useMemo(() => {
    if (selectedProposalTemplateId) {
      return proposalTemplates.find((pt: any) => pt._id === selectedProposalTemplateId) || null;
    }
    return proposalTemplates.find((pt: any) => pt.isActive || pt.status === 'active') || proposalTemplates[0] || null;
  }, [proposalTemplates, selectedProposalTemplateId]);

  // Keyboard Shortcut: Ctrl + P / Cmd + P for Email Template Print / PDF Export
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editorOpen || isPreviewModalOpen) {
        handlePrintKeyboardShortcut(e, () => handleDownloadPdf());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorOpen, isPreviewModalOpen, form, activeProposalTemplate, brandColor, proposalWatermark]);

  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const res = await api.get('/email-templates');
      return res.data.data as EmailTemplate[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: any) => {
      if (isNew) return api.post('/email-templates', payload);
      return api.patch(`/email-templates/${selectedId}`, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? 'Template created' : 'Template updated');
      setIsNew(false);
      setEditorOpen(false);
      setSelectedId(null);
      refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to save template'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/email-templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted');
      setSelectedId(null);
      setDeleteTemplateTarget(null);
      setEditorOpen(false);
      refetch();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete template'),
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!sendTemplateTarget || !sendRecipientEmail.trim()) return;
      const payload = {
        to: sendRecipientEmail.trim(),
        templateId: sendTemplateTarget._id,
        headerImage: sendTemplateTarget.headerImage || undefined,
        footerImage: sendTemplateTarget.footerImage || undefined,
        dynamicData: {
          customerName: 'Valued Client Enterprise',
          companyName: 'Valued Client Enterprise',
          contactPerson: 'Valued Customer',
          product: 'TallyPrime Enterprise ERP',
          productName: 'TallyPrime Enterprise ERP',
          serialNo: '720912441',
          release: 'Release 5.0',
          expiryDate: '31-Dec-2026',
          dueDate: '31-Dec-2026',
          startDate: '01-Jan-2026',
          endDate: '31-Dec-2026',
          phone: '+974 4432 1234',
          email: sendRecipientEmail.trim(),
          amount: 'QAR 2,500',
        },
      };
      const res = await api.post('/email-templates/send', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email template dispatched successfully via SMTP!');
      setSendTemplateTarget(null);
      setSendRecipientEmail('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to send template email');
    },
  });

  const filteredTemplates = useMemo(() => {
    const list = templates || [];
    if (!search) return list;
    return list.filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase())
    );
  }, [templates, search]);

  const selectedTemplate = useMemo(() => {
    if (isNew) return null;
    return templates?.find(t => t._id === selectedId) || null;
  }, [templates, selectedId, isNew]);

  useEffect(() => {
    if (selectedTemplate) {
      setForm({
        name: selectedTemplate.name || '',
        subject: selectedTemplate.subject || '',
        body: selectedTemplate.body || '',
        headerImage: selectedTemplate.headerImage || '',
        footerImage: selectedTemplate.footerImage || '',
      });
    } else if (isNew) {
      setForm({
        name: '',
        subject: '',
        body: '',
        headerImage: activeProposalTemplate?.templateImage || '',
        footerImage: activeProposalTemplate?.templateFooterImage || '',
      });
    }
  }, [selectedTemplate, isNew]);

  // WordPress-style Image Size & Alignment State
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null);
  const [selectedImageRect, setSelectedImageRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [selectedImageWidth, setSelectedImageWidth] = useState<string>('100%');
  const [selectedImageAlign, setSelectedImageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [, setIsResizing] = useState(false);

  const getCleanEditorHtml = useCallback((raw?: string) => {
    const val = raw !== undefined ? raw : (visualEditorRef.current?.innerHTML || '');
    return val
      .replace(/\s*wt-editor-img-selected\b/g, '')
      .replace(/\s*data-wt-selected="true"/g, '')
      .replace(/\s*class=""/g, '');
  }, []);

  const handleSave = () => {
    if (!form.name.trim() || !form.subject.trim()) { 
      toast.error('Name and Subject are required'); 
      return; 
    }
    const cleanBody = getCleanEditorHtml(form.body);
    saveMut.mutate({
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: cleanBody,
      headerImage: form.headerImage || '',
      footerImage: form.footerImage || '',
    });
  };

  const templateVariables = [
    { label: 'Contact Person', key: '{{contact_person}}' },
    { label: 'Org Name',       key: '{{org_name}}' },
    { label: 'Product',        key: '{{product}}' },
    { label: 'Release',        key: '{{release}}' },
    { label: 'Start Date',     key: '{{start_date}}' },
    { label: 'TSS Expiry',     key: '{{tss_expiry_date}}' },
    { label: 'Salesman',       key: '{{salesman}}' },
    { label: 'Email ID',       key: '{{email_id}}' },
  ];


  const updateSelectedImageMetrics = useCallback(() => {
    if (!selectedImageEl || !visualEditorRef.current) {
      setSelectedImageRect(null);
      return;
    }
    if (!selectedImageEl.isConnected) {
      setSelectedImageEl(null);
      setSelectedImageRect(null);
      return;
    }
    const editorRect = visualEditorRef.current.getBoundingClientRect();
    const imgRect = selectedImageEl.getBoundingClientRect();

    const top = imgRect.top - editorRect.top;
    const left = imgRect.left - editorRect.left;

    setSelectedImageRect({
      top,
      left,
      width: imgRect.width,
      height: imgRect.height,
    });

    const w = selectedImageEl.style.width || '100%';
    setSelectedImageWidth(w);

    const mLeft = selectedImageEl.style.marginLeft;
    const mRight = selectedImageEl.style.marginRight;
    if (mLeft === '0px' || mLeft === '0') {
      setSelectedImageAlign('left');
    } else if (mRight === '0px' || mRight === '0') {
      setSelectedImageAlign('right');
    } else {
      setSelectedImageAlign('center');
    }
  }, [selectedImageEl]);

  useEffect(() => {
    const editor = visualEditorRef.current;
    if (!editor || !selectedImageEl) return;
    const onScroll = () => updateSelectedImageMetrics();
    editor.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      editor.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [selectedImageEl, updateSelectedImageMetrics]);

  const selectImage = useCallback((img: HTMLImageElement) => {
    if (visualEditorRef.current) {
      const allImgs = visualEditorRef.current.querySelectorAll('img');
      allImgs.forEach(i => {
        i.classList.remove('wt-editor-img-selected');
        i.removeAttribute('data-wt-selected');
      });
    }
    img.classList.add('wt-editor-img-selected');
    img.setAttribute('data-wt-selected', 'true');
    if (!img.style.maxWidth) img.style.maxWidth = '100%';
    if (!img.style.height) img.style.height = 'auto';
    if (!img.style.display) img.style.display = 'block';
    if (!img.style.margin) img.style.margin = '12px auto';

    setSelectedImageEl(img);

    setTimeout(() => {
      if (visualEditorRef.current && img.isConnected) {
        const editorRect = visualEditorRef.current.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        setSelectedImageRect({
          top: imgRect.top - editorRect.top,
          left: imgRect.left - editorRect.left,
          width: imgRect.width,
          height: imgRect.height,
        });
        setSelectedImageWidth(img.style.width || '100%');
      }
    }, 10);
  }, []);

  const deselectImage = useCallback(() => {
    if (selectedImageEl) {
      selectedImageEl.classList.remove('wt-editor-img-selected');
      selectedImageEl.removeAttribute('data-wt-selected');
    }
    if (visualEditorRef.current) {
      const allImgs = visualEditorRef.current.querySelectorAll('img');
      allImgs.forEach(i => {
        i.classList.remove('wt-editor-img-selected');
        i.removeAttribute('data-wt-selected');
      });
    }
    setSelectedImageEl(null);
    setSelectedImageRect(null);
  }, [selectedImageEl]);

  const applyImageSize = useCallback((preset: string) => {
    if (!selectedImageEl || !visualEditorRef.current) return;
    selectedImageEl.style.width = preset;
    selectedImageEl.style.maxWidth = '100%';
    selectedImageEl.style.height = 'auto';
    selectedImageEl.style.display = 'block';

    setSelectedImageWidth(preset);
    updateSelectedImageMetrics();

    const cleanHtml = getCleanEditorHtml();
    setForm(p => ({ ...p, body: cleanHtml }));
  }, [selectedImageEl, updateSelectedImageMetrics, getCleanEditorHtml]);

  const stepImageSize = useCallback((delta: number) => {
    if (!selectedImageEl || !visualEditorRef.current) return;
    let current = 100;
    const match = selectedImageEl.style.width.match(/^(\d+(?:\.\d+)?)%/);
    if (match) {
      current = parseFloat(match[1]);
    } else if (selectedImageRect && visualEditorRef.current) {
      const edWidth = visualEditorRef.current.clientWidth - 40;
      current = Math.round((selectedImageRect.width / edWidth) * 100);
    }
    const next = Math.min(100, Math.max(15, current + delta));
    applyImageSize(`${next}%`);
  }, [selectedImageEl, selectedImageRect, applyImageSize]);

  const applyImageAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selectedImageEl || !visualEditorRef.current) return;
    selectedImageEl.style.display = 'block';
    selectedImageEl.style.marginTop = '12px';
    selectedImageEl.style.marginBottom = '12px';
    if (align === 'left') {
      selectedImageEl.style.marginLeft = '0px';
      selectedImageEl.style.marginRight = 'auto';
    } else if (align === 'right') {
      selectedImageEl.style.marginLeft = 'auto';
      selectedImageEl.style.marginRight = '0px';
    } else {
      selectedImageEl.style.marginLeft = 'auto';
      selectedImageEl.style.marginRight = 'auto';
    }
    setSelectedImageAlign(align);
    updateSelectedImageMetrics();

    const cleanHtml = getCleanEditorHtml();
    setForm(p => ({ ...p, body: cleanHtml }));
  }, [selectedImageEl, updateSelectedImageMetrics, getCleanEditorHtml]);

  const deleteSelectedImage = useCallback(() => {
    if (!selectedImageEl || !visualEditorRef.current) return;
    selectedImageEl.remove();
    setSelectedImageEl(null);
    setSelectedImageRect(null);
    const cleanHtml = getCleanEditorHtml();
    setForm(p => ({ ...p, body: cleanHtml }));
    toast.success('Image removed from template');
  }, [selectedImageEl, getCleanEditorHtml]);

  const handleDragStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'e') => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImageEl || !visualEditorRef.current) return;

    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = selectedImageEl.getBoundingClientRect().width;
    const editorWidth = visualEditorRef.current.clientWidth - 40;

    const onMouseMove = (ev: MouseEvent) => {
      let diff = ev.clientX - startX;
      if (handle === 'sw') diff = -diff;
      const newWidthPx = Math.max(80, Math.min(editorWidth, startWidth + diff));
      const pct = Math.min(100, Math.max(15, Math.round((newWidthPx / editorWidth) * 100)));
      selectedImageEl.style.width = `${pct}%`;
      selectedImageEl.style.maxWidth = '100%';
      selectedImageEl.style.height = 'auto';
      setSelectedImageWidth(`${pct}%`);
      updateSelectedImageMetrics();
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const cleanHtml = getCleanEditorHtml();
      setForm(p => ({ ...p, body: cleanHtml }));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const insertImageIntoEditor = (url: string, alt = 'image') => {
    const fullUrl = toAssetUrl(url).startsWith('http') ? toAssetUrl(url) : `${window.location.origin}${toAssetUrl(url)}`;
    const imgHtml = `<img src="${fullUrl}" alt="${alt}" style="max-width: 100%; height: auto; display: block; margin: 12px auto; border-radius: 6px;" />`;
    if (viewMode === 'visual' && visualEditorRef.current) {
      visualEditorRef.current.focus();
      document.execCommand('insertHTML', false, imgHtml);
      const newHtml = getCleanEditorHtml();
      setForm(p => ({ ...p, body: newHtml }));
      setTimeout(() => {
        if (visualEditorRef.current) {
          const imgs = visualEditorRef.current.querySelectorAll('img');
          const lastImg = imgs[imgs.length - 1];
          if (lastImg) selectImage(lastImg as HTMLImageElement);
        }
      }, 50);
    } else {
      insertAtCursor(imgHtml);
    }
  };

  const handleUploadImageFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    // Try uploading to server first to keep template payloads lightweight
    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/media', formData);
      const uploaded = res.data?.data?.[0];
      if (uploaded?.url) {
        insertImageIntoEditor(uploaded.url, file.name);
        toast.success('Image uploaded and inserted');
        return;
      }
    } catch {
      // Fallback to data URL if offline or media endpoint error
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertImageIntoEditor(reader.result, file.name);
        toast.success('Image inserted into template');
      }
    };
    reader.readAsDataURL(file);
  };

  const insertAtCursor = (text: string) => {
    if (viewMode === 'visual' && visualEditorRef.current) {
      visualEditorRef.current.focus();
      if (/<[a-z][\s\S]*>/i.test(text)) {
        document.execCommand('insertHTML', false, text);
      } else {
        document.execCommand('insertText', false, text);
      }
      const newHtml = visualEditorRef.current.innerHTML;
      setForm(p => ({ ...p, body: newHtml }));
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      setForm(p => ({ ...p, body: p.body + (p.body ? '\n' : '') + text }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentBody = form.body;
    
    const newBody = currentBody.substring(0, start) + text + currentBody.substring(end);
    setForm(p => ({ ...p, body: newBody }));

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = start + text.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  useEffect(() => {
    if (viewMode === 'visual' && visualEditorRef.current) {
      if (document.activeElement !== visualEditorRef.current) {
        const currentHtml = visualEditorRef.current.innerHTML;
        const cleanCurrent = (currentHtml || '').replace(/\s*wt-editor-img-selected\b/g, '').replace(/\s*data-wt-selected="true"/g, '').replace(/\s*class=""/g, '').trim();
        const cleanForm = (form.body || '').replace(/\s*wt-editor-img-selected\b/g, '').replace(/\s*data-wt-selected="true"/g, '').replace(/\s*class=""/g, '').trim();
        if (cleanCurrent !== cleanForm) {
          const htmlToSet = /<(?:p|div|br|ul|ol|li|table|h[1-6]|img)\b/i.test(form.body)
            ? form.body
            : renderCommonDocumentBody(form.body, brandColor || '#6d28d9');
          visualEditorRef.current.innerHTML = form.body ? htmlToSet : '';
        }
      }
    }
  }, [viewMode, form.body, brandColor]);

  const stripBannerDuplicates = (bodyText: string, header?: string, footer?: string) => {
    if (!bodyText) return '';
    let cleaned = bodyText;
    const targets = [header, footer, form.headerImage, form.footerImage].filter(Boolean) as string[];
    
    if (activeProposalTemplate?.templateImage) targets.push(activeProposalTemplate.templateImage);
    if (activeProposalTemplate?.templateFooterImage) targets.push(activeProposalTemplate.templateFooterImage);
    
    for (const t of targets) {
      if (!t) continue;
      const filename = t.split('/').pop()?.split('?')[0];
      if (filename && filename.length > 3) {
        const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`<img[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>`, 'gi');
        cleaned = cleaned.replace(re, '');
      }
    }
    return cleaned;
  };

  const renderRenderedBody = (body: string, header?: string, footer?: string) => {
    if (!body) return '';
    const cleaned = cleanWordArtifacts(body);
    const deduped = stripBannerDuplicates(cleaned, header, footer);
    return renderCommonDocumentBody(deduped, brandColor || '#6d28d9');
  };

  const emailPageChunks = useMemo(() => {
    const hasManualBreak = /<!--\s*page-?break\s*-->|\[\s*page-?break\s*\]|---page-?break---|style="page-break-after:\s*always;?"/i.test(form.body);
    if (hasManualBreak) {
      const pages = splitIntoA4Pages(form.body);
      return pages.map((pageText, idx) => ({
        pageNum: idx + 1,
        isFirst: idx === 0,
        isLast: idx === pages.length - 1,
        totalPages: pages.length,
        content: pageText,
      }));
    }

    const effectiveHeader = form.headerImage || activeProposalTemplate?.templateImage || '';
    const effectiveFooter = form.footerImage || activeProposalTemplate?.templateFooterImage || '';
    const renderedBody = renderRenderedBody(form.body, effectiveHeader, effectiveFooter);

    if (!renderedBody || !renderedBody.trim()) {
      return [{
        pageNum: 1,
        isFirst: true,
        isLast: true,
        totalPages: 1,
        content: '',
      }];
    }

    const dummySubject = form.subject
      ? `<div data-subject-placeholder="1" style="height:48px;margin-bottom:18px;"></div>`
      : '';

    const rawBlocks = [{
      id: 'letter_body',
      type: 'text',
      title: '',
      content: dummySubject + renderedBody,
    }];

    const chunks = chunkDocumentBlocksForA4Pages(rawBlocks, {
      hasHeaderImage: Boolean(effectiveHeader),
      hasFooterImage: Boolean(effectiveFooter),
      isEditor: false,
      honorPageBreaks: true,
      isLetter: true,
    });

    return chunks.map((c) => {
      const sliceHtml = c.slices.map(s => s.contentSlice || '').join('');
      const cleanContent = sliceHtml.replace(/<div data-subject-placeholder="1"[^>]*><\/div>/gi, '');
      return {
        pageNum: c.pageNum,
        isFirst: c.isFirst,
        isLast: c.isLast,
        totalPages: chunks.length,
        content: cleanContent,
      };
    });
  }, [form.body, form.subject, form.headerImage, form.footerImage, activeProposalTemplate, brandColor]);

  const totalTemplates = templates?.length || 0;
  const recentlyUpdated = useMemo(() => {
    if (!templates?.length) return '—';
    const sorted = [...templates].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sorted[0].name;
  }, [templates]);

  const kpiCards = [
    { label: 'Total Templates', value: isLoading ? '—' : totalTemplates, icon: <Mail size={20} strokeWidth={2.5} />, color: 'var(--brand)', bg: 'var(--brand-light)', change: 'All email templates' },
    { label: 'Placeholders', value: '7 Variables', icon: <Code size={20} strokeWidth={2.5} />, color: 'var(--amber)', bg: 'var(--amber-bg)', change: 'Dynamic values' },
    { label: 'Recently Updated', value: isLoading ? '—' : recentlyUpdated, icon: <RefreshCw size={20} strokeWidth={2.5} />, color: 'var(--green)', bg: 'var(--green-bg)', change: 'Last modified' },
    { label: 'Channel Provider', value: 'SMTP Mail', icon: <Send size={20} strokeWidth={2.5} />, color: 'var(--purple)', bg: 'var(--purple-bg)', change: 'System configured' },
  ];

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const handleDownloadPdf = (target?: { name: string; subject?: string; body: string; headerImage?: string; footerImage?: string }, targetProposalTemplateId?: string) => {
    const current = target || form;
    const brand = brandColor || '#6d28d9';
    const propTemplate = targetProposalTemplateId 
      ? proposalTemplates.find((pt: any) => pt._id === targetProposalTemplateId) 
      : activeProposalTemplate;

    const headerBanner = current.headerImage !== undefined ? current.headerImage : (propTemplate?.templateImage || '');
    const footerBanner = current.footerImage !== undefined ? current.footerImage : (propTemplate?.templateFooterImage || '');

    const company = {
      name: propTemplate?.companyName || companyName || 'Welcome Tech CRM',
      a1: '',
      a2: '',
      phone: '',
      email: '',
    };

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      toast.error('Please allow popups to download the PDF');
      return;
    }
    if (printWindow.document) {
      printWindow.document.title = 'Preparing document…';
    }

    // Same measured A4 engine as proposals (View / Download PDF / emailed PDF), in "letter" mode
    const titleName = current.name || 'Email Template';
    const subjectBox = current.subject
      ? `<div style="margin:0 0 16px;padding:8px 12px;background:#f8fafc;border-left:3.5px solid ${brand};border-radius:4px;font-size:12.5px;font-weight:600;color:#0f172a;"><span style="font-size:10px;font-weight:800;text-transform:uppercase;color:${brand};margin-right:6px;letter-spacing:0.04em;">Subject:</span>${escapeHtml(current.subject)}</div>`
      : '';
    const draft: any = {
      name: titleName,
      companyInfo: { name: company.name },
      templateImage: headerBanner || '',
      templateFooterImage: footerBanner || '',
      items: [],
      blocks: [{ id: 'letter_body', type: 'text', title: '', content: subjectBox + renderRenderedBody(current.body, headerBanner, footerBanner) }],
    };
    const letterOptions = { isPrintAutoTrigger: true, letter: { subject: titleName } };
    const write = (html: string) => {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    };
    // Loaded lazily: MiscPages already imports this page, so a static import would be circular
    import('./MiscPages')
      .then(({ buildMeasuredQuotationHtml, buildQuotationDocumentHtml }) =>
        buildMeasuredQuotationHtml(draft, draft, letterOptions)
          .then(write)
          .catch(() => write(buildQuotationDocumentHtml(draft, draft, letterOptions)))
      )
      .catch(() => {
        printWindow.close();
        toast.error('Could not prepare the PDF');
      });
  };

  if (editorOpen) {
    return (
      <div className="proposals-page-container" style={{ width: '100%', paddingBottom: '60px' }}>
        {/* Top Header matching Quotation Generator */}
        <div className="no-print page-header" style={{ width: '100%', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="btn-back"
              onClick={() => { setEditorOpen(false); setSelectedId(null); setIsNew(false); }}
              title="Back to Email Templates"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="page-title">{isNew ? 'CREATE EMAIL TEMPLATE' : 'EMAIL TEMPLATE BUILDER'}</div>
              <div className="page-subtitle">Design, customize, and export professional email templates with dynamic merge tags</div>
            </div>
          </div>

          <div className="actions-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setIsPreviewModalOpen(true)}
              title="Open full-screen modal preview"
            >
              <Eye size={14} /> Full Preview
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => handleDownloadPdf()}
              title="Download template as PDF (Ctrl+P / ⌘P)"
            >
              <Download size={14} /> Download PDF
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

            {!isNew && selectedId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  setSendTemplateTarget({
                    _id: selectedId,
                    name: form.name,
                    subject: form.subject,
                    body: form.body,
                    headerImage: form.headerImage,
                    footerImage: form.footerImage,
                    updatedAt: new Date().toISOString(),
                  });
                  setSendRecipientEmail('');
                }}
                title="Send test email via SMTP"
              >
                <Send size={14} /> Send Test Email
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={handleSave}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? <Spinner size={14} /> : <Save size={14} />}
              {isNew ? 'Save Template' : 'Update Template'}
            </button>
          </div>
        </div>

        {/* Top Template Configuration Bar Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* Row 1: Template Name, Subject, Mode */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 1.2fr) minmax(320px, 2.2fr) auto',
            gap: '16px',
            alignItems: 'center'
          }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tx-3)', display: 'block', marginBottom: '6px' }}>
                Template Name *
              </label>
              <input
                style={{
                  width: '100%',
                  padding: '9px 13px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--tx-1)',
                  outline: 'none'
                }}
                placeholder="e.g. AMC Renewal Notice"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tx-3)', display: 'block', marginBottom: '6px' }}>
                Email Subject Line *
              </label>
              <input
                style={{
                  width: '100%',
                  padding: '9px 13px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--tx-1)',
                  outline: 'none'
                }}
                placeholder="e.g. Important: Your Annual Maintenance Contract (AMC) is expiring soon"
                value={form.subject}
                onChange={(e) => setForm(p => ({ ...p, subject: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tx-3)', display: 'block', marginBottom: '6px' }}>
                Editor Mode
              </label>
              <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                {(['visual', 'html', 'text'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 6, border: 'none',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: viewMode === mode ? 'var(--brand)' : 'transparent',
                      color: viewMode === mode ? '#ffffff' : 'var(--tx-3)',
                      transition: 'all 0.14s',
                    }}
                  >
                    {mode === 'html' ? <Code size={12} /> : <Type size={12} />}
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Dynamic Header & Footer Banner Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            paddingTop: '14px',
            borderTop: '1px solid var(--border)'
          }}>
            {/* Header Banner Selector Card */}
            <div style={{
              flex: '1 1 320px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: 48,
                height: 34,
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {form.headerImage ? (
                  <img src={toAssetUrl(form.headerImage)} alt="Header Banner" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <ImageIcon size={16} color="var(--tx-4)" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tx-3)' }}>
                    Header Banner (1400×220)
                  </span>
                  {form.headerImage && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} title="Active Banner" />
                  )}
                </div>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: form.headerImage ? 'var(--tx-1)' : 'var(--tx-4)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={form.headerImage || 'None (Letterhead Logo)'}
                >
                  {form.headerImage ? form.headerImage.split('/').pop()?.split('?')[0] : 'None (Letterhead Logo)'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  style={{ padding: '5px 10px', fontSize: '11px' }}
                  onClick={() => {
                    setMediaPickerTarget('header');
                    setIsMediaModalOpen(true);
                  }}
                >
                  Select
                </button>
                {form.headerImage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-xs"
                    style={{ color: 'var(--red)', width: 22, height: 22, padding: 0 }}
                    title="Remove Header Banner"
                    onClick={() => {
                      setForm(p => ({ ...p, headerImage: '' }));
                      toast.success('Header banner removed (Letterhead mode)');
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Footer Banner Selector Card */}
            <div style={{
              flex: '1 1 320px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: 48,
                height: 34,
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {form.footerImage ? (
                  <img src={toAssetUrl(form.footerImage)} alt="Footer Banner" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <ImageIcon size={16} color="var(--tx-4)" />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--tx-3)' }}>
                    Footer Banner (1400×110)
                  </span>
                  {form.footerImage && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} title="Active Banner" />
                  )}
                </div>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: form.footerImage ? 'var(--tx-1)' : 'var(--tx-4)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={form.footerImage || 'None (Clean Copyright)'}
                >
                  {form.footerImage ? form.footerImage.split('/').pop()?.split('?')[0] : 'None (Clean Copyright)'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  style={{ padding: '5px 10px', fontSize: '11px' }}
                  onClick={() => {
                    setMediaPickerTarget('footer');
                    setIsMediaModalOpen(true);
                  }}
                >
                  Select
                </button>
                {form.footerImage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-xs"
                    style={{ color: 'var(--red)', width: 22, height: 22, padding: 0 }}
                    title="Remove Footer Banner"
                    onClick={() => {
                      setForm(p => ({ ...p, footerImage: '' }));
                      toast.success('Footer banner removed');
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Document Sheet Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden'
        }}>
          {/* Document Sheet Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {form.name || 'Untitled Email Template'}
              </span>
              {form.subject && (
                <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>
                  — <span style={{ fontWeight: 600 }}>Subject:</span> {form.subject}
                </span>
              )}
            </div>
            <div style={{
              fontSize: '10px',
              fontWeight: 800,
              color: 'var(--tx-4)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '3px 8px',
              borderRadius: '4px'
            }}>
              TEMPLATE CANVAS
            </div>
          </div>

          {/* Dual-Pane Editor & Live View */}
          <div style={{ minHeight: 520, height: '60vh', display: 'flex', background: 'var(--surface-2)' }}>
            {viewMode === 'html' ? (
              <textarea
                ref={textareaRef}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  padding: 24,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  lineHeight: 1.6
                }}
                value={form.body}
                onChange={(e) => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="Enter raw HTML email template code here..."
              />
            ) : (
              <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                {/* Left: Editor Column */}
                <div style={{ flex: 1, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
                  <div style={{
                    padding: '8px 16px',
                    background: 'var(--surface-2)',
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--tx-4)',
                    borderBottom: '1px solid var(--border)',
                    letterSpacing: '0.06em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{viewMode === 'visual' ? 'VISUAL RICH EDITOR' : 'MARKDOWN / TEXT EDITOR'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                        {viewMode === 'visual' && (
                          <>
                            {/* Theme-based Font Style Dropdown */}
                            <div ref={fontStyleMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  saveSelection();
                                  setIsFontStyleMenuOpen(!isFontStyleMenuOpen);
                                  setIsFontSizeMenuOpen(false);
                                }}
                                title="Font Style / Family"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: isFontStyleMenuOpen ? 'var(--brand-light)' : 'var(--surface)',
                                  border: isFontStyleMenuOpen ? '1px solid var(--brand)' : '1px solid var(--border)',
                                  borderRadius: 4,
                                  color: isFontStyleMenuOpen ? 'var(--brand)' : 'var(--tx-1)',
                                  cursor: 'pointer'
                                }}
                              >
                                <span style={{ maxWidth: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {selectedFontStyleLabel}
                                </span>
                                <ChevronDown size={11} style={{ opacity: 0.6, transform: isFontStyleMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                              </button>

                              {isFontStyleMenuOpen && (
                                <div
                                  onWheel={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    zIndex: 100000,
                                    minWidth: 185,
                                    maxHeight: 280,
                                    overflowY: 'auto',
                                    backgroundColor: '#ffffff',
                                    background: '#ffffff',
                                    border: '1px solid rgba(15, 23, 42, 0.16)',
                                    borderRadius: 6,
                                    boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
                                    padding: '4px',
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
                                          padding: '5px 8px',
                                          borderRadius: 4,
                                          border: 'none',
                                          backgroundColor: isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
                                          color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                          fontSize: 11.5,
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
                                            <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                                          )}
                                        </div>
                                        <span style={{ fontSize: 9.5, color: isSelected ? 'var(--brand)' : 'var(--tx-4)', fontStyle: 'normal', opacity: 0.85, marginTop: 1 }}>{opt.desc}</span>
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
                                className="btn btn-ghost btn-xs"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  saveSelection();
                                  setIsFontSizeMenuOpen(!isFontSizeMenuOpen);
                                  setIsFontStyleMenuOpen(false);
                                }}
                                title="Font Size"
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: isFontSizeMenuOpen ? 'var(--brand-light)' : 'var(--surface)',
                                  border: isFontSizeMenuOpen ? '1px solid var(--brand)' : '1px solid var(--border)',
                                  borderRadius: 4,
                                  color: isFontSizeMenuOpen ? 'var(--brand)' : 'var(--tx-1)',
                                  cursor: 'pointer'
                                }}
                              >
                                <span style={{ fontFamily: 'var(--font-mono)' }}>
                                  {selectedFontSizeLabel}
                                </span>
                                <ChevronDown size={11} style={{ opacity: 0.6, transform: isFontSizeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                              </button>

                              {isFontSizeMenuOpen && (
                                <div
                                  onWheel={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    zIndex: 100000,
                                    minWidth: 165,
                                    maxHeight: 280,
                                    overflowY: 'auto',
                                    backgroundColor: '#ffffff',
                                    background: '#ffffff',
                                    border: '1px solid rgba(15, 23, 42, 0.16)',
                                    borderRadius: 6,
                                    boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
                                    padding: '4px',
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
                                          padding: '5px 8px',
                                          borderRadius: 4,
                                          border: 'none',
                                          backgroundColor: isSelected ? 'rgba(109, 40, 217, 0.08)' : '#ffffff',
                                          color: isSelected ? 'var(--brand)' : 'var(--tx-1)',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                          fontSize: 11.5,
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
                                            <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                                          )}
                                        </div>
                                        <span style={{ fontSize: 9.5, color: isSelected ? 'var(--brand)' : 'var(--tx-4)', fontStyle: 'normal', opacity: 0.85, marginTop: 1 }}>{opt.desc}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              style={{ padding: '3px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--tx-2)' }}
                              onClick={() => {
                                visualEditorRef.current?.focus();
                                document.execCommand('bold');
                                setForm(p => ({ ...p, body: visualEditorRef.current?.innerHTML || '' }));
                              }}
                              title="Bold"
                            >
                              <Bold size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              style={{ padding: '3px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--tx-2)' }}
                              onClick={() => {
                                visualEditorRef.current?.focus();
                                document.execCommand('italic');
                                setForm(p => ({ ...p, body: visualEditorRef.current?.innerHTML || '' }));
                              }}
                              title="Italic"
                            >
                              <Italic size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              style={{ padding: '3px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--tx-2)' }}
                              onClick={() => {
                                visualEditorRef.current?.focus();
                                document.execCommand('insertUnorderedList');
                                setForm(p => ({ ...p, body: visualEditorRef.current?.innerHTML || '' }));
                              }}
                              title="Bullet List"
                            >
                              <List size={12} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            color: 'var(--tx-2)',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setMediaPickerTarget('body');
                            setIsMediaModalOpen(true);
                          }}
                          title="Insert Image from Media Library"
                        >
                          <ImageIcon size={12} />
                          <span>Media Library</span>
                        </button>
                        <label
                          className="btn btn-ghost btn-xs"
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            color: 'var(--tx-2)',
                            cursor: 'pointer'
                          }}
                          title="Upload Image from Computer"
                        >
                          <Upload size={12} />
                          <span>Upload Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadImageFile(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx-4)' }}>Supports headings (#), bold (**), & merge tags</span>
                  </div>

                  {/* Scoped CSS for Typography & Image Selection */}
                  <style>{`
                    .wt-editor-scroll-area img {
                      cursor: pointer !important;
                      transition: outline 0.12s ease, box-shadow 0.12s ease;
                    }
                    .wt-editor-scroll-area img:hover {
                      outline: 2px dashed #3b82f6 !important;
                      outline-offset: 2px;
                    }
                    .wt-editor-scroll-area img.wt-editor-img-selected {
                      outline: 2px solid #2563eb !important;
                      outline-offset: 3px !important;
                      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25) !important;
                    }

                    .wt-editor-scroll-area font[size="1"] { font-size: 8pt !important; line-height: 1.35 !important; }
                    .wt-editor-scroll-area font[size="2"] { font-size: 10pt !important; line-height: 1.45 !important; }
                    .wt-editor-scroll-area font[size="3"] { font-size: 12pt !important; line-height: 1.55 !important; }
                    .wt-editor-scroll-area font[size="4"] { font-size: 14pt !important; line-height: 1.55 !important; }
                    .wt-editor-scroll-area font[size="5"] { font-size: 18pt !important; line-height: 1.45 !important; }
                    .wt-editor-scroll-area font[size="6"] { font-size: 24pt !important; line-height: 1.35 !important; }
                    .wt-editor-scroll-area font[size="7"] { font-size: 36pt !important; line-height: 1.25 !important; }

                    .wt-editor-scroll-area font[face*="Arial"], .wt-editor-scroll-area [style*="Arial"] { font-family: Arial, Helvetica, sans-serif !important; }
                    .wt-editor-scroll-area font[face*="Georgia"], .wt-editor-scroll-area [style*="Georgia"] { font-family: Georgia, serif !important; }
                    .wt-editor-scroll-area font[face*="Times"], .wt-editor-scroll-area [style*="Times"] { font-family: "Times New Roman", Times, serif !important; }
                    .wt-editor-scroll-area font[face*="Garamond"], .wt-editor-scroll-area [style*="Garamond"] { font-family: Garamond, "EB Garamond", Georgia, serif !important; }
                    .wt-editor-scroll-area font[face*="Tahoma"], .wt-editor-scroll-area [style*="Tahoma"] { font-family: Tahoma, Verdana, sans-serif !important; }
                    .wt-editor-scroll-area font[face*="Trebuchet"], .wt-editor-scroll-area [style*="Trebuchet"] { font-family: "Trebuchet MS", "Lucida Grande", sans-serif !important; }
                    .wt-editor-scroll-area font[face*="Verdana"], .wt-editor-scroll-area [style*="Verdana"] { font-family: Verdana, Geneva, sans-serif !important; }
                    .wt-editor-scroll-area font[face*="Courier"], .wt-editor-scroll-area [style*="Courier"] { font-family: "Courier New", Courier, monospace !important; }
                  `}</style>

                  {/* WordPress Image Toolbar Ribbon (appears when an image is selected) */}
                  {selectedImageEl && viewMode === 'visual' && (
                    <div
                      className="wt-image-control-bar"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                        padding: '8px 14px',
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        color: '#ffffff',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        fontSize: 12,
                        fontWeight: 600,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        zIndex: 20
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          color: '#60a5fa',
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}>
                          <ImageIcon size={14} /> Image Selected
                        </div>

                        {/* Steppers: [-] and [+] */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 4px', gap: 2 }}>
                          <button
                            type="button"
                            onClick={() => stepImageSize(-5)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ffffff',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Decrease Size by 5%"
                          >
                            <Minus size={13} />
                          </button>
                          <span style={{ fontSize: 11, fontWeight: 700, minWidth: 38, textAlign: 'center', color: '#93c5fd' }}>
                            {selectedImageWidth}
                          </span>
                          <button
                            type="button"
                            onClick={() => stepImageSize(5)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ffffff',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Increase Size by 5%"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* Preset Buttons: 25%, 50%, 75%, 100% */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                          {(['25%', '50%', '75%', '100%'] as const).map(preset => {
                            const isActive = selectedImageWidth === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => applyImageSize(preset)}
                                style={{
                                  background: isActive ? '#2563eb' : 'rgba(255,255,255,0.08)',
                                  color: isActive ? '#ffffff' : '#cbd5e1',
                                  border: isActive ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.15)',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.12s'
                                }}
                                title={`Set width to ${preset}`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Alignment & Delete & Deselect */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 4px', gap: 2 }}>
                          <button
                            type="button"
                            onClick={() => applyImageAlign('left')}
                            style={{
                              background: selectedImageAlign === 'left' ? '#2563eb' : 'transparent',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 4,
                              padding: '3px 6px',
                              cursor: 'pointer'
                            }}
                            title="Align Left"
                          >
                            <AlignLeft size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => applyImageAlign('center')}
                            style={{
                              background: selectedImageAlign === 'center' ? '#2563eb' : 'transparent',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 4,
                              padding: '3px 6px',
                              cursor: 'pointer'
                            }}
                            title="Align Center"
                          >
                            <AlignCenter size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => applyImageAlign('right')}
                            style={{
                              background: selectedImageAlign === 'right' ? '#2563eb' : 'transparent',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 4,
                              padding: '3px 6px',
                              cursor: 'pointer'
                            }}
                            title="Align Right"
                          >
                            <AlignRight size={13} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={deleteSelectedImage}
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            borderRadius: 6,
                            padding: '3px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700
                          }}
                          title="Delete Image"
                        >
                          <Trash2 size={12} /> Remove
                        </button>

                        <button
                          type="button"
                          onClick={deselectImage}
                          style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#e2e8f0',
                            border: 'none',
                            borderRadius: 6,
                            padding: '3px 6px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: 11
                          }}
                          title="Deselect (Esc)"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}

                  {viewMode === 'visual' ? (
                    <div
                      style={{
                        position: 'relative',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        ref={visualEditorRef}
                        className="wt-editor-scroll-area"
                        contentEditable
                        suppressContentEditableWarning
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.tagName === 'IMG') {
                            e.stopPropagation();
                            selectImage(target as HTMLImageElement);
                          } else if (!target.closest('.wt-image-action-overlay')) {
                            deselectImage();
                          }
                          saveSelection();
                          detectSelectionStyles();
                        }}
                        onKeyUp={() => {
                          saveSelection();
                          detectSelectionStyles();
                        }}
                        onMouseUp={() => {
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
                        onKeyDown={(e) => {
                          if (selectedImageEl) {
                            if (e.key === 'Delete' || e.key === 'Backspace') {
                              e.preventDefault();
                              deleteSelectedImage();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              deselectImage();
                            }
                          }
                        }}
                        onInput={() => {
                          const html = getCleanEditorHtml();
                          setForm(p => ({ ...p, body: html }));
                          if (selectedImageEl && !selectedImageEl.isConnected) {
                            deselectImage();
                          } else if (selectedImageEl) {
                            updateSelectedImageMetrics();
                          }
                        }}
                        onBlur={(e) => {
                          if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.wt-image-control-bar, .wt-image-action-overlay')) {
                            return;
                          }
                          const html = getCleanEditorHtml();
                          setForm(p => ({ ...p, body: html }));
                        }}
                        style={{
                          flex: 1,
                          width: '100%',
                          border: 'none',
                          padding: 20,
                          fontSize: 13.5,
                          lineHeight: 1.65,
                          color: 'var(--tx-1)',
                          outline: 'none',
                          overflowY: 'auto',
                          fontFamily: 'var(--font-sans)',
                          background: 'transparent',
                          boxSizing: 'border-box'
                        }}
                      />

                      {/* Floating WordPress Overlay on top of Selected Image */}
                      {selectedImageEl && selectedImageRect && (
                        <div
                          className="wt-image-action-overlay"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            pointerEvents: 'none',
                            overflow: 'hidden',
                            zIndex: 30
                          }}
                        >
                          {/* Floating Toolbar above the image */}
                          <div
                            style={{
                              position: 'absolute',
                              top: Math.max(10, selectedImageRect.top - 42),
                              left: Math.max(12, Math.min(
                                (visualEditorRef.current?.clientWidth || 500) - 340,
                                selectedImageRect.left + (selectedImageRect.width / 2) - 160
                              )),
                              background: 'rgba(15, 23, 42, 0.95)',
                              backdropFilter: 'blur(8px)',
                              color: '#ffffff',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              pointerEvents: 'auto',
                              border: '1px solid rgba(255,255,255,0.18)',
                              zIndex: 50
                            }}
                          >
                            {/* Preset Buttons */}
                            {(['25%', '50%', '75%', '100%'] as const).map(preset => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => applyImageSize(preset)}
                                style={{
                                  background: selectedImageWidth === preset ? '#2563eb' : 'rgba(255,255,255,0.1)',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: 4,
                                  padding: '2px 7px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {preset}
                              </button>
                            ))}

                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />

                            {/* Steppers */}
                            <button
                              type="button"
                              onClick={() => stepImageSize(-5)}
                              style={{
                                background: 'transparent',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Decrease 5%"
                            >
                              <Minus size={12} />
                            </button>
                            <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, textAlign: 'center', color: '#60a5fa' }}>
                              {selectedImageWidth}
                            </span>
                            <button
                              type="button"
                              onClick={() => stepImageSize(5)}
                              style={{
                                background: 'transparent',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Increase 5%"
                            >
                              <Plus size={12} />
                            </button>

                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />

                            {/* Align */}
                            <button
                              type="button"
                              onClick={() => applyImageAlign('left')}
                              style={{
                                background: selectedImageAlign === 'left' ? '#2563eb' : 'transparent',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 4px',
                                cursor: 'pointer'
                              }}
                              title="Align Left"
                            >
                              <AlignLeft size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => applyImageAlign('center')}
                              style={{
                                background: selectedImageAlign === 'center' ? '#2563eb' : 'transparent',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 4px',
                                cursor: 'pointer'
                              }}
                              title="Align Center"
                            >
                              <AlignCenter size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => applyImageAlign('right')}
                              style={{
                                background: selectedImageAlign === 'right' ? '#2563eb' : 'transparent',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 4px',
                                cursor: 'pointer'
                              }}
                              title="Align Right"
                            >
                              <AlignRight size={12} />
                            </button>

                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />

                            {/* Trash */}
                            <button
                              type="button"
                              onClick={deleteSelectedImage}
                              style={{
                                background: 'transparent',
                                color: '#f87171',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Remove Image"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {/* Drag Handle: Bottom-Right (SE) */}
                          <div
                            onMouseDown={(e) => handleDragStart(e, 'se')}
                            style={{
                              position: 'absolute',
                              top: selectedImageRect.top + selectedImageRect.height - 7,
                              left: selectedImageRect.left + selectedImageRect.width - 7,
                              width: 14,
                              height: 14,
                              background: '#2563eb',
                              border: '2px solid #ffffff',
                              borderRadius: '50%',
                              cursor: 'nwse-resize',
                              pointerEvents: 'auto',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                              zIndex: 40
                            }}
                            title="Drag to resize width"
                          />

                          {/* Drag Handle: Bottom-Left (SW) */}
                          <div
                            onMouseDown={(e) => handleDragStart(e, 'sw')}
                            style={{
                              position: 'absolute',
                              top: selectedImageRect.top + selectedImageRect.height - 7,
                              left: selectedImageRect.left - 7,
                              width: 14,
                              height: 14,
                              background: '#2563eb',
                              border: '2px solid #ffffff',
                              borderRadius: '50%',
                              cursor: 'nesw-resize',
                              pointerEvents: 'auto',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                              zIndex: 40
                            }}
                            title="Drag to resize width"
                          />

                          {/* Drag Handle: Mid-Right (E) */}
                          <div
                            onMouseDown={(e) => handleDragStart(e, 'e')}
                            style={{
                              position: 'absolute',
                              top: selectedImageRect.top + (selectedImageRect.height / 2) - 7,
                              left: selectedImageRect.left + selectedImageRect.width - 7,
                              width: 14,
                              height: 14,
                              background: '#2563eb',
                              border: '2px solid #ffffff',
                              borderRadius: '50%',
                              cursor: 'ew-resize',
                              pointerEvents: 'auto',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                              zIndex: 40
                            }}
                            title="Drag to resize width"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      style={{
                        flex: 1,
                        width: '100%',
                        border: 'none',
                        padding: 20,
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        color: 'var(--tx-1)',
                        outline: 'none',
                        resize: 'none',
                        fontFamily: 'var(--font-sans)',
                        background: 'transparent',
                        boxSizing: 'border-box'
                      }}
                      value={form.body}
                      onChange={(e) => setForm(p => ({ ...p, body: e.target.value }))}
                      placeholder={`# AMC Renewal Letter\n\nDear {{contact_person}},\n\nGreetings from ${companyName || 'Welcome Tech'}!\n\nWrite your content here using Markdown or HTML...`}
                    />
                  )}
                </div>

                {/* Right: Live Preview Column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-3, #f1f5f9)', overflow: 'auto' }}>
                  <div style={{
                    padding: '8px 16px',
                    background: 'var(--surface-2)',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--brand)',
                    borderBottom: '1px solid var(--border)',
                    letterSpacing: '0.04em',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* View Mode Toggle: A4 Sheets vs Inbox */}
                      <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <button
                          type="button"
                          onClick={() => setPreviewMode('a4')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            background: previewMode === 'a4' ? 'var(--brand)' : 'transparent',
                            color: previewMode === 'a4' ? '#ffffff' : 'var(--tx-2)'
                          }}
                        >
                          <FileText size={12} />
                          <span>A4 Paper ({emailPageChunks.length} {emailPageChunks.length === 1 ? 'Page' : 'Pages'})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewMode('inbox')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            background: previewMode === 'inbox' ? 'var(--brand)' : 'transparent',
                            color: previewMode === 'inbox' ? '#ffffff' : 'var(--tx-2)'
                          }}
                        >
                          <Mail size={12} />
                          <span>Inbox View</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          insertAtCursor('\n\n[pagebreak]\n\n');
                          toast.success('Inserted [pagebreak] — content after this will start on next A4 sheet');
                        }}
                        title="Insert A4 Page Break at cursor position"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 10px',
                          background: 'var(--brand-light, #ede9fe)',
                          border: '1px solid var(--brand)',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--brand)',
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={12} />
                        <span>+ A4 Page Break</span>
                      </button>
                    </div>

                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Subject: {form.subject || '—'}
                    </span>
                  </div>

                  <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                    {previewMode === 'inbox' ? (
                      /* Continuous Inbox Preview */
                      <div style={{
                        width: '100%',
                        maxWidth: 580,
                        background: '#ffffff',
                        borderRadius: 12,
                        boxShadow: '0 4px 20px rgba(15,23,42,0.08)',
                        border: '1px solid #e2e8f0',
                        minHeight: 480,
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        {proposalWatermark && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            opacity: 0.05
                          }}>
                            <img src={toAssetUrl(proposalWatermark)} alt="" style={{ width: '60%', maxHeight: '60%', objectFit: 'contain' }} />
                          </div>
                        )}

                        {form.headerImage ? (
                          <div style={{ width: '100%', borderBottom: '1px solid #e2e8f0', position: 'relative', zIndex: 1 }}>
                            <img src={toAssetUrl(form.headerImage)} alt="Header Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ padding: '24px 28px 16px', borderBottom: '2px solid var(--brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                            {logo ? (
                              <img src={toAssetUrl(logo)} alt="Logo" style={{ maxHeight: 40, width: 'auto' }} />
                            ) : (
                              <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--brand)' }}>{companyName || 'Welcome Tech'}</span>
                            )}
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              OFFICIAL TEMPLATE
                            </span>
                          </div>
                        )}

                        <div style={{ padding: '24px 28px', flex: 1, position: 'relative', zIndex: 1 }}>
                          {form.subject && (
                            <div style={{
                              marginBottom: 20,
                              padding: '10px 14px',
                              background: '#f8fafc',
                              borderLeft: '4px solid var(--brand)',
                              borderRadius: 6,
                              fontSize: 13,
                              color: '#334155',
                              fontWeight: 600
                            }}>
                              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)', marginRight: 8, letterSpacing: '0.04em' }}>Subject:</span>
                              {form.subject}
                            </div>
                          )}

                          <div
                            className="rendered-email-body"
                            dangerouslySetInnerHTML={{ __html: renderRenderedBody(form.body, form.headerImage, form.footerImage) }}
                          />
                        </div>

                        {form.footerImage ? (
                          <div style={{ width: '100%', borderTop: '1px solid #e2e8f0', position: 'relative', zIndex: 1 }}>
                            <img src={toAssetUrl(form.footerImage)} alt="Footer Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                          </div>
                        ) : (
                          <div style={{ padding: '14px 28px', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 11, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                            © {new Date().getFullYear()} {companyName || 'Welcome Tech'}. All rights reserved.
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Discrete A4 Paper Sheets */
                      emailPageChunks.map((chunk) => (
                        <React.Fragment key={chunk.pageNum}>
                          <div
                            className="a4-preview-sheet"
                            style={{
                              width: '100%',
                              maxWidth: 680,
                              minHeight: 960,
                              background: '#ffffff',
                              borderRadius: 8,
                              boxShadow: '0 8px 30px rgba(15,23,42,0.12)',
                              border: '1px solid #cbd5e1',
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              boxSizing: 'border-box',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Watermark in Preview */}
                            {proposalWatermark && (
                              <div style={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                                opacity: 0.05
                              }}>
                                <img src={toAssetUrl(proposalWatermark)} alt="" style={{ width: '60%', maxHeight: '60%', objectFit: 'contain' }} />
                              </div>
                            )}

                            {/* Page Header */}
                            {form.headerImage ? (
                              <div>
                                <div style={{ width: '100%', borderBottom: '1.5px solid #cbd5e1', position: 'relative', zIndex: 1 }}>
                                  <img src={toAssetUrl(form.headerImage)} alt="Header Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                </div>
                                {!chunk.isFirst && (
                                  <div style={{
                                    padding: '8px 28px',
                                    borderBottom: '1px solid #e2e8f0',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: '#ffffff',
                                    fontSize: 10.5,
                                    color: 'var(--tx-3)',
                                    position: 'relative',
                                    zIndex: 1
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--tx-2)' }}>
                                      <FileText size={12} color="var(--brand)" />
                                      <span>{form.name || 'Email Template'} · {companyName || 'Welcome Tech'}</span>
                                    </div>
                                    <span style={{ fontWeight: 800, color: 'var(--brand)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                      Page {chunk.pageNum} of {chunk.totalPages}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : chunk.isFirst ? (
                              <div style={{ padding: '20px 28px 14px', borderBottom: '2px solid var(--brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                {logo ? (
                                  <img src={toAssetUrl(logo)} alt="Logo" style={{ maxHeight: 38, width: 'auto' }} />
                                ) : (
                                  <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--brand)' }}>{companyName || 'Welcome Tech'}</span>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    OFFICIAL TEMPLATE
                                  </span>
                                  <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 4, color: 'var(--tx-2)' }}>
                                    Page {chunk.pageNum} of {chunk.totalPages}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              // Running Header on Continuation Pages
                              <div style={{
                                padding: '12px 28px',
                                borderBottom: '1.5px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#f8fafc',
                                fontSize: 11,
                                color: 'var(--tx-3)',
                                position: 'relative',
                                zIndex: 1
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--tx-2)' }}>
                                  <FileText size={13} color="var(--brand)" />
                                  <span>{form.name || 'Email Template'} · {companyName || 'Welcome Tech'}</span>
                                </div>
                                <span style={{ fontWeight: 800, color: 'var(--brand)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                  Page {chunk.pageNum} of {chunk.totalPages}
                                </span>
                              </div>
                            )}

                            {/* Page Content Body */}
                            <div style={{ padding: '24px 28px', flex: 1, position: 'relative', zIndex: 1 }}>
                              {chunk.isFirst && form.subject && (
                                <div style={{
                                  marginBottom: 18,
                                  padding: '10px 14px',
                                  background: '#f8fafc',
                                  borderLeft: '4px solid var(--brand)',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  color: '#334155',
                                  fontWeight: 600
                                }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)', marginRight: 8, letterSpacing: '0.04em' }}>Subject:</span>
                                  {form.subject}
                                </div>
                              )}

                              <div
                                className="rendered-email-body"
                                dangerouslySetInnerHTML={{ __html: renderRenderedBody(chunk.content, form.headerImage, form.footerImage) }}
                              />
                            </div>

                            {/* Page Footer */}
                            {form.footerImage ? (
                              <div style={{ width: '100%', marginTop: 'auto', position: 'relative', zIndex: 1 }}>
                                <div style={{
                                  padding: '6px 28px',
                                  borderTop: '1px solid #f1f5f9',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  color: '#94a3b8',
                                  fontSize: 10.5,
                                  background: '#ffffff',
                                }}>
                                  <span>{chunk.isLast ? `© ${new Date().getFullYear()} ${companyName || 'Welcome Tech'}. All rights reserved.` : `${companyName || 'Welcome Tech CRM'} · Confidential Template`}</span>
                                  <span style={{ fontWeight: 700 }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                                </div>
                                <div style={{ width: '100%', borderTop: '1.5px solid #cbd5e1' }}>
                                  <img src={toAssetUrl(form.footerImage)} alt="Footer Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                </div>
                              </div>
                            ) : chunk.isLast ? (
                              <div style={{
                                padding: '12px 28px',
                                borderTop: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: '#94a3b8',
                                fontSize: 11,
                                position: 'relative',
                                zIndex: 1,
                                marginTop: 'auto'
                              }}>
                                <span>© {new Date().getFullYear()} {companyName || 'Welcome Tech'}. All rights reserved.</span>
                                <span style={{ fontWeight: 700 }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                              </div>
                            ) : (
                              // Running Footer on continuation pages
                              <div style={{
                                padding: '10px 28px',
                                borderTop: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: '#94a3b8',
                                fontSize: 11,
                                background: '#ffffff',
                                position: 'relative',
                                zIndex: 1,
                                marginTop: 'auto'
                              }}>
                                <span>{companyName || 'Welcome Tech CRM'} · Confidential Template</span>
                                <span style={{ fontWeight: 700, color: 'var(--tx-3)' }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                              </div>
                            )}
                          </div>

                          {/* Visual Divider between A4 Sheets */}
                          {!chunk.isLast && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 12,
                              width: '100%',
                              maxWidth: 680,
                              margin: '4px 0'
                            }}>
                              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 14px',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 20,
                                fontSize: 10.5,
                                fontWeight: 800,
                                color: 'var(--tx-3)',
                                letterSpacing: '0.04em',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                              }}>
                                <FileText size={11} color="var(--brand)" />
                                <span>END OF A4 PAGE {chunk.pageNum} · NEXT: PAGE {chunk.pageNum + 1}</span>
                              </div>
                              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Merge Variables Insertion Ribbon */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tx-4)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚡ Dynamic Merge Tags — Click to insert at cursor position</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                title="Insert [pagebreak] to start subsequent content on a new A4 sheet"
                onClick={() => {
                  insertAtCursor('\n\n[pagebreak]\n\n');
                  toast.success('Inserted [pagebreak] — content after this will start on next A4 sheet');
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  background: 'var(--brand)',
                  border: '1px solid var(--brand)',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontFamily: 'var(--font-sans)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 750,
                  boxShadow: '0 2px 6px rgba(109,40,217,0.25)',
                  transition: 'all 0.15s'
                }}
              >
                <FileText size={12} />
                <span>+ A4 Page Break [pagebreak]</span>
              </button>
              {templateVariables.map(v => (
                <button
                  key={v.key}
                  type="button"
                  title={v.label}
                  onClick={() => insertAtCursor(v.key)}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--brand-light)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 11.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--brand)',
                    cursor: 'pointer',
                    fontWeight: 650,
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--brand)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand-light)'; e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Media Picker Modal */}
        <Modal 
          open={isMediaModalOpen} 
          onClose={() => {
            setIsMediaModalOpen(false);
            setMediaPickerTarget('body');
          }}
          title={
            mediaPickerTarget === 'header'
              ? 'Select Header Banner (Recommended: 1400×220px)'
              : mediaPickerTarget === 'footer'
              ? 'Select Footer Banner (Recommended: 1400×110px)'
              : 'Select Media Asset'
          }
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
                if (mediaPickerTarget === 'header') {
                  setForm(p => ({ ...p, headerImage: file.url }));
                  toast.success('Header banner applied');
                } else if (mediaPickerTarget === 'footer') {
                  setForm(p => ({ ...p, footerImage: file.url }));
                  toast.success('Footer banner applied');
                } else {
                  const fullUrl = toAssetUrl(file.url).startsWith('http') 
                    ? toAssetUrl(file.url) 
                    : `${window.location.origin}${toAssetUrl(file.url)}`;
                  
                  insertImageIntoEditor(fullUrl, file.name);
                  toast.success('Image inserted into template');
                }
                setIsMediaModalOpen(false);
                setMediaPickerTarget('body');
              }} 
            />
          </div>
        </Modal>

        {/* Preview Modal */}
        <Modal
          open={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          title={`Template Full View Preview (${emailPageChunks.length} A4 ${emailPageChunks.length === 1 ? 'Page' : 'Pages'})`}
          size="xl"
        >
          <div style={{ background: '#eef2f7', padding: '24px 16px 30px 16px', borderRadius: 12, overflow: 'auto', maxHeight: '78vh' }}>
            <div style={{ maxWidth: 740, margin: '0 auto', display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadPdf()}
                title="Download template as PDF (Ctrl+P / ⌘P)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              >
                <Download size={14} /> Download PDF
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
            </div>
            <div style={{ maxWidth: 740, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
              {emailPageChunks.map((chunk) => (
                <React.Fragment key={chunk.pageNum}>
                  <div style={{
                    width: '100%',
                    background: '#ffffff',
                    borderRadius: 8,
                    boxShadow: '0 8px 30px rgba(15,23,42,0.12)',
                    border: '1px solid #cbd5e1',
                    minHeight: 1040,
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Watermark in Modal Preview */}
                    {proposalWatermark && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        opacity: 0.05
                      }}>
                        <img src={toAssetUrl(proposalWatermark)} alt="" style={{ width: '60%', maxHeight: '60%', objectFit: 'contain' }} />
                      </div>
                    )}

                    {/* Header Banner or Logo Letterhead */}
                    {form.headerImage ? (
                      <div>
                        <div style={{ width: '100%', borderBottom: '1.5px solid #cbd5e1', position: 'relative', zIndex: 1 }}>
                          <img src={toAssetUrl(form.headerImage)} alt="Header Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                        </div>
                        {!chunk.isFirst && (
                          <div style={{
                            padding: '8px 32px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#ffffff',
                            fontSize: 11,
                            color: 'var(--tx-3)',
                            position: 'relative',
                            zIndex: 1
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--tx-2)' }}>
                              <FileText size={13} color="var(--brand)" />
                              <span>{form.name || 'Email Template'} · {companyName || 'Welcome Tech'}</span>
                            </div>
                            <span style={{ fontWeight: 800, color: 'var(--brand)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                              Page {chunk.pageNum} of {chunk.totalPages}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : chunk.isFirst ? (
                      <div style={{ padding: '24px 32px 18px', borderBottom: '2px solid var(--brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                        {logo ? (
                          <img src={toAssetUrl(logo)} alt="Logo" style={{ maxHeight: 44, width: 'auto' }} />
                        ) : (
                          <span style={{ fontSize: 19, fontWeight: 900, color: 'var(--brand)' }}>{companyName || 'Welcome Tech'}</span>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            OFFICIAL TEMPLATE
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, color: 'var(--tx-2)' }}>
                            Page {chunk.pageNum} of {chunk.totalPages}
                          </span>
                        </div>
                      </div>
                    ) : (
                      // Running Header on Continuation Pages
                      <div style={{
                        padding: '12px 32px',
                        borderBottom: '1.5px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#f8fafc',
                        fontSize: 11.5,
                        color: 'var(--tx-3)',
                        position: 'relative',
                        zIndex: 1
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--tx-2)' }}>
                          <FileText size={14} color="var(--brand)" />
                          <span>{form.name || 'Email Template'} · {companyName || 'Welcome Tech'}</span>
                        </div>
                        <span style={{ fontWeight: 800, color: 'var(--brand)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                          Page {chunk.pageNum} of {chunk.totalPages}
                        </span>
                      </div>
                    )}

                    {/* Main Content Area */}
                    <div style={{ padding: '28px 32px', flex: 1, position: 'relative', zIndex: 1 }}>
                      {chunk.isFirst && form.subject && (
                        <div style={{
                          marginBottom: 24,
                          padding: '12px 16px',
                          background: '#f8fafc',
                          borderLeft: '4px solid var(--brand)',
                          borderRadius: 6,
                          fontSize: 13.5,
                          color: '#1e293b',
                          fontWeight: 600
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--brand)', marginRight: 8, letterSpacing: '0.04em' }}>Subject:</span>
                          {form.subject}
                        </div>
                      )}

                      <div className="rendered-email-body" dangerouslySetInnerHTML={{ __html: renderRenderedBody(chunk.content, form.headerImage, form.footerImage) }} />
                    </div>

                    {/* Footer Banner or Copyright */}
                    {form.footerImage ? (
                      <div style={{ width: '100%', marginTop: 'auto', position: 'relative', zIndex: 1 }}>
                        <div style={{
                          padding: '6px 32px',
                          borderTop: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          color: '#94a3b8',
                          fontSize: 11,
                          background: '#ffffff',
                        }}>
                          <span>{chunk.isLast ? `© ${new Date().getFullYear()} ${companyName || 'Welcome Tech'}. All rights reserved.` : `${companyName || 'Welcome Tech CRM'} · Confidential Template`}</span>
                          <span style={{ fontWeight: 700 }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                        </div>
                        <div style={{ width: '100%', borderTop: '1.5px solid #cbd5e1' }}>
                          <img src={toAssetUrl(form.footerImage)} alt="Footer Banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
                        </div>
                      </div>
                    ) : chunk.isLast ? (
                      <div style={{
                        padding: '14px 32px',
                        borderTop: '1px solid #f1f5f9',
                        color: '#94a3b8',
                        fontSize: 11.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        position: 'relative',
                        zIndex: 1,
                        marginTop: 'auto'
                      }}>
                        <span>© {new Date().getFullYear()} {companyName || 'Welcome Tech'}. All rights reserved.</span>
                        <span style={{ fontWeight: 700 }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                      </div>
                    ) : (
                      // Running Footer on continuation pages
                      <div style={{
                        padding: '12px 32px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: '#94a3b8',
                        fontSize: 11.5,
                        background: '#ffffff',
                        position: 'relative',
                        zIndex: 1,
                        marginTop: 'auto'
                      }}>
                        <span>{companyName || 'Welcome Tech CRM'} · Confidential Template</span>
                        <span style={{ fontWeight: 700, color: 'var(--tx-3)' }}>Page {chunk.pageNum} of {chunk.totalPages}</span>
                      </div>
                    )}
                  </div>

                  {/* Visual Divider between Modal A4 Sheets */}
                  {!chunk.isLast && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                      width: '100%',
                      margin: '4px 0'
                    }}>
                      <div style={{ flex: 1, height: 1, background: '#cbd5e1' }} />
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 14px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#475569',
                        letterSpacing: '0.04em',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                      }}>
                        <FileText size={12} color="var(--brand)" />
                        <span>END OF A4 PAGE {chunk.pageNum} · NEXT: PAGE {chunk.pageNum + 1}</span>
                      </div>
                      <div style={{ flex: 1, height: 1, background: '#cbd5e1' }} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Email Templates</div>
          <div className="page-subtitle">Manage system email layouts and dynamic content placeholders</div>
        </div>
      </div>

      <div className="kpi-grid">
        {kpiCards.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>{kpi.icon}</div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-change">{kpi.change}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep">
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
              className="btn btn-primary btn-sm"
              onClick={() => {
                setIsNew(true);
                setSelectedId(null);
                setForm({
                  name: '',
                  subject: '',
                  body: '',
                  headerImage: activeProposalTemplate?.templateImage || '',
                  footerImage: activeProposalTemplate?.templateFooterImage || ''
                });
                setEditorOpen(true);
              }}
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
                <th>Subject Line</th>
                <th>Header & Footer</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
              ) : filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Mail size={22} />}
                      title="No email templates yet"
                      action={
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setIsNew(true);
                            setSelectedId(null);
                            setForm({
                              name: '',
                              subject: '',
                              body: '',
                              headerImage: activeProposalTemplate?.templateImage || '',
                              footerImage: activeProposalTemplate?.templateFooterImage || ''
                            });
                            setEditorOpen(true);
                          }}
                        >
                          <PlusCircle size={13} /> New Template
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((t, idx) => (
                  <tr key={t._id}>
                    <td className="sno-col">{idx + 1}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--tx-1)' }}>{t.name}</span>
                    </td>
                    <td>
                      <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto', color: 'var(--tx-2)', fontWeight: 500 }}>
                        {t.subject || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {t.headerImage && t.footerImage ? (
                          <span style={{ background: 'var(--brand-light)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                            Header + Footer
                          </span>
                        ) : t.headerImage ? (
                          <span style={{ background: 'var(--brand-light)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                            Header Only
                          </span>
                        ) : t.footerImage ? (
                          <span style={{ background: 'var(--brand-light)', color: 'var(--brand)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                            Footer Only
                          </span>
                        ) : (
                          <span style={{ background: 'var(--surface-2)', color: 'var(--tx-3)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            Letterhead
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--tx-3)', fontWeight: 600 }}>
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn-action btn-action-blue"
                          title="Download PDF"
                          onClick={() => handleDownloadPdf(t)}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action-green"
                          title="Send Template via Email"
                          disabled={sendTemplateMutation.isPending}
                          onClick={() => {
                            setSendTemplateTarget(t);
                            setSendRecipientEmail('');
                          }}
                        >
                          <Send size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action-amber"
                          title="Edit Template"
                          onClick={() => {
                            setSelectedId(t._id);
                            setIsNew(false);
                            setForm({
                              name: t.name,
                              subject: t.subject,
                              body: t.body,
                              headerImage: t.headerImage || '',
                              footerImage: t.footerImage || ''
                            });
                            setEditorOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action-red"
                          title="Delete Template"
                          onClick={() => setDeleteTemplateTarget(t)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Template Email Modal (Matching Proposal Template UI) */}
      <Modal
        open={!!sendTemplateTarget}
        onClose={() => setSendTemplateTarget(null)}
        title="Send Proposal via Email"
        size="md"
      >
        {!sendTemplateTarget ? null : (
          <div>
            <div style={{ padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 900, color: 'var(--brand)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>{sendTemplateTarget.name}</span>
                <span style={{ fontWeight: 900, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-1)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  EMAIL TEMPLATE
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 750, color: 'var(--tx-1)' }}>
                {sendTemplateTarget.subject || 'Service Quotation Template'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                {sendTemplateTarget.headerImage || sendTemplateTarget.footerImage ? 'Service Quotation Template (Dynamic Banners)' : 'Service Quotation Template'}
              </div>
            </div>

            <InputField
              label="Recipient Email Address"
              type="email"
              placeholder="client@example.com"
              value={sendRecipientEmail}
              onChange={(val) => setSendRecipientEmail(val)}
              autoFocus
            />
            <p style={{ fontSize: 11.5, color: 'var(--tx-4)', marginTop: 6, marginBottom: 18 }}>
              The complete proposal quotation, line items, and terms will be dispatched directly to this email address via your configured SMTP server.
            </p>

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
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <ConfirmDialog
        open={!!deleteTemplateTarget}
        title="Delete Template"
        message={`Are you sure you want to permanently delete "${deleteTemplateTarget?.name || 'this template'}"? This action cannot be undone.`}
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (deleteTemplateTarget) deleteMut.mutate(deleteTemplateTarget._id);
        }}
        onCancel={() => setDeleteTemplateTarget(null)}
      />
    </div>
  );
};
