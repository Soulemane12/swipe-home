# HomeSwipe

AI-assisted swipe app for NYC housing.  
It pulls real listings, computes commute times, enriches each listing with features/tags, ranks by learned preferences, and lets users save favorites on a map/list view.

## Table Of Contents
1. Overview
2. Feature Set
3. Product Flow
4. Technical Architecture
5. External APIs
6. Data Model
7. Local Storage Model
8. Preference Learning And Ranking
9. Progressive Loading Pipeline
10. Setup And Run
11. Environment Variables
12. Dev Server Proxies
13. Scripts
14. Project Structure
15. Error Handling And Fallbacks
16. Current Limitations
17. Security Notes
18. Testing And Quality
19. Troubleshooting

## Overview
HomeSwipe is a frontend-only React + Vite app with client-side integrations to:
- RentCast for listings
- Mapbox for geocoding + non-transit directions
- HERE Transit for public transit routing
- SerpApi for listing features, subway line hints, and StreetEasy URL lookup
- Groq for structured feature extraction and match explanation generation

The app is optimized for:
- Fast first content (show first enriched cards quickly)
- Background enrichment for remaining listings
- Continuous personalization after user swipes
- Persistent state with `localStorage` so browser data clearing resets the app

## Feature Set
### 3-step onboarding
- Add commute destinations (`Work`, `School`, `Gym`)
- Pick initial listing filters (`Rent/Buy/Both`, `Beds`, `Baths`)
- Pick commute mode (`Transit`, `Drive`, `Bike`, `Walk`)

### Swipe feed
- Tinder-style swipe interaction with drag gestures and buttons
- Live match percentage per card
- Full listing address on card
- Commute chips per saved place
- Subway line badges on cards
- Tradeoff summary + AI match explanation
- StreetEasy deep link when found

### Progressive data pipeline
- Fast raw listing fetch
- Enrich first 5 listings before UI unlock
- Continue enrichment in background with status/progress bar

### Preference learning
- Records likes/dislikes with extracted tags + price context
- Activates personalized re-scoring after 3 total swipes
- Re-ranks unseen cards by learned score
- Shows learned preference insight banner

### Saved homes
- Save liked listings
- Sort by match, price, or commute
- Map mode with listing markers + saved-place markers
- List mode with compact cards

## Product Flow
1. User opens `/` (Onboarding).
2. User adds at least one destination and continues.
3. User selects listing filters and continues.
4. User selects commute mode and starts swiping.
5. `/swipe` loads listings with progressive enrichment.
6. Swipes are recorded into preference history.
7. After enough swipe history, unseen cards are re-ranked.
8. Liked homes are stored in `savedListings`.
9. `/saved` shows saved homes as map or list with sorting options.

## Technical Architecture
- Frontend: React 18 + TypeScript + Vite
- Styling/UI: Tailwind CSS + shadcn/ui + Radix UI + framer-motion
- Routing: `react-router-dom`
- State: local component state for UI and flow control
- Persistence/cache: `localStorage`
- Service layer: `src/services/*` for API orchestration

### Runtime Architecture
- Browser-only app (no custom backend)
- API calls are made from client
- Vite dev server proxies are used in development to avoid CORS for some providers

## External APIs
### 1. RentCast
- Rental endpoint: `/v1/listings/rental/long-term`
- Sale endpoint: `/v1/listings/sale`
- Used by: `src/services/rentcast.ts`
- Output: raw listing inventory (price, beds, baths, coordinates, address, etc.)

### 2. Mapbox
- Geocoding API for user places and saved homes map
- Directions API for `drive`, `bike`, `walk` commute duration
- Used by: `src/services/commute.ts`, `src/pages/SavedHomes.tsx`

### 3. HERE Transit
- Transit routing (`/v8/routes`) for subway/bus/rail travel times
- Used when preferred mode is `transit`
- Used by: `src/services/commute.ts`

