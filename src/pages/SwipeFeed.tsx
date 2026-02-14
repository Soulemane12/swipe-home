import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SwipeCard from "@/components/SwipeCard";
import ModeToggle from "@/components/ModeToggle";
import { Home, Heart, Loader2, Search, Sparkles, MapPin, SlidersHorizontal } from "lucide-react";
import { type CommuteMode, type Listing } from "@/data/listingTypes";
import { useListings } from "@/hooks/useListings";
import { fetchPatternMatchedListings, type ListingFilters } from "@/services/rentcast";
import {
  computeMatchScore,
  extractListingTags,
  getCachedListingTags,
  getDislikedCommuteRange,
  getDislikedFeatures,
  getDislikedPriceRange,
  getDislikedSubwayLines,
  getLikedCommuteRange,
  getLikedFeatures,
  getLikedPriceRange,
  getLikedSubwayLines,
  generatePreferenceQuizCopy,
  type PreferenceQuizCopy,
  getPreferenceQuizAnswers,
  savePreferenceQuizAnswers,
  type PreferenceQuizAnswers,
  getTotalSwipes,
  recordSwipe,
} from "@/services/groq";

const LOADING_STEPS = [
  { icon: Search, label: "Searching nearby listings…", delay: 0 },
  { icon: SlidersHorizontal, label: "Applying your filters…", delay: 1200 },
  { icon: MapPin, label: "Calculating commute times…", delay: 2800 },
  { icon: Sparkles, label: "Ranking by your preferences…", delay: 4200 },
];

