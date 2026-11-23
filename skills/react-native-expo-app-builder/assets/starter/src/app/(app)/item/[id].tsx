import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/screen-state';
import { Spacing } from '@/constants/theme';
import { useRequireAccount } from '@/features/guest/require-account';
import { useItem, useSaved, useSaveItem } from '@/features/items/queries';
import { useFlags } from '@/features/remote-config/queries';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { href } from '@/navigation/routes';

/** Public detail screen with two account-only actions: the guest sees the content and is asked to sign in on tap. */
export default function ItemScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const item = useItem(id);
  const saved = useSaved();
  const save = useSaveItem();
  const flags = useFlags();
  const requireAccount = useRequireAccount();
  const isSaved = Boolean(saved.data?.some((entry) => entry.itemId === id));

  if (item.isPending) return <LoadingState />;
  if (item.isError) return <ErrorState message={getApiErrorMessage(item.error)} onRetry={() => void item.refetch()} />;

  return (
    <Screen
      testID="item-screen"
      footer={
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Button
            testID="item-save"
            style={{ flex: 1 }}
            variant="secondary"
            label={isSaved ? t('item_saved') : t('item_save')}
            disabled={isSaved || save.isPending}
            onPress={() => requireAccount('saved') && save.mutate(id)}
          />
          {flags.askEnabled ? <Button testID="item-ask" style={{ flex: 1 }} label={t('item_ask')} onPress={() => requireAccount('ask') && router.push(href.ask({ itemId: id }))} /> : null}
        </View>
      }>
      <Stack.Screen options={{ title: item.data.title }} />
      <AppText variant="title" accessibilityRole="header">
        {item.data.title}
      </AppText>
      <AppText variant="reading" style={{ marginTop: Spacing.md }}>
        {item.data.body}
      </AppText>
      {save.isError ? (
        <AppText variant="footnote" tone="danger" style={{ marginTop: Spacing.md }}>
          {getApiErrorMessage(save.error)}
        </AppText>
      ) : null}
    </Screen>
  );
}
