import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { Heart, X } from "lucide-react";
import CommuteChip from "./CommuteChip";
import TradeoffBanner from "./TradeoffBanner";
import MatchExplanation from "./MatchExplanation";
import type { Listing } from "@/data/mockData";

interface SwipeCardProps {
  listing: Listing;
  onSwipe: (direction: "left" | "right") => void;
  isTop: boolean;
}

const SwipeCard = ({ listing, onSwipe, isTop }: SwipeCardProps) => {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const opacity = useTransform(x, [-300, -100, 0, 100, 300], [0.5, 1, 1, 1, 0.5]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 120) {
      onSwipe("right");
    } else if (info.offset.x < -120) {
      onSwipe("left");
    }
  };

  return (
    <motion.div
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
          <img
            src={listing.image}
            alt={listing.address}
            className="w-full h-full object-cover"
            draggable={false}
          />
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
                ${listing.price.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                {listing.priceType === "rent" ? "/mo" : ""}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {listing.beds} bed · {listing.baths} bath · {listing.sqft} sqft
            </p>
            <p className="text-sm font-medium text-foreground mt-0.5">
              {listing.neighborhood}
            </p>
          </div>

          {/* Commute chips */}
          <div className="flex flex-wrap gap-2">
            {listing.commuteTimes.map((ct) => (
              <CommuteChip key={ct.placeId} label={ct.label} minutes={ct.minutes} />
            ))}
          </div>

          {/* Tradeoff */}
          <TradeoffBanner text={listing.tradeoff} />

          {/* Match explanation */}
          <MatchExplanation text={listing.matchExplanation} />
        </div>

        {/* Swipe buttons */}
        {isTop && (
          <div className="flex justify-center gap-6 p-4 pt-0">
            <button
              onClick={() => onSwipe("left")}
              className="w-14 h-14 rounded-full border-2 border-destructive text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={() => onSwipe("right")}
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
