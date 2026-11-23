import { type Href, router } from 'expo-router';

/**
 * Typed href builders for the core's screens: screens never hand-write paths, and every screen has a deep link
 * (`<scheme>:///item/1`). Paths are URLs, not route groups, so they hold with or without tabs. Modules keep their own
 * builders next to their code (`src/modules/<name>/routes.ts`).
 */
export const href = {
  home: () => '/' as Href,
  account: () => '/account' as Href,
  item: (id: string) => ({ pathname: '/item/[id]', params: { id } }) as Href,
  gallery: () => '/dev/gallery' as Href,
} as const;

/**
 * Go to a top-level screen from anywhere. From a screen stacked above the tabs a plain `navigate` would push a second
 * copy of the tab navigator, so whatever sits above it is dismissed first.
 */
export function navigateToTab(target: Href): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(target);
}
