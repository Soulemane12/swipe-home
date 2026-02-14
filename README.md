# HomeSwipe

HomeSwipe is a swipe-first NYC housing app: add your commute places, swipe real listings, learn your preferences, and fetch better matches automatically.

The app is designed for hackathon demos and real user testing:
- Fast first cards
- Real commute times
- Real listing enrichment
- Live preference learning
- In-app AI monitoring

## Table Of Contents
1. What It Is
2. Current Routes
3. Product Flow
4. Core Features
5. AI + Ranking (How Matching Works)
6. Monitoring (White Circle-Style Workflow)
7. Data Pipeline + Caching
8. APIs + Integrations
9. Local Storage Model
10. Setup
11. Environment Variables
12. Dev Proxies
13. Scripts
14. Project Structure
15. Troubleshooting + Limitations
16. Security Notes

## What It Is
HomeSwipe is a React + TypeScript + Vite frontend app for apartment discovery.

It combines:
- RentCast listing inventory
- Mapbox geocoding/map/directions
- HERE public transit routing
- SerpApi enrichment (features, subway hints, StreetEasy lookup)
- Anthropic Claude (`claude-sonnet-4-20250514`) for tag extraction, explanations, and adaptive quiz copy

## Current Routes
- `/` -> Landing page
- `/landing` -> Redirects to `/`
- `/filter` -> 3-step onboarding
- `/swipe` -> Main swipe feed
- `/saved` -> Saved homes map + list panel
- `/monitor` -> AI monitoring dashboard
- `*` -> NotFound

## Product Flow
1. Open `/` and go to onboarding (`/filter`).
2. Add commute places (prefilled with School + Gym by default).
3. Set listing filters (rent/buy/all, beds, baths).
4. Choose commute mode.
5. Start swiping in `/swipe`.
6. App loads first 10 listings and progressively enriches them.
7. After enough swipes, app re-scores unseen cards and fetches 10 more pattern matches.
8. Save liked homes and review them on `/saved`.
9. Inspect AI quality metrics and raw events on `/monitor`.

## Core Features
### Landing (`/`)
- Branded hero + feature highlights
- Quick CTA to onboarding or direct swipe feed

### Onboarding (`/filter`)
- 3-step flow:
  - Step 1: commute places
  - Step 2: listing filters
  - Step 3: commute mode
- Prefilled hackathon defaults:
  - School: `645 W 130th St, New York, NY 10027`
  - Gym: `1250 E 229th St, Bronx, NY 10466`
- Clear-storage button in header:
  - Calls `localStorage.clear()`
  - Resets onboarding state
  - Keeps the prefilled School + Gym defaults

### Swipe Feed (`/swipe`)
- Tinder-style drag + like/dislike buttons
- Card progress badge (`x/total`) in top-right
- Filter chips in-feed:
  - Price type: rent / buy / all
  - Beds: any / 1 / 2 / 3
  - Baths: any / 1 / 2
- Progressive enrichment status bar
- Enrichment complete toast
- Pattern-learning status messages
- Saved homes shortcut
- Monitoring shortcut

### Swipe Card UX
- Full address shown on card
- Price, beds/baths/sqft, commute chips
- Nearby subway line badges (when transit is shown)
- Tradeoff summary
- Expandable “Why this match?” panel
  - Expands card area vertically so feedback controls are visible
  - User feedback buttons:
    - Wrong commute
    - Wrong price fit
    - Wrong explanation
    - Not similar to my likes
- StreetEasy deep link when resolved

### Preference Quiz (AI-generated)
- Triggered after 4+ swipes (if unanswered)
- Claude generates dynamic copy for 3 multiple-choice questions:
  - Commute preference
  - Budget preference
  - Style preference
- Answers are saved and used in score nudges

### Pattern-Based Top-Up
- After preference signals are available, app fetches 10 more listings based on learned pattern
- Pattern summary is shown to the user
- New matches merge into unseen stack and are sorted by score
- Session metadata is persisted so back/forward navigation does not reset progression

### Saved Homes (`/saved`)
- Full-screen map + floating list panel
- Sort saved homes by:
  - Best match
  - Lowest price
  - Shortest commute
- Clicking a saved place chip (School/Work/Gym) zooms map and opens popup
- Clicking a saved listing row zooms map and opens that listing marker popup

## AI + Ranking (How Matching Works)

## 1. Cold Start (before 3 swipes)
- Deterministic score from extracted tags:
  - amenity density
  - subway presence
  - building type
  - noise level

## 2. Personalized Scoring (3+ swipes)
Signals include:
- Liked feature overlap
- Liked/disliked subway line overlap
- Liked/disliked price range distance
- Building type + noise preferences
- Liked/disliked commute distance patterns
- Explicit quiz answers (commute/budget/style nudges)

Output score range is clamped to roughly `55-98`.

## 3. Explanation Generation
- Claude generates concise explanations
- Quality checks run on output:
  - groundedness score
  - hallucination flag
  - constraint compliance
- If quality fails, app falls back to a deterministic safe explanation

## Monitoring (White Circle-Style Workflow)
Monitoring is implemented as an internal provider architecture with a `/monitor` UI.

### Instrumented Stages
- Tag extraction lifecycle + quality
- Explanation generation + quality checks
- Score computation (inputs/components/output)
- End-to-end listing enrichment success/failure
- Swipe actions + explicit user feedback labels

