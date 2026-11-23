import { Children, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { Fonts, type FontWeight, fontWeightValue, myanmarLineHeight, type ThemeColors, TypeScale, type TypeVariant } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { fontScaleCap, scaleFontSize } from '@/lib/text-size';
import { useTextScale } from '@/lib/text-size-store';

export type AppTextTone = 'text' | 'muted' | 'faint' | 'accent' | 'danger' | 'onAccent' | 'onDanger';

type AppTextProps = ComponentProps<typeof Text> & {
  variant?: TypeVariant;
  tone?: AppTextTone;
  weight?: FontWeight;
  align?: TextStyle['textAlign'];
};

const MYANMAR_PATTERN = /[က-႟ꩠ-ꩿꧠ-꧿]/;

export function isMyanmarText(value: string | null | undefined): boolean {
  return Boolean(value) && MYANMAR_PATTERN.test(value as string);
}

/** The font family for a weight in a script: system font for Latin, Noto Sans Myanmar for Myanmar. */
export function fontFamilyFor(weight: FontWeight, myanmar: boolean): string | undefined {
  if (!myanmar) return undefined;
  return weight === 'semibold' || weight === 'bold' ? Fonts.myanmar.semibold : Fonts.myanmar.regular;
}

function toneColor(colors: ThemeColors, tone: AppTextTone): string {
  switch (tone) {
    case 'muted':
      return colors.textMuted;
    case 'faint':
      return colors.textFaint;
    case 'accent':
      return colors.accent;
    case 'danger':
      return colors.danger;
    case 'onAccent':
      return colors.onAccent;
    case 'onDanger':
      return colors.onDanger;
    default:
      return colors.text;
  }
}

function textFromChildren(children: ReactNode): string {
  let value = '';
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') value += String(child);
    else if (Array.isArray(child)) value += textFromChildren(child);
  });
  return value;
}

/**
 * The only way the app draws text. It picks the font and line height per script, applies the in-app text size, and
 * caps the phone's font scale so layouts hold. A `fontSize` passed in `style` is drawn as given — that is how text in
 * a box that does not grow (a badge, initials) opts out of scaling.
 */
export function AppText({ children, variant = 'body', tone = 'text', weight, align, style, maxFontSizeMultiplier, ...props }: AppTextProps) {
  const colors = useColors();
  const textScale = useTextScale();
  const spec = TypeScale[variant];
  const myanmar = isMyanmarText(textFromChildren(children));
  const resolvedWeight = weight ?? spec.weight;
  const fixedSize = ((StyleSheet.flatten(style) ?? {}) as TextStyle).fontSize;
  const fontSize = fixedSize ?? scaleFontSize(spec.size, textScale);
  // Myanmar keeps the font's full line box whatever a caller's style says: a shorter line cuts the marks above the letters.
  const lineHeight = myanmar ? myanmarLineHeight(fontSize) : Math.round(fontSize * spec.lineHeight);
  const limit = variant === 'largeTitle' || variant === 'title' ? 1.6 : 2;

  return (
    <Text
      {...props}
      maxFontSizeMultiplier={fontScaleCap(maxFontSizeMultiplier ?? limit, textScale)}
      style={[
        {
          fontFamily: fontFamilyFor(resolvedWeight, myanmar),
          fontWeight: myanmar ? undefined : fontWeightValue(resolvedWeight),
          fontSize,
          lineHeight,
          color: toneColor(colors, tone),
          textAlign: align,
        },
        style,
        myanmar ? { lineHeight } : null,
      ]}>
      {children}
    </Text>
  );
}
