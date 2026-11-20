import { create } from 'zustand';
import { ThemeMode } from '../types';
import { APP_FONT_STACKS, AppFontKey, DEFAULT_APP_FONT, FontChoice, fontStackForChoice, isAppFontKey, isFontChoice } from '../utils/fonts';
import { CountryCode, DEFAULT_COUNTRY, isCountryCode } from '../utils/phoneRules';

interface ThemeState {
  theme: ThemeMode;
  brandColor: string;
  secondaryColor: string;
  sidebarColor: string;
  topbarColor: string;
  navbarColor: string;
  appFont: AppFontKey;
  headingFont: FontChoice;
  contentFont: FontChoice;
  headingFontName: string;
  headingFontUrl: string;
  contentFontName: string;
  contentFontUrl: string;
  country: CountryCode;
  companyName: string;
  logo: string;
  proposalWatermark: string;
  proposalNo: string;
  proposalIncludeDate: boolean;
  toggle: () => void;
  setTheme: (theme: ThemeMode) => void;
  setBrandColor: (color: string) => void;
  setSecondaryColor: (color: string) => void;
  setSidebarColor: (color: string) => void;
  setTopbarColor: (color: string) => void;
  setNavbarColor: (color: string) => void;
  setAppFont: (font: AppFontKey) => void;
  setTypography: (settings: Partial<Pick<ThemeState, 'headingFont' | 'contentFont' | 'headingFontName' | 'headingFontUrl' | 'contentFontName' | 'contentFontUrl'>>) => void;
  setCountry: (country: CountryCode) => void;
  setCompanyName: (name: string) => void;
  setLogo: (logo: string) => void;
  setProposalWatermark: (watermark: string) => void;
  setProposalSettings: (settings: { proposalNo?: string; proposalIncludeDate?: boolean }) => void;
}

const getLocal = (key: string): string | null => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return null;
};

const setLocal = (key: string, value: string) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {}
};

const removeLocal = (key: string) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {}
};

export const sanitizeLayoutColor = (color: string | null | undefined, mode: ThemeMode, type: 'sidebar' | 'topbar' | 'navbar'): string => {
  const isWhite = !color || color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#fff' || color === 'rgb(255, 255, 255)' || color.startsWith('#f');
  const isDarkNavy = color && (color.startsWith('rgba(10, 18, 34') || color.startsWith('rgba(11, 19, 37') || color.startsWith('rgba(11, 20, 37') || color === '#0b1020' || color === '#0d1424' || color === '#0b1426');
  const isLegacyBrown = color && (color.toLowerCase() === '#9a6851' || color.toLowerCase() === '#9c674a' || color.toLowerCase().startsWith('#9a68') || color.toLowerCase().startsWith('#9c67'));

  if (isLegacyBrown) {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(`wt_${type}_color`); } catch {}
    }
    return mode === 'dark' ? (type === 'navbar' ? 'rgba(11, 20, 37, 0.9)' : '#0b1426') : (type === 'sidebar' ? '#f8fafc' : '#ffffff');
  }

  if (mode === 'dark') {
    if (isWhite) {
      if (type === 'sidebar') return '#0b1426';
      if (type === 'topbar') return 'rgba(11, 20, 37, 0.88)';
      if (type === 'navbar') return 'rgba(11, 20, 37, 0.9)';
    }
    return color || '#0b1426';
  } else {
    if (isDarkNavy) {
      return type === 'sidebar' ? '#f8fafc' : '#ffffff';
    }
    if (type === 'sidebar' && (!color || isWhite)) {
      return '#f8fafc';
    }
    if (type === 'navbar' && (!color || isWhite)) {
      return '#ffffff';
    }
    return color || (type === 'sidebar' ? '#f8fafc' : '#ffffff');
  }
};

/**
 * Adapts brand colors for dark mode globally so that text, links, accents, and buttons
 * maintain optimal luminance and WCAG AA/AAA contrast on dark surfaces while preserving
 * the brand's exact hue personality. In light mode, the base brand color is preserved.
 */
