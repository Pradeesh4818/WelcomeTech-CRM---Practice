import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Custom Select Dropdown Scrolling & Smooth Navigation Verification', () => {
  const uiIndexPath = path.resolve(__dirname, '../index.tsx');
  const indexCssPath = path.resolve(__dirname, '../../../index.css');

  const uiCode = fs.readFileSync(uiIndexPath, 'utf8');
  const cssCode = fs.readFileSync(indexCssPath, 'utf8');

  it('TC-SELECT-SCROLL-01: Select ignores scroll events that originate inside menuRef to prevent scroll fighting and re-renders', () => {
    expect(uiCode).toMatch(/const\s+target\s*=\s*e\.target;\s*if\s*\(target\s*===\s*menuRef\.current\s*\|\|\s*\(target\s+instanceof\s+Node\s*&&\s*menuRef\.current\?\.contains\(target\)\)\)\s*\{\s*return;\s*\}/);
  });

  it('TC-SELECT-SCROLL-02: Select uses isKeyboardNavRef so scrollIntoView only triggers during arrow key navigation', () => {
    expect(uiCode).toContain('const isKeyboardNavRef = useRef(false);');
    expect(uiCode).toContain('isKeyboardNavRef.current = true;');
    expect(uiCode).toMatch(/if\s*\(!isKeyboardNavRef\.current\)\s*return;/);
  });

  it('TC-SELECT-SCROLL-03: onMouseEnter resets isKeyboardNavRef so hovering does not trigger scrollIntoView', () => {
    expect(uiCode).toMatch(/onMouseEnter=\{[\s\S]*?isKeyboardNavRef\.current\s*=\s*false/);
  });

  it('TC-SELECT-SCROLL-04: Select menu stops wheel event propagation so dropdown scrolling does not leak to parent page', () => {
    expect(uiCode).toMatch(/onWheel=\{\(e\)\s*=>\s*\{\s*\/\/[^\n]*\s*e\.stopPropagation\(\);\s*\}\}/);
  });

  it('TC-SELECT-SCROLL-05: updatePosition enforces inline overflowY: auto and overflowX: hidden', () => {
    expect(uiCode).toContain("overflowY: 'auto'");
    expect(uiCode).toContain("overflowX: 'hidden'");
  });

  it('TC-SELECT-SCROLL-06: .wt-select-menu CSS includes overscroll-behavior: contain, touch momentum, and visible scrollbars', () => {
    expect(cssCode).toMatch(/\.wt-select-menu\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/);
    expect(cssCode).toMatch(/\.wt-select-menu\s*\{[\s\S]*?overscroll-behavior:\s*contain/);
    expect(cssCode).toMatch(/\.wt-select-menu\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
    expect(cssCode).toMatch(/\.wt-select-menu::-webkit-scrollbar/);
    expect(cssCode).toMatch(/\.wt-select-menu::-webkit-scrollbar-thumb/);
  });

  it('TC-SELECT-SCROLL-07: .wt-select-option does not have content-visibility: auto which breaks scroll container height calculation', () => {
    const optionMatch = cssCode.match(/\.wt-select-option\s*\{([^}]+)\}/);
    expect(optionMatch).not.toBeNull();
    expect(optionMatch![1]).not.toContain('content-visibility: auto');
  });
});

