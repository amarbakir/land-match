import type { LambdaRequestEnv } from '../middleware/rateLimit';

/**
 * Fabricates the hono/aws-lambda binding for a request, the way a Lambda
 * Function URL invocation carries the AWS-stamped client IP. Typed with the
 * middleware's own LambdaRequestEnv so shape drift is a compile error.
 */
export function lambdaEnv(sourceIp: string): LambdaRequestEnv {
  return { event: { requestContext: { http: { sourceIp } } } };
}
