import { describe, it, expect } from 'vitest';
import { chunkDocumentBlocksForA4Pages } from '../../../utils/quotationHelpers';
import { renderCommonDocumentBody } from '../../../utils/documentStyles';

describe('Email Template Edit Screen Preview & PDF Pagination Parity', () => {
  const subject = 'Reminder: Your Tally Software Services (TSS) subscription renewal';
  const dummySubject = `<div data-subject-placeholder="1" style="height:48px;margin-bottom:18px;"></div>`;
  const headerImage = '/uploads/media/header.png';
  const footerImage = '/uploads/media/footer.jpeg';

  const baseBody = [
    'Dear Team, Greetings from Welcome Trading Co. W.L.L! This is a friendly reminder that your Tally Software Services (TSS) subscription is due for renewal. Serial Number: {xxxxxxxxx} Expiry Date: {DD/MM/YYYY} Renew your TSS subscription today and upgrade to the latest Tally Prime Release 7.0 at no additional cost with a valid TSS subscription.',
    '',
    'Why renew your TSS subscription?',
    '• Access to the latest Tally Prime releases, updates and product enhancements',
    '• Timely statutory and regulatory compliance updates',
    '• Secure access to your Tally reports from any device, anywhere, through a web browser',
    '• Continued technical support from our team',
    '',
    'For renewal assistance, please contact us:',
    'Call: +974 66032346 / 44502069',
    'Email: sales@welcometech.qa',
    'Thank you for your continued support and trust in us.',
    ''
  ].join('\n');

  const computeEmailPageChunks = (body: string, hasHeader = true, hasFooter = true) => {
    const renderedBody = renderCommonDocumentBody(body, '#6d28d9');
    const rawBlocks = [{
      id: 'letter_body',
      type: 'text',
      title: '',
      content: dummySubject + renderedBody,
    }];

    const chunks = chunkDocumentBlocksForA4Pages(rawBlocks, {
      hasHeaderImage: hasHeader,
      hasFooterImage: hasFooter,
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
  };

  it('splits onto Page 2 in edit screen preview when image is full size and overflows Page 1 budget', () => {
    const bodyWithFullImage = baseBody + '\n<img src="/uploads/media/flyer.jpeg" alt="TSS Flyer" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px; width: 91%;" />';
    const chunks = computeEmailPageChunks(bodyWithFullImage, true, true);

    // Edit screen preview must show 2 pages (not cram into 1 page)
    expect(chunks.length).toBe(2);

    // Page 1 contains the text greetings, renewal details and contact info
    expect(chunks[0].pageNum).toBe(1);
    expect(chunks[0].isFirst).toBe(true);
    expect(chunks[0].isLast).toBe(false);
    expect(chunks[0].totalPages).toBe(2);
    expect(chunks[0].content).toContain('Dear Team');
    expect(chunks[0].content).toContain('Why renew your TSS subscription?');
    expect(chunks[0].content).not.toContain('<img');

    // Page 2 contains the overflowing flyer image
    expect(chunks[1].pageNum).toBe(2);
    expect(chunks[1].isFirst).toBe(false);
    expect(chunks[1].isLast).toBe(true);
    expect(chunks[1].totalPages).toBe(2);
    expect(chunks[1].content).toContain('<img');
    expect(chunks[1].content).toContain('flyer.jpeg');
  });

  it('displays single page (Page 1) in edit screen preview when image is resized to fit within A4 height budget', () => {
    // Image resized via WordPress controls to 40%
    const bodyWithResizedImage = baseBody + '\n<img src="/uploads/media/flyer.jpeg" alt="TSS Flyer" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px; width: 40%;" />';
    const chunks = computeEmailPageChunks(bodyWithResizedImage, true, true);

    // When resized to 40%, everything fits on 1 single sheet
    expect(chunks.length).toBe(1);
    expect(chunks[0].pageNum).toBe(1);
    expect(chunks[0].isFirst).toBe(true);
    expect(chunks[0].isLast).toBe(true);
    expect(chunks[0].totalPages).toBe(1);
    expect(chunks[0].content).toContain('Dear Team');
    expect(chunks[0].content).toContain('<img');
  });

  it('guarantees 100% parity between edit screen preview chunking and PDF export chunking', () => {
    const body = baseBody + '\n<img src="/uploads/media/flyer.jpeg" alt="TSS Flyer" style="width: 85%; max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px;" />';
    const previewChunks = computeEmailPageChunks(body, true, true);

    // Run PDF generator chunking
    const renderedBody = renderCommonDocumentBody(body, '#6d28d9');
    const subjectBox = `<div style="margin:0 0 16px;padding:8px 12px;background:#f8fafc;border-left:3.5px solid #6d28d9;border-radius:4px;font-size:12.5px;font-weight:600;color:#0f172a;"><span style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6d28d9;margin-right:6px;letter-spacing:0.04em;">Subject:</span>${subject}</div>`;
    const pdfChunks = chunkDocumentBlocksForA4Pages([{
      id: 'letter_body',
      type: 'text',
      title: '',
      content: subjectBox + renderedBody,
    }], {
      hasHeaderImage: true,
      hasFooterImage: true,
      isLetter: true,
    });

    expect(previewChunks.length).toBe(pdfChunks.length);
    expect(previewChunks.length).toBe(2);
    // Page 1 on both has text without image
    expect(previewChunks[0].content).not.toContain('<img');
    expect(pdfChunks[0].slices[0].contentSlice).not.toContain('<img');
    // Page 2 on both contains the image
    expect(previewChunks[1].content).toContain('<img');
    expect(pdfChunks[1].slices[0].contentSlice).toContain('<img');
  });
});
