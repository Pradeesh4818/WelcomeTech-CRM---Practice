/**
 * Converts numbers into words in the selected country's official / mother tongue:
 * - Arabic (العربية): Qatar (QA), UAE (AE), Saudi Arabia (SA), Oman (OM), Kuwait (KW), Bahrain (BH)
 * - Hindi (हिन्दी): India (IN)
 * - English: USA (US), UK (GB) and default fallback.
 */

// ==========================================
// 1. ARABIC TAFQEET (Tafqeet logic for Arabic countries)
// ==========================================

const AR_ONES: Record<number, string> = {
  0: 'صفر',
  1: 'واحد',
  2: 'اثنان',
  3: 'ثلاثة',
  4: 'أربعة',
  5: 'خمسة',
  6: 'ستة',
  7: 'سبعة',
  8: 'ثمانية',
  9: 'تسعة',
  10: 'عشرة',
  11: 'أحد عشر',
  12: 'اثنا عشر',
  13: 'ثلاثة عشر',
  14: 'أربعة عشر',
  15: 'خمسة عشر',
  16: 'ستة عشر',
  17: 'سبعة عشر',
  18: 'ثمانية عشر',
  19: 'تسعة عشر',
};

const AR_TENS: Record<number, string> = {
  2: 'عشرون',
  3: 'ثلاثون',
  4: 'أربعون',
  5: 'خمسون',
  6: 'ستون',
  7: 'سبعون',
  8: 'ثمانون',
  9: 'تسعون',
};

const AR_HUNDREDS: Record<number, string> = {
  1: 'مائة',
  2: 'مئتان',
  3: 'ثلاثمائة',
  4: 'أربعمائة',
  5: 'خمسمائة',
  6: 'ستمائة',
  7: 'سبعمائة',
  8: 'ثمانمائة',
  9: 'تسعمائة',
};

function arabicBelowThousand(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const h = Math.floor(n / 100);
  const rem = n % 100;

  if (h > 0) {
    parts.push(AR_HUNDREDS[h]);
  }

  if (rem > 0) {
    if (rem <= 19) {
      parts.push(AR_ONES[rem]);
    } else {
      const o = rem % 10;
      const t = Math.floor(rem / 10);
      if (o > 0) {
        parts.push(`${AR_ONES[o]} و${AR_TENS[t]}`);
      } else {
        parts.push(AR_TENS[t]);
      }
    }
  }

  return parts.join(' و');
}

