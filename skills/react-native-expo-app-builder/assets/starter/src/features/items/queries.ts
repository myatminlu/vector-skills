import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import type { SavedItem } from '@/types/api';

/** Public list — persisted, so it is readable offline and on a cold start before the network answers. */
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

/** Account-only. Disabled for guests rather than letting the request fail with AUTH_REQUIRED. */
export function useSaved() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.saved(user?.id ?? 'guest'),
    queryFn: ({ signal }) => api.saved.list({ signal }),
    enabled: Boolean(user),
  });
}

/** Optimistic: the button flips at once and rolls back if the server says no. */
export function useSaveItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = qk.saved(user?.id ?? 'guest');
  return useMutation({
    mutationFn: (itemId: string) => api.saved.add(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SavedItem[]>(key);
      queryClient.setQueryData<SavedItem[]>(key, (current) => [...(current ?? []), { itemId, savedAt: new Date().toISOString() }]);
      return { previous };
    },
    onError: (_error, _itemId, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