### 4. SerpApi
- `engine=google_ai_mode` for listing amenities/features text
- `engine=google_ai_mode` for nearby subway line hints
- `engine=google` for canonical StreetEasy building URL lookup
- Used by: `src/services/groq.ts`, `src/services/rentcast.ts`

### 5. Groq
- Model: `llama-3.1-8b-instant`
- Uses: extract normalized listing tags as strict JSON
- Uses: generate concise match explanation sentence
- Used by: `src/services/groq.ts`

## Data Model
Main listing shape (`src/data/mockData.ts`):
- `id`
- `image`
- `price`
- `priceType` (`rent` | `buy`)
- `beds`, `baths`, `sqft`
- `neighborhood`, `address`
- `latitude`, `longitude`
- `commuteTimes[]`
- `tradeoff`
- `matchExplanation`
- `matchScore`
- `streetEasyUrl?`
- `featureDescription?`
- `nearSubwayLines?`

Tag schema extracted by AI (`ListingTags` in `src/services/groq.ts`):
- boolean amenities (`natural_light`, `elevator`, `laundry_in_unit`, etc.)
- `near_subway_lines[]`
- `noise_level` (`quiet` | `average` | `unknown`)
- `building_type` (`walkup` | `elevator` | `unknown`)

## Local Storage Model
Persistent app state keys:
- `savedPlaces` -> onboarding destinations
- `listingFilters` -> onboarding filters
- `commuteMode` -> selected commute mode
- `savedListings` -> liked listings
- `swipeHistory` -> liked/disliked entries with tags + price context

Cache keys (performance + rate-limit protection):
- `tags_<listingId>` -> extracted `ListingTags`
- `features_<address>` -> SerpApi feature text
- `subway_<address>` -> subway lines
- `geo_<address>` -> geocoded coordinates
- `se_url_<address>` -> resolved StreetEasy URL

Note: because persistence is `localStorage`, clearing browser site data removes user state and caches.

## Preference Learning And Ranking
Files:
- `src/services/groq.ts`
- `src/pages/SwipeFeed.tsx`

### Swipe recording
- On swipe, listing tags are fetched (usually cache hit)
- `recordSwipe(...)` stores direction, tags, price, and `priceType`

### Activation threshold
- Personalization activates after `>= 3` total swipes (`likes + dislikes`)

### Score computation
`computeMatchScore(...)` combines:
- Feature match ratio: 40%
- Subway overlap ratio: 20%
- Price proximity ratio: 20%
- Building/noise context ratio: 20%

Score output range:
- clamped to roughly `55-98`

Before threshold:
- score is a fallback random value (`70-94`)

### Live re-ranking
After threshold:
- unseen listings are rescored using cached tags
- unseen slice is sorted descending by `matchScore`
- already seen listings stay fixed
- race guard prevents stale async runs from overriding newer re-ranks

## Progressive Loading Pipeline
Implemented in `src/hooks/useListings.ts` and `src/services/rentcast.ts`.

### Phase 1: Raw Fetch
- `fetchRawListings(filters)` calls RentCast only
- returns fast, minimally transformed listings

### Phase 2: Initial Enrichment
- first 5 listings are enriched sequentially
- includes commute, tags, score, explanation, StreetEasy link, feature text
- UI becomes interactive after this batch

### Phase 3: Background Enrichment
- remaining listings are enriched in the background
- each listing is replaced in-place when done
- feed shows enrichment progress + current address

## Setup And Run
### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- npm

### Install
```bash
npm install
```

### Configure env
Create `.env` at project root:
```bash
VITE_RENTCAST_API_KEY=your_rentcast_key
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_GROQ_API_KEY=your_groq_key
VITE_SERPAPI_KEY=your_serpapi_key
VITE_HERE_API_KEY=your_here_key
```

### Start dev server
```bash
npm run dev
```

Default dev URL: `http://localhost:8080`

