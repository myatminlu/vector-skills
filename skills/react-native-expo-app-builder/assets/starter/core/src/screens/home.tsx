import { router } from 'expo-router';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { contentColumn, useListTopInset } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/screen-state';
import { Layout, Spacing } from '@/constants/theme';
import { useItems } from '@/features/items/queries';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { registry } from '@/modules/slots';
import { href } from '@/navigation/routes';
import { shell } from '@/navigation/shell';

/** Public content: what anyone can browse. A FlatList screen, so it applies the content column itself. */
export default function HomeScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const items = useItems();
  const actions = registry.homeActions();
  const topInset = useListTopInset();

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm, paddingBottom: Spacing.md }}>
      <AppText variant="largeTitle" accessibilityRole="header">
        {t('home_title')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
        {actions.map((action) => (
          <action.Component key={action.id} />
        ))}
        {shell.tabs ? null : <Button testID="open-account" label={t('home_account')} variant="ghost" size="sm" onPress={() => router.push(href.account())} />}
      </View>
    </View>
  );

  if (items.isPending) return <LoadingState />;
  if (items.isError && !items.data) return <ErrorState message={getApiErrorMessage(items.error)} onRetry={() => void items.refetch()} />;

  return (
    <FlatList
      testID="home-list"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[contentColumn, { paddingHorizontal: Layout.screenX, paddingTop: topInset, paddingBottom: Spacing.xxl, flexGrow: 1 }]}
      data={items.data?.items ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState title={t('home_empty')} />}
      refreshing={items.isRefetching}
      onRefresh={() => void items.refetch()}
      renderItem={({ item }) => <ListRow testID={`item-${item.id}`} title={item.title} subtitle={item.summary} onPress={() => router.push(href.item(item.id))} />}
    />
  );
}
