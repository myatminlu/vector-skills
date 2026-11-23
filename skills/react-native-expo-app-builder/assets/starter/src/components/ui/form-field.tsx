import { useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { AppText, fontFamilyFor, isMyanmarText } from '@/components/ui/app-text';
import { Layout, myanmarLineHeight, Radius, Spacing, TypeScale } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { fontScaleCap, scaleFontSize } from '@/lib/text-size';
import { useTextScale } from '@/lib/text-size-store';

type FormFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
};

/**
 * A labelled text input. The font is chosen from the value *or* the placeholder: a Burmese placeholder drawn in the
 * Latin font falls back to the system Myanmar font and clips under a Latin line height.
 */
export function FormField({ label, error, value, placeholder, multiline, ...props }: FormFieldProps) {
  const colors = useColors();
  const textScale = useTextScale();
  const [focused, setFocused] = useState(false);
  const myanmar = isMyanmarText(value || placeholder || '');
  const fontSize = scaleFontSize(TypeScale.body.size, textScale);

  return (
    <View style={{ gap: Spacing.xs }}>
      <AppText variant="footnote" tone="muted">
        {label}
      </AppText>
      <TextInput
        {...props}
        value={value}
        placeholder={placeholder}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        maxFontSizeMultiplier={fontScaleCap(1.6, textScale)}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={{
          minHeight: multiline ? 104 : Layout.inputHeight,
          paddingHorizontal: Spacing.md,
          paddingVertical: multiline ? Spacing.md : 0,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          backgroundColor: colors.surface,
          color: colors.text,
          fontSize,
          fontFamily: fontFamilyFor('regular', myanmar),
          lineHeight: myanmar ? myanmarLineHeight(fontSize) : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {error ? (
        <AppText variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
