import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './Pagination.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Total number of records across all pages. Enables the "Showing x–y of n" summary. */
  total?: number;
  /** Rows shown per page (defaults to 10). */
  pageSize?: number | string;
  /** When provided, a "Rows per page" dropdown is shown in the footer. */
  onPageSizeChange?: (size: string) => void;
}

const SIZE_OPTIONS = ['10', '25', '50', '100', '250', '500'];

/** Page numbers to show, with `null` standing for a gap ("…"). */
export const buildPageList = (current: number, totalPages: number): Array<number | null> => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
};

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  total,
  pageSize,
  onPageSizeChange,
}) => {
  const size = Math.max(1, Number(pageSize) || 10);
  const pages = Math.max(1, totalPages || 1);
  const canResize = Boolean(onPageSizeChange);

  // Nothing to navigate and nothing to resize back from: no footer.
  if (pages <= 1 && (!canResize || size === 10)) return null;

  const hasTotal = typeof total === 'number' && total >= 0;
  const from = hasTotal && total! > 0 ? (currentPage - 1) * size + 1 : 0;
  const to = hasTotal ? Math.min(currentPage * size, total!) : 0;

  return (
    <nav className="pagination-container" aria-label="Table pagination">
      <div className="pagination-meta">
        {hasTotal && (
          <span className="page-info">
            Showing <strong>{from}–{to}</strong> of <strong>{total}</strong>
          </span>
        )}
        {canResize && (
          <label className="pagination-size">
            <span>Rows per page</span>
            <select
              value={String(size)}
              onChange={(e) => onPageSizeChange?.(e.target.value)}
              aria-label="Rows per page"
            >
              {SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {pages > 1 && (
        <div className="pagination-pages">
          <button
            type="button"
            className="btn-page"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          {buildPageList(currentPage, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="page-gap" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`btn-page btn-page-num ${p === currentPage ? 'is-active' : ''}`}
                onClick={() => p !== currentPage && onPageChange(p)}
                aria-current={p === currentPage ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className="btn-page"
            disabled={currentPage >= pages}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
};
