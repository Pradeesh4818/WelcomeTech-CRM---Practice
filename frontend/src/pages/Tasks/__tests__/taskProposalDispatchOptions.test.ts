import { describe, it, expect } from 'vitest';

export interface ProposalPayload {
  to: string;
  cc?: string;
  template?: string;
  templateName?: string;
  proposalType?: string;
  title: string;
  task?: string;
  lead?: string;
  customer?: string;
  customerEmail: string;
  customerName?: string;
}

export const buildTaskProposalPayload = (params: {
  handoverTask: { _id: string; title: string; lead?: any; customer?: any };
  proposalType: string;
  proposalTemplateId?: string;
  proposalEmail: string;
  proposalCc?: string;
  proposalTemplates: Array<{ _id: string; name: string }>;
}): ProposalPayload => {
  const { handoverTask, proposalType, proposalTemplateId, proposalEmail, proposalCc, proposalTemplates } = params;
  const leadId = typeof handoverTask.lead === 'object' && handoverTask.lead ? handoverTask.lead._id : handoverTask.lead;
  const custId = typeof handoverTask.customer === 'object' && handoverTask.customer ? handoverTask.customer._id : handoverTask.customer;
  const leadName = typeof handoverTask.lead === 'object' && handoverTask.lead ? (handoverTask.lead.companyName || handoverTask.lead.name) : '';
  const selectedTpl = proposalTemplates.find((t) => t._id === proposalTemplateId || t.name === proposalType);

  const cleanEmail = proposalEmail.trim();
  const cleanCc = (proposalCc || '').trim() || undefined;

  return {
    to: cleanEmail,
    cc: cleanCc,
    template: selectedTpl?._id || proposalTemplateId || undefined,
    templateName: selectedTpl?.name || proposalType,
    proposalType: selectedTpl?.name || proposalType,
    title: `${selectedTpl?.name || proposalType || 'Quotation'} - ${leadName || handoverTask.title || 'Client'}`,
    task: handoverTask._id,
    lead: leadId,
    customer: custId,
    customerEmail: cleanEmail,
    customerName: leadName || undefined,
  };
};

export const validateProposalDispatchInputs = (email: string, proposalType: string): { valid: boolean; error?: string } => {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    return { valid: false, error: 'Please enter the recipient client email address.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: 'Please enter a valid client email address.' };
  }
  if (!proposalType.trim()) {
    return { valid: false, error: 'Please select a proposal type / template.' };
  }
  return { valid: true };
};

export const buildProposalTemplateOptions = (templates: Array<{ _id: string; name: string; title?: string }>) => {
  if (templates && templates.length > 0) {
    return templates.map((t) => ({
      value: String(t._id),
      label: t.name ? (t.title && t.title !== t.name ? `${t.name} (${t.title})` : t.name) : 'Template',
    }));
  }
  return [
    { value: 'Standard Quotation', label: 'Standard Quotation' },
    { value: 'AMC Service Quotation', label: 'AMC Service Quotation' },
    { value: 'Tally Software Quotation', label: 'Tally Software Quotation' },
    { value: 'Cloud Hosting Quotation', label: 'Cloud Hosting Quotation' },
  ];
};

export const resolveSelectedProposalOptionValue = (
  proposalTemplateId: string,
  proposalType: string,
  options: Array<{ value: string; label: string }>
): string => {
  if (proposalTemplateId) {
    const match = options.find((o) => o.value === String(proposalTemplateId));
    if (match) return match.value;
  }
  if (proposalType) {
    const match = options.find(
      (o) => o.value === proposalType || o.label.toLowerCase().includes(proposalType.toLowerCase())
    );
    if (match) return match.value;
  }
  return options[0]?.value || '';
};

export const checkIsProposalSentForTask = (
  taskId: string,
  linkedProposals: Array<{ task?: any; status: string }>,
  isSentLocally: boolean
): boolean => {
  if (isSentLocally) return true;
  return linkedProposals.some((p) => {
    const pTaskId = typeof p.task === 'object' && p.task ? p.task._id : p.task;
    return pTaskId && String(pTaskId) === String(taskId) && (p.status === 'sent' || p.status === 'accepted');
  });
};

