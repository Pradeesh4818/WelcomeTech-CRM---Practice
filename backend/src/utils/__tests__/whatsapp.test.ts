import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsAppPhone,
  normalizeGraphApiVersion,
  getWhatsAppMessageUrl,
  buildWhatsAppTextPayload,
  buildWhatsAppTemplatePayload,
  firstText,
  resolveCustomerWhatsappNumber,
} from '../whatsapp';

describe('normalizeWhatsAppPhone', () => {
  it('strips non-digit characters', () => {
    expect(normalizeWhatsAppPhone('+974 1234-5678')).toBe('97412345678');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(normalizeWhatsAppPhone('')).toBe('');
    expect(normalizeWhatsAppPhone(null)).toBe('');
    expect(normalizeWhatsAppPhone(undefined)).toBe('');
  });

  it('prepends the configured country dial code for a local-length number', () => {
    expect(normalizeWhatsAppPhone('12345678', 'QA')).toBe('97412345678'); // 8-digit QA local
    expect(normalizeWhatsAppPhone('9876543210', 'IN')).toBe('919876543210'); // 10-digit IN local
  });

  it('leaves numbers that already include a country code untouched', () => {
    expect(normalizeWhatsAppPhone('97412345678', 'QA')).toBe('97412345678');
  });

  it('collapses an accidentally duplicated multi-digit country code', () => {
    expect(normalizeWhatsAppPhone('974974123456')).toBe('974123456');
  });

  it('does NOT mangle a US number beginning with 1 (regression for the old dedup bug)', () => {
    expect(normalizeWhatsAppPhone('11234567890')).toBe('11234567890');
  });
});

describe('normalizeGraphApiVersion', () => {
  it('accepts valid versions', () => {
    expect(normalizeGraphApiVersion('v23.0')).toBe('v23.0');
    expect(normalizeGraphApiVersion('v19.0')).toBe('v19.0');
  });
  it('falls back to v23.0 for invalid/empty input', () => {
    expect(normalizeGraphApiVersion('garbage')).toBe('v23.0');
    expect(normalizeGraphApiVersion('')).toBe('v23.0');
    expect(normalizeGraphApiVersion(undefined)).toBe('v23.0');
  });
});

describe('getWhatsAppMessageUrl', () => {
  it('builds the Graph API messages URL', () => {
    expect(getWhatsAppMessageUrl('v23.0', 'PN123')).toBe(
      'https://graph.facebook.com/v23.0/PN123/messages'
    );
  });
  it('normalises a bad version in the URL', () => {
    expect(getWhatsAppMessageUrl('nope', 'PN123')).toBe(
      'https://graph.facebook.com/v23.0/PN123/messages'
    );
  });
});

describe('payload builders', () => {
  it('builds a text payload', () => {
    expect(buildWhatsAppTextPayload('974123', 'hi')).toEqual({
      messaging_product: 'whatsapp',
      to: '974123',
      type: 'text',
      text: { preview_url: false, body: 'hi' },
    });
  });

  it('builds a template payload without params for hello_world', () => {
    const p = buildWhatsAppTemplatePayload('974123', 'hello_world') as any;
    expect(p.type).toBe('template');
    expect(p.template.name).toBe('hello_world');
    expect(p.template.language.code).toBe('en_US');
    expect(p.template.components).toBeUndefined();
  });

  it('adds a body component for non hello_world templates', () => {
    const p = buildWhatsAppTemplatePayload('974123', 'my_template', 'ar') as any;
    expect(p.template.language.code).toBe('ar');
    expect(Array.isArray(p.template.components)).toBe(true);
  });

  it('adds a document header component when provided', () => {
    const p = buildWhatsAppTemplatePayload('974123', 'my_template', 'en_US', ['Acme'], {
      headerDocument: {
        link: 'https://example.com/notice.pdf',
        filename: 'notice.pdf',
      },
    }) as any;

    expect(p.template.components[0]).toEqual({
      type: 'header',
      parameters: [{
        type: 'document',
        document: {
          link: 'https://example.com/notice.pdf',
          filename: 'notice.pdf',
        },
      }],
    });
    expect(p.template.components[1].type).toBe('body');
  });
});

describe('firstText', () => {
  it('returns the first non-empty, non-dash value', () => {
    expect(firstText('', '—', '  ', 'hello')).toBe('hello');
    expect(firstText('—', '')).toBe('');
  });
});

describe('resolveCustomerWhatsappNumber', () => {
  it('prefers primary whatsapp, then falls back through mobile/phone', () => {
    expect(resolveCustomerWhatsappNumber({ primaryContactInfo: { whatsapp: '111' }, phone: '999' })).toBe('111');
    expect(resolveCustomerWhatsappNumber({ primaryContactInfo: { mobile: '222' }, phone: '999' })).toBe('222');
    expect(resolveCustomerWhatsappNumber({ phone: '999' })).toBe('999');
    expect(resolveCustomerWhatsappNumber({})).toBe('');
  });
});
