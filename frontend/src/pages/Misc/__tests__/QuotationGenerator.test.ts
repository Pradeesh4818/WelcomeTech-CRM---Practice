import { describe, it, expect } from 'vitest';

// Simulated item interface
interface TestItem {
  id: number;
  type: 'item' | 'detail';
  no?: number;
  description: string;
  qty: number | string;
  unitPrice: number | string;
}

// Mock localStorage if in node environment
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; }
};

if (typeof localStorage === 'undefined') {
  (global as any).localStorage = mockLocalStorage;
}

export const getNextQuotationNumber = (increment = true): string => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
  const key = `wt_quote_seq_${currentYear}_${currentMonth}`;
  
  let seq = parseInt(localStorage.getItem(key) || '0', 10);
  if (increment) {
    seq += 1;
    localStorage.setItem(key, seq.toString());
  } else if (seq === 0) {
    seq = 1;
    localStorage.setItem(key, seq.toString());
  }
  
  return `WT-Q${currentYear}${currentMonth}${seq.toString().padStart(2, '0')}`;
};

// 1. Test calculation function
export const calculateTotal = (items: TestItem[]): number => {
  return items.reduce((acc, item) => {
    if (item.type === 'item') {
      const qty = parseFloat(String(item.qty)) || 0;
      const price = parseFloat(String(item.unitPrice)) || 0;
      return acc + (qty * price);
    }
    return acc;
  }, 0);
};

// 2. Test phone number cleaner for WhatsApp share
export const cleanPhoneNumber = (rawPhone: string): string => {
  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '60' + cleaned.slice(1);
  }
  if (cleaned.length >= 9 && cleaned.length <= 10 && !cleaned.startsWith('60')) {
    cleaned = '60' + cleaned;
  }
  return cleaned;
};

// 3. Test detail row filter
export const filterDefaultDetailRows = (itemsList: TestItem[]): TestItem[] => {
  const defaultLabels = ['Route:', 'Cargo Specifications:', 'Operational Support:'];
  return (itemsList || []).filter(item => {
    if (item.type === 'detail') {
      const desc = item.description || '';
      if (defaultLabels.some(label => desc.trim().startsWith(label))) {
        return false;
      }
    }
    return true;
  });
};

// Test Runner Execution Function
export const runQuotationGeneratorTests = () => {
  const results: { test: string; passed: boolean; details: string }[] = [];

  // Test 1: Quotation Number Generator
  try {
    const quoteNo = getNextQuotationNumber(false);
    const isValidFormat = /^WT-Q\d{6}\d{2,}$/.test(quoteNo);
    results.push({
      test: 'Quotation Sequence Generation',
      passed: isValidFormat,
      details: `Generated format: ${quoteNo}`
    });
  } catch (err: any) {
    results.push({ test: 'Quotation Sequence Generation', passed: false, details: err.message });
  }

  // Test 2: Calculation Logic
  try {
    const testItems: TestItem[] = [
      { id: 1, type: 'item', description: 'Lorry Freight 10T', qty: 2, unitPrice: 1500 },
      { id: 2, type: 'detail', description: 'Includes driver & fuel', qty: '', unitPrice: '' },
      { id: 3, type: 'item', description: 'Depot Bay Reservation', qty: 1, unitPrice: 800 }
    ];
    const total = calculateTotal(testItems);
    const expected = 3800; // (2 * 1500) + 800
    results.push({
      test: 'Line Items Subtotal & Total Calculation',
      passed: total === expected,
      details: `Calculated Total: RM ${total} (Expected: RM ${expected})`
    });
  } catch (err: any) {
    results.push({ test: 'Line Items Subtotal & Total Calculation', passed: false, details: err.message });
  }

  // Test 3: Phone Number Formatting for WhatsApp
  try {
    const phone1 = cleanPhoneNumber('012-345 6789');
    const phone2 = cleanPhoneNumber('+6012-345 6789');
    const passed = phone1 === '60123456789' && phone2 === '60123456789';
    results.push({
      test: 'WhatsApp Phone Number Sanitization',
      passed,
      details: `Raw "012-345 6789" -> "${phone1}", Raw "+6012-345 6789" -> "${phone2}"`
    });
  } catch (err: any) {
    results.push({ test: 'WhatsApp Phone Number Sanitization', passed: false, details: err.message });
  }

  // Test 4: Detail Row Filtering
  try {
    const rawItems: TestItem[] = [
      { id: 1, type: 'item', description: 'Painting Service', qty: 1, unitPrice: 5000 },
      { id: 2, type: 'detail', description: 'Route: KL to Seremban', qty: '', unitPrice: '' },
      { id: 3, type: 'detail', description: 'Custom color specification', qty: '', unitPrice: '' }
    ];
    const filtered = filterDefaultDetailRows(rawItems);
    const passed = filtered.length === 2 && filtered[1].description === 'Custom color specification';
    results.push({
      test: 'Default Specification Rows Filtering',
      passed,
      details: `Filtered ${rawItems.length} items to ${filtered.length} relevant items.`
    });
  } catch (err: any) {
    results.push({ test: 'Default Specification Rows Filtering', passed: false, details: err.message });
  }

  return results;
};

