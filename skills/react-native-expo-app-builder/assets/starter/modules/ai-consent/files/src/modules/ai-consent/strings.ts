/** English strings of the ai-consent module. Every installed language must have them too — `npm test` checks. */
export const strings = {
  consent_title: 'Share your question with {provider}?',
  consent_body: 'To answer, we send {provider} your question and the item you are asking about. We do not send your name or email. You can turn this off at any time in Account.',
  consent_allow: 'Allow',
  consent_deny: 'Not now',
  account_ai_sharing: 'Sharing with {provider}',
  account_ai_on: 'Allowed',
  account_ai_off: 'Off',
  account_ai_withdraw: 'Turn off',
} as const;
