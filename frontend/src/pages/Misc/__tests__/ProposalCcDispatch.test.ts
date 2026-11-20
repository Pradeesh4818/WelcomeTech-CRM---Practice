import { describe, it, expect } from 'vitest';
import type { Proposal } from '../../../types';

describe('Proposal Types & CC Field Integrity', () => {
  it('allows cc property on Proposal interface and supports multiple emails', () => {
    const proposal: Proposal = {
      _id: 'prop-123',
      proposalNo: 'WT-Q1001',
      title: 'Annual IT Support Agreement',
      customerName: 'Doha Corporation',
      customerEmail: 'primary@dohacorp.qa',
      cc: 'finance@dohacorp.qa, manager@dohacorp.qa',
      items: [
        {
          description: 'SLA 24/7 Coverage',
          qty: 1,
          unitPrice: 12000,
          total: 12000,
        },
      ],
      subtotal: 12000,
      discount: 0,
      total: 12000,
      validUntil: '2026-12-31',
      status: 'sent',
      createdBy: 'user-1',
      createdAt: '2026-10-20T10:00:00.000Z',
    };

    expect(proposal.cc).toBe('finance@dohacorp.qa, manager@dohacorp.qa');
    expect(proposal.customerEmail).toBe('primary@dohacorp.qa');
  });

  it('correctly formats and normalizes CC recipient tags for API payload', () => {
    const ccEmailTags = ['sales@welcometech.qa', 'accounts@welcometech.qa'];
    const ccPayload = ccEmailTags.length > 0 ? ccEmailTags.join(', ') : undefined;

    expect(ccPayload).toBe('sales@welcometech.qa, accounts@welcometech.qa');
  });

  it('falls back to single raw cc input if tags array is empty', () => {
    const ccEmailTags: string[] = [];
    const ccEmailInput = '  audit@welcometech.qa  ';
    const ccPayload = ccEmailTags.length > 0 ? ccEmailTags.join(', ') : (ccEmailInput.trim() || undefined);

    expect(ccPayload).toBe('audit@welcometech.qa');
  });

  it('resolves undefined when both CC tags and input are empty', () => {
    const ccEmailTags: string[] = [];
    const ccEmailInput = '   ';
    const ccPayload = ccEmailTags.length > 0 ? ccEmailTags.join(', ') : (ccEmailInput.trim() || undefined);

    expect(ccPayload).toBeUndefined();
  });
});
