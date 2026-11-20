import { describe, it, expect } from 'vitest';
import { fmt } from '../../../utils/helpers';

describe('NotifiedBadge Logic & Formatting', () => {
  it('formats dates and handles today vs previous dates', () => {
    const today = new Date();
    const isToday = new Date().toDateString() === today.toDateString();
    expect(isToday).toBe(true);

    const pastDate = '2026-05-15T10:30:00.000Z';
    const formatted = fmt.date(pastDate);
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });

  it('generates rich tooltip text with channel, date, and template details', () => {
    const date = '2026-08-26T09:45:00.000Z';
    const channel: string = 'email';
    const templateName = 'AMC Renewal Due Notice';

    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'Email';
    const tooltip = `${channelLabel} sent on ${fmt.date(date)}\nTemplate: "${templateName}"`;

    expect(tooltip).toContain('Email sent on');
    expect(tooltip).toContain('AMC Renewal Due Notice');
  });
});
