import type { Logger, ScrapeEngine } from "@crickverse/scraper-core";
import type { CrawlJob } from "@crickverse/types";

const jobKey = (job: CrawlJob): string => `${job.pageType}:${JSON.stringify(job.params)}`;

/**
 * In-process crawl queue (v1). Dedupes jobs by (pageType, params), processes
 * them one at a time, and lets the engine's `enqueue` push discovered jobs back
 * in for fan-out. Outbound politeness is enforced by the fetcher's p-queue, so a
 * simple sequential drain here is already rate-limited. A BullMQ-backed queue
 * can replace this behind the same enqueue/drain shape when scale demands it.
 */
export class CrawlRunner {
  private queue: CrawlJob[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly logger?: Logger) {}

  enqueue = (jobs: CrawlJob[]): void => {
    for (const job of jobs) {
      const key = jobKey(job);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.queue.push(job);
    }
  };

  async drain(engine: ScrapeEngine): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await engine.process(job);
        processed += 1;
      } catch (err) {
        errors += 1;
        this.logger?.error(`job failed: ${job.pageType}`, {
          params: job.params,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { processed, errors };
  }
}
