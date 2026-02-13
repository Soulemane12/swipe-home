import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import SwipeCard from "@/components/SwipeCard";
import ModeToggle from "@/components/ModeToggle";
import { Home, Heart, Loader2 } from "lucide-react";
import { type CommuteMode, type Listing } from "@/data/mockData";
import { useListings } from "@/hooks/useListings";
import type { ListingFilters } from "@/services/rentcast";

const SwipeFeed = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commuteModes, setCommuteModes] = useState<CommuteMode[]>(["transit"]);
  const [savedListings, setSavedListings] = useState<Listing[]>([]);

  // Filter state
  const [priceType, setPriceType] = useState<ListingFilters["priceType"]>("rent");
  const [bedrooms, setBedrooms] = useState<number | undefined>(undefined);
  const [bathrooms, setBathrooms] = useState<number | undefined>(undefined);

  const { data: listings = [], isLoading, error } = useListings({
    priceType,
    bedrooms,
    bathrooms,
    city: "New York",
    state: "NY",
    limit: 20,
  });

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (direction === "right" && listings[currentIndex]) {
        const listing = listings[currentIndex];
        const updated = [...savedListings, listing];
        setSavedListings(updated);
        sessionStorage.setItem("savedListings", JSON.stringify(updated));
      }
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, savedListings, listings]
  );

  const remaining = listings.slice(currentIndex);
  const isDone = !isLoading && remaining.length === 0;

  // Reset index when filters change
  const handleFilterChange = (setter: () => void) => {
    setter();
    setCurrentIndex(0);
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

      {/* Swipe area */}
      <div className="flex-1 flex items-center justify-center p-4">
        {isLoading ? (
          <div className="text-center animate-fade-in">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Finding listings...</p>
          </div>
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
