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
const QUIZ_PREFS_KEY = "preferenceQuizAnswers";

export type CommutePreference = "short" | "balanced" | "flexible";
export type BudgetPreference = "save" | "balanced" | "quality";
export type StylePreference = "amenities" | "quiet" | "either";

export interface PreferenceQuizAnswers {
  commutePreference: CommutePreference;
  budgetPreference: BudgetPreference;
  stylePreference: StylePreference;
}

export interface PreferenceQuizOption<T extends string> {
  value: T;
  label: string;
}

export interface PreferenceQuizQuestion<T extends string> {
  prompt: string;
  options: PreferenceQuizOption<T>[];
}

export interface PreferenceQuizCopy {
  title: string;
  subtitle: string;
  commuteQuestion: PreferenceQuizQuestion<CommutePreference>;
  budgetQuestion: PreferenceQuizQuestion<BudgetPreference>;
  styleQuestion: PreferenceQuizQuestion<StylePreference>;
}

const COMMUTE_VALUES: readonly CommutePreference[] = ["short", "balanced", "flexible"];
const BUDGET_VALUES: readonly BudgetPreference[] = ["save", "balanced", "quality"];
const STYLE_VALUES: readonly StylePreference[] = ["amenities", "quiet", "either"];

function parseQuizOptionsStrict<T extends string>(
  rawOptions: unknown,
  allowedValues: readonly T[]
): PreferenceQuizOption<T>[] | null {
  const normalized = new Map<T, string>();

  if (Array.isArray(rawOptions)) {
    for (const item of rawOptions) {
      const value = (item as { value?: unknown })?.value;
      const label = (item as { label?: unknown })?.label;
      if (
        typeof value === "string" &&
        (allowedValues as readonly string[]).includes(value) &&
        typeof label === "string" &&
        label.trim().length > 0
      ) {
        normalized.set(value as T, label.trim().slice(0, 42));
      }
    }
  }

  if (normalized.size !== allowedValues.length) return null;

  return allowedValues.map((value) => ({
    value,
    label: normalized.get(value)!,
  }));
}

function computeColdStartScore(tags: ListingTags): number {
  const booleanKeys: (keyof ListingTags)[] = [
    "natural_light",
    "elevator",
    "laundry_in_building",
    "laundry_in_unit",
    "doorman",
    "pet_friendly",
    "dishwasher",
    "renovated",
  ];

  const amenityCount = booleanKeys.filter((key) => tags[key] === true).length;
  const amenityRatio = amenityCount / booleanKeys.length;

  const subwayCount = tags.near_subway_lines.length;
  const subwayRatio =
    subwayCount >= 3 ? 1 :
    subwayCount === 2 ? 0.8 :
    subwayCount === 1 ? 0.6 :
    0.35;

  const buildingRatio =
    tags.building_type === "elevator" ? 1 :
    tags.building_type === "walkup" ? 0.6 :
    0.5;

  const noiseRatio =
    tags.noise_level === "quiet" ? 1 :
    tags.noise_level === "average" ? 0.65 :
    0.5;

  const weighted =
    amenityRatio * 0.5 +
    subwayRatio * 0.2 +
    buildingRatio * 0.15 +
    noiseRatio * 0.15;

  return Math.min(92, Math.max(58, Math.round(58 + weighted * 34)));
}

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

// Fetch nearby subway lines via SerpApi AI Mode
const subwayCache = new Map<string, string[]>();

