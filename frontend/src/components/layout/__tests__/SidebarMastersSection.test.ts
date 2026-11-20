import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sidebar Masters Navigation Specification', () => {
  const sidebarPath = path.resolve(__dirname, '../Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  it('verifies Category List is removed from CRM and replaced by Masters under SYSTEM', () => {
    // 1. Must NOT contain Category List under CRM
    expect(sidebarContent).not.toMatch(/label:\s*'Category List'[\s\S]*?section:\s*'CRM'/);
    expect(sidebarContent).not.toContain("label: 'Category List'");

    // 2. Must contain Masters under SYSTEM
    const mastersMatch = sidebarContent.match(/id:\s*'categories'[\s\S]*?label:\s*'Masters'[\s\S]*?section:\s*'SYSTEM'/);
    expect(mastersMatch).not.toBeNull();
  });

  it('verifies Masters group contains all 10 master taxonomy sub-items with exact paths', () => {
    const mastersBlockMatch = sidebarContent.match(/label:\s*'Masters'[\s\S]*?children:\s*\[([\s\S]*?)\]/);
    expect(mastersBlockMatch).not.toBeNull();
    const childrenStr = mastersBlockMatch![1];

    const expectedChildren = [
      { id: 'ticket-categories', label: 'Ticket Category', path: '/ticket-categories' },
      { id: 'products', label: 'Products', path: '/products' },
      { id: 'licence-types', label: 'Licence Types', path: '/licence-types' },
      { id: 'customer-types', label: 'Customer Types', path: '/customer-types' },
      { id: 'industries', label: 'Industry', path: '/industries' },
      { id: 'business-segments', label: 'Business Segment', path: '/business-segments' },
      { id: 'industry-types', label: 'Industry Type', path: '/industry-types' },
      { id: 'lead-sources', label: 'Lead Sources', path: '/lead-sources' },
      { id: 'lead-statuses', label: 'Lead Status', path: '/lead-statuses' },
      { id: 'vendor-categories', label: 'Vendor Categories', path: '/vendor-categories' },
    ];

    for (const child of expectedChildren) {
      expect(childrenStr).toContain(`id: '${child.id}'`);
      expect(childrenStr).toContain(`label: '${child.label}'`);
      expect(childrenStr).toContain(`path: '${child.path}'`);
    }
  });

  it('verifies CRM section sequence does not contain Category List or Masters', () => {
    // Extract CRM items up to FINANCE
    const crmToFinanceMatch = sidebarContent.match(/section:\s*'CRM'[\s\S]*?section:\s*'FINANCE'/);
    expect(crmToFinanceMatch).not.toBeNull();
    const crmBlock = crmToFinanceMatch![0];

    expect(crmBlock).not.toContain('Category List');
    expect(crmBlock).not.toContain('Masters');
  });

  it('verifies SYSTEM section contains Masters, Roles, Admin Users, and Settings in order', () => {
    const systemSectionMatch = sidebarContent.match(/label:\s*'Masters'[\s\S]*?id:\s*'roles'[\s\S]*?id:\s*'admin-users'[\s\S]*?id:\s*'settings'/);
    expect(systemSectionMatch).not.toBeNull();
  });
});
