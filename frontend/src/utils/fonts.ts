export const APP_FONT_STACKS = {
  outfit: "'Outfit', 'Space Grotesk', system-ui, sans-serif",
  jakarta: "'Plus Jakarta Sans', 'Outfit', system-ui, sans-serif",
  manrope: "'Manrope', 'Outfit', system-ui, sans-serif",
  dmsans: "'DM Sans', 'Outfit', system-ui, sans-serif",
  sora: "'Sora', 'Outfit', system-ui, sans-serif",
} as const;

export type AppFontKey = keyof typeof APP_FONT_STACKS;

export const DEFAULT_APP_FONT: AppFontKey = 'outfit';

export const APP_FONT_OPTIONS: { value: AppFontKey; label: string }[] = [
  { value: 'outfit', label: 'Outfit' },
  { value: 'jakarta', label: 'Plus Jakarta Sans' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'dmsans', label: 'DM Sans' },
  { value: 'sora', label: 'Sora' },
];

export const isAppFontKey = (value: unknown): value is AppFontKey =>
  typeof value === 'string' && value in APP_FONT_STACKS;

export type FontChoice = AppFontKey | 'custom';

export const isFontChoice = (value: unknown): value is FontChoice =>
  value === 'custom' || isAppFontKey(value);

export const fontStackForChoice = (choice: FontChoice, customFamily?: string): string => {
  if (choice === 'custom' && customFamily?.trim()) {
    return `'${customFamily.trim().replace(/'/g, "\\'")}', ${APP_FONT_STACKS[DEFAULT_APP_FONT]}`;
  }

  return APP_FONT_STACKS[isAppFontKey(choice) ? choice : DEFAULT_APP_FONT];
};