export async function fetchNearbySubways(address: string): Promise<string[]> {
  // Check memory cache
  if (subwayCache.has(address)) {
    return subwayCache.get(address)!;
  }

  // Check localStorage
  const cacheKey = `subway_${address}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const lines = JSON.parse(cached) as string[];
      subwayCache.set(address, lines);
      console.log(`[Subway] Cache HIT for ${address}: ${lines.join(", ")}`);
      return lines;
    } catch { /* re-fetch */ }
  }

  if (!SERPAPI_KEY) return [];

  const query = encodeURIComponent(`subway stations near ${address}`);
  const baseUrl = import.meta.env.DEV ? "/api/serpapi" : "https://serpapi.com";
  const url = `${baseUrl}/search.json?engine=google_ai_mode&q=${query}&hl=en&gl=us&api_key=${SERPAPI_KEY}`;

  try {
    console.log(`[Subway] Looking up subway lines near ${address}...`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Subway] HTTP ${response.status} for ${address}`);
      return [];
    }

    const data = await response.json();
    const textBlocks = data.text_blocks || [];

    // Flatten to text for parsing
    const text = textBlocks
      .map((b: any) => {
        if (b.type === "paragraph") return b.snippet;
        if (b.type === "heading") return b.snippet;
        if (b.type === "list" && b.list) return b.list.map((i: any) => i.snippet).join("\n");
        return "";
      })
      .join("\n");

    // Extract subway line letters/numbers from the text
    // Match patterns like "A, C, E", "2, 3", "N/Q/R/W", "Lines: 1, 2, 3"
    const linePattern = /\b([A-GJ-NQ-SWZ1-7])\b/g;
    const foundLines = new Set<string>();
    let match;
    while ((match = linePattern.exec(text)) !== null) {
      const line = match[1];
      // Filter out common false positives (single letters that aren't subway lines)
      if (!["I", "O", "P", "T", "U", "V", "X", "Y", "H", "K"].includes(line)) {
        foundLines.add(line);
      }
    }

    const lines = Array.from(foundLines).sort();
    if (lines.length > 0) {
      console.log(`[Subway] Found lines near ${address}: ${lines.join(", ")}`);
      subwayCache.set(address, lines);
      localStorage.setItem(cacheKey, JSON.stringify(lines));
      return lines;
    }
  } catch (err) {
    console.error(`[Subway] Failed for ${address}:`, err);
  }

  return [];
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

  // Fetch real features and subway data from Google AI Mode via SerpApi
  const [realFeatures, subwayLines] = await Promise.all([
    fetchListingFeatures(listing.address),
    fetchNearbySubways(listing.address),
  ]);

  const subwayInfo = subwayLines.length > 0
    ? `\nNearby subway lines: ${subwayLines.join(", ")}`
    : "";

  const listingDescription = realFeatures
    ? `Address: ${listing.address}\nReal features from web:\n${realFeatures}${subwayInfo}`
    : `Address: ${listing.address}
Neighborhood: ${listing.neighborhood}
Price: $${listing.price.toLocaleString()}${listing.priceType === "rent" ? "/month" : ""}
Bedrooms: ${listing.beds}, Bathrooms: ${listing.baths}
Square footage: ${listing.sqft}${subwayInfo}`;

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
    throw err;
  }
}

export function getCachedListingTags(listingId: string): ListingTags | null {
  if (tagsCache.has(listingId)) {
    return tagsCache.get(listingId)!;
  }

  const cached = localStorage.getItem(`tags_${listingId}`);
  if (!cached) return null;

  try {
    const tags = JSON.parse(cached) as ListingTags;
    tagsCache.set(listingId, tags);
    return tags;
  } catch {
    return null;
  }
}

// Swipe preference tracking
interface SwipeEntry {
  tags: ListingTags;
  price: number;
  priceType: "rent" | "buy";
  commuteMinutes: number;
}

interface SwipeHistory {
  liked: SwipeEntry[];
  disliked: SwipeEntry[];
  // Legacy compat: old format stored ListingTags[] directly
}

function getSwipeHistory(): SwipeHistory {
  const stored = localStorage.getItem("swipeHistory");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const normalizeEntry = (entry: any): SwipeEntry => {
        if (entry?.tags) {
          return {
            tags: entry.tags as ListingTags,
            price: typeof entry.price === "number" ? entry.price : 0,
            priceType: entry.priceType === "buy" ? "buy" : "rent",
            commuteMinutes: typeof entry.commuteMinutes === "number" ? entry.commuteMinutes : 0,
          };
        }
        return {
          tags: entry as ListingTags,
          price: 0,
          priceType: "rent",
          commuteMinutes: 0,
        };
      };

      // Migrate old format (ListingTags[]) to new format (SwipeEntry[])
      if (parsed.liked?.length > 0 && !("tags" in parsed.liked[0])) {
        return {
          liked: parsed.liked.map((tags: ListingTags) => ({
            tags,
            price: 0,
            priceType: "rent" as const,
            commuteMinutes: 0,
          })),
          disliked: parsed.disliked.map((tags: ListingTags) => ({
            tags,
            price: 0,
            priceType: "rent" as const,
            commuteMinutes: 0,
          })),
        };
      }
      return {
        liked: Array.isArray(parsed.liked) ? parsed.liked.map(normalizeEntry) : [],
        disliked: Array.isArray(parsed.disliked) ? parsed.disliked.map(normalizeEntry) : [],
      };
    } catch { /* reset */ }
  }
  return { liked: [], disliked: [] };
}

