import { describe, it, expect } from 'vitest';
import { buildQuotationDocumentHtml } from '../MiscPages';

describe('Multi-Page Quotation & Proposal Template Header Parity', () => {
  const mockTemplateWithBanner = {
    _id: 'tmpl-1',
    name: 'TallyPrime Single User Implementation',
    companyName: 'Welcome Trading Co. W.L.L',
    templateImage: '/uploads/media/header_banner_welcome.png',
    templateFooterImage: '/uploads/media/footer_banner_welcome.png',
    discount: 5,
    validForDays: 14,
    items: [
      { id: 1, type: 'item', description: 'TallyPrime Silver Single User License', qty: 1, unitPrice: 2300 },
    ],
  };

  const mockCustomerForm = {
    name: 'Quotation WT-Q20261001',
    customerName: 'Al-Rayyan Business Group',
    customerDetails: {
      companyName: 'Al-Rayyan Business Group W.L.L.',
      addressLine1: 'Doha Festival City, Building 4',
      phone: '+974 4450 2069',
      email: 'procurement@alrayyan.qa',
    },
    quotationDetails: {
      quoteNo: 'WT-Q20261001',
      quoteDate: '2026-10-04',
      validUntil: '2026-10-18',
    },
    templateImage: '/uploads/media/header_banner_welcome.png',
    templateFooterImage: '/uploads/media/footer_banner_welcome.png',
  };

  it('TC-FE-1: Renders header banner image on EVERY page sheet in multi-page proposals (Preview / Download)', () => {
    // Generate a long list of deliverable line items to span across multiple A4 pages
    const multiPageBlocks = [
      {
        id: 'block_scope',
        type: 'text',
        title: 'Scope of Work & Professional Deliverables',
        content: '<p>Comprehensive TallyPrime implementation including chart of accounts customization, inventory mapping, VAT configuration, and user training sessions across multiple departments.</p>',
      },
      {
        id: 'block_table_1',
        type: 'table',
        title: 'Software Licensing & Core Services',
        discountPercent: 5,
        items: Array.from({ length: 30 }, (_, i) => ({
          id: `item_${i + 1}`,
          no: i + 1,
          type: 'item',
          description: `Deliverable module component #${i + 1} with custom configuration, verification testing, and QA deployment validation`,
          qty: 1,
          unitPrice: 500,
        })),
      },
      {
        id: 'block_terms',
        type: 'text',
        title: 'Standard Terms & Implementation Guidelines',
        content: '<p>Payment: 50% advance along with confirmed work order, balance upon completion of user training and sign-off.</p>',
      },
    ];

    const proposalObj = {
      ...mockCustomerForm,
      blocks: multiPageBlocks,
    };

    const html = buildQuotationDocumentHtml(proposalObj, proposalObj, { isPrintAutoTrigger: false });

    // Verify discrete page sheets exist and count is > 1
    const pageSheetMatches = html.match(/class="page a4-discrete-sheet"/g) || [];
    expect(pageSheetMatches.length).toBeGreaterThan(1);
    const totalPages = pageSheetMatches.length;

    // Verify header banner image appears on EVERY page sheet
    const headerBannerMatches = html.match(/header_banner_welcome\.png/g) || [];
    expect(headerBannerMatches.length).toBe(totalPages);

    // Verify footer banner image appears on EVERY page sheet
    const footerBannerMatches = html.match(/footer_banner_welcome\.png/g) || [];
    expect(footerBannerMatches.length).toBe(totalPages);

    // Verify continuation pages (Page 2+) render both the banner AND the running subhead
    expect(html).toContain('Page 2 of ' + totalPages);
    expect(html).toContain('· Quotation WT-Q20261001');
    expect(html).toContain('Pricing Table #2 (Continued)');
  });

  it('TC-FE-2: In Download PDF mode (isPrintAutoTrigger: true), auto-print script is included and header persists on all sheets', () => {
    const multiPageBlocks = [
      {
        id: 'b1',
        type: 'table',
        title: 'Deliverables',
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `it_${i + 1}`,
          no: i + 1,
          type: 'item',
          description: `Customization item #${i + 1}`,
          qty: 2,
          unitPrice: 350,
        })),
      },
    ];

    const proposalObj = {
      ...mockTemplateWithBanner,
      ...mockCustomerForm,
      blocks: multiPageBlocks,
    };

    const html = buildQuotationDocumentHtml(proposalObj, proposalObj, { isPrintAutoTrigger: true });

    // Has auto print script
    expect(html).toContain('window.print()');

    // Page count > 1
    const pages = html.match(/class="page a4-discrete-sheet"/g) || [];
    expect(pages.length).toBeGreaterThan(1);

    // Every sheet contains the header banner image
    const headers = html.match(/header_banner_welcome\.png/g) || [];
    expect(headers.length).toBe(pages.length);
  });

  it('TC-FE-3: When header image is NOT uploaded, Page 1 renders letterhead and Page 2+ renders clean text subhead without banner', () => {
    const letterheadBlocks = [
      {
        id: 'tbl_1',
        type: 'table',
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `item_${i + 1}`,
          no: i + 1,
          type: 'item',
          description: `Consulting session #${i + 1}`,
          qty: 1,
          unitPrice: 400,
        })),
      },
    ];

    const proposalNoBanner = {
      name: 'Standard Quotation',
      companyName: 'Welcome Trading Co. W.L.L',
      templateImage: '',
      templateFooterImage: '',
      blocks: letterheadBlocks,
      quotationDetails: {
        quoteNo: 'WT-NOBANNER-001',
      },
    };

    const html = buildQuotationDocumentHtml(proposalNoBanner, proposalNoBanner, { isPrintAutoTrigger: false });
    const pages = html.match(/class="page a4-discrete-sheet"/g) || [];
    expect(pages.length).toBeGreaterThan(1);

    // No header banner images rendered
    expect(html).not.toContain('<div class="run-header">');

    // Page 2+ renders clean running text subhead
    expect(html).toContain('Page 2 of ' + pages.length);
    expect(html).toContain('· Quotation WT-NOBANNER-001');
  });
});
