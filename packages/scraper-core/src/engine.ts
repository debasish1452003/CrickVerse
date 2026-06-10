import type { CrawlJob } from "@crickverse/types";
import { ContentPathMissingError } from "./errors";
import { getByPaths } from "./fetcher/extract";
import type { DescriptorRegistry } from "./registry";
import type { EngineDeps } from "./types";

/**
 * The crawl loop for a single job:
 *   fetch -> extract -> parse -> validate -> persist -> discover -> enqueue(next)
 *
 * `fetcher`, `persist`, and `enqueue` are injected so scraper-core stays
 * decoupled from Prisma and the worker's queue.
 */
export class ScrapeEngine {
  constructor(
    private readonly registry: DescriptorRegistry,
    private readonly deps: EngineDeps,
  ) {}

  async process(job: CrawlJob): Promise<{ discovered: CrawlJob[] }> {
    const descriptor = this.registry.get(job.pageType);
    const url = descriptor.buildUrl(job.params);

    const { json } = await this.deps.fetcher(url, {
      forceRefetch: job.forceRefetch ?? false,
      pageType: job.pageType,
    });

    const content = getByPaths(json, descriptor.extractPaths);
    if (content === undefined) {
      throw new ContentPathMissingError(url, descriptor.extractPaths);
    }

    const parsed = descriptor.parse(content, job.params);
    const valid = descriptor.validate(parsed);

    await this.deps.persist(job.pageType, valid);

    const discovered = descriptor.discover(valid, { mode: job.mode, depth: job.depth });
    if (discovered.length > 0) {
      await this.deps.enqueue(discovered);
    }

    this.deps.logger?.info(`processed ${job.pageType}`, {
      url,
      discovered: discovered.length,
    });

    return { discovered };
  }
}