const LoadingSequence = () => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timers = LOADING_STEPS.map((step, i) =>
      setTimeout(() => setActiveStep(i), step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in w-full max-w-xs">
      {/* Animated spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-[3px] border-muted" />
        <div className="absolute inset-0 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          {LOADING_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Icon
                key={i}
                className={`w-5 h-5 text-primary absolute transition-all duration-300 ${
                  activeStep === i ? "opacity-100 scale-100" : "opacity-0 scale-75"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-2.5 w-full">
        {LOADING_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = activeStep === i;
          const isDone = activeStep > i;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${
                isActive
                  ? "bg-primary/10 text-foreground"
                  : isDone
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40"
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 transition-colors duration-300 ${isActive ? "text-primary" : ""}`} />
              <span className="text-sm font-medium">{step.label}</span>
              {isDone && <span className="ml-auto text-xs text-primary">✓</span>}
              {isActive && (
                <Loader2 className="ml-auto w-3.5 h-3.5 text-primary animate-spin" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function getAverageCommuteMinutes(listing: Listing): number {
  if (!listing.commuteTimes || listing.commuteTimes.length === 0) return 0;
  const total = listing.commuteTimes.reduce((sum, item) => sum + item.minutes, 0);
  return Math.round(total / listing.commuteTimes.length);
}

function isQuizComplete(answers: Partial<PreferenceQuizAnswers>): answers is PreferenceQuizAnswers {
  return Boolean(
    answers.commutePreference &&
    answers.budgetPreference &&
    answers.stylePreference
  );
}

function buildSessionKey(filters: {
  priceType: ListingFilters["priceType"];
  bedrooms: number | undefined;
  bathrooms: number | undefined;
}) {
  return `swipeSession_v1_${filters.priceType}_${filters.bedrooms ?? "any"}_${filters.bathrooms ?? "any"}`;
}

function formatPriceRange(range: { min: number; max: number }, type: "rent" | "buy"): string {
  const min = `$${Math.round(range.min).toLocaleString()}`;
  const max = `$${Math.round(range.max).toLocaleString()}`;
  const amount = range.min === range.max ? min : `${min}-${max}`;
  return type === "rent" ? `${amount}/mo` : amount;
}

function pushPricePatternParts(
  parts: string[],
  mode: ListingFilters["priceType"],
  intent: "liked" | "disliked"
) {
  const getRange = intent === "liked" ? getLikedPriceRange : getDislikedPriceRange;
  const verb = intent === "liked" ? "prefer" : "avoid";
  const pushForType = (type: "rent" | "buy") => {
    const range = getRange(type);
    if (!range) return;
    const label = formatPriceRange(range, type);
    parts.push(mode === "both" ? `${verb} ${type} ${label}` : `${verb} ${label}`);
  };

  if (mode === "rent" || mode === "buy") {
    pushForType(mode);
    return;
  }

  pushForType("rent");
  pushForType("buy");
}

const SwipeFeed = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commuteModes, setCommuteModes] = useState<CommuteMode[]>(["transit"]);
  const [savedListings, setSavedListings] = useState<Listing[]>(() => {
    try {
      const stored = localStorage.getItem("savedListings");
      return stored ? (JSON.parse(stored) as Listing[]) : [];
    } catch {
      return [];
    }
  });
  const listingsRef = useRef<Listing[]>([]);
  const rescoreRunRef = useRef(0);
  const patternFetchInFlightRef = useRef(false);
  const patternBatchCountRef = useRef(0);
  const autoTopupAttemptsRef = useRef(0);
  const hasPromptedQuizRef = useRef(false);

  // Filter state — read initial values from onboarding
  const [priceType, setPriceType] = useState<ListingFilters["priceType"]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("listingFilters") || "{}");
      return saved.priceType || "rent";
    } catch { return "rent"; }
  });
  const [bedrooms, setBedrooms] = useState<number | undefined>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("listingFilters") || "{}");
      return saved.bedrooms ?? undefined;
    } catch { return undefined; }
  });
  const [bathrooms, setBathrooms] = useState<number | undefined>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("listingFilters") || "{}");
      return saved.bathrooms ?? undefined;
    } catch { return undefined; }
  });

  // Learned preferences insight banner
  const [learnedInsight, setLearnedInsight] = useState<string | null>(null);
  const [isFindingPatternMatches, setIsFindingPatternMatches] = useState(false);
  const [patternMessage, setPatternMessage] = useState<string | null>(null);
  const [showPreferenceQuiz, setShowPreferenceQuiz] = useState(false);
  const [quizDraft, setQuizDraft] = useState<Partial<PreferenceQuizAnswers>>(
    () => getPreferenceQuizAnswers() || {}
  );
  const [quizCopy, setQuizCopy] = useState<PreferenceQuizCopy | null>(null);
  const [isGeneratingQuizCopy, setIsGeneratingQuizCopy] = useState(false);
  const sessionKey = buildSessionKey({ priceType, bedrooms, bathrooms });
  const sessionMetaKey = `${sessionKey}_meta`;

  // Auto-dismiss the insight after 4 seconds
  useEffect(() => {
    if (!learnedInsight) return;
    const timer = setTimeout(() => setLearnedInsight(null), 4000);
    return () => clearTimeout(timer);
  }, [learnedInsight]);

  useEffect(() => {
    if (!patternMessage) return;
    const timer = setTimeout(() => setPatternMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [patternMessage]);

  const { listings, setListings, isLoading, error, enrichmentStatus } = useListings(
    {
      priceType,
      bedrooms,
      bathrooms,
      city: "New York",
      state: "NY",
      limit: 10,
    },
    { cacheKey: sessionKey }
  );

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  const persistSessionMeta = useCallback(
    (idx: number) => {
      try {
        localStorage.setItem(
          sessionMetaKey,
          JSON.stringify({
            currentIndex: idx,
            patternBatchCount: patternBatchCountRef.current,
            updatedAt: Date.now(),
          })
        );
      } catch {
        // Ignore session meta persistence errors.
      }
    },
    [sessionMetaKey]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionMetaKey);
      if (!raw) {
        setCurrentIndex(0);
        patternBatchCountRef.current = 0;
        autoTopupAttemptsRef.current = 0;
        return;
      }
      const parsed = JSON.parse(raw) as {
        currentIndex?: number;
        patternBatchCount?: number;
      };
      setCurrentIndex(
        typeof parsed.currentIndex === "number" && parsed.currentIndex >= 0
          ? parsed.currentIndex
          : 0
      );
      patternBatchCountRef.current =
        typeof parsed.patternBatchCount === "number" && parsed.patternBatchCount >= 0
          ? parsed.patternBatchCount
          : 0;
      autoTopupAttemptsRef.current = 0;
    } catch {
      setCurrentIndex(0);
      patternBatchCountRef.current = 0;
      autoTopupAttemptsRef.current = 0;
    }
  }, [sessionMetaKey]);

  useEffect(() => {
    persistSessionMeta(currentIndex);
  }, [currentIndex, persistSessionMeta]);

  useEffect(() => {
    if (listings.length === 0) return;
    if (currentIndex > listings.length) {
      setCurrentIndex(listings.length);
    }
  }, [currentIndex, listings.length]);

  useEffect(() => {
    setPatternMessage(null);
    setIsFindingPatternMatches(false);
    patternFetchInFlightRef.current = false;
    autoTopupAttemptsRef.current = 0;
  }, [priceType, bedrooms, bathrooms]);

  useEffect(() => {
    if (getPreferenceQuizAnswers()) {
      hasPromptedQuizRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!showPreferenceQuiz) return;
    let cancelled = false;

    setIsGeneratingQuizCopy(true);
    setQuizCopy(null);
    generatePreferenceQuizCopy()
      .then((copy) => {
        if (!cancelled && copy) {
          setQuizCopy(copy);
        } else if (!cancelled && !copy) {
          setPatternMessage("AI quiz unavailable right now. Continuing with swipe learning.");
          setShowPreferenceQuiz(false);
          hasPromptedQuizRef.current = true;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsGeneratingQuizCopy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showPreferenceQuiz]);

  const buildPatternSummary = useCallback(() => {
    const liked = getLikedFeatures();
    const subwayLines = getLikedSubwayLines();
    const likedCommute = getLikedCommuteRange();
    const disliked = getDislikedFeatures();
    const dislikedLines = getDislikedSubwayLines();
    const dislikedCommute = getDislikedCommuteRange();
    const explicit = getPreferenceQuizAnswers();
    const parts: string[] = [];
    if (liked.length > 0) parts.push(liked.slice(0, 3).join(", "));
    if (subwayLines.length > 0) parts.push(`near ${subwayLines.slice(0, 4).join("/")} lines`);
    pushPricePatternParts(parts, priceType, "liked");
    if (likedCommute) parts.push(`around ${likedCommute.avg}m commute`);
    if (disliked.length > 0) parts.push(`avoid ${disliked.slice(0, 2).join(", ")}`);
    if (dislikedLines.length > 0) parts.push(`avoid ${dislikedLines.slice(0, 3).join("/")} lines`);
    pushPricePatternParts(parts, priceType, "disliked");
    if (dislikedCommute) parts.push(`avoid ~${dislikedCommute.avg}m commute`);
    if (explicit?.commutePreference === "short") parts.push("short commute first");
    if (explicit?.budgetPreference === "save") parts.push("budget-first");
    if (explicit?.stylePreference === "amenities") parts.push("amenity-heavy buildings");
    if (explicit?.stylePreference === "quiet") parts.push("quiet vibe");
    return parts.length > 0 ? parts.join(" · ") : "higher-quality overall listings";
  }, [priceType]);

  const fetchPatternMatches = useCallback(
    async (fromIndex: number) => {
      if (patternFetchInFlightRef.current) return;
      patternFetchInFlightRef.current = true;
      persistSessionMeta(fromIndex);
      const offset = patternBatchCountRef.current * 25;

      const summary = buildPatternSummary();
      setIsFindingPatternMatches(true);
      setPatternMessage(`Pattern found: ${summary}. Finding 10 more matches...`);

      try {
        const existingIds = listingsRef.current.map((l) => l.id);
        const matches = await fetchPatternMatchedListings(
          {
            priceType,
            bedrooms,
            bathrooms,
            city: "New York",
            state: "NY",
            limit: 10,
            offset,
          },
          existingIds,
          10
        );

        let addedCount = 0;
        setListings((prev) => {
          const seen = prev.slice(0, fromIndex);
          const unseen = prev.slice(fromIndex);
          const unseenIds = new Set(unseen.map((l) => l.id));
          const newMatches = matches.filter((m) => !unseenIds.has(m.id));
          addedCount = newMatches.length;

          const mergedUnseen = [...unseen, ...newMatches].sort((a, b) => b.matchScore - a.matchScore);
          return [...seen, ...mergedUnseen];
        });

        setPatternMessage(
          addedCount > 0
            ? `Pattern found: ${summary}. Added ${addedCount} new matches.`
            : `Pattern found: ${summary}. No new matches in this batch, checking wider inventory next.`
        );
        if (addedCount > 0) {
          autoTopupAttemptsRef.current = 0;
        } else {
          autoTopupAttemptsRef.current += 1;
        }
        patternBatchCountRef.current += 1;
        persistSessionMeta(fromIndex);
      } catch (err) {
        console.error("[Pattern] Failed to fetch pattern matches:", err);
        autoTopupAttemptsRef.current += 1;
        persistSessionMeta(fromIndex);
        setPatternMessage("Pattern found, but extra match search failed. Will retry after more swipes.");
      } finally {
        patternFetchInFlightRef.current = false;
        setIsFindingPatternMatches(false);
      }
    },
    [bathrooms, bedrooms, buildPatternSummary, persistSessionMeta, priceType, setListings]
  );

  // Re-score and re-sort unseen listings based on learned preferences
  const rescoreRemaining = useCallback(
    async (fromIndex: number) => {
      const runId = ++rescoreRunRef.current;
      const unseen = listingsRef.current.slice(fromIndex);
      if (unseen.length === 0) return;

      console.log(`[Rescore] Re-scoring ${unseen.length} unseen listings...`);

      const updatedScores = new Map<string, number>();
      for (const listing of unseen) {
        const cachedTags = getCachedListingTags(listing.id);
        if (!cachedTags) continue;

        const newScore = computeMatchScore(cachedTags, listing.price, listing.priceType, listing.commuteTimes);
        updatedScores.set(listing.id, newScore);
        console.log(`[Rescore] ${listing.address}: ${listing.matchScore} → ${newScore}`);
      }

      if (runId !== rescoreRunRef.current) {
        return;
      }

      if (updatedScores.size === 0) {
        console.log("[Rescore] No cached tags available yet for unseen listings");
      }

      setListings((prev) => {
        const seen = prev.slice(0, fromIndex);
        const rescoredUnseen = prev
          .slice(fromIndex)
          .map((listing) => {
            const newScore = updatedScores.get(listing.id);
            return newScore === undefined ? listing : { ...listing, matchScore: newScore };
          })
          .sort((a, b) => b.matchScore - a.matchScore);

        return [...seen, ...rescoredUnseen];
      });

      // Show what we learned
      const liked = getLikedFeatures();
      const subwayLines = getLikedSubwayLines();
      const likedCommute = getLikedCommuteRange();
      const disliked = getDislikedFeatures();
      const dislikedLines = getDislikedSubwayLines();
      const dislikedCommute = getDislikedCommuteRange();
      const explicit = getPreferenceQuizAnswers();
      const parts: string[] = [];
      if (liked.length > 0) parts.push(liked.slice(0, 3).join(", "));
      if (subwayLines.length > 0) parts.push(`near ${subwayLines.slice(0, 4).join("/")} lines`);
      pushPricePatternParts(parts, priceType, "liked");
      if (likedCommute) parts.push(`~${likedCommute.avg}m commute`);
      if (disliked.length > 0) parts.push(`avoiding ${disliked.slice(0, 2).join(", ")}`);
      if (dislikedLines.length > 0) parts.push(`skipping ${dislikedLines.slice(0, 3).join("/")} lines`);
      pushPricePatternParts(parts, priceType, "disliked");
      if (dislikedCommute) parts.push(`avoiding ~${dislikedCommute.avg}m commute`);
      if (explicit?.commutePreference === "short") parts.push("short-commute priority");
      if (explicit?.budgetPreference === "save") parts.push("budget priority");
      if (parts.length > 0) {
        setLearnedInsight(`Learned pattern: ${parts.join(" · ")}`);
      }
    },
    [priceType, setListings]
  );

  const applyPreferenceQuiz = useCallback(() => {
    if (!isQuizComplete(quizDraft)) return;
    savePreferenceQuizAnswers(quizDraft);
    setShowPreferenceQuiz(false);
    hasPromptedQuizRef.current = true;
    setPatternMessage("Preference answers saved. Re-ranking with your explicit priorities.");
    rescoreRemaining(currentIndex);
    fetchPatternMatches(currentIndex);
  }, [currentIndex, fetchPatternMatches, quizDraft, rescoreRemaining]);

  const skipPreferenceQuiz = useCallback(() => {
    setShowPreferenceQuiz(false);
    hasPromptedQuizRef.current = true;
  }, []);

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      const listing = listings[currentIndex];
      if (listing) {
        const nextIndex = currentIndex + 1;
        const avgCommute = getAverageCommuteMinutes(listing);
        console.log(`[SwipeFeed] Swiped ${direction.toUpperCase()} on: ${listing.address} ($${listing.price.toLocaleString()})`);
        // Record swipe for AI preference learning
        extractListingTags(listing).then((tags) => {
          recordSwipe(tags, direction, listing.price, listing.priceType, avgCommute);

          // After 3+ swipes, re-score remaining unseen listings and re-sort
          const totalSwipes = getTotalSwipes();
          if (totalSwipes >= 4 && !hasPromptedQuizRef.current && !getPreferenceQuizAnswers()) {
            setShowPreferenceQuiz(true);
          }
          if (totalSwipes >= 3) {
            console.log(`[SwipeFeed] ${totalSwipes} swipes — re-scoring remaining listings...`);
            rescoreRemaining(nextIndex);
            if (totalSwipes >= 4) {
              fetchPatternMatches(nextIndex);
            }
          }
        }).catch(() => {});

        if (direction === "right") {
          setSavedListings((prev) => {
            const updated = [...prev, listing];
            localStorage.setItem("savedListings", JSON.stringify(updated));
            return updated;
          });
        }
      }
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, fetchPatternMatches, listings, rescoreRemaining]
  );

  const remaining = listings.slice(currentIndex);
  const isDone = !isLoading && remaining.length === 0;

  useEffect(() => {
    const totalSwipes = getTotalSwipes();
    if (!isDone || isLoading) return;
    if (totalSwipes < 4) return;
    if (patternFetchInFlightRef.current) return;
    if (autoTopupAttemptsRef.current >= 3) return;
    fetchPatternMatches(currentIndex);
  }, [currentIndex, fetchPatternMatches, isDone, isLoading, listings.length]);

  // Reset index when filters change
  const handleFilterChange = (setter: () => void) => {
    patternFetchInFlightRef.current = false;
    patternBatchCountRef.current = 0;
    autoTopupAttemptsRef.current = 0;
    setter();
    setCurrentIndex(0);
    persistSessionMeta(0);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Home className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">HomeSwipe</span>
        </div>
        <ModeToggle modes={commuteModes} onChange={setCommuteModes} />
        <button
          onClick={() => navigate("/saved")}
          className="relative w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Heart className="w-4 h-4" />
          {savedListings.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {savedListings.length}
            </span>
          )}
        </button>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-border bg-card/50">
        {/* Price type */}
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          {(["rent", "buy", "both"] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleFilterChange(() => setPriceType(type))}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                priceType === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type === "both" ? "All" : type === "rent" ? "Rent" : "Buy"}
            </button>
          ))}
        </div>

        {/* Bedrooms */}
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          <span className="px-2 py-1 text-xs text-muted-foreground">Beds:</span>
          {[undefined, 1, 2, 3].map((b) => (
            <button
              key={b ?? "any"}
              onClick={() => handleFilterChange(() => setBedrooms(b))}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                bedrooms === b
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b ?? "Any"}
            </button>
          ))}
        </div>

        {/* Bathrooms */}
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          <span className="px-2 py-1 text-xs text-muted-foreground">Baths:</span>
          {[undefined, 1, 2].map((b) => (
            <button
              key={b ?? "any"}
              onClick={() => handleFilterChange(() => setBathrooms(b))}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                bathrooms === b
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {b ?? "Any"}
            </button>
          ))}
        </div>
      </div>

      {/* Background enrichment status bar */}
      {!isLoading && !enrichmentStatus.done && enrichmentStatus.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/10"
        >
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">
                Analyzing listings… {enrichmentStatus.enriched}/{enrichmentStatus.total}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.round((enrichmentStatus.enriched / enrichmentStatus.total) * 100)}%
              </span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(enrichmentStatus.enriched / enrichmentStatus.total) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            {enrichmentStatus.currentAddress && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {enrichmentStatus.currentAddress}
              </p>
            )}
          </div>
          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        </motion.div>
      )}

      {/* Enrichment complete toast */}
      <AnimatePresence>
        {enrichmentStatus.done && enrichmentStatus.total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 px-4 py-1.5 bg-success/10 border-b border-success/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-success flex-shrink-0" />
            <span className="text-xs font-medium text-success">
              All {enrichmentStatus.total} listings analyzed
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Learned preferences insight */}
      <AnimatePresence>
        {learnedInsight && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border-b border-violet-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
            <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
              {learnedInsight}
            </span>
            <span className="ml-auto text-[10px] text-violet-400">Re-ranked for you</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pattern discovery + auto-fetch status */}
      <AnimatePresence>
        {(isFindingPatternMatches || patternMessage) && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20"
          >
            {isFindingPatternMatches ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin flex-shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {patternMessage || "Finding additional pattern matches..."}
            </span>
            {isFindingPatternMatches && (
              <span className="ml-auto text-[10px] text-emerald-500">Searching</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preference quiz after 5 swipes */}
      <AnimatePresence>
        {showPreferenceQuiz && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-4 shadow-2xl"
            >
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {quizCopy?.title || "Generating AI questions..."}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {quizCopy?.subtitle || "Personalizing questions from your swipe pattern."}
                </p>
              </div>

              {isGeneratingQuizCopy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Building custom questions...
                </div>
              )}

              {quizCopy && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">{quizCopy.commuteQuestion.prompt}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quizCopy.commuteQuestion.options.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setQuizDraft((prev) => ({ ...prev, commutePreference: opt.value as PreferenceQuizAnswers["commutePreference"] }))}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          quizDraft.commutePreference === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">{quizCopy.budgetQuestion.prompt}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quizCopy.budgetQuestion.options.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setQuizDraft((prev) => ({ ...prev, budgetPreference: opt.value as PreferenceQuizAnswers["budgetPreference"] }))}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          quizDraft.budgetPreference === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5">{quizCopy.styleQuestion.prompt}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quizCopy.styleQuestion.options.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setQuizDraft((prev) => ({ ...prev, stylePreference: opt.value as PreferenceQuizAnswers["stylePreference"] }))}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          quizDraft.stylePreference === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={skipPreferenceQuiz}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={applyPreferenceQuiz}
                  disabled={!quizCopy || !isQuizComplete(quizDraft)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply preferences
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipe area */}
      <div className="flex-1 flex items-center justify-center p-4">
        {isLoading ? (
          <LoadingSequence />
        ) : error ? (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-destructive mb-4">
              Failed to load listings. {error instanceof Error ? error.message : "Please try again."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        ) : isDone ? (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">You've seen them all!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Check your saved homes or adjust filters for new listings.
            </p>
            <button
              onClick={() => navigate("/saved")}
              className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              View Saved Homes
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-md h-[580px] sm:h-[640px]">
            <AnimatePresence>
              {remaining.slice(0, 2).map((listing, i) => (
                <SwipeCard
                  key={listing.id}
                  listing={listing}
                  onSwipe={handleSwipe}
                  isTop={i === 0}
                  showSubwayLines={commuteModes.includes("transit")}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default SwipeFeed;
