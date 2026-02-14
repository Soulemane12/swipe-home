import type { Listing } from "@/data/listingTypes";
import {
  extractListingTags,
  computeMatchScore,
  generateMatchExplanation,
  fetchListingFeatures,
  getDislikedPriceRange,
  getLikedPriceRange,
} from "./groq";
import { calculateCommuteTimes, buildTradeoff } from "./commute";
import { monitorEvent } from "./monitoring";

const API_BASE = "https://api.rentcast.io/v1";
const API_KEY = import.meta.env.VITE_RENTCAST_API_KEY;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const NYC_BOROUGH_CITIES = ["New York", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;

export interface ListingFilters {
  priceType: "rent" | "buy" | "both";
  city?: string;
  state?: string;
  bedrooms?: number;
  bathrooms?: number;
  limit?: number;
  offset?: number;
}

interface RentCastListing {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  latitude: number;
  longitude: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  status: string;
  price: number;
  listedDate: string;
  daysOnMarket: number;
}

function getListingImage(item: RentCastListing): string {
  if (!MAPBOX_TOKEN || !item.latitude || !item.longitude) return "";
  const lng = item.longitude;
  const lat = item.latitude;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+2563eb(${lng},${lat})/${lng},${lat},14,0/800x600?access_token=${MAPBOX_TOKEN}`;
}

function computeInitialListingScore(
  item: RentCastListing,
  priceType: "rent" | "buy"
): number {
  let score = 60;

  const beds = item.bedrooms || 0;
  const baths = item.bathrooms || 0;
  const sqft = item.squareFootage || 0;
  const days = item.daysOnMarket || 0;
  const price = item.price || 0;

  if (beds >= 3) score += 6;
  else if (beds === 2) score += 4;
  else if (beds === 1) score += 2;

  if (baths >= 2) score += 4;
  else if (baths >= 1) score += 2;

  if (sqft > 0) {
    score += Math.min(10, Math.round(sqft / 180));
  }

  if (days > 0 && days <= 14) score += 4;
  else if (days <= 45) score += 2;
  else if (days > 120) score -= 2;

  if (price > 0) {
    if (priceType === "rent") {
      if (price <= 3000) score += 8;
      else if (price <= 4500) score += 5;
      else if (price <= 6500) score += 2;
      else score -= 2;
    } else {
      if (price <= 800000) score += 8;
      else if (price <= 1300000) score += 5;
      else if (price <= 2000000) score += 2;
      else score -= 2;
    }
  }

  return Math.min(88, Math.max(55, Math.round(score)));
}

const SERPAPI_KEY = import.meta.env.VITE_SERPAPI_KEY;

// Look up real StreetEasy URL via Google search (cached)
async function lookupStreetEasyUrl(address: string): Promise<string | undefined> {
  const cacheKey = `se_url_${address}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  if (!SERPAPI_KEY) return undefined;

  try {
    const query = encodeURIComponent(`site:streeteasy.com ${address}`);
    const baseUrl = import.meta.env.DEV ? "/api/serpapi" : "https://serpapi.com";
    const url = `${baseUrl}/search.json?engine=google&q=${query}&api_key=${SERPAPI_KEY}&num=3`;

    console.log(`[StreetEasy] Looking up URL for ${address}...`);
    const res = await fetch(url);
    if (!res.ok) return undefined;

    const data = await res.json();
    const results = data.organic_results || [];

    // Find the first streeteasy.com/building/ URL
    for (const r of results) {
      const link: string = r.link || "";
      if (link.includes("streeteasy.com/building/")) {
        console.log(`[StreetEasy] Found: ${link}`);
        localStorage.setItem(cacheKey, link);
        return link;
      }
    }
  } catch (err) {
    console.error(`[StreetEasy] Lookup failed for ${address}:`, err);
  }

  return undefined;
}

function transformToListing(
  item: RentCastListing,
  priceType: "rent" | "buy"
): Listing {
  const initialScore = computeInitialListingScore(item, priceType);

  return {
    id: item.id,
    image: getListingImage(item),
    price: item.price,
    priceType,
    beds: item.bedrooms || 0,
    baths: item.bathrooms || 0,
    sqft: item.squareFootage || 0,
    neighborhood: item.zipCode ? `${item.city} ${item.zipCode}` : item.city,
    address: item.formattedAddress,
    latitude: item.latitude,
    longitude: item.longitude,
    streetEasyUrl: undefined, // looked up during enrichment via Google search
    commuteTimes: [], // filled during enrichment with real data
    tradeoff: "",
    matchExplanation: `${item.propertyType || "Property"} in ${item.city} · ${item.bedrooms || 0}bd/${item.bathrooms || 0}ba · Initial ranking from listing details`,
    matchScore: initialScore,
  };
}

async function fetchFromAPI(endpoint: string, params: Record<string, string>): Promise<RentCastListing[]> {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Api-Key": API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

function resolveCityQueries(city: string, state: string): string[] {
  const normalizedCity = city.trim().toLowerCase();
  const normalizedState = state.trim().toUpperCase();

  const isNycWideQuery =
    normalizedState === "NY" &&
    ["new york", "new york city", "nyc", "all boroughs", "all"].includes(normalizedCity);

  if (isNycWideQuery) {
    return [...NYC_BOROUGH_CITIES];
  }

  return [city];
}

async function fetchAcrossCities(
  endpoint: string,
  baseParams: Record<string, string>,
  cities: string[],
  totalLimit: number
): Promise<RentCastListing[]> {
  if (cities.length === 1) {
    return fetchFromAPI(endpoint, { ...baseParams, city: cities[0], limit: String(totalLimit) });
  }

  const perCityLimit = Math.max(1, Math.ceil(totalLimit / cities.length));
  const cityBatches = await Promise.all(
    cities.map(async (cityName) => {
      try {
        const records = await fetchFromAPI(endpoint, {
          ...baseParams,
          city: cityName,
          limit: String(perCityLimit),
        });
        console.log(`[RentCast] ${endpoint} ${cityName}: ${records.length} listings`);
        return records;
      } catch (err) {
        console.warn(`[RentCast] ${endpoint} failed for ${cityName}:`, err);
        return [] as RentCastListing[];
      }
    })
  );

  // Interleave borough batches so the top cards are geographically mixed.
  const interleaved: RentCastListing[] = [];
  const maxBatchLen = cityBatches.reduce((max, batch) => Math.max(max, batch.length), 0);
  for (let i = 0; i < maxBatchLen && interleaved.length < totalLimit; i++) {
    for (const batch of cityBatches) {
      const item = batch[i];
      if (!item) continue;
      interleaved.push(item);
      if (interleaved.length >= totalLimit) break;
    }
  }

  const deduped: RentCastListing[] = [];
  const seen = new Set<string>();
  for (const item of interleaved) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
    if (deduped.length >= totalLimit) break;
  }

  if (deduped.length < totalLimit) {
    for (const batch of cityBatches) {
      for (const item of batch) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.push(item);
        if (deduped.length >= totalLimit) break;
      }
      if (deduped.length >= totalLimit) break;
    }
  }

  return deduped;
}

