// AWS Lambda entrypoint for scheduled alert delivery (sst.aws.Cron) — the
// deployed counterpart of the local node-cron scheduler, which never runs on
// Lambda stages.
// sort-imports-ignore — ../init must be imported first so Sentry initializes before other modules load
import '../init';

import { createCronHandler } from './cronHandler';
import { runDelivery } from './runDelivery';

export const handler = createCronHandler('alert delivery', runDelivery);
