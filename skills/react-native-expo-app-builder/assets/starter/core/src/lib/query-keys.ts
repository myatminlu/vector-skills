/**
 * Query key factory. Everything that belongs to a user lives under `['users', uid, …]` and everything public under
 * `['public', …]`, so sign-out clears exactly the user's data, two accounts on one phone never share a cache, and a
 * guest keeps the public cache they were browsing. Modules add their keys in the same two trees.
 */
export const qk = {
  items: () => ['public', 'items'] as const,
  item: (id: string) => ['public', 'item', id] as const,
} as const;