function rankPatternCandidate(listing: Listing): number {
  const likedPriceRange = getLikedPriceRange(listing.priceType);
  const dislikedPriceRange = getDislikedPriceRange(listing.priceType);
  let score = listing.matchScore;

  if (listing.price <= 0) {
    return score;
  }

  const rangeDistanceRatio = (value: number, min: number, max: number, scale: number) => {
    if (value < min) return (min - value) / Math.max(1, scale);
    if (value > max) return (value - max) / Math.max(1, scale);
    return 0;
  };

  if (likedPriceRange) {
    const likedMin = likedPriceRange.min * 0.95;
    const likedMax = likedPriceRange.max * 1.05;
    const outsideRatio = rangeDistanceRatio(listing.price, likedMin, likedMax, likedPriceRange.avg);

    if (outsideRatio === 0) score += 12;
    else if (outsideRatio <= 0.15) score += 8;
    else if (outsideRatio <= 0.35) score += 3;
    else score -= 6;
  }

  if (dislikedPriceRange) {
    const dislikedMin = dislikedPriceRange.min * 0.95;
    const dislikedMax = dislikedPriceRange.max * 1.05;
    const outsideRatio = rangeDistanceRatio(listing.price, dislikedMin, dislikedMax, dislikedPriceRange.avg);

    if (outsideRatio === 0) score -= 10;
    else if (outsideRatio <= 0.12) score -= 6;
    else if (outsideRatio <= 0.3) score -= 3;
  }

  return score;
}

