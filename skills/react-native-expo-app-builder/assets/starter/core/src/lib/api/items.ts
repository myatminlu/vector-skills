import type { Item, Page } from '@/types/api';

import { buildQuery, requestJson } from './client';

type Opts = { signal?: AbortSignal };

/** The example's public content: what anyone can browse, signed in or not. Replace with the app's domains. */
export const itemsApi = {
  list: (params: { page?: number; limit?: number } = {}, opts: Opts = {}) => requestJson<Page<Item>>(`/items${buildQuery(params)}`, { signal: opts.signal }, { authenticated: false }),
  get: (id: string, opts: Opts = {}) => requestJson<Item>(`/items/${encodeURIComponent(id)}`, { signal: opts.signal }, { authenticated: false }),
};