// 5. Template auto-selection resolver
export const resolveProposalTemplate = (
  existingProposal: any,
  proposalTemplates: any[]
): string => {
  if (!existingProposal) return '';
  const propTemplateId = typeof existingProposal.template === 'object' ? existingProposal.template?._id : existingProposal.template;
  if (propTemplateId) return String(propTemplateId);
  if (existingProposal.templateName && proposalTemplates?.length) {
    const found = proposalTemplates.find((pt: any) => pt.name?.trim().toLowerCase() === existingProposal.templateName?.trim().toLowerCase());
    if (found) return String(found._id);
  }
  if (existingProposal.title && proposalTemplates?.length) {
    const found = proposalTemplates.find((pt: any) =>
      pt.name?.trim().toLowerCase() === existingProposal.title?.trim().toLowerCase() ||
      pt.title?.trim().toLowerCase() === existingProposal.title?.trim().toLowerCase()
    );
    if (found) return String(found._id);
  }
  if (proposalTemplates?.length && (existingProposal.items?.length || existingProposal.blocks?.length)) {
    const firstDesc = existingProposal.items?.[0]?.description ||
      (existingProposal.blocks && existingProposal.blocks.find((b: any) => b.type === 'table')?.items?.[0]?.description);
    if (firstDesc) {
      const found = proposalTemplates.find((pt: any) =>
        pt.items?.some((it: any) => it.description && firstDesc.toLowerCase().includes(it.description.toLowerCase().trim()))
      );
      if (found) return String(found._id);
    }
  }
  return '';
};

// 6. Task auto-selection resolver
export const resolveProposalTask = (
  existingProposal: any,
  allTasks: any[]
): string => {
  if (!existingProposal) return '';
  const propTaskId = typeof existingProposal.task === 'object' ? existingProposal.task?._id : existingProposal.task;
  if (propTaskId) return String(propTaskId);
  if (allTasks && allTasks.length > 0) {
    const custId = typeof existingProposal.customer === 'object' ? existingProposal.customer?._id : existingProposal.customer;
    const leadId = typeof existingProposal.lead === 'object' ? existingProposal.lead?._id : existingProposal.lead;
    if (custId) {
      const matchingTask = allTasks.find((t: any) => {
        const tCustId = typeof t.customer === 'object' ? t.customer?._id : t.customer;
        return tCustId && String(tCustId) === String(custId);
      });
      if (matchingTask) return String(matchingTask._id);
    } else if (leadId) {
      const matchingTask = allTasks.find((t: any) => {
        const tLeadId = typeof t.lead === 'object' ? t.lead?._id : t.lead;
        return tLeadId && String(tLeadId) === String(leadId);
      });
      if (matchingTask) return String(matchingTask._id);
    }
  }
  return '';
};

describe('QuotationGenerator', () => {
  const results = runQuotationGeneratorTests();
  for (const r of results) {
    it(r.test, () => {
      expect(r.passed, r.details).toBe(true);
    });
  }

  it('auto-selects template by template id, templateName, title, or item description', () => {
    const templates = [
      { _id: 'tmpl-1', name: 'TallyPrime Multi User', items: [{ description: 'TallyPrime Multi User License' }] },
      { _id: 'tmpl-2', name: 'AMC Support Standard', items: [{ description: 'Annual Maintenance Contract' }] },
    ];

    // Case A: direct template ID
    expect(resolveProposalTemplate({ template: 'tmpl-1' }, templates)).toBe('tmpl-1');
    expect(resolveProposalTemplate({ template: { _id: 'tmpl-2', name: 'AMC' } }, templates)).toBe('tmpl-2');

    // Case B: match by templateName
    expect(resolveProposalTemplate({ templateName: 'TallyPrime Multi User' }, templates)).toBe('tmpl-1');

    // Case C: match by title
    expect(resolveProposalTemplate({ title: 'TallyPrime Multi User' }, templates)).toBe('tmpl-1');

    // Case D: fallback match by line item description
    expect(resolveProposalTemplate({ items: [{ description: 'TallyPrime Multi User License Renewal' }] }, templates)).toBe('tmpl-1');
  });

  it('auto-selects task by task reference or by customer/lead task in allTasks', () => {
    const tasks = [
      { _id: 'task-001', taskNo: 'TASK-00004', customer: { _id: 'cust-123' }, title: 'Customer Task — Sabarish T' },
      { _id: 'task-002', taskNo: 'TASK-00005', lead: { _id: 'lead-456' }, title: 'Lead Followup' },
    ];

    // Case A: direct task ID
    expect(resolveProposalTask({ task: 'task-001' }, tasks)).toBe('task-001');
    expect(resolveProposalTask({ task: { _id: 'task-002' } }, tasks)).toBe('task-002');

    // Case B: match by customer ID
    expect(resolveProposalTask({ customer: 'cust-123' }, tasks)).toBe('task-001');
    expect(resolveProposalTask({ customer: { _id: 'cust-123' } }, tasks)).toBe('task-001');

    // Case C: match by lead ID
    expect(resolveProposalTask({ lead: 'lead-456' }, tasks)).toBe('task-002');
  });
});
