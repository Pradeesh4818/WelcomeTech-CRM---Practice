import { describe, it, expect } from 'vitest';
import type { Proposal } from '../../../types';

describe('Proposal Revision & Alteration Tracking in Frontend', () => {
  it('formats revision number and checks alteration flag', () => {
    const originalProposal: Proposal = {
      _id: 'prop-1',
      proposalNo: 'WT-Q20260901',
      title: 'Tally Prime Service',
      items: [{ description: 'License', qty: 1, unitPrice: 2000, total: 2000 }],
      subtotal: 2000,
      discount: 0,
      total: 2000,
      validUntil: '2026-10-01',
      status: 'sent',
      revision: 0,
      createdBy: 'user-1',
      createdAt: '2026-09-01T10:00:00.000Z',
    };

    expect(originalProposal.revision).toBe(0);

    const revisedProposal: Proposal = {
      ...originalProposal,
      total: 1800,
      discount: 10,
      revision: 1,
      revisedAt: '2026-09-05T12:00:00.000Z',
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-09-05T12:00:00.000Z',
          reason: 'Negotiated 10% discount with client',
          previousTotal: 2000,
          newTotal: 1800,
          revisedByName: 'Sales Agent',
        },
      ],
    };

    expect(revisedProposal.revision).toBe(1);
    expect(revisedProposal.revisionHistory).toHaveLength(1);
    expect(revisedProposal.revisionHistory?.[0].reason).toBe('Negotiated 10% discount with client');
    expect(revisedProposal.revisionHistory?.[0].previousTotal).toBe(2000);
    expect(revisedProposal.revisionHistory?.[0].newTotal).toBe(1800);

    // Format display string helper
    const formatQuoteNoWithRev = (p: Proposal) =>
      p.revision && p.revision > 0 ? `${p.proposalNo} (Rev ${p.revision})` : p.proposalNo;

    expect(formatQuoteNoWithRev(originalProposal)).toBe('WT-Q20260901');
    expect(formatQuoteNoWithRev(revisedProposal)).toBe('WT-Q20260901 (Rev 1)');
  });

  it('increments through multiple rounds of negotiation (Rev 1 -> Rev 2)', () => {
    const multiRevisionProposal: Proposal = {
      _id: 'prop-2',
      proposalNo: 'WT-Q20260902',
      title: 'Annual Maintenance Service',
      items: [{ description: 'AMC Multi User', qty: 1, unitPrice: 4000, total: 4000 }],
      subtotal: 4000,
      discount: 15,
      total: 3400,
      validUntil: '2026-10-15',
      status: 'sent',
      revision: 2,
      revisedAt: '2026-09-10T14:30:00.000Z',
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-09-05T10:00:00.000Z',
          reason: 'Client requested 10% discount',
          previousTotal: 4000,
          newTotal: 3600,
          revisedByName: 'Sales Rep 1',
        },
        {
          revision: 2,
          revisedAt: '2026-09-10T14:30:00.000Z',
          reason: 'Approved extra 5% discount after management approval',
          previousTotal: 3600,
          newTotal: 3400,
          revisedByName: 'Sales Manager',
        },
      ],
      createdBy: 'user-1',
      createdAt: '2026-09-01T10:00:00.000Z',
    };

    expect(multiRevisionProposal.revision).toBe(2);
    expect(multiRevisionProposal.revisionHistory).toHaveLength(2);
    expect(multiRevisionProposal.revisionHistory?.[1].revision).toBe(2);
    expect(multiRevisionProposal.revisionHistory?.[1].newTotal).toBe(3400);
  });
});

