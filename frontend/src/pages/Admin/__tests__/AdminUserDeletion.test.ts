import { describe, it, expect } from 'vitest';

export const evaluateAdminDeleteState = (
  targetAdmin: { _id: string; email?: string; name: string },
  currentUser: { _id: string; email?: string } | null
) => {
  const normalizedEmail = (targetAdmin.email || '').toLowerCase().trim();
  const isPrimaryAdmin =
    normalizedEmail === 'admin@welcometech.qa' || normalizedEmail === 'admin@welcomtech.qa';
  const isSelf = !!currentUser?._id && String(targetAdmin._id) === String(currentUser._id);
  const deleteDisabled = isPrimaryAdmin || isSelf;

  const deleteTooltip = isPrimaryAdmin
    ? 'Primary system administrator account cannot be deleted'
    : isSelf
      ? 'Cannot delete your own account'
      : 'Delete Admin';

  return {
    isPrimaryAdmin,
    isSelf,
    deleteDisabled,
    deleteTooltip,
  };
};

export const extractErrorMessage = (err: any, defaultFallback: string): string => {
  return err?.response?.data?.message || err?.message || defaultFallback;
};

describe('Admin Users Management - UI Deletion Safeguards & UX Logic', () => {
  const primaryAdminUser = {
    _id: 'admin-001',
    email: 'admin@welcometech.qa',
    name: 'Primary Admin',
  };

  const secondaryAdminUser = {
    _id: 'admin-002',
    email: 'ops.admin@welcometech.qa',
    name: 'Operations Admin',
  };

  const thirdAdminUser = {
    _id: 'admin-003',
    email: 'finance.admin@welcometech.qa',
    name: 'Finance Admin',
  };

  it('TC-FE-ADMIN-01: Disables delete button and assigns explanatory tooltip for primary admin', () => {
    const loggedInUser = { _id: 'admin-002', email: 'ops.admin@welcometech.qa' };
    const state = evaluateAdminDeleteState(primaryAdminUser, loggedInUser);

    expect(state.isPrimaryAdmin).toBe(true);
    expect(state.deleteDisabled).toBe(true);
    expect(state.deleteTooltip).toBe('Primary system administrator account cannot be deleted');
  });

  it('TC-FE-ADMIN-02: Handles case-insensitive and whitespace-padded primary admin email', () => {
    const paddedAdmin = {
      _id: 'admin-001',
      email: '  ADMIN@WELCOMETECH.QA  ',
      name: 'Primary Admin',
    };
    const loggedInUser = { _id: 'admin-002', email: 'ops.admin@welcometech.qa' };
    const state = evaluateAdminDeleteState(paddedAdmin, loggedInUser);

    expect(state.isPrimaryAdmin).toBe(true);
    expect(state.deleteDisabled).toBe(true);
  });

  it('TC-FE-ADMIN-03: Disables delete button and assigns explanatory tooltip for currently logged in admin (self-deletion safeguard)', () => {
    const loggedInUser = { _id: 'admin-002', email: 'ops.admin@welcometech.qa' };
    const state = evaluateAdminDeleteState(secondaryAdminUser, loggedInUser);

    expect(state.isSelf).toBe(true);
    expect(state.isPrimaryAdmin).toBe(false);
    expect(state.deleteDisabled).toBe(true);
    expect(state.deleteTooltip).toBe('Cannot delete your own account');
  });

  it('TC-FE-ADMIN-04: Fully enables delete button for secondary admins when viewed by a different admin', () => {
    const loggedInUser = { _id: 'admin-001', email: 'admin@welcometech.qa' };
    const state = evaluateAdminDeleteState(secondaryAdminUser, loggedInUser);

    expect(state.isPrimaryAdmin).toBe(false);
    expect(state.isSelf).toBe(false);
    expect(state.deleteDisabled).toBe(false);
    expect(state.deleteTooltip).toBe('Delete Admin');
  });

  it('TC-FE-ADMIN-05: Enables secondary admin to delete another secondary admin', () => {
    const loggedInUser = { _id: 'admin-002', email: 'ops.admin@welcometech.qa' };
    const state = evaluateAdminDeleteState(thirdAdminUser, loggedInUser);

    expect(state.isPrimaryAdmin).toBe(false);
    expect(state.isSelf).toBe(false);
    expect(state.deleteDisabled).toBe(false);
    expect(state.deleteTooltip).toBe('Delete Admin');
  });

  it('TC-FE-ADMIN-06: Correctly extracts specific backend error message from HTTP response data', () => {
    const mockAxiosError = {
      response: {
        data: {
          success: false,
          message: 'Cannot delete the only remaining administrator account',
        },
      },
    };

    const message = extractErrorMessage(mockAxiosError, 'Failed to delete admin');
    expect(message).toBe('Cannot delete the only remaining administrator account');
  });

  it('TC-FE-ADMIN-07: Gracefully falls back to default error message when response data has no custom message', () => {
    const genericError = new Error('Network Error');
    const message = extractErrorMessage(genericError, 'Failed to delete admin');
    expect(message).toBe('Network Error');

    const emptyError = {};
    const fallbackMessage = extractErrorMessage(emptyError, 'Failed to delete admin');
    expect(fallbackMessage).toBe('Failed to delete admin');
  });
});
