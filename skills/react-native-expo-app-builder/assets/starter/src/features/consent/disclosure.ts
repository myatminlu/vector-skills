/**
 * What the consent sheet discloses. Fill it from the project's data inventory (docs/DATA_INVENTORY.md): who receives
 * the data and what exactly is sent. The privacy policy and both stores' privacy forms must say the same.
 *
 * Raise CONSENT_VERSION whenever the provider or the data sent changes: every earlier answer stops counting and
 * everyone is asked again.
 */
export const CONSENT_VERSION = 1;

/** Named in the sheet and in Account. App Review wants the recipient identified, not "a partner". */
export const AI_PROVIDER_NAME = 'Example AI';
