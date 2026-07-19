/** Terms that must never be auto-submitted; also used to skip risky tags in discover. */
export const DENY_TAG_PATTERNS: RegExp[] = [
  /reboot/i,
  /restart/i,
  /reset/i,
  /restore/i,
  /factory/i,
  /firmware/i,
  /upgrade/i,
  /password/i,
  /credential/i,
  /\bwan\b/i,
  /\bpon\b/i,
  /loid/i,
  /registration/i,
  /dmz/i,
];

export function isDeniedTag(tag: string): boolean {
  return DENY_TAG_PATTERNS.some((re) => re.test(tag));
}

export function isDeniedUrl(url: string): boolean {
  return DENY_TAG_PATTERNS.some((re) => re.test(url));
}
