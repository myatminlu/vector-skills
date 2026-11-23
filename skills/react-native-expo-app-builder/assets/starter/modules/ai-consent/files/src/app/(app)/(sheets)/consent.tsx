import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Layout, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { withAccount } from '@/modules/account-gate';
import { AI_PROVIDER_NAME } from '@/modules/ai-consent/disclosure';
import { answerConsentRequest, trackConsentSheet } from '@/modules/ai-consent/gate';
import { consent } from '@/modules/ai-consent/store';
import { useCurrentUser } from '@/modules/auth/session';

/** What is sent, to whom, and a real choice — before anything is sent (App Store 5.1.2(i)). */
function ConsentSheet() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useCurrentUser();

  useEffect(() => trackConsentSheet(user.id), [user.id]);

  const answer = (granted: boolean) => {
    if (granted) consent.grant(user.id);
    else consent.withdraw(user.id);
    answerConsentRequest(granted);
    router.back();
  };

  return (
    <View testID="consent-sheet" style={{ flex: 1, backgroundColor: colors.surfaceRaised }}>
      <ScrollView contentContainerStyle={{ padding: Layout.screenX, paddingTop: Spacing.xxxl, gap: Spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          {t('consent_title', { provider: AI_PROVIDER_NAME })}
        </AppText>
        <AppText variant="body" tone="muted">
          {t('consent_body', { provider: AI_PROVIDER_NAME })}
        </AppText>
      </ScrollView>
      <View style={{ paddingHorizontal: Layout.screenX, paddingTop: Spacing.sm, paddingBottom: Math.max(insets.bottom, Spacing.lg), gap: Spacing.sm }}>
        <Button testID="consent-allow" label={t('consent_allow')} onPress={() => answer(true)} />
        <Button testID="consent-deny" label={t('consent_deny')} variant="ghost" onPress={() => answer(false)} />
      </View>
    </View>
  );
}

export default withAccount(ConsentSheet, 'ask');
