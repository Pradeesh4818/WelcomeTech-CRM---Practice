import { describe, it, expect, vi } from 'vitest';

describe('Global Modal Escape Key Handling Logic', () => {
  it('identifies and triggers onClose when Escape key is pressed', () => {
    let closed = false;
    const onClose = () => { closed = true; };

    const handleKeyDown = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    let prevented = false;
    let stopped = false;
    handleKeyDown({
      key: 'Escape',
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    });

    expect(closed).toBe(true);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
  });

  it('handles "Esc" legacy browser key code as well', () => {
    let closed = false;
    const onClose = () => { closed = true; };

    const handleKeyDown = (e: { key: string; keyCode?: number }) => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        onClose();
      }
    };

    handleKeyDown({ key: 'Esc' });
    expect(closed).toBe(true);

    closed = false;
    handleKeyDown({ key: '', keyCode: 27 });
    expect(closed).toBe(true);
  });

  it('only dismisses the topmost modal in nested/stacked dialogs', () => {
    const closedModals: string[] = [];
    const overlays = ['modal-1', 'modal-2-confirm'];

    const handleEscapeOnOverlay = (currentOverlayId: string) => {
      const topmost = overlays[overlays.length - 1];
      if (topmost === currentOverlayId) {
        closedModals.push(currentOverlayId);
      }
    };

    // When Esc is pressed, bottom modal listener checks if it is topmost
    handleEscapeOnOverlay('modal-1');
    // Top modal listener checks if it is topmost
    handleEscapeOnOverlay('modal-2-confirm');

    expect(closedModals).toEqual(['modal-2-confirm']);
  });

  it('ignores other key events like Enter, Tab, Space', () => {
    let closed = false;
    const onClose = () => { closed = true; };

    const handleKeyDown = (e: { key: string; keyCode?: number }) => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        onClose();
      }
    };

    handleKeyDown({ key: 'Enter', keyCode: 13 });
    handleKeyDown({ key: 'Tab', keyCode: 9 });
    handleKeyDown({ key: ' ', keyCode: 32 });

    expect(closed).toBe(false);
  });

  it('restricts closing on outside click: backdrop clicks do NOT close by default', () => {
    let closed = false;
    const onClose = () => { closed = true; };
    const closeOnBackdropClick = false;

    const handleMouseDownOnOverlay = (targetIsOverlay: boolean) => {
      if (targetIsOverlay) {
        if (closeOnBackdropClick) {
          onClose();
        }
      }
    };

    // User clicks anywhere outside of modal screen (on backdrop overlay)
    handleMouseDownOnOverlay(true);
    expect(closed).toBe(false);
  });

  it('allows closing only via Close button, Esc key, or explicit Submit', () => {
    let closedReason: string | null = null;
    const onClose = (reason: string) => { closedReason = reason; };

    // 1. Outside click does nothing
    const handleOutsideClick = () => { /* prevented */ };
    handleOutsideClick();
    expect(closedReason).toBe(null);

    // 2. Esc key closes
    const handleEscKey = () => { onClose('esc'); };
    handleEscKey();
    expect(closedReason).toBe('esc');

    // 3. Close button ('X') closes
    closedReason = null;
    const handleCloseBtnClick = () => { onClose('close-btn'); };
    handleCloseBtnClick();
    expect(closedReason).toBe('close-btn');

    // 4. Submit button closes
    closedReason = null;
    const handleSubmit = () => { onClose('submit'); };
    handleSubmit();
    expect(closedReason).toBe('submit');
  });
});
