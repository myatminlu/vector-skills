/**
 * Design tokens. Screens never hold literal colours or sizes — they read these, so a rebrand or a second theme is a
 * change here and nowhere else. Replace the values with the design's; keep the shapes.
 */

const palette = {
  light: {
    bg: '#ffffff',
    surface: '#f4f5f7',
    surfaceRaised: '#ffffff',
    text: '#111316',
    textMuted: '#5e646e',
    textFaint: '#8b919b',
    border: 'rgba(17, 19, 22, 0.10)',
    accent: '#2563eb',
    onAccent: '#ffffff',
    danger: '#dc2626',
    onDanger: '#ffffff',
    warning: '#f5c518',
    onWarning: '#1d1500',
    scrim: 'rgba(0, 0, 0, 0.4)',
  },
  dark: {
    bg: '#0b0c0e',
    surface: '#16181c',
    surfaceRaised: '#1f2226',
    text: '#f1f3f5',
    textMuted: '#a3a9b3',
    textFaint: '#737a85',
    border: 'rgba(255, 255, 255, 0.10)',
    accent: '#60a5fa',
    onAccent: '#08111f',
    danger: '#f87171',
    onDanger: '#200606',
    warning: '#f5c518',
    onWarning: '#1d1500',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ThemeColors = { [K in keyof (typeof palette)['light']]: string };
export const Colors: Record<ColorScheme, ThemeColors> = palette;

export const Spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const Radius = { sm: 8, md: 12, lg: 16, sheet: 24, pill: 999 } as const;

export const Layout = {
  screenX: 20,
  inputHeight: 52,
  buttonHeight: 52,
  /** Reading column: lists, articles, chat. On a tablet everything sits in one centred column this wide. */
  maxWidth: 720,
  /** Forms and their buttons — a 720 pt wide text field reads as a mistake. */
  formWidth: 520,
} as const;

/**
 * Latin text uses the system font (no download, Dynamic Type friendly). Myanmar text uses Noto Sans Myanmar, loaded in
 * the root layout, because the system Myanmar fonts differ per platform and some versions render stacked marks badly.
 */
export const Fonts = {
  myanmar: { regular: 'NotoSansMyanmar_400Regular', semibold: 'NotoSansMyanmar_600SemiBold' },
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export type TypeVariant = 'largeTitle' | 'title' | 'headline' | 'body' | 'reading' | 'callout' | 'footnote' | 'caption';

export type TypeSpec = { size: number; lineHeight: number; weight: FontWeight };

/** Design sizes in points; what is drawn is each of them times the in-app text size (`lib/text-size`). */
export const TypeScale: Record<TypeVariant, TypeSpec> = {
  largeTitle: { size: 30, lineHeight: 1.25, weight: 'bold' },
  title: { size: 22, lineHeight: 1.3, weight: 'semibold' },
  headline: { size: 17, lineHeight: 1.35, weight: 'semibold' },
  body: { size: 16, lineHeight: 1.45, weight: 'regular' },
  // Text read at length (articles, answers): a notch larger and looser than UI text.
  reading: { size: 17, lineHeight: 1.6, weight: 'regular' },
  callout: { size: 15, lineHeight: 1.4, weight: 'medium' },
  footnote: { size: 13, lineHeight: 1.4, weight: 'regular' },
  caption: { size: 12, lineHeight: 1.35, weight: 'regular' },
};

/**
 * Myanmar text needs the font's own line box: Noto Sans Myanmar's ascent + descent is 2.18 em. When a line is shorter,
 * iOS cuts the marks above the letters and Android trims both sides, so anything under ~2.1 clips. 2.2 is the rule,
 * applied by `AppText` whatever a caller's style says.
 */
export const MYANMAR_LINE_HEIGHT = 2.2;

export function myanmarLineHeight(fontSize: number): number {
  return Math.round(fontSize * MYANMAR_LINE_HEIGHT);
}

const weights: Record<FontWeight, '400' | '500' | '600' | '700'> = { regular: '400', medium: '500', semibold: '600', bold: '700' };

export function fontWeightValue(weight: FontWeight): '400' | '500' | '600' | '700' {
  return weights[weight];
}
