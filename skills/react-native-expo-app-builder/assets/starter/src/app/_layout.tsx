import { NotoSansMyanmar_400Regular } from '@expo-google-fonts/noto-sans-myanmar/400Regular';
import { NotoSansMyanmar_600SemiBold } from '@expo-google-fonts/noto-sans-myanmar/600SemiBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppErrorBoundary } from '@/components/ui/app-error-boundary';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { useQaTour } from '@/dev/use-qa-tour';
import { useColors, useColorSchemeName } from '@/hooks/use-colors';
import { useGuestMode } from '@/lib/guest-mode';
import { href } from '@/navigation/routes';
import { AppProviders } from '@/providers/app-providers';
import { useAuth } from '@/providers/auth-provider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Session states map one-to-one onto route groups. Add an onboarding group the same way: a third `Stack.Protected`
 * with `guard={Boolean(user) && !user.onboardedAt}`, and make `(app)` require the opposite.
 *
 * Every `Stack.Protected` names its `redirectTo`. Without it a failed guard falls back to the *containing* navigator's
 * anchor, and this root navigator has none — a signed-out launch then opens on "not found".
 */
function AppNavigation({ fontsReady }: { fontsReady: boolean }) {
  const { user, isLoading } = useAuth();
  const guest = useGuestMode() && !user;
  const signedOut = !user && !guest;
  const ready = fontsReady && !isLoading;
  const scheme = useColorSchemeName();
  const colors = useColors();
  useQaTour();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: colors.accent, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border } };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={signedOut} redirectTo={href.home()}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedOut} redirectTo={href.signIn()}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" options={{ presentation: 'modal' }} />
      </Stack>
      <OfflineBanner />
    </ThemeProvider>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts({ NotoSansMyanmar_400Regular, NotoSansMyanmar_600SemiBold });
  return (
    <AppProviders>
      <AppNavigation fontsReady={fontsLoaded || Boolean(fontError)} />
    </AppProviders>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  );
}
