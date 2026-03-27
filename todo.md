# Meta Ads Reviewer - Feature Update Todo

## Critical Bug Fix
- [ ] Fix review_feedback displaying [object Object] — need to deeply parse nested objects

## Data & API
- [ ] Fetch ad spend (last 30 days) via insights endpoint for each ad
- [ ] Fetch more creative fields: body, title, link_url, call_to_action, image_url, object_story_spec
- [ ] Cache fetched ads data in localStorage so no re-fetch needed on reload
- [ ] Add timestamp to cached data for freshness check

## Dashboard Enhancements
- [ ] Account filter: multi-select which accounts to view
- [ ] Sort by 30-day spend (descending)
- [ ] Properly display review_feedback with nested object parsing

## Light Mode + Theme Toggle
- [ ] Switch default theme to light
- [ ] Add proper light mode CSS variables
- [ ] Add theme toggle button in sidebar
- [ ] Update gradient-border and glow effects for light mode
- [ ] Update Toaster theme to be dynamic

## Ad Content Viewer / Editor
- [ ] Ad detail dialog with full creative preview
- [ ] Edit ad creative fields (body, title, link)
- [ ] API integration for creating new creative + updating ad

## Ad Appeal / Re-review
- [ ] Request review button (set ad status to ACTIVE)
- [ ] Show appeal status feedback
