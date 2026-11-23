import { i18n } from '@/i18n';
import { StorageError } from '@/lib/storage-error';

/** The error envelope the backend sends. Check it against the backend's OpenAPI `ErrorResponse` and adjust once. */
type ApiErrorPayload = {
  code?: string;
  error?: string;
  message?: string | string[];
  traceId?: string;
  details?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly traceId?: string,
    public readonly messages?: string[],
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseApiError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  const messages = Array.isArray(payload.message) ? payload.message : undefined;
  const message = messages ? messages.join('\n') : (typeof payload.message === 'string' && payload.message) || payload.error || `Request failed (${response.status})`;
  const details = payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details) ? (payload.details as Record<string, unknown>) : null;
  return new ApiError(message, response.status, payload.code, payload.traceId, messages, details);
}

/** Codes are stable; messages are not. Branch on the code — and ask the backend for one where it only sends text. */
export function hasApiCode(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}

export function isValidationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400;
}

/** Offline, DNS, refused, or timed out — never the server's answer. A session must never end because of one. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 408);
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Code of the local error an account-only request gets while browsing as a guest (never sent to the server). */
export const AUTH_REQUIRED = 'AUTH_REQUIRED';

/** One place that turns any failure into text a person can act on, in their language. */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof StorageError) return i18n.t('err_storage');
  if (!(error instanceof ApiError)) {
    return typeof __DEV__ !== 'undefined' && __DEV__ && error instanceof Error && error.message ? `${i18n.t('err_generic')}\n${error.message}` : i18n.t('err_generic');
  }
  if (error.status === 0) return i18n.t('err_network');
  if (error.status === 408) return i18n.t('err_timeout');
  if (error.code === AUTH_REQUIRED) return i18n.t('err_login_required');
  if (error.status === 401) return i18n.t('err_session');
  if (error.status === 403) return i18n.t('err_forbidden');
  if (error.status === 404) return i18n.t('err_not_found');
  if (error.status === 413) return i18n.t('err_file_too_large');
  if (error.status === 429) return i18n.t('err_rate_limit');
  if (error.status === 400 && error.messages?.length) return error.messages.join('\n');
  return error.message || i18n.t('err_generic');
}

/** Sign-in answers 401 for a wrong password — that is not an expired session. */
export function getSignInErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400)) return i18n.t('err_sign_in');
  return getApiErrorMessage(error);
}
