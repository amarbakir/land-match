import { z } from 'zod';

// Normalize email at the contract boundary so case/whitespace variants map to a
// single account on both register and login (e.g. " Foo@X.com " === "foo@x.com").
// 254 is the RFC 5321 upper bound for a deliverable address.
const email = z.string().trim().toLowerCase().email().max(254);

export const RegisterRequest = z.object({
  email,
  // argon2 has no truncation limit; the cap just bounds hashing work per request
  password: z.string().min(8).max(128),
  // Stored and rendered into alert-email greetings — keep it name-sized.
  name: z.string().max(200).optional(),
});

export const LoginRequest = z.object({
  email,
  // Same hashing-work bound as register; a longer password can never match.
  password: z.string().max(128),
});

export const RefreshRequest = z.object({
  refreshToken: z.string(),
});

export const AuthTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export type RegisterRequestType = z.infer<typeof RegisterRequest>;
export type LoginRequestType = z.infer<typeof LoginRequest>;
export type RefreshRequestType = z.infer<typeof RefreshRequest>;
export type AuthTokenResponseType = z.infer<typeof AuthTokenResponse>;
