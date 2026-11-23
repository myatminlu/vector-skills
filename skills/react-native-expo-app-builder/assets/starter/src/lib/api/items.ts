import type { Item, Page, SavedItem } from '@/types/api';

import { buildQuery, jsonBody, requestJson, requestVoid } from './client';

type Opts = { signal?: AbortSignal };

export const itemsApi = {
  /** Public: what a guest can browse. */
  list: (params: { page?: number; limit?: number } = {}, opts: Opts = {}) => requestJson<Page<Item>>(`/items${buildQuery(params)}`, { signal: opts.signal }, { authenticated: false }),
  get: (id: string, opts: Opts = {}) => requestJson<Item>(`/items/${encodeURIComponent(id)}`, { signal: opts.signal }, { authenticated: false }),
};

export const savedApi = {
  list: (opts: Opts = {}) => requestJson<SavedItem[]>('/me/saved', { signal: opts.signal }),
  add: (itemId: string) => requestJson<SavedItem>('/me/saved', jsonBody({ itemId })),
  remove: (itemId: string) => requestVoid(`/me/saved/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
};
