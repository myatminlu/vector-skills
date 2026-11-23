import type { AppConfig } from '@/types/api';

import { streamAnswer } from './ask';
import { authApi } from './auth';
import { requestJson } from './client';
import { itemsApi, savedApi } from './items';

/** One object per backend domain. Screens import `api`, never `fetch`. */
export const api = {
  auth: authApi,
  items: itemsApi,
  saved: savedApi,
  ask: { stream: streamAnswer },
  appConfig: {
    get: (opts: { signal?: AbortSignal } = {}) => requestJson<AppConfig>('/app-config', { signal: opts.signal }, { authenticated: false }),
  },
} as const;

export { onUnauthorized, refreshAccessToken } from './client';
export { ApiError, AUTH_REQUIRED, getApiErrorMessage, getSignInErrorMessage, hasApiCode, isNetworkError, isUnauthorizedError, isValidationError } from './errors';
