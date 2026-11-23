import { router } from 'expo-router';
import { type ComponentType, useCallback } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/sheet';
import { Layout, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import type { MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/provider';
import { guestMode } from '@/lib/guest-mode';
import { href } from '@/navigation/routes';
import { useAuth } from '@/providers/auth-provider';

/** What a guest tried to use; picks the sentence that says why it needs an account. Add one per account-only feature. */
export const ACCOUNT_FEATURES = ['saved', 'ask', 'account'] as const;
export type AccountFeature = (typeof ACCOUNT_FEATURES)[number];

const BODY: Record<AccountFeature, MessageKey> = {
  saved: 'login_body_saved',
  ask: 'login_body_ask',
  account: 'login_body_account',
};

export function accountFeatureFrom(value: unknown): AccountFeature {
  return (ACCOUNT_FEATURES as readonly unknown[]).includes(value) ? (value as AccountFeature) : 'account';
}

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
 * answers false, so a handler reads `if (requireAccount('saved')) router.push(href.saved())`.
 */
export function useRequireAccount(): (feature: AccountFeature) => boolean {
  const { user } = useAuth();
  return useCallback(
    (feature: AccountFeature) => {
      if (user) return true;
      router.push(href.sheet.loginRequired(feature));
      return false;
    },
    [user],
  );
}

export function LoginRequiredSheet({ feature }: { feature: AccountFeature }) {
  const { t } = useI18n();
  return (
    <ConfirmSheet
      title={t('login_title')}
      body={t(BODY[feature])}
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
function LoginRequiredScreen({ feature }: { feature: AccountFeature }) {
  const colors = useColors();
  const { t } = useI18n();
  const leave = () => (router.canGoBack() ? router.back() : router.replace(href.home()));
  return (
    <View testID="login-required-screen" style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: Layout.screenX }}>
      <View style={{ width: '100%', maxWidth: Layout.formWidth, alignSelf: 'center', gap: Spacing.md }}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {t('login_title')}
        </AppText>
        <AppText variant="body" tone="muted" align="center">
          {t(BODY[feature])}
        </AppText>
        <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
          <Button label={t('login_action')} onPress={() => logInFromGuest(router.canGoBack())} />
          <Button label={t('common_cancel')} variant="ghost" onPress={leave} />
        </View>
      </View>
    </View>
  );
}

/**
 * Wraps the default export of an account-only route. Entry points ask first with `useRequireAccount`; this catches
 * every other way in, so a guest never reaches a screen that reads the signed-in user.
 */
export function withAccount<P extends object>(Screen: ComponentType<P>, feature: AccountFeature): ComponentType<P> {
  function AccountOnly(props: P) {
    const { user } = useAuth();
    if (user) return <Screen {...props} />;
    return <LoginRequiredScreen feature={feature} />;
  }
  AccountOnly.displayName = `withAccount(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return AccountOnly;
}
