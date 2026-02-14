import type { CommuteMode, CommuteTimes } from "@/data/listingTypes";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY;

// Mapbox profiles for non-transit modes
type MapboxProfile = "driving" | "cycling" | "walking";

function modeToProfile(mode: CommuteMode): MapboxProfile {
  switch (mode) {
    case "drive": return "driving";
    case "bike": return "cycling";
    case "walk": return "walking";
    default: return "driving";
  }
}

interface GeocodedPlace {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
}

// In-memory cache
const commuteCache = new Map<string, number>();

// --- Mapbox Directions (driving, cycling, walking) ---
async function getMapboxDuration(
  fromLng: number, fromLat: number,
  toLng: number, toLat: number,
  profile: MapboxProfile
): Promise<number | null> {
  const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}→${toLat.toFixed(4)},${toLng.toFixed(4)}:${profile}`;
  if (commuteCache.has(cacheKey)) return commuteCache.get(cacheKey)!;

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLng},${fromLat};${toLng},${toLat}?access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Commute] Mapbox ${response.status} for ${profile}`);
      return null;
    }
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const minutes = Math.round(route.duration / 60);
    commuteCache.set(cacheKey, minutes);
    return minutes;
  } catch (err) {
    console.error("[Commute] Mapbox Directions failed:", err);
    return null;
  }
}

// --- HERE Maps Transit Routing (real subway/bus/rail times) ---
async function getTransitDuration(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): Promise<number | null> {
  const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}→${toLat.toFixed(4)},${toLng.toFixed(4)}:transit`;
  if (commuteCache.has(cacheKey)) return commuteCache.get(cacheKey)!;

  if (!HERE_API_KEY) {
    console.warn("[Commute] No HERE API key, cannot calculate transit times");
    return null;
  }

  try {
    // Use Vite proxy in dev to avoid CORS
    const baseUrl = import.meta.env.DEV ? "/api/here-transit" : "https://transit.router.hereapi.com";
    const url = `${baseUrl}/v8/routes?apiKey=${HERE_API_KEY}&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}`;

    console.log(`[Commute] HERE transit: ${fromLat.toFixed(4)},${fromLng.toFixed(4)} → ${toLat.toFixed(4)},${toLng.toFixed(4)}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Commute] HERE ${response.status}`);
      return null;
    }

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route || !route.sections || route.sections.length === 0) return null;

    // Calculate total duration from first departure to last arrival
    const firstDep = new Date(route.sections[0].departure.time);
    const lastArr = new Date(route.sections[route.sections.length - 1].arrival.time);
    const minutes = Math.round((lastArr.getTime() - firstDep.getTime()) / 60000);

    // Log the transit route details
    const segments = route.sections.map((s: any) => {
      const transport = s.transport || {};
      const name = transport.shortName || transport.name || s.type;
      return `${s.type === "transit" ? name : "walk"}`;
    });
    console.log(`[Commute] HERE transit result: ${minutes}min via [${segments.join(" → ")}]`);

    commuteCache.set(cacheKey, minutes);
    return minutes;
  } catch (err) {
    console.error("[Commute] HERE transit failed:", err);
    return null;
  }
}

// --- Geocoding (Mapbox) ---
const geocodeCache = new Map<string, [number, number]>();

async function geocode(address: string): Promise<[number, number] | null> {
  if (geocodeCache.has(address)) return geocodeCache.get(address)!;

  const cacheKey = `geo_${address}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const coords = JSON.parse(cached) as [number, number];
      geocodeCache.set(address, coords);
      return coords;
    } catch { /* ignore */ }
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.features?.[0]?.center) {
      const coords = data.features[0].center as [number, number];
      geocodeCache.set(address, coords);
      localStorage.setItem(cacheKey, JSON.stringify(coords));
      return coords;
    }
  } catch { /* ignore */ }
  return null;
}

// --- Saved Places ---
let geocodedPlacesCache: GeocodedPlace[] | null = null;

async function getGeocodedPlaces(): Promise<GeocodedPlace[]> {
  if (geocodedPlacesCache) return geocodedPlacesCache;

  const placesStr = localStorage.getItem("savedPlaces");
  if (!placesStr) return [];

  try {
    const places: { id: string; label: string; address: string }[] = JSON.parse(placesStr);
    const results: GeocodedPlace[] = [];

    for (const p of places) {
      if (!p.address.trim()) continue;
      const coords = await geocode(p.address);
      if (coords) {
        results.push({ id: p.id, label: p.label, longitude: coords[0], latitude: coords[1] });
      }
    }

    geocodedPlacesCache = results;
    console.log(`[Commute] Geocoded ${results.length} saved places`);
    return results;
  } catch {
    return [];
  }
}

// Get the user's preferred commute mode from localStorage
function getPreferredMode(): CommuteMode {
  const saved = localStorage.getItem("commuteMode");
  if (saved && ["transit", "drive", "walk", "bike"].includes(saved)) {
    return saved as CommuteMode;
  }
  return "transit";
}

// --- Main: Calculate commute times from a listing to all saved places ---
export async function calculateCommuteTimes(
  listingLat: number,
  listingLng: number,
  mode?: CommuteMode
): Promise<CommuteTimes[]> {
  const places = await getGeocodedPlaces();
  if (places.length === 0) return [];

  const commuteMode = mode || getPreferredMode();
  const results: CommuteTimes[] = [];

  for (const place of places) {
    let minutes: number | null = null;

    if (commuteMode === "transit") {
      // Use HERE Maps for real transit routing
      minutes = await getTransitDuration(
        listingLat, listingLng,
        place.latitude, place.longitude
      );
    } else {
      // Use Mapbox for driving, cycling, walking
      const profile = modeToProfile(commuteMode);
      minutes = await getMapboxDuration(
        listingLng, listingLat,
        place.longitude, place.latitude,
        profile
      );
    }

    if (minutes !== null) {
      results.push({
        placeId: place.id,
        label: place.label,
        minutes,
      });
      console.log(`[Commute] ${place.label}: ${minutes}min (${commuteMode}) from listing`);
    }
  }

  return results;
}

// Build tradeoff string from real commute data and price
export function buildTradeoff(
  commuteTimes: CommuteTimes[],
  price: number,
  priceType: "rent" | "buy"
): string {
  if (commuteTimes.length === 0) return "";
  const avgCommute = Math.round(
    commuteTimes.reduce((s, c) => s + c.minutes, 0) / commuteTimes.length
  );
  if (avgCommute < 20) {
    return `Short ${avgCommute}min avg commute`;
  }
  return `${avgCommute}min avg commute, $${price.toLocaleString()}${priceType === "rent" ? "/mo" : ""}`;
}

// Reset geocoded places cache (e.g., when places change)
export function resetPlacesCache() {
  geocodedPlacesCache = null;
}
