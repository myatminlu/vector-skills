import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** Public list — marked for persistence, so it is readable offline when the offline-cache module is installed. */
export function useItems() {
  return useQuery({
    queryKey: qk.items(),
    queryFn: ({ signal }) => api.items.list({ limit: 50 }, { signal }),
    meta: { persist: true },
  });
}

export function useItem(id: string) {
  return useQuery({ queryKey: qk.item(id), queryFn: ({ signal }) => api.items.get(id, { signal }), enabled: Boolean(id) });
}