// Fetch raw listings from RentCast (fast, no AI)
export async function fetchRawListings(filters: ListingFilters): Promise<Listing[]> {
  const { priceType, city = "New York", state = "NY", bedrooms, bathrooms, limit = 20, offset = 0 } = filters;
  const cityQueries = resolveCityQueries(city, state);

  const params: Record<string, string> = {
    state,
    status: "Active",
    offset: String(offset),
  };
  if (bedrooms) params.bedrooms = String(bedrooms);
  if (bathrooms) params.bathrooms = String(bathrooms);

  const results: Listing[] = [];

  if (priceType === "rent" || priceType === "both") {
    console.log(`[RentCast] Fetching rentals in ${cityQueries.join(", ")} (${state})...`);
    const rentals = await fetchAcrossCities("/listings/rental/long-term", params, cityQueries, limit);
    console.log(`[RentCast] Got ${rentals.length} rental listings`);
    results.push(...rentals.map((item) => transformToListing(item, "rent")));
  }

  if (priceType === "buy" || priceType === "both") {
    console.log(`[RentCast] Fetching sales in ${cityQueries.join(", ")} (${state})...`);
    const sales = await fetchAcrossCities("/listings/sale", params, cityQueries, limit);
    console.log(`[RentCast] Got ${sales.length} sale listings`);
    results.push(...sales.map((item) => transformToListing(item, "buy")));
  }

  return results;
}

// Fetch 10 new listings that best match learned swipe patterns
export async function fetchPatternMatchedListings(
  filters: ListingFilters,
  excludeIds: string[] = [],
  targetCount = 10
): Promise<Listing[]> {
  const { priceType, city = "New York", state = "NY", bedrooms, bathrooms, offset = 0 } = filters;
  const cityQueries = resolveCityQueries(city, state);
  const candidatePoolLimit = Math.max(targetCount * 6, 60);

  const params: Record<string, string> = {
    state,
    status: "Active",
    offset: String(offset),
  };
  if (bedrooms) params.bedrooms = String(bedrooms);
  if (bathrooms) params.bathrooms = String(bathrooms);

  const rawCandidates: { item: RentCastListing; priceType: "rent" | "buy" }[] = [];

  if (priceType === "rent" || priceType === "both") {
    const rentals = await fetchAcrossCities(
      "/listings/rental/long-term",
      params,
      cityQueries,
      candidatePoolLimit
    );
    rawCandidates.push(...rentals.map((item) => ({ item, priceType: "rent" as const })));
  }

  if (priceType === "buy" || priceType === "both") {
    const sales = await fetchAcrossCities(
      "/listings/sale",
      params,
      cityQueries,
      candidatePoolLimit
    );
    rawCandidates.push(...sales.map((item) => ({ item, priceType: "buy" as const })));
  }

  const excludeSet = new Set(excludeIds);
  const deduped = new Map<string, { item: RentCastListing; priceType: "rent" | "buy" }>();
  for (const candidate of rawCandidates) {
    if (excludeSet.has(candidate.item.id)) continue;
    if (deduped.has(candidate.item.id)) continue;
    deduped.set(candidate.item.id, candidate);
  }

  const transformed = Array.from(deduped.values()).map((candidate, i) =>
    transformToListing(candidate.item, candidate.priceType)
  );

  const rankedSeed = transformed
    .sort((a, b) => rankPatternCandidate(b) - rankPatternCandidate(a))
    // Keep a wider seed so commute-aware scoring during enrichment can promote better-distance options.
    .slice(0, Math.max(targetCount * 4, 40));

  if (rankedSeed.length === 0) return [];

  console.log(`[Pattern] Candidate pool=${transformed.length}, seed=${rankedSeed.length}, target=${targetCount}`);

  const enriched: Listing[] = [];
  for (const listing of rankedSeed) {
    const enrichedListing = await enrichListing(listing);
    enriched.push(enrichedListing);
  }

  return enriched
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, targetCount);
}

