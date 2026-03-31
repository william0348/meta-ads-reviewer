# Meta API — Ad Status After Appeal Research

## Key Findings

### 1. effective_status field values (from Ad Graph API)
The `effective_status` field on an Ad object can be:
- `ACTIVE`
- `PAUSED`
- `DELETED`
- `PENDING_REVIEW` ← This is what shows after appeal/re-submission
- `DISAPPROVED`
- `PREAPPROVED`
- `PENDING_BILLING_INFO`
- `CAMPAIGN_PAUSED`
- `ARCHIVED`
- `ADSET_PAUSED`
- `IN_PROCESS`
- `WITH_ISSUES`

### 2. Appeal Flow via API
When you set an ad's status to ACTIVE (our current approach via `requestAdReview`):
- The ad goes into `PENDING_REVIEW` effective_status
- Meta's review team processes it (typically within 24 hours)
- After review: either back to `ACTIVE` (approved) or `DISAPPROVED` again

### 3. Appeals API (Business Management level)
- POST `<bm_id>/ad_review_requests` — for appealing banned ad accounts (not individual ads)
- Returns `appeal_case_id` and status: `appeal_creation_success`, `appeal_entity_invalid`, `appeal_creation_failure`
- Parent BM is notified once audit team makes a decision
- Max 50 ad accounts per appeal request

### 4. Queryable via API?
**YES** — The `effective_status` field is fully queryable:
- `PENDING_REVIEW` = ad is under review (after appeal or initial submission)
- `DISAPPROVED` = ad was rejected
- `ACTIVE` = ad was approved and running

So we CAN track appeal status by polling `effective_status` via our existing `fetchSingleAd` function.

### 5. Important Note from docs
> "Note that results returned by `synchronous_ad_review` does not represent the final decision made during full review of your ad."

This means the initial sync review might not be final — the ad could still be disapproved after full review.
