import type { Logger } from '../lib/logger';

export type Env = {
  Variables: {
    requestId: string;
    startTime: number;
    userId: string;
    logger: Logger;
  };
};
