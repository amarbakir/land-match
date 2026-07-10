import { describe, it, expect } from 'vitest';

import { LoginRequest, RegisterRequest } from '../auth';

describe('RegisterRequest password validation', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects passwords longer than 128 characters (bounds hashing work per request)', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) });
    expect(result.success).toBe(false);
  });

  it('accepts a 128-character password', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(128) });
    expect(result.success).toBe(true);
  });
});

describe('login and field length caps', () => {
  // Bug these catch (tcd.3 audit): LoginRequest had no password cap while
  // register enforces 128 — login would argon2-hash up to a 100KB body's
  // worth of password per request. A >128 login can never succeed anyway.
  it('rejects login passwords longer than 128 characters', () => {
    const result = LoginRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) });
    expect(result.success).toBe(false);
  });

  it('accepts a 128-character login password', () => {
    const result = LoginRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(128) });
    expect(result.success).toBe(true);
  });

  it('rejects emails longer than 254 characters (RFC upper bound)', () => {
    const long = `${'x'.repeat(250)}@example.com`;
    expect(RegisterRequest.safeParse({ email: long, password: 'password123' }).success).toBe(false);
    expect(LoginRequest.safeParse({ email: long, password: 'password123' }).success).toBe(false);
  });

  it('rejects names longer than 200 characters (stored + rendered in alert emails)', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'password123', name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('email normalization', () => {
  // Bug this catches: without trim()+toLowerCase() at the schema boundary, the
  // service does an exact-match lookup, so " Foo@X.com " registers a second
  // account distinct from "foo@x.com" and the user can't log back in with a
  // differently-cased address.
  it('lowercases and trims the email on register', () => {
    const result = RegisterRequest.safeParse({ email: '  Foo@Example.COM ', password: 'password123' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('foo@example.com');
  });

  it('lowercases and trims the email on login', () => {
    const result = LoginRequest.safeParse({ email: ' USER@Example.com', password: 'x' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('still rejects a value that is not an email after normalization', () => {
    const result = LoginRequest.safeParse({ email: 'not-an-email', password: 'x' });
    expect(result.success).toBe(false);
  });
});
