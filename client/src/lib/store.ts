/**
 * Local Storage Store
 * Persists settings (access token, manual account IDs) in browser localStorage.
 * 
 * Design: Tactical Dashboard — Dark Data-Driven
 */

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'meta_ads_reviewer_token',
  MANUAL_ACCOUNTS: 'meta_ads_reviewer_manual_accounts',
  AUTO_FETCH: 'meta_ads_reviewer_auto_fetch',
  API_VERSION: 'meta_ads_reviewer_api_version',
} as const;

export function getAccessToken(): string {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || '';
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
}

export function getManualAccounts(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.MANUAL_ACCOUNTS);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function setManualAccounts(accounts: string[]): void {
  localStorage.setItem(STORAGE_KEYS.MANUAL_ACCOUNTS, JSON.stringify(accounts));
}

export function addManualAccount(accountId: string): string[] {
  const accounts = getManualAccounts();
  const cleaned = accountId.trim().replace(/^act_/, '');
  if (cleaned && !accounts.includes(cleaned)) {
    accounts.push(cleaned);
    setManualAccounts(accounts);
  }
  return accounts;
}

export function removeManualAccount(accountId: string): string[] {
  const accounts = getManualAccounts().filter((id) => id !== accountId);
  setManualAccounts(accounts);
  return accounts;
}

export function getAutoFetch(): boolean {
  const stored = localStorage.getItem(STORAGE_KEYS.AUTO_FETCH);
  return stored === null ? true : stored === 'true';
}

export function setAutoFetch(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEYS.AUTO_FETCH, String(enabled));
}

export function clearAllSettings(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