// Enrich a single listing with AI tags, score, explanation, and real commute times
export async function enrichListing(listing: Listing): Promise<Listing> {
  const enrichmentStart = Date.now();
  void monitorEvent("ai_monitoring", {
    stage: "enrichment_start",
    listingId: listing.id,
    address: listing.address,
    input: {
      price: listing.price,
      priceType: listing.priceType,
      beds: listing.beds,
      baths: listing.baths,
      hasCoordinates: Boolean(listing.latitude && listing.longitude),
    },
  });

  try {
    // Calculate real commute times using Mapbox
    let commuteTimes = listing.commuteTimes;
    let tradeoff = listing.tradeoff;
    if (listing.latitude && listing.longitude) {
      const realCommutes = await calculateCommuteTimes(listing.latitude, listing.longitude);
      if (realCommutes.length > 0) {
        commuteTimes = realCommutes;
        tradeoff = buildTradeoff(realCommutes, listing.price, listing.priceType);
      }
    }

    const enrichedListing = { ...listing, commuteTimes, tradeoff };

    const tags = await extractListingTags(enrichedListing);
    const matchScore = computeMatchScore(tags, listing.price, listing.priceType, commuteTimes, {
      listingId: listing.id,
      address: listing.address,
      reason: "initial_enrichment",
    });
    const matchExplanation = await generateMatchExplanation(enrichedListing, tags);
    const featureDescription = await fetchListingFeatures(listing.address) || undefined;
    const streetEasyUrl = await lookupStreetEasyUrl(listing.address);
    const nearSubwayLines = tags.near_subway_lines.length > 0 ? tags.near_subway_lines : undefined;
    void monitorEvent("ai_monitoring", {
      stage: "enrichment_success",
      listingId: listing.id,
      address: listing.address,
      durationMs: Date.now() - enrichmentStart,
      output: {
        matchScore,
        commuteCount: commuteTimes.length,
        nearSubwayLinesCount: nearSubwayLines?.length || 0,
        hasStreetEasyUrl: Boolean(streetEasyUrl),
        hasFeatureDescription: Boolean(featureDescription),
      },
    });
    console.log(`[AI] Enriched: ${listing.address} → score=${matchScore}, commutes=[${commuteTimes.map(c => `${c.label}:${c.minutes}min`).join(", ")}]${nearSubwayLines ? `, subway=[${nearSubwayLines.join(",")}]` : ""}`);
    return { ...enrichedListing, matchScore, matchExplanation, featureDescription, streetEasyUrl, nearSubwayLines };
  } catch (err) {
    console.error(`[AI] Failed to enrich ${listing.address}:`, err);
    void monitorEvent("ai_monitoring", {
      stage: "enrichment_error",
      listingId: listing.id,
      address: listing.address,
      durationMs: Date.now() - enrichmentStart,
      error: err instanceof Error ? err.message : String(err),
    });
    return listing;
  }
}
