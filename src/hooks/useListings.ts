import { useState, useEffect, useRef } from "react";
import { fetchRawListings, enrichListing, type ListingFilters } from "@/services/rentcast";
import type { Listing } from "@/data/listingTypes";

export interface EnrichmentStatus {
  enriched: number;
  total: number;
  currentAddress: string;
  done: boolean;
}

interface UseListingsOptions {
  cacheKey?: string;
}

interface ListingsCachePayload {
  listings: Listing[];
  enrichmentStatus: EnrichmentStatus;
  updatedAt: number;
}

function isValidListing(value: unknown): value is Listing {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const priceType = entry.priceType;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.address === "string" &&
    entry.address.length > 0 &&
    typeof entry.price === "number" &&
    Number.isFinite(entry.price) &&
    (priceType === "rent" || priceType === "buy") &&
    typeof entry.matchScore === "number" &&
    Number.isFinite(entry.matchScore)
  );
}

export function useListings(filters: ListingFilters, options?: UseListingsOptions) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatus>({
    enriched: 0,
    total: 0,
    currentAddress: "",
    done: false,
  });
  const abortRef = useRef(false);
  const filtersKey = JSON.stringify(filters);
  const cacheKey = options?.cacheKey;

  useEffect(() => {
    if (!cacheKey || listings.length === 0) return;
    try {
      const payload: ListingsCachePayload = {
        listings,
        enrichmentStatus,
        updatedAt: Date.now(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch {
      // Ignore cache write failures.
    }
  }, [cacheKey, listings, enrichmentStatus]);

  useEffect(() => {
    abortRef.current = false;
    setError(null);

    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      abortRef.current = true;
    };

    if (cacheKey) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as ListingsCachePayload;
          const cachedListings = Array.isArray(parsed.listings)
            ? parsed.listings.filter(isValidListing)
            : [];
          if (cachedListings.length > 0) {
            setListings(cachedListings);
            setEnrichmentStatus(parsed.enrichmentStatus ?? {
              enriched: cachedListings.length,
              total: cachedListings.length,
              currentAddress: "",
              done: true,
            });
            setIsLoading(false);
            console.log(`[Pipeline] Restored ${cachedListings.length} listings from cache (${cacheKey})`);
            return cleanup;
          }
          localStorage.removeItem(cacheKey);
        }
      } catch {
        // Ignore invalid cache.
      }
    }

    setListings([]);
    setIsLoading(true);
    setEnrichmentStatus({ enriched: 0, total: 0, currentAddress: "", done: false });

    async function run() {
      try {
        // Phase 1: Fetch raw listings (fast)
        console.log("[Pipeline] Phase 1: Fetching raw listings...");
        const raw = await fetchRawListings(filters);
        if (cancelled) return;

        console.log(`[Pipeline] Got ${raw.length} raw listings, starting enrichment...`);
        setEnrichmentStatus({ enriched: 0, total: raw.length, currentAddress: "", done: false });

        // Phase 2: Enrich first 5, then show them
        const INITIAL_BATCH = 5;
        const enriched: Listing[] = [];

        for (let i = 0; i < Math.min(INITIAL_BATCH, raw.length); i++) {
          if (cancelled) return;
          const listing = raw[i];
          setEnrichmentStatus((s) => ({ ...s, currentAddress: listing.address, enriched: i }));
          console.log(`[Pipeline] Enriching initial ${i + 1}/${INITIAL_BATCH}: ${listing.address}`);
          const result = await enrichListing(listing);
          enriched.push(result);
        }

        if (cancelled) return;

        // Show first batch + remaining raw listings so user can start swiping
        const remaining = raw.slice(INITIAL_BATCH);
        setListings([...enriched, ...remaining]);
        setIsLoading(false);
        setEnrichmentStatus({
          enriched: enriched.length,
          total: raw.length,
          currentAddress: "",
          done: remaining.length === 0,
        });

        console.log(`[Pipeline] Phase 2: Showing ${enriched.length} enriched + ${remaining.length} raw. User can swipe now!`);

        // Phase 3: Enrich remaining in background, updating as each completes
        for (let i = 0; i < remaining.length; i++) {
          if (cancelled) return;
          const listing = remaining[i];
          const globalIdx = INITIAL_BATCH + i;
          setEnrichmentStatus((s) => ({
            ...s,
            currentAddress: listing.address,
            enriched: INITIAL_BATCH + i,
          }));
          console.log(`[Pipeline] Background enriching ${globalIdx + 1}/${raw.length}: ${listing.address}`);
          const result = await enrichListing(listing);
          if (cancelled) return;

          // Replace the raw listing in-place
          setListings((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((l) => l.id === listing.id);
            if (idx !== -1) updated[idx] = result;
            return updated;
          });
        }

        if (!cancelled) {
          setEnrichmentStatus({
            enriched: raw.length,
            total: raw.length,
            currentAddress: "",
            done: true,
          });
          console.log(`[Pipeline] Done! All ${raw.length} listings enriched.`);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[Pipeline] Error:", err);
          setError(err instanceof Error ? err : new Error("Failed to load listings"));
          setIsLoading(false);
        }
      }
    }

    run();
    return cleanup;
  }, [filtersKey, cacheKey]);

  return { listings, setListings, isLoading, error, enrichmentStatus };
}
