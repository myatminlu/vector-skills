import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

/** A row of mutually exclusive choices (language, text size). Each option is a radio for screen readers. */
export function Segmented<T extends string | number>({ options, value, onChange, label, testIDPrefix }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; testIDPrefix: string }) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: Spacing.xs, padding: Spacing.xxs, borderRadius: Radius.md, backgroundColor: colors.surface }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            testID={`${testIDPrefix}-${option.value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, minHeight: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.surfaceRaised : 'transparent' }}>
            <AppText variant="callout" tone={selected ? 'text' : 'muted'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
