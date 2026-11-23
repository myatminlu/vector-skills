import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/screen-state';
import { Spacing } from '@/constants/theme';
import { useItem } from '@/features/items/queries';
import { getApiErrorMessage } from '@/lib/api';
import { registry } from '@/modules/slots';

/**
 * Public detail screen. Modules put their actions in the footer — save (auth), ask (streaming) — and each decides on
 * its own whether a guest may use it.
 */
export default function ItemScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const actions = registry.itemActions();

  if (item.isPending) return <LoadingState />;
  if (item.isError) return <ErrorState message={getApiErrorMessage(item.error)} onRetry={() => void item.refetch()} />;

  return (
    <Screen
      testID="item-screen"
      footer={
        actions.length ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' }}>
            {actions.map((action) => (
              <action.Component key={action.id} itemId={id} />
            ))}
          </View>
        ) : undefined
      }>
      <Stack.Screen options={{ title: item.data.title }} />
      <AppText variant="title" accessibilityRole="header">
        {item.data.title}
      </AppText>
      <AppText variant="reading" style={{ marginTop: Spacing.md }}>
        {item.data.body}
      </AppText>
    </Screen>
  );
}
