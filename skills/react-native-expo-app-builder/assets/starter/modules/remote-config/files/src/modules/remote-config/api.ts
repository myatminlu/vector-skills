import { requestJson } from '@/lib/api/client';

import type { AppConfig } from './types';

/** Public: switches apply before sign-in too. The server may key them on the `X-Client-Platform` header the client sends. */
export const appConfigApi = {
  get: (opts: { signal?: AbortSignal } = {}) => requestJson<AppConfig>('/app-config', { signal: opts.signal }, { authenticated: false }),
};
