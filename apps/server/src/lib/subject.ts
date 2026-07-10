// Email-subject hygiene shared by the transport sink (lib/email.ts) and
// presentation-level callers. Lives in its own module so tests that mock
// lib/email don't lose it.
//
// Strips control chars (CRLF header-injection hygiene — Resend is a JSON API,
// but its MIME handling isn't ours to trust) and bounds the length WITHOUT
// splitting a surrogate pair (a lone surrogate renders as U+FFFD and can make
// strict JSON layers reject the payload).
export function sanitizeSubject(s: string, max: number): string {
  return s
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[\uD800-\uDBFF]$/, '');
}
