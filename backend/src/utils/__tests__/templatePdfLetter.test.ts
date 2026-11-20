import { describe, it, expect } from 'vitest';
import { templateBodyToHtml } from '../templatePdfGenerator';
import { buildProposalFullHtml } from '../htmlPdfGenerator';

describe('Email Template PDF – shared A4 format', () => {
  it('turns markdown-style bodies into rich HTML (headings, key/value + plain bullets, bold, salutation)', () => {
    const html = templateBodyToHtml(
      'Dear ,\n\n# Renewal\n\nYour **TallyPrime** plan expires soon.\n\n- Product: TallyPrime\n- Serial No: 123\n\n- Plain bullet\n\nThanks & Best Regards,\nWelcome'
    );
    expect(html).toContain('<p><strong>Dear Valued Customer,</strong></p>');
    expect(html).toContain('<h1>Renewal</h1>');
    expect(html).toContain('<strong>TallyPrime</strong>');
    expect(html).toContain('<li><strong>Product:</strong> TallyPrime</li>');
    expect(html).toContain('<li>Plain bullet</li>');
    expect(html).toContain('<strong>Thanks &amp; Best Regards,</strong>');
  });

  it('keeps rich HTML bodies from the editor as they are (minus scripts/styles)', () => {
    const html = templateBodyToHtml('<p>Hello</p><style>p{color:red}</style><script>x()</script><ul><li>One</li></ul>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('<li>One</li>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
  });

  it('renders in letter mode: same page chrome, but no quotation number or recipient/spec cards', () => {
    const data: any = {
      proposal: { title: 'Renewal', blocks: [{ id: 'b', type: 'text', title: '', content: '<p>Body</p>' }] },
      entity: {},
      settings: { brandColor: '#722580', companyName: 'Acme' },
      letter: { subject: 'Renewal Reminder' },
    };
    const html = buildProposalFullHtml(data);
    expect(html).toContain('data-role="page-content"');
    expect(html).toContain('<title>Renewal Reminder</title>');
    expect(html).not.toContain('Recipient Information');
    expect(html).not.toContain('Document Specifications');
    expect(html).not.toContain('>QUOTATION<');

    const quote = buildProposalFullHtml({ ...data, letter: undefined });
    expect(quote).toContain('Recipient Information');
  });
});
