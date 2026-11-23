import { Button } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/modules/auth/session';

import { AI_PROVIDER_NAME } from './disclosure';
import { consent, useConsentGranted } from './store';

function ConsentRowFor({ userId }: { userId: string }) {
  const { t } = useI18n();
  const granted = useConsentGranted(userId);
  return (
    <ListRow
      title={t('account_ai_sharing', { provider: AI_PROVIDER_NAME })}
      subtitle={granted ? t('account_ai_on') : t('account_ai_off')}
      trailing={granted ? <Button label={t('account_ai_withdraw')} variant="ghost" size="sm" onPress={() => consent.withdraw(userId)} /> : null}
    />
  );
}

/** Account row: whether sharing with the AI provider is allowed, and a way to withdraw it (App Store 5.1.1(ii)). */
export function ConsentRow() {
  const { user } = useAuth();
  return user ? <ConsentRowFor userId={user.id} /> : null;
}
