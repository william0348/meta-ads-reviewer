/**
 * Meta Marketing API Service
 * Handles all interactions with the Meta Graph API for fetching
 * ad accounts and disapproved ads.
 * 
 * Design: Tactical Dashboard — Dark Data-Driven
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

export interface AdReviewFeedback {
  [key: string]: string;
}

export interface DisapprovedAd {
  id: string;
  name: string;
  effective_status: string;
  ad_review_feedback?: AdReviewFeedback;
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
  };
  account_id?: string;
  account_name?: string;
}

export interface PagingCursors {
  before: string;
  after: string;
}

export interface PagingInfo {
  cursors: PagingCursors;
  next?: string;
  previous?: string;
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
  const fields = 'id,name,effective_status,ad_review_feedback,created_time,updated_time,campaign_id,adset_id,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url,body,title,image_url}';
  
  // Ensure account ID has act_ prefix
  const formattedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  
  let url = `${GRAPH_API_BASE}/${formattedId}/ads?effective_status=["DISAPPROVED"]&fields=${fields}&limit=${limit}&access_token=${accessToken}`;

  while (url) {
    const response = await fetch(url);
    const data: ApiResponse<DisapprovedAd> = await response.json();

    if (data.error) {
      throw new Error(`API Error for ${formattedId}: ${data.error.message} (Code: ${data.error.code})`);
    }

    allAds.push(...data.data);
    url = data.paging?.next || '';
  }

  return allAds;
}

/**
 * Fetch disapproved ads from multiple accounts
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

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { accountId, ads } = result.value;
      // Tag each ad with its account ID
      const taggedAds = ads.map((ad) => ({
        ...ad,
        account_id: accountId,
      }));
      allAds.push(...taggedAds);
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      // Extract account ID from error message if possible
      const match = errorMsg.match(/act_\d+/);
      errors.push({
        accountId: match ? match[0] : 'unknown',
        error: errorMsg,
      });
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
  } catch (err) {
    return { valid: false, error: 'Network error: Unable to reach Meta API' };
  }
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
