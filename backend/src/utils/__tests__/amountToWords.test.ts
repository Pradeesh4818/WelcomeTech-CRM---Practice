import { describe, it, expect } from 'vitest';
import { amountToWords } from '../amountToWords';

describe('Backend amountToWords in English Only', () => {
  it('converts Qatar (QA) to English format', () => {
    expect(amountToWords(6210, 'QA')).toBe('Six Thousand Two Hundred and Ten Qatari Riyals Only');
    expect(amountToWords(6210.50, 'QA')).toBe('Six Thousand Two Hundred and Ten Qatari Riyals and Fifty Dirhams Only');
  });

  it('converts India (IN) to English Rupees format', () => {
    expect(amountToWords(150000, 'IN')).toBe('One Hundred and Fifty Thousand Indian Rupees Only');
    expect(amountToWords(2500.50, 'IN')).toBe('Two Thousand Five Hundred Indian Rupees and Fifty Paise Only');
  });

  it('converts UAE (AE) to English format', () => {
    expect(amountToWords(1000.25, 'AE')).toBe('One Thousand UAE Dirhams and Twenty-Five Fils Only');
  });

  it('converts Saudi Arabia (SA) to English format', () => {
    expect(amountToWords(850.75, 'SA')).toBe('Eight Hundred and Fifty Saudi Riyals and Seventy-Five Halalas Only');
  });

  it('converts USA (US) to English format', () => {
    expect(amountToWords(750, 'US')).toBe('Seven Hundred and Fifty US Dollars Only');
  });

  it('converts UK (GB) to English format', () => {
    expect(amountToWords(1200, 'GB')).toBe('One Thousand Two Hundred Pounds Sterling Only');
  });

  it('defaults to QA (Qatari Riyals) in English when country is omitted', () => {
    expect(amountToWords(100)).toBe('One Hundred Qatari Riyals Only');
  });
});
