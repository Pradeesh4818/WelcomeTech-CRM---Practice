import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { UPLOAD_ROOT_DIR } from '../config/storage';
import { cleanWordArtifacts, renderProposalPdfWithChrome } from './htmlPdfGenerator';

export interface TemplatePdfData {
  title?: string;
  subject: string;
  body: string;
  customerName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  product?: string;
  serialNo?: string;
  release?: string;
  startDate?: string;
  expiryDate?: string;
  amount?: string | number;
  dynamicData?: Record<string, string>;
  settings?: any;
  defaultTemplate?: any;
  headerImage?: string;
  footerImage?: string;
  templateImage?: string;
  templateFooterImage?: string;
}

export const resolveLocalFilePath = (value?: string): string | null => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw.startsWith('data:')) return null;
  try {
    let clean = raw;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        clean = parsed.pathname;
      } catch {
        clean = raw;
      }
    }
    clean = clean.replace(/^[/\\]+/, '').replace(/^api\/v1\//, '');
    const uploadRel = clean.match(/(?:^|\/)(uploads\/.+)$/);
    const relativeTarget = uploadRel ? uploadRel[1] : clean;
    const uploadRoot = (process.env.UPLOAD_ROOT_DIR || UPLOAD_ROOT_DIR || '').replace(/[\\/]+$/, '');
    const uploadRootTarget = relativeTarget.replace(/^uploads[\\/]/, '');

    const possiblePaths = [
      ...(uploadRoot ? [
        path.join(uploadRoot, uploadRootTarget),
        path.join(uploadRoot, path.basename(clean)),
        path.join(uploadRoot, 'settings', path.basename(clean)),
        path.join(uploadRoot, 'templates', path.basename(clean)),
      ] : []),
      path.resolve(clean),
      path.resolve(relativeTarget),
      path.join(process.cwd(), clean),
      path.join(process.cwd(), relativeTarget),
      path.join(process.cwd(), 'backend', relativeTarget),
      path.join(process.cwd(), '..', relativeTarget),
      path.join(process.cwd(), 'uploads', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', path.basename(clean)),
      path.join(__dirname, '..', '..', relativeTarget),
      path.join(__dirname, '..', '..', 'uploads', path.basename(clean)),
      path.join(__dirname, '..', '..', '..', 'backend', relativeTarget),
      path.join(__dirname, '..', '..', 'uploads', 'settings', path.basename(clean)),
      path.join(process.cwd(), 'uploads', 'settings', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', 'settings', path.basename(clean)),
      path.join(__dirname, '..', '..', 'uploads', 'templates', path.basename(clean)),
      path.join(process.cwd(), 'uploads', 'templates', path.basename(clean)),
      path.join(process.cwd(), 'backend', 'uploads', 'templates', path.basename(clean)),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    }
  } catch (e) {}
  return null;
};

export const resolveEmailAsset = (
  rawPath?: string,
  cidName = 'asset',
  defaultFilename = 'banner',
  attachmentsList?: any[],
  backendOrigin?: string
): string => {
  if (!rawPath) return '';
  const str = String(rawPath).trim();
  if (!str) return '';

  // 1. Data URI (Base64)
  const dataMatch = str.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataMatch) {
    if (Array.isArray(attachmentsList)) {
      const mime = dataMatch[1].toLowerCase();
      const cid = `${cidName}-${attachmentsList.length}@welcometech`;
      attachmentsList.push({
        content: Buffer.from(dataMatch[2], 'base64'),
        cid,
        contentDisposition: 'inline',
        contentType: mime,
      });
      return `cid:${cid}`;
    }
    // Data URIs are blocked by email clients (Gmail/Outlook).
    // Return empty string to allow clean branded letterhead fallback.
    return '';
  }

  // 2. Already an absolute HTTP/HTTPS URL
  if (/^https?:\/\//i.test(str)) return str;

  // 3. Uploaded / hosted server assets (e.g. /uploads/media/...)
  // By resolving to public HTTPS URL, the email client renders the image in the body
  // while preventing Gmail from creating a separate image attachment card at the bottom of the email.
  const backendUrl = (
    backendOrigin ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 8080}`
  ).replace(/\/+$/, '');

  const clean = str.replace(/^[/\\]+/, '');
  const uploadMatch = clean.replace(/\\/g, '/').match(/(?:^|\/)(uploads\/.+)$/);
  if (uploadMatch) {
    return `${backendUrl}/api/v1/${uploadMatch[1]}`;
  }

  // 4. Local file on disk fallback (outside uploads directory)
  if (Array.isArray(attachmentsList)) {
    const localPath = resolveLocalFilePath(str);
    if (localPath) {
      const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      const cid = `${cidName}-${attachmentsList.length}@welcometech`;
      attachmentsList.push({
        path: localPath,
        cid,
        contentDisposition: 'inline',
        contentType: mime,
      });
      return `cid:${cid}`;
    }
  }

  return `${backendUrl}/${clean}`;
};

const formatDate = (val: any): string => {
  if (!val) return '—';
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatMoney = (val: any, currency = 'QAR'): string => {
  const num = Number(String(val || '').replace(/[^\d.-]/g, ''));
  if (Number.isNaN(num) || num === 0) return val ? String(val) : '—';
  return `${currency} ${num.toLocaleString('en-US')}`;
};

export const stripInlineImagesFromText = (text: string): string => {
  if (!text) return '';
  return text
    // Strip redundant markdown images specifically referencing Header or Footer banner
    .replace(/!\[\s*(?:Header|Footer|Banner)[^\]]*\]\([^)]*\)/gi, '')
    // Strip redundant HTML <img> specifically with Header or Footer banner alt/src
    .replace(/<img\b[^>]*alt=["'](?:Header|Footer|Banner)[^"']*["'][^>]*\/?>/gi, '')
    // Strip standalone lines that look like banner image filenames e.g. "Header.png", "Footer.jpg"
    .replace(/^\s*(?:Header|Footer|Banner)\.(?:png|jpg|jpeg|webp|svg|gif)\s*$/gim, '')
    // Strip bracketed banner references like "[Header.png]" or "[Footer.jpg]"
    .replace(/\[\s*(?:Header|Footer|Banner)\.(?:png|jpg|jpeg|webp|svg|gif)\s*\]/gi, '')
    // Clean up empty lines
    .replace(/\n{3,}/g, '\n\n');
};

export const resolvePdfAssetAsync = async (value?: string | Buffer | null): Promise<Buffer | string | null> => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  // 1. Data URI (Base64)
  const dataMatch = raw.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (dataMatch) {
    try {
      return Buffer.from(dataMatch[1], 'base64');
    } catch {
      return null;
    }
  }

  // 2. Pure base64
  if (raw.length > 200 && /^[A-Za-z0-9+/=]+$/.test(raw)) {
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }

  // 3. Local file path on disk
  const local = resolveLocalFilePath(raw);
  if (local) return local;

  // 4. Remote HTTP/HTTPS URL
  if (/^https?:\/\//i.test(raw)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(raw, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (e) {}
  }

  return null;
};

/** Legacy plain PDFKit letter – only used if headless Chrome is unavailable. */
const generateLegacyTemplatePdfBuffer = async (data: TemplatePdfData): Promise<Buffer> => {
  const {
    subject,
    body,
    customerName = 'Valued Customer',
    contactPerson,
    phone,
    email,
    address,
    product,
    serialNo,
    release,
    startDate,
    expiryDate,
    amount,
    dynamicData = {},
    settings,
    defaultTemplate,
    headerImage,
    footerImage,
    templateImage,
    templateFooterImage,
  } = data;

  const rawHeader =
    (headerImage && String(headerImage).trim()) ||
    (templateImage && String(templateImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    (defaultTemplate?.templateImage && String(defaultTemplate.templateImage).trim()) ||
    (defaultTemplate?.headerImage && String(defaultTemplate.headerImage).trim()) ||
    '';
  const rawFooter =
    (footerImage && String(footerImage).trim()) ||
    (templateFooterImage && String(templateFooterImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    (defaultTemplate?.templateFooterImage && String(defaultTemplate.templateFooterImage).trim()) ||
    (defaultTemplate?.footerImage && String(defaultTemplate.footerImage).trim()) ||
    '';
  const rawLogo = settings?.logo;

  const headerAsset = await resolvePdfAssetAsync(rawHeader);
  const footerAsset = await resolvePdfAssetAsync(rawFooter);
  const logoAsset = await resolvePdfAssetAsync(rawLogo);

  const companyName = settings?.companyName || 'Welcome Trading Co. W.L.L';
  const website = settings?.website || 'www.welcometech.qa';
  const currency = settings?.currency || 'QAR';

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        autoFirstPage: true,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const leftMargin = 40;
      const rightMargin = 40;
      const contentWidth = pageWidth - leftMargin - rightMargin; // 515.28

      let headerScaledHeight = 0;
      let currentY = 40;

      // 1. Header Banner (Full-bleed top with zero gap & bottom separator line)
      if (headerAsset) {
        try {
          const img = (doc as any).openImage(headerAsset);
          const imgWidth = img?.width || pageWidth;
          const imgHeight = img?.height || 100;
          headerScaledHeight = Math.min((imgHeight / imgWidth) * pageWidth, 130);

          const origMarginTop = doc.page.margins.top;
          doc.page.margins.top = 0;
          doc.image(headerAsset, 0, 0, { width: pageWidth, height: headerScaledHeight });
          doc.page.margins.top = origMarginTop;

          doc.moveTo(0, headerScaledHeight).lineTo(pageWidth, headerScaledHeight).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
          currentY = headerScaledHeight + 24;
        } catch (e) {
          currentY = 40;
        }
      } else if (logoAsset) {
        try {
          doc.image(logoAsset, leftMargin, 36, { height: 40 });
        } catch (e) {}
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#6d28d9').text(companyName, leftMargin + 60, 38);
        if (website) doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(website, leftMargin + 60, 56);
        currentY = 96;
      } else {
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#6d28d9').text(companyName, leftMargin, currentY);
        if (website) doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(website, leftMargin, currentY + 18);
        currentY += 40;
      }

      // Calculate footer height and bottom limit
      let footerScaledHeight = 0;
      if (footerAsset) {
        try {
          const fImg = (doc as any).openImage(footerAsset);
          const fWidth = fImg?.width || pageWidth;
          const fHeight = fImg?.height || 60;
          footerScaledHeight = Math.min((fHeight / fWidth) * pageWidth, 80);
        } catch (e) {
          footerScaledHeight = 0;
        }
      }
      const maxContentY = footerAsset ? pageHeight - footerScaledHeight - 24 : pageHeight - 40;

      const ensureSpace = (neededHeight: number) => {
        if (currentY + neededHeight > maxContentY) {
          doc.addPage();
          if (headerAsset && headerScaledHeight > 0) {
            try {
              const origMarginTop = doc.page.margins.top;
              doc.page.margins.top = 0;
              doc.image(headerAsset, 0, 0, { width: pageWidth, height: headerScaledHeight });
              doc.page.margins.top = origMarginTop;
              doc.moveTo(0, headerScaledHeight).lineTo(pageWidth, headerScaledHeight).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
              currentY = headerScaledHeight + 24;
            } catch (e) {
              currentY = 40;
            }
          } else {
            currentY = 40;
          }
        }
      };

      // 2. Clean Body Text & Markdown Parsing
      let cleanBody = stripInlineImagesFromText(body || '')
        .replace(/\r\n/g, '\n')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\n[IMAGE:$2]\n')
        .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '\n[IMAGE:$1]\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/Dear\s*,/gi, 'Dear Valued Customer,')
        .replace(/Dear\s*—\s*,/gi, 'Dear Valued Customer,')
        .trim();

      // If body has a top heading (# Title), extract it and render as prominent document title
      const lines = cleanBody.split('\n');
      let inList = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          if (inList) {
            currentY += 4;
            inList = false;
          }
          continue;
        }

        // Inline Image rendering
        if (/^\[IMAGE:(.+)\]$/.test(line)) {
          const imgSrc = line.replace(/^\[IMAGE:/, '').replace(/\]$/, '').trim();
          try {
            let imgBuffer: Buffer | string | null = null;
            const base64Match = imgSrc.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
            if (base64Match) {
              imgBuffer = Buffer.from(base64Match[1], 'base64');
            } else {
              imgBuffer = resolveLocalFilePath(imgSrc);
            }
            if (imgBuffer) {
              ensureSpace(160);
              doc.image(imgBuffer, leftMargin, currentY, { fit: [contentWidth, 240], align: 'center' });
              currentY += 170;
              inList = false;
              continue;
            }
          } catch (e) {}
        }

        // H1 Heading: # Title
        if (/^#\s+(.+)$/.test(line)) {
          const title = line.replace(/^#\s+/, '').trim();
          ensureSpace(40);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(title, leftMargin, currentY, { width: contentWidth });
          currentY += doc.heightOfString(title, { width: contentWidth }) + 8;
          doc.moveTo(leftMargin, currentY).lineTo(leftMargin + contentWidth, currentY).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
          currentY += 14;
          inList = false;
          continue;
        }

        // H2 Heading: ## Title
        if (/^##\s+(.+)$/.test(line)) {
          const h2 = line.replace(/^##\s+/, '').trim();
          ensureSpace(32);
          currentY += 8;
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12.5).text(h2, leftMargin, currentY, { width: contentWidth });
          currentY += doc.heightOfString(h2, { width: contentWidth }) + 6;
          inList = false;
          continue;
        }

        // H3 Heading: ### Title
        if (/^###\s+(.+)$/.test(line)) {
          const h3 = line.replace(/^###\s+/, '').trim();
          ensureSpace(28);
          currentY += 6;
          doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(10.5).text(h3, leftMargin, currentY, { width: contentWidth });
          currentY += doc.heightOfString(h3, { width: contentWidth }) + 6;
          inList = false;
          continue;
        }

        // Horizontal Rule: ---, ***, ___
        if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
          ensureSpace(20);
          currentY += 6;
          doc.moveTo(leftMargin, currentY).lineTo(leftMargin + contentWidth, currentY).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
          currentY += 12;
          inList = false;
          continue;
        }

        // Key-Value List item: - Key: Value
        const kvMatch = line.match(/^[-*•]\s+([^:]+):\s*(.*)$/);
        if (kvMatch) {
          inList = true;
          const key = kvMatch[1].trim();
          const val = kvMatch[2].trim() || '—';
          ensureSpace(18);

          doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(9.5).text('•', leftMargin + 6, currentY);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(`${key}:`, leftMargin + 16, currentY, { continued: true });
          doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(` ${val}`, { width: contentWidth - 16 });

          const rowHeight = Math.max(
            doc.heightOfString(`${key}: ${val}`, { width: contentWidth - 16 }),
            14
          );
          currentY += rowHeight + 3;
          continue;
        }

        // Regular Bullet List item: - Item
        const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
          inList = true;
          const itemText = bulletMatch[1].trim().replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
          ensureSpace(18);

          doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(9.5).text('•', leftMargin + 6, currentY);
          doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(itemText, leftMargin + 16, currentY, { width: contentWidth - 16 });

          const rowHeight = doc.heightOfString(itemText, { width: contentWidth - 16 });
          currentY += rowHeight + 3;
          continue;
        }

        // Standard Paragraph or Salutation
        inList = false;
        const cleanLine = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

        if (/^Dear\b/i.test(cleanLine)) {
          ensureSpace(24);
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(cleanLine, leftMargin, currentY, { width: contentWidth });
          currentY += doc.heightOfString(cleanLine, { width: contentWidth }) + 8;
        } else if (/^(Thanks & Best Regards|Best Regards|Sincerely|Regards|Warm Regards|Yours Faithfully),?/i.test(cleanLine)) {
          ensureSpace(40);
          currentY += 8;
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9.5).text(cleanLine, leftMargin, currentY, { width: contentWidth });
          currentY += doc.heightOfString(cleanLine, { width: contentWidth }) + 4;
        } else {
          const textHeight = doc.heightOfString(cleanLine, { width: contentWidth, lineGap: 3.5 });
          ensureSpace(textHeight + 8);
          doc.fillColor('#334155').font('Helvetica').fontSize(9.5).text(cleanLine, leftMargin, currentY, {
            width: contentWidth,
            lineGap: 3.5,
          });
          currentY += textHeight + 8;
        }
      }

      // 3. Render Footer Banner on Every Page
      if (footerAsset && footerScaledHeight > 0) {
        try {
          const footerY = pageHeight - footerScaledHeight;
          const range = doc.bufferedPageRange();
          for (let p = 0; p < range.count; p++) {
            doc.switchToPage(p);
            doc.moveTo(0, footerY).lineTo(pageWidth, footerY).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
            const origMarginBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.image(footerAsset, 0, footerY, { width: pageWidth, height: footerScaledHeight });
            doc.page.margins.bottom = origMarginBottom;
          }
        } catch (e) {}
      }

      if (typeof (doc as any).flushPages === 'function') {
        (doc as any).flushPages();
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

export const buildTemplateEmailHtml = (
  rawBody: string,
  subject: string,
  customerName: string,
  settings?: any,
  defaultTemplate?: any,
  attachmentsList?: any[],
  backendOrigin?: string,
  pdfDownloadUrl?: string,
  compactSummary?: Record<string, any>,
  customHeaderImage?: string,
  customFooterImage?: string
): string => {
  const brand = settings?.brandColor || '#6d28d9';
  const companyName = settings?.companyName || 'Welcome Trading Co. W.L.L';
  const rawHeader =
    (customHeaderImage && String(customHeaderImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    (defaultTemplate?.templateImage && String(defaultTemplate.templateImage).trim()) ||
    (defaultTemplate?.headerImage && String(defaultTemplate.headerImage).trim()) ||
    '';
  const rawFooter =
    (customFooterImage && String(customFooterImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    (defaultTemplate?.templateFooterImage && String(defaultTemplate.templateFooterImage).trim()) ||
    (defaultTemplate?.footerImage && String(defaultTemplate.footerImage).trim()) ||
    '';

  const headerImageUrl = resolveEmailAsset(rawHeader, 'email-header-banner', 'header-banner', attachmentsList, backendOrigin);
  const footerImageUrl = resolveEmailAsset(rawFooter, 'email-footer-banner', 'footer-banner', attachmentsList, backendOrigin);

  const esc = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let bodyHtml = cleanWordArtifacts(stripInlineImagesFromText(rawBody))
    .replace(/\r\n/g, '\n');

  // Convert markdown images to responsive HTML img tags
  bodyHtml = bodyHtml.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;max-height:450px;height:auto;display:block;margin:16px auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);" />'
  );

  // Ensure relative image URLs are resolved to full public URLs for email clients
  const backendUrl = backendOrigin || (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/+$/, '');
  bodyHtml = bodyHtml.replace(/<img([^>]*?)src=["']((?:\/api\/v1|\/uploads)[^"']*)["']([^>]*?)>/gi, (_m, before, src, after) => {
    const fullSrc = `${backendUrl}${src.startsWith('/') ? '' : '/'}${src}`;
    return `<img${before}src="${fullSrc}"${after}>`;
  });

  // Ensure any HTML img tags have proper centered responsive styling
  bodyHtml = bodyHtml.replace(/<img\b(?![^>]*style=)([^>]*?)>/gi, '<img$1 style="max-width:100%;max-height:450px;height:auto;display:block;margin:16px auto;border-radius:8px;" />');

  // Convert markdown to clean HTML if not already rich HTML
  const isFullHtml = /<html[\s>]/i.test(bodyHtml) || /<body[\s>]/i.test(bodyHtml);
  if (!isFullHtml) {
    bodyHtml = bodyHtml
      .replace(/^[ \t]*# (.*$)/gim, '<h1 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;">$1</h1>')
      .replace(/^[ \t]*## (.*$)/gim, '<h2 style="color:#1e293b;font-size:18px;font-weight:700;margin:20px 0 10px;">$1</h2>')
      .replace(/^[ \t]*### (.*$)/gim, '<h3 style="color:#334155;font-size:15px;font-weight:700;margin:16px 0 8px;">$1</h3>');

    bodyHtml = bodyHtml.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a;font-weight:700;">$1</strong>');

    // Bullet points conversion
    bodyHtml = bodyHtml.replace(/^[-*•]\s+(.+)$/gim, '<li style="margin-bottom:6px;line-height:1.65;color:#334155;">$1</li>');
    bodyHtml = bodyHtml.replace(/(<li[\s\S]*?<\/li>)/gi, '<ul style="margin:10px 0 16px 20px;padding:0;">$1</ul>');
    bodyHtml = bodyHtml.replace(/<\/ul>\s*<ul style="margin:10px 0 16px 20px;padding:0;">/gi, '');

    const paragraphs = bodyHtml.split(/\n\s*\n/);
    bodyHtml = paragraphs
      .map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (/^<(h[1-6]|img|div|table|ul|ol|li|blockquote)/i.test(trimmed)) {
          return trimmed.replace(/\n/g, '<br />');
        }
        return `<p style="margin-bottom:14px;margin-top:0;line-height:1.65;color:#334155;font-size:14.5px;">${trimmed.replace(/\n/g, '<br />')}</p>`;
      })
      .join('\n');
  }

  const cleanValue = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text && text !== '—' ? text : '';
  };
  const summaryProduct = cleanValue(compactSummary?.product || compactSummary?.productName || compactSummary?.serviceName);
  const summarySerial = cleanValue(compactSummary?.serialNo || compactSummary?.serial_no);
  const summaryExpiry = cleanValue(compactSummary?.expiryDate || compactSummary?.expiry_date || compactSummary?.dueDate || compactSummary?.due_date);
  const summaryContact = cleanValue(compactSummary?.contactPerson || compactSummary?.contact_person);
  const summaryPhone = cleanValue(compactSummary?.phone || compactSummary?.mobile);
  const summaryEmail = cleanValue(compactSummary?.email || compactSummary?.email_id);

  const summaryRows = [
    customerName && customerName !== 'Valued Customer' ? ['Customer', customerName] : null,
    summaryContact ? ['Contact Person', summaryContact] : null,
    summaryProduct ? ['Product / Service', summaryProduct] : null,
    summarySerial ? ['Serial No', summarySerial] : null,
    summaryExpiry ? ['Valid / Due Date', summaryExpiry] : null,
    summaryPhone ? ['Contact No', summaryPhone] : null,
    summaryEmail ? ['Email', summaryEmail] : null,
  ].filter(Boolean) as string[][];

  // Proposal-parity Header Banner (renders image when header image URL is present, or letterhead fallback)
  const isHeaderImageValid = Boolean(
    headerImageUrl &&
    (headerImageUrl.startsWith('cid:') || /^https?:\/\//i.test(headerImageUrl) || headerImageUrl.startsWith('/'))
  );
  const headerBannerHtml = isHeaderImageValid
    ? `<div style="width:100%;max-width:100%;margin:0;overflow:hidden;background:#ffffff;text-align:center;">
        <img src="${headerImageUrl}" alt="Header Banner" style="display:block;width:100%;height:auto;border:0;border-radius:0;" />
       </div>`
    : `<div style="padding:24px 32px 18px 32px;background:#ffffff;border-bottom:2px solid ${brand};text-align:left;">
        <div style="font-size:20px;font-weight:800;color:${brand};">${esc(companyName)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Official Notice & Documentation</div>
       </div>`;

  // Proposal-parity Footer Banner (renders image when footer image URL is present, or letterhead fallback)
  const isFooterImageValid = Boolean(
    footerImageUrl &&
    (footerImageUrl.startsWith('cid:') || /^https?:\/\//i.test(footerImageUrl) || footerImageUrl.startsWith('/'))
  );
  const footerBannerHtml = isFooterImageValid
    ? `<div style="width:100%;max-width:100%;margin:24px 0 0 0;overflow:hidden;background:#ffffff;text-align:center;">
        <img src="${footerImageUrl}" alt="Footer Banner" style="display:block;width:100%;height:auto;border:0;border-radius:0;" />
       </div>`
    : `<div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">
        <div>${esc(companyName)} &bull; Official Communication</div>
        <div style="margin-top:4px;font-size:11px;color:#94a3b8;">Please find the attached official PDF document for complete details.</div>
       </div>`;

  // Proposal-parity Subject Callout Banner
  const subjectCalloutHtml = subject ? `
    <div style="padding:14px 18px;background:#f8fafc;border-left:4px solid ${brand};border-radius:6px;margin-bottom:20px;font-size:14px;font-weight:700;color:#0f172a;text-align:left;">
      <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:${brand};margin-right:8px;letter-spacing:0.04em;">Subject:</span>${esc(subject)}
    </div>` : '';

  // Proposal-parity Reference / Metadata Details Card
  const referenceCardHtml = summaryRows.length > 0 ? `
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:separate;margin-bottom:20px;">
      <tr>
        <td style="vertical-align:top;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;text-align:left;">
          <div style="font-size:11px;font-weight:800;color:${brand};letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;">
            📋 Reference Details
          </div>
          <table cellpadding="0" cellspacing="0" style="font-size:12.5px;line-height:1.5;">
            ${summaryRows.map(([label, value]) => `
              <tr>
                <td style="color:#64748b;font-weight:600;padding:2px 8px 2px 0;width:125px;vertical-align:top;">${esc(label)}</td>
                <td style="color:#64748b;font-weight:700;padding:2px 8px 2px 0;text-align:center;width:10px;vertical-align:top;">:</td>
                <td style="color:#0f172a;font-weight:700;padding:2px 0;">${esc(value)}</td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    </table>` : '';

  // Proposal-parity PDF Download Action Bar
  const pdfDownloadBarHtml = pdfDownloadUrl ? `
    <div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;">
      <div style="font-size:13px;color:#475569;margin-bottom:10px;font-weight:500;">
        An official PDF document is attached to this email and also available for direct download:
      </div>
      <a href="${esc(pdfDownloadUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:800;padding:11px 22px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.08);">
        📄 Download as PDF
      </a>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${esc(subject || 'Notification')}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f8;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="margin:0;padding:32px 16px;background:#f3f4f8;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;text-align:left;">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.04);text-align:left;">
    ${headerBannerHtml}
    <div style="padding:26px 32px;text-align:left;">
      ${subjectCalloutHtml}
      ${referenceCardHtml}
      <div style="font-size:14px;color:#334155;line-height:1.65;text-align:left;">
        ${bodyHtml}
      </div>
      ${pdfDownloadBarHtml}
    </div>
    ${footerBannerHtml}
  </div>
</div>
</body>
</html>`;
};

const escText = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown (**bold**, *italic*) for plain-text lines. */
const inlineMarkdown = (v: string): string =>
  escText(v)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

/**
 * Turns an Email Template body (rich HTML from the editor, or markdown-ish plain text) into the rich HTML the
 * proposal A4 renderer lays out.
 */
export const templateBodyToHtml = (rawBody: string): string => {
  let body = cleanWordArtifacts(stripInlineImagesFromText(rawBody || '')).replace(/\r\n/g, '\n').trim();
  body = body.replace(/Dear\s*,/gi, 'Dear Valued Customer,').replace(/Dear\s*—\s*,/gi, 'Dear Valued Customer,');
  const inner = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (inner) body = inner[1];

  // Convert markdown images to HTML img tags
  body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;display:block;margin:12px 0;border-radius:6px;" />');

  // Already rich HTML from the editor – keep its structure if formatted with block elements
  if (/<(p|div|table|h[1-6])\b/i.test(body)) {
    return body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  }

  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => { if (list.length) { out.push(`<ul>${list.join('')}</ul>`); list = []; } };
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    let m: RegExpMatchArray | null;
    if (/^<img\b[^>]*>/i.test(line)) { flushList(); flushPara(); out.push(line); continue; }
    if ((m = line.match(/^#\s+(.+)$/))) { flushList(); flushPara(); out.push(`<h1>${inlineMarkdown(m[1])}</h1>`); continue; }
    if ((m = line.match(/^##\s+(.+)$/))) { flushList(); flushPara(); out.push(`<h2>${inlineMarkdown(m[1])}</h2>`); continue; }
    if ((m = line.match(/^###\s+(.+)$/))) { flushList(); flushPara(); out.push(`<h3>${inlineMarkdown(m[1])}</h3>`); continue; }
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) { flushList(); flushPara(); out.push('<hr>'); continue; }
    if ((m = line.match(/^[-*•]\s+([^:]+):\s*(.*)$/))) { flushPara(); list.push(`<li><strong>${inlineMarkdown(m[1].trim())}:</strong> ${inlineMarkdown(m[2].trim() || '—')}</li>`); continue; }
    if ((m = line.match(/^[-*•]\s+(.+)$/))) { flushPara(); list.push(`<li>${inlineMarkdown(m[1])}</li>`); continue; }
    flushList();
    if (/^Dear\b/i.test(line) || /^(Thanks & Best Regards|Best Regards|Sincerely|Regards|Warm Regards|Yours Faithfully),?/i.test(line)) {
      flushPara();
      out.push(`<p><strong>${inlineMarkdown(line)}</strong></p>`);
      continue;
    }
    para.push(inlineMarkdown(line));
  }
  flushList();
  flushPara();
  return out.join('\n');
};

/**
 * Email Template PDF – rendered with the same measured A4 engine as proposals (same header/footer banners, running
 * page header, "Page X of N", gap-free pagination). Falls back to the legacy PDFKit letter only if Chrome is unavailable.
 */
export const generateTemplatePdfBuffer = async (data: TemplatePdfData): Promise<Buffer> => {
  const { settings, defaultTemplate } = data;
  const rawHeader =
    (data.headerImage && String(data.headerImage).trim()) ||
    (data.templateImage && String(data.templateImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    (defaultTemplate?.templateImage && String(defaultTemplate.templateImage).trim()) ||
    (defaultTemplate?.headerImage && String(defaultTemplate.headerImage).trim()) ||
    '';
  const rawFooter =
    (data.footerImage && String(data.footerImage).trim()) ||
    (data.templateFooterImage && String(data.templateFooterImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    (defaultTemplate?.templateFooterImage && String(defaultTemplate.templateFooterImage).trim()) ||
    (defaultTemplate?.footerImage && String(defaultTemplate.footerImage).trim()) ||
    '';
  try {
    return await renderProposalPdfWithChrome({
      proposal: {
        title: data.subject || data.title || 'Document',
        name: data.subject || data.title || 'Document',
        templateImage: rawHeader,
        templateFooterImage: rawFooter,
        blocks: [{ id: 'letter_body', type: 'text', title: '', content: templateBodyToHtml(data.body || '') }],
      },
      entity: {},
      settings,
      defaultTemplate,
      letter: { subject: data.subject || data.title || '' },
    });
  } catch (err) {
    console.error('[TemplatePDF] Chrome render failed – using the legacy PDFKit letter as a last resort:', err);
    return generateLegacyTemplatePdfBuffer(data);
  }
};
