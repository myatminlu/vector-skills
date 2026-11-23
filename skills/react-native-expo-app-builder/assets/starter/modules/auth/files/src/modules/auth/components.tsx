import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { slots } from '@/modules/slots';

import { authHref } from './routes';
import { useSaved, useSaveItem } from './saved-queries';
import { useAuth } from './session';

/** Home header: open the saved list (asks a guest to sign in first). */
export function SavedButton() {
  const { t } = useI18n();
  const requireAccount = slots.useRequireAccount();
  return <Button testID="open-saved" label={t('home_saved')} variant="ghost" size="sm" onPress={() => requireAccount('saved') && router.push(authHref.saved())} />;
}

/** Item footer: save the item. */
export function SaveAction({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const saved = useSaved();
  const save = useSaveItem();
  const requireAccount = slots.useRequireAccount();
  const isSaved = Boolean(saved.data?.some((entry) => entry.itemId === itemId));
  return (
    <View style={{ flex: 1, gap: Spacing.xs }}>
      {save.isError ? (
        <AppText variant="footnote" tone="danger">
          {getApiErrorMessage(save.error)}
        </AppText>
      ) : null}
      <Button testID="item-save" variant="secondary" label={isSaved ? t('item_saved') : t('item_save')} disabled={isSaved || save.isPending} onPress={() => requireAccount('saved') && save.mutate(itemId)} />
    </View>
  );
}

/** Account header for a signed-in user; nothing for a guest (the guest module draws theirs). */
export function AccountHeader() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <View style={{ gap: Spacing.xs }}>
      <AppText variant="largeTitle" accessibilityRole="header">
        {t('account_title')}
      </AppText>
      <AppText testID="account-email" variant="body" tone="muted">
        {t('account_signed_in_as', { email: user.email })}
      </AppText>
    </View>
  );
}

export function SignOutRow() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  if (!user) return null;
  return <ListRow testID="account-sign-out" title={t('account_sign_out')} onPress={() => void signOut()} />;
}

/** In-app account deletion — both stores require it wherever an account can be created. */
export function DeleteAccountRow() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user) return null;
  return <ListRow testID="account-delete" title={t('account_delete')} destructive onPress={() => router.push(authHref.deleteAccount())} />;
}
