import { describe, it, expect } from 'vitest';
import { cleanErrorMessage } from '../api';

describe('Global Error Message Sanitizer', () => {
  it('converts raw Mongoose Customer validation error into clean human sentence', () => {
    const raw = "Customer validation failed: contact: Path `contact` is required., phone: Path `phone` is required.";
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('Please fill in the required fields: Contact Person Name, Phone Number.');
  });

  it('converts single field missing error into clean message', () => {
    const raw = "Lead validation failed: name: Path `name` is required.";
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('Please fill in the required field: Company / Customer Name.');
  });

  it('converts MongoDB duplicate key error (E11000) into friendly message', () => {
    const raw = 'E11000 duplicate key error collection: WelcomeTech_CRM.customers index: email_1 dup key: { email: "test@welcometech.qa" }';
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('A record with this Email Address already exists. Please use a unique value.');
  });

  it('converts Cast to ObjectId error into clean message', () => {
    const raw = 'Cast to ObjectId failed for value "1234" at path "_id" for model "Customer"';
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('The requested record was not found or has an invalid reference.');
  });

  it('converts Network Error into clear offline/connection message', () => {
    const raw = 'Network Error';
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('Unable to connect to the server. Please check your internet connection.');
  });

  it('masks code errors and stack trace strings', () => {
    const raw = "TypeError: Cannot read properties of undefined (reading 'customerName')";
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toBe('A server processing error occurred. Please refresh the page and try again.');
  });

  it('converts Brevo SMTP 525 Unauthorized IP error into actionable instructions', () => {
    const raw = 'Invalid login: 525 5.7.1 Unauthorized IP address';
    const cleaned = cleanErrorMessage(raw);
    expect(cleaned).toContain('SMTP Error (525 Unauthorized IP)');
    expect(cleaned).toContain('Authorized IPs');
  });
});

