# Meta Ads Reviewer

A web application for collecting, reviewing, and managing disapproved advertisements across multiple Meta (Facebook/Instagram) advertising accounts. Built with React, TypeScript, and the Meta Marketing API, the tool provides a centralized dashboard for advertising operations teams to monitor policy violations, understand rejection reasons, and initiate appeals directly to Facebook Business Support.

**Live URL:** [metadsrev-6lulqwih.manus.space](https://metadsrev-6lulqwih.manus.space)
**Repository:** [github.com/william0348/meta-ads-reviewer](https://github.com/william0348/meta-ads-reviewer)

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Architecture Overview](#architecture-overview)
6. [Data Storage Schema](#data-storage-schema)
7. [Meta Marketing API Integration](#meta-marketing-api-integration)
8. [Pages and Components](#pages-and-components)
9. [Theme System](#theme-system)
10. [Future Enhancements](#future-enhancements)

---

## Features

The application provides a comprehensive workflow for managing disapproved ads at scale. Users begin by configuring their Meta API access token in the Settings page, then proceed to the Accounts page to either auto-fetch all associated ad accounts or manually input specific account IDs. The Dashboard then aggregates disapproved ads from all configured accounts into a single, filterable view.

| Feature | Description |
|---|---|
| Access Token Management | Secure token input with real-time validation against the Meta Graph API |
| Auto-Fetch Accounts | Automatically retrieves all ad accounts linked to the authenticated user |
| Manual Account Input | Supports adding individual ad account IDs for targeted monitoring |
| Account Grouping | Organize accounts into named groups with color-coded labels |
| Disapproved Ads Dashboard | Centralized view of all disapproved ads with statistics cards |
| Rejection Reason Parsing | Deep-parses nested `ad_review_feedback` objects into readable text |
| Time Range Filtering | Filter ads by 7, 14, 30, 60, 90 days, or view all |
| Group & Account Filtering | Filter dashboard by specific groups or individual accounts |
| Sorting | Sort by 30-day spend (descending) or account name (alphabetical) |
| One-Click ID Copy | Copy Ad ID, Campaign ID, Ad Set ID, or Account ID with a single click |
| Appeal Links | Direct links to Facebook Business Support using BM ID and Account ID |
| CSV Export | Export all visible disapproved ads to CSV with full metadata |
| Light/Dark Theme | Toggle between light and dark modes (light is default) |
| Data Caching | LocalStorage caching to avoid redundant API calls |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 19.x |
| Language | TypeScript | 5.6 |
| Build Tool | Vite | 7.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui (Radix primitives) | Latest |
| Icons | Lucide React | 0.453 |
| Routing | Wouter | 3.x |
| Animation | Framer Motion | 12.x |
| Toasts | Sonner | 2.x |
| Data Persistence | Browser localStorage | N/A |
| API | Meta Marketing Graph API | v21.0 |

---

## Project Structure

```
meta-ads-reviewer/
├── client/
│   ├── index.html                  # HTML entry point (Google Fonts loaded here)
│   ├── src/
│   │   ├── main.tsx                # React DOM bootstrap
│   │   ├── App.tsx                 # Root component with routing
│   │   ├── index.css               # Global styles, theme variables, Tailwind config
│   │   ├── const.ts                # Shared constants
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Main dashboard (830 lines)
│   │   │   ├── Accounts.tsx        # Account management (733 lines)
│   │   │   ├── Settings.tsx        # Token configuration (232 lines)
│   │   │   ├── Home.tsx            # Redirect to Dashboard
│   │   │   └── NotFound.tsx        # 404 page
│   │   ├── components/
│   │   │   ├── DashboardLayout.tsx  # Sidebar navigation + theme toggle
│   │   │   ├── AdDetailDialog.tsx   # Ad detail viewer with appeal actions
│   │   │   ├── CopyableId.tsx       # Reusable copy-to-clipboard component
│   │   │   ├── ErrorBoundary.tsx    # React error boundary
│   │   │   ├── ManusDialog.tsx      # Custom dialog wrapper
│   │   │   └── ui/                  # shadcn/ui component library (40+ components)
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx      # Light/dark theme context provider
│   │   ├── hooks/
│   │   │   ├── useComposition.ts    # IME composition handling
│   │   │   ├── useMobile.tsx        # Mobile breakpoint detection
│   │   │   └── usePersistFn.ts      # Stable function reference hook
│   │   └── lib/
│   │       ├── metaApi.ts           # Meta Marketing API service (528 lines)
│   │       ├── store.ts             # LocalStorage persistence layer (277 lines)
│   │       └── utils.ts             # Utility helpers (cn, etc.)
│   └── public/                      # Static assets (favicon, robots.txt)
├── server/
│   └── index.ts                     # Minimal Express server for SPA routing
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

The application requires Node.js 18+ and pnpm as the package manager. A valid Meta Marketing API access token with `ads_read` permission is required for fetching ad data.

### Installation

```bash
git clone https://github.com/william0348/meta-ads-reviewer.git
cd meta-ads-reviewer
pnpm install
pnpm run dev
```

The development server starts at `http://localhost:3000`. Navigate to the **Settings** page first to configure your Meta API access token.

### Build for Production

```bash
pnpm run build
pnpm start
```

---

## Architecture Overview

The application follows a **client-only architecture** with no backend database. All data persistence is handled through the browser's `localStorage` API. The Meta Marketing API is called directly from the browser using the user's access token, which means no server-side proxy is involved and the token never leaves the user's browser.

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ Settings │   │ Accounts │   │  Dashboard   │ │
│  │  Page    │   │  Page    │   │    Page      │ │
│  └────┬─────┘   └────┬─────┘   └──────┬───────┘ │
│       │              │                │          │
│       └──────────┬───┴────────────────┘          │
│                  │                                │
│          ┌───────▼────────┐                       │
│          │   store.ts     │  ← localStorage API   │
│          │  (Persistence) │                       │
│          └───────┬────────┘                       │
│                  │                                │
│          ┌───────▼────────┐                       │
│          │  metaApi.ts    │  ← fetch() calls      │
│          │  (API Client)  │                       │
│          └───────┬────────┘                       │
│                  │                                │
└──────────────────┼────────────────────────────────┘
                   │ HTTPS
         ┌─────────▼──────────┐
         │  Meta Graph API    │
         │  (v21.0)           │
         └────────────────────┘
```

### Data Flow

The data flow follows a straightforward pattern. The user configures their access token in Settings, which is stored in localStorage. On the Accounts page, the app fetches ad accounts from the Meta API and caches them locally. When the user navigates to the Dashboard, the app fetches disapproved ads for all configured accounts, enriches them with 30-day spend insights, and caches the results. Subsequent visits use cached data unless the user explicitly refreshes.

---

## Data Storage Schema

All application state is persisted in the browser's `localStorage`. The table below documents every storage key, its data type, and its purpose. Since localStorage only stores strings, all non-string values are serialized as JSON.

### Storage Keys

| Key | Type | Default | Description |
|---|---|---|---|
| `meta_ads_reviewer_token` | `string` | `""` | Meta Marketing API access token |
| `meta_ads_reviewer_auto_fetch` | `string` ("true"/"false") | `"true"` | Whether to auto-fetch all linked ad accounts |
| `meta_ads_reviewer_manual_accounts` | `JSON string` → `string[]` | `[]` | Array of manually added ad account IDs (numeric, no `act_` prefix) |
| `meta_ads_reviewer_groups` | `JSON string` → `AccountGroup[]` | `[]` | Account groups with names, colors, and member account IDs |
| `meta_ads_reviewer_cached_ads` | `JSON string` → `DisapprovedAd[]` | `null` | Cached disapproved ads from last fetch |
| `meta_ads_reviewer_cached_ads_ts` | `string` (timestamp) | `null` | Unix timestamp (ms) of when ads were last cached |
| `meta_ads_reviewer_cached_errors` | `JSON string` → `ErrorEntry[]` | `[]` | Errors from the last fetch attempt (per account) |
| `meta_ads_reviewer_bm_ids` | `JSON string` → `Record<string, BmIdEntry>` | `{}` | Business Manager ID cache, keyed by account ID |
| `meta_ads_reviewer_account_names` | `JSON string` → `Record<string, string>` | `{}` | Account name cache, mapping account ID to display name |
| `meta_ads_reviewer_auto_accounts` | `JSON string` → `AdAccount[]` | `[]` | Cached auto-fetched ad accounts |
| `theme` | `string` ("light"/"dark") | `"light"` | Current theme preference |

### Data Type Definitions

#### `AccountGroup`

Represents a named group of ad accounts with a visual color label. Groups are created on the Accounts page and used as filters on the Dashboard.

```typescript
interface AccountGroup {
  id: string;          // Unique ID, format: "grp_{timestamp}_{random4chars}"
  name: string;        // User-defined group name (e.g., "台灣客戶")
  accountIds: string[];// Array of numeric ad account IDs (no act_ prefix)
  color: string;       // Hex color for visual identification (e.g., "#3b82f6")
}
```

The color is automatically assigned from a rotating palette of 10 predefined colors: `#3b82f6` (blue), `#10b981` (emerald), `#f59e0b` (amber), `#ef4444` (red), `#8b5cf6` (violet), `#ec4899` (pink), `#06b6d4` (cyan), `#84cc16` (lime), `#f97316` (orange), `#6366f1` (indigo).

#### `DisapprovedAd`

The core data object representing a single disapproved advertisement. This is the primary entity displayed on the Dashboard.

```typescript
interface DisapprovedAd {
  id: string;                    // Ad ID (e.g., "23851234567890")
  name: string;                  // Ad name
  status: string;                // Ad status
  effective_status: string;      // Always "DISAPPROVED" for this app
  account_id?: string;           // Numeric account ID (added by the app)
  account_name?: string;         // Account display name (added by the app)
  ad_review_feedback?: Record<string, unknown>;  // Raw API response
  parsed_review_feedback?: ReviewFeedbackItem[];  // Parsed rejection reasons
  created_time: string;          // ISO 8601 timestamp
  updated_time?: string;         // ISO 8601 timestamp
  campaign_id?: string;          // Parent campaign ID
  adset_id?: string;             // Parent ad set ID
  campaign?: {                   // Campaign details
    id: string;
    name: string;
  };
  adset?: {                      // Ad set details
    id: string;
    name: string;
  };
  creative?: {                   // Ad creative details
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
  spend_30d?: number;            // 30-day spend in account currency
  impressions_30d?: number;      // 30-day impressions count
  clicks_30d?: number;           // 30-day clicks count
}
```

#### `ReviewFeedbackItem`

A parsed rejection reason extracted from the nested `ad_review_feedback` object returned by the Meta API.

```typescript
interface ReviewFeedbackItem {
  key: string;   // Feedback category (e.g., "global")
  body: string;  // Human-readable rejection reason text
}
```

The Meta API returns `ad_review_feedback` in various nested formats. The `parseReviewFeedback()` function in `metaApi.ts` handles all known structures, including `{ "global": { "body": "..." } }`, `{ "global": "string" }`, and deeply nested objects with arrays.

#### `AdAccount`

Represents a Meta ad account as returned by the Graph API.

```typescript
interface AdAccount {
  id: string;              // Full ID with prefix (e.g., "act_123456789")
  account_id: string;      // Numeric account ID (e.g., "123456789")
  name: string;            // Account display name
  account_status: number;  // Status code (1=Active, 2=Disabled, etc.)
  currency?: string;       // Account currency (e.g., "TWD", "USD")
  business_name?: string;  // Associated business name
}
```

Account status codes are mapped to human-readable labels:

| Code | Status |
|---|---|
| 1 | Active |
| 2 | Disabled |
| 3 | Unsettled |
| 7 | Pending Review |
| 8 | Pending Closure |
| 9 | In Grace Period |
| 100 | Pending Risk Review |
| 101 | Any Active |
| 201 | Any Closed |

#### `BmIdEntry`

Cached Business Manager ID for an ad account, used to construct appeal URLs.

```typescript
interface BmIdEntry {
  accountId: string;  // Numeric ad account ID
  bmId: string;       // Business Manager ID
  bmName: string;     // Business Manager display name
}
```

#### `CachedAdsData`

The wrapper structure for cached disapproved ads data.

```typescript
interface CachedAdsData {
  ads: DisapprovedAd[];                          // All cached ads
  errors: { accountId: string; error: string }[];// Per-account fetch errors
  timestamp: number;                              // Unix timestamp (ms)
}
```

---

## Meta Marketing API Integration

The application communicates with the Meta Graph API v21.0 through the `metaApi.ts` service module. All API calls are made directly from the browser using `fetch()` with the user's access token as a query parameter.

### API Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /me?fields=name,id` | GET | Validate access token |
| `GET /me/adaccounts?fields=id,account_id,name,account_status,currency,business_name` | GET | Fetch all linked ad accounts |
| `GET /act_{id}/ads?effective_status=["DISAPPROVED"]&fields=...` | GET | Fetch disapproved ads for an account |
| `GET /{ad_id}/insights?fields=spend,impressions,clicks&date_preset=last_30d` | GET | Fetch 30-day spend insights per ad |
| `GET /act_{id}?fields=business` | GET | Fetch Business Manager ID for an account |
| `GET /act_{id}?fields=name` | GET | Fetch account display name |
| `POST /{ad_id}` (status=ACTIVE) | POST | Request ad re-review |
| `POST /act_{id}/adcreatives` | POST | Create new ad creative |
| `POST /{ad_id}` (creative=...) | POST | Update ad to use new creative |

### Rate Limiting and Batching

The application implements several strategies to work within Meta API rate limits. Ad insights are fetched in batches of 50 using `Promise.allSettled()` to prevent a single failure from blocking the entire batch. Business Manager IDs are fetched in batches of 10. All pagination is handled automatically by following the `paging.next` URL returned by the API.

### Appeal URL Format

The appeal URL is constructed as:

```
https://www.facebook.com/business-support-home/{BM_ID}/{ACCOUNT_ID}/
```

Where `BM_ID` is the Business Manager ID and `ACCOUNT_ID` is the numeric ad account ID (without the `act_` prefix).

---

## Pages and Components

### Dashboard (`/`)

The main page displays all disapproved ads with the following sections:

**Statistics Cards** at the top show total disapproved ads count, number of affected accounts, total 30-day spend on disapproved ads, and the cache age indicator.

**Filter Bar** provides three filter dimensions: account group selector (dropdown), individual account selector (dropdown), and time range selector (7/14/30/60/90 days or all). The default time range is 30 days.

**Sort Controls** allow sorting by 30-day spend (descending) or account name (alphabetical).

**Ad Cards** display each disapproved ad with its name, account name, account ID, rejection reasons, created/updated dates, and an expandable section showing campaign name, ad set name, all copyable IDs, and the appeal link button.

### Accounts (`/accounts`)

The account management page is divided into three sections:

**Auto-Fetch Accounts** shows all ad accounts automatically retrieved from the Meta API, with account name, ID, status, and currency displayed for each.

**Manual Accounts** allows users to add individual account IDs. Each entry shows the account name (from cache) alongside the numeric ID.

**Account Groups** enables creating named groups from existing accounts. Each group displays its color label, member count, and a list of member accounts with their names. Groups can be edited or deleted.

### Settings (`/settings`)

The settings page provides access token configuration with a masked input field, a validation button that tests the token against the Meta API, and a toggle for the auto-fetch accounts feature.

---

## Theme System

The application supports light and dark modes through a React context provider (`ThemeContext`). The default theme is light mode. Theme preference is persisted in localStorage under the `theme` key.

### Color Variables

All colors are defined as CSS custom properties in `index.css` using hex values (chosen over oklch for broader browser compatibility). The light and dark themes each define a complete set of semantic color tokens.

| Token | Light Mode | Dark Mode | Purpose |
|---|---|---|---|
| `--background` | `#f0f1f5` | `#111218` | Page background |
| `--foreground` | `#111827` | `#e8e9f0` | Primary text |
| `--card` | `#ffffff` | `#1a1b25` | Card background |
| `--primary` | `#1d6fb5` | `#4a9ede` | Primary accent (buttons, links) |
| `--destructive` | `#d93636` | `#e85555` | Error/rejection indicators |
| `--muted-foreground` | `#555872` | `#8b8ea6` | Secondary text |
| `--border` | `#d8dae3` | `rgba(255,255,255,0.1)` | Borders and dividers |
| `--sidebar` | `#f7f8fa` | `#15161e` | Sidebar background |

### Typography

The application uses three font families loaded from Google Fonts:

| Font | Usage | CSS Variable |
|---|---|---|
| Space Grotesk | Headings, logo, navigation labels | `--font-display` |
| Inter | Body text, descriptions, form inputs | `--font-body` |
| IBM Plex Mono | Data values, IDs, code snippets | `--font-mono` |

---

## Future Enhancements

The following features are planned or under consideration for future development:

**Batch Appeal** would allow selecting multiple ads and opening all appeal links simultaneously, streamlining the appeal workflow for accounts with many disapproved ads.

**Rejection Reason Analytics** using Recharts to visualize the distribution of rejection reasons across accounts and time periods, helping identify patterns in policy violations.

**Ad Creative Preview** would display the actual ad creative (image, video, or carousel) within the expanded ad details section, providing visual context alongside the rejection reason.

**Auto-Refresh** with configurable intervals (e.g., every 15 minutes, hourly) to keep the dashboard data current without manual refresh.

**Excel Export** with all fields including account names, group assignments, and formatted dates for more advanced data analysis workflows.

---

## License

MIT

---

*Built with Manus AI*
