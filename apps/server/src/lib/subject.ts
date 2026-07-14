import { truncateUtf16Safe } from '@landmatch/api';

// Email-subject hygiene shared by the transport sink (lib/email.ts) and
// presentation-level callers. Lives in its own module so tests that mock
// lib/email don't lose it.
//
// Strips control chars (CRLF header-injection hygiene — Resend is a JSON API,
// but its MIME handling isn't ours to trust) and bounds the length without
// splitting a surrogate pair.
export function sanitizeSubject(s: string, max: number): string {
  return truncateUtf16Safe(s.replace(/[\x00-\x1f\x7f]+/g, ' ').trim(), max);
}
