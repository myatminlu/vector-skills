import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/modules/auth/session';

import { guestMode, useGuestMode } from './guest-mode';
import { logInFromGuest } from './require-account';

/** Under the sign-in button: what a guest can do, and the way in without an account. */
export function ContinueAsGuest({ busy }: { busy: boolean }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: Spacing.xs }}>
      <AppText variant="footnote" tone="muted" align="center">
        {t('auth_guest_hint')}
      </AppText>
      <Button testID="continue-as-guest" label={t('auth_continue_guest')} variant="ghost" onPress={guestMode.enter} disabled={busy} />
    </View>
  );
}

/** Account header for a guest: why to sign in, and the button. */
export function GuestAccountHeader() {
  const { t } = useI18n();
  const { user } = useAuth();
  const guest = useGuestMode();
  if (user || !guest) return null;
  return (
    <View testID="account-guest" style={{ gap: Spacing.sm }}>
      <AppText variant="largeTitle" accessibilityRole="header">
        {t('account_guest_title')}
      </AppText>
      <AppText variant="body" tone="muted">
        {t('account_guest_body')}
      </AppText>
      <Button testID="account-sign-in" label={t('login_action')} onPress={() => logInFromGuest()} />
    </View>
  );
}
