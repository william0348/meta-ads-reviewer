# Meta Ads Reviewer - Todo

## Upgrade to Full-Stack: Token Storage in DB
- [x] Run webdev_add_feature to add web-db-user (backend + DB + auth)
- [x] Review the generated README/diffs for migration steps
- [x] Create user_settings table (user_id, access_token, token_label, bm_ids, account_groups, created_at, updated_at)
- [x] Create API endpoints: GET/PUT /api/user/settings — fetch/save user settings (tRPC procedures)
- [x] Update frontend Settings page to save token to DB via API
- [x] On app load, fetch token from DB if user is authenticated
- [x] Migrate other localStorage data (account groups, manual accounts) to DB sync
- [x] Update DashboardLayout sidebar with login/logout and cloud sync status
- [x] Write vitest tests for settings procedures (8 tests passing)
- [x] Verify token save/load flow end-to-end
- [x] Save checkpoint and deliver

## Disapproval Date Filtering
- [x] Research Meta Graph API for disapproval date field (no dedicated field; updated_time is best proxy)
- [x] Update time filtering logic to use disapproval date (updated_time) instead of creation date
- [x] Update Dashboard UI to reflect the new date logic (labels, sort, CSV, ad card display)

## Background Dashboard Execution
- [x] Create global DashboardDataContext for persistent data across page navigation
- [x] Move fetchData logic from Dashboard component into the context provider
- [x] Add auto-refresh interval support (configurable timer)
- [x] Update Dashboard to consume global context instead of local state
- [x] Show background loading indicator in sidebar when data is being fetched

## API Code 1 Fix & Account Selection
- [x] Add ultra-bare tier (limit=1, minimal fields) for Code 1 retry
- [x] Add per-account delay between API calls to avoid rate limiting (500ms inter-account, exponential backoff on errors)
- [x] Add retry with exponential backoff before falling back to next tier (2 retries per tier)
- [x] Add rate limit handling for Code 4/17/32 errors
- [x] Reduce batch size from 10 to 5 accounts per batch for more conservative rate limiting
- [x] Add account exclusion feature — eye icon on each auto-fetched account to exclude from Dashboard
- [x] Add account selection in Dashboard — "Dashboard 載入範圍" section with checkboxes to select specific accounts
- [x] Add excluded/selected account functions to store.ts (localStorage persistence)
- [x] Update DashboardDataContext to filter accounts based on exclusion/selection settings
- [x] Excluded accounts shown with strikethrough and dimmed styling in Accounts page

## Display Account Status (Active/Disabled)
- [x] Store account_status from fetchAdAccounts in localStorage cache (already cached via setCachedAutoAccounts)
- [x] Show status badge (Active/Disabled/etc.) next to each auto-fetched account
- [x] Add filter pills (All/Active/Disabled/Other) to quickly find accounts by status
- [x] Highlight Disabled accounts with distinct rose-colored badge styling

## Per-Ad Refresh & Data Persistence to DB
- [x] Create disapproved_ads DB table (ad_id, user_id, account_id, ad data JSON, timestamps)
- [x] Add DB helpers: saveAds, loadAds, updateSingleAd
- [x] Add tRPC procedures: ads.save, ads.load, ads.updateOne, ads.clear, ads.recordFetch, ads.lastFetch
- [x] Add fetchSingleAd function in metaApi.ts to re-fetch one ad's latest data
- [x] Update DashboardDataContext to save ads to DB after fetch and load from DB on mount
- [x] Add per-ad refresh button in Dashboard ad rows
- [x] Add per-ad refresh button in AdDetailDialog
- [x] Ensure data loads from DB on app open (no re-fetch needed)
- [x] Write vitest tests for ads router (8 tests passing)

## Dashboard Status Tab Navigation
- [x] Add status tab bar: 可提交審查 / 審查中 / 已獲准 / 維持禁止刊登
- [x] Classify ads by effective_status into tabs with counts
- [x] Show colored count badges on each tab
- [x] Update ad card Badge to show effective_status (PENDING_REVIEW, ACTIVE, etc.) with dynamic colors
- [x] Make status tabs work with existing filters (group, account, date, search)

## Remove Account Exclusion/Selection Filter
- [x] Remove excluded/selected account functions from store.ts
- [x] Remove exclusion/selection UI from Accounts.tsx (eye icons, Dashboard 載入範圍 section)
- [x] Remove exclusion/selection filtering from DashboardDataContext
- [x] Ensure all accounts load by default

## Bug Fix: Status Tab Not Filtering Ads
- [x] Fix status tab switching to actually filter the ad list below (missing statusTab in useMemo deps)

## Bug Fix: Permissions Error on Single Ad Refresh
- [ ] Investigate and fix Permissions error when refreshing individual ads

