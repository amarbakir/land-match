import cron from 'node-cron';
import { createLandWatchAdapter, createLandComAdapter, type FeedAdapter } from '@landmatch/feeds';

import { feedPipeline } from '../config';
import { runPipeline } from '../services/feedPipelineService';

let jobRunning = false;

function buildAdapters(): FeedAdapter[] {
  const adapters: FeedAdapter[] = [];

  if (feedPipeline.landwatchFeedUrl) {
    adapters.push(createLandWatchAdapter({ feedUrl: feedPipeline.landwatchFeedUrl }));
  }
  if (feedPipeline.landComFeedUrl) {
    adapters.push(createLandComAdapter({ feedUrl: feedPipeline.landComFeedUrl }));
  }

  return adapters;
}

export function startScheduler(): void {
  const adapters = buildAdapters();

  if (adapters.length === 0) {
    console.log('[scheduler] No feed URLs configured — feed pipeline disabled');
    return;
  }

  console.log(
    `[scheduler] Starting feed pipeline cron: ${feedPipeline.cronSchedule} (${adapters.map((a) => a.name).join(', ')})`,
  );

  cron.schedule(feedPipeline.cronSchedule, async () => {
    if (jobRunning) {
      console.log('[scheduler] Skipping — previous run still in progress');
      return;
    }

    jobRunning = true;
    const startTime = Date.now();

    try {
      console.log('[scheduler] Feed pipeline run starting');
      const result = await runPipeline(adapters);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(
        `[scheduler] Feed pipeline complete in ${elapsed}s: ` +
        `ingested=${result.ingested} enriched=${result.enriched} ` +
        `matched=${result.matched} alerts=${result.alertsCreated} ` +
        `errors=${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn('[scheduler] Errors:', result.errors.slice(0, 10));
      }
    } catch (error) {
      console.error('[scheduler] Feed pipeline failed:', error);
    } finally {
      jobRunning = false;
    }
  });
}
