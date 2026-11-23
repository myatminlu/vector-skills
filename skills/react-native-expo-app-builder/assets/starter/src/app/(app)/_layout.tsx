import { Stack } from 'expo-router';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/i18n/provider';
import { pageSheetOptions, sheetOptions, stackOptions } from '@/navigation/screen-options';

/** A deep link straight to a pushed screen (an item) still gets the tabs underneath it, so Back has somewhere to go. */
export const unstable_settings = { anchor: '(tabs)' };

/** Everything past the sign-in screen — for signed-in users and guests alike. Account-only screens wrap themselves. */
export default function AppLayout() {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <Stack screenOptions={stackOptions(colors)}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
      <Stack.Screen name="ask" options={{ title: t('ask_title') }} />
      <Stack.Screen name="saved" options={{ title: t('saved_title') }} />
      <Stack.Screen name="dev/gallery" options={{ title: 'Gallery' }} />
      <Stack.Screen name="(sheets)/login-required" options={sheetOptions(colors)} />
      <Stack.Screen name="(sheets)/delete-account" options={sheetOptions(colors)} />
      {/* A page sheet, not a form sheet: it pins its buttons under a scrolling body. */}
      <Stack.Screen name="(sheets)/consent" options={pageSheetOptions(colors)} />
    </Stack>
  );
}
