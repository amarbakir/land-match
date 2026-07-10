import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock('../config', () => ({
  email: { resendApiKey: 'test-key', fromAddress: 'alerts@test.landmatch' },
}));

import { sendEmail } from '../lib/email';

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('sendEmail subject sanitization (transport invariants)', () => {
  // Bug this catches: subject hygiene living only in alertDeliveryService —
  // the next email caller (password reset, welcome email) that interpolates
  // user text into a subject silently reopens CRLF/length exposure.
  it('strips control characters from the subject before handing it to Resend', async () => {
    await sendEmail({ to: 'a@b.com', subject: 'Hi\r\nBcc: x@y.com\tthere', html: '<p/>' });

    const sent = sendMock.mock.calls[0][0];
    expect(sent.subject).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(sent.subject).toContain('Hi');
    expect(sent.subject).toContain('there');
  });

  it('bounds the subject at the RFC 5322 line limit', async () => {
    await sendEmail({ to: 'a@b.com', subject: 'x'.repeat(5000), html: '<p/>' });

    expect(sendMock.mock.calls[0][0].subject.length).toBeLessThanOrEqual(998);
  });

  it('never leaves a split surrogate pair at the truncation point', async () => {
    // A lone surrogate is ill-formed UTF-16: it renders as U+FFFD and strict
    // JSON layers may reject the payload, failing the send.
    await sendEmail({ to: 'a@b.com', subject: `${'x'.repeat(997)}🌲`, html: '<p/>' });

    const subject = sendMock.mock.calls[0][0].subject;
    expect(subject).toBe('x'.repeat(997));
    expect(subject.isWellFormed?.() ?? true).toBe(true);
  });

  it('throws on a Resend error response', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });

    await expect(sendEmail({ to: 'a@b.com', subject: 'x', html: '<p/>' })).rejects.toThrow('rate limited');
  });
});
