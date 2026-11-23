import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Storage from 'expo-sqlite/kv-store';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { APP_VERSION } from '@/config/env';
import { LanguageProvider } from '@/i18n/provider';
import { ApiError } from '@/lib/api';
import { startConnectivity } from '@/lib/connectivity';
import { AuthProvider } from '@/providers/auth-provider';

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

const persister = createAsyncStoragePersister({ storage: Storage, key: 'app.query-cache', throttleTime: 1_000 });

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

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 30 * 24 * 60 * 60_000,
          // A new app version never reads the previous version's cache shapes.
          buster: APP_VERSION,
          // Opt-in per query (`meta: { persist: true }`): only what should be readable offline is written to disk.
          dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === 'success' && query.meta?.persist === true },
        }}>
        <QueryLifecycle />
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
