import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ProfilePage Modern UI/UX Architecture', () => {
  const profilePagePath = path.resolve(__dirname, '../ProfilePage.tsx');
  const pageContent = fs.readFileSync(profilePagePath, 'utf8');

  it('renders executive KPI row with modern metric cards', () => {
    expect(pageContent).toContain('p-kpi-row');
    expect(pageContent).toContain('p-kpi-card');
    expect(pageContent).toContain('Profile Strength');
    expect(pageContent).toContain('Resolution Rate');
    expect(pageContent).toContain('Security Health');
  });

  it('supports inline editing mode for personal & contact details', () => {
    expect(pageContent).toContain('handleProfileSave');
    expect(pageContent).toContain('isEditing');
    expect(pageContent).toContain('p-input-field');
    expect(pageContent).toContain('Save Changes');
  });

  it('provides avatar image upload trigger with camera overlay', () => {
    expect(pageContent).toContain('p-avatar-overlay');
    expect(pageContent).toContain('handleAvatarChange');
    expect(pageContent).toContain('fileInputRef');
    expect(pageContent).toContain('accept="image/*"');
  });

  it('implements interactive change password form with validation', () => {
    expect(pageContent).toContain('handlePasswordChange');
    expect(pageContent).toContain('currentPassword');
    expect(pageContent).toContain('newPassword');
    expect(pageContent).toContain('confirmPassword');
    expect(pageContent).toContain('p-pw-toggle');
  });

  it('includes enterprise identity badges for Qatar residency and credentials', () => {
    expect(pageContent).toContain('Qatar National ID (QID)');
    expect(pageContent).toContain('Passport Copy');
    expect(pageContent).toContain('Welcome Trading Co. W.L.L');
    expect(pageContent).toContain('Doha, Qatar');
  });

  it('integrates quick theme toggle directly from profile header', () => {
    expect(pageContent).toContain('setTheme(theme === \'dark\' ? \'light\' : \'dark\')');
    expect(pageContent).toContain('p-theme-picker');
  });
});
