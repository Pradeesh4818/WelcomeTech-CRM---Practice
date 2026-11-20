import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { amountToWords } from './amountToWords';
import { UPLOAD_ROOT_DIR } from '../config/storage';

interface ProposalPdfData {
  proposal: any;
  entity: any;
  settings?: any;
  defaultTemplate?: any;
}

const resolveLocalFilePath = (value?: string): string | null => {
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

const formatDate = (val: any): string => {
  const d = new Date(String(val || ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatMoney = (val: any): string => `QAR ${Number(val || 0).toLocaleString('en-US')}`;

export const generateProposalPdfBuffer = async (data: ProposalPdfData): Promise<Buffer> => {
  const { proposal, entity, settings, defaultTemplate } = data;

  const propTemplate = (proposal.template && typeof proposal.template === 'object' && proposal.template.name) ? proposal.template : null;
  const effectiveTemplate = propTemplate || defaultTemplate;

  const rawHeader =
    (proposal.templateImage && String(proposal.templateImage).trim()) ||
    (effectiveTemplate?.templateImage && String(effectiveTemplate.templateImage).trim()) ||
    (effectiveTemplate?.headerImage && String(effectiveTemplate.headerImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    '';
  const rawFooter =
    (proposal.templateFooterImage && String(proposal.templateFooterImage).trim()) ||
    (effectiveTemplate?.templateFooterImage && String(effectiveTemplate.templateFooterImage).trim()) ||
    (effectiveTemplate?.footerImage && String(effectiveTemplate.footerImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    '';
  const rawLogo = settings?.logo;

  const headerAsset = await resolvePdfAssetAsync(rawHeader);
  const footerAsset = await resolvePdfAssetAsync(rawFooter);
  const logoAsset = await resolvePdfAssetAsync(rawLogo);

  const customerEmail = proposal.customerEmail || entity?.email || entity?.primaryContactInfo?.email || (entity as any)?.customerEmail || '';
  const customerName =
    proposal.customerName ||
    entity?.companyName ||
    (entity as any)?.companyInfo?.customerName ||
    (entity as any)?.companyInfo?.name ||
    entity?.name ||
    (customerEmail ? customerEmail.split('@')[0] : 'Valued Customer');
  const customerPhone = proposal.customerPhone || entity?.phone || entity?.primaryContactInfo?.mobile || '';
  const customerAddress = proposal.customerAddress || entity?.address || entity?.fullAddress || entity?.companyInfo?.fullAddress || '';

  const companyName = settings?.companyName || 'Welcome Trading Co. W.L.L';
  const website = settings?.website || '';

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        autoFirstPage: true,
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const leftMargin = 36;
      const contentWidth = pageWidth - leftMargin * 2; // 523.28

      let currentY = 36;

      // 1. Header Banner (Full-bleed top with zero gap & bottom separator line)
      const renderHeaderBanner = (isFirst: boolean) => {
        if (headerAsset) {
          try {
            const img = (doc as any).openImage(headerAsset);
            const imgWidth = img?.width || pageWidth;
            const imgHeight = img?.height || 100;
            const scaledHeight = Math.min((imgHeight / imgWidth) * pageWidth, 150);

            const origMarginTop = doc.page.margins.top;
            doc.page.margins.top = 0;
            doc.image(headerAsset, 0, 0, { width: pageWidth, height: scaledHeight });
            doc.page.margins.top = origMarginTop;

            doc.moveTo(0, scaledHeight).lineTo(pageWidth, scaledHeight).strokeColor('#cbd5e1').lineWidth(1).stroke();
            if (!isFirst) {
              doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(8.5).text(companyName, leftMargin, scaledHeight + 6);
              if (proposal.proposalNo) {
                doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`· Quotation ${proposal.proposalNo}`, leftMargin + doc.widthOfString(companyName) + 6, scaledHeight + 6);
              }
              doc.moveTo(leftMargin, scaledHeight + 18).lineTo(pageWidth - leftMargin, scaledHeight + 18).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
              return scaledHeight + 24;
            }
            return scaledHeight + 20;
          } catch (e) {
            return 36;
          }
        }
        return 36;
      };

      if (headerAsset) {
        currentY = renderHeaderBanner(true);
      } else if (logoAsset) {
        try {
          doc.image(logoAsset, leftMargin, currentY, { height: 44 });
        } catch (e) {}
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#6d28d9').text(companyName, leftMargin, currentY + 48);
        if (website) doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(website, leftMargin, currentY + 70);
        currentY += 92;
      } else {
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#6d28d9').text(companyName, leftMargin, currentY);
        if (website) doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(website, leftMargin, currentY + 22);
        currentY += 48;
      }

      // 2. Client & Quotation Info Box
      const revNum = Number(proposal.revision) || 0;
      const boxY = currentY;
      const boxHeight = revNum > 0 ? 84 : 78;
      doc.roundedRect(leftMargin, boxY, contentWidth, boxHeight, 8)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      // Left Column: Customer
      doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(8).text('PREPARED FOR (CLIENT)', leftMargin + 14, boxY + 10);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(customerName, leftMargin + 14, boxY + 22, { width: 280, ellipsis: true });
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
      let leftDetailY = boxY + 36;
      if (customerAddress) {
        doc.text(customerAddress, leftMargin + 14, leftDetailY, { width: 280, ellipsis: true });
        leftDetailY += 12;
      }
      const contactLine = [customerPhone ? `Tel: ${customerPhone}` : '', customerEmail ? `Email: ${customerEmail}` : ''].filter(Boolean).join('  |  ');
      if (contactLine) {
        doc.text(contactLine, leftMargin + 14, leftDetailY, { width: 280, ellipsis: true });
      }

      // Right Column: Quotation Metadata (Aligned precisely to right border)
      const rightBoxWidth = 200;
      const rightBoxX = leftMargin + contentWidth - rightBoxWidth - 14;
      const quoteNoLabel = revNum > 0
        ? `${proposal.proposalNo || 'QUOTATION'} (Rev ${revNum})`
        : (proposal.proposalNo || 'QUOTATION');

      doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(8).text('QUOTATION DETAILS', rightBoxX, boxY + 10, { width: rightBoxWidth, align: 'right' });
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(quoteNoLabel, rightBoxX, boxY + 22, { width: rightBoxWidth, align: 'right' });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8.5);
      doc.text(`Date: ${formatDate(proposal.quoteDate || proposal.proposalDate || proposal.createdAt || new Date())}`, rightBoxX, boxY + 38, { width: rightBoxWidth, align: 'right' });
      if (revNum > 0) {
        doc.fillColor('#7c3aed').font('Helvetica-Bold').fontSize(8).text(`Revision: Rev ${revNum}`, rightBoxX, boxY + 49, { width: rightBoxWidth, align: 'right' });
        doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text(`Valid Until: ${formatDate(proposal.validUntil)}`, rightBoxX, boxY + 60, { width: rightBoxWidth, align: 'right' });
      } else {
        doc.text(`Valid Until: ${formatDate(proposal.validUntil)}`, rightBoxX, boxY + 52, { width: rightBoxWidth, align: 'right' });
      }

      currentY = boxY + boxHeight + 16;

      // 3. Title / Subject
      if (proposal.title) {
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(proposal.title, leftMargin, currentY);
        currentY += 18;
      }

      // Helper to strip HTML tags for clean PDF rendering
      const stripHtml = (htmlStr: string) => {
        return String(htmlStr || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<li>/gi, '• ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .trim();
      };

      const legacyItems = (proposal.items || []).filter((it: any) => (it?.description || '').trim());
      const formatTableItems = (list: any[]) => list.map((it: any, i: number) => ({
        id: it.id || i + 1,
        type: it.type || 'item',
        no: it.no || i + 1,
        description: it.description || '',
        qty: Number(it.qty) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        total: Number(it.total) || ((Number(it.qty) || 1) * (Number(it.unitPrice) || 0)),
      }));

      let rawBlocks: any[] = Array.isArray(proposal.blocks) ? [...proposal.blocks] : [];
      const hasPopulatedTable = rawBlocks.some(
        (b: any) => b?.type === 'table' && Array.isArray(b?.items) && b.items.filter((it: any) => it?.type !== 'detail' && (it?.description || '').trim()).length > 0
      );

      if (!hasPopulatedTable && legacyItems.length > 0) {
        const emptyTableIdx = rawBlocks.findIndex((b: any) => b?.type === 'table');
        const tableItems = formatTableItems(legacyItems);
        if (emptyTableIdx >= 0) {
          rawBlocks[emptyTableIdx] = {
            ...rawBlocks[emptyTableIdx],
            items: tableItems,
            discountPercent: rawBlocks[emptyTableIdx].discountPercent !== undefined ? rawBlocks[emptyTableIdx].discountPercent : Number(proposal.discount) || 0,
          };
        } else {
          rawBlocks.push({
            id: 'pricing_table_block',
            type: 'table',
            title: proposal.title || 'Scope of Work & Pricing',
            discountPercent: Number(proposal.discount) || 0,
            items: tableItems,
          });
        }
      } else if (rawBlocks.length === 0 && legacyItems.length > 0) {
        rawBlocks = [{
          id: 'legacy',
          type: 'table',
          title: proposal.title || 'Scope of Work & Pricing',
          discountPercent: Number(proposal.discount) || 0,
          items: formatTableItems(legacyItems),
        }];
      }

      const colX = {
        no: leftMargin,           // 36
        desc: leftMargin + 36,     // 72
        qty: leftMargin + 281,    // 317
        unit: leftMargin + 331,   // 367
        total: leftMargin + 426,  // 462
      };
      const colW = {
        no: 36,
        desc: 245,
        qty: 50,
        unit: 95,
        total: contentWidth - (36 + 245 + 50 + 95), // 97.28
      };
      const tableHeaderHeight = 24;

      let grandTotalCalculated = 0;
      let tableCount = 0;

      for (let bIndex = 0; bIndex < rawBlocks.length; bIndex++) {
        const block = rawBlocks[bIndex];
        if (block?.pageBreak && bIndex > 0) {
          doc.addPage();
          currentY = headerAsset ? renderHeaderBanner(false) : 36;
        }

        if (block.type === 'text') {
          const textContent = stripHtml(block.content || '');
          if (!textContent && !block.title) continue;

          if (currentY > pageHeight - 120) {
            doc.addPage();
            currentY = headerAsset ? renderHeaderBanner(false) : 36;
          }

          if (block.title) {
            doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(10.5).text(String(block.title).trim(), leftMargin, currentY);
            currentY += 15;
          }

          if (textContent) {
            doc.fillColor('#334155').font('Helvetica').fontSize(8.5).text(textContent, leftMargin, currentY, {
              width: contentWidth,
              lineGap: 3,
            });
            currentY = doc.y + 14;
          }
        } else if (block.type === 'table') {
          tableCount++;
          const items = Array.isArray(block.items) ? block.items : [];
          if (!items.length) continue;

          if (currentY > pageHeight - 140) {
            doc.addPage();
            currentY = headerAsset ? renderHeaderBanner(false) : 36;
          }

          if (block.title) {
            doc.fillColor('#6d28d9').font('Helvetica-Bold').fontSize(10.5).text(String(block.title).trim(), leftMargin, currentY);
            currentY += 15;
          }

          // Table Header
          doc.rect(leftMargin, currentY, contentWidth, tableHeaderHeight).fill('#6d28d9');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
          doc.text('NO', colX.no, currentY + 7, { width: colW.no, align: 'center' });
          doc.text('DESCRIPTION', colX.desc + 8, currentY + 7, { width: colW.desc - 16, align: 'left' });
          doc.text('QTY', colX.qty, currentY + 7, { width: colW.qty, align: 'center' });
          doc.text('UNIT PRICE', colX.unit, currentY + 7, { width: colW.unit - 10, align: 'right' });
          doc.text('TOTAL', colX.total, currentY + 7, { width: colW.total - 10, align: 'right' });
          currentY += tableHeaderHeight;

          let itemIndex = 0;
          let tableSubtotal = 0;

          items.forEach((item: any) => {
            const desc = String(item.description || '').trim();
            const isDetail = item.type === 'detail';
            const qty = Number(item.qty) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            const total = isDetail ? 0 : (Number(item.total) || (qty * unitPrice));
            if (!isDetail) tableSubtotal += total;

            doc.font(isDetail ? 'Helvetica-Oblique' : 'Helvetica').fontSize(8.5);
            const textHeight = doc.heightOfString(desc, { width: isDetail ? (contentWidth - 50) : (colW.desc - 16) });
            const rowHeight = Math.max(22, textHeight + 12);

            if (currentY + rowHeight > pageHeight - 130) {
              doc.addPage();
              currentY = headerAsset ? renderHeaderBanner(false) : 36;
              doc.rect(leftMargin, currentY, contentWidth, tableHeaderHeight).fill('#6d28d9');
              doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
              doc.text('NO', colX.no, currentY + 7, { width: colW.no, align: 'center' });
              doc.text('DESCRIPTION', colX.desc + 8, currentY + 7, { width: colW.desc - 16, align: 'left' });
              doc.text('QTY', colX.qty, currentY + 7, { width: colW.qty, align: 'center' });
              doc.text('UNIT PRICE', colX.unit, currentY + 7, { width: colW.unit - 10, align: 'right' });
              doc.text('TOTAL', colX.total, currentY + 7, { width: colW.total - 10, align: 'right' });
              currentY += tableHeaderHeight;
            }

            if (isDetail) {
              doc.rect(leftMargin, currentY, contentWidth, rowHeight).fill('#f8fafc');
              doc.moveTo(leftMargin, currentY + rowHeight).lineTo(leftMargin + contentWidth, currentY + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
              doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(8);
              doc.text(desc, colX.desc + 8, currentY + 6, { width: contentWidth - 50, align: 'left' });
            } else {
              itemIndex++;
              if (itemIndex % 2 === 0) {
                doc.rect(leftMargin, currentY, contentWidth, rowHeight).fill('#f8fafc');
              }
              doc.moveTo(leftMargin, currentY + rowHeight).lineTo(leftMargin + contentWidth, currentY + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
              doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
              doc.text(String(itemIndex), colX.no, currentY + 7, { width: colW.no, align: 'center' });
              doc.text(desc, colX.desc + 8, currentY + 7, { width: colW.desc - 16, align: 'left' });
              doc.text(String(qty), colX.qty, currentY + 7, { width: colW.qty, align: 'center' });
              doc.text(unitPrice > 0 ? formatMoney(unitPrice) : '—', colX.unit, currentY + 7, { width: colW.unit - 10, align: 'right' });
              doc.font('Helvetica-Bold').fillColor(total > 0 ? '#0f172a' : '#15803d').text(total > 0 ? formatMoney(total) : 'FREE', colX.total, currentY + 7, { width: colW.total - 10, align: 'right' });
            }

            currentY += rowHeight;
          });

          const tableDisc = Number(block.discountPercent) || 0;
          const isAmount = block.discountType === 'amount';
          const discAmount = isAmount ? Math.min(tableSubtotal, Math.max(0, tableDisc)) : (tableSubtotal * tableDisc / 100);
          const tableFinalTotal = Math.max(0, tableSubtotal - discAmount);
          grandTotalCalculated += tableFinalTotal;
          currentY += 12;
        }
      }

      // 6. Summary Totals Box (Flush with right edge of table)
      currentY += 4;
      if (currentY > pageHeight - 160) {
        doc.addPage();
        currentY = headerAsset ? renderHeaderBanner(false) : 36;
      }

      const totalsBoxWidth = 240;
      const totalsBoxX = leftMargin + contentWidth - totalsBoxWidth;
      const subtotal = Number(proposal.subtotal) || grandTotalCalculated;
      const discount = Number(proposal.discount) || 0;
      const grandTotal = Number(proposal.total) || (subtotal * (1 - discount / 100));

      const boxTotalHeight = discount > 0 ? 64 : 48;
      doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, boxTotalHeight, 6)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
      doc.text('Subtotal:', totalsBoxX + 14, currentY + 9);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(formatMoney(subtotal), totalsBoxX, currentY + 9, { width: totalsBoxWidth - 14, align: 'right' });

      let nextTotalsY = currentY + 24;
      if (discount > 0) {
        doc.font('Helvetica').fillColor('#475569').text(`Discount (${discount}%):`, totalsBoxX + 14, nextTotalsY);
        doc.font('Helvetica-Bold').fillColor('#dc2626').text(`- ${formatMoney(subtotal * (discount / 100))}`, totalsBoxX, nextTotalsY, { width: totalsBoxWidth - 14, align: 'right' });
        nextTotalsY += 15;
      }

      doc.moveTo(totalsBoxX + 10, nextTotalsY - 2).lineTo(totalsBoxX + totalsBoxWidth - 10, nextTotalsY - 2).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#6d28d9').text('Grand Total:', totalsBoxX + 14, nextTotalsY + 3);
      doc.text(formatMoney(grandTotal), totalsBoxX, nextTotalsY + 3, { width: totalsBoxWidth - 14, align: 'right' });

      currentY += boxTotalHeight + 10;

      // Amount in Words Bar
      const countryCode = String(settings?.country || 'QA');
      const inWords = amountToWords(grandTotal, countryCode);
      if (inWords) {
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8).text('Amount in Words: ', leftMargin, currentY, { continued: true });
        doc.fillColor('#475569').font('Helvetica-Oblique').fontSize(8).text(inWords);
        currentY += 16;
      }

      // 7. Terms & Conditions
      if (proposal.terms && String(proposal.terms).trim()) {
        const termsText = String(proposal.terms).trim();
        // Approximate terms text height (fontSize 8, lineGap 3, width contentWidth)
        const estimatedTermsLines = Math.ceil(termsText.length / 85) + (termsText.split('\n').length);
        const estimatedTermsHeight = estimatedTermsLines * 12 + 24;
        const footerReserved = footerAsset ? 95 : 45;

        if (currentY + estimatedTermsHeight > pageHeight - footerReserved) {
          doc.addPage();
          currentY = headerAsset ? renderHeaderBanner(false) : 36;
        }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('TERMS & CONDITIONS', leftMargin, currentY);
        currentY += 12;
        doc.fillColor('#475569').font('Helvetica').fontSize(8).text(termsText, leftMargin, currentY, {
          width: contentWidth,
          lineGap: 3,
        });
      }

      // 8. Footer Banner at Bottom of Every Page (Full-bleed bottom with zero gap & top separator line)
      if (footerAsset) {
        try {
          const img = (doc as any).openImage(footerAsset);
          const imgWidth = img?.width || pageWidth;
          const imgHeight = img?.height || 60;
          const scaledHeight = Math.min((imgHeight / imgWidth) * pageWidth, 90);
          const footerY = pageHeight - scaledHeight;

          // Apply full-bleed footer banner and top separator line to each page in the document
          const range = doc.bufferedPageRange();
          for (let p = 0; p < range.count; p++) {
            doc.switchToPage(p);
            // Footer top divider line
            doc.moveTo(0, footerY).lineTo(pageWidth, footerY).strokeColor('#cbd5e1').lineWidth(1).stroke();
            // Full-bleed footer image spanning 0 to pageWidth
            const origMarginBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.image(footerAsset, 0, footerY, { width: pageWidth, height: scaledHeight });
            doc.page.margins.bottom = origMarginBottom;
          }
        } catch (e) {}
      } else {
        const range = doc.bufferedPageRange();
        for (let p = 0; p < range.count; p++) {
          doc.switchToPage(p);
          const footerY = pageHeight - 32;
          doc.moveTo(leftMargin, footerY).lineTo(pageWidth - leftMargin, footerY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
          doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
          doc.text(`${String(proposal.companyName || 'Welcome Tech')} · Confidential Proposal`, leftMargin, footerY + 8);
          doc.text(`Page ${p + 1} of ${range.count}`, leftMargin, footerY + 8, { width: contentWidth, align: 'right' });
        }
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
