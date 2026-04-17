/**
 * Shared error codes — used by both server and client.
 * Add domain-specific error codes here as the project grows.
 */
export const ErrorCode = {
  // Generic HTTP errors
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Human-readable error messages for each error code.
 */
export const ErrorMessage: Record<ErrorCodeType, string> = {
  BAD_REQUEST: 'Bad request',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource conflict',
  INTERNAL_ERROR: 'Internal server error',
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  USER_NOT_FOUND: 'User not found',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
};
