import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PAGE_PERMISSIONS, hasPermission, expandPermissionsForEditing, PERMISSION_LABELS } from '../rbac';

describe('Proposals & Templates Streamlining (Sidebar & Roles RBAC)', () => {
  const sidebarPath = path.resolve(__dirname, '../../components/layout/Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  const appPath = path.resolve(__dirname, '../../App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  it('verifies New Proposal and New Template are removed from Sidebar navigation', () => {
    // Extract Proposals nav group in Sidebar
    const proposalsGroupMatch = sidebarContent.match(/id:\s*'proposals'[\s\S]*?children:\s*\[([\s\S]*?)\]/);
    expect(proposalsGroupMatch).not.toBeNull();
    const childrenStr = proposalsGroupMatch![1];

    // Must NOT contain New Proposal or New Template as standalone sidebar items
    expect(childrenStr).not.toContain("label: 'New Proposal'");
    expect(childrenStr).not.toContain("label: 'New Template'");
    expect(childrenStr).not.toContain("id: 'prop-new'");
    expect(childrenStr).not.toContain("id: 'prop-template-new'");

    // MUST contain Proposal Templates and Customer Proposals
    expect(childrenStr).toContain("label: 'Proposal Templates'");
    expect(childrenStr).toContain("label: 'Customer Proposals'");
    expect(childrenStr).toContain("path: '/proposal-templates'");
    expect(childrenStr).toContain("path: '/proposals'");
  });

  it('verifies New Proposal and New Template are removed from PAGE_PERMISSIONS for Roles', () => {
    const permIds = PAGE_PERMISSIONS.map((p) => p.id);

    // Ensure standalone add permissions are removed from role management
    expect(permIds).not.toContain('proposals.add');
    expect(permIds).not.toContain('proposalTemplates.add');

    // Ensure parent/list permissions remain present
    expect(permIds).toContain('proposals.list');
    expect(permIds).toContain('proposalTemplates');

    const proposalGroupPerms = PAGE_PERMISSIONS.filter((p) => p.group === 'Proposals');
    expect(proposalGroupPerms.map((p) => p.id)).toEqual(['proposals.list', 'proposalTemplates']);
  });

  it('allows access to New Proposal when role has Customer Proposals access (proposals.list)', () => {
    const userWithProposalList = {
      role: 'Sales',
      permissions: ['proposals.list'],
    };

    // User can access Customer Proposals
    expect(hasPermission(userWithProposalList, 'proposals.list')).toBe(true);
    // User automatically inherits access to New Proposal
    expect(hasPermission(userWithProposalList, 'proposals.add')).toBe(true);

    // But cannot access Proposal Templates
    expect(hasPermission(userWithProposalList, 'proposalTemplates')).toBe(false);
    expect(hasPermission(userWithProposalList, 'proposalTemplates.add')).toBe(false);
  });

  it('allows access to New Template when role has Proposal Templates access (proposalTemplates)', () => {
    const userWithTemplateAccess = {
      role: 'Marketing',
      permissions: ['proposalTemplates'],
    };

    // User can access Proposal Templates
    expect(hasPermission(userWithTemplateAccess, 'proposalTemplates')).toBe(true);
    // User automatically inherits access to New Template
    expect(hasPermission(userWithTemplateAccess, 'proposalTemplates.add')).toBe(true);

    // But cannot access Customer Proposals
    expect(hasPermission(userWithTemplateAccess, 'proposals.list')).toBe(false);
    expect(hasPermission(userWithTemplateAccess, 'proposals.add')).toBe(false);
  });

  it('denies proposal and template creation if user lacks both permissions', () => {
    const userWithoutAccess = {
      role: 'Viewer',
      permissions: ['dashboard', 'customers.list'],
    };

    expect(hasPermission(userWithoutAccess, 'proposals.add')).toBe(false);
    expect(hasPermission(userWithoutAccess, 'proposalTemplates.add')).toBe(false);
    expect(hasPermission(userWithoutAccess, 'proposals.list')).toBe(false);
    expect(hasPermission(userWithoutAccess, 'proposalTemplates')).toBe(false);
  });

  it('grants full access to admin and wildcard permissions', () => {
    const adminUser = { role: 'admin' };
    expect(hasPermission(adminUser, 'proposals.add')).toBe(true);
    expect(hasPermission(adminUser, 'proposalTemplates.add')).toBe(true);

    const wildcardUser = { role: 'Custom', permissions: ['*'] };
    expect(hasPermission(wildcardUser, 'proposals.add')).toBe(true);
    expect(hasPermission(wildcardUser, 'proposalTemplates.add')).toBe(true);

    const legacyGroupUser = { role: 'Custom', permissions: ['proposals'] };
    expect(hasPermission(legacyGroupUser, 'proposals.add')).toBe(true);
    expect(hasPermission(legacyGroupUser, 'proposalTemplates.add')).toBe(true);
  });

  it('expands legacy proposals.add and proposalTemplates.add for role editing compatibility', () => {
    const legacyRolePerms = ['proposals.add', 'proposalTemplates.add'];
    const expanded = expandPermissionsForEditing(legacyRolePerms);

    expect(expanded).toContain('proposals.list');
    expect(expanded).toContain('proposalTemplates');
  });

  it('verifies App.tsx routes align proposal creation routes with list permissions', () => {
    expect(appContent).toContain('<Route path="/proposals/new" element={<ProtectedPage permission="proposals.list">');
    expect(appContent).toContain('<Route path="/proposals/:id/edit" element={<ProtectedPage permission="proposals.list">');
    expect(appContent).toContain('<Route path="/proposal-templates/new" element={<ProtectedPage permission="proposalTemplates">');
    expect(appContent).toContain('<Route path="/proposal-templates/:id/edit" element={<ProtectedPage permission="proposalTemplates">');
  });

  it('preserves human readable fallback labels in PERMISSION_LABELS', () => {
    expect(PERMISSION_LABELS['proposals.list']).toBe('Customer Proposals');
    expect(PERMISSION_LABELS['proposalTemplates']).toBe('Proposal Templates');
    expect(PERMISSION_LABELS['proposals.add']).toBe('New Proposal');
    expect(PERMISSION_LABELS['proposalTemplates.add']).toBe('New Proposal Template');
  });
});
