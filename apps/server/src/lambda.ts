// AWS Lambda entrypoint — used by SST for dev/beta stages
// sort-imports-ignore — ./init must be imported first so Sentry initializes before other modules load
import './init';

import { handle } from 'hono/aws-lambda';

import { createApp } from './app';

const app = createApp();

export const handler = handle(app);
