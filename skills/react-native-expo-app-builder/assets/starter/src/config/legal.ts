import Constants from 'expo-constants';

/**
 * Legal links and the support address come from `app.json` → `extra.legal`, not from `.env`: the store listings must
 * show the same URLs, and a stale `.env` on one machine silently shipping a different privacy page is exactly how
 * they drift. A store build refuses to start while they are still the template's placeholders (app.config.js).
 */
type Legal = { privacyUrl: string; termsUrl: string; supportEmail: string };

const legal = (Constants.expoConfig?.extra?.legal ?? {}) as Partial<Legal>;

export const PRIVACY_URL = legal.privacyUrl ?? '';
export const TERMS_URL = legal.termsUrl ?? '';
export const SUPPORT_EMAIL = legal.supportEmail ?? '';
