import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { APP_VERSION, QA_TOUR_ENABLED } from '@/config/env';
import { PRIVACY_URL, TERMS_URL } from '@/config/legal';
import { Radius, Spacing } from '@/constants/theme';
import { AI_PROVIDER_NAME } from '@/features/consent/disclosure';
import { consent, useConsentGranted } from '@/features/consent/store';
import { logInFromGuest } from '@/features/guest/require-account';
import { useColors } from '@/hooks/use-colors';
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n';
import { useI18n } from '@/i18n/provider';
import { TEXT_SIZES } from '@/lib/text-size';
import { textSize, useTextSize } from '@/lib/text-size-store';
import { href } from '@/navigation/routes';
import { useAuth } from '@/providers/auth-provider';
import type { User } from '@/types/api';

function Segmented<T extends string | number>({ options, value, onChange, label, testIDPrefix }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string; testIDPrefix: string }) {
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

function ConsentRow({ user }: { user: User }) {
  const { t } = useI18n();
  const granted = useConsentGranted(user.id);
  return (
    <ListRow
      title={t('account_ai_sharing', { provider: AI_PROVIDER_NAME })}
      subtitle={granted ? t('account_ai_on') : t('account_ai_off')}
      trailing={granted ? <Button label={t('account_ai_withdraw')} variant="ghost" size="sm" onPress={() => consent.withdraw(user.id)} /> : null}
    />
  );
}

export default function AccountScreen() {
  const { t, lang, setLanguage } = useI18n();
  const { user, signOut } = useAuth();
  const size = useTextSize();

  return (
    <Screen testID="account-screen" contentStyle={{ gap: Spacing.xl }}>
      {user ? (
        <View style={{ gap: Spacing.xs }}>
          <AppText variant="largeTitle" accessibilityRole="header">
            {t('account_title')}
          </AppText>
          <AppText testID="account-email" variant="body" tone="muted">
            {t('account_signed_in_as', { email: user.email })}
          </AppText>
        </View>
      ) : (
        <View testID="account-guest" style={{ gap: Spacing.sm }}>
          <AppText variant="largeTitle" accessibilityRole="header">
            {t('account_guest_title')}
          </AppText>
          <AppText variant="body" tone="muted">
            {t('account_guest_body')}
          </AppText>
          <Button testID="account-sign-in" label={t('login_action')} onPress={() => logInFromGuest()} />
        </View>
      )}

      <View style={{ gap: Spacing.sm }}>
        <AppText variant="footnote" tone="muted">
          {t('account_language')}
        </AppText>
        <Segmented testIDPrefix="language" label={t('account_language')} value={lang} onChange={setLanguage} options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))} />
      </View>

      <View style={{ gap: Spacing.sm }}>
        <AppText variant="footnote" tone="muted">
          {t('account_text_size')}
        </AppText>
        <Segmented testIDPrefix="text-size" label={t('account_text_size')} value={size} onChange={textSize.set} options={TEXT_SIZES.map((value) => ({ value, label: `${value}%` }))} />
      </View>

      <View>
        {user ? <ConsentRow user={user} /> : null}
        <ListRow title={t('account_privacy')} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        <ListRow title={t('account_terms')} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} />
        {user ? <ListRow testID="account-sign-out" title={t('account_sign_out')} onPress={() => void signOut()} /> : null}
        {user ? <ListRow testID="account-delete" title={t('account_delete')} destructive onPress={() => router.push(href.sheet.deleteAccount())} /> : null}
        {__DEV__ || QA_TOUR_ENABLED ? <ListRow title="Component gallery" subtitle="Development builds only" onPress={() => router.push(href.gallery())} /> : null}
      </View>

      <AppText variant="caption" tone="faint" align="center">
        {t('account_version', { version: APP_VERSION })}
      </AppText>
    </Screen>
  );
}
