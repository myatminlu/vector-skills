import { itemsApi } from './items';

/** One object per backend domain the core uses. Modules keep their own (`src/modules/<name>/api.ts`). Screens import an API, never `fetch`. */
export const api = {
  items: itemsApi,
} as const;

export { onUnauthorized, refreshAccessToken } from './client';
export { ApiError, AUTH_REQUIRED, getApiErrorMessage, hasApiCode, isNetworkError, isUnauthorizedError, isValidationError } from './errors';
