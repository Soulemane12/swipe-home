const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MODEL = "llama-3.1-8b-instant";

export interface ListingTags {
  natural_light: boolean;
  elevator: boolean;
  laundry_in_building: boolean;
  laundry_in_unit: boolean;
  doorman: boolean;
  pet_friendly: boolean;
  dishwasher: boolean;
  renovated: boolean;
  near_subway_lines: string[];
  noise_level: "quiet" | "average" | "unknown";
  building_type: "walkup" | "elevator" | "unknown";
}

// In-memory caches
const tagsCache = new Map<string, ListingTags>();
const featureDescCache = new Map<string, string>();

const SERPAPI_KEY = import.meta.env.VITE_SERPAPI_KEY;

export async function fetchListingFeatures(address: string): Promise<string | null> {
  // Check memory cache
  if (featureDescCache.has(address)) {
    console.log(`[SerpApi] Cache HIT for ${address}`);
    return featureDescCache.get(address)!;
  }

  // Check localStorage
  const cacheKey = `features_${address}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    console.log(`[SerpApi] Cache HIT (localStorage) for ${address}`);
    featureDescCache.set(address, cached);
    return cached;
  }

  if (!SERPAPI_KEY) {
    console.warn("[SerpApi] No API key set, skipping feature lookup");
    return null;
  }

  const query = encodeURIComponent(`${address} apartment features amenities`);
  // Use Vite proxy in dev to avoid CORS, direct URL in production
  const baseUrl = import.meta.env.DEV ? "/api/serpapi" : "https://serpapi.com";
  const url = `${baseUrl}/search.json?engine=google_ai_mode&q=${query}&hl=en&gl=us&api_key=${SERPAPI_KEY}`;

  try {
    console.log(`[SerpApi] Fetching features for ${address}...`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[SerpApi] HTTP ${response.status} for ${address}`);
      return null;
    }

    const data = await response.json();
    const textBlocks = data.text_blocks || [];

    // Flatten all text blocks into a single description
    const parts: string[] = [];
    for (const block of textBlocks) {
      if (block.type === "paragraph") {
        parts.push(block.snippet);
      } else if (block.type === "heading") {
        parts.push(`\n${block.snippet}:`);
      } else if (block.type === "list" && block.list) {
        for (const item of block.list) {
          parts.push(`- ${item.snippet}`);
        }
      }
    }

    const description = parts.join("\n").trim();
    if (description) {
      console.log(`[SerpApi] Got ${description.length} chars of features for ${address}`);
      featureDescCache.set(address, description);
      localStorage.setItem(cacheKey, description);
      return description;
    }
  } catch (err) {
    console.error(`[SerpApi] Failed for ${address}:`, err);
  }

  return null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGroq(messages: { role: string; content: string }[], retries = 3, maxTokens = 512): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    console.log(`[Groq] API call attempt ${attempt + 1}/${retries}`);
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
      }),
    });

    if (response.status === 429) {
      const waitMs = Math.min(1000 * 2 ** attempt, 8000);
      console.warn(`[Groq] Rate limited (429), retrying in ${waitMs}ms...`);
      await delay(waitMs);
      continue;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  throw new Error("Groq API rate limit exceeded after retries");
}