export const sanitizeBrandColor = (color: string | null | undefined, mode: ThemeMode): string => {
  if (!color || color === 'undefined' || color === 'null') {
    return mode === 'dark' ? '#a78bfa' : '#6d28d9';
  }

  if (mode === 'light') {
    return color;
  }

  // Parse hex to RGB
  const hex = color.replace('#', '').trim();
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else {
    return '#a78bfa';
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return '#a78bfa';
  }

  // Convert to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // If already bright and clearly legible on dark backgrounds (L >= 0.65), keep it
  if (l >= 0.65) {
    return color;
  }

  // Boost lightness to ~71% and maintain vibrant saturation (~65-85%)
  const targetL = 0.71;
  const targetS = Math.min(0.9, Math.max(0.65, s * 1.15));

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const rNew = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const gNew = Math.round(hue2rgb(p, q, h) * 255);
  const bNew = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
};

const getInitialTheme = (): ThemeMode => {
  const localTheme = getLocal('wt_theme');
  if (localTheme === 'dark' || localTheme === 'light') return localTheme;
  try {
    const rawUser = getLocal('wt_user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.theme === 'dark' || parsed?.theme === 'light') return parsed.theme;
    }
  } catch {}
  return 'light';
};

const savedTheme = getInitialTheme();
const savedColor = getLocal('wt_brand_color') || (savedTheme === 'dark' ? '#a78bfa' : '#6d28d9');
const savedSecondaryColor = getLocal('wt_secondary_color') || (savedTheme === 'dark' ? '#c084fc' : '#a855f7');
const rawSidebar = getLocal('wt_sidebar_color');
const rawTopbar = getLocal('wt_topbar_color');
const rawNavbar = getLocal('wt_navbar_color');

const savedSidebarColor = sanitizeLayoutColor(rawSidebar, savedTheme, 'sidebar');
const savedTopbarColor = sanitizeLayoutColor(rawTopbar, savedTheme, 'topbar');
const savedNavbarColor = sanitizeLayoutColor(rawNavbar, savedTheme, 'navbar');
const savedFontRaw = getLocal('wt_app_font');
const savedFont: AppFontKey = isAppFontKey(savedFontRaw) ? savedFontRaw : DEFAULT_APP_FONT;
const savedHeadingFontRaw = getLocal('wt_heading_font');
const savedContentFontRaw = getLocal('wt_content_font');
const savedHeadingFont: FontChoice = isFontChoice(savedHeadingFontRaw) ? savedHeadingFontRaw : savedFont;
const savedContentFont: FontChoice = isFontChoice(savedContentFontRaw) ? savedContentFontRaw : savedFont;
const savedHeadingFontName = getLocal('wt_heading_font_name') || '';
const savedHeadingFontUrl = getLocal('wt_heading_font_url') || '';
const savedContentFontName = getLocal('wt_content_font_name') || '';
const savedContentFontUrl = getLocal('wt_content_font_url') || '';
const savedCountryRaw = getLocal('wt_country');
const savedCountry: CountryCode = isCountryCode(savedCountryRaw) ? savedCountryRaw : DEFAULT_COUNTRY;
const savedCompanyName = getLocal('wt_company_name') || 'WelcomeTech CRM';
const savedLogo = getLocal('wt_logo') || '';
const savedProposalWatermark = getLocal('wt_proposal_watermark') || '';
const savedProposalNo = getLocal('wt_proposal_no') || 'WT-Q1001';
const savedProposalIncludeDate = getLocal('wt_proposal_include_date') === 'true';

const applyCustomFontFace = (id: string, family: string, url: string) => {
  if (typeof document === 'undefined') return;
  const styleId = `wt-${id}-font-face`;
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!family || !url) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  const safeFamily = family.replace(/'/g, "\\'");
  style.textContent = `@font-face{font-family:'${safeFamily}';src:url('${url}') format('woff2'),url('${url}');font-weight:100 900;font-style:normal;font-display:swap;}`;
};

const persistOptional = (key: string, value?: string) => {
  if (value) setLocal(key, value);
  else removeLocal(key);
};