## Environment Variables
- `VITE_RENTCAST_API_KEY`: RentCast listing access
- `VITE_MAPBOX_TOKEN`: geocoding + map + non-transit directions
- `VITE_GROQ_API_KEY`: AI tag extraction and explanations
- `VITE_SERPAPI_KEY`: feature/subway lookup and StreetEasy URL search
- `VITE_HERE_API_KEY`: real public transit routing

## Dev Server Proxies
Configured in `vite.config.ts`:
- `/api/serpapi` -> `https://serpapi.com`
- `/api/here-transit` -> `https://transit.router.hereapi.com`

Used in development to reduce CORS issues for browser calls.

## Scripts
- `npm run dev` -> start Vite dev server
- `npm run build` -> production build
- `npm run build:dev` -> dev-mode build
- `npm run preview` -> preview built output
- `npm run test` -> run Vitest once
- `npm run test:watch` -> watch mode tests
- `npm run lint` -> run ESLint

## Project Structure
```text
src/
  components/
    SavedPlaceForm.tsx
    SwipeCard.tsx
    ModeToggle.tsx
    CommuteChip.tsx
    TradeoffBanner.tsx
    MatchExplanation.tsx
    ui/* (shadcn primitives)
  hooks/
    useListings.ts
  pages/
    Onboarding.tsx
    SwipeFeed.tsx
    SavedHomes.tsx
    NotFound.tsx
  services/
    rentcast.ts
    commute.ts
    groq.ts
  data/
    mockData.ts
  test/
    example.test.ts
```

## Error Handling And Fallbacks
- API failures in enrichment do not crash the app; listing falls back to raw shape.
- Missing keys generally degrade to reduced capability instead of hard fail.
- Commute failures return no commute chips for that listing/place.
- Tag extraction failures return default neutral tag schema.
- StreetEasy lookup failure simply hides external link.
- Retry UI exists on feed load failure.

## Current Limitations
- Client-side secrets: API keys are exposed to browser runtime because the app is frontend-only.
- Commute mode source: onboarding-selected `commuteMode` drives commute calculation.
- Onboarding mode selection: UI allows multiple selection, but only the first selected mode is stored.
- Swipe-feed mode toggle: currently affects card display state and does not recompute commute mode for listings.
- Lint baseline: repo currently has existing lint errors/warnings outside core flow.
- Search/index quality: StreetEasy URL relies on search results and may occasionally miss or pick suboptimal matches.

## Security Notes
- Never commit real API keys to public repos.
- Rotate keys if they were previously committed.
- For production: move third-party API calls behind a backend
- For production: enforce per-user auth and request quotas
- For production: add server-side cache/rate limiting

## Testing And Quality
Current checks:
- Build: `npm run build` passes
- Tests: `npm run test` passes (minimal baseline test suite)
- Lint: `npm run lint` reports pre-existing issues in several files

Recommendation:
- add service-level unit tests for ranking and cache behavior
- add integration tests for onboarding -> swipe -> save flow
- expand lint cleanup to enforce stricter TS safety

## Troubleshooting
### No listings appear
- Confirm `VITE_RENTCAST_API_KEY` is valid
- Check browser console for API status errors
- Verify city/state filters are valid

### Commute times missing
- Ensure `savedPlaces` contains valid addresses
- Confirm required key for selected mode: transit -> HERE
- Confirm required key for selected mode: drive/bike/walk -> Mapbox

### StreetEasy link missing
- Expected if no good result is found
- Check `VITE_SERPAPI_KEY` and network responses

### Personalization not changing ranking
- It starts after 3 total swipes
- Re-ranking uses cached tags for unseen cards
- If unseen cards have not been tagged yet, ranking impact will be limited until enrichment catches up

---

If you want, the next step can be adding:
1. A real backend proxy for secure API key handling
2. A `.env.example` file generated from the current env contract
3. Automated end-to-end tests for the full swipe pipeline
