import { jsonBody, requestJson, requestVoid } from '@/lib/api/client';

import type { AuthResponse, SavedItem, User } from './types';

type Opts = { signal?: AbortSignal };

export const authApi = {
  /** Public. A 401 here means wrong credentials, not an expired session. */
  login: (input: { email: string; password: string }) => requestJson<AuthResponse>('/auth/login', jsonBody(input), { authenticated: false }),
  me: (opts: Opts = {}) => requestJson<User>('/auth/me', { signal: opts.signal }),
  logout: () => requestVoid('/auth/logout', { method: 'POST' }),
  /** Both stores require in-app account deletion wherever accounts can be created. */
  deleteMe: () => requestVoid('/auth/me', { method: 'DELETE' }),
};

/** The example of an account-only feature: items a user saved. */
export const savedApi = {
  list: (opts: Opts = {}) => requestJson<SavedItem[]>('/me/saved', { signal: opts.signal }),
  add: (itemId: string) => requestJson<SavedItem>('/me/saved', jsonBody({ itemId })),
  remove: (itemId: string) => requestVoid(`/me/saved/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
};
