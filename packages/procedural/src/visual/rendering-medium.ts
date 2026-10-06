/** Only an explicit painted medium changes legacy pixel defaults. */
export function isPaintedStyle(style: string): boolean {
  return /\b(hand[ -]?painted|painterly|painted)\b/i.test(style) && !/\bpixel\b/i.test(style);
}
