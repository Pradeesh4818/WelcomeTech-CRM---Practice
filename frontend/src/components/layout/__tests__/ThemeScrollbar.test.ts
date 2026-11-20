import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Global & Tasks Kanban Theme-Aware Scrollbar Integration', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('defines theme-aware scrollbar tokens on :root and .dark', () => {
    expect(cssContent).toContain('--scrollbar-thumb');
    expect(cssContent).toContain('--scrollbar-thumb-hover');
    expect(cssContent).toContain('--scrollbar-track');
    
    // Dark mode token overrides
    const darkBlock = cssContent.match(/\.dark\s*\{[^}]*--scrollbar-thumb:[^}]*\}/);
    expect(darkBlock).not.toBeNull();
  });

  it('sets standard thin scrollbar with theme color on all elements', () => {
    expect(cssContent).toMatch(/html,\s*body,\s*#root,\s*\*\s*\{[^}]*scrollbar-width:\s*thin/);
    expect(cssContent).toMatch(/html,\s*body,\s*#root,\s*\*\s*\{[^}]*scrollbar-color:\s*var\(--scrollbar-thumb\)/);
  });

  it('configures webkit scrollbar with slim 6px dimension and rounded thumb', () => {
    const webkitRule = cssContent.match(/::-webkit-scrollbar,\s*\*::-webkit-scrollbar\s*\{([^}]+)\}/);
    expect(webkitRule).not.toBeNull();
    expect(webkitRule![1]).toContain('width: 6px');
    expect(webkitRule![1]).toContain('height: 6px');

    const thumbRule = cssContent.match(/::-webkit-scrollbar-thumb,\s*\*::-webkit-scrollbar-thumb\s*\{([^}]+)\}/);
    expect(thumbRule).not.toBeNull();
    expect(thumbRule![1]).toContain('border-radius: 999px');
    expect(thumbRule![1]).toContain('background: var(--scrollbar-thumb)');
  });

  it('defines dedicated theme scrollers for Tasks Kanban board and columns', () => {
    expect(cssContent).toContain('.employee-sidebar-list');
    expect(cssContent).toContain('.task-pipeline-column-body');
    expect(cssContent).toContain('.task-pipeline-board');

    // Check custom webkit styling for tasks scrollers
    expect(cssContent).toContain('.task-pipeline-column-body::-webkit-scrollbar');
    expect(cssContent).toContain('.task-pipeline-column-body::-webkit-scrollbar-thumb');
    expect(cssContent).toContain('.employee-sidebar-list::-webkit-scrollbar-thumb');
  });
});
