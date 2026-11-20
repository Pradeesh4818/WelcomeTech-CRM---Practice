import { describe, it, expect } from 'vitest';
import { amountToWords } from '../amountToWords';

describe('amountToWords in English Only', () => {
  it('converts Qatar (QA) to English format', () => {
    expect(amountToWords(6210, 'QA')).toBe('Six Thousand Two Hundred and Ten Qatari Riyals Only');
    expect(amountToWords(6210.50, 'QA')).toBe('Six Thousand Two Hundred and Ten Qatari Riyals and Fifty Dirhams Only');
    expect(amountToWords(1, 'QA')).toBe('One Qatari Riyal Only');
  });

  it('converts Saudi Arabia (SA) to English format with Halalas', () => {
    expect(amountToWords(3200, 'SA')).toBe('Three Thousand Two Hundred Saudi Riyals Only');
    expect(amountToWords(50.25, 'SA')).toBe('Fifty Saudi Riyals and Twenty-Five Halalas Only');
  });

  it('converts UAE (AE) to English format with Dirhams and Fils', () => {
    expect(amountToWords(2500, 'AE')).toBe('Two Thousand Five Hundred UAE Dirhams Only');
    expect(amountToWords(100.50, 'AE')).toBe('One Hundred UAE Dirhams and Fifty Fils Only');
  });

  it('converts Oman (OM) to English format with 3-decimal Baisa', () => {
    expect(amountToWords(120.500, 'OM')).toBe('One Hundred and Twenty Omani Rials and Five Hundred Baisas Only');
  });

  it('converts Kuwait (KW) to English format with 3-decimal Fils', () => {
    expect(amountToWords(50.250, 'KW')).toBe('Fifty Kuwaiti Dinars and Two Hundred and Fifty Fils Only');
  });

  it('converts Bahrain (BH) to English format with 3-decimal Fils', () => {
    expect(amountToWords(75.125, 'BH')).toBe('Seventy-Five Bahraini Dinars and One Hundred and Twenty-Five Fils Only');
  });

  it('converts India (IN) to English format with Rupees and Paise', () => {
    expect(amountToWords(6210, 'IN')).toBe('Six Thousand Two Hundred and Ten Indian Rupees Only');
    expect(amountToWords(150000, 'IN')).toBe('One Hundred and Fifty Thousand Indian Rupees Only');
    expect(amountToWords(500.50, 'IN')).toBe('Five Hundred Indian Rupees and Fifty Paise Only');
  });

  it('converts USA (US) to English format', () => {
    expect(amountToWords(750, 'US')).toBe('Seven Hundred and Fifty US Dollars Only');
    expect(amountToWords(750.99, 'US')).toBe('Seven Hundred and Fifty US Dollars and Ninety-Nine Cents Only');
  });

  it('converts UK (GB) to English format', () => {
    expect(amountToWords(1200, 'GB')).toBe('One Thousand Two Hundred Pounds Sterling Only');
    expect(amountToWords(1200.50, 'GB')).toBe('One Thousand Two Hundred Pounds Sterling and Fifty Pence Only');
  });

  it('defaults to QA (Qatari Riyals) when country is not passed or empty', () => {
    expect(amountToWords(6210)).toBe('Six Thousand Two Hundred and Ten Qatari Riyals Only');
  });
});
