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
    const resendApiKey = new sst.Secret('ResendApiKey');

    const allSecrets = [databaseUrl, directUrl, jwtSecret, corsOrigin, resendApiKey];

    // Config shared by every compute unit (API + cron): config.ts resolves
    // all of these at import time, so the cron handler needs the full set.
    const baseEnvironment = {
      NODE_ENV: stage === 'production' ? 'production' : 'development',
      DATABASE_URL: databaseUrl.value,
      DIRECT_URL: directUrl.value,
      CORS_ORIGIN: corsOrigin.value,
      JWT_SECRET: jwtSecret.value,
      RESEND_API_KEY: resendApiKey.value,
      // Rate-limit windows must be shared across instances (Fargate tasks /
      // Lambda containers) or effective limits multiply with concurrency
      RATE_LIMIT_STORE: 'postgres',
    };

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
          ...baseEnvironment,
          // Behind the ALB: client IP is the rightmost X-Forwarded-For hop
          TRUST_PROXY: 'true',
          // Deployed: the AlertDelivery/ReEnrichment crons own these jobs. In
          // `sst dev` the service runs locally where those crons may not fire —
          // keep the in-process scheduler as the execution path there.
          EMAIL_INPROCESS_CRON: $dev ? 'true' : 'false',
          REENRICH_INPROCESS_CRON: $dev ? 'true' : 'false',
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
        // Client IP comes from the Function URL event's sourceIp — no proxy trust needed
        environment: baseEnvironment,
      });

      apiUrl = api.url;
    }

    // ── Alert delivery ───────────────────────────────────────────────────
    // Runs on every stage: the Lambda API never starts the in-process
    // scheduler, and Fargate disables it (EMAIL_INPROCESS_CRON=false), so
    // this cron is the single deployed delivery path. Concurrent/overlapping
    // runs are safe — alertRepo.claimPending partitions work via
    // FOR UPDATE SKIP LOCKED.
    new sst.aws.Cron('AlertDelivery', {
      // Deployed cadence. (EMAIL_CRON_SCHEDULE only tunes the local node-cron.)
      schedule: 'rate(5 minutes)',
      function: {
        handler: 'apps/server/src/jobs/alertDeliveryHandler.handler',
        runtime: 'nodejs22.x',
        memory: '512 MB',
        // Must stay well under alertRepo's STALE_CLAIM_MS (15 min) — a run
        // outliving that window gets its claims stolen → double-sends.
        timeout: '2 minutes',
        link: allSecrets,
        environment: baseEnvironment,
      },
    });

    // ── Listing re-enrichment ────────────────────────────────────────────
    // Retries listings whose enrichment is incomplete ('pending'/'partial'/
    // 'failed') so a vendor outage doesn't leave a cohort scored neutral
    // forever. Overlapping runs are safe (attempt caps bound the work) and
    // the handler stops picking up listings ahead of the Lambda deadline.
    new sst.aws.Cron('ReEnrichment', {
      // Deployed cadence. (REENRICH_CRON_SCHEDULE only tunes the local node-cron.)
      schedule: 'rate(1 hour)',
      function: {
        handler: 'apps/server/src/jobs/reEnrichmentHandler.handler',
        runtime: 'nodejs22.x',
        memory: '512 MB',
        // Sequential vendor calls (10s timeout + one retry each) over a batch
        // of 25 — generous ceiling, the deadline buffer exits cleanly first.
        timeout: '5 minutes',
        link: allSecrets,
        environment: baseEnvironment,
      },
    });

    return { apiUrl };
  },
});
