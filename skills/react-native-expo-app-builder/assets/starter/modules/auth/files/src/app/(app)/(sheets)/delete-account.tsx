import { router } from 'expo-router';
import { useState } from 'react';

import { ConfirmSheet } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { withAccount } from '@/modules/account-gate';
import { useAuth } from '@/modules/auth/session';

/** In-app account deletion — both stores require it wherever an account can be created. */
function DeleteAccountSheet() {
  const { t } = useI18n();
  const { deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      // On success the session ends and the root layout swaps the whole app stack (this sheet included) for sign-in.
      await deleteAccount();
    } catch (reason) {
      setError(getApiErrorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <ConfirmSheet
      destructive
      title={t('account_delete_title')}
      body={t('account_delete_body')}
      primaryLabel={t('account_delete_confirm')}
      secondaryLabel={t('common_cancel')}
      onPrimary={() => void confirm()}
      onSecondary={() => router.back()}
      loading={busy}
      error={error}
      primaryTestID="delete-account-confirm"
    />
  );
}

export default withAccount(DeleteAccountSheet, 'account');