### `/monitor` Dashboard
- Metric cards:
  - tag parse success rate
  - tag schema valid rate
  - null/unknown tag rate avg
  - subway line match rate avg
  - explanation groundedness avg
  - hallucination rate
  - constraint compliance rate
- Recent events table
- Refresh + clear queue controls
- Back button returns to previous route (fallback to `/swipe`)

### Monitoring Provider Behavior
- In dev (default): local queue provider only (no noisy `/api/monitor` 404s)
- In prod or when `VITE_MONITOR_ENDPOINT` is set: HTTP provider with local fallback queue

## Data Pipeline + Caching
### Listing Pipeline
1. **Raw fetch** (`fetchRawListings`)
   - Fast RentCast pull
   - Multi-borough support for NYC
2. **Initial enrichment batch**
   - First 5 listings enriched before unlocking feed
3. **Background enrichment**
   - Remaining listings enriched in place while user swipes

### Borough Coverage
When city filter is NYC (`New York`, `NYC`, `all boroughs`, etc.), listings are fetched across:
- Manhattan (New York)
- Brooklyn
- Queens
- Bronx
- Staten Island

### Caching
- In-memory caches for fast repeats
- `localStorage` caches for persistence across reloads
- Session cache keys avoid restart when navigating away and back

## APIs + Integrations
### RentCast
- `GET /v1/listings/rental/long-term`
- `GET /v1/listings/sale`
- Source of listing inventory

### Mapbox
- Geocoding for user places
- Directions for drive/bike/walk
- Static map-style preview images
- Saved homes map rendering

### HERE Transit
- `GET /v8/routes`
- Real transit times for subway/bus/rail

### SerpApi
- `engine=google_ai_mode` for amenities/features
- `engine=google_ai_mode` for nearby subway hints
- `engine=google` for canonical StreetEasy URLs

### Anthropic Claude
- Model: `claude-sonnet-4-20250514`
- Used for:
  - listing tag extraction (strict schema)
  - concise match explanation generation
  - adaptive quiz wording generation
- Implementation currently lives in `src/services/groq.ts` (legacy filename)

## Local Storage Model
### Product State
- `savedPlaces`
- `listingFilters`
- `commuteMode`
- `savedListings`
- `swipeHistory`
- `preferenceQuizAnswers`

### Session / Feed State
- `swipeSession_v1_<priceType>_<beds>_<baths>` (listings + enrichment cache)
- `swipeSession_v1_<priceType>_<beds>_<baths>_meta` (current index + pattern batch count)

### Enrichment / Geo Caches
- `tags_<listingId>`
- `features_<address>`
- `subway_<address>`
- `geo_<address>`
- `se_url_<address>`

### Monitoring
- `monitoringEventQueue_v1`

## Setup
### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- npm

### Install
```bash
npm install
```

### Run Dev Server
```bash
npm run dev
```
Default URL: `http://localhost:8080`

### Build
```bash
npm run build
```

## Environment Variables
Create `.env` in project root:

```bash
VITE_RENTCAST_API_KEY=your_rentcast_key
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_HERE_API_KEY=your_here_key
VITE_SERPAPI_KEY=your_serpapi_key
VITE_ANTHROPIC_API_KEY=your_anthropic_key
# Optional: only needed if you have a real monitor ingest backend
VITE_MONITOR_ENDPOINT=https://your-monitor-endpoint/api/monitor
```

## Dev Proxies
Configured in `vite.config.ts`:
- `/api/serpapi` -> `https://serpapi.com`
- `/api/here-transit` -> `https://transit.router.hereapi.com`

## Scripts
- `npm run dev` -> start dev server
- `npm run build` -> production build
- `npm run build:dev` -> dev-mode build
- `npm run preview` -> preview production build
- `npm run lint` -> run ESLint
- `npm run test` -> run Vitest once
- `npm run test:watch` -> run Vitest in watch mode

## Project Structure
```text
src/
  components/
    SavedPlaceForm.tsx
    SwipeCard.tsx
    MatchExplanation.tsx
    ModeToggle.tsx
    CommuteChip.tsx
    TradeoffBanner.tsx
    ui/*
  hooks/
    useListings.ts
  pages/
    Landing.tsx
    Onboarding.tsx
    SwipeFeed.tsx
    SavedHomes.tsx
    Monitor.tsx
    NotFound.tsx
  services/
    rentcast.ts
    commute.ts
    groq.ts         # Claude-backed AI logic (legacy file name)
    monitoring.ts
  data/
    listingTypes.ts
```

## Troubleshooting + Limitations
- SerpApi can return `429` when rate-limited:
  - Feature/subway/StreetEasy enrichment may be missing temporarily.
- If `VITE_MAPBOX_TOKEN` is missing:
  - map previews/geocoding/directions degrade.
- If `VITE_HERE_API_KEY` is missing:
  - transit commute times cannot be calculated.
- If no monitor endpoint is configured:
  - events stay in local queue and are still visible in `/monitor`.
- API keys are used in browser context in this project shape.

## Security Notes
This is currently a frontend-only architecture optimized for rapid hackathon iteration.
For production hardening:
- move third-party API calls behind your backend
- keep provider keys server-side
- add auth/rate limits/abuse protection for monitor ingest
- add stricter validation and observability pipelines
