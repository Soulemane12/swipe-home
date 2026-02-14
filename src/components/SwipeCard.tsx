import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, useAnimate, PanInfo } from "framer-motion";
import { Heart, X, ExternalLink, TrainFront } from "lucide-react";
import CommuteChip from "./CommuteChip";
import TradeoffBanner from "./TradeoffBanner";
import MatchExplanation from "./MatchExplanation";
import type { Listing } from "@/data/listingTypes";

// NYC subway line colors
const SUBWAY_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  "A": "#0039A6", "C": "#0039A6", "E": "#0039A6",
  "B": "#FF6319", "D": "#FF6319", "F": "#FF6319", "M": "#FF6319",
  "G": "#6CBE45",
  "J": "#996633", "Z": "#996633",
  "L": "#A7A9AC",
  "N": "#FCCC0A", "Q": "#FCCC0A", "R": "#FCCC0A", "W": "#FCCC0A",
  "S": "#808183",
};

interface SwipeCardProps {
  listing: Listing;
  onSwipe: (direction: "left" | "right") => void;
  isTop: boolean;
  showSubwayLines?: boolean;
}

const SwipeCard = ({ listing, onSwipe, isTop, showSubwayLines }: SwipeCardProps) => {
  const [scope, animate] = useAnimate();
  const [imageFailed, setImageFailed] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.5, 1, 1, 1, 0.5]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 120) {
      animateOut("right");
    } else if (info.offset.x < -120) {
      animateOut("left");
    }
  };

  const animateOut = async (direction: "left" | "right") => {
    const xTarget = direction === "right" ? 500 : -500;
    const rotateTarget = direction === "right" ? 20 : -20;
    await animate(scope.current, { x: xTarget, rotate: rotateTarget, opacity: 0 }, { duration: 0.35, ease: "easeOut" });
    onSwipe(direction);
  };

  useEffect(() => {
    setImageFailed(false);
  }, [listing.id, listing.image]);

  const hasImage = Boolean(listing.image) && !imageFailed;
  const displayPrice = listing.price > 0 ? `$${listing.price.toLocaleString()}` : "Price unavailable";
  const displayAddress = listing.address?.trim() || "Address unavailable";
  const displayTradeoff = listing.tradeoff?.trim() || "Balancing commute time, price, and features.";
  const displayExplanation = listing.matchExplanation?.trim() || "Analyzing this home against your swipe pattern.";

  return (
    <motion.div
      ref={scope}
      className={`absolute inset-0 ${isTop ? "z-10 cursor-grab active:cursor-grabbing" : "z-0"}`}
      style={isTop ? { x, rotate, opacity } : { scale: 0.95, y: 8, opacity: 0.6 }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={isTop ? { scale: 1, y: 0 } : { scale: 0.95, y: 8 }}
      animate={isTop ? { scale: 1, y: 0 } : { scale: 0.95, y: 8 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="bg-card rounded-3xl card-shadow-lg overflow-hidden h-full flex flex-col">
        {/* Image */}
        <div className="relative h-52 sm:h-64 flex-shrink-0">
          {hasImage ? (
            <img
              src={listing.image}
              alt={listing.address}
              className="w-full h-full object-cover"
              draggable={false}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="w-full h-full bg-secondary/70 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Preview unavailable</span>
            </div>
          )}
          {/* Like/Nope overlays */}
          {isTop && (
            <>
              <motion.div
                style={{ opacity: likeOpacity }}
                className="absolute top-6 left-6 bg-success text-success-foreground px-4 py-1.5 rounded-xl font-bold text-lg rotate-[-12deg] border-2 border-success"
              >
                LIKE
              </motion.div>
              <motion.div
                style={{ opacity: nopeOpacity }}
                className="absolute top-6 right-6 bg-destructive text-destructive-foreground px-4 py-1.5 rounded-xl font-bold text-lg rotate-[12deg] border-2 border-destructive"
              >
                NOPE
              </motion.div>
            </>
          )}
          {/* Match score */}
          <div className="absolute bottom-3 right-3 bg-primary text-primary-foreground px-2.5 py-1 rounded-lg text-xs font-bold">
            {listing.matchScore}% match
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
          {/* Price & details */}
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">
                {displayPrice}
              </span>
              <span className="text-sm text-muted-foreground">
                {listing.price > 0 && listing.priceType === "rent" ? "/mo" : ""}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {listing.beds} bed · {listing.baths} bath · {listing.sqft} sqft
            </p>
            <p className="text-sm font-medium text-foreground mt-0.5">
              {displayAddress}
            </p>
          </div>

          {/* Commute chips */}
          {listing.commuteTimes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listing.commuteTimes.map((ct) => (
                <CommuteChip key={ct.placeId} label={ct.label} minutes={ct.minutes} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Commute times are loading...</p>
          )}

          {/* Subway lines */}
          {showSubwayLines && listing.nearSubwayLines && listing.nearSubwayLines.length > 0 && (
            <div className="flex items-center gap-1.5">
              <TrainFront className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex gap-1 flex-wrap">
                {listing.nearSubwayLines.map((line) => (
                  <span
                    key={line}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: SUBWAY_COLORS[line] || "#808183" }}
                  >
                    {line}
                  </span>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground ml-1">nearby</span>
            </div>
          )}

          {/* Tradeoff */}
          <TradeoffBanner text={displayTradeoff} />

          {/* Match explanation */}
          <MatchExplanation text={displayExplanation} />

          {/* StreetEasy link */}
          {listing.streetEasyUrl && (
            <a
              href={listing.streetEasyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              View on StreetEasy
            </a>
          )}
        </div>

        {/* Swipe buttons */}
        {isTop && (
          <div className="flex justify-center gap-6 p-4 pt-0">
            <button
              onClick={() => animateOut("left")}
              className="w-14 h-14 rounded-full border-2 border-destructive text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={() => animateOut("right")}
              className="w-14 h-14 rounded-full border-2 border-success text-success flex items-center justify-center hover:bg-success hover:text-success-foreground transition-colors active:scale-95"
            >
              <Heart className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default SwipeCard;
