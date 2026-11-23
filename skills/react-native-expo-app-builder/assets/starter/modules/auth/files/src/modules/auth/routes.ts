import type { Href } from 'expo-router';

export const authHref = {
  signIn: () => '/sign-in' as Href,
  saved: () => '/saved' as Href,
  deleteAccount: () => '/delete-account' as Href,
} as const;
