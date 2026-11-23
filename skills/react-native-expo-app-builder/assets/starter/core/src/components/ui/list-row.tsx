import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Right-hand value or control. */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  testID?: string;
};

export function ListRow({ title, subtitle, trailing, onPress, destructive = false, testID }: ListRowProps) {
  const colors = useColors();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" tone={destructive ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}
