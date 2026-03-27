/**
 * Meta Marketing API Service
 * Handles all interactions with the Meta Graph API for fetching
 * ad accounts, disapproved ads, insights, creative updates, and appeals.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency?: string;
  business_name?: string;
}

export interface ReviewFeedbackItem {
  key: string;
  body: string;
}

export interface DisapprovedAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  account_id?: string;
  account_name?: string;
  ad_review_feedback?: Record<string, unknown>;
  parsed_review_feedback?: ReviewFeedbackItem[];
  created_time: string;
  updated_time?: string;
  campaign_id?: string;
  adset_id?: string;
  campaign?: { id: string; name: string };
  adset?: { id: string; name: string };
  creative?: {
    id: string;
    name?: string;
    thumbnail_url?: string;
    body?: string;
    title?: string;
    image_url?: string;
    link_url?: string;
    call_to_action_type?: string;
    object_story_spec?: Record<string, unknown>;
  };
  spend_30d?: number;
  impressions_30d?: number;
  clicks_30d?: number;
}

export interface PagingInfo {
  cursors: { before: string; after: string };
  next?: string;
}

export interface ApiResponse<T> {
  data: T[];
  paging?: PagingInfo;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/**
 * Deep-parse ad_review_feedback which can be nested objects.
 * The API returns structures like:
 *   { "global": { "body": "Your ad wasn't approved because..." } }
 * or sometimes:
 *   { "global": "Some string reason" }
 * or even deeper nesting. We flatten everything into readable items.
 */
export function parseReviewFeedback(feedback: Record<string, unknown> | undefined): ReviewFeedbackItem[] {
  if (!feedback) return [];
  const items: ReviewFeedbackItem[] = [];

  for (const [key, value] of Object.entries(feedback)) {
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      items.push({ key, body: value });
    } else if (typeof value === 'object') {
      // Could be { body: "..." } or nested further
      const obj = value as Record<string, unknown>;

      // Check if it has a "body" field directly
      if (typeof obj.body === 'string') {
        items.push({ key, body: obj.body });
      } else {
        // Try to extract all string values from the object
        const parts: string[] = [];
        flattenObject(obj, parts);
        if (parts.length > 0) {
          items.push({ key, body: parts.join('\n') });
        } else {
          items.push({ key, body: JSON.stringify(value, null, 2) });
        }
      }
    } else {
      items.push({ key, body: String(value) });
    }
  }

  return items;
}

function flattenObject(obj: Record<string, unknown>, parts: string[], prefix = ''): void {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim()) {
      parts.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item.trim()) {
          parts.push(item);
        } else if (typeof item === 'object' && item !== null) {
          flattenObject(item as Record<string, unknown>, parts, `${prefix}${k}.`);
        }
      }
    } else if (typeof v === 'object' && v !== null) {
      flattenObject(v as Record<string, unknown>, parts, `${prefix}${k}.`);
    }
  }
}

/**
 * Fetch all ad accounts associated with the access token
 */
export async function fetchAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const allAccounts: AdAccount[] = [];
  let url = `${GRAPH_API_BASE}/me/adaccounts?fields=id,account_id,name,account_status,currency,business_name&limit=100&access_token=${accessToken}`;

  while (url) {
    const response = await fetch(url);
    const data: ApiResponse<AdAccount> = await response.json();
    if (data.error) {
      throw new Error(`API Error: ${data.error.message} (Code: ${data.error.code})`);
    }
    allAccounts.push(...data.data);
    url = data.paging?.next || '';
  }

  return allAccounts;
}

/**
 * Fetch disapproved ads for a specific ad account
 */
export async function fetchDisapprovedAds(
  accessToken: string,
  accountId: string,
  limit: number = 100
): Promise<DisapprovedAd[]> {
  const allAds: DisapprovedAd[] = [];
  const fields = [
    'id', 'name', 'effective_status', 'ad_review_feedback',
    'created_time', 'updated_time', 'campaign_id', 'adset_id',
    'campaign{id,name}', 'adset{id,name}',
    'creative{id,name,thumbnail_url,body,title,image_url,link_url,call_to_action_type,object_story_spec}'
  ].join(',');

  const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

  let url = `${GRAPH_API_BASE}/${formattedId}/ads?effective_status=["DISAPPROVED"]&fields=${fields}&limit=${limit}&access_token=${accessToken}`;

  while (url) {
    const response = await fetch(url);
    const data: ApiResponse<DisapprovedAd> = await response.json();
    if (data.error) {
      throw new Error(`API Error for ${formattedId}: ${data.error.message} (Code: ${data.error.code})`);
    }

    // Parse review feedback for each ad
    const parsedAds = data.data.map(ad => ({
      ...ad,
      parsed_review_feedback: parseReviewFeedback(ad.ad_review_feedback),
    }));

    allAds.push(...parsedAds);
    url = data.paging?.next || '';
  }

  return allAds;
}

