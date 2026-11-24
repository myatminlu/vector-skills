import { Stack } from 'expo-router';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { registry } from '@/modules/slots';
import { stackOptions } from '@/navigation/screen-options';
import { shell } from '@/navigation/shell';

/** A deep link straight to a pushed screen (an item) still gets Home underneath it, so Back has somewhere to go. */
export const unstable_settings = { anchor: shell.anchor };

/** Everything past the sign-in screen. Modules add their screens' presentation (sheets, titles) to this stack. */
export default function AppLayout() {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <Stack screenOptions={stackOptions(colors)}>
      {shell.tabs ? <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} /> : <Stack.Screen name="index" options={{ headerShown: false, title: '' }} />}
      {shell.tabs ? null : <Stack.Screen name="account" options={{ title: '' }} />}
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
      <Stack.Screen name="dev/gallery" options={{ title: 'Gallery' }} />
      {registry.stackScreens().map((screen) => (
        <Stack.Screen key={screen.name} name={screen.name} options={screen.options(colors, t)} />
      ))}
    </Stack>
  );
}
