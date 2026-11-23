import { type Href, router } from 'expo-router';

/**
 * Typed href builders: screens never hand-write paths, and every screen has a deep link (`expostarter:///item/1`).
 * The deep links are also how tests and the QA tour put the app into a state without tapping.
 */
export const href = {
  signIn: () => '/(auth)/sign-in' as Href,
  home: () => '/(app)/(tabs)' as Href,
  account: () => '/(app)/(tabs)/account' as Href,
  item: (id: string) => ({ pathname: '/(app)/item/[id]', params: { id } }) as Href,
  ask: (params?: { itemId?: string }) => ({ pathname: '/(app)/ask', params }) as Href,
  saved: () => '/(app)/saved' as Href,
  gallery: () => '/(app)/dev/gallery' as Href,
  sheet: {
    /** A guest tried something that needs an account (see `useRequireAccount`). */
    loginRequired: (feature: string) => ({ pathname: '/(app)/(sheets)/login-required', params: { feature } }) as Href,
    /** What is sent to the AI provider, and the user's permission for it (see `ensureConsent`). */
    consent: () => '/(app)/(sheets)/consent' as Href,
    deleteAccount: () => '/(app)/(sheets)/delete-account' as Href,
  },
} as const;

/**
 * Go to a tab root from anywhere. From a screen stacked above the tabs a plain `navigate` would push a second copy of
 * the tab navigator, so whatever sits above it is dismissed first.
 */
export function navigateToTab(target: Href): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(target);
}
