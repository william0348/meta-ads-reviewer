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
- [ ] Verify token save/load flow end-to-end
- [ ] Save checkpoint and deliver
