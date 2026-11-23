/**
 * Remote switches from `GET /app-config`. The point: an owner can hide a feature (or a payment channel during App
 * Review) without shipping a build. Each flag has a documented fallback that applies when nothing was fetched yet,
 * the key is missing, or the value is not a boolean.
 */
export const FLAGS = {
  askEnabled: { key: 'ask.enabled', fallback: true },
} as const;

export type Flags = { [K in keyof typeof FLAGS]: boolean };

/** `"false"` strings never count as on: only a real boolean overrides the fallback. */
export function readBoolean(config: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function flagsFrom(config: Record<string, unknown> | undefined): Flags {
  return Object.fromEntries(Object.entries(FLAGS).map(([name, flag]) => [name, readBoolean(config, flag.key, flag.fallback)])) as Flags;
}
