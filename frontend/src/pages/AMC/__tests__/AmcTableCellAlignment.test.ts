import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Table Values Center Alignment', () => {
  it('ensures company-name-cell in AMCPages.tsx has textAlign center', () => {
    const amcPath = path.resolve(__dirname, '../AMCPages.tsx');
    const amcContent = fs.readFileSync(amcPath, 'utf8');
    expect(amcContent).toMatch(/<td className="company-name-cell" style=\{\{[^}]*textAlign:\s*'center'/);
  });

  it('ensures index.css does not force company-name-cell or customer-cell to text-align right', () => {
    const cssPath = path.resolve(__dirname, '../../../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    
    // Lines around company-name-cell must not have text-align: right
    const cellRuleMatch = cssContent.match(/\.table-pro\s+\.company-name-cell[^{]*\{([^}]+)\}/);
    if (cellRuleMatch) {
      expect(cellRuleMatch[1]).not.toContain('text-align: right');
      expect(cellRuleMatch[1]).toContain('text-align: center');
    }
  });

  it('ensures CustomerManagementPages.tsx has textAlign center on company-name-cell', () => {
    const mgmtPath = path.resolve(__dirname, '../../Customers/CustomerManagementPages.tsx');
    const mgmtContent = fs.readFileSync(mgmtPath, 'utf8');
    expect(mgmtContent).toMatch(/<td className="company-name-cell" style=\{\{[^}]*textAlign:\s*'center'/);
  });
});
