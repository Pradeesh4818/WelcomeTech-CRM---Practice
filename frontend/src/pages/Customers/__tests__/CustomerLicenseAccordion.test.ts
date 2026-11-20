import { describe, it, expect } from 'vitest';

describe('Customer Details - Product & License Multiple Licenses Accordion Behavior', () => {
  // Pure representation of the accordion expansion logic used in CustomersPage.tsx
  const createAccordionState = (initialState: Record<string, boolean> = {}) => {
    let state = { ...initialState };

    const isDetailSectionExpanded = (sectionKey: string, defaultExpanded = true) => {
      return state[sectionKey] !== undefined ? state[sectionKey] : defaultExpanded;
    };

    const toggleDetailSection = (sectionKey: string, defaultExpanded = true) => {
      const current = state[sectionKey] !== undefined ? state[sectionKey] : defaultExpanded;
      state = { ...state, [sectionKey]: !current };
    };

    const expandAll = (keys: string[]) => {
      const next: Record<string, boolean> = {};
      keys.forEach((k) => {
        next[k] = true;
      });
      state = { ...state, ...next };
    };

    const collapseAll = (keys: string[]) => {
      const next: Record<string, boolean> = {};
      keys.forEach((k) => {
        next[k] = false;
      });
      state = { ...state, ...next };
    };

    return {
      getState: () => state,
      isDetailSectionExpanded,
      toggleDetailSection,
      expandAll,
      collapseAll,
    };
  };

  it('multiple licenses (e.g., 4 licenses) default to CLOSED by default', () => {
    const mockLicenses = [
      { key: 'amc-svc-0', label: 'Product & License #1', product: 'TallyPrime Silver', licenseSerialNo: '710001' },
      { key: 'amc-svc-1', label: 'Product & License #2', product: 'TallyPrime Gold', licenseSerialNo: '720002' },
      { key: 'amc-svc-2', label: 'Product & License #3', product: 'TE9 Silver', licenseSerialNo: '795110841' },
      { key: 'amc-svc-3', label: 'Product & License #4', product: 'Server 9', licenseSerialNo: '740004' },
    ];

    const accordion = createAccordionState({});
    const defaultExpanded = mockLicenses.length === 1;

    // Verify defaultExpanded is false for multiple licenses
    expect(defaultExpanded).toBe(false);

    // All 4 licenses must be closed initially
    mockLicenses.forEach((lic) => {
      expect(accordion.isDetailSectionExpanded(lic.key, defaultExpanded)).toBe(false);
    });
  });

  it('a single license defaults to OPEN for immediate inspection', () => {
    const mockLicenses = [
      { key: 'amc-svc-0', label: 'Product & License #1', product: 'TallyPrime Silver', licenseSerialNo: '710001' },
    ];

    const accordion = createAccordionState({});
    const defaultExpanded = mockLicenses.length === 1;

    // Single license should be open by default
    expect(defaultExpanded).toBe(true);
    expect(accordion.isDetailSectionExpanded(mockLicenses[0].key, defaultExpanded)).toBe(true);
  });

  it('allows expanding and collapsing individual licenses independently', () => {
    const mockLicenses = [
      { key: 'amc-svc-0', label: 'Product & License #1' },
      { key: 'amc-svc-1', label: 'Product & License #2' },
      { key: 'amc-svc-2', label: 'Product & License #3' },
    ];

    const accordion = createAccordionState({});
    const defaultExpanded = mockLicenses.length === 1; // false

    // Click #3 to open
    accordion.toggleDetailSection('amc-svc-2', defaultExpanded);
    expect(accordion.isDetailSectionExpanded('amc-svc-0', defaultExpanded)).toBe(false);
    expect(accordion.isDetailSectionExpanded('amc-svc-1', defaultExpanded)).toBe(false);
    expect(accordion.isDetailSectionExpanded('amc-svc-2', defaultExpanded)).toBe(true);

    // Click #3 again to close
    accordion.toggleDetailSection('amc-svc-2', defaultExpanded);
    expect(accordion.isDetailSectionExpanded('amc-svc-2', defaultExpanded)).toBe(false);
  });

  it('supports Expand All and Collapse All across all multiple licenses', () => {
    const keys = ['amc-svc-0', 'amc-svc-1', 'amc-svc-2', 'amc-svc-3'];
    const accordion = createAccordionState({});
    const defaultExpanded = false;

    // All closed initially
    expect(keys.every((k) => !accordion.isDetailSectionExpanded(k, defaultExpanded))).toBe(true);

    // Expand All
    accordion.expandAll(keys);
    expect(keys.every((k) => accordion.isDetailSectionExpanded(k, defaultExpanded))).toBe(true);

    // Collapse All
    accordion.collapseAll(keys);
    expect(keys.every((k) => !accordion.isDetailSectionExpanded(k, defaultExpanded))).toBe(true);
  });

  it('overview sections preserve default-open behavior while license sections are closed', () => {
    const accordion = createAccordionState({});

    // Overview sections default to true
    expect(accordion.isDetailSectionExpanded('seg-company', true)).toBe(true);
    expect(accordion.isDetailSectionExpanded('seg-contact', true)).toBe(true);

    // Multiple license sections default to false
    expect(accordion.isDetailSectionExpanded('amc-svc-0', false)).toBe(false);
    expect(accordion.isDetailSectionExpanded('amc-svc-1', false)).toBe(false);
  });
});
