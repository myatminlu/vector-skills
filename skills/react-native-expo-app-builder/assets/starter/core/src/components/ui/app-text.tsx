import { Children, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { type FontWeight, fontWeightValue, type ThemeColors, TypeScale, type TypeVariant } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { fontScaleCap, scaleFontSize } from '@/lib/text-scale';
import { registry, slots } from '@/modules/slots';
import type { TextScript } from '@/modules/types';

export type AppTextTone = 'text' | 'muted' | 'faint' | 'accent' | 'danger' | 'onAccent' | 'onDanger';

type AppTextProps = ComponentProps<typeof Text> & {
  variant?: TypeVariant;
  tone?: AppTextTone;
  weight?: FontWeight;
  align?: TextStyle['textAlign'];
};

/**
 * The script that must draw `text`, when a language module registered one (lang-my: Myanmar). `undefined` means the
 * system font and the type scale's own line height.
 */
export function scriptFor(text: string | null | undefined): TextScript | undefined {
  if (!text) return undefined;
  return registry.textScripts().find((script) => script.test(text));
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
  const textScale = slots.useTextScale();
  const spec = TypeScale[variant];
  const script = scriptFor(textFromChildren(children));
  const resolvedWeight = weight ?? spec.weight;
  const fixedSize = ((StyleSheet.flatten(style) ?? {}) as TextStyle).fontSize;
  const fontSize = fixedSize ?? scaleFontSize(spec.size, textScale);
  // A tall script keeps its font's full line box whatever a caller's style says: a shorter line cuts its marks.
  const lineHeight = script ? script.lineHeight(fontSize) : Math.round(fontSize * spec.lineHeight);
  const limit = variant === 'largeTitle' || variant === 'title' ? 1.6 : 2;

  return (
    <Text
      {...props}
      maxFontSizeMultiplier={fontScaleCap(maxFontSizeMultiplier ?? limit, textScale)}
      style={[
        {
          fontFamily: script?.fontFamily(resolvedWeight),
          fontWeight: script ? undefined : fontWeightValue(resolvedWeight),
          fontSize,
          lineHeight,
          color: toneColor(colors, tone),
          textAlign: align,
        },
        style,
        script ? { lineHeight } : null,
      ]}>
      {children}
    </Text>
  );
}
