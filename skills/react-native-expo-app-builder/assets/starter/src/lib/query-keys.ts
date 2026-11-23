/**
 * Query key factory. Everything that belongs to a user lives under `['users', uid, …]` and everything public under
 * `['public', …]`, so sign-out clears exactly the user's data, two accounts on one phone never share a cache, and a
 * guest keeps the public cache they were browsing.
 */
export const qk = {
  me: (uid: string) => ['users', uid, 'me'] as const,
  saved: (uid: string) => ['users', uid, 'saved'] as const,
  items: () => ['public', 'items'] as const,
  item: (id: string) => ['public', 'item', id] as const,
  appConfig: (platform: string) => ['public', 'app-config', platform] as const,
} as const;
