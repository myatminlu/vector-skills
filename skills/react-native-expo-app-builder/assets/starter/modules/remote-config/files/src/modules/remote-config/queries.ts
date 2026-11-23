import { useQuery } from '@tanstack/react-query';

import { clientPlatform } from '@/lib/api/client';

import { appConfigApi } from './api';
import { readBoolean } from './resolve';

/** Persisted (with offline-cache) so an offline launch keeps the last answer; refreshed within a minute so an admin's toggle lands fast. */
export function useAppConfig() {
  return useQuery({
    queryKey: ['public', 'app-config', clientPlatform() ?? 'all'],
    queryFn: ({ signal }) => appConfigApi.get({ signal }),
    staleTime: 60_000,
    meta: { persist: true },
  });
}

/** The `slots.useFlag` this module installs. */
export function useRemoteFlag(key: string, fallback: boolean): boolean {
  return readBoolean(useAppConfig().data?.config, key, fallback);
}
