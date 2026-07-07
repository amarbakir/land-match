import 'dotenv/config';
import pino from 'pino';

export type { Logger } from 'pino';

/**
 * Reads env directly (not config.ts) so config.ts can log without a
 * circular import. LOG_LEVEL wins; otherwise test → silent,
 * production → info, else debug.
 */
export function resolveLogLevel(
  nodeEnv: string | undefined,
  logLevel: string | undefined,
): string {
  if (logLevel) return logLevel;
  if (nodeEnv === 'test') return 'silent';
  if (nodeEnv === 'production') return 'info';
  return 'debug';
}

const nodeEnv = process.env.NODE_ENV;
// pino-pretty is a devDependency and isn't bundled for deployed Lambda/Fargate
// stages (which run with NODE_ENV=development). Gate on isTTY too so only an
// interactive local terminal gets pretty output; pipes/bundles/remote runtimes
// fall back to JSON.
const usePretty = nodeEnv !== 'production' && nodeEnv !== 'test' && Boolean(process.stdout.isTTY);

export const logger = pino({
  level: resolveLogLevel(nodeEnv, process.env.LOG_LEVEL),
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
