import type { PageType } from "@crickverse/types";

/**
 * Thrown when a page returns 200 but has no #__NEXT_DATA__ blob. This is a
 * distinct alarm (WAF block or ESPNCricinfo structure drift) — never swallowed
 * as a silent empty result, and never retried (it's structural, not transient).
 */
export class NextDataMissingError extends Error {
  constructor(public readonly url: string) {
    super(`No #__NEXT_DATA__ found at ${url} (blocked by WAF or page structure changed)`);
    this.name = "NextDataMissingError";
  }
}

/** Thrown when the extracted content slice is missing for every known JSON path. */
export class ContentPathMissingError extends Error {
  constructor(
    public readonly url: string,
    public readonly paths: string[],
  ) {
    super(`None of the content paths matched at ${url}: ${paths.join(" | ")}`);
    this.name = "ContentPathMissingError";
  }
}

export class DescriptorNotFoundError extends Error {
  constructor(public readonly pageType: PageType | string) {
    super(`No descriptor registered for page type "${pageType}"`);
    this.name = "DescriptorNotFoundError";
  }
}
