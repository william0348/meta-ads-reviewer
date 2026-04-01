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

export interface AdIssueInfo {
  level: string;
  error_code?: number;
  error_summary?: string;
  error_message?: string;
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
  policy_violations?: string[];  // extracted policy violation categories
  issues_info?: AdIssueInfo[];
  created_time: string;
  updated_time?: string;
  campaign_id?: string;
  adset_id?: string;
  campaign?: { id: string; name: string };
  adset?: { id: string; name: string; promoted_object?: { application_id?: string } };
  promoted_object_app_id?: string;  // from adset.promoted_object.application_id
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
 * Known Meta policy violation category mappings.
 * The API returns keys like "GAMBLING_AND_GAMES" or descriptions.
 * We map them to human-readable labels.
 */
const POLICY_VIOLATION_MAP: Record<string, string> = {
  'GAMBLING_AND_GAMES': 'Online Gambling and Games',
  'GAMBLING': 'Online Gambling and Games',
  'ADULT_CONTENT': 'Adult Content',
  'ALCOHOL': 'Alcohol',
  'DATING': 'Dating',
  'DRUGS_AND_SUPPLEMENTS': 'Drugs and Supplements',
  'FINANCIAL_SERVICES': 'Financial Services',
  'HEALTH_AND_WELLNESS': 'Health and Wellness',
  'POLITICAL_ADS': 'Political Ads',
  'TOBACCO': 'Tobacco and Related Products',
  'WEAPONS': 'Weapons and Ammunition',
  'MISLEADING_CLAIMS': 'Misleading Claims',
  'PERSONAL_ATTRIBUTES': 'Personal Attributes',
  'SENSATIONAL_CONTENT': 'Sensational Content',
  'SURVEILLANCE_EQUIPMENT': 'Surveillance Equipment',
  'CRYPTOCURRENCY': 'Cryptocurrency',
  'SOCIAL_ISSUES': 'Social Issues',
  'BODY_IMAGE': 'Body Image',
  'DISCRIMINATORY_PRACTICES': 'Discriminatory Practices',
  'UNSAFE_SUBSTANCES': 'Unsafe Substances',
  'COUNTERFEIT_DOCUMENTS': 'Counterfeit Documents',
  'LOW_QUALITY': 'Low Quality or Disruptive Content',
  'NONEXISTENT_FUNCTIONALITY': 'Non-functional Landing Page',
  'PERSONAL_HEALTH': 'Personal Health',
  'PAYDAY_LOANS': 'Payday Loans',
  'MULTI_LEVEL_MARKETING': 'Multi-level Marketing',
  'PENNY_AUCTIONS': 'Penny Auctions',
  'SPYWARE_MALWARE': 'Spyware or Malware',
  'CIRCUMVENTING_SYSTEMS': 'Circumventing Systems',
  'ILLEGAL_PRODUCTS': 'Illegal Products or Services',
  'ANIMAL_SALE': 'Animal Sale',
};

/**
 * Extract policy violation categories from ad_review_feedback and issues_info.
 * Returns a list of human-readable policy violation names.
 */
export function extractPolicyViolations(
  feedback: Record<string, unknown> | undefined,
  issuesInfo: AdIssueInfo[] | undefined
): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();

  // 1. Extract from ad_review_feedback.global keys
  // The API returns human-readable keys like "Online Gambling and Games"
  // so we use them directly without transformation
  if (feedback) {
    const global = feedback.global;
    if (global && typeof global === 'object' && !Array.isArray(global)) {
      for (const key of Object.keys(global as Record<string, unknown>)) {
        // Use the key directly — it's already human-readable from the API
        const label = key.trim();
        if (label && !seen.has(label)) {
          seen.add(label);
          violations.push(label);
        }
      }
    } else if (typeof global === 'string' && global.trim()) {
      violations.push(global.trim());
      seen.add(global.trim());
    }

    // Also check placement_specific for additional violations
    const placementSpecific = feedback.placement_specific;
    if (placementSpecific && typeof placementSpecific === 'object') {
      for (const [, platformFeedback] of Object.entries(placementSpecific as Record<string, unknown>)) {
        if (platformFeedback && typeof platformFeedback === 'object') {
          for (const key of Object.keys(platformFeedback as Record<string, unknown>)) {
            const label = key.trim();
            if (label && !seen.has(label)) {
              seen.add(label);
              violations.push(label);
            }
          }
        }
      }
    }
  }

