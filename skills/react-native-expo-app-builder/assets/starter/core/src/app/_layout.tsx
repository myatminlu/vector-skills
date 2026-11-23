// Registers the installed modules before anything renders. Generated from modules.json; keep this import first.
import '@/modules';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AppErrorBoundary } from '@/components/ui/app-error-boundary';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { useQaTour } from '@/dev/use-qa-tour';
import { useColors, useColorSchemeName } from '@/hooks/use-colors';
import { registry, slots } from '@/modules/slots';
import { href } from '@/navigation/routes';
import { AppProviders } from '@/providers/app-providers';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Fonts the installed modules need before the first frame (a language module's script font). */
const FONTS = registry.fonts();

/**
 * Without the auth module there is one stack, `(app)`. With it, session states map one-to-one onto route groups:
 * `(auth)` while signed out, `(app)` once signed in or browsing as a guest. Add an onboarding group the same way: a
 * third `Stack.Protected` whose guard the auth module's gate reports.
 *
 * Every `Stack.Protected` names its `redirectTo`. Without it a failed guard falls back to the *containing* navigator's
 * anchor, and this root navigator has none — a signed-out launch then opens on "not found".
 */
function AppNavigation({ fontsReady }: { fontsReady: boolean }) {
  const gate = slots.useRootGate();
  const ready = fontsReady && gate.ready;
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
      <View testID="app-root" style={{ flex: 1 }}>
        {/* Screens and Protected groups must be the Stack's direct children: a fragment here crashes at launch. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          {gate.signInHref ? (
            <Stack.Protected guard={!gate.inApp} redirectTo={href.home()}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          ) : null}
          {gate.signInHref ? (
            <Stack.Protected guard={gate.inApp} redirectTo={gate.signInHref}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          ) : (
            <Stack.Screen name="(app)" />
          )}
          <Stack.Screen name="+not-found" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
      <OfflineBanner />
    </ThemeProvider>
  );
}

function Root() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
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
