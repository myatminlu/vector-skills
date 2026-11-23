/**
 * In-app text size: one multiplier on every font size. It works like the phone's own font-size setting but for this
 * app only, and the two multiply — so each text keeps the total growth its layout was built for (`fontScaleCap`).
 * Pure maths; the stored choice lives in `text-size-store`.
 */

/** Selectable stops, as a percentage of the default size. */
export const TEXT_SIZES = [90, 100, 115, 130] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: TextSize = 100;

/**
 * What 100% draws, as a multiple of the design sizes in `TypeScale`. If users say the text is small (it happened on
 * the project this template comes from), raise this one number rather than every size in the type scale.
 */
export const TEXT_SCALE_BASE = 1;

/** The stop nearest to `value` — whatever an earlier version left in storage. */
export function nearestTextSize(value: number): TextSize {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_SIZE;
  return TEXT_SIZES.reduce((best, size) => (Math.abs(size - value) < Math.abs(best - value) ? size : best));
}

export function parseTextSize(stored: string | null | undefined): TextSize {
  return stored ? nearestTextSize(Number(stored)) : DEFAULT_TEXT_SIZE;
}

export function textScaleFor(size: TextSize): number {
  return (TEXT_SCALE_BASE * size) / 100;
}

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