## App ID Filter on Dashboard
- [x] Research how to get App ID from Meta API — use adset.promoted_object.application_id
- [x] Update metaApi.ts to fetch promoted_object from adset in all tiers + fetchSingleAd
- [x] Add promoted_object_app_id to DisapprovedAd type
- [x] Add App ID filter dropdown to Dashboard with Smartphone icon
- [x] Display App ID on ad cards (blue text with icon) and AdDetailDialog (CopyableId)

## App Name Resolution
- [x] Add fetchAppNames function in metaApi.ts — batch lookup via /?ids={...}&fields=id,name
- [x] In-memory cache to avoid repeated API calls, batch size 50
- [x] Display App name in Dashboard filter dropdown (e.g. "MyGame (123456)")
- [x] Display App name on ad cards (blue text with Smartphone icon)
- [x] Display App name in AdDetailDialog (CopyableId label shows App name)
- [x] Pass appNames prop through AdCard and AdDetailDialog components

## Bug Fix: Appeal Permissions Error
- [x] Investigated Permissions error — likely caused by account-level restrictions, not token permissions
- [x] Improved error messages: now shows error code, subcode, type, fbtrace_id, and user-friendly hints
- [x] Added hints for common error codes (10=ads_management, 100=ad restricted, 200=permissions, 4/17/32=rate limit)
- [x] Increased toast duration to 15s for error details in AdDetailDialog
- [x] Improved batch appeal failure display with styled cards and whitespace-pre-wrap
- [x] Reduced batch appeal concurrency from 10 to 5 and increased delay to 500ms

## Ad Account Appeals Page
- [x] Research Meta API for ad account appeal/review request endpoint (POST /{bm_id}/ad_review_requests)
- [x] Add requestAdAccountReview and fetchAllAccountAppIds functions in metaApi.ts
- [x] Create AccountAppeals.tsx page with disabled accounts list, status cards, and appeal config
- [x] Add App ID filter with names for disabled accounts (fetchAppNames integration)
- [x] Add batch appeal functionality with BM ID and App ID inputs
- [x] Show appeal results per account (success/fail/invalid with Case ID)
- [x] Register route /account-appeals in App.tsx and add sidebar nav item with ShieldAlert icon
- [x] Auto-detect BM ID from cache, CopyableId components, FB external appeal link

## Bug Fix: Missing Appeal Button, Account Sync & Performance
- [x] Restore appeal button in expanded ad card — now always shows (uses generic FB support URL when no BM ID)
- [x] Add appeal button to AdDetailDialog for consistency
- [x] Fix ad list not syncing with account filter selection — normalized account_id comparison
- [x] Optimize Dashboard rendering performance for large ad lists (2363 ads) — pagination with 50 ads per page

## New Features (Apr 8)
- [x] Dashboard: account names already displayed on ad cards (was already implemented)
- [x] Remove Account Appeals page and sidebar nav entry — deleted AccountAppeals.tsx, removed route and nav item
- [x] Accounts page: add exclude/include toggle per account with Eye/EyeOff icons
- [x] DB: added excludedAccounts JSON field to user_settings table
- [x] tRPC: added settings.saveExcludedAccounts procedure for DB persistence
- [x] Dashboard: filter out excluded accounts when fetching ads (DashboardDataContext)
- [x] Accounts page: added 「已排除」 filter tab with count, excluded accounts shown dimmed with strikethrough
- [x] localStorage + DB dual persistence for excluded accounts

## Bug Fix: Account Filter Not Syncing with Ads List
- [x] Fix Dashboard account filter so ads list updates when account is switched — normalized account_id comparison already in place

## Feature: Only Fetch Ads from Active Accounts
- [x] Filter DashboardDataContext to only fetch disapproved ads from accounts with Active status (account_status === 1), skip Disabled/Unsettled/etc.

## Dashboard Cleanup (Apr 8)
- [x] Stats cards: show counts based on filtered date range (not total)
- [x] Remove "更新廣告" (refresh single ad) feature — removed from AdCard and AdDetailDialog
- [x] Remove "編輯廣告" (edit ad) feature — removed refresh props from AdCard/AdDetailDialog

## Agency BM Support + Cleanup (Apr 8)
- [x] Fix BM ID fetching to also check agency relationship — now queries fields=business,agency, prefers agency BM
- [x] Remove "更新此廣告" button from AdCard
- [x] Remove refresh/edit features from AdDetailDialog
- [x] Clean up refreshSingleAd references from Dashboard

