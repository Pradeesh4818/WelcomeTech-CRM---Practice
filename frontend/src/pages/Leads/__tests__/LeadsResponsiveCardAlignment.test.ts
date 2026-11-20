import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Leads Responsive Card Alignment (Lead ID Center & Badges Left-Start)', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const pagePath = path.resolve(__dirname, '../LeadsPage.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  it('centers both the label and the ID value in Lead ID card header', () => {
    const leadIdSection = cssContent.slice(cssContent.indexOf('/* 1. Lead ID, Ticket ID, Task ID Header Card: Both Label and ID Value Centered */'));
    expect(leadIdSection).toContain("td[data-label='Lead ID']");
    expect(leadIdSection).toContain('align-items: center !important');
    expect(leadIdSection).toContain('justify-content: center !important');
    expect(leadIdSection).toContain('text-align: center !important');
    expect(leadIdSection).toContain("td[data-label='Lead ID']::before");
    expect(leadIdSection).toContain('align-self: center !important');
  });

  it('aligns status badges to the start (left) under the STATUS label', () => {
    const badgesSection = cssContent.slice(cssContent.indexOf('/* 2. Status Badges, Priority Badges, Assigned Badges: Left to Start */'));
    expect(badgesSection).toContain("td[data-label='Status']");
    expect(badgesSection).toContain('align-items: flex-start !important');
    expect(badgesSection).toContain('margin-left: 0 !important');
    expect(badgesSection).toContain('margin-right: auto !important');
    expect(badgesSection).toContain('align-self: flex-start !important');
  });

  it('aligns priority badges to the start (left) under the PRIORITY label', () => {
    const badgesSection = cssContent.slice(cssContent.indexOf('/* 2. Status Badges, Priority Badges, Assigned Badges: Left to Start */'));
    expect(badgesSection).toContain("td[data-label='Priority']");
    expect(badgesSection).toContain("td[data-label='Priority'] .badge");
    expect(badgesSection).toContain('align-self: flex-start !important');
  });

  it('aligns assigned chip/badge to the start (left) under the ASSIGNED label', () => {
    const badgesSection = cssContent.slice(cssContent.indexOf('/* 2. Status Badges, Priority Badges, Assigned Badges: Left to Start */'));
    expect(badgesSection).toContain("td[data-label='Assigned']");
    expect(badgesSection).toContain('.lead-assigned-chip');
    expect(badgesSection).toContain('margin-left: 0 !important');
    expect(badgesSection).toContain('align-self: flex-start !important');
  });

  it('hides the Recent Activities and History table headers on mobile/tablet to eliminate purple block', () => {
    const recentSection = cssContent.slice(cssContent.indexOf('/* ==========================================================================\n   LEAD STATUS OVERVIEW MODAL - RECENT ACTIVITIES & HISTORY MOBILE CARD VIEW'));
    expect(recentSection).toContain('.lead-recent-head');
    expect(recentSection).toContain('.lead-history-head');
    expect(recentSection).toContain('display: none !important');
  });

  it('transforms Recent Activities rows into mobile cards with data-label labels', () => {
    const recentSection = cssContent.slice(cssContent.indexOf('/* ==========================================================================\n   LEAD STATUS OVERVIEW MODAL - RECENT ACTIVITIES & HISTORY MOBILE CARD VIEW'));
    expect(recentSection).toContain('.lead-recent-row');
    expect(recentSection).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important');
    expect(recentSection).toContain('border-radius: 18px !important');
    expect(recentSection).toContain('content: attr(data-label) !important');
    expect(pageContent).toContain('className="lead-act-cell lead-act-date" data-label="Date / Time"');
    expect(pageContent).toContain('className="lead-act-cell lead-act-status lead-col-status" data-label="Status"');
  });

  it('ensures status badges inside Recent Activities cards are left-aligned and fit-content', () => {
    const recentSection = cssContent.slice(cssContent.indexOf('/* ==========================================================================\n   LEAD STATUS OVERVIEW MODAL - RECENT ACTIVITIES & HISTORY MOBILE CARD VIEW'));
    expect(recentSection).toContain('.lead-recent-row .lead-act-status .badge');
    expect(recentSection).toContain('width: fit-content !important');
    expect(recentSection).toContain('align-self: flex-start !important');
    expect(recentSection).toContain('border-radius: 999px !important');
  });

  it('ensures lead-profile-row badges in modal overview do not stretch 100% wide', () => {
    const recentSection = cssContent.slice(cssContent.indexOf('/* ==========================================================================\n   LEAD STATUS OVERVIEW MODAL - RECENT ACTIVITIES & HISTORY MOBILE CARD VIEW'));
    expect(recentSection).toContain('.lead-profile-row .badge');
    expect(recentSection).toContain('width: fit-content !important');
    expect(recentSection).toContain('align-self: flex-start !important');
  });

  it('transforms Tickets recent activities and history into mobile responsive cards', () => {
    const ticketsPagePath = path.resolve(__dirname, '../../Tickets/TicketsPages.tsx');
    const ticketsContent = fs.readFileSync(ticketsPagePath, 'utf8');
    const recentSection = cssContent.slice(cssContent.indexOf('/* ==========================================================================\n   LEAD STATUS OVERVIEW MODAL - RECENT ACTIVITIES & HISTORY MOBILE CARD VIEW'));
    expect(recentSection).toContain('.ticket-recent-head');
    expect(recentSection).toContain('.ticket-history-head');
    expect(recentSection).toContain('.ticket-recent-row');
    expect(recentSection).toContain('.ticket-history-row');
    expect(recentSection).toContain('.ticket-recent-row .lead-act-cell::before');
    expect(recentSection).toContain('.ticket-history-row .lead-hist-cell::before');
    expect(recentSection).toContain('.ticket-assign-inline');
    expect(ticketsContent).toContain('className="ticket-recent-row"');
    expect(ticketsContent).toContain('data-label="Date / Time"');
    expect(ticketsContent).toContain('data-label="Changed By"');
  });

  it('left-aligns Company Name, Subject, and other card fields in responsive card mode', () => {
    const fieldSection = cssContent.slice(cssContent.indexOf('/* 4. Company Name, Subject, Contact Person, and All Card Fields: Left-Aligned */'));
    expect(fieldSection).toContain("td[data-label='Company Name']");
    expect(fieldSection).toContain("td[data-label='Subject']");
    expect(fieldSection).toContain("td[data-label='Contact Person']");
    expect(fieldSection).toContain('align-items: flex-start !important');
    expect(fieldSection).toContain('text-align: left !important');
  });

  it('correctly floats checkbox absolutely so it does not block the first grid row in responsive-card-table', () => {
    expect(cssContent).toContain(".tbl-wrap:not(.customer-desktop-table) .responsive-card-table tbody td:first-child:has(input[type='checkbox'])");
    expect(cssContent).toContain('position: absolute !important');
    expect(cssContent).toContain('z-index: 10 !important');
  });

  it('centers Customer No as a prominent header card in responsive-card-table', () => {
    expect(cssContent).toContain("td[data-label='Customer No']");
    expect(cssContent).toContain("td[data-label='Customer Number']");
    expect(cssContent).toContain("td.amc-customer-no-cell");
    expect(cssContent).toContain("content: 'CUSTOMER NO' !important");
  });

  it('centers Customer Name as a full-width card row in responsive-card-table', () => {
    expect(cssContent).toContain("td[data-label='Customer Name']");
    expect(cssContent).toContain("td.company-name-cell");
    expect(cssContent).toContain("content: 'CUSTOMER NAME' !important");
    const custNameSection = cssContent.slice(cssContent.indexOf('/* 3. Customer Name / Employee / Company Name: Full-Width Centered Row */'));
    expect(custNameSection).toContain('align-items: center !important');
    expect(custNameSection).toContain('text-align: center !important');
    expect(custNameSection).toContain('justify-content: center !important');
  });

  it('centers Employee as a full-width card row in responsive-card-table without logo padding offset', () => {
    expect(cssContent).toContain("td[data-label='Employee']");
    expect(cssContent).toContain("content: 'EMPLOYEE' !important");
    const empSection = cssContent.slice(cssContent.indexOf('/* 3. Customer Name / Employee / Company Name: Full-Width Centered Row */'));
    expect(empSection).toContain("td[data-label='Employee']");
    expect(empSection).toContain('align-items: center !important');
    expect(empSection).toContain('text-align: center !important');

    // Verify EmployeesPage table rows have data-label="Employee"
    const empPageContent = fs.readFileSync(path.resolve(__dirname, '../../Employees/EmployeesPage.tsx'), 'utf-8');
    expect(empPageContent).toContain('data-label="Employee"');
    expect(empPageContent).toContain('data-label="Phone"');
    expect(empPageContent).toContain('data-label="Role"');
  });

  it('ensures AMCPages AMCTableRow has explicit data-labels and centered customer number link', () => {
    const amcContent = fs.readFileSync(path.resolve(__dirname, '../../AMC/AMCPages.tsx'), 'utf-8');
    expect(amcContent).toContain('data-label="Customer No"');
    expect(amcContent).toContain('data-label="Customer Name"');
    expect(amcContent).toContain('data-label="Partner Name"');
    expect(amcContent).toContain('data-label="Contact"');
    expect(amcContent).toContain('data-label="Location"');
    expect(amcContent).toContain('data-label="Product"');
    expect(amcContent).toContain('data-label="Status"');
    expect(amcContent).toContain('data-label="Expiry"');
    expect(amcContent).toContain('data-label="Value"');
    expect(amcContent).toContain('record-id-link amc-customer-no');
  });

  it('increases modal footer submit buttons to comfortable 48px height with 14.5px bold font on mobile', () => {
    const modalButtonSection = cssContent.slice(cssContent.indexOf('.modal-box:not(.confirm-dialog-modal) .modal-footer {'));
    expect(modalButtonSection).toContain('min-height: 48px !important');
    expect(modalButtonSection).toContain('height: 48px !important');
    expect(modalButtonSection).toContain('font-size: 14.5px !important');
    expect(modalButtonSection).toContain('font-weight: 750 !important');
    expect(modalButtonSection).toContain('border-radius: 12px !important');
    expect(modalButtonSection).toContain('width: 100% !important');
    expect(modalButtonSection).toContain('gap: 8px !important');
  });

  it('ensures inline form buttons inside modals match 44px input height with 12px border radius', () => {
    const inlineButtonSection = cssContent.slice(cssContent.indexOf('/* Inline form buttons (e.g. + add group/subcategory button next to form-control) */'));
    expect(inlineButtonSection).toContain('min-height: 44px !important');
    expect(inlineButtonSection).toContain('height: 44px !important');
    expect(inlineButtonSection).toContain('min-width: 44px !important');
    expect(inlineButtonSection).toContain('width: 44px !important');
    expect(inlineButtonSection).toContain('border-radius: 12px !important');
  });

  it('verifies all master creation modal action buttons exist in target pages', () => {
    const industriesPage = fs.readFileSync(path.resolve(__dirname, '../../Industries/IndustriesPage.tsx'), 'utf-8');
    expect(industriesPage).toContain('Create Industry');
    expect(industriesPage).toContain('Add industry group...');

    const segmentsPage = fs.readFileSync(path.resolve(__dirname, '../../BusinessSegments/BusinessSegmentsPage.tsx'), 'utf-8');
    expect(segmentsPage).toContain('Create Segment');

    const typesPage = fs.readFileSync(path.resolve(__dirname, '../../IndustryTypes/IndustryTypesPage.tsx'), 'utf-8');
    expect(typesPage).toContain('Create Type');

    const leadSourcesPage = fs.readFileSync(path.resolve(__dirname, '../../LeadSources/LeadSourcesPage.tsx'), 'utf-8');
    expect(leadSourcesPage).toContain('Create Lead Source');

    const leadStatusesPage = fs.readFileSync(path.resolve(__dirname, '../../LeadStatuses/LeadStatusesPage.tsx'), 'utf-8');
    expect(leadStatusesPage).toContain('Create Lead Status');

    const ticketCategoriesPage = fs.readFileSync(path.resolve(__dirname, '../../TicketCategories/TicketCategoriesPage.tsx'), 'utf-8');
    expect(ticketCategoriesPage).toContain('Create Category');
    expect(ticketCategoriesPage).toContain('Add subcategory...');

    const vendorCategoriesPage = fs.readFileSync(path.resolve(__dirname, '../../VendorCategories/VendorCategoriesPage.tsx'), 'utf-8');
    expect(vendorCategoriesPage).toContain('Create Category');
  });

  it('ensures QuotationGeneratorPage and proposal templates are fully mobile responsive', () => {
    const quotePage = fs.readFileSync(path.resolve(__dirname, '../../Misc/QuotationGeneratorPage.tsx'), 'utf-8');
    expect(quotePage).toContain('quote-studio-header-title');
    expect(quotePage).toContain('quote-studio-header-actions');
    expect(quotePage).toContain('quotation-sheet-toolbar');
    expect(quotePage).toContain('quotation-canvas-badge');
    expect(quotePage).toContain('quotation-canvas-actions');
    expect(quotePage).toContain('quotation-add-page-btn');
    expect(quotePage).toContain('quotation-sheet-header');
    expect(quotePage).toContain('quote-details-card');
    expect(quotePage).toContain('quote-spec-row');
    expect(quotePage).toContain('quotation-empty-canvas');
    expect(quotePage).toContain('quotation-empty-canvas-actions');

    // Verify index.css has the required responsive rules
    expect(cssContent).toContain('PROPOSAL TEMPLATES & QUOTATION GENERATOR MOBILE RESPONSIVENESS');
    expect(cssContent).toContain('.quotation-client-details-grid');
    expect(cssContent).toContain('grid-template-columns: 1fr !important');
    expect(cssContent).toContain('.quotation-empty-canvas-actions .btn');
    expect(cssContent).toContain('.quote-spec-row input.quote-input-clean-normal');
  });

  it('ensures Proposal Template Preview modal buttons are responsive and never overlap', () => {
    const miscContent = fs.readFileSync(path.resolve(__dirname, '../../Misc/MiscPages.tsx'), 'utf-8');
    expect(miscContent).toContain('proposal-preview-modal');
    expect(miscContent).toContain('proposal-preview-modal-footer');
    expect(miscContent).toContain('proposal-preview-modal-actions');
    expect(miscContent).toContain('proposal-preview-btn-close');
    expect(miscContent).toContain('proposal-preview-btn-download');
    expect(miscContent).toContain('proposal-preview-btn-send');
    expect(miscContent).toContain('proposal-preview-btn-edit');
    expect(miscContent).toContain('proposal-preview-extra-text');

    // Verify index.css has the preview modal responsive rules
    expect(cssContent).toContain('PROPOSAL TEMPLATE PREVIEW & PROPOSAL PREVIEW MODAL RESPONSIVENESS');
    expect(cssContent).toContain('.proposal-preview-btn-edit');
    expect(cssContent).toContain('.proposal-preview-btn-send');
    expect(cssContent).toContain('.proposal-preview-btn-download');
    expect(cssContent).toContain('.proposal-preview-btn-close');
    expect(cssContent).toContain('proposal-preview-modal-actions');
    expect(cssContent).toContain('display: contents !important');
    expect(cssContent).toContain('min-height: 44px !important');
  });

  it('ensures modal footer buttons use 2-column grid and flex: 1 1 0 on mobile without 48px width squishing', () => {
    expect(cssContent).not.toContain('flex: 0 0 48px');
    expect(cssContent).toContain('.modal-form-overlay .modal-box:not(.confirm-dialog-modal) .modal-footer>div');
    expect(cssContent).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important');
    expect(cssContent).toContain('flex: 1 1 0 !important');
  });
});
