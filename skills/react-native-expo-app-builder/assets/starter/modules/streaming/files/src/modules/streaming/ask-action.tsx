import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/provider';
import { slots } from '@/modules/slots';

import { askHref } from './routes';

/** Item footer: ask about this item. Hidden by the `ask.enabled` remote switch (remote-config module); a guest is asked to sign in. */
export function AskAction({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const enabled = slots.useFlag('ask.enabled', true);
  const requireAccount = slots.useRequireAccount();
  if (!enabled) return null;
  return <Button testID="item-ask" style={{ flex: 1 }} label={t('item_ask')} onPress={() => requireAccount('ask') && router.push(askHref({ itemId }))} />;
}
