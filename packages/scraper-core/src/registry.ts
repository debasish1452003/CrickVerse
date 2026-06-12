import type { PageType } from "@crickverse/types";
import { seriesFixturesDescriptor } from "./descriptors/series-fixtures";
import { scorecardDescriptor } from "./descriptors/scorecard";
import { playerProfileDescriptor } from "./descriptors/player-profile";
import { DescriptorNotFoundError } from "./errors";
import type { AnyDescriptor } from "./types";

/** Maps a page type to the descriptor that knows how to crawl it. */
export class DescriptorRegistry {
  private readonly map = new Map<PageType, AnyDescriptor>();

  register(descriptor: AnyDescriptor): this {
    this.map.set(descriptor.pageType, descriptor);
    return this;
  }

  get(pageType: PageType): AnyDescriptor {
    const descriptor = this.map.get(pageType);
    if (!descriptor) throw new DescriptorNotFoundError(pageType);
    return descriptor;
  }

  has(pageType: PageType): boolean {
    return this.map.has(pageType);
  }

  pageTypes(): PageType[] {
    return [...this.map.keys()];
  }
}

/** The default registry wired with every known descriptor. */
export function createDefaultRegistry(): DescriptorRegistry {
  return new DescriptorRegistry()
    .register(seriesFixturesDescriptor as AnyDescriptor)
    .register(scorecardDescriptor as AnyDescriptor)
    .register(playerProfileDescriptor as AnyDescriptor);
}
