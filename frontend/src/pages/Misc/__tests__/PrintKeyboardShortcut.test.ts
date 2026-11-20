import { describe, it, expect, vi } from 'vitest';
import {
  isPrintKeyboardShortcut,
  handlePrintKeyboardShortcut,
} from '../../../utils/documentStyles';

describe('Print Keyboard Shortcut (Ctrl+P / ⌘P)', () => {
  describe('isPrintKeyboardShortcut detector', () => {
    it('returns true on Ctrl + p', () => {
      expect(isPrintKeyboardShortcut({ key: 'p', ctrlKey: true })).toBe(true);
    });

    it('returns true on Cmd + p (Mac metaKey)', () => {
      expect(isPrintKeyboardShortcut({ key: 'p', metaKey: true })).toBe(true);
    });

    it('returns true case-insensitively for uppercase "P"', () => {
      expect(isPrintKeyboardShortcut({ key: 'P', ctrlKey: true })).toBe(true);
      expect(isPrintKeyboardShortcut({ key: 'P', metaKey: true })).toBe(true);
    });

    it('returns false when neither Ctrl nor Cmd is pressed', () => {
      expect(isPrintKeyboardShortcut({ key: 'p', ctrlKey: false, metaKey: false })).toBe(false);
      expect(isPrintKeyboardShortcut({ key: 'P' })).toBe(false);
    });

    it('returns false for other Ctrl key combinations like Ctrl+S or Ctrl+O', () => {
      expect(isPrintKeyboardShortcut({ key: 's', ctrlKey: true })).toBe(false);
      expect(isPrintKeyboardShortcut({ key: 'o', metaKey: true })).toBe(false);
    });

    it('handles undefined or null events safely', () => {
      expect(isPrintKeyboardShortcut({})).toBe(false);
      expect(isPrintKeyboardShortcut(null as any)).toBe(false);
    });
  });

  describe('handlePrintKeyboardShortcut execution', () => {
    it('calls print callback, prevents default browser print, and stops propagation on Ctrl+P', () => {
      const onPrint = vi.fn();
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();

      const handled = handlePrintKeyboardShortcut(
        {
          key: 'p',
          ctrlKey: true,
          preventDefault,
          stopPropagation,
        },
        onPrint
      );

      expect(handled).toBe(true);
      expect(onPrint).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
    });

    it('calls print callback and prevents default on Cmd+P (Mac)', () => {
      const onPrint = vi.fn();
      const preventDefault = vi.fn();

      const handled = handlePrintKeyboardShortcut(
        {
          key: 'p',
          metaKey: true,
          preventDefault,
        },
        onPrint
      );

      expect(handled).toBe(true);
      expect(onPrint).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('does not invoke callback or prevent default for unrelated keys', () => {
      const onPrint = vi.fn();
      const preventDefault = vi.fn();

      const handled = handlePrintKeyboardShortcut(
        {
          key: 'Enter',
          ctrlKey: false,
          preventDefault,
        },
        onPrint
      );

      expect(handled).toBe(false);
      expect(onPrint).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });
});