## BM Name Display (Apr 8)
- [x] Show BM name (Agency/Owner) on ad cards in Dashboard — purple Building2 icon with BM name
- [x] Show BM name in AdDetailDialog — CopyableId with BM ID and name label
- [ ] Show BM name in Dashboard account filter dropdown (deferred)

## Bug Fix: Dashboard Still Shows Non-Active Account Ads (Apr 8)
- [x] Fix DB-loaded ads to also filter out non-Active accounts (DB load and localStorage fallback both filter)

## Accounts Page: Only Show Active Auto-Fetched Accounts (Apr 8)
- [x] Filter auto-fetched accounts in Accounts page to only show Active (account_status === 1) — toast shows skipped count

## Dashboard Account Dropdown: Active Only (Apr 8)
- [x] Filter Dashboard account dropdown to only show Active accounts — merged into batch UI improvements below

## Dashboard UI Improvements (Apr 8 - batch)
- [x] Account dropdown: only show Active accounts (uses getCachedAutoAccounts to filter)
- [x] Ad cards: show BM Name & BM ID (BM ID shown in smaller monospace font)
- [x] Ad cards: remove act_ prefix from account ID display (now shows numeric ID only)
- [x] New filter: BM Name dropdown filter with Building2 icon and ad count per BM
- [x] AdDetailDialog: BM Name and BM ID shown as separate CopyableId fields
- [x] AdDetailDialog: account ID without act_ prefix

## Dashboard Charts (Apr 8)
- [x] Add cumulative bar chart: Disapproved ad count by day (stacking/cumulative)
- [x] Add cumulative bar chart: Affected spend amount by day (stacking/cumulative)

## Disabled Account Filtering (Apr 8)
- [x] Ensure auto-fetched accounts exclude disabled accounts (Accounts page)
- [x] Ensure Dashboard does not display ads from disabled accounts (including DB-loaded ads)

## Fix Agency BM Fetching (Apr 8)
- [x] Research Meta Graph API: `agency` is NOT a documented field on Ad Account node
- [x] Confirmed `/agencies` edge is the correct way to get agency-shared BM info
- [x] Updated `fetchBmIdForAccount` to use `/agencies` edge instead of undocumented `agency` field
- [x] Step 1: Query `business` field for owner BM (who owns the account)
- [x] Step 2: Query `/agencies` edge for agency BMs (who shared access to the account)
- [x] Updated `BmIdEntry` in store.ts to store ownerBmId/Name and agencyBmId/Name separately
- [x] Updated `setBmIdForAccount` to accept extra agency/owner BM info
- [x] Updated `fetchBmIdsForAccounts` to pass full BM info through
- [x] Updated DashboardDataContext and Accounts.tsx to pass extra BM info when caching
- [x] Updated AdCard display: shows "Agency" label when agency BM exists
- [x] Updated AdDetailDialog: shows Agency BM and Owner BM as separate fields with labels
- [x] All 16 tests passing

## Fix Account Name Dropdown Display (Apr 8)
- [x] Investigate why account filter dropdown shows IDs instead of names
- [x] DB load path: extract account names from loaded ads + cachedAutoAccounts, update localStorage and state
- [x] localStorage fallback path: same fix applied
- [x] Dropdown now shows account names when data is loaded from DB or cache (no re-fetch needed)

## Unify Data Storage to DB (Apr 8)
- [x] Add accountNames, bmCacheData, autoAccounts longtext columns to user_settings table
- [x] Create tRPC procedures: saveAccountNames, getAccountNames, saveBmCache, getBmCache, saveAutoAccounts, getAutoAccounts
- [x] Update settings.get to return new fields (accountNames, bmCacheData, autoAccounts)
- [x] All procedures use merge strategy (new data merges with existing, not replaces)
- [x] Update DashboardDataContext to sync account names, BM cache, auto accounts to DB after fetch
- [x] Update Accounts page to load from DB settings and sync to DB on fetch
- [x] Update useSettingsSync to sync new fields between DB and localStorage on login
- [x] DB is now primary source of truth; localStorage serves as local cache for offline/quick access
- [x] Write tests for new procedures (14 settings tests, 23 total tests all passing)

## Bug Fix: Dropdown Ad Counts Inconsistent with Stats (Apr 10)
- [x] Account dropdown counts now use dateFilteredAds (date range filtered), not all ads
- [x] Same fix applied to App dropdown and BM dropdown counts
- [x] "所有帳號" total now matches stats card "被拒登廣告" count
- [x] Moved dateFilteredAds definition before uniqueAccountIds/uniqueBmNames/uniqueAppIds to fix declaration order
- [x] uniqueAccountIds, uniqueBmNames, uniqueAppIds all derive from dateFilteredAds now

