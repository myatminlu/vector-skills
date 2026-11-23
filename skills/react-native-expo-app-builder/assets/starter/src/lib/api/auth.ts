import type { AuthResponse, User } from '@/types/api';

import { jsonBody, requestJson, requestVoid } from './client';

type Opts = { signal?: AbortSignal };

export const authApi = {
  /** Public. A 401 here means wrong credentials, not an expired session. */
  login: (input: { email: string; password: string }) => requestJson<AuthResponse>('/auth/login', jsonBody(input), { authenticated: false }),
  me: (opts: Opts = {}) => requestJson<User>('/auth/me', { signal: opts.signal }),
  logout: () => requestVoid('/auth/logout', { method: 'POST' }),
  /** Both stores require in-app account deletion wherever accounts can be created. */
  deleteMe: () => requestVoid('/auth/me', { method: 'DELETE' }),
};
