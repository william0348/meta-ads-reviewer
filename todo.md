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

## Bug Fix: Duplicate Key Errors in Dashboard
- [x] Fix React duplicate key errors caused by duplicate ad IDs in the ads list — added deduplicateAds() helper + composite key fallback

## Bug Fix: Ad Appeal OAuthException & Account Appeals Enhancements
- [x] Improve ad appeal API error handling — added input validation, cleaned BM/App IDs, detailed error hints for Code 1 (BM/App mismatch, permissions)
- [x] Improve App filter dropdown on Account Appeals page — shows account count per app, always visible when data loaded
- [x] Improve batch appeal UX — BM ID dropdown from cache, App ID dropdown from fetched data, confirmation dialog, progress tracking, result summary badges
- [x] Add FB appeal button to every account card (uses generic URL when no BM-specific URL available)
- [x] Add info box explaining appeal requirements (business_management permission, Parent BM, Admin role)

## Account Appeals UX Improvements
- [x] Remove redundant App ID manual input box — now pure dropdown only (no __custom_app__ option)
- [x] Show batch appeal section when 1+ accounts selected (not just when disabled accounts exist)
- [x] Improved batch appeal UX — inline bar with BM/App dropdowns, auto-select first BM and App, cancel selection button
