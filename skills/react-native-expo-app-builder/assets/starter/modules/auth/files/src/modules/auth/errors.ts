import { i18n } from '@/i18n';
import { ApiError, getApiErrorMessage } from '@/lib/api';

/** Sign-in answers 401 for a wrong password — that is not an expired session. */
export function getSignInErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400)) return i18n.t('err_sign_in');
  return getApiErrorMessage(error);
}
