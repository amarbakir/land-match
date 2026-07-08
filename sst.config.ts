/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'landmatch',
      home: 'aws',
      removal: input.stage === 'production' ? 'retain' : 'remove',
      providers: {
        aws: {},
      },
    };
  },
  async run() {
    const stage = $app.stage;
    const isProduction = stage === 'production' || stage === 'staging';

    // ── Secrets ──────────────────────────────────────────────────────────

    const databaseUrl = new sst.Secret('DatabaseUrl');
    const directUrl = new sst.Secret('DirectUrl');
    const corsOrigin = new sst.Secret('CorsOrigin');
    const jwtSecret = new sst.Secret('JwtSecret');

    const allSecrets = [databaseUrl, directUrl, jwtSecret, corsOrigin];

    // ── Compute ──────────────────────────────────────────────────────────
    // Production/staging: Fargate (handles burst traffic, no cold starts)
    // Dev/beta: Lambda (cheap, fast deploys)
    let apiUrl: $util.Output<string>;

    if (isProduction) {
      const vpc = new sst.aws.Vpc('AppVpc');
      const cluster = new sst.aws.Cluster('AppCluster', { vpc });

      const service = cluster.addService('Api', {
        public: {
          ports: [{ listen: '443/https', forward: '3000/http' }],
        },
        link: allSecrets,
        dev: {
          command: 'pnpm dev:server',
        },
        environment: {
          NODE_ENV: stage === 'production' ? 'production' : 'development',
          DATABASE_URL: databaseUrl.value,
          DIRECT_URL: directUrl.value,
          CORS_ORIGIN: corsOrigin.value,
          JWT_SECRET: jwtSecret.value,
          // Behind the ALB: client IP is the rightmost X-Forwarded-For hop
          TRUST_PROXY: 'true',
          // Windows must be shared across tasks or limits multiply with scale
          RATE_LIMIT_STORE: 'postgres',
        },
      });

      apiUrl = service.url;
    } else {
      const api = new sst.aws.Function('Api', {
        handler: 'apps/server/src/lambda.handler',
        runtime: 'nodejs22.x',
        // argon2 is a native addon — install it into the Lambda bundle instead
        // of letting esbuild try (and fail) to inline the .node binary
        nodejs: { install: ['argon2'] },
        memory: '512 MB',
        timeout: '30 seconds',
        link: allSecrets,
        url: true,
        environment: {
          NODE_ENV: 'development',
          DATABASE_URL: databaseUrl.value,
          DIRECT_URL: directUrl.value,
          CORS_ORIGIN: corsOrigin.value,
          JWT_SECRET: jwtSecret.value,
          // Each Lambda container has its own memory — share windows in Postgres
          // (client IP comes from the Function URL event's sourceIp, no proxy trust needed)
          RATE_LIMIT_STORE: 'postgres',
        },
      });

      apiUrl = api.url;
    }

    return { apiUrl };
  },
});
