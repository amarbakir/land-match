/**
 * Fabricates the hono/aws-lambda binding for a request, the way a Lambda
 * Function URL invocation carries the AWS-stamped client IP. Must stay in
 * shape-sync with lambdaSourceIp() in middleware/rateLimit.ts.
 */
export function lambdaEnv(sourceIp: string) {
  return { event: { requestContext: { http: { sourceIp } } } };
}
