import { describe, it, expect } from 'vitest';
import { escapeRegExp, omitKeys, computeProposalTotals } from '../controllerHelpers';

// Bug 7 — search regex must be escaped (ReDoS + regex-injection / error-leak).
describe('escapeRegExp', () => {
  it('escapes regex metacharacters so the value matches literally', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegExp('[[invalid')).toBe('\\[\\[invalid');
    expect(escapeRegExp('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
  });

  it('leaves plain alphanumeric text untouched', () => {
    expect(escapeRegExp('Widget 42')).toBe('Widget 42');
  });

  it('produces a RegExp that throws on the raw value but not on the escaped one', () => {
    expect(() => new RegExp('[[invalid')).toThrow();
    expect(() => new RegExp(escapeRegExp('[[invalid'))).not.toThrow();
    // Escaped pattern matches the literal string.
    expect(new RegExp(escapeRegExp('a.b')).test('a.b')).toBe(true);
    expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
  });
});

// Bugs 4 & 5 — mass-assignment guard.
describe('omitKeys', () => {
  it('removes the given keys and returns a new object', () => {
    const body = { title: 'ok', createdBy: 'attacker', ticketNo: 'TKT-0001', customer: 'x' };
    const safe = omitKeys(body, ['createdBy', 'ticketNo', 'customer', '_id', 'createdAt', 'updatedAt']);
    expect(safe).toEqual({ title: 'ok' });
    // original is not mutated
    expect(body.createdBy).toBe('attacker');
  });

  it('is a no-op for keys that are not present', () => {
    expect(omitKeys({ a: 1 }, ['b', 'c'])).toEqual({ a: 1 });
  });

  it('tolerates null/undefined input', () => {
    expect(omitKeys(null as any, ['a'])).toEqual({});
    expect(omitKeys(undefined as any, ['a'])).toEqual({});
  });
});

// Bug 2 — proposal totals must be computed server-side, never trusted from the client.
describe('computeProposalTotals', () => {
  it('sums line totals and ignores any client subtotal/total', () => {
    const items = [
      { qty: 1, unitPrice: 800, total: 800 },
      { qty: 1, unitPrice: 700, total: 700 },
    ];
    expect(computeProposalTotals(items, 0)).toEqual({ subtotal: 1500, discount: 0, total: 1500 });
  });

  it('derives a missing line total from qty * unitPrice', () => {
    const items = [{ qty: 3, unitPrice: 200 }]; // no `total`
    expect(computeProposalTotals(items)).toEqual({ subtotal: 600, discount: 0, total: 600 });
  });

  it('applies a percentage discount', () => {
    const items = [{ qty: 1, unitPrice: 1000, total: 1000 }];
    expect(computeProposalTotals(items, 10)).toEqual({ subtotal: 1000, discount: 10, total: 900 });
  });

  it('never returns a negative total even with a >100% discount', () => {
    const items = [{ qty: 1, unitPrice: 1000, total: 1000 }];
    expect(computeProposalTotals(items, 150).total).toBe(0);
  });

  it('handles string numeric inputs and empty/invalid input', () => {
    expect(computeProposalTotals([{ qty: '2', unitPrice: '50' }] as any, '0')).toEqual({
      subtotal: 100, discount: 0, total: 100,
    });
    expect(computeProposalTotals([], 0)).toEqual({ subtotal: 0, discount: 0, total: 0 });
    expect(computeProposalTotals(undefined as any)).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });

  it('correctly calculates subtotal, discount, and total from table blocks with per-block discounts', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'table',
        discountPercent: 10,
        items: [
          { type: 'item', description: 'Tally Prime [Int\'l Edition] - Single User', qty: 1, unitPrice: 2550 },
          { type: 'item', description: 'Installation & Implementation', qty: 1, unitPrice: 0 },
          { type: 'detail', description: 'Includes 1 year free updates' },
        ],
      },
    ];

    const result = computeProposalTotals([], 0, blocks);
    expect(result.subtotal).toBe(2550);
    expect(result.discount).toBe(10);
    expect(result.total).toBe(2295);
  });
});
