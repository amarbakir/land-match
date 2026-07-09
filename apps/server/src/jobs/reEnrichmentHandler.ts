// AWS Lambda entrypoint for scheduled listing re-enrichment (sst.aws.Cron) —
// the deployed counterpart of the local node-cron scheduler, which never runs
// on Lambda stages.
// sort-imports-ignore — ../init must be imported first so Sentry initializes before other modules load
import '../init';

import { createCronHandler } from './cronHandler';
import { runReEnrichment } from './runReEnrichment';

export const handler = createCronHandler('re-enrichment', runReEnrichment);
