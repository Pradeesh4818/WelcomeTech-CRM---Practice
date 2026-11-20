import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Avatar Roundness & Responsive Sizing Audit', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const uiPath = path.resolve(__dirname, '../index.tsx');
  const uiContent = fs.readFileSync(uiPath, 'utf8');

  it('ensures Avatar component code enforces 50% border radius and 1:1 aspect ratio', () => {
    expect(uiContent).toContain("borderRadius: '50%'");
    expect(uiContent).toContain("aspectRatio: '1 / 1'");
    expect(uiContent).toContain("flexShrink: 0");
    expect(uiContent).toContain('minWidth: sizePx');
    expect(uiContent).toContain('minHeight: sizePx');
  });

  it('ensures Avatar image inside component enforces 50% border radius and object-fit cover', () => {
    expect(uiContent).toContain("borderRadius: '50%'");
    expect(uiContent).toContain("objectFit: 'cover'");
  });

  it('contains root .avatar CSS class with perfect circle rules and anti-distortion properties', () => {
    expect(cssContent).toContain('.avatar {');
    expect(cssContent).toContain('border-radius: 50% !important;');
    expect(cssContent).toContain('aspect-ratio: 1 / 1 !important;');
    expect(cssContent).toContain('flex-shrink: 0 !important;');
    expect(cssContent).toContain('overflow: hidden !important;');
  });

  it('defines equal width/height for avatar sizes (sm, md, lg, xl)', () => {
    expect(cssContent).toContain('.avatar-sm {');
    expect(cssContent).toContain('width: 28px !important;');
    expect(cssContent).toContain('height: 28px !important;');

    expect(cssContent).toContain('.avatar-md {');
    expect(cssContent).toContain('width: 34px !important;');
    expect(cssContent).toContain('height: 34px !important;');

    expect(cssContent).toContain('.avatar-lg {');
    expect(cssContent).toContain('width: 44px !important;');
    expect(cssContent).toContain('height: 44px !important;');

    expect(cssContent).toContain('.avatar-xl {');
    expect(cssContent).toContain('width: 84px !important;');
    expect(cssContent).toContain('height: 84px !important;');
  });

  it('ensures avatar img elements inside .avatar are clipped to 50% border radius', () => {
    expect(cssContent).toContain('.avatar img {');
    expect(cssContent).toContain('object-fit: cover !important;');
    expect(cssContent).toContain('border-radius: 50% !important;');
    expect(cssContent).toContain('aspect-ratio: 1 / 1 !important;');
  });

  it('protects customer identity card and mobile list avatars from squishing or stretching', () => {
    expect(cssContent).toContain('.customer-modal-identity-card .avatar');
    expect(cssContent).toContain('.customer-record-identity .avatar');
  });
});