export function recordSwipe(
  tags: ListingTags,
  direction: "left" | "right",
  price: number = 0,
  priceType: "rent" | "buy" = "rent",
  commuteMinutes: number = 0
) {
  const history = getSwipeHistory();
  const entry: SwipeEntry = { tags, price, priceType, commuteMinutes };
  if (direction === "right") {
    history.liked.push(entry);
  } else {
    history.disliked.push(entry);
  }
  console.log(
    `[Swipe] Recorded ${direction === "right" ? "LIKE" : "DISLIKE"} ($${price.toLocaleString()}, ${commuteMinutes ? `${commuteMinutes}m` : "n/a"} commute) — total: ${history.liked.length} liked, ${history.disliked.length} disliked`
  );
  localStorage.setItem("swipeHistory", JSON.stringify(history));
}

export function getTotalSwipes(): number {
  const history = getSwipeHistory();
  return history.liked.length + history.disliked.length;
}

type PriceRange = { avg: number; min: number; max: number };

function derivePriceRange(
  entries: SwipeEntry[],
  priceType?: "rent" | "buy"
): PriceRange | null {
  const prices = entries
    .filter((entry) => entry.price > 0 && (!priceType || entry.priceType === priceType))
    .map((entry) => entry.price);
  if (prices.length < 2) return null;
  const avg = Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length);
  return { avg, min: Math.min(...prices), max: Math.max(...prices) };
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

  history.liked.forEach((entry) => {
    booleanKeys.forEach((key) => {
      if (entry.tags[key] === true) {
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

export function getDislikedFeatures(): string[] {
  const history = getSwipeHistory();
  if (history.disliked.length === 0) return [];

  const featureCounts: Record<string, number> = {};
  const booleanKeys: (keyof ListingTags)[] = [
    "natural_light", "elevator", "laundry_in_building", "laundry_in_unit",
    "doorman", "pet_friendly", "dishwasher", "renovated",
  ];

  history.disliked.forEach((entry) => {
    booleanKeys.forEach((key) => {
      if (entry.tags[key] === true) {
        featureCounts[key] = (featureCounts[key] || 0) + 1;
      }
    });
  });

  const threshold = Math.max(1, history.disliked.length * 0.4);
  return Object.entries(featureCounts)
    .filter(([, count]) => count >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key.replace(/_/g, " "));
}

export function getLikedSubwayLines(): string[] {
  const history = getSwipeHistory();
  if (history.liked.length === 0) return [];

  // Count how often each subway line appears in liked listings
  const lineCounts: Record<string, number> = {};
  history.liked.forEach((entry) => {
    if (entry.tags.near_subway_lines) {
      entry.tags.near_subway_lines.forEach((line) => {
        lineCounts[line] = (lineCounts[line] || 0) + 1;
      });
    }
  });

  // Return lines that appear in >40% of liked listings
  const threshold = history.liked.length * 0.4;
  return Object.entries(lineCounts)
    .filter(([, count]) => count >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([line]) => line);
}

export function getDislikedSubwayLines(): string[] {
  const history = getSwipeHistory();
  if (history.disliked.length === 0) return [];

  const lineCounts: Record<string, number> = {};
  history.disliked.forEach((entry) => {
    if (entry.tags.near_subway_lines) {
      entry.tags.near_subway_lines.forEach((line) => {
        lineCounts[line] = (lineCounts[line] || 0) + 1;
      });
    }
  });

  const threshold = Math.max(1, history.disliked.length * 0.4);
  return Object.entries(lineCounts)
    .filter(([, count]) => count >= threshold)
    .sort(([, a], [, b]) => b - a)
    .map(([line]) => line);
}

export function getLikedPriceRange(priceType?: "rent" | "buy"): PriceRange | null {
  const history = getSwipeHistory();
  return derivePriceRange(history.liked, priceType);
}

export function getDislikedPriceRange(priceType?: "rent" | "buy"): PriceRange | null {
  const history = getSwipeHistory();
  return derivePriceRange(history.disliked, priceType);
}

export function getLikedCommuteRange(): { avg: number; min: number; max: number } | null {
  const history = getSwipeHistory();
  const commutes = history.liked
    .filter((e) => e.commuteMinutes > 0)
    .map((e) => e.commuteMinutes);
  if (commutes.length < 2) return null;
  const avg = Math.round(commutes.reduce((s, p) => s + p, 0) / commutes.length);
  return { avg, min: Math.min(...commutes), max: Math.max(...commutes) };
}

export function getDislikedCommuteRange(): { avg: number; min: number; max: number } | null {
  const history = getSwipeHistory();
  const commutes = history.disliked
    .filter((e) => e.commuteMinutes > 0)
    .map((e) => e.commuteMinutes);
  if (commutes.length < 2) return null;
  const avg = Math.round(commutes.reduce((s, p) => s + p, 0) / commutes.length);
  return { avg, min: Math.min(...commutes), max: Math.max(...commutes) };
}

export function getPreferenceQuizAnswers(): PreferenceQuizAnswers | null {
  const raw = localStorage.getItem(QUIZ_PREFS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PreferenceQuizAnswers>;
    if (
      (parsed.commutePreference === "short" || parsed.commutePreference === "balanced" || parsed.commutePreference === "flexible") &&
      (parsed.budgetPreference === "save" || parsed.budgetPreference === "balanced" || parsed.budgetPreference === "quality") &&
      (parsed.stylePreference === "amenities" || parsed.stylePreference === "quiet" || parsed.stylePreference === "either")
    ) {
      return parsed as PreferenceQuizAnswers;
    }
  } catch {
    return null;
  }
  return null;
}

export function savePreferenceQuizAnswers(answers: PreferenceQuizAnswers) {
  localStorage.setItem(QUIZ_PREFS_KEY, JSON.stringify(answers));
}

export async function generatePreferenceQuizCopy(): Promise<PreferenceQuizCopy | null> {
  const history = getSwipeHistory();
  const totalSwipes = history.liked.length + history.disliked.length;

  if (!GROQ_API_KEY || totalSwipes < 3) {
    return null;
  }

  const likedFeatures = getLikedFeatures().slice(0, 4);
  const dislikedFeatures = getDislikedFeatures().slice(0, 4);
  const likedLines = getLikedSubwayLines().slice(0, 4);
  const dislikedLines = getDislikedSubwayLines().slice(0, 4);
  const likedPrice = getLikedPriceRange();
  const dislikedPrice = getDislikedPriceRange();
  const likedCommute = getLikedCommuteRange();
  const dislikedCommute = getDislikedCommuteRange();

  const formatRange = (range: PriceRange | null) =>
    range ? `$${range.min.toLocaleString()}-$${range.max.toLocaleString()}` : "unknown";

  const historySummary = [
    `Liked features: ${likedFeatures.length ? likedFeatures.join(", ") : "none yet"}`,
    `Disliked features: ${dislikedFeatures.length ? dislikedFeatures.join(", ") : "none yet"}`,
    `Liked subway lines: ${likedLines.length ? likedLines.join("/") : "none yet"}`,
    `Disliked subway lines: ${dislikedLines.length ? dislikedLines.join("/") : "none yet"}`,
    `Liked price range: ${formatRange(likedPrice)}`,
    `Disliked price range: ${formatRange(dislikedPrice)}`,
    `Liked commute avg: ${likedCommute ? `${likedCommute.avg} min` : "unknown"}`,
    `Disliked commute avg: ${dislikedCommute ? `${dislikedCommute.avg} min` : "unknown"}`,
  ].join("\n");

  try {
    const result = await callGroq([
      {
        role: "system",
        content: `You write adaptive multiple-choice quiz copy for apartment recommendations.

Return ONLY valid JSON with this exact schema:
{
  "title": string,
  "subtitle": string,
  "commuteQuestion": {
    "prompt": string,
    "options": [
      { "value": "short", "label": string },
      { "value": "balanced", "label": string },
      { "value": "flexible", "label": string }
    ]
  },
  "budgetQuestion": {
    "prompt": string,
    "options": [
      { "value": "save", "label": string },
      { "value": "balanced", "label": string },
      { "value": "quality", "label": string }
    ]
  },
  "styleQuestion": {
    "prompt": string,
    "options": [
      { "value": "amenities", "label": string },
      { "value": "quiet", "label": string },
      { "value": "either", "label": string }
    ]
  }
}

Rules:
- Keep labels concise (2-5 words each).
- Tailor wording to the swipe history context.
- DO NOT change any option value IDs.
- No markdown.`,
      },
      {
        role: "user",
        content: `Create better quiz wording from this swipe history:
${historySummary}`,
      },
    ], 2, 300);

    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<PreferenceQuizCopy>;
    if (typeof parsed.title !== "string" || !parsed.title.trim()) return null;
    if (typeof parsed.subtitle !== "string" || !parsed.subtitle.trim()) return null;
    if (typeof parsed.commuteQuestion?.prompt !== "string" || !parsed.commuteQuestion.prompt.trim()) return null;
    if (typeof parsed.budgetQuestion?.prompt !== "string" || !parsed.budgetQuestion.prompt.trim()) return null;
    if (typeof parsed.styleQuestion?.prompt !== "string" || !parsed.styleQuestion.prompt.trim()) return null;

    const commuteOptions = parseQuizOptionsStrict(parsed.commuteQuestion?.options, COMMUTE_VALUES);
    const budgetOptions = parseQuizOptionsStrict(parsed.budgetQuestion?.options, BUDGET_VALUES);
    const styleOptions = parseQuizOptionsStrict(parsed.styleQuestion?.options, STYLE_VALUES);
    if (!commuteOptions || !budgetOptions || !styleOptions) return null;

    return {
      title: parsed.title.trim().slice(0, 70),
      subtitle: parsed.subtitle.trim().slice(0, 140),
      commuteQuestion: {
        prompt: parsed.commuteQuestion.prompt.trim().slice(0, 80),
        options: commuteOptions,
      },
      budgetQuestion: {
        prompt: parsed.budgetQuestion.prompt.trim().slice(0, 80),
        options: budgetOptions,
      },
      styleQuestion: {
        prompt: parsed.styleQuestion.prompt.trim().slice(0, 80),
        options: styleOptions,
      },
    };
  } catch (err) {
    console.warn("[QuizAI] Failed to generate quiz copy:", err);
    return null;
  }
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
  const likedLines = getLikedSubwayLines();
  const matchingFeatures = activeFeatures.filter((f) => likedFeatures.includes(f));
  const matchingLines = tags.near_subway_lines.filter((l) => likedLines.includes(l));
  const commuteStr = listing.commuteTimes
    .map((c) => `${c.label}: ${c.minutes}min`)
    .join(", ");

  console.log(`[MatchExplain] Generating for ${listing.address} | has: [${activeFeatures.join(", ")}] | user likes: [${likedFeatures.join(", ")}] | matches: [${matchingFeatures.join(", ")}] | subway match: [${matchingLines.join(",")}]`);

  try {
    const result = await callGroq([
      {
        role: "system",
        content: "Write ONE punchy sentence (max 15 words). Mention specific matching features and subway lines. No filler words. Example: 'Doorman elevator building near A/C/E, 15min to work.'",
      },
      {
        role: "user",
        content: `This listing HAS these features: ${activeFeatures.join(", ")}${subwayInfo ? `, ${subwayInfo}` : ""}${buildingInfo ? `, ${buildingInfo} building` : ""}${noiseInfo ? `, ${noiseInfo}` : ""}
User WANTS: ${likedFeatures.join(", ")}${likedLines.length > 0 ? `, near ${likedLines.join("/")} subway` : ""}
Matching features: ${matchingFeatures.length > 0 ? matchingFeatures.join(", ") : "none"}${matchingLines.length > 0 ? `, matching subway: ${matchingLines.join("/")}` : ""}
Commute: ${commuteStr}
Listing: ${listing.beds}bd/${listing.baths}ba at $${listing.price.toLocaleString()}${listing.priceType === "rent" ? "/mo" : ""}`,
      },
    ], 3, 60);

    console.log(`[MatchExplain] Result: "${result.trim()}"`);
    return result.trim();
  } catch (err) {
    console.error(`[MatchExplain] Failed for ${listing.address}:`, err);
    throw err;
  }
}

// Compute a match score based on swipe history, tags, price, and commute distance
export function computeMatchScore(
  tags: ListingTags,
  price: number = 0,
  priceType: "rent" | "buy" = "rent",
  commuteTimes: { label: string; minutes: number }[] = []
): number {
  const history = getSwipeHistory();
  const totalSwipes = history.liked.length + history.disliked.length;
  if (totalSwipes < 3) {
    const coldStart = computeColdStartScore(tags);
    console.log(`[MatchScore] Only ${totalSwipes} swipes — cold-start score ${coldStart}%`);
    return coldStart;
  }

  const booleanKeys: (keyof ListingTags)[] = [
    "natural_light", "elevator", "laundry_in_building", "laundry_in_unit",
    "doorman", "pet_friendly", "dishwasher", "renovated",
  ];

  const preferenceAnswers = getPreferenceQuizAnswers();

  // --- 1. Boolean feature matching ---
  let matchingFeatures = 0;
  let totalLikedFeatures = 0;

  const likedFeatureCounts: Record<string, number> = {};
  history.liked.forEach((entry) => {
    booleanKeys.forEach((key) => {
      if (entry.tags[key] === true) {
        likedFeatureCounts[key] = (likedFeatureCounts[key] || 0) + 1;
      }
    });
  });

  const threshold = history.liked.length > 0 ? history.liked.length * 0.3 : Number.POSITIVE_INFINITY;
  booleanKeys.forEach((key) => {
    if ((likedFeatureCounts[key] || 0) >= threshold) {
      totalLikedFeatures++;
      if (tags[key] === true) {
        matchingFeatures++;
      }
    }
  });

  const featureRatio = totalLikedFeatures > 0 ? matchingFeatures / totalLikedFeatures : 0.5;
  const dislikedFeatures = getDislikedFeatures();
  const activeFeatures = booleanKeys
    .filter((key) => tags[key] === true)
    .map((key) => key.replace(/_/g, " "));
  const matchedDislikedFeatures = activeFeatures.filter((f) => dislikedFeatures.includes(f)).length;
  const dislikedFeaturePenalty = dislikedFeatures.length > 0
    ? Math.min(1, matchedDislikedFeatures / Math.min(dislikedFeatures.length, 3))
    : 0;

  // --- 2. Subway line overlap ---
  const likedSubwayLines = getLikedSubwayLines();
  const dislikedSubwayLines = getDislikedSubwayLines();
  let subwayRatio = 0.5; // neutral if no data
  if (likedSubwayLines.length > 0 && tags.near_subway_lines.length > 0) {
    const overlap = tags.near_subway_lines.filter((l) => likedSubwayLines.includes(l)).length;
    subwayRatio = Math.min(1, overlap / Math.min(likedSubwayLines.length, 3));
  } else if (likedSubwayLines.length > 0 && tags.near_subway_lines.length === 0) {
    subwayRatio = 0.2;
  }
  const dislikedOverlap = tags.near_subway_lines.filter((l) => dislikedSubwayLines.includes(l)).length;
  const dislikedSubwayPenalty = dislikedSubwayLines.length > 0
    ? Math.min(1, dislikedOverlap / Math.min(dislikedSubwayLines.length, 3))
    : 0;

  // --- 3. Price proximity ---
  let priceRatio = 0.5; // neutral default
  let dislikedPricePenalty = 0;
  const toPriceStats = (values: number[]) => {
    if (values.length < 2) return null;
    const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return { min: Math.min(...values), max: Math.max(...values), avg };
  };
  const likedPriceRange = toPriceStats(
    history.liked
      .filter((entry) => entry.price > 0 && entry.priceType === priceType)
      .map((entry) => entry.price)
  );
  const dislikedPriceRange = toPriceStats(
    history.disliked
      .filter((entry) => entry.price > 0 && entry.priceType === priceType)
      .map((entry) => entry.price)
  );
  const rangeDistanceRatio = (value: number, min: number, max: number, scale: number) => {
    if (value < min) return (min - value) / Math.max(1, scale);
    if (value > max) return (value - max) / Math.max(1, scale);
    return 0;
  };

  if (price > 0 && likedPriceRange) {
    const likedMin = likedPriceRange.min * 0.95;
    const likedMax = likedPriceRange.max * 1.05;
    const outsideRatio = rangeDistanceRatio(price, likedMin, likedMax, likedPriceRange.avg);

    if (outsideRatio === 0) {
      const midpoint = (likedMin + likedMax) / 2;
      const halfSpan = Math.max(1, (likedMax - likedMin) / 2);
      const centerDistance = Math.abs(price - midpoint) / halfSpan;
      priceRatio = Math.max(0.78, 1 - centerDistance * 0.22);
    } else if (outsideRatio <= 0.15) {
      priceRatio = 0.72;
    } else if (outsideRatio <= 0.35) {
      priceRatio = 0.52;
    } else {
      priceRatio = Math.max(0.1, 0.4 - (outsideRatio - 0.35) * 0.35);
    }

    console.log(
      `[MatchScore] Price: $${price.toLocaleString()} vs liked range $${likedPriceRange.min.toLocaleString()}-$${likedPriceRange.max.toLocaleString()} → ${(priceRatio * 100).toFixed(0)}%`
    );
  }

  if (price > 0 && dislikedPriceRange) {
    const dislikedMin = dislikedPriceRange.min * 0.95;
    const dislikedMax = dislikedPriceRange.max * 1.05;
    const outsideRatio = rangeDistanceRatio(price, dislikedMin, dislikedMax, dislikedPriceRange.avg);

    if (outsideRatio === 0) {
      dislikedPricePenalty = 1.0;
    } else if (outsideRatio <= 0.12) {
      dislikedPricePenalty = 0.75;
    } else if (outsideRatio <= 0.3) {
      dislikedPricePenalty = 0.45;
    } else if (outsideRatio <= 0.5) {
      dislikedPricePenalty = 0.2;
    }
  }

  // --- 4. Building type & noise preference ---
  let contextScore = 0.5;
  let contextSignals = 0;
  let dislikedContextPenalty = 0;

  const buildingTypeCounts: Record<string, number> = {};
  history.liked.forEach((entry) => {
    if (entry.tags.building_type !== "unknown") {
      buildingTypeCounts[entry.tags.building_type] = (buildingTypeCounts[entry.tags.building_type] || 0) + 1;
    }
  });
  const preferredBuilding = Object.entries(buildingTypeCounts)
    .sort(([, a], [, b]) => b - a)[0];
  if (preferredBuilding && preferredBuilding[1] >= history.liked.length * 0.4) {
    contextSignals++;
    if (tags.building_type === preferredBuilding[0]) {
      contextScore += 0.5;
    } else if (tags.building_type !== "unknown") {
      contextScore -= 0.2;
    }
  }

  const noiseCounts: Record<string, number> = {};
  history.liked.forEach((entry) => {
    if (entry.tags.noise_level !== "unknown") {
      noiseCounts[entry.tags.noise_level] = (noiseCounts[entry.tags.noise_level] || 0) + 1;
    }
  });
  const preferredNoise = Object.entries(noiseCounts)
    .sort(([, a], [, b]) => b - a)[0];
  if (preferredNoise && preferredNoise[1] >= history.liked.length * 0.4) {
    contextSignals++;
    if (tags.noise_level === preferredNoise[0]) {
      contextScore += 0.5;
    } else if (tags.noise_level !== "unknown") {
      contextScore -= 0.2;
    }
  }

  const dislikedBuildingCounts: Record<string, number> = {};
  history.disliked.forEach((entry) => {
    if (entry.tags.building_type !== "unknown") {
      dislikedBuildingCounts[entry.tags.building_type] = (dislikedBuildingCounts[entry.tags.building_type] || 0) + 1;
    }
  });
  const avoidedBuilding = Object.entries(dislikedBuildingCounts)
    .sort(([, a], [, b]) => b - a)[0];
  if (avoidedBuilding && avoidedBuilding[1] >= Math.max(1, history.disliked.length * 0.4)) {
    if (tags.building_type === avoidedBuilding[0]) {
      dislikedContextPenalty += 0.5;
    }
  }

  const dislikedNoiseCounts: Record<string, number> = {};
  history.disliked.forEach((entry) => {
    if (entry.tags.noise_level !== "unknown") {
      dislikedNoiseCounts[entry.tags.noise_level] = (dislikedNoiseCounts[entry.tags.noise_level] || 0) + 1;
    }
  });
  const avoidedNoise = Object.entries(dislikedNoiseCounts)
    .sort(([, a], [, b]) => b - a)[0];
  if (avoidedNoise && avoidedNoise[1] >= Math.max(1, history.disliked.length * 0.4)) {
    if (tags.noise_level === avoidedNoise[0]) {
      dislikedContextPenalty += 0.5;
    }
  }

  const contextRatio = contextSignals > 0 ? Math.max(0, Math.min(1, contextScore / contextSignals)) : 0.5;

  // --- 5. Commute distance preference ---
  let commuteRatio = 0.5;
  let dislikedCommutePenalty = 0;
  const listingAvgCommute = commuteTimes.length > 0
    ? commuteTimes.reduce((sum, c) => sum + c.minutes, 0) / commuteTimes.length
    : 0;
  const likedCommuteRange = getLikedCommuteRange();
  const dislikedCommuteRange = getDislikedCommuteRange();

  if (listingAvgCommute > 0 && likedCommuteRange) {
    const likedDeviation = Math.abs(listingAvgCommute - likedCommuteRange.avg) / likedCommuteRange.avg;
    if (likedDeviation <= 0.15) commuteRatio = 1.0;
    else if (likedDeviation <= 0.45) commuteRatio = Math.max(0.45, 1 - (likedDeviation - 0.15) * 1.8);
    else commuteRatio = 0.25;
  } else if (listingAvgCommute > 0) {
    if (listingAvgCommute <= 25) commuteRatio = 1.0;
    else if (listingAvgCommute <= 35) commuteRatio = 0.85;
    else if (listingAvgCommute <= 45) commuteRatio = 0.65;
    else commuteRatio = 0.4;
  }

  if (listingAvgCommute > 0 && dislikedCommuteRange) {
    const dislikedDeviation = Math.abs(listingAvgCommute - dislikedCommuteRange.avg) / dislikedCommuteRange.avg;
    if (dislikedDeviation <= 0.12) dislikedCommutePenalty = 1.0;
    else if (dislikedDeviation <= 0.35) dislikedCommutePenalty = 0.85 - (dislikedDeviation - 0.12) * 1.2;
    else if (dislikedDeviation <= 0.55) dislikedCommutePenalty = 0.5 - (dislikedDeviation - 0.35) * 1.0;
    dislikedCommutePenalty = Math.max(0, Math.min(1, dislikedCommutePenalty));
  }

  // --- Quiz preference nudges ---
  let explicitBoost = 0;
  let explicitPenalty = 0;

  if (preferenceAnswers) {
    if (preferenceAnswers.commutePreference === "short" && listingAvgCommute > 0) {
      if (listingAvgCommute <= 25) explicitBoost += 0.08;
      else if (listingAvgCommute >= 45) explicitPenalty += 0.08;
    }
    if (preferenceAnswers.commutePreference === "flexible") {
      explicitBoost += 0.02;
    }

    if (preferenceAnswers.budgetPreference === "save") {
      if (priceRatio >= 0.8) explicitBoost += 0.06;
      if (dislikedPricePenalty >= 0.6) explicitPenalty += 0.06;
    } else if (preferenceAnswers.budgetPreference === "quality") {
      if (featureRatio >= 0.75) explicitBoost += 0.05;
      explicitBoost += 0.02;
    }

    if (preferenceAnswers.stylePreference === "amenities") {
      if (tags.elevator || tags.doorman || tags.laundry_in_unit) explicitBoost += 0.05;
      if (!tags.elevator && !tags.doorman) explicitPenalty += 0.03;
    } else if (preferenceAnswers.stylePreference === "quiet") {
      if (tags.noise_level === "quiet") explicitBoost += 0.05;
      if (tags.noise_level === "average") explicitPenalty += 0.03;
    }
  }

  // --- Weighted combination with dislike penalties ---
  const positiveWeighted =
    featureRatio * 0.3 +
    subwayRatio * 0.14 +
    priceRatio * 0.18 +
    contextRatio * 0.13 +
    commuteRatio * 0.25;

  const dislikePenalty =
    dislikedFeaturePenalty * 0.18 +
    dislikedSubwayPenalty * 0.06 +
    dislikedPricePenalty * 0.08 +
    dislikedContextPenalty * 0.05 +
    dislikedCommutePenalty * 0.12;

  const weighted = Math.max(0, positiveWeighted + explicitBoost - dislikePenalty - explicitPenalty);
  const score = Math.min(98, Math.max(55, Math.round(55 + weighted * 43)));

  console.log(
    `[MatchScore] features=${(featureRatio * 100).toFixed(0)}%, subway=${(subwayRatio * 100).toFixed(0)}%, price=${(priceRatio * 100).toFixed(0)}%, context=${(contextRatio * 100).toFixed(0)}%, commute=${(commuteRatio * 100).toFixed(0)}% | avoid(features=${(dislikedFeaturePenalty * 100).toFixed(0)}%, subway=${(dislikedSubwayPenalty * 100).toFixed(0)}%, price=${(dislikedPricePenalty * 100).toFixed(0)}%, context=${(dislikedContextPenalty * 100).toFixed(0)}%, commute=${(dislikedCommutePenalty * 100).toFixed(0)}%) → ${score}%`
  );
  return score;
}