describe('Old Proposal Versions List Generation (buildProposalOldVersionsList)', () => {
  it('generates a single Original (Rev 0) version entry for unrevised proposal', async () => {
    const { buildProposalOldVersionsList } = await import('../MiscPages');
    const proposal: Proposal = {
      _id: 'prop-100',
      proposalNo: 'PROP-0012',
      title: 'Initial Service Quotation',
      items: [{ description: 'Accounting setup', qty: 1, unitPrice: 1100, total: 1100 }],
      subtotal: 1100,
      discount: 0,
      total: 1100,
      validUntil: '2026-10-01',
      status: 'sent',
      revision: 0,
      createdBy: { _id: 'u-1', name: 'Welcome Tech Admin' } as any,
      createdAt: '2026-09-01T10:00:00.000Z',
    };

    const versions = buildProposalOldVersionsList(proposal);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionLabel).toBe('Original (Rev 0)');
    expect(versions[0].isCurrent).toBe(true);
    expect(versions[0].isOriginal).toBe(true);
    expect(versions[0].total).toBe(1100);
    expect(versions[0].authorName).toBe('Welcome Tech Admin');
    expect(versions[0].statusLabel).toBe('Current Active');
  });

  it('generates Rev 1 (Current Active) and Original (Rev 0) with price delta for PROP-0010 case', async () => {
    const { buildProposalOldVersionsList } = await import('../MiscPages');
    const prop0010: Proposal = {
      _id: 'prop-0010-id',
      proposalNo: 'PROP-0010',
      title: 'Tally Prime Multi User Quotation',
      items: [
        { description: 'Tally Prime [Int’l Edition] – Multi User', qty: 1, unitPrice: 6900, total: 6900 },
        { description: 'Installation & Implementation', qty: 1, unitPrice: 0, total: 0 },
      ],
      subtotal: 6900,
      discount: 2,
      total: 6762,
      validUntil: '2026-09-17',
      status: 'draft',
      revision: 1,
      revisedAt: '2026-10-07T09:19:33.210Z',
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-10-07T09:19:33.210Z',
          revisedByName: 'Welcome Tech Admin',
          reason: 'Proposal quotation negotiated / terms revised',
          previousTotal: 6900,
          newTotal: 6762,
        },
      ],
      createdBy: { _id: 'u-admin', name: 'Welcome Tech Admin' } as any,
      createdAt: '2026-09-03T12:53:06.122Z',
    };

    const versions = buildProposalOldVersionsList(prop0010);
    expect(versions).toHaveLength(2);

    // Sorted newest first: Rev 1 is index 0, Rev 0 is index 1
    const [rev1, rev0] = versions;

    expect(rev1.versionLabel).toBe('Rev 1');
    expect(rev1.isCurrent).toBe(true);
    expect(rev1.isOriginal).toBe(false);
    expect(rev1.total).toBe(6762);
    expect(rev1.previousTotal).toBe(6900);
    expect(rev1.diff).toBe(-138); // Savings of 138 QAR
    expect(rev1.reason).toBe('Proposal quotation negotiated / terms revised');
    expect(rev1.authorName).toBe('Welcome Tech Admin');
    expect(rev1.statusLabel).toBe('Current Active');
    expect(rev1.items).toHaveLength(2);

    expect(rev0.versionLabel).toBe('Original (Rev 0)');
    expect(rev0.isCurrent).toBe(false);
    expect(rev0.isOriginal).toBe(true);
    expect(rev0.total).toBe(6900); // Original price before revision
    expect(rev0.authorName).toBe('Welcome Tech Admin');
    expect(rev0.statusLabel).toBe('Superseded');
  });

  it('correctly maps multi-round revisions (Rev 2 -> Rev 1 -> Rev 0) chronologically', async () => {
    const { buildProposalOldVersionsList } = await import('../MiscPages');
    const multiProp: Proposal = {
      _id: 'prop-multi',
      proposalNo: 'PROP-0099',
      title: 'ERP Implementation',
      items: [{ description: 'ERP License', qty: 1, unitPrice: 10000, total: 10000 }],
      subtotal: 10000,
      discount: 20,
      total: 8000,
      validUntil: '2026-11-01',
      status: 'sent',
      revision: 2,
      revisedAt: '2026-10-10T12:00:00.000Z',
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-09-15T10:00:00.000Z',
          revisedByName: 'Sales Agent',
          reason: 'Initial 10% discount',
          previousTotal: 10000,
          newTotal: 9000,
        },
        {
          revision: 2,
          revisedAt: '2026-10-10T12:00:00.000Z',
          revisedByName: 'Sales Director',
          reason: 'Special executive approval for 20% discount',
          previousTotal: 9000,
          newTotal: 8000,
        },
      ],
      createdBy: 'u-1',
      createdAt: '2026-09-01T08:00:00.000Z',
    };

    const versions = buildProposalOldVersionsList(multiProp);
    expect(versions).toHaveLength(3);

    // Newest first: Rev 2, Rev 1, Rev 0
    expect(versions[0].versionLabel).toBe('Rev 2');
    expect(versions[0].isCurrent).toBe(true);
    expect(versions[0].total).toBe(8000);
    expect(versions[0].diff).toBe(-1000);

    expect(versions[1].versionLabel).toBe('Rev 1');
    expect(versions[1].isCurrent).toBe(false);
    expect(versions[1].total).toBe(9000);
    expect(versions[1].diff).toBe(-1000);
    expect(versions[1].statusLabel).toBe('Superseded');

    expect(versions[2].versionLabel).toBe('Original (Rev 0)');
    expect(versions[2].isCurrent).toBe(false);
    expect(versions[2].isOriginal).toBe(true);
    expect(versions[2].total).toBe(10000);
    expect(versions[2].statusLabel).toBe('Superseded');
  });

  it('preserves historical snapshot items when available in revision history', async () => {
    const { buildProposalOldVersionsList } = await import('../MiscPages');
    const propWithSnapshots: Proposal = {
      _id: 'prop-snap',
      proposalNo: 'PROP-0050',
      title: 'Network Hardware',
      items: [{ description: 'Cisco Router x 2', qty: 2, unitPrice: 1500, total: 3000 }],
      total: 3000,
      subtotal: 3000,
      discount: 0,
      validUntil: '2026-10-30',
      status: 'sent',
      revision: 1,
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-10-05T10:00:00.000Z',
          revisedByName: 'Tech Lead',
          reason: 'Added 1 extra router',
          previousTotal: 1500,
          newTotal: 3000,
          previousItems: [{ description: 'Cisco Router x 1', qty: 1, unitPrice: 1500, total: 1500 }],
        } as any,
      ],
      createdBy: 'u-tech',
      createdAt: '2026-10-01T08:00:00.000Z',
    };

    const versions = buildProposalOldVersionsList(propWithSnapshots);
    expect(versions).toHaveLength(2);
    expect(versions[0].items).toHaveLength(1);
    expect(versions[0].items?.[0].description).toBe('Cisco Router x 2');
    expect(versions[1].items).toHaveLength(1);
    expect(versions[1].items?.[0].description).toBe('Cisco Router x 1');
  });

  it('verifies UI/UX requirements: XXL modal, S NO column, and center-aligned table headers & cells', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const miscPagesPath = path.resolve(__dirname, '../MiscPages.tsx');
    const sourceCode = fs.readFileSync(miscPagesPath, 'utf-8');

    // 1. XXL modal sizing for proper spacious layout without clipping
    expect(sourceCode).toMatch(/<Modal[\s\S]*?open=\{!!revisionProposal\}[\s\S]*?size="xxl"/);

    // 2. S NO column in table thead
    expect(sourceCode).toContain('>S NO</th>');

    // 3. S NO cell in table tbody
    expect(sourceCode).toContain('{vIdx + 1}');

    // 4. Center-aligned headers (th) and data cells (td)
    expect(sourceCode).toContain("textAlign: 'center'");
    expect(sourceCode).toContain("table className=\"data-table\" style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', textAlign: 'center' }}");

    // 5. STATUS column in table thead
    expect(sourceCode).toContain('>STATUS</th>');

    // 6. Proposal column header without '#' and no revision badge in proposal cell
    expect(sourceCode).toContain('<th>Proposal</th>');
    expect(sourceCode).not.toContain('<th>Proposal #</th>');

    // 7. Old version Preview & PDF Download actions
    expect(sourceCode).toContain('handlePreviewVersion(ver)');
    expect(sourceCode).toContain('handleDownloadVersionPDF(ver)');
    expect(sourceCode).toContain('>ACTIONS</th>');
    expect(sourceCode).toContain('Viewing Historical Quotation:');
    expect(sourceCode).toContain('Back to Revisions');
  });

  it('buildProposalFromVersion creates fully previewable proposal for superseded versions', async () => {
    const { buildProposalOldVersionsList, buildProposalFromVersion, buildProposalUnifiedData } = await import('../MiscPages');

    const proposal: Proposal = {
      _id: 'prop-rev-test',
      proposalNo: 'PROP-0010',
      title: 'Tally Prime Service Quote',
      items: [
        { description: 'Tally Prime Multi User', qty: 1, unitPrice: 6900, total: 6900 },
        { description: 'Implementation', qty: 1, unitPrice: 0, total: 0 },
      ],
      subtotal: 6900,
      discount: 2,
      total: 6762,
      revision: 1,
      revisedAt: '2026-10-07T09:19:33.210Z',
      revisionHistory: [
        {
          revision: 1,
          revisedAt: '2026-10-07T09:19:33.210Z',
          reason: 'Negotiated 2% discount',
          previousTotal: 6900,
          newTotal: 6762,
        },
      ],
      validUntil: '2026-10-01',
      status: 'draft',
      createdBy: 'u-admin',
      createdAt: '2026-09-03T12:00:00.000Z',
    };

    const versions = buildProposalOldVersionsList(proposal);
    expect(versions).toHaveLength(2);

    const [rev1, rev0] = versions;

    // Build preview proposal for Rev 0 (Original)
    const rev0Proposal = buildProposalFromVersion(proposal, rev0);
    expect(rev0Proposal._isOldVersion).toBe(true);
    expect(rev0Proposal._versionLabel).toBe('Original (Rev 0)');
    expect(rev0Proposal.total).toBe(6900);
    expect(rev0Proposal.subtotal).toBe(6900);
    expect(rev0Proposal.discount).toBe(0);
    expect(rev0Proposal.items).toHaveLength(2);

    // Build preview proposal for Rev 1 (Current Active)
    const rev1Proposal = buildProposalFromVersion(proposal, rev1);
    expect(rev1Proposal._isOldVersion).toBe(false);
    expect(rev1Proposal.total).toBe(6762);
    expect(rev1Proposal.discount).toBe(2);

    // Verify unified data for Rev 0 includes proper quote label and historical pricing
    const unifiedRev0 = buildProposalUnifiedData(rev0Proposal, [], null);
    expect(unifiedRev0.quotationDetails.quoteNo).toBe('PROP-0010 (Original (Rev 0))');
    expect(unifiedRev0.total).toBe(6900);
    expect(unifiedRev0.discount).toBe(0);
  });
});

