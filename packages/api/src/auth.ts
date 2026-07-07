import { z } from 'zod';

// Normalize email at the contract boundary so case/whitespace variants map to a
// single account on both register and login (e.g. " Foo@X.com " === "foo@x.com").
const email = z.string().trim().toLowerCase().email();

export const RegisterRequest = z.object({
  email,
  // bcrypt truncates beyond 72 bytes, so longer passwords must be rejected
  password: z.string().min(8).max(72),
  name: z.string().optional(),
});

export const LoginRequest = z.object({
  email,
  password: z.string(),
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
