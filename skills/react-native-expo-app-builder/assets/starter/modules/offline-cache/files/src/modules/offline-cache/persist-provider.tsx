import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Storage from 'expo-sqlite/kv-store';
import type { PropsWithChildren, ReactNode } from 'react';

import { APP_VERSION } from '@/config/env';

const persister = createAsyncStoragePersister({ storage: Storage, key: 'app.query-cache', throttleTime: 1_000 });

/**
 * TanStack Query with an on-disk cache: what was last loaded stays readable offline and on a cold start before the
 * network answers. Opt-in per query (`meta: { persist: true }`), so only what should be readable offline is written.
 */
export function PersistQueryProvider({ client, children }: PropsWithChildren<{ client: QueryClient }>) {
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 30 * 24 * 60 * 60_000,
        // A new app version never reads the previous version's cache shapes.
        buster: APP_VERSION,
        dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === 'success' && query.meta?.persist === true },
      }}>
      {children}
    </PersistQueryClientProvider>
  );
}

/** The `wrapQuery` this module registers. */
export function wrapWithPersistence(client: QueryClient, children: ReactNode) {
  return <PersistQueryProvider client={client}>{children}</PersistQueryProvider>;
}
