/**
 * Meta Ads API Rate Limiter
 *
 * Parses rate-limit headers from Facebook Graph API responses, tracks usage
 * per ad account, and provides throttle-aware request scheduling.
 *
 * Based on the meta-ads-rate-limiter skill pattern.
 *
 * Usage:
 *   const limiter = new MetaAdsRateLimiter({ warnThreshold: 70, pauseThreshold: 90 });
 *
 *   // Before each request
 *   await limiter.waitIfNeeded(accountId);
 *
 *   // After each response (pass the Response object)
 *   limiter.updateFromResponse(response, accountId);
 *
 *   // Check status
 *   const status = limiter.getStatus(accountId);
 */

export interface AccountUsage {
  accountId: string;
  callCount: number;
  totalCputime: number;
  totalTime: number;
  appIdUtilPct: number;
  accIdUtilPct: number;
  estimatedTimeToRegainAccess: number;
  adsApiAccessTier: string;
  lastUpdated: number;
  isThrottled: boolean;
}

interface RateLimiterOptions {
  warnThreshold?: number;     // default 70
  pauseThreshold?: number;    // default 90
  maxRetries?: number;        // default 3
  backoffBase?: number;       // default 2.0
  minDelayBetweenCalls?: number; // default 500ms
}

interface BucEntry {
  type?: string;
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
  estimated_time_to_regain_access?: number;
  ads_api_access_tier?: string;
}

interface InsightsThrottle {
  app_id_util_pct?: number;
  acc_id_util_pct?: number;
  ads_api_access_tier?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getMaxUsage(acct: AccountUsage): number {
  return Math.max(acct.callCount, acct.totalCputime, acct.totalTime, acct.accIdUtilPct);
}

/** Retryable Meta API error codes */
const RETRYABLE_ERROR_CODES = new Set([4, 17, 32, 80000, 80004, 613]);

export class MetaAdsRateLimiter {
  private warnThreshold: number;
  private pauseThreshold: number;
  readonly maxRetries: number;
  private backoffBase: number;
  private minDelayBetweenCalls: number;
  private accounts: Map<string, AccountUsage> = new Map();
  private appUsage = { callCount: 0, totalCputime: 0, totalTime: 0 };
  private lastCallTime = 0;

  /** Callback for UI to show rate limit status */
  onStatusChange?: (accountId: string, usage: AccountUsage & { maxUsagePct: number }) => void;

  constructor(options: RateLimiterOptions = {}) {
    this.warnThreshold = options.warnThreshold ?? 70;
    this.pauseThreshold = options.pauseThreshold ?? 90;
    this.maxRetries = options.maxRetries ?? 3;
    this.backoffBase = options.backoffBase ?? 2.0;
    this.minDelayBetweenCalls = options.minDelayBetweenCalls ?? 500;
  }

  private getOrCreate(accountId: string): AccountUsage {
    if (!this.accounts.has(accountId)) {
      this.accounts.set(accountId, {
        accountId,
        callCount: 0,
        totalCputime: 0,
        totalTime: 0,
        appIdUtilPct: 0,
        accIdUtilPct: 0,
        estimatedTimeToRegainAccess: 0,
        adsApiAccessTier: 'unknown',
        lastUpdated: Date.now(),
        isThrottled: false,
      });
    }
    return this.accounts.get(accountId)!;
  }

  private parseHeaderJson(value: string | null | undefined): any | null {
    if (!value) return null;
    try { return JSON.parse(value); }
    catch { return null; }
  }

  /**
   * Update rate-limit state from a fetch Response.
   * Works with both browser fetch() Response and node-fetch Response.
   */
  updateFromResponse(response: Response, accountId: string): AccountUsage {
    const acct = this.getOrCreate(accountId);
    acct.lastUpdated = Date.now();
    const h = response.headers;

    // 1. X-Business-Use-Case-Usage (BUC header — primary for Marketing API)
    const buc = this.parseHeaderJson(
      h.get('X-Business-Use-Case-Usage') || h.get('x-business-use-case-usage')
    );
    if (buc) {
      for (const entries of Object.values(buc)) {
        const list = Array.isArray(entries) ? entries : [entries];
        for (const entry of list as BucEntry[]) {
          if (entry.type === 'ads_insights' || entry.type === 'ads_management') {
            acct.callCount = entry.call_count ?? 0;
            acct.totalCputime = entry.total_cputime ?? 0;
            acct.totalTime = entry.total_time ?? 0;
            acct.estimatedTimeToRegainAccess = entry.estimated_time_to_regain_access ?? 0;
            acct.adsApiAccessTier = entry.ads_api_access_tier ?? 'unknown';
            break;
          }
        }
      }
    }

    // 2. x-fb-ads-insights-throttle (Insights-specific header)
    const throttle: InsightsThrottle | null = this.parseHeaderJson(
      h.get('x-fb-ads-insights-throttle') || h.get('X-FB-Ads-Insights-Throttle')
    );
    if (throttle) {
      acct.appIdUtilPct = throttle.app_id_util_pct ?? 0;
      acct.accIdUtilPct = throttle.acc_id_util_pct ?? 0;
      acct.adsApiAccessTier = throttle.ads_api_access_tier ?? acct.adsApiAccessTier;
    }

    // 3. X-App-Usage (general app-level usage)
    const appUsage = this.parseHeaderJson(
      h.get('X-App-Usage') || h.get('x-app-usage')
    );
    if (appUsage) {
      this.appUsage.callCount = appUsage.call_count ?? 0;
      this.appUsage.totalCputime = appUsage.total_cputime ?? 0;
      this.appUsage.totalTime = appUsage.total_time ?? 0;
    }

    acct.isThrottled = getMaxUsage(acct) >= 100 || response.status === 400;

    // Notify UI if callback is set
    this.onStatusChange?.(accountId, { ...acct, maxUsagePct: getMaxUsage(acct) });

    return acct;
  }

