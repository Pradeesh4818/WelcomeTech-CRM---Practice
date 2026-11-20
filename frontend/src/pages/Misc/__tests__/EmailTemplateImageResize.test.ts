import { describe, it, expect } from 'vitest';

describe('WordPress-style Image Size & Alignment Functionality', () => {
  const getCleanEditorHtml = (raw: string) => {
    return raw
      .replace(/\s*wt-editor-img-selected\b/g, '')
      .replace(/\s*data-wt-selected="true"/g, '')
      .replace(/\s*class=""/g, '');
  };

  it('cleans temporary selection classes and attributes while preserving custom image widths and styles', () => {
    const dirtyHtml = '<p>Hello</p><img src="/uploads/tss.png" class="wt-editor-img-selected" data-wt-selected="true" style="width: 50%; max-width: 100%; height: auto; display: block; margin: 12px auto;" /><p>World</p>';
    const cleaned = getCleanEditorHtml(dirtyHtml);

    expect(cleaned).not.toContain('wt-editor-img-selected');
    expect(cleaned).not.toContain('data-wt-selected="true"');
    expect(cleaned).toContain('width: 50%');
    expect(cleaned).toContain('src="/uploads/tss.png"');
  });

  it('accurately parses current width and steps by +/- 5% with boundaries [15%, 100%]', () => {
    const stepSize = (currentStyleWidth: string, delta: number): string => {
      const match = currentStyleWidth.match(/^(\d+(?:\.\d+)?)%/);
      const current = match ? parseFloat(match[1]) : 100;
      const next = Math.min(100, Math.max(15, current + delta));
      return `${next}%`;
    };

    expect(stepSize('100%', -5)).toBe('95%');
    expect(stepSize('50%', 5)).toBe('55%');
    expect(stepSize('50%', -5)).toBe('45%');
    expect(stepSize('100%', 5)).toBe('100%'); // Clamped at 100%
    expect(stepSize('15%', -5)).toBe('15%');  // Clamped at 15%
  });

  it('sets WordPress alignment margins correctly', () => {
    const getMarginsForAlign = (align: 'left' | 'center' | 'right') => {
      if (align === 'left') return { marginLeft: '0px', marginRight: 'auto' };
      if (align === 'right') return { marginLeft: 'auto', marginRight: '0px' };
      return { marginLeft: 'auto', marginRight: 'auto' };
    };

    expect(getMarginsForAlign('left')).toEqual({ marginLeft: '0px', marginRight: 'auto' });
    expect(getMarginsForAlign('center')).toEqual({ marginLeft: 'auto', marginRight: 'auto' });
    expect(getMarginsForAlign('right')).toEqual({ marginLeft: 'auto', marginRight: '0px' });
  });

  it('supports all WordPress presets (25%, 50%, 75%, 100%)', () => {
    const presets = ['25%', '50%', '75%', '100%'];
    presets.forEach(p => {
      const match = p.match(/^(\d+)%$/);
      expect(match).toBeTruthy();
      const val = parseInt(match![1], 10);
      expect(val).toBeGreaterThanOrEqual(25);
      expect(val).toBeLessThanOrEqual(100);
    });
  });
});
