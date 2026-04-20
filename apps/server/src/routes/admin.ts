import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { server } from '../config';
import { okResponse } from '../lib/httpExceptions';
import { buildAdapters, runPipeline } from '../services/feedPipelineService';
import type { Env } from '../types/env';

const admin = new Hono<Env>();

admin.post('/run-pipeline', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { useMockFeed } = body as { useMockFeed?: boolean };

  let mockFeedUrl: string | undefined;
  if (useMockFeed) {
    const origin = c.req.header('origin') || `http://localhost:${server.port}`;
    mockFeedUrl = `${origin}/api/v1/admin/mock-feed`;
  }

  const adapters = buildAdapters({ mockFeedUrl });

  if (adapters.length === 0) {
    return c.json({ ok: false, code: 'NO_ADAPTERS', error: 'No feed adapters configured' }, 422);
  }

  const result = await runPipeline(adapters);
  return okResponse(c, result);
});

admin.get('/mock-feed', (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ ok: false, code: 'NOT_AVAILABLE', error: 'Mock feed not available in production' }, 403);
  }

  const xmlPath = resolve(__dirname, '../../../../packages/feeds/src/__tests__/fixtures/mock-feed.xml');
  const xml = readFileSync(xmlPath, 'utf-8');
  return c.body(xml, 200, { 'Content-Type': 'application/rss+xml' });
});

export default admin;
