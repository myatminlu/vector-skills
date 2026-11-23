/**
 * The API rejects `null` with 400 on every update field except the ones documented as nullable
 * (where `null` means "clear"), and rejects unknown keys. Build request bodies through this so an
 * optional piece of state that happens to be `null` never leaks into a payload.
 */
export function compactBody<T extends object>(body: T, nullable: readonly (keyof T & string)[] = []): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (value === null && !nullable.includes(key as keyof T & string)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