  /**
   * Wait until it is safe to make the next API call for this account.
   * Returns the number of milliseconds waited.
   */
  async waitIfNeeded(accountId: string): Promise<number> {
    let waited = 0;
    const acct = this.getOrCreate(accountId);

    // Minimum delay between calls
    const elapsed = Date.now() - this.lastCallTime;
    if (elapsed < this.minDelayBetweenCalls) {
      const gap = this.minDelayBetweenCalls - elapsed;
      await sleep(gap);
      waited += gap;
    }

    // If throttled, wait for estimated recovery
    if (acct.isThrottled && acct.estimatedTimeToRegainAccess > 0) {
      const waitMs = acct.estimatedTimeToRegainAccess * 60_000;
      console.warn(`[RateLimiter][${accountId}] Throttled — waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      waited += waitMs;
      acct.isThrottled = false;
    }

    // Proportional delay based on usage percentage
    const pct = getMaxUsage(acct);
    if (pct >= this.pauseThreshold) {
      const delay = 30_000;
      console.warn(`[RateLimiter][${accountId}] Near limit (${pct.toFixed(1)}%) — cooling 30s`);
      await sleep(delay);
      waited += delay;
    } else if (pct >= this.warnThreshold) {
      const delay = 5_000;
      console.warn(`[RateLimiter][${accountId}] Warning (${pct.toFixed(1)}%) — slowing 5s`);
      await sleep(delay);
      waited += delay;
    }

    this.lastCallTime = Date.now();
    return waited;
  }

  /** Exponential backoff delay in ms for a given retry attempt. */
  getBackoffDelay(retryCount: number): number {
    return this.backoffBase ** retryCount * 1000;
  }

  /** Check if a failed response is retryable based on error code. */
  shouldRetry(errorCode: number, retryCount: number): boolean {
    if (retryCount >= this.maxRetries) return false;
    return RETRYABLE_ERROR_CODES.has(errorCode);
  }

  /** Check if it's safe to call without hitting limits. */
  isSafeToCall(accountId: string): boolean {
    const acct = this.getOrCreate(accountId);
    return getMaxUsage(acct) < this.pauseThreshold && !acct.isThrottled;
  }

  /** Get current usage status for an account. */
  getStatus(accountId: string): AccountUsage & { maxUsagePct: number } {
    const acct = this.getOrCreate(accountId);
    return { ...acct, maxUsagePct: getMaxUsage(acct) };
  }

  /** Get all tracked accounts' statuses. */
  getAllStatuses() {
    const accounts: Record<string, AccountUsage & { maxUsagePct: number }> = {};
    for (const [id, acct] of Array.from(this.accounts.entries())) {
      accounts[id] = { ...acct, maxUsagePct: getMaxUsage(acct) };
    }
    return { accounts, appUsage: { ...this.appUsage } };
  }

  /** Return the account with the lowest usage from a list. */
  getSafestAccount(accountIds: string[]): string | null {
    if (!accountIds.length) return null;
    return accountIds.reduce((safest, id) =>
      getMaxUsage(this.getOrCreate(id)) < getMaxUsage(this.getOrCreate(safest))
        ? id : safest
    );
  }

  /** Reset all tracked state. */
  reset(): void {
    this.accounts.clear();
    this.appUsage = { callCount: 0, totalCputime: 0, totalTime: 0 };
    this.lastCallTime = 0;
  }
}

/** Singleton rate limiter instance for the app */
export const rateLimiter = new MetaAdsRateLimiter({
  warnThreshold: 70,
  pauseThreshold: 90,
  maxRetries: 3,
  minDelayBetweenCalls: 500,
});