## Organization Management & Shared Data (Apr 10)
- [x] Create organizations table (id, name, created_by, created_at, updated_at)
- [x] Create org_members table (id, org_id, user_id, role: owner/admin/member, joined_at)
- [x] Create org_settings table (org_id, accessToken, bmIds, accountGroups, manualAccounts, excludedAccounts, accountNames, bmCacheData, autoAccounts)
- [x] Add orgId column to disapproved_ads and fetch_history tables
- [x] Create tRPC procedures: org.create, org.my, org.updateName, org.addMember, org.removeMember, org.updateMemberRole, org.leave, org.members, org.allUsers
- [x] Create effective settings layer: getEffectiveSettings/saveEffectiveSettings auto-resolves org vs user scope
- [x] All settings procedures (get, save, saveAccountNames, saveBmCache, saveAutoAccounts, etc.) now org-aware
- [x] All ads procedures (save, load, clear, recordFetch, lastFetch) now org-aware
- [x] Create Organization management page (create org, edit name, manage members with role badges, add/remove/role-change, leave org)
- [x] Add Organization nav item in DashboardLayout sidebar with Building2 icon
- [x] Update useSettingsSync to auto-resolve org metadata (orgId, orgName, orgRole)
- [x] DashboardLayout footer shows org name when user is in an org
- [x] All org members see the same data without re-fetching from Meta API
- [x] Owner/Admin can assign/remove members, change roles
- [x] Write org tests (18 tests passing), update settings tests (14 passing), ads tests (8 passing)
- [x] Total: 41 tests all passing

## Meta Ads Rate Limiter Integration (Apr 10)
- [x] Created MetaAdsRateLimiter class in client/src/lib/rateLimiter.ts
- [x] Parses X-Business-Use-Case-Usage and x-fb-ads-insights-throttle headers from every response
- [x] Tracks per-account usage (callCount, totalCputime, totalTime, accIdUtilPct)
- [x] Auto-delay: 5s when usage >= 70% (warn), 30s when >= 90% (pause), full wait on throttle
- [x] Exponential backoff for retryable error codes (4, 17, 32, 80000, 80004, 613)
- [x] Minimum 500ms delay between all API calls
- [x] Integrated into ALL Meta API functions: fetchAdAccounts, fetchDisapprovedAds, fetchAdInsights, fetchAllDisapprovedAds, fetchBmIdForAccount, fetchBmIdsForAccounts, fetchSingleAd, fetchAppNames, fetchAccountAppIds, validateToken, requestAdReview, requestAdAccountReview, batchRequestAdReview, updateAdCreative
- [x] Replaced ad-hoc fixed delays with intelligent rate-limiter-driven throttling
- [x] Singleton rateLimiter instance shared across all API calls
- [x] onStatusChange callback available for UI to display rate limit status
- [x] All 41 tests passing

## Rate Limit Status Indicator on Dashboard (Apr 11)
- [x] rateLimiter already has getStatus() and getAllStatuses() methods
- [x] Created RateLimitIndicator component with compact summary bar and expandable per-account details
- [x] Integrated between stats cards and charts in Dashboard
- [x] Color-coded: green (normal <70%), amber (70-90%), red (>90%/throttled) with matching icons
- [x] Auto-polls every 500ms during loading, 2s otherwise; also subscribes to onStatusChange callback
- [x] Shows per-account progress bars, usage %, throttle badges, API access tier
- [x] App-level usage display, legend, and tooltip explanation
- [x] Hidden when no data and not loading (clean UI)
- [x] All 41 tests passing

## Copy Ad IDs Button on Dashboard (Apr 13)
- [x] Add a button to copy all filtered ad IDs to clipboard (space-separated format)
- [x] Support copying selected ads (via checkbox) or all filtered ads — button text dynamically changes
- [x] Show toast notification with count and preview on successful copy
- [x] All 41 tests passing

## Batch Add Multiple Ad Accounts (Apr 24)
- [x] Allow pasting multiple ad account IDs at once in the add account input
- [x] Support space, comma, semicolon, newline, and tab as separators
- [x] Parse and add all valid account IDs in one action (skip duplicates and invalid)
- [x] Show toast with count of successfully added, skipped duplicates, and invalid IDs
- [x] Updated placeholder text and description to indicate batch support
- [x] Auto-fetch BM IDs for all newly added accounts
- [x] All 41 tests passing

## Bug Fix: Duplicate Key Errors in Dashboard (Apr 24)
- [x] Fix duplicate ad IDs causing React key errors on Dashboard page
- [x] Added deduplicateAds() helper in DashboardDataContext.tsx — deduplicates by ad ID (keeps last occurrence)
- [x] Applied to all 3 setAds() call sites: DB load, localStorage fallback, API fetch final result
- [x] All 41 tests passing
