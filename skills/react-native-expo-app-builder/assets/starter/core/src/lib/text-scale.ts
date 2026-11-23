/**
 * Text scaling maths shared by every text element. The in-app multiplier comes from `slots.useTextScale()` (1 unless
 * the text-size module is installed) and multiplies with the phone's own font scale, so each text keeps the total
 * growth its layout was built for.
 */

/** A design size at the chosen scale, on the half-point grid. */
export function scaleFontSize(size: number, scale: number): number {
  return Math.round(size * scale * 2) / 2;
}

/**
 * `maxFontSizeMultiplier` for text already drawn at `scale` times its design size: `limit` is the total growth the
 * layout allows, so the phone's font scale gets only what the in-app size has not used. Never below 1 — React Native
 * treats a multiplier under 1 as "no limit" — except a `limit` of 0, which asks for exactly that.
 */
export function fontScaleCap(limit: number, scale: number): number {
  return limit === 0 ? 0 : Math.max(1, limit / scale);
}
