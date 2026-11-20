import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toApiUrl, toAssetUrl } from '../helpers';

describe('toApiUrl and toAssetUrl Environment Routing', () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore env
    Object.assign(import.meta.env, originalEnv);
  });

  describe('toApiUrl', () => {
    it('returns empty string for empty inputs', () => {
      expect(toApiUrl('')).toBe('');
      expect(toApiUrl(null)).toBe('');
      expect(toApiUrl(undefined)).toBe('');
    });

    it('returns absolute URLs untouched', () => {
      expect(toApiUrl('https://example.com/doc.pdf')).toBe('https://example.com/doc.pdf');
      expect(toApiUrl('http://example.com/test')).toBe('http://example.com/test');
    });

    it('correctly constructs URL with custom VITE_API_BASE on staging', () => {
      import.meta.env.VITE_API_BASE = '/staging/api/v1';

      const url = toApiUrl('/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
      expect(url).toContain('/staging/api/v1/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
    });

    it('strips redundant /api/v1 if passed in and replaces with active VITE_API_BASE', () => {
      import.meta.env.VITE_API_BASE = '/staging/api/v1';

      const url = toApiUrl('/api/v1/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
      expect(url).toContain('/staging/api/v1/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
      expect(url).not.toContain('/api/v1/api/v1');
    });

    it('works with standard /api/v1 default', () => {
      import.meta.env.VITE_API_BASE = '/api/v1';

      const url = toApiUrl('/public/proposals/123/pdf?download=1');
      expect(url).toContain('/api/v1/public/proposals/123/pdf?download=1');
    });
  });

  describe('toAssetUrl with API route handling', () => {
    it('rewrites /api/v1 to active VITE_API_BASE on staging to prevent Proposal not found bug', () => {
      import.meta.env.VITE_API_BASE = '/staging/api/v1';

      const url = toAssetUrl('/api/v1/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
      expect(url).toContain('/staging/api/v1/public/proposals/6ad7281700e41f2c44847355/pdf?download=1');
    });

    it('handles normal static upload paths', () => {
      import.meta.env.VITE_API_BASE = '/api/v1';

      const url = toAssetUrl('/uploads/logo.png');
      expect(url).toContain('/api/v1/uploads/logo.png');
    });
  });
});
