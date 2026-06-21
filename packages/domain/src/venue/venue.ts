/**
 * A venue as it appears in a tournament edition — a value object pairing the
 * ground with its city and the number of matches played there.
 */
export class Venue {
  constructor(
    readonly name: string | null,
    readonly city: string | null,
    readonly matches: number,
  ) {}

  get displayName(): string {
    return this.name ?? "Unknown venue";
  }
}
