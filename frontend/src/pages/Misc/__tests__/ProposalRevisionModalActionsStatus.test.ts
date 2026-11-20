import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Proposal Revision History Modal - Actions & Status Column Updates', () => {
  const miscPagesPath = path.resolve(__dirname, '../MiscPages.tsx');
  const sourceCode = fs.readFileSync(miscPagesPath, 'utf-8');

  // Slice out the Revision History Modal block for focused analysis
  const modalMatch = sourceCode.match(/<Modal[\s\S]*?open=\{!!revisionProposal\}[\s\S]*?<\/Modal>/);
  const modalCode = modalMatch ? modalMatch[0] : '';

  it('Modal is present and configured with size="xxl"', () => {
    expect(modalCode).toBeTruthy();
    expect(modalCode).toContain('size="xxl"');
    expect(modalCode).toContain('Proposal Revision History & Old Versions');
  });

  describe('Requirement 1: Top Summary Card Preview & Edit Buttons Removed', () => {
    it('TC-REV-01: Summary card does not contain "Preview Quotation" or "Edit Proposal" buttons', () => {
      // Find the summary card container within modal
      const summaryCardMatch = modalCode.match(/{\/\* Proposal Summary Card \*\/}[\s\S]*?{\/\* Section Header \*\/}/);
      expect(summaryCardMatch).toBeTruthy();
      const summaryCardCode = summaryCardMatch ? summaryCardMatch[0] : '';

      // Verify "Preview Quotation" and "Edit Proposal" are absent from top summary card
      expect(summaryCardCode).not.toContain('Preview Quotation');
      expect(summaryCardCode).not.toContain('Edit Proposal');
      expect(summaryCardCode).not.toContain('handlePreviewVersion');
      expect(summaryCardCode).not.toContain('/proposals/${id}/edit');
    });

    it('TC-REV-02: Summary card retains clean layout with Current Active Total and metadata', () => {
      const summaryCardMatch = modalCode.match(/{\/\* Proposal Summary Card \*\/}[\s\S]*?{\/\* Section Header \*\/}/);
      const summaryCardCode = summaryCardMatch ? summaryCardMatch[0] : '';

      expect(summaryCardCode).toContain('Current Active Total');
      expect(summaryCardCode).toContain('Client:');
      expect(summaryCardCode).toContain('Valid Until:');
      expect(summaryCardCode).toContain('Rev {revisionProposal.revision || 0} (Current Active)');
    });
  });

  describe('Requirement 2: Actions Column Has Icon-Only Buttons (Preview, Edit, PDF) & Items Removed', () => {
    it('TC-REV-03: Header is renamed from "ACTIONS / DETAILS" to "ACTIONS"', () => {
      expect(modalCode).toContain('>ACTIONS</th>');
      expect(modalCode).not.toContain('>ACTIONS / DETAILS</th>');
    });

    it('TC-REV-04: Action cell contains exactly 3 icon buttons: Preview, Edit, and PDF', () => {
      // Verify icon imports are present
      expect(sourceCode).toContain('Eye');
      expect(sourceCode).toContain('Pencil');
      expect(sourceCode).toContain('Download');

      // Verify the 3 buttons in the actions column
      expect(modalCode).toContain('className="btn-action btn-action-blue"');
      expect(modalCode).toContain('<Eye size={15} />');
      expect(modalCode).toContain('className="btn-action btn-action-amber"');
      expect(modalCode).toContain('<Pencil size={15} />');
      expect(modalCode).toContain('className="btn-action btn-action-brand"');
      expect(modalCode).toContain('<Download size={15} />');

      // Verify accessible titles and aria-labels
      expect(modalCode).toContain('title="Edit Proposal"');
      expect(modalCode).toContain('aria-label="Edit Proposal"');
      expect(modalCode).toContain('handlePreviewVersion(ver)');
      expect(modalCode).toContain('handleDownloadVersionPDF(ver)');
    });

    it('TC-REV-05: Line items toggle button ("Items (X)") and line items sub-table are removed from revision table', () => {
      // Find the table section within modal
      const tableMatch = modalCode.match(/<table className="data-table"[\s\S]*?<\/table>/);
      expect(tableMatch).toBeTruthy();
      const tableCode = tableMatch ? tableMatch[0] : '';

      // Verify "Items (" toggle button is removed
      expect(tableCode).not.toContain('Items (');
      expect(tableCode).not.toContain('expandedVersionKey === ver.id');
      expect(tableCode).not.toContain('setExpandedVersionKey');

      // Verify sub-table headers for line items are not present
      expect(tableCode).not.toContain('Unit Rate');
      expect(tableCode).not.toContain('Version Total:');
    });
  });

  describe('Requirement 3: STATUS as a Dedicated Separate Column', () => {
    it('TC-REV-06: Thead contains dedicated STATUS column header', () => {
      expect(modalCode).toContain('<th style={{ width: 140, textAlign: \'center\', padding: \'12px 14px\', fontSize: 11, fontWeight: 800, color: \'#ffffff\', textTransform: \'uppercase\', letterSpacing: \'0.08em\', whiteSpace: \'nowrap\' }}>STATUS</th>');
    });

    it('TC-REV-07: Table headers follow the required 8-column structure', () => {
      const headers = [
        '>S NO</th>',
        '>VERSION</th>',
        '>STATUS</th>',
        '>DATE & TIME</th>',
        '>ALTERED / REVISED BY</th>',
        '>NEGOTIATION / ALTERATION REASON</th>',
        '>TOTAL AMOUNT</th>',
        '>ACTIONS</th>',
      ];

      headers.forEach(h => {
        expect(modalCode).toContain(h);
      });
    });

    it('TC-REV-08: Status column renders "Active" pill for current revision and "Superseded" pill for older revisions', () => {
      expect(modalCode).toContain('{/* STATUS */}');
      expect(modalCode).toContain('Active');
      expect(modalCode).toContain('Superseded');
      expect(modalCode).toContain('{ver.isCurrent && revisionProposal.status && (');
      expect(modalCode).toContain('<Badge status={revisionProposal.status} />');
    });

    it('TC-REV-09: Negotiation reason does not duplicate inline status text', () => {
      // Negotiation reason cell should render ver.reason cleanly without repeating Status: Current Active
      expect(modalCode).toContain('{/* NEGOTIATION / ALTERATION REASON */}');
      expect(modalCode).toContain('{ver.reason}');
      expect(modalCode).not.toContain('Status: Current Active');
    });
  });

  describe('Requirement 4: Resent Proposals Version List Generation', () => {
    it('TC-REV-10: proposal with resendCount = 2 generates 3 rows (Resent 2x, Resent 1x, Original Rev 0)', async () => {
      const { buildProposalOldVersionsList } = await import('../MiscPages');

      const resentProposal: any = {
        _id: 'prop-8104',
        proposalNo: 'IT/QT/8104/20-10-2026',
        title: 'TallyPrime Single User',
        total: 2300,
        subtotal: 2300,
        discount: 0,
        status: 'sent',
        revision: 0,
        resendCount: 2,
        sentAt: '2026-10-20T08:36:39.913Z',
        resentAt: '2026-10-20T08:51:09.926Z',
        lastSentAt: '2026-10-20T08:51:09.926Z',
        revisionHistory: [],
        items: [{ description: 'TallyPrime Single User', qty: 1, unitPrice: 2300, total: 2300 }],
        createdBy: { name: 'Welcome Tech Admin' },
        createdAt: '2026-10-20T08:36:39.921Z',
      };

      const versions = buildProposalOldVersionsList(resentProposal);
      expect(versions).toHaveLength(3);

      // Top entry: Resent (2x) (most recent, Active)
      expect(versions[0].versionLabel).toBe('Resent (2x)');
      expect(versions[0].isCurrent).toBe(true);
      expect(versions[0].isResend).toBe(true);
      expect(versions[0].statusLabel).toBe('Current Active');
      expect(versions[0].total).toBe(2300);

      // Middle entry: Resent (1x) (Superseded)
      expect(versions[1].versionLabel).toBe('Resent (1x)');
      expect(versions[1].isCurrent).toBe(false);
      expect(versions[1].isResend).toBe(true);
      expect(versions[1].statusLabel).toBe('Superseded');

      // Bottom entry: Original (Rev 0) (Superseded)
      expect(versions[2].versionLabel).toBe('Original (Rev 0)');
      expect(versions[2].isCurrent).toBe(false);
      expect(versions[2].isOriginal).toBe(true);
      expect(versions[2].statusLabel).toBe('Superseded');
    });

    it('TC-REV-11: proposal with resendCount = 1 generates 2 rows (Resent 1x, Original Rev 0)', async () => {
      const { buildProposalOldVersionsList } = await import('../MiscPages');

      const singleResendProp: any = {
        _id: 'prop-single-resend',
        proposalNo: 'PROP-100',
        title: 'Single Resend Test',
        total: 5000,
        revision: 0,
        resendCount: 1,
        sentAt: '2026-10-20T08:00:00.000Z',
        resentAt: '2026-10-20T08:30:00.000Z',
        revisionHistory: [],
      };

      const versions = buildProposalOldVersionsList(singleResendProp);
      expect(versions).toHaveLength(2);
      expect(versions[0].versionLabel).toBe('Resent Quote');
      expect(versions[0].isCurrent).toBe(true);
      expect(versions[1].versionLabel).toBe('Original (Rev 0)');
      expect(versions[1].isCurrent).toBe(false);
    });
  });
});
