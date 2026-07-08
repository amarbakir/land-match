import { describe, expect, it } from 'vitest';

import { ApiErrorEnvelope, ApiSuccessEnvelope } from '../result';

describe('ApiErrorEnvelope', () => {
  it('accepts the canonical server error shape', () => {
    const parsed = ApiErrorEnvelope.safeParse({
      ok: false,
      code: 'NOT_FOUND',
      error: 'Resource not found',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a missing code', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: false, error: 'boom' }).success).toBe(true);
  });

  it('rejects ok: true', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: true, error: 'boom' }).success).toBe(false);
  });

  it('rejects a non-string error field', () => {
    expect(
      ApiErrorEnvelope.safeParse({ ok: false, error: { message: 'boom' } }).success,
    ).toBe(false);
  });

  it('rejects a body with no error field', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: false, message: 'boom' }).success).toBe(false);
  });
});

describe('ApiSuccessEnvelope', () => {
  it('accepts the canonical server success shape', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: true, data: { id: '1' } }).success).toBe(true);
  });

  it('accepts an absent data key', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: true }).success).toBe(true);
  });

  it('rejects ok: false', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: false, data: {} }).success).toBe(false);
  });
});
