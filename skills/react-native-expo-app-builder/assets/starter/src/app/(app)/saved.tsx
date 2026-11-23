import { router } from 'expo-router';
import { FlatList } from 'react-native';

import { ListRow } from '@/components/ui/list-row';
import { contentColumn } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/screen-state';
import { Layout, Spacing } from '@/constants/theme';
import { withAccount } from '@/features/guest/require-account';
import { useItems, useSaved } from '@/features/items/queries';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { href } from '@/navigation/routes';

/** Account-only. A guest who deep-links here gets the sign-in prompt from `withAccount`, never a crash. */
function SavedScreen() {
  const colors = useColors();
  const { t, fmt } = useI18n();
  const saved = useSaved();
  const items = useItems();
  const titles = new Map((items.data?.items ?? []).map((item) => [item.id, item.title]));

  if (saved.isPending) return <LoadingState />;
  if (saved.isError) return <ErrorState message={getApiErrorMessage(saved.error)} onRetry={() => void saved.refetch()} />;

  return (
    <FlatList
      testID="saved-list"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[contentColumn, { paddingHorizontal: Layout.screenX, paddingBottom: Spacing.xxl, flexGrow: 1 }]}
      data={saved.data}
      keyExtractor={(entry) => entry.itemId}
      ListEmptyComponent={<EmptyState title={t('saved_empty')} />}
      renderItem={({ item: entry }) => <ListRow title={titles.get(entry.itemId) ?? entry.itemId} subtitle={fmt.date(entry.savedAt)} onPress={() => router.push(href.item(entry.itemId))} />}
    />
  );
}

export default withAccount(SavedScreen, 'saved');