if (typeof document !== 'undefined') {
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');
  const effectiveBrand = sanitizeBrandColor(savedColor, savedTheme);
  const effectiveSecondary = sanitizeBrandColor(savedSecondaryColor, savedTheme);
  document.documentElement.style.setProperty('--brand', effectiveBrand);
  document.documentElement.style.setProperty('--brand-secondary', effectiveSecondary);
  document.documentElement.style.setProperty('--secondary', effectiveSecondary);
  document.documentElement.style.setProperty('--sidebar-bg', savedSidebarColor);
  document.documentElement.style.setProperty('--topbar-bg', savedTopbarColor);
  document.documentElement.style.setProperty('--navbar-bg', savedNavbarColor);
  applyCustomFontFace('heading', savedHeadingFontName, savedHeadingFontUrl);
  applyCustomFontFace('content', savedContentFontName, savedContentFontUrl);
  document.documentElement.style.setProperty('--font-sans', APP_FONT_STACKS[savedFont]);
  document.documentElement.style.setProperty('--font-heading', fontStackForChoice(savedHeadingFont, savedHeadingFontName));
  document.documentElement.style.setProperty('--font-content', fontStackForChoice(savedContentFont, savedContentFontName));
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: savedTheme,
  brandColor: savedColor,
  secondaryColor: savedSecondaryColor,
  sidebarColor: savedSidebarColor,
  topbarColor: savedTopbarColor,
  navbarColor: savedNavbarColor,
  appFont: savedFont,
  headingFont: savedHeadingFont,
  contentFont: savedContentFont,
  headingFontName: savedHeadingFontName,
  headingFontUrl: savedHeadingFontUrl,
  contentFontName: savedContentFontName,
  contentFontUrl: savedContentFontUrl,
  country: savedCountry,
  companyName: savedCompanyName,
  logo: savedLogo,
  proposalWatermark: savedProposalWatermark,
  proposalNo: savedProposalNo,
  proposalIncludeDate: savedProposalIncludeDate,
  toggle: () =>
    set((state) => {
      const next: ThemeMode = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('wt_theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');

      const nextBrand = sanitizeBrandColor(state.brandColor, next);
      const nextSecondary = sanitizeBrandColor(state.secondaryColor, next);
      document.documentElement.style.setProperty('--brand', nextBrand);
      document.documentElement.style.setProperty('--brand-secondary', nextSecondary);
      document.documentElement.style.setProperty('--secondary', nextSecondary);

      const color = sanitizeLayoutColor(localStorage.getItem('wt_sidebar_color') || undefined, next, 'sidebar');
      const topbar = sanitizeLayoutColor(localStorage.getItem('wt_topbar_color') || undefined, next, 'topbar');
      const navbar = sanitizeLayoutColor(localStorage.getItem('wt_navbar_color') || undefined, next, 'navbar');

      document.documentElement.style.setProperty('--sidebar-bg', color);
      document.documentElement.style.setProperty('--topbar-bg', topbar);
      document.documentElement.style.setProperty('--navbar-bg', navbar);

      return { theme: next, sidebarColor: color, topbarColor: topbar, navbarColor: navbar };
    }),
  setTheme: (theme) => {
    localStorage.setItem('wt_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');

    set((state) => {
      const nextBrand = sanitizeBrandColor(state.brandColor, theme);
      const nextSecondary = sanitizeBrandColor(state.secondaryColor, theme);
      document.documentElement.style.setProperty('--brand', nextBrand);
      document.documentElement.style.setProperty('--brand-secondary', nextSecondary);
      document.documentElement.style.setProperty('--secondary', nextSecondary);

      const color = sanitizeLayoutColor(localStorage.getItem('wt_sidebar_color') || undefined, theme, 'sidebar');
      const topbar = sanitizeLayoutColor(localStorage.getItem('wt_topbar_color') || undefined, theme, 'topbar');
      const navbar = sanitizeLayoutColor(localStorage.getItem('wt_navbar_color') || undefined, theme, 'navbar');

      document.documentElement.style.setProperty('--sidebar-bg', color);
      document.documentElement.style.setProperty('--topbar-bg', topbar);
      document.documentElement.style.setProperty('--navbar-bg', navbar);

      return { theme, sidebarColor: color, topbarColor: topbar, navbarColor: navbar };
    });
  },
  setBrandColor: (color) => {
    localStorage.setItem('wt_brand_color', color);
    set((state) => {
      const effectiveBrand = sanitizeBrandColor(color, state.theme);
      document.documentElement.style.setProperty('--brand', effectiveBrand);
      return { brandColor: color };
    });
  },
  setSecondaryColor: (color) => {
    localStorage.setItem('wt_secondary_color', color);
    set((state) => {
      const effectiveSecondary = sanitizeBrandColor(color, state.theme);
      document.documentElement.style.setProperty('--brand-secondary', effectiveSecondary);
      document.documentElement.style.setProperty('--secondary', effectiveSecondary);
      return { secondaryColor: color };
    });
  },
  setSidebarColor: (color) => {
    set((state) => {
      const sanitized = sanitizeLayoutColor(color, state.theme, 'sidebar');
      localStorage.setItem('wt_sidebar_color', sanitized);
      document.documentElement.style.setProperty('--sidebar-bg', sanitized);
      return { sidebarColor: sanitized };
    });
  },
  setTopbarColor: (color) => {
    set((state) => {
      const sanitized = sanitizeLayoutColor(color, state.theme, 'topbar');
      localStorage.setItem('wt_topbar_color', sanitized);
      document.documentElement.style.setProperty('--topbar-bg', sanitized);
      return { topbarColor: sanitized };
    });
  },
  setNavbarColor: (color) => {
    set((state) => {
      const sanitized = sanitizeLayoutColor(color, state.theme, 'navbar');
      localStorage.setItem('wt_navbar_color', sanitized);
      document.documentElement.style.setProperty('--navbar-bg', sanitized);
      return { navbarColor: sanitized };
    });
  },
  setAppFont: (font) => {
    localStorage.setItem('wt_app_font', font);
    const stack = APP_FONT_STACKS[font];
    document.documentElement.style.setProperty('--font-sans', stack);
    document.documentElement.style.setProperty('--font-heading', stack);
    document.documentElement.style.setProperty('--font-content', stack);
    localStorage.setItem('wt_heading_font', font);
    localStorage.setItem('wt_content_font', font);
    set({ appFont: font, headingFont: font, contentFont: font });
  },
  setTypography: (settings) => {
    set((state) => {
      const headingFont = settings.headingFont ?? state.headingFont;
      const contentFont = settings.contentFont ?? state.contentFont;
      const headingFontName = settings.headingFontName ?? state.headingFontName;
      const headingFontUrl = settings.headingFontUrl ?? state.headingFontUrl;
      const contentFontName = settings.contentFontName ?? state.contentFontName;
      const contentFontUrl = settings.contentFontUrl ?? state.contentFontUrl;

      localStorage.setItem('wt_heading_font', headingFont);
      localStorage.setItem('wt_content_font', contentFont);
      persistOptional('wt_heading_font_name', headingFontName);
      persistOptional('wt_heading_font_url', headingFontUrl);
      persistOptional('wt_content_font_name', contentFontName);
      persistOptional('wt_content_font_url', contentFontUrl);

      applyCustomFontFace('heading', headingFontName, headingFontUrl);
      applyCustomFontFace('content', contentFontName, contentFontUrl);
      document.documentElement.style.setProperty('--font-heading', fontStackForChoice(headingFont, headingFontName));
      document.documentElement.style.setProperty('--font-content', fontStackForChoice(contentFont, contentFontName));

      return { headingFont, contentFont, headingFontName, headingFontUrl, contentFontName, contentFontUrl };
    });
  },
  setCountry: (country) => {
    localStorage.setItem('wt_country', country);
    set({ country });
  },
  setCompanyName: (name) => {
    const next = name?.trim() || 'WelcomeTech CRM';
    localStorage.setItem('wt_company_name', next);
    set({ companyName: next });
  },
  setLogo: (logo) => {
    const next = logo || '';
    if (next) {
      localStorage.setItem('wt_logo', next);
    } else {
      localStorage.removeItem('wt_logo');
    }
    set({ logo: next });
  },
  setProposalWatermark: (watermark) => {
    const next = watermark || '';
    if (next) {
      localStorage.setItem('wt_proposal_watermark', next);
    } else {
      localStorage.removeItem('wt_proposal_watermark');
    }
    set({ proposalWatermark: next });
  },
  setProposalSettings: ({ proposalNo, proposalIncludeDate }) =>
    set((state) => {
      const nextProposalNo = proposalNo !== undefined ? (proposalNo.trim() || 'WT-Q1001') : state.proposalNo;
      const nextIncludeDate = proposalIncludeDate !== undefined ? Boolean(proposalIncludeDate) : state.proposalIncludeDate;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('wt_proposal_no', nextProposalNo);
        localStorage.setItem('wt_proposal_include_date', String(nextIncludeDate));
      }
      return { proposalNo: nextProposalNo, proposalIncludeDate: nextIncludeDate };
    }),
}));
