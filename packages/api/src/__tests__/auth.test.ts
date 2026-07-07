import { describe, it, expect } from 'vitest';

import { RegisterRequest } from '../auth';

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
