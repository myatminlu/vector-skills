import type { FontWeight } from '@/constants/theme';
import type { TextScript } from '@/modules/types';

const MYANMAR_PATTERN = /[က-႟ꩠ-ꩿꧠ-꧿]/;

/**
 * Myanmar text needs the font's own line box: Noto Sans Myanmar's ascent + descent is 2.18 em. When a line is shorter,
 * iOS cuts the marks above the letters and Android trims both sides, so anything under ~2.1 clips. 2.2 is the rule,
 * applied by `AppText` whatever a caller's style says. Measure the same way for any other tall script.
 */
export const MYANMAR_LINE_HEIGHT = 2.2;

/** Noto Sans Myanmar, loaded before the first frame: the system Myanmar fonts differ per platform and some stack marks badly. */
export const MYANMAR_FONTS = { regular: 'NotoSansMyanmar_400Regular', semibold: 'NotoSansMyanmar_600SemiBold' } as const;

export const myanmarScript: TextScript = {
  test: (text) => MYANMAR_PATTERN.test(text),
  fontFamily: (weight: FontWeight) => (weight === 'semibold' || weight === 'bold' ? MYANMAR_FONTS.semibold : MYANMAR_FONTS.regular),
  lineHeight: (fontSize) => Math.round(fontSize * MYANMAR_LINE_HEIGHT),
};
