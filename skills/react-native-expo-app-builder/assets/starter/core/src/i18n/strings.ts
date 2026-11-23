/**
 * English strings of the core. Each module keeps its own next to its code (`src/modules/<name>/strings.ts`); every
 * installed language must have every key — `npm test` fails otherwise.
 */
export const coreStrings = {
  common_cancel: 'Cancel',
  common_retry: 'Try again',
  common_loading: 'Loading…',
  common_offline: 'No internet connection',
  common_close: 'Close',
  err_generic: 'Something went wrong. Please try again.',
  err_network: 'Could not reach the server. Check your connection and try again.',
  err_timeout: 'That took too long. Please try again.',
  err_session: 'Your session has ended. Please sign in again.',
  err_login_required: 'You need to sign in to use this.',
  err_forbidden: 'You are not allowed to do this.',
  err_not_found: 'Not found.',
  err_file_too_large: 'That file is too large.',
  err_rate_limit: 'Too many requests. Wait a moment and try again.',
  err_storage: "This phone's secure storage is not available.",
  err_boundary_title: 'Something went wrong',
  err_boundary_body: 'This screen could not be shown. Please try again.',
  notfound_title: 'This screen does not exist',
  notfound_home: 'Go home',
  home_title: 'Home',
  home_empty: 'Nothing here yet',
  home_account: 'Account',
  account_title: 'Account',
  account_language: 'Language',
  account_privacy: 'Privacy policy',
  account_terms: 'Terms of use',
  account_version: 'Version {version}',
} as const;
