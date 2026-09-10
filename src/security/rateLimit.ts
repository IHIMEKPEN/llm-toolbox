export class RateLimiter {
  private hits: number[] = [];

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  try(): boolean {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.maxHits) {
      return false;
    }
    this.hits.push(now);
    return true;
  }
}

/** Shared outbound HTTP budget for the plugin process. */
export const outboundLimiter = new RateLimiter(40, 60_000);
