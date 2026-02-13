import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import SwipeCard from "@/components/SwipeCard";
import ModeToggle from "@/components/ModeToggle";
import { Home, Heart, User } from "lucide-react";
import { mockListings, type CommuteMode, type Listing } from "@/data/mockData";

const SwipeFeed = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>("transit");
  const [savedListings, setSavedListings] = useState<Listing[]>([]);

  // Store saved listings in sessionStorage for the saved page
  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (direction === "right") {
        const listing = mockListings[currentIndex];
        const updated = [...savedListings, listing];
        setSavedListings(updated);
        sessionStorage.setItem("savedListings", JSON.stringify(updated));
      }
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, savedListings]
  );

  const remaining = mockListings.slice(currentIndex);
  const isDone = remaining.length === 0;

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
        <ModeToggle mode={commuteMode} onChange={setCommuteMode} />
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

      {/* Swipe area */}
      <div className="flex-1 flex items-center justify-center p-4">
        {isDone ? (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">You've seen them all!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Check your saved homes or come back later for new listings.
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
