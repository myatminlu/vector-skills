import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentType } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { APP_VERSION, QA_TOUR_ENABLED } from '@/config/env';
import { PRIVACY_URL, TERMS_URL } from '@/config/legal';
import { Spacing } from '@/constants/theme';
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n';
import { useI18n } from '@/i18n/provider';
import { registry } from '@/modules/slots';
import { href } from '@/navigation/routes';

function PrivacyRow() {
  const { t } = useI18n();
  return <ListRow title={t('account_privacy')} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)} />;
}

function TermsRow() {
  const { t } = useI18n();
  return <ListRow title={t('account_terms')} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} />;
}

function GalleryRow() {
  if (!__DEV__ && !QA_TOUR_ENABLED) return null;
  return <ListRow title="Component gallery" subtitle="Development builds only" onPress={() => router.push(href.gallery())} />;
}

/** The core's rows sit at fixed orders so modules can place theirs around them (consent above, sign-out below). */
const CORE_ROWS: { id: string; order: number; Component: ComponentType }[] = [
  { id: 'privacy', order: 50, Component: PrivacyRow },
  { id: 'terms', order: 51, Component: TermsRow },
  { id: 'gallery', order: 90, Component: GalleryRow },
];

/**
 * Settings and account. Modules fill the slots: a header (who is signed in, or the guest prompt), settings (text
 * size) and rows (AI sharing, sign out, delete account). The privacy and terms links are always here — both stores
 * look for them.
 */
export default function AccountScreen() {
  const { t, lang, setLanguage } = useI18n();
  const headers = registry.accountSections('header');
  const settings = registry.accountSections('settings');
  const rows = [...registry.accountSections('rows'), ...CORE_ROWS].sort((a, b) => a.order - b.order);

  return (
    <Screen testID="account-screen" contentStyle={{ gap: Spacing.xl }}>
      {headers.length ? (
        headers.map((section) => <section.Component key={section.id} />)
      ) : (
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('account_title')}
        </AppText>
      )}

      {LANGUAGES.length > 1 ? (
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="footnote" tone="muted">
            {t('account_language')}
          </AppText>
          <Segmented testIDPrefix="language" label={t('account_language')} value={lang} onChange={setLanguage} options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] ?? value }))} />
        </View>
      ) : null}

      {settings.map((section) => (
        <section.Component key={section.id} />
      ))}

      <View>
        {rows.map((row) => (
          <row.Component key={row.id} />
        ))}
      </View>

      <AppText variant="caption" tone="faint" align="center">
        {t('account_version', { version: APP_VERSION })}
      </AppText>
    </Screen>
  );
}
