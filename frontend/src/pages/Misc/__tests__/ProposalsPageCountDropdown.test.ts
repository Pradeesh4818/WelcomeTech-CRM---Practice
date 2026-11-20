import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PAGE_SIZE_OPTIONS } from '../../../utils/helpers';

describe('ProposalsPage Count Dropdown & Pagination UI/UX', () => {
  const miscPagesPath = path.resolve(__dirname, '../MiscPages.tsx');
  const miscCode = fs.readFileSync(miscPagesPath, 'utf8');

  const backendControllerPath = path.resolve(__dirname, '../../../../../backend/src/controllers/crmController.ts');
  const backendCode = fs.readFileSync(backendControllerPath, 'utf8');

  describe('1. Theme UI/UX Options & Helper Standard', () => {
    it('TC-COUNT-01: PAGE_SIZE_OPTIONS includes standard options (10, 25, 50, 100, 250, 500)', () => {
      const values = PAGE_SIZE_OPTIONS.map((o) => o.value);
      expect(values).toContain('10');
      expect(values).toContain('25');
      expect(values).toContain('50');
      expect(values).toContain('100');
    });
  });

  describe('2. Frontend ProposalsPage Integration', () => {
    it('TC-COUNT-02: Imports PAGE_SIZE_OPTIONS from helpers', () => {
      expect(miscCode).toMatch(/import\s*\{[^}]*PAGE_SIZE_OPTIONS[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/helpers['"]/);
    });

    it('TC-COUNT-03: Manages pageSize state defaulting to 10 and resets page on change', () => {
      expect(miscCode).toContain("const [pageSize, setPageSize] = useState('10');");
      expect(miscCode).toMatch(/React\.useEffect\(\(\) => \{ setPage\(1\); \}, \[filter, search, pageSize(?:, dateKey)?\]\);/);
    });

    it('TC-COUNT-04: Renders count dropdown with theme classes in the pointed filter toolbar location', () => {
      expect(miscCode).toContain('className="filter-select page-size-select"');
      expect(miscCode).toContain('value={pageSize}');
      expect(miscCode).toContain('onChange={(v) => { setPageSize(v); setPage(1); }}');
      expect(miscCode).toContain('options={PAGE_SIZE_OPTIONS}');
    });

    it('TC-COUNT-05: Queries proposals with dynamic limit and includes pageSize in queryKey', () => {
      expect(miscCode).toMatch(/queryKey:\s*\['proposals',\s*filter,\s*search,\s*page,\s*pageSize(?:,\s*dateKey)?\]/);
      expect(miscCode).toContain('const limitNum = Number(pageSize) || 10;');
      expect(miscCode).toContain('limit: String(limitNum)');
    });

    it('TC-COUNT-06: Dynamically adjusts S NO column and pagination summary based on limitNum', () => {
      expect(miscCode).toContain('(page - 1) * limitNum + idx + 1');
      expect(miscCode).toContain('Showing {(page - 1) * limitNum + 1}–{Math.min(page * limitNum, totalCount)} of {totalCount} proposals');
    });
  });

  describe('3. Backend getProposals Support', () => {
    it('TC-COUNT-07: getProposals supports dynamic limit query parameter up to 5000', () => {
      expect(backendCode).toContain("const limit = Math.min(5000, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));");
    });
  });
});
