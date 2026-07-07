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
const usePretty = nodeEnv !== 'production' && nodeEnv !== 'test';

export const logger = pino({
  level: resolveLogLevel(nodeEnv, process.env.LOG_LEVEL),
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
