import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { clientPlatform } from '@/lib/api/client';
import { qk } from '@/lib/query-keys';

import { type Flags, flagsFrom } from './resolve';

/** Persisted so an offline launch keeps the last answer; refreshed within a minute so an admin's toggle lands fast. */
export function useAppConfig() {
  return useQuery({
    queryKey: qk.appConfig(clientPlatform() ?? 'all'),
    queryFn: ({ signal }) => api.appConfig.get({ signal }),
    staleTime: 60_000,
    meta: { persist: true },
  });
}

export function useFlags(): Flags {
  return flagsFrom(useAppConfig().data?.config);
}
