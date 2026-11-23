/**
 * Remote switches from `GET /app-config`. The point: an owner can hide a feature (or a payment channel during App
 * Review) without shipping a build. Every switch is read with a documented fallback that applies when nothing was
 * fetched yet, the key is missing, or the value is not a boolean — `slots.useFlag('ask.enabled', true)`.
 */

/** `"false"` strings never count as off: only a real boolean overrides the fallback. */
export function readBoolean(config: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = config?.[key];
  return typeof value === 'boolean' ? value : fallback;
}