function arabicNumberToWords(n: number): string {
  if (n === 0) return 'صفر';
  let num = Math.floor(Math.abs(n));
  const parts: string[] = [];

  const billions = Math.floor(num / 1000000000);
  num %= 1000000000;
  const millions = Math.floor(num / 1000000);
  num %= 1000000;
  const thousands = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(`${arabicBelowThousand(billions)} مليارات`);
    else parts.push(`${arabicBelowThousand(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(`${arabicBelowThousand(millions)} ملايين`);
    else parts.push(`${arabicBelowThousand(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${arabicBelowThousand(thousands)} آلاف`);
    else parts.push(`${arabicBelowThousand(thousands)} ألف`);
  }

  if (remainder > 0) {
    parts.push(arabicBelowThousand(remainder));
  }

  return parts.join(' و');
}

interface ArabicCurrencyConfig {
  majorUnit: string; // e.g. ريال قطري
  majorPlural: string; // ريالات قطرية
  minorUnit: string; // درهم
  minorPlural: string; // دراهم
  decimalPlaces: number;
}

const ARABIC_CURRENCIES: Record<string, ArabicCurrencyConfig> = {
  QA: {
    majorUnit: 'ريال قطري',
    majorPlural: 'ريالاً قطرياً',
    minorUnit: 'درهم',
    minorPlural: 'درهماً',
    decimalPlaces: 2,
  },
  AE: {
    majorUnit: 'درهم إماراتي',
    majorPlural: 'درهماً إماراتياً',
    minorUnit: 'فلس',
    minorPlural: 'فلساً',
    decimalPlaces: 2,
  },
  SA: {
    majorUnit: 'ريال سعودي',
    majorPlural: 'ريالاً سعودياً',
    minorUnit: 'هللة',
    minorPlural: 'هللة',
    decimalPlaces: 2,
  },
  OM: {
    majorUnit: 'ريال عماني',
    majorPlural: 'ريالاً عمانياً',
    minorUnit: 'بيسة',
    minorPlural: 'بيسة',
    decimalPlaces: 3,
  },
  KW: {
    majorUnit: 'دينار كويتي',
    majorPlural: 'ديناراً كويتياً',
    minorUnit: 'فلس',
    minorPlural: 'فلساً',
    decimalPlaces: 3,
  },
  BH: {
    majorUnit: 'دينار بحريني',
    majorPlural: 'ديناراً بحرينياً',
    minorUnit: 'فلس',
    minorPlural: 'فلساً',
    decimalPlaces: 3,
  },
};

function formatArabicCurrency(amount: number, countryCode: string): string {
  const cfg = ARABIC_CURRENCIES[countryCode] || ARABIC_CURRENCIES['QA'];
  const whole = Math.floor(amount);
  const factor = Math.pow(10, cfg.decimalPlaces);
  const fraction = Math.round((amount - whole) * factor);

  let text = '';
  if (whole > 0) {
    const wholeWords = arabicNumberToWords(whole);
    const unit = whole === 1 || whole === 2 ? cfg.majorUnit : cfg.majorPlural;
    text += `${wholeWords} ${unit}`;
  }

  if (fraction > 0) {
    const fracWords = arabicNumberToWords(fraction);
    const mUnit = fraction === 1 ? cfg.minorUnit : cfg.minorPlural;
    if (text) {
      text += ` و${fracWords} ${mUnit}`;
    } else {
      text = `${fracWords} ${mUnit}`;
    }
  }

  if (!text) {
    text = `صفر ${cfg.majorUnit}`;
  }

  return `فقط ${text} لا غير`;
}

// ==========================================
// 2. HINDI (हिन्दी) FOR INDIA (IN)
// ==========================================

const HI_NUMS: Record<number, string> = {
  0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पांच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ',
  10: 'दस', 11: 'ग्यारह', 12: 'बारह', 13: 'तेरह', 14: 'चौदह', 15: 'पंद्रह', 16: 'सोलह', 17: 'सत्रह', 18: 'अठारह', 19: 'उन्नीस',
  20: 'बीस', 21: 'इक्कीस', 22: 'बाईस', 23: 'तेईस', 24: 'चौबीस', 25: 'पच्चीस', 26: 'छब्बीस', 27: 'सत्ताईस', 28: 'अट्ठाईस', 29: 'उनतीस',
  30: 'तीस', 31: 'इकतीस', 32: 'बत्तीस', 33: 'तैंतीस', 34: 'चौंतीस', 35: 'पैंतीस', 36: 'छत्तीस', 37: 'सैंतीस', 38: 'अड़तीस', 39: 'उनतालीस',
  40: 'चालीस', 41: 'इकतालीस', 42: 'बयालीस', 43: 'तैंतालीस', 44: 'चवालीस', 45: 'पैंतालीस', 46: 'छियालीस', 47: 'सैंतालीस', 48: 'अड़तालीस', 49: 'उनचास',
  50: 'पचास', 51: 'इक्यावन', 52: 'बावन', 53: 'तिरपन', 54: 'चौवन', 55: 'पचपन', 56: 'छप्पन', 57: 'सत्तावन', 58: 'अट्ठारह', 59: 'उनसठ',
  60: 'साठ', 61: 'इकसठ', 62: 'बासठ', 63: 'तिरसठ', 64: 'चौंसठ', 65: 'पैंसठ', 66: 'छियासठ', 67: 'सरसठ', 68: 'अड़सठ', 69: 'उनहत्तर',
  70: 'सत्तर', 71: 'इकहत्तर', 72: 'बहत्तर', 73: 'तिहत्तर', 74: 'चौहत्तर', 75: 'पचहत्तर', 76: 'छिहत्तर', 77: 'सतहत्तर', 78: 'अठहत्तर', 79: 'उनासी',
  80: 'अस्सी', 81: 'इक्यासी', 82: 'बयासी', 83: 'तिरासी', 84: 'चौरासी', 85: 'पचासी', 86: 'छियासी', 87: 'सत्तासी', 88: 'अट्ठासी', 89: 'नवासी',
  90: 'नब्बे', 91: 'इक्यानवे', 92: 'बानवे', 93: 'तिरानवे', 94: 'चौरानवे', 95: 'पंचानवे', 96: 'छियानवे', 97: 'सत्तानवे', 98: 'अट्ठानवे', 99: 'निन्यानवे'
};

function hindiBelowThousand(n: number): string {
  let str = '';
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) {
    str += `${HI_NUMS[h]} सौ `;
  }
  if (rem > 0) {
    str += HI_NUMS[rem] || '';
  }
  return str.trim();
}

function hindiNumberToWords(num: number): string {
  if (num === 0) return 'शून्य';
  let n = Math.floor(Math.abs(num));
  let result = '';

  const crores = Math.floor(n / 10000000);
  n %= 10000000;
  const lakhs = Math.floor(n / 100000);
  n %= 100000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const remainder = n;

  if (crores > 0) {
    result += (HI_NUMS[crores] || hindiBelowThousand(crores)) + ' करोड़ ';
  }
  if (lakhs > 0) {
    result += (HI_NUMS[lakhs] || hindiBelowThousand(lakhs)) + ' लाख ';
  }
  if (thousands > 0) {
    result += (HI_NUMS[thousands] || hindiBelowThousand(thousands)) + ' हज़ार ';
  }
  if (remainder > 0) {
    result += hindiBelowThousand(remainder);
  }

  return result.trim();
}

function formatHindiCurrency(amount: number): string {
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);

  let text = '';
  if (whole > 0) {
    text = `${hindiNumberToWords(whole)} रुपये`;
  }
  if (fraction > 0) {
    const fracWords = HI_NUMS[fraction] || String(fraction);
    if (text) {
      text += ` और ${fracWords} पैसे`;
    } else {
      text = `${fracWords} पैसे`;
    }
  }
  if (!text) {
    text = 'शून्य रुपये';
  }
  return `मात्र ${text}`;
}

// ==========================================
// 3. ENGLISH (US, UK, and Fallback)
// ==========================================

const EN_ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const EN_TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function enBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += EN_ONES[Math.floor(n / 100)] + ' Hundred';
    n %= 100;
    if (n > 0) str += ' and ';
  }
  if (n >= 20) {
    str += EN_TENS[Math.floor(n / 10)];
    if (n % 10 > 0) str += '-' + EN_ONES[n % 10];
  } else if (n > 0) {
    str += EN_ONES[n];
  }
  return str.trim();
}

function enNumberToWords(num: number): string {
  if (num === 0) return 'Zero';
  let n = Math.floor(Math.abs(num));
  let result = '';

  const billions = Math.floor(n / 1000000000);
  n %= 1000000000;
  const millions = Math.floor(n / 1000000);
  n %= 1000000;
  const thousands = Math.floor(n / 1000);
  n %= 1000;
  const remainder = n;

  if (billions > 0) result += enBelowThousand(billions) + ' Billion ';
  if (millions > 0) result += enBelowThousand(millions) + ' Million ';
  if (thousands > 0) result += enBelowThousand(thousands) + ' Thousand ';
  if (remainder > 0) result += enBelowThousand(remainder);

  return result.trim();
}

const ENGLISH_CURRENCIES: Record<string, { majorSingle: string; majorPlural: string; minorSingle: string; minorPlural: string; decimals?: number }> = {
  QA: { majorSingle: 'Qatari Riyal', majorPlural: 'Qatari Riyals', minorSingle: 'Dirham', minorPlural: 'Dirhams', decimals: 2 },
  AE: { majorSingle: 'UAE Dirham', majorPlural: 'UAE Dirhams', minorSingle: 'Fils', minorPlural: 'Fils', decimals: 2 },
  SA: { majorSingle: 'Saudi Riyal', majorPlural: 'Saudi Riyals', minorSingle: 'Halala', minorPlural: 'Halalas', decimals: 2 },
  OM: { majorSingle: 'Omani Rial', majorPlural: 'Omani Rials', minorSingle: 'Baisa', minorPlural: 'Baisas', decimals: 3 },
  KW: { majorSingle: 'Kuwaiti Dinar', majorPlural: 'Kuwaiti Dinars', minorSingle: 'Fils', minorPlural: 'Fils', decimals: 3 },
  BH: { majorSingle: 'Bahraini Dinar', majorPlural: 'Bahraini Dinars', minorSingle: 'Fils', minorPlural: 'Fils', decimals: 3 },
  IN: { majorSingle: 'Indian Rupee', majorPlural: 'Indian Rupees', minorSingle: 'Paise', minorPlural: 'Paise', decimals: 2 },
  US: { majorSingle: 'US Dollar', majorPlural: 'US Dollars', minorSingle: 'Cent', minorPlural: 'Cents', decimals: 2 },
  GB: { majorSingle: 'Pound Sterling', majorPlural: 'Pounds Sterling', minorSingle: 'Penny', minorPlural: 'Pence', decimals: 2 },
};

function formatEnglishCurrency(amount: number, countryCode: string): string {
  const code = (countryCode || 'QA').toUpperCase();
  const config = ENGLISH_CURRENCIES[code] || ENGLISH_CURRENCIES.QA;
  const decimals = config.decimals || 2;
  const multiplier = Math.pow(10, decimals);

  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * multiplier);

  let result = '';
  if (whole > 0) {
    const wholeWords = enNumberToWords(whole);
    const majorUnit = whole === 1 ? config.majorSingle : config.majorPlural;
    result = `${wholeWords} ${majorUnit}`;
  }

  if (fraction > 0) {
    const fractionWords = enNumberToWords(fraction);
    const minorUnit = fraction === 1 ? config.minorSingle : config.minorPlural;
    if (result) {
      result += ` and ${fractionWords} ${minorUnit}`;
    } else {
      result = `${fractionWords} ${minorUnit}`;
    }
  }

  if (!result) {
    result = `Zero ${config.majorPlural}`;
  }

  return `${result} Only`;
}

// ==========================================
// 4. MAIN DISPATCHER: ENGLISH INVOICE CURRENCY
// ==========================================

export const amountToWords = (
  amount: number | string | undefined | null,
  countryCode?: string
): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : (Number(amount) || 0);
  if (isNaN(num) || num < 0) return '';

  const country = (countryCode || (typeof localStorage !== 'undefined' ? localStorage.getItem('wt_country') : null) || 'QA').toUpperCase();
  return formatEnglishCurrency(num, country);
};
