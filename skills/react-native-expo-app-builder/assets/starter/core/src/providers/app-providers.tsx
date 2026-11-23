import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LanguageProvider } from '@/i18n/provider';
import { ApiError } from '@/lib/api';
import { startConnectivity } from '@/lib/connectivity';
import { registry } from '@/modules/slots';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnReconnect: true,
      // Retry only what can succeed on a second try: never a 400/401/403/404 or a guest's AUTH_REQUIRED.
      retry: (failureCount, error) => {
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 400 || status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt, error) => {
        const base = error instanceof ApiError && error.status === 429 ? 2_000 : 800;
        return Math.min(8_000, base * 2 ** attempt);
      },
    },
    mutations: { retry: false },
  },
});

function QueryLifecycle() {
  // Online/offline for react-query and the banner: NetInfo plus the app's own evidence (`lib/connectivity`).
  useEffect(() => startConnectivity(), []);
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
    return () => subscription.remove();
  }, []);
  return null;
}

/** Core providers, then each installed module's provider in module order (auth first, so the others can read the user). */
export function AppProviders({ children }: PropsWithChildren) {
  const tree = registry.providers().reduceRight((inner, Provider) => <Provider>{inner}</Provider>, children);
  const content = (
    <>
      <QueryLifecycle />
      <LanguageProvider>{tree}</LanguageProvider>
    </>
  );
  const wrapQuery = registry.queryWrapper();
  return <SafeAreaProvider>{wrapQuery ? wrapQuery(queryClient, content) : <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>}</SafeAreaProvider>;
}
