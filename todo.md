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
