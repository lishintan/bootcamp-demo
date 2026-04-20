/**
 * Security and compliance keyword detection.
 * Tickets matching these patterns are left as standalone and never merged into groups.
 * AC #5: Tickets that contain security or compliance keywords (in labels or body)
 * are left as individual tickets and not merged into any group.
 */

const SECURITY_COMPLIANCE_KEYWORDS: RegExp[] = [
  /\bsecurity\b/i,
  /\bcompliance\b/i,
  /\bprivacy\b/i,
  /\bpii\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
  /\bsoc\s*2\b/i,
  /\biso\s*27001\b/i,
  /\bhipaa\b/i,
  /\bvulnerability\b/i,
  /\bpenetration\s*test/i,
  /\bpen\s*test\b/i,
  /\bdata\s*breach\b/i,
  /\bexploit\b/i,
  /\binjection\b/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bauth(entication|orization)?\s+bypass\b/i,
  /\bsensitive\s+data\b/i,
  /\bencryption\b/i,
  /\bcve-\d{4}/i,
  /\baudit\s+log\b/i,
  /\bregulator(y)?\b/i,
];

/**
 * Returns true if the ticket contains security or compliance keywords
 * in its labels or body text.
 */
export function isSecurityOrComplianceTicket(
  labels: string[],
  bodyText: string | null
): boolean {
  const labelStr = labels.join(' ');
  const combined = `${labelStr} ${bodyText ?? ''}`;

  return SECURITY_COMPLIANCE_KEYWORDS.some((pattern) => pattern.test(combined));
}
