import { ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { retryConnectivity, useConnectivityChecking, useIsOffline } from '@/lib/connectivity';

/** Floating "No internet connection" pill; a tap re-checks at once instead of waiting for the next probe. */
export function OfflineBanner() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const checking = useConnectivityChecking();
  if (!isOffline) return null;

  return (
    <Pressable
      testID="offline-banner"
      accessibilityRole="button"
      accessibilityLabel={t('common_offline')}
      accessibilityHint={t('common_retry')}
      accessibilityLiveRegion="assertive"
      onPress={retryConnectivity}
      style={({ pressed }) => ({
        position: 'absolute',
        zIndex: 100,
        top: insets.top + Spacing.xs,
        alignSelf: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: colors.warning,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        opacity: pressed ? 0.85 : 1,
      })}>
      {checking ? <ActivityIndicator size="small" color={colors.onWarning} /> : null}
      <AppText variant="caption" weight="medium" style={{ color: colors.onWarning }}>
        {t('common_offline')}
      </AppText>
    </Pressable>
  );
}
