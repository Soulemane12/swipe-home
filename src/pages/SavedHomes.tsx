import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, ArrowUpDown } from "lucide-react";
import type { Listing } from "@/data/mockData";

type SortBy = "match" | "price" | "commute";

const SavedHomes = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("match");

  useEffect(() => {
    const stored = sessionStorage.getItem("savedListings");
    if (stored) {
      setListings(JSON.parse(stored));
    }
  }, []);

  const sorted = [...listings].sort((a, b) => {
    if (sortBy === "match") return b.matchScore - a.matchScore;
    if (sortBy === "price") return a.price - b.price;
    const avgA = a.commuteTimes.reduce((s, c) => s + c.minutes, 0) / a.commuteTimes.length;
    const avgB = b.commuteTimes.reduce((s, c) => s + c.minutes, 0) / b.commuteTimes.length;
    return avgA - avgB;
  });

  const avgCommute = (listing: Listing) => {
    const avg = listing.commuteTimes.reduce((s, c) => s + c.minutes, 0) / listing.commuteTimes.length;
    return Math.round(avg);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <button
          onClick={() => navigate("/swipe")}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Home className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">Saved Homes</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {/* Sort bar */}
        {listings.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            {(["match", "price", "commute"] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  sortBy === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "match" ? "Best match" : s === "price" ? "Lowest price" : "Shortest commute"}
              </button>
            ))}
          </div>
        )}

        {listings.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <p className="text-muted-foreground mb-4">No saved homes yet. Start swiping!</p>
            <button
              onClick={() => navigate("/swipe")}
              className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start Swiping
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {sorted.map((listing) => (
              <div
                key={listing.id}
                className="flex gap-3 p-3 rounded-2xl bg-card card-shadow border border-border animate-fade-in"
              >
                <img
                  src={listing.image}
                  alt={listing.neighborhood}
                  className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-foreground">
                      ${listing.price.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {listing.beds}bd · {listing.baths}ba · {listing.neighborhood}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground">
                      ~{avgCommute(listing)}m avg commute
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {listing.matchScore}% match
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedHomes;
