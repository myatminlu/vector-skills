import type { Href } from 'expo-router';

/** What is sent to the AI provider, and the user's permission for it (see `ensureConsent`). */
export const consentHref = () => '/consent' as Href;