describe('Task Proposal Handover - Proposal Type, Email & CC Dispatch', () => {
  const sampleTemplates = [
    { _id: 'tpl_1', name: 'Tally on Cloud Service', title: 'Cloud Enterprise Plan' },
    { _id: 'tpl_2', name: 'Annual Maintenance Service - Single User (AMC)' },
    { _id: 'tpl_3', name: 'TallyPrime Multi User' },
  ];

  it('correctly maps proposal templates into theme-based SelectOption structures and resolves selection', () => {
    const options = buildProposalTemplateOptions(sampleTemplates);
    expect(options).toHaveLength(3);
    expect(options[0]).toEqual({ value: 'tpl_1', label: 'Tally on Cloud Service (Cloud Enterprise Plan)' });
    expect(options[1]).toEqual({ value: 'tpl_2', label: 'Annual Maintenance Service - Single User (AMC)' });

    // Resolves by direct templateId
    expect(resolveSelectedProposalOptionValue('tpl_2', '', options)).toBe('tpl_2');

    // Resolves by fuzzy name when templateId not set yet
    expect(resolveSelectedProposalOptionValue('', 'Tally on Cloud', options)).toBe('tpl_1');

    // Falls back to defaults when no templates returned
    const fallbackOptions = buildProposalTemplateOptions([]);
    expect(fallbackOptions[0]).toEqual({ value: 'Standard Quotation', label: 'Standard Quotation' });
    expect(resolveSelectedProposalOptionValue('', '', fallbackOptions)).toBe('Standard Quotation');
  });

  it('validates client email and rejects invalid or empty emails', () => {
    expect(validateProposalDispatchInputs('', 'Tally on Cloud Service').valid).toBe(false);
    expect(validateProposalDispatchInputs('invalid-email', 'Tally on Cloud Service').valid).toBe(false);
    expect(validateProposalDispatchInputs('client@domain.com', '').valid).toBe(false);
    expect(validateProposalDispatchInputs('client@domain.com', 'Tally on Cloud Service').valid).toBe(true);
  });

  it('constructs correct proposal payload with proposal type, recipient email, and CC email', () => {
    const task = {
      _id: 'task_123',
      title: 'Lead LEAD-00046: saba',
      lead: { _id: 'lead_46', name: 'saba', companyName: 'SAS ENTERPRISES', email: 'sabarish@example.com' },
    };

    const payload = buildTaskProposalPayload({
      handoverTask: task,
      proposalType: 'Tally on Cloud Service',
      proposalTemplateId: 'tpl_1',
      proposalEmail: 'sabarish@example.com',
      proposalCc: 'sales@welcometech.qa, manager@welcometech.qa',
      proposalTemplates: sampleTemplates,
    });

    expect(payload.to).toBe('sabarish@example.com');
    expect(payload.cc).toBe('sales@welcometech.qa, manager@welcometech.qa');
    expect(payload.template).toBe('tpl_1');
    expect(payload.templateName).toBe('Tally on Cloud Service');
    expect(payload.task).toBe('task_123');
    expect(payload.lead).toBe('lead_46');
    expect(payload.title).toBe('Tally on Cloud Service - SAS ENTERPRISES');
  });

  it('omits CC field when not provided or empty', () => {
    const task = {
      _id: 'task_123',
      title: 'Follow up quote',
      lead: { _id: 'lead_46', name: 'saba' },
    };

    const payload = buildTaskProposalPayload({
      handoverTask: task,
      proposalType: 'TallyPrime Multi User',
      proposalTemplateId: 'tpl_3',
      proposalEmail: 'saba@client.com',
      proposalCc: '   ',
      proposalTemplates: sampleTemplates,
    });

    expect(payload.cc).toBeUndefined();
    expect(payload.to).toBe('saba@client.com');
  });

  it('correctly isolates proposal sent status to the specific task rather than unrelated proposals in DB', () => {
    const taskId = 'task_target';
    const unrelatedProposals = [
      { task: 'task_other_1', status: 'sent' },
      { task: 'task_other_2', status: 'accepted' },
    ];

    // Unrelated proposals should NOT mark target task as sent
    const isSentBefore = checkIsProposalSentForTask(taskId, unrelatedProposals, false);
    expect(isSentBefore).toBe(false);

    // When a proposal is dispatched for this task, it is marked as sent
    const relatedProposals = [
      ...unrelatedProposals,
      { task: 'task_target', status: 'sent' },
    ];
    const isSentAfter = checkIsProposalSentForTask(taskId, relatedProposals, false);
    expect(isSentAfter).toBe(true);

    // Session local dispatch immediately reflects sent status
    expect(checkIsProposalSentForTask(taskId, [], true)).toBe(true);
  });
});
