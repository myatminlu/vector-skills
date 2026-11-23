import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { savedApi } from './api';
import { useAuth } from './session';
import type { SavedItem } from './types';

const savedKey = (uid: string) => ['users', uid, 'saved'] as const;

/** Account-only. Disabled while nobody is signed in rather than letting the request fail with AUTH_REQUIRED. */
export function useSaved() {
  const { user } = useAuth();
  return useQuery({
    queryKey: savedKey(user?.id ?? 'guest'),
    queryFn: ({ signal }) => savedApi.list({ signal }),
    enabled: Boolean(user),
  });
}

/** Optimistic: the button flips at once and rolls back if the server says no. */
export function useSaveItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = savedKey(user?.id ?? 'guest');
  return useMutation({
    mutationFn: (itemId: string) => savedApi.add(itemId),
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