  // 2. Extract from issues_info
  if (issuesInfo && Array.isArray(issuesInfo)) {
    for (const issue of issuesInfo) {
      if (issue.error_summary && !seen.has(issue.error_summary)) {
        seen.add(issue.error_summary);
        violations.push(issue.error_summary);
      }
    }
  }

  return violations;
}

/**
 * Format a raw policy key into a readable label.
 * e.g., "GAMBLING_AND_GAMES" → "Gambling And Games"
 */
function formatPolicyKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
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
 * Fetch disapproved ads for a specific ad account.
 * Uses progressive fallback: full fields → minimal fields → bare minimum fields.
 * Properly distinguishes permission errors (Code 200) from data-too-large errors (Code 1).
 */
export async function fetchDisapprovedAds(
  accessToken: string,
  accountId: string
): Promise<DisapprovedAd[]> {
  const allAds: DisapprovedAd[] = [];
  const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

  // Progressive field reduction tiers
  const tiers = [
    {
      label: 'full',
      limit: 15,
      fields: [
        'id', 'name', 'effective_status', 'ad_review_feedback',
        'issues_info', 'created_time', 'updated_time', 'campaign_id', 'adset_id',
        'campaign{id,name}', 'adset{id,name,promoted_object}',
        'creative{id,name,thumbnail_url,body,title,image_url,link_url,call_to_action_type}'
      ].join(','),
    },
    {
      label: 'medium',
      limit: 10,
      fields: [
        'id', 'name', 'effective_status', 'ad_review_feedback',
        'created_time', 'updated_time', 'campaign_id', 'adset_id',
        'campaign{id,name}', 'adset{id,name,promoted_object}',
        'creative{id,name,thumbnail_url,title}'
      ].join(','),
    },
    {
      label: 'minimal',
      limit: 5,
      fields: [
        'id', 'name', 'effective_status', 'ad_review_feedback',
        'created_time', 'updated_time', 'adset{id,promoted_object}', 'creative{id,thumbnail_url}'
      ].join(','),
    },
    {
      label: 'bare',
      limit: 3,
      fields: 'id,name,effective_status,ad_review_feedback,created_time,updated_time',
    },
    {
      label: 'ultra-bare',
      limit: 1,
      fields: 'id,name,effective_status,created_time,updated_time',
    },
  ];

  let tierIndex = 0;
  let retryCount = 0;
  const MAX_RETRIES_PER_TIER = 2;

  function buildUrl(tier: typeof tiers[0], cursor?: string): string {
    let u = `${GRAPH_API_BASE}/${formattedId}/ads?effective_status=["DISAPPROVED"]&fields=${tier.fields}&limit=${tier.limit}&access_token=${accessToken}`;
    if (cursor) u += `&after=${cursor}`;
    return u;
  }

  // Delay helper with exponential backoff
  const tierDelay = (tier: number) => Math.min(500 * Math.pow(2, tier), 5000);

  let url = buildUrl(tiers[tierIndex]);

  while (url) {
    const response = await fetch(url);
    const data: ApiResponse<DisapprovedAd> = await response.json();

    if (data.error) {
      // Code 200 = Permission denied — skip this account entirely
      if (data.error.code === 200) {
        console.warn(`[${formattedId}] Permission denied, skipping`);
        throw new Error(`[${formattedId}] 權限不足：帳號擁有者未授權 ads_read 權限`);
      }

      // Code 1 = Data too large or rate limit — try retry first, then next tier
      if (data.error.code === 1) {
        // Retry same tier with delay before falling back
        if (retryCount < MAX_RETRIES_PER_TIER) {
          retryCount++;
          const delay = tierDelay(tierIndex) * retryCount;
          console.warn(`[${formattedId}] Code 1 error, retry ${retryCount}/${MAX_RETRIES_PER_TIER} after ${delay}ms (tier: ${tiers[tierIndex].label})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Move to next tier
        if (tierIndex < tiers.length - 1) {
          tierIndex++;
          retryCount = 0;
          const nextTier = tiers[tierIndex];
          const delay = tierDelay(tierIndex);
          console.warn(`[${formattedId}] Data too large, falling back to ${nextTier.label} tier (limit=${nextTier.limit}), waiting ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          url = buildUrl(nextTier);
          continue;
        }
      }

      // Code 4 = Rate limiting — wait and retry
      if (data.error.code === 4 || data.error.code === 17 || data.error.code === 32) {
        if (retryCount < 3) {
          retryCount++;
          const delay = 3000 * retryCount;
          console.warn(`[${formattedId}] Rate limited (Code ${data.error.code}), waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // All tiers exhausted or other error
      throw new Error(`API Error for ${formattedId}: ${data.error.message} (Code: ${data.error.code})`);
    }

    // Reset retry count on success
    retryCount = 0;

    // Parse review feedback, extract policy violations, and extract app ID for each ad
    const parsedAds = data.data.map(ad => ({
      ...ad,
      parsed_review_feedback: parseReviewFeedback(ad.ad_review_feedback),
      policy_violations: extractPolicyViolations(ad.ad_review_feedback, ad.issues_info as AdIssueInfo[] | undefined),
      promoted_object_app_id: (ad.adset as any)?.promoted_object?.application_id || ad.promoted_object_app_id || undefined,
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
 * Fetch disapproved ads from multiple accounts in sequential batches.
 * Processes ACCOUNTS_PER_BATCH accounts at a time to avoid API overload.
 * Calls onProgress after each batch so the UI can update incrementally.
 */
const ACCOUNTS_PER_BATCH = 5;

export async function fetchAllDisapprovedAds(
  accessToken: string,
  accountIds: string[],
  onProgress?: (update: {
    completedAccounts: number;
    totalAccounts: number;
    currentBatchIndex: number;
    totalBatches: number;
    batchAds: DisapprovedAd[];
    batchErrors: { accountId: string; error: string }[];
  }) => void
): Promise<{ ads: DisapprovedAd[]; errors: { accountId: string; error: string }[] }> {
  const allAds: DisapprovedAd[] = [];
  const errors: { accountId: string; error: string }[] = [];

  // Split accounts into batches of ACCOUNTS_PER_BATCH
  const batches: string[][] = [];
  for (let i = 0; i < accountIds.length; i += ACCOUNTS_PER_BATCH) {
    batches.push(accountIds.slice(i, i + ACCOUNTS_PER_BATCH));
  }

  // Process each batch sequentially
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchAds: DisapprovedAd[] = [];
    const batchErrors: { accountId: string; error: string }[] = [];

    // Fetch accounts sequentially with delay to avoid rate limiting
    const results: PromiseSettledResult<{ accountId: string; ads: DisapprovedAd[] }>[] = [];
    for (let i = 0; i < batch.length; i++) {
      const accountId = batch[i];
      try {
        const ads = await fetchDisapprovedAds(accessToken, accountId);
        results.push({ status: 'fulfilled', value: { accountId, ads } });
      } catch (err) {
        results.push({ status: 'rejected', reason: err });
      }
      // Add 500ms delay between accounts to avoid rate limiting
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Resolve account names for this batch
    let accountNameMap: Record<string, string> = {};
    try {
      const nameResults = await Promise.allSettled(
        batch.map(async (accountId) => {
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
      // Non-critical
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
        batchAds.push(...taggedAds);
      } else {
        const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        const match = errorMsg.match(/act_\d+/);
        batchErrors.push({
          accountId: match ? match[0] : 'unknown',
          error: errorMsg,
        });
      }
    }

    // Fetch insights for this batch's ads
    if (batchAds.length > 0) {
      try {
        const adIds = batchAds.map(ad => ad.id);
        const insights = await fetchAdInsights(accessToken, adIds);
        for (const ad of batchAds) {
          const insight = insights.get(ad.id);
          if (insight) {
            ad.spend_30d = insight.spend;
            ad.impressions_30d = insight.impressions;
            ad.clicks_30d = insight.clicks;
          }
        }
      } catch {
        console.warn(`Batch ${batchIdx + 1}: Failed to fetch insights, continuing without spend data`);
      }
    }

    allAds.push(...batchAds);
    errors.push(...batchErrors);

    // Notify progress
    const completedAccounts = Math.min((batchIdx + 1) * ACCOUNTS_PER_BATCH, accountIds.length);
    onProgress?.({
      completedAccounts,
      totalAccounts: accountIds.length,
      currentBatchIndex: batchIdx + 1,
      totalBatches: batches.length,
      batchAds,
      batchErrors,
    });
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
): Promise<{ success: boolean; error?: string; errorCode?: number; errorSubcode?: number }> {
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
      const errCode = data.error.code;
      const errSubcode = data.error.error_subcode;
      const traceId = data.error.fbtrace_id;
      const errType = data.error.type;
      // Build detailed error message
      let detail = data.error.message || 'Unknown error';
      if (errCode) detail += ` (Code: ${errCode}`;
      if (errSubcode) detail += `, Subcode: ${errSubcode}`;
      if (errCode) detail += ')';
      if (errType) detail += ` [${errType}]`;
      if (traceId) detail += ` trace: ${traceId}`;
      
      // Provide user-friendly hints for common errors
      if (errCode === 10) {
        detail += '\n\u2192 此帳號可能未授權 ads_management 權限，或你在此帳號的角色不足（需要 Advertiser 或 Admin）';
      } else if (errCode === 100) {
        detail += '\n\u2192 參數錯誤或此廣告不允許修改狀態（可能已被永久禁止或帳號已停用）';
      } else if (errCode === 200) {
        detail += '\n\u2192 權限不足：你的 Token 或帳號角色沒有足夠權限修改此廣告';
      } else if (errCode === 17 || errCode === 4 || errCode === 32) {
        detail += '\n\u2192 API 速率限制，請稍後再試';
      }
      return { success: false, error: detail, errorCode: errCode, errorSubcode: errSubcode };
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
 * Filter ads by date range (based on updated_time as disapproval date proxy, fallback to created_time)
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
  const CONCURRENCY = 5; // reduced from 10 to avoid rate limits
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
            const errCode = data.error.code;
            const errSubcode = data.error.error_subcode;
            const traceId = data.error.fbtrace_id;
            const errType = data.error.type;
            let detail = data.error.message || 'Unknown error';
            if (errCode) detail += ` (Code: ${errCode}`;
            if (errSubcode) detail += `, Subcode: ${errSubcode}`;
            if (errCode) detail += ')';
            if (errType) detail += ` [${errType}]`;
            if (traceId) detail += ` trace: ${traceId}`;
            // Hints
            if (errCode === 10) detail += ' \u2192 帳號未授權 ads_management 或角色不足';
            else if (errCode === 100) detail += ' \u2192 廣告不允許修改或帳號已停用';
            else if (errCode === 200) detail += ' \u2192 權限不足';
            else if (errCode === 17 || errCode === 4 || errCode === 32) detail += ' \u2192 API 速率限制，請稍後再試';
            return { adId, success: false, error: detail };
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
        results.push({ adId: wave[results.length - (i > 0 ? i : 0)] || 'unknown', success: false, error: 'Unexpected error' });
      }
    }

    completed = Math.min(i + CONCURRENCY, adIds.length);
    onProgress?.(completed, adIds.length);

    // Increased delay between waves to respect rate limits
    if (i + CONCURRENCY < adIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
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

/**
 * Fetch a single ad's latest data from Meta API.
 * Used for per-ad refresh without reloading all accounts.
 * Returns the updated DisapprovedAd or null if the ad is no longer disapproved.
 */
export async function fetchSingleAd(
  accessToken: string,
  adId: string
): Promise<DisapprovedAd | null> {
  const fields = [
    'id', 'name', 'effective_status', 'ad_review_feedback',
    'issues_info', 'created_time', 'updated_time', 'campaign_id', 'adset_id',
    'campaign{id,name}', 'adset{id,name,promoted_object}',
    'creative{id,name,thumbnail_url,body,title,image_url,link_url,call_to_action_type}'
  ].join(',');

  const url = `${GRAPH_API_BASE}/${adId}?fields=${fields}&access_token=${accessToken}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(`API Error: ${data.error.message} (Code: ${data.error.code})`);
  }

  if (!data.id) return null;

  // Extract promoted_object_app_id from adset
  data.promoted_object_app_id = data.adset?.promoted_object?.application_id || undefined;

  // Also fetch 30-day insights for this ad
  let spend_30d = 0, impressions_30d = 0, clicks_30d = 0;
  try {
    const insightUrl = `${GRAPH_API_BASE}/${adId}/insights?fields=spend,impressions,clicks&date_preset=last_30d&access_token=${accessToken}`;
    const insightResp = await fetch(insightUrl);
    const insightData = await insightResp.json();
    if (insightData.data && insightData.data.length > 0) {
      spend_30d = parseFloat(insightData.data[0].spend || '0');
      impressions_30d = parseInt(insightData.data[0].impressions || '0', 10);
      clicks_30d = parseInt(insightData.data[0].clicks || '0', 10);
    }
  } catch {
    // Non-critical — continue without insights
  }

  const ad: DisapprovedAd = {
    id: data.id,
    name: data.name || '',
    status: data.status || '',
    effective_status: data.effective_status || '',
    ad_review_feedback: data.ad_review_feedback,
    issues_info: data.issues_info?.data || data.issues_info,
    created_time: data.created_time || '',
    updated_time: data.updated_time,
    campaign_id: data.campaign_id,
    adset_id: data.adset_id,
    campaign: data.campaign,
    adset: data.adset,
    creative: data.creative,
    spend_30d,
    impressions_30d,
    clicks_30d,
    parsed_review_feedback: parseReviewFeedback(data.ad_review_feedback),
    policy_violations: extractPolicyViolations(data.ad_review_feedback, data.issues_info?.data || data.issues_info),
  };

  return ad;
}


/**
 * Fetch App names for a list of App IDs from Graph API.
 * Uses /?ids={id1},{id2}&fields=id,name for batch lookup.
 * Returns a map of appId -> appName.
 * Caches results in memory to avoid repeated calls.
 */
const appNameCache: Record<string, string> = {};

export async function fetchAppNames(
  accessToken: string,
  appIds: string[]
): Promise<Record<string, string>> {
  // Filter out already cached IDs
  const uncachedIds = appIds.filter((id) => !(id in appNameCache));

  if (uncachedIds.length > 0) {
    // Batch fetch in groups of 50 (API limit)
    const BATCH_SIZE = 50;
    for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
      const batch = uncachedIds.slice(i, i + BATCH_SIZE);
      try {
        const url = `${GRAPH_API_BASE}/?ids=${batch.join(',')}&fields=id,name&access_token=${accessToken}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          // data is { "appId1": { id, name }, "appId2": { id, name }, ... }
          for (const [id, info] of Object.entries(data)) {
            const appInfo = info as { id: string; name?: string };
            appNameCache[id] = appInfo.name || id;
          }
        }
      } catch {
        // Non-critical — continue with IDs as fallback
      }
    }

    // Mark any still-uncached IDs so we don't retry them
    for (const id of uncachedIds) {
      if (!(id in appNameCache)) {
        appNameCache[id] = id; // fallback to ID itself
      }
    }
  }

  // Build result from cache
  const result: Record<string, string> = {};
  for (const id of appIds) {
    result[id] = appNameCache[id] || id;
  }
  return result;
}


/**
 * Appeal result for a single ad account
 */
export interface AccountAppealResult {
  entity_id: string;
  appeal_case_id?: string;
  status: 'appeal_creation_success' | 'appeal_entity_invalid' | 'appeal_creation_failure';
  reason: string;
}

/**
 * Request review/appeal for disabled ad accounts via the Business Management API.
 * POST <parent_bm_id>/ad_review_requests
 * Requires: business_management permission, admin privileges
 * Max 50 accounts per request.
 */
export async function requestAdAccountReview(
  accessToken: string,
  parentBmId: string,
  adAccountIds: string[],
  appId: string
): Promise<{ success: boolean; results: AccountAppealResult[]; error?: string }> {
  try {
    // Clean account IDs — API expects numeric IDs without act_ prefix
    const numericIds = adAccountIds.map((id) => id.replace(/^act_/, ''));

    const response = await fetch(`${GRAPH_API_BASE}/${parentBmId}/ad_review_requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ad_account_ids: JSON.stringify(numericIds),
        app: appId,
        access_token: accessToken,
      }),
    });
    const data = await response.json();

    if (data.error) {
      const errCode = data.error.code;
      const errSubcode = data.error.error_subcode;
      const traceId = data.error.fbtrace_id;
      const errType = data.error.type;
      let detail = data.error.message || 'Unknown error';
      if (errCode) detail += ` (Code: ${errCode}`;
      if (errSubcode) detail += `, Subcode: ${errSubcode}`;
      if (errCode) detail += ')';
      if (errType) detail += ` [${errType}]`;
      if (traceId) detail += ` trace: ${traceId}`;
      return { success: false, results: [], error: detail };
    }

    // Parse response array
    const results: AccountAppealResult[] = data.response || [];
    const allSuccess = results.every((r: AccountAppealResult) => r.status === 'appeal_creation_success');
    return { success: allSuccess, results };
  } catch {
    return { success: false, results: [], error: 'Network error' };
  }
}

/**
 * Fetch the App IDs associated with ad accounts.
 * For each account, fetches the applications connected via the account's ads.
 * We look at the account's promoted_object from recent campaigns.
 */
export async function fetchAccountAppIds(
  accessToken: string,
  accountId: string
): Promise<string[]> {
  const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  try {
    // Fetch recent campaigns with promoted_object to find app IDs
    const url = `${GRAPH_API_BASE}/${formattedId}/campaigns?fields=promoted_object&limit=100&access_token=${accessToken}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error || !data.data) return [];

    const appIds = new Set<string>();
    for (const campaign of data.data) {
      if (campaign.promoted_object?.application_id) {
        appIds.add(campaign.promoted_object.application_id);
      }
    }
    return Array.from(appIds);
  } catch {
    return [];
  }
}

/**
 * Batch fetch App IDs for multiple accounts.
 * Returns a map of accountId -> appIds[]
 */
export async function fetchAllAccountAppIds(
  accessToken: string,
  accounts: AdAccount[],
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const BATCH_SIZE = 5;

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (acc) => {
      const appIds = await fetchAccountAppIds(accessToken, acc.account_id);
      result[acc.account_id] = appIds;
    });
    await Promise.allSettled(promises);
    onProgress?.(Math.min(i + BATCH_SIZE, accounts.length), accounts.length);
    // Small delay between batches
    if (i + BATCH_SIZE < accounts.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return result;
}
