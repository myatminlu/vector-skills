import { router } from 'expo-router';
import { type PropsWithChildren, useCallback } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/sheet';
import { Layout, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import type { MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/modules/auth/session';
import { href } from '@/navigation/routes';

import { guestMode } from './guest-mode';
import { guestHref } from './routes';

/** Why each account-only feature needs an account. Add a sentence per feature; anything else gets the generic one. */
const BODY: Record<string, MessageKey> = {
  saved: 'login_body_saved',
  ask: 'login_body_ask',
  account: 'login_body_account',
};

const bodyFor = (feature: string): MessageKey => BODY[feature] ?? 'login_body_account';

/** How long a closing sheet needs before the stack under it can be swapped for the sign-in screen. */
const SHEET_CLOSE_MS = 300;

/** Leave guest mode: the root layout swaps the app stack for the sign-in screen. */
export function logInFromGuest(fromSheet = false): void {
  if (!fromSheet) {
    guestMode.exit();
    return;
  }
  router.back();
  setTimeout(() => guestMode.exit(), SHEET_CLOSE_MS);
}

/**
 * `requireAccount(feature)` is true for a signed-in user. For a guest it opens the "sign in to continue" sheet and
 * answers false, so a handler reads `if (requireAccount('saved')) router.push(…)`.
 */
export function useGuestRequireAccount(): (feature: string) => boolean {
  const { user } = useAuth();
  return useCallback(
    (feature: string) => {
      if (user) return true;
      router.push(guestHref.loginRequired(feature));
      return false;
    },
    [user],
  );
}

export function LoginRequiredSheet({ feature }: { feature: string }) {
  const { t } = useI18n();
  return (
    <ConfirmSheet
      title={t('login_title')}
      body={t(bodyFor(feature))}
      primaryLabel={t('login_action')}
      secondaryLabel={t('common_cancel')}
      onPrimary={() => logInFromGuest(true)}
      onSecondary={() => router.back()}
      primaryTestID="login-required-sign-in"
      secondaryTestID="login-required-cancel"
    />
  );
}

/** Shown in place of an account-only screen a guest reached some other way (a deep link, a notification tap). */
export function GuestAccountGate({ feature, children }: PropsWithChildren<{ feature: string }>) {
  const colors = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  if (user) return children;
  const leave = () => (router.canGoBack() ? router.back() : router.replace(href.home()));
  return (
    <View testID="login-required-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: Layout.screenX }}>
      <View style={{ width: '100%', maxWidth: Layout.formWidth, alignSelf: 'center', gap: Spacing.md }}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {t('login_title')}
        </AppText>
        <AppText variant="body" tone="muted" align="center">
          {t(bodyFor(feature))}
        </AppText>
        <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
          <Button label={t('login_action')} onPress={() => logInFromGuest(router.canGoBack())} />
          <Button label={t('common_cancel')} variant="ghost" onPress={leave} />
        </View>
      </View>
    </View>
  );
}