/**
 * Fetch 30-day spend insights for a batch of ad IDs
 */
export async function fetchAdInsights(
  accessToken: string,
  adIds: string[]
): Promise<Map<string, { spend: number; impressions: number; clicks: number }>> {
  const insightsMap = new Map<string, { spend: number; impressions: number; clicks: number }>();

  // Process in batches of 50 to avoid rate limits
  const batchSize = 50;
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (adId) => {
        const url = `${GRAPH_API_BASE}/${adId}/insights?fields=spend,impressions,clicks&date_preset=last_30d&access_token=${accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.data && data.data.length > 0) {
          return {
            adId,
            spend: parseFloat(data.data[0].spend || '0'),
            impressions: parseInt(data.data[0].impressions || '0', 10),
            clicks: parseInt(data.data[0].clicks || '0', 10),
          };
        }
        return { adId, spend: 0, impressions: 0, clicks: 0 };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const { adId, spend, impressions, clicks } = result.value;
        insightsMap.set(adId, { spend, impressions, clicks });
      }
    }
  }

  return insightsMap;
}

/**
 * Fetch disapproved ads from multiple accounts with insights
 */
export async function fetchAllDisapprovedAds(
  accessToken: string,
  accountIds: string[]
): Promise<{ ads: DisapprovedAd[]; errors: { accountId: string; error: string }[] }> {
  const allAds: DisapprovedAd[] = [];
  const errors: { accountId: string; error: string }[] = [];

  const results = await Promise.allSettled(
    accountIds.map(async (accountId) => {
      const ads = await fetchDisapprovedAds(accessToken, accountId);
      return { accountId, ads };
    })
  );

  // Optionally resolve account names
  let accountNameMap: Record<string, string> = {};
  try {
    const nameResults = await Promise.allSettled(
      accountIds.map(async (accountId) => {
        const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
        const resp = await fetch(`${GRAPH_API_BASE}/${formattedId}?fields=name&access_token=${accessToken}`);
        const data = await resp.json();
        return { accountId: accountId.replace(/^act_/, ''), name: data.name || '' };
      })
    );
    for (const r of nameResults) {
      if (r.status === 'fulfilled' && r.value.name) {
        accountNameMap[r.value.accountId] = r.value.name;
      }
    }
  } catch {
    // Non-critical, continue without names
  }

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { accountId, ads } = result.value;
      const cleanId = accountId.replace(/^act_/, '');
      const taggedAds = ads.map((ad) => ({
        ...ad,
        account_id: cleanId,
        account_name: accountNameMap[cleanId] || ad.account_name || '',
      }));
      allAds.push(...taggedAds);
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      const match = errorMsg.match(/act_\d+/);
      errors.push({
        accountId: match ? match[0] : 'unknown',
        error: errorMsg,
      });
    }
  }

  // Fetch insights for all ads
  if (allAds.length > 0) {
    try {
      const adIds = allAds.map(ad => ad.id);
      const insights = await fetchAdInsights(accessToken, adIds);
      for (const ad of allAds) {
        const insight = insights.get(ad.id);
        if (insight) {
          ad.spend_30d = insight.spend;
          ad.impressions_30d = insight.impressions;
          ad.clicks_30d = insight.clicks;
        }
      }
    } catch {
      // Insights fetch failure is non-critical
      console.warn('Failed to fetch ad insights, continuing without spend data');
    }
  }

  return { ads: allAds, errors };
}

/**
 * Validate access token
 */
export async function validateToken(accessToken: string): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const response = await fetch(`${GRAPH_API_BASE}/me?fields=name,id&access_token=${accessToken}`);
    const data = await response.json();
    if (data.error) {
      return { valid: false, error: data.error.message };
    }
    return { valid: true, name: data.name };
  } catch {
    return { valid: false, error: 'Network error: Unable to reach Meta API' };
  }
}

/**
 * Request re-review for a disapproved ad by setting status to ACTIVE
 */
export async function requestAdReview(
  accessToken: string,
  adId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${GRAPH_API_BASE}/${adId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        status: 'ACTIVE',
        access_token: accessToken,
      }),
    });
    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Update ad creative by creating a new creative and assigning it to the ad.
 * Note: Meta API does not allow in-place creative edits; you must create a new one.
 */
export async function updateAdCreative(
  accessToken: string,
  adId: string,
  accountId: string,
  creativeData: {
    name?: string;
    body?: string;
    title?: string;
    link_url?: string;
    image_hash?: string;
    page_id?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

    // Build object_story_spec for the new creative
    const linkData: Record<string, string> = {};
    if (creativeData.body) linkData.message = creativeData.body;
    if (creativeData.title) linkData.name = creativeData.title;
    if (creativeData.link_url) linkData.link = creativeData.link_url;
    if (creativeData.image_hash) linkData.image_hash = creativeData.image_hash;

    const params = new URLSearchParams({
      access_token: accessToken,
    });

    if (creativeData.name) params.set('name', creativeData.name);
    if (Object.keys(linkData).length > 0 && creativeData.page_id) {
      params.set('object_story_spec', JSON.stringify({
        page_id: creativeData.page_id,
        link_data: linkData,
      }));
    }

    // Create new creative
    const createResp = await fetch(`${GRAPH_API_BASE}/${formattedAccountId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const createData = await createResp.json();

    if (createData.error) {
      return { success: false, error: createData.error.message };
    }

    const newCreativeId = createData.id;

    // Update the ad to use the new creative
    const updateResp = await fetch(`${GRAPH_API_BASE}/${adId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creative: JSON.stringify({ creative_id: newCreativeId }),
        access_token: accessToken,
      }),
    });
    const updateData = await updateResp.json();

    if (updateData.error) {
      return { success: false, error: updateData.error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

/**
 * Fetch Business Manager ID for an ad account
 */
export async function fetchBmIdForAccount(
  accessToken: string,
  accountId: string
): Promise<{ bmId: string; bmName: string } | null> {
  try {
    const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const response = await fetch(
      `${GRAPH_API_BASE}/${formattedId}?fields=business&access_token=${accessToken}`
    );
    const data = await response.json();
    if (data.error || !data.business) return null;
    return { bmId: data.business.id, bmName: data.business.name || '' };
  } catch {
    return null;
  }
}

/**
 * Fetch BM IDs for multiple accounts in parallel
 */
export async function fetchBmIdsForAccounts(
  accessToken: string,
  accountIds: string[]
): Promise<Record<string, { bmId: string; bmName: string }>> {
  const result: Record<string, { bmId: string; bmName: string }> = {};
  const batchSize = 10;

  for (let i = 0; i < accountIds.length; i += batchSize) {
    const batch = accountIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const bm = await fetchBmIdForAccount(accessToken, id);
        return { id: id.replace(/^act_/, ''), bm };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.bm) {
        result[r.value.id] = r.value.bm;
      }
    }
  }

  return result;
}

/**
 * Build the appeal URL for an ad account
 */
export function buildAppealUrl(bmId: string, accountId: string): string {
  const numericId = accountId.replace(/^act_/, '');
  return `https://www.facebook.com/business-support-home/${bmId}/${numericId}/`;
}

/**
 * Filter ads by date range (based on updated_time or created_time)
 */
export function filterAdsByDateRange(
  ads: DisapprovedAd[],
  startDate: Date,
  endDate: Date
): DisapprovedAd[] {
  return ads.filter((ad) => {
    const adDate = new Date(ad.updated_time || ad.created_time);
    return adDate >= startDate && adDate <= endDate;
  });
}

/**
 * Get default date range (last 30 days)
 */
export function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Batch request re-review for multiple ads using parallel individual POST requests.
 * Uses the same endpoint as requestAdReview (POST /{ad-id} with status=ACTIVE)
 * which is known to work from the browser (no CORS issues).
 * Processes ads in concurrent batches of 10 to balance speed and rate limits.
 */
export interface BatchAppealResult {
  adId: string;
  success: boolean;
  error?: string;
}

export async function batchRequestAdReview(
  accessToken: string,
  adIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<BatchAppealResult[]> {
  const results: BatchAppealResult[] = [];
  const CONCURRENCY = 10; // parallel requests per wave
  let completed = 0;

  for (let i = 0; i < adIds.length; i += CONCURRENCY) {
    const wave = adIds.slice(i, i + CONCURRENCY);

    const waveResults = await Promise.allSettled(
      wave.map(async (adId): Promise<BatchAppealResult> => {
        try {
          const response = await fetch(`${GRAPH_API_BASE}/${adId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              status: 'ACTIVE',
              access_token: accessToken,
            }),
          });
          const data = await response.json();
          if (data.error) {
            return { adId, success: false, error: data.error.message };
          }
          return { adId, success: true };
        } catch {
          return { adId, success: false, error: 'Network error' };
        }
      })
    );

    for (const r of waveResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        // Should not happen since inner function catches errors, but just in case
        results.push({ adId: wave[results.length - (i > 0 ? i : 0)] || 'unknown', success: false, error: 'Unexpected error' });
      }
    }

    completed = Math.min(i + CONCURRENCY, adIds.length);
    onProgress?.(completed, adIds.length);

    // Small delay between waves to respect rate limits
    if (i + CONCURRENCY < adIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return results;
}

/**
 * Get account status label
 */
export function getAccountStatusLabel(status: number): string {
  const statusMap: Record<number, string> = {
    1: 'Active',
    2: 'Disabled',
    3: 'Unsettled',
    7: 'Pending Review',
    8: 'Pending Closure',
    9: 'In Grace Period',
    100: 'Pending Risk Review',
    101: 'Any Active',
    201: 'Any Closed',
  };
  return statusMap[status] || `Unknown (${status})`;
}
