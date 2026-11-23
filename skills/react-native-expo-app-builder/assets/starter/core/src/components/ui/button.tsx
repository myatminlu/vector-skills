import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Layout, Radius, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
};

export function Button({ label, onPress, variant = 'primary', size = 'md', loading = false, disabled = false, style, testID, accessibilityHint }: ButtonProps) {
  const colors = useColors();
  const inactive = disabled || loading;
  const background = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surface : 'transparent';
  const tone = variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'onDanger' : variant === 'ghost' ? 'accent' : 'text';
  const spinner = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.onDanger : colors.accent;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: size === 'md' ? Layout.buttonHeight : 44,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.border,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        {loading ? <ActivityIndicator color={spinner} /> : null}
        <AppText variant={size === 'md' ? 'headline' : 'callout'} tone={tone} align="center">
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
