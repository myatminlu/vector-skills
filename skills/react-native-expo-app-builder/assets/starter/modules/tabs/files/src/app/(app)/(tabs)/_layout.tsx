import { NativeTabs } from 'expo-router/native-tabs';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';

/** System tab bar (UITabBarController / Material bottom navigation). Labels stay in the system font on purpose. */
export default function TabsLayout() {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <NativeTabs backgroundColor={colors.bg} tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tab_home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>{t('tab_account')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
