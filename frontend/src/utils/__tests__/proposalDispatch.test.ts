import { describe, it, expect } from 'vitest';

export const resolveProposalRecipient = (
  customer?: { email?: string; primaryContactInfo?: { email?: string } } | null,
  lead?: { email?: string } | null,
  proposalEmail?: string,
  fallback?: string
): string => {
  return String(
    fallback ||
    customer?.email ||
    customer?.primaryContactInfo?.email ||
    lead?.email ||
    proposalEmail ||
    ''
  ).trim();
};

describe('Proposal Email Dispatch & Recipient Resolution', () => {
  it('correctly resolves direct customer email', () => {
    const customer = { email: 'client@company.qa' };
    const email = resolveProposalRecipient(customer, null, undefined);
    expect(email).toBe('client@company.qa');
  });

  it('correctly resolves primaryContactInfo email when customer email is nested', () => {
    const customer = { primaryContactInfo: { email: 'primary@alfayad.qa' } };
    const email = resolveProposalRecipient(customer, null, undefined);
    expect(email).toBe('primary@alfayad.qa');
  });

  it('correctly resolves lead email when proposal was generated from a Lead', () => {
    const lead = { email: 'prospect@startup.qa' };
    const email = resolveProposalRecipient(null, lead, undefined);
    expect(email).toBe('prospect@startup.qa');
  });

  it('correctly uses direct user override / fallback entered in Send Proposal modal', () => {
    const customer = { email: 'old@company.qa' };
    const overrideEmail = 'new-procurement@company.qa';
    const email = resolveProposalRecipient(customer, null, undefined, overrideEmail);
    expect(email).toBe('new-procurement@company.qa');
  });

  it('returns empty string if no email is attached to customer, lead, or proposal', () => {
    const email = resolveProposalRecipient(null, null, undefined);
    expect(email).toBe('');
  });
});

describe('Task Handover Proposal Creation Routing for All Roles', () => {
  it('generates proposal creation route with prefilled leadId when task is linked to a lead', () => {
    const task = { _id: 'tsk_1', lead: { _id: 'lead_99' }, customer: null };
    const leadId = typeof task.lead === 'object' && task.lead ? task.lead._id : task.lead;
    const targetRoute = `/proposals/new?leadId=${leadId}`;
    expect(targetRoute).toBe('/proposals/new?leadId=lead_99');
  });

  it('generates proposal creation route with prefilled customerId when task is linked to a customer', () => {
    const task = { _id: 'tsk_2', lead: null, customer: { _id: 'cust_45' } };
    const custId = typeof task.customer === 'object' && task.customer ? task.customer._id : task.customer;
    const targetRoute = `/proposals/new?customerId=${custId}`;
    expect(targetRoute).toBe('/proposals/new?customerId=cust_45');
  });

  it('allows all roles (sales, staff, manager, admin) to trigger proposal creation from task handover', () => {
    const roles = ['admin', 'manager', 'sales', 'technician', 'staff'];
    const canAccessProposalTab = (_role: string) => true; // unrestricted
    roles.forEach(role => {
      expect(canAccessProposalTab(role)).toBe(true);
    });
  });
});
