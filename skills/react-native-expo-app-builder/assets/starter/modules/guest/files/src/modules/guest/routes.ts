import type { Href } from 'expo-router';

export const guestHref = {
  /** A guest tried something that needs an account (see `useGuestRequireAccount`). */
  loginRequired: (feature: string) => ({ pathname: '/login-required', params: { feature } }) as Href,
} as const;
