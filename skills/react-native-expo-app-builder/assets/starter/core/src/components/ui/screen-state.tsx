import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';

/** The states a design never draws, defined once: every screen composes these instead of improvising. */
export function LoadingState({ label }: { label?: string }) {
  const colors = useColors();
  const { t } = useI18n();
  const text = label ?? t('common_loading');
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={text} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xxl }}>
      <ActivityIndicator color={colors.accent} />
      <AppText variant="footnote" tone="muted" align="center">
        {text}
      </AppText>
    </View>
  );
}

/** The message is selectable so it can be copied into a bug report. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View testID="error-state" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xxl }}>
      <AppText selectable accessibilityRole="alert" variant="body" tone="danger" align="center">
        {message}
      </AppText>
      {onRetry ? <Button label={t('common_retry')} onPress={onRetry} variant="secondary" size="sm" /> : null}
    </View>
  );
}

export function EmptyState({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View testID="empty-state" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xxl }}>
      <AppText variant="body" tone="muted" align="center">
        {title}
      </AppText>
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" size="sm" /> : null}
    </View>
  );
}
