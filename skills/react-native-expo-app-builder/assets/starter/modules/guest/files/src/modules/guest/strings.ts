/** English strings of the guest module. Every installed language must have them too — `npm test` checks. */
export const strings = {
  auth_continue_guest: 'Continue without an account',
  auth_guest_hint: 'You can look around without an account. Saving and asking questions need one.',
  login_title: 'Sign in to continue',
  login_body_saved: 'Sign in to keep what you save on every phone you use.',
  login_body_ask: 'Sign in to ask questions.',
  login_body_account: 'Sign in to manage your account.',
  login_action: 'Sign in',
  account_guest_title: 'You are not signed in',
  account_guest_body: 'Sign in to save items and ask questions.',
} as const;
