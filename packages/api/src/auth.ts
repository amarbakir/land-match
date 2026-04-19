import { z } from 'zod';

export const RegisterRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const LoginRequest = z.object({
  email: z.string().email(),
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
