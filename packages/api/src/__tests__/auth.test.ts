import { describe, it, expect } from 'vitest';

import { LoginRequest, RegisterRequest } from '../auth';

describe('RegisterRequest password validation', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects passwords longer than 72 characters (bcrypt truncation limit)', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(73) });
    expect(result.success).toBe(false);
  });

  it('accepts a 72-character password', () => {
    const result = RegisterRequest.safeParse({ email: 'a@b.com', password: 'x'.repeat(72) });
    expect(result.success).toBe(true);
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