export async function extractListingTags(listing: {
  id: string;
  address: string;
  neighborhood: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  priceType: "rent" | "buy";
}): Promise<ListingTags> {
  // Check cache
  if (tagsCache.has(listing.id)) {
    console.log(`[Tags] Cache HIT (memory) for ${listing.address}`);
    return tagsCache.get(listing.id)!;
  }

  // Also check localStorage for persistence across page loads
  const cacheKey = `tags_${listing.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const tags = JSON.parse(cached) as ListingTags;
      tagsCache.set(listing.id, tags);
      console.log(`[Tags] Cache HIT (localStorage) for ${listing.address}`);
      return tags;
    } catch { /* re-extract */ }
  }
  console.log(`[Tags] Cache MISS — extracting tags for ${listing.address}`);

  // Fetch real features from Google AI Mode via SerpApi
  const realFeatures = await fetchListingFeatures(listing.address);

  const listingDescription = realFeatures
    ? `Address: ${listing.address}\nReal features from web:\n${realFeatures}`
    : `Address: ${listing.address}
Neighborhood: ${listing.neighborhood}
Price: $${listing.price.toLocaleString()}${listing.priceType === "rent" ? "/month" : ""}
Bedrooms: ${listing.beds}, Bathrooms: ${listing.baths}
Square footage: ${listing.sqft}`;

  try {
    const result = await callGroq([
      {
        role: "system",
        content: `Extract housing features as JSON matching this schema exactly.${realFeatures ? " Use the REAL feature data provided — do NOT guess." : " Infer from the address, neighborhood, price point, and size. If unknown, set false or \"unknown\"."} No extra keys.

Schema:
{
  "natural_light": boolean,
  "elevator": boolean,
  "laundry_in_building": boolean,
  "laundry_in_unit": boolean,
  "doorman": boolean,
  "pet_friendly": boolean,
  "dishwasher": boolean,
  "renovated": boolean,
  "near_subway_lines": string[],
  "noise_level": "quiet" | "average" | "unknown",
  "building_type": "walkup" | "elevator" | "unknown"
}

Respond with ONLY valid JSON. No markdown, no explanation.`,
      },
      {
        role: "user",
        content: listingDescription,
      },
    ]);

    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const tags = JSON.parse(cleaned) as ListingTags;
    console.log(`[Tags] Extracted for ${listing.address}:`, tags);
    tagsCache.set(listing.id, tags);
    localStorage.setItem(cacheKey, JSON.stringify(tags));
    return tags;
  } catch (err) {
    console.error(`[Tags] Failed for ${listing.address}:`, err);
    // Return defaults on failure
    const defaults: ListingTags = {
      natural_light: false,
      elevator: false,
      laundry_in_building: false,
      laundry_in_unit: false,
      doorman: false,
      pet_friendly: false,
      dishwasher: false,
      renovated: false,
      near_subway_lines: [],
      noise_level: "unknown",
      building_type: "unknown",
    };
    tagsCache.set(listing.id, defaults);
    return defaults;
  }
}

// Swipe preference tracking
interface SwipeHistory {
  liked: ListingTags[];
  disliked: ListingTags[];
}

function getSwipeHistory(): SwipeHistory {
  const stored = localStorage.getItem("swipeHistory");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch { /* reset */ }
  }
  return { liked: [], disliked: [] };
}

export function recordSwipe(tags: ListingTags, direction: "left" | "right") {
  const history = getSwipeHistory();
  if (direction === "right") {
    history.liked.push(tags);
  } else {
    history.disliked.push(tags);
  }
  console.log(`[Swipe] Recorded ${direction === "right" ? "LIKE" : "DISLIKE"} — total: ${history.liked.length} liked, ${history.disliked.length} disliked`);
  localStorage.setItem("swipeHistory", JSON.stringify(history));
}

export function getLikedFeatures(): string[] {
  const history = getSwipeHistory();
  if (history.liked.length === 0) return [];

  // Count how often each boolean feature appears in liked listings
  const featureCounts: Record<string, number> = {};
  const booleanKeys: (keyof ListingTags)[] = [
    "natural_light", "elevator", "laundry_in_building", "laundry_in_unit",
    "doorman", "pet_friendly", "dishwasher", "renovated",
  ];

  history.liked.forEach((tags) => {
    booleanKeys.forEach((key) => {
      if (tags[key] === true) {
        featureCounts[key] = (featureCounts[key] || 0) + 1;
      }
    });
  });

  // Return features that appear in >40% of liked listings
  const threshold = history.liked.length * 0.4;
  return Object.entries(featureCounts)
    .filter(([, count]) => count >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key.replace(/_/g, " "));
}

export async function generateMatchExplanation(listing: {
  address: string;
  neighborhood: string;
  beds: number;
  baths: number;
  price: number;
  priceType: "rent" | "buy";
  commuteTimes: { label: string; minutes: number }[];
  tradeoff: string;
}, tags: ListingTags): Promise<string> {
  const history = getSwipeHistory();
  const totalSwipes = history.liked.length + history.disliked.length;

  // Build a features string from the actual extracted tags
  const activeFeatures = Object.entries(tags)
    .filter(([key, val]) => val === true && key !== "building_type" && key !== "noise_level")
    .map(([key]) => key.replace(/_/g, " "));
  const subwayInfo = tags.near_subway_lines.length > 0 ? `near ${tags.near_subway_lines.join(", ")}` : "";
  const buildingInfo = tags.building_type !== "unknown" ? tags.building_type : "";
  const noiseInfo = tags.noise_level !== "unknown" ? `${tags.noise_level} area` : "";

  // Need at least 3 swipes for meaningful explanation
  if (totalSwipes < 3) {
    console.log(`[MatchExplain] Only ${totalSwipes} swipes — using tag-based explanation`);
    const highlights = [...activeFeatures, subwayInfo, buildingInfo, noiseInfo].filter(Boolean).slice(0, 3);
    return highlights.length > 0
      ? `${listing.beds}bd/${listing.baths}ba · ${highlights.join(", ")}`
      : `${listing.beds}bd/${listing.baths}ba in ${listing.neighborhood}`;
  }

  const likedFeatures = getLikedFeatures();
  const matchingFeatures = activeFeatures.filter((f) => likedFeatures.includes(f));
  const commuteStr = listing.commuteTimes
    .map((c) => `${c.label}: ${c.minutes}min`)
    .join(", ");

  console.log(`[MatchExplain] Generating for ${listing.address} | has: [${activeFeatures.join(", ")}] | user likes: [${likedFeatures.join(", ")}] | matches: [${matchingFeatures.join(", ")}]`);

  try {
    const result = await callGroq([
      {
        role: "system",
        content: "Write ONE punchy sentence (max 12 words). Mention specific matching features by name. No filler words. Example: 'Doorman elevator building with dishwasher, 15min to work.'",
      },
      {
        role: "user",
        content: `This listing HAS these features: ${activeFeatures.join(", ")}${subwayInfo ? `, ${subwayInfo}` : ""}${buildingInfo ? `, ${buildingInfo} building` : ""}${noiseInfo ? `, ${noiseInfo}` : ""}
User WANTS: ${likedFeatures.join(", ")}
Matching features: ${matchingFeatures.length > 0 ? matchingFeatures.join(", ") : "none yet"}
Commute: ${commuteStr}
Listing: ${listing.beds}bd/${listing.baths}ba at $${listing.price.toLocaleString()}${listing.priceType === "rent" ? "/mo" : ""}`,
      },
    ], 3, 60);

    console.log(`[MatchExplain] Result: "${result.trim()}"`);
    return result.trim();
  } catch (err) {
    console.error(`[MatchExplain] Failed for ${listing.address}:`, err);
    // Fallback: build explanation from tag data directly
    const highlights = [...matchingFeatures.slice(0, 2), subwayInfo].filter(Boolean);
    return highlights.length > 0
      ? `${highlights.join(", ")} · ${listing.tradeoff}`
      : `${listing.beds}bd/${listing.baths}ba in ${listing.neighborhood}. ${listing.tradeoff}`;
  }
}

// Compute a match score based on swipe history and tags
export function computeMatchScore(tags: ListingTags): number {
  const history = getSwipeHistory();
  if (history.liked.length < 3) {
    console.log(`[MatchScore] Only ${history.liked.length} likes — using random score (need 3+)`);
    return Math.floor(Math.random() * 25) + 70; // fallback random 70-94
  }

  const booleanKeys: (keyof ListingTags)[] = [
    "natural_light", "elevator", "laundry_in_building", "laundry_in_unit",
    "doorman", "pet_friendly", "dishwasher", "renovated",
  ];

  // Score based on how many liked features this listing has
  let matchingFeatures = 0;
  let totalLikedFeatures = 0;

  const likedFeatureCounts: Record<string, number> = {};
  history.liked.forEach((likedTags) => {
    booleanKeys.forEach((key) => {
      if (likedTags[key] === true) {
        likedFeatureCounts[key] = (likedFeatureCounts[key] || 0) + 1;
      }
    });
  });

  const threshold = history.liked.length * 0.3;
  booleanKeys.forEach((key) => {
    if ((likedFeatureCounts[key] || 0) >= threshold) {
      totalLikedFeatures++;
      if (tags[key] === true) {
        matchingFeatures++;
      }
    }
  });

  if (totalLikedFeatures === 0) {
    return Math.floor(Math.random() * 15) + 75;
  }

  const ratio = matchingFeatures / totalLikedFeatures;
  const score = Math.min(98, Math.max(60, Math.round(60 + ratio * 38)));
  console.log(`[MatchScore] ${matchingFeatures}/${totalLikedFeatures} preferred features → ${score}%`);
  return score;
}
