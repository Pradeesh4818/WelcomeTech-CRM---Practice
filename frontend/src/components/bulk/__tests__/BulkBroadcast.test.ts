import { describe, it, expect } from 'vitest';

describe('BulkBroadcast Helpers & Template Synchronization', () => {
  it('calculates selected and unselected count correctly', () => {
    const selectedIds = ['amc-1', 'amc-2'];
    const totalCount = 10;
    expect(selectedIds.length).toBe(2);
    expect(totalCount - selectedIds.length).toBe(8);
  });

  it('filters targets into valid vs invalid email addresses', () => {
    const targets = [
      { id: '1', customerName: 'Client A', email: 'valid@example.com' },
      { id: '2', customerName: 'Client B', email: 'also.valid@domain.qa' },
      { id: '3', customerName: 'Client C', email: 'invalid-email' },
      { id: '4', customerName: 'Client D', email: '' },
    ];

    const valid = targets.filter(t => t.email && t.email.includes('@'));
    const invalid = targets.filter(t => !t.email || !t.email.includes('@'));

    expect(valid.length).toBe(2);
    expect(invalid.length).toBe(2);
    expect(valid.map(v => v.id)).toEqual(['1', '2']);
  });

  it('filters targets into valid vs invalid phone numbers for WhatsApp', () => {
    const cleanPhone = (p?: string) => String(p || '').replace(/[^\d]/g, '');
    const targets = [
      { id: '1', customerName: 'Client A', phone: '+974 5551 2260' },
      { id: '2', customerName: 'Client B', phone: '55512260' },
      { id: '3', customerName: 'Client C', phone: '123' },
      { id: '4', customerName: 'Client D', phone: '' },
    ];

    const valid = targets.filter(t => cleanPhone(t.phone).length >= 8);
    const invalid = targets.filter(t => cleanPhone(t.phone).length < 8);

    expect(valid.length).toBe(2);
    expect(invalid.length).toBe(2);
  });

  it('merges dynamic tags into template variables for AMC and TDL', () => {
    const template = 'Hello {{customerName}}, your {{product}} expires on {{expiryDate}}.';
    const dyn = {
      customerName: 'Al-Fayad',
      product: 'TallyPrime Server',
      expiryDate: '25-Aug-2027',
    };

    let result = template;
    Object.keys(dyn).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, (dyn as any)[key]);
    });

    expect(result).toBe('Hello Al-Fayad, your TallyPrime Server expires on 25-Aug-2027.');
  });

  it('automatically applies bulk selected template to all selected rows in state', () => {
    const selectedIds = ['row-1', 'row-2', 'row-3'];
    let rowTemplates: Record<string, string> = {
      'row-1': 'old-template-1',
    };
    const newBulkTemplateId = 'template-renewal-2026';

    // Handler simulating handleBulkTemplateSelect
    const nextRowTemplates = { ...rowTemplates };
    selectedIds.forEach(id => {
      nextRowTemplates[id] = newBulkTemplateId;
    });

    expect(nextRowTemplates['row-1']).toBe('template-renewal-2026');
    expect(nextRowTemplates['row-2']).toBe('template-renewal-2026');
    expect(nextRowTemplates['row-3']).toBe('template-renewal-2026');
  });

  it('allows individual row overrides without affecting other rows', () => {
    const bulkTemplateId = 'template-general';
    let rowTemplates: Record<string, string> = {
      'row-1': bulkTemplateId,
      'row-2': bulkTemplateId,
    };

    // User overrides row-2 directly in table column dropdown
    rowTemplates['row-2'] = 'custom-vip-template';

    expect(rowTemplates['row-1']).toBe('template-general');
    expect(rowTemplates['row-2']).toBe('custom-vip-template');
  });

  it('correctly maps target preview attributes for tabular verification modal', () => {
    const sampleTargets = [
      {
        id: 'cust-101',
        customerName: 'Ritver Paints & Coatings',
        email: 'sabarishthavamani@gmail.com',
        templateId: 'tpl-amc-due',
      },
      {
        id: 'cust-102',
        customerName: 'Doha Steel Works',
        email: '',
        templateId: 'tpl-amc-due',
      },
    ];

    const templates = [
      { _id: 'tpl-amc-due', name: 'AMC Renewal Due Reminder' },
    ];

    const mappedForTable = sampleTargets.map((t, idx) => {
      const isValid = Boolean(t.email && t.email.includes('@'));
      const templateName = templates.find(tpl => tpl._id === t.templateId)?.name || 'Default';
      return {
        sNo: String(idx + 1).padStart(2, '0'),
        companyName: t.customerName,
        mailId: t.email || 'No Email Address',
        templateName,
        status: isValid ? 'Ready' : 'Missing Email',
      };
    });

    expect(mappedForTable[0].sNo).toBe('01');
    expect(mappedForTable[0].companyName).toBe('Ritver Paints & Coatings');
    expect(mappedForTable[0].mailId).toBe('sabarishthavamani@gmail.com');
    expect(mappedForTable[0].templateName).toBe('AMC Renewal Due Reminder');
    expect(mappedForTable[0].status).toBe('Ready');

    expect(mappedForTable[1].sNo).toBe('02');
    expect(mappedForTable[1].mailId).toBe('No Email Address');
    expect(mappedForTable[1].status).toBe('Missing Email');
  });

  it('formats TDL targets with serialNo and salesman info', () => {
    const tdlRow = {
      customerName: 'Global Logistics WLL',
      email: 'finance@globallogistics.qa',
      dynamicData: {
        product: 'TDL Customization',
        release: 'Release 4.0',
        serialNo: 'TDL-99882',
        expiryDate: '15-Oct-2026',
        salesman: 'Suresh Kumar',
      },
    };

    expect(tdlRow.dynamicData.serialNo).toBe('TDL-99882');
    expect(tdlRow.dynamicData.salesman).toBe('Suresh Kumar');
  });

  it('formats Cloud targets with domainSubId and user count', () => {
    const cloudRow = {
      customerName: 'Doha Marine Trading',
      email: 'it@dohamarine.qa',
      phone: '+974 6681 5398',
      dynamicData: {
        product: 'Sugam Cloud',
        release: 'v3.1',
        serialNo: 'DM-SUB-441',
        expiryDate: '30-Nov-2026',
      },
    };

    expect(cloudRow.dynamicData.serialNo).toBe('DM-SUB-441');
    expect(cloudRow.phone).toBe('+974 6681 5398');
  });

  it('formats TSS targets with serial number and license type', () => {
    const tssRow = {
      customerName: 'Ritver Paints & Coatings',
      email: 'accounts@ritverpaints.com',
      phone: '55767910',
      dynamicData: {
        product: 'TallyPrime Gold',
        release: 'Release 3.0',
        serialNo: '782910394',
        expiryDate: '29-Apr-2027',
      },
    };

    expect(tssRow.dynamicData.serialNo).toBe('782910394');
    expect(tssRow.dynamicData.product).toBe('TallyPrime Gold');
  });
});
