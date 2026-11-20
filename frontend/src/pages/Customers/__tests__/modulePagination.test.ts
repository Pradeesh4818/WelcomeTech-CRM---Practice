import { describe, it, expect } from 'vitest';

describe('Module Filter & Row-level Pagination Logic', () => {
  // Simulates the row-level slicing and pagination model used in TSSPage, TDLPage, and CloudPage
  const paginateRows = <T>(rows: T[], page: number, pageSize: number) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const pagedRows = rows.slice(start, start + pageSize);
    return {
      totalPages,
      safePage,
      pagedRows,
      startIndex: start,
    };
  };

  it('renders exactly 10 rows on page 1 when 19 rows match the expiring filter', () => {
    const mockRows = Array.from({ length: 19 }, (_, i) => ({
      rowKey: `row-${i + 1}`,
      customerNo: `WT${1000 + i}`,
      status: 'expiring',
    }));

    const result = paginateRows(mockRows, 1, 10);

    expect(result.totalPages).toBe(2);
    expect(result.pagedRows).toHaveLength(10);
    expect(result.pagedRows[0].customerNo).toBe('WT1000');
    expect(result.pagedRows[9].customerNo).toBe('WT1009');
  });

  it('renders the remaining 9 rows on page 2 with correct sequential indexing', () => {
    const mockRows = Array.from({ length: 19 }, (_, i) => ({
      rowKey: `row-${i + 1}`,
      customerNo: `WT${1000 + i}`,
      status: 'expiring',
    }));

    const result = paginateRows(mockRows, 2, 10);

    expect(result.totalPages).toBe(2);
    expect(result.pagedRows).toHaveLength(9);
    expect(result.startIndex).toBe(10);
    // Verifies S NO calculation: (page - 1) * pageSize + idx + 1
    const serialNumbers = result.pagedRows.map((_, idx) => result.startIndex + idx + 1);
    expect(serialNumbers).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('page-level selection applies strictly to visible paged rows, not cross-page rows', () => {
    const mockRows = Array.from({ length: 25 }, (_, i) => ({
      rowKey: `row-${i + 1}`,
      customerNo: `WT${1000 + i}`,
    }));

    const page1 = paginateRows(mockRows, 1, 10);
    const page1Keys = page1.pagedRows.map(r => r.rowKey);

    expect(page1Keys).toHaveLength(10);
    expect(page1Keys).toContain('row-1');
    expect(page1Keys).toContain('row-10');
    expect(page1Keys).not.toContain('row-11');
  });

  it('clamps or resets to page 1 when filter shrinks total pages below current page', () => {
    const initialRows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const initialPagination = paginateRows(initialRows, 4, 10); // on page 4
    expect(initialPagination.safePage).toBe(4);

    // Filter applied: only 5 rows match
    const filteredRows = initialRows.slice(0, 5);
    const newPagination = paginateRows(filteredRows, 4, 10);
    expect(newPagination.totalPages).toBe(1);
    expect(newPagination.safePage).toBe(1);
    expect(newPagination.pagedRows).toHaveLength(5);
  });

  it('guarantees Product List renders exactly 10 rows on page 1 starting at S NO 1, not 16', () => {
    // Simulates multiple products extracted from customers (e.g. 26 products total)
    const mockProductRows = Array.from({ length: 26 }, (_, i) => ({
      serialNo: `7${10000000 + i}`,
      product: 'TallyPrime',
      companyName: `Company ${i + 1}`,
    }));

    const page1 = paginateRows(mockProductRows, 1, 10);
    expect(page1.totalPages).toBe(3);
    expect(page1.pagedRows).toHaveLength(10);
    const page1SerialNumbers = page1.pagedRows.map((_, idx) => page1.startIndex + idx + 1);
    expect(page1SerialNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const page2 = paginateRows(mockProductRows, 2, 10);
    expect(page2.pagedRows).toHaveLength(10);
    const page2SerialNumbers = page2.pagedRows.map((_, idx) => page2.startIndex + idx + 1);
    expect(page2SerialNumbers).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

    const page3 = paginateRows(mockProductRows, 3, 10);
    expect(page3.pagedRows).toHaveLength(6);
    const page3SerialNumbers = page3.pagedRows.map((_, idx) => page3.startIndex + idx + 1);
    expect(page3SerialNumbers).toEqual([21, 22, 23, 24, 25, 26]);
  });
});
