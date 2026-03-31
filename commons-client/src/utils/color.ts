// utils/color.ts — Shared color helpers
//
// Extracted from warthog.ts and walker.ts to eliminate the duplicate
// lightenHex / lightenColor implementations.

/**
 * Returns an rgb(...) string that is `amount` units brighter than `hex`.
 * Works with both 3- and 6-digit hex strings (with or without leading #).
 */
export function lightenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const num = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8)  & 0xff) + amount);
  const b = Math.min(255, (num         & 0xff)  + amount);
  return `rgb(${r},${g},${b})`;
}
