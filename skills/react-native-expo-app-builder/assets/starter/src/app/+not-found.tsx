import { router } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';
import { href } from '@/navigation/routes';

export default function NotFoundScreen() {
  const { t } = useI18n();
  return (
    <Screen topInset contentStyle={{ justifyContent: 'center', gap: Spacing.lg }}>
      <AppText variant="title" align="center">
        {t('notfound_title')}
      </AppText>
      <Button label={t('notfound_home')} onPress={() => router.replace(href.home())} />
    </Screen>
  );
}
