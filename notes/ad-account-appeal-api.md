# Meta Ad Account Appeal API

## Endpoint
POST `<parent_business_manager_id>/ad_review_requests`

## Parameters
- `ad_account_ids` (list:numeric, required): The list of child ad account IDs to be appealed
- `app` (numeric, required): The partner app ID

## Max 50 ad accounts per request

## Required Permissions
- `business_management` scope on the token
- Admin privileges on the asset

## Access Tokens
- User_Personal_Access_Token (via Facebook Login)
- Parent_BM_Admin_System_User_Access_Token

## Appeal Statuses
- `appeal_entity_invalid` - Not eligible to be appealed
- `appeal_creation_failure` - Creation failed in pipeline
- `appeal_creation_success` - Appeal created, notification sent after judgment

## Response Format
```json
{
  "response": [
    {
      "entity_id": "<appealed_entity_id>",
      "appeal_case_id": "<appeal_created_case_id>",
      "status": "appeal_creation_success",
      "reason": "Appeal created successfully"
    }
  ]
}
```

## Note
This requires a PARENT_BUSINESS_MANAGER_ID. The user needs to know their BM ID.
Also needs an App ID for the `app` parameter.

## Alternative: Simple status update approach
For some disabled accounts, you might be able to use:
POST `act_<account_id>` with `account_status=1` (ACTIVE)
But this typically doesn't work for policy-disabled accounts.
