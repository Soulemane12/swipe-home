import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SavedPlaceForm from "@/components/SavedPlaceForm";
import ModeToggle from "@/components/ModeToggle";
import { Home, ArrowRight, Trash2 } from "lucide-react";
import type { CommuteMode } from "@/data/listingTypes";

interface Place {
  id: string;
  label: string;
  address: string;
  importance: "low" | "medium" | "high";
}

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [places, setPlaces] = useState<Place[]>([
    {
      id: "1",
      label: "School",
      address: "645 W 130th St, New York, NY 10027",
      importance: "high",
    },
    {
      id: "2",
      label: "Gym",
      address: "1250 E 229th St, Bronx, NY 10466",
      importance: "medium",
    },
  ]);
  const [commuteModes, setCommuteModes] = useState<CommuteMode[]>(["transit"]);

  // Listing filter state
  const [priceType, setPriceType] = useState<"rent" | "buy" | "both">("rent");
  const [bedrooms, setBedrooms] = useState<number | undefined>(undefined);
  const [bathrooms, setBathrooms] = useState<number | undefined>(undefined);

  const canContinue =
    step === 1 ? places.length > 0 && places.some((p) => p.address.trim()) : true;

  const stepTitles = [
    "Find your perfect home faster",
    "What are you looking for?",
    "How do you get around?",
  ];
  const stepDescriptions = [
    "Add places you commute to. We'll find homes that fit your life.",
    "Set your preferences to see the best matches first.",
    "Choose your commute modes for accurate travel times. You can pick multiple.",
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo + Clear */}
        <div className="flex items-center justify-between mb-8">
          <div className="w-8" />
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
              <Home className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">HomeSwipe</span>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              setPlaces([
                { id: "1", label: "School", address: "645 W 130th St, New York, NY 10027", importance: "high" },
                { id: "2", label: "Gym", address: "1250 E 229th St, Bronx, NY 10466", importance: "medium" },
              ]);
              setStep(1);
              setPriceType("rent");
              setBedrooms(undefined);
              setBathrooms(undefined);
              setCommuteModes(["transit"]);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Clear all saved data"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-border"}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-border"}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 3 ? "bg-primary" : "bg-border"}`} />
        </div>

        {/* Card */}
        <div className="bg-card rounded-3xl card-shadow-lg p-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {stepTitles[step - 1]}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {stepDescriptions[step - 1]}
          </p>

          {step === 1 ? (
            <SavedPlaceForm places={places} onChange={setPlaces} />
          ) : step === 2 ? (
            <div className="flex flex-col gap-5">
              {/* Price type */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  I want to
                </label>
                <div className="flex gap-2">
                  {(["rent", "buy", "both"] as const).map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setPriceType(type)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        priceType === type
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type === "both" ? "Both" : type === "rent" ? "Rent" : "Buy"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bedrooms */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Bedrooms
                </label>
                <div className="flex gap-2">
                  {([undefined, 1, 2, 3] as const).map((b) => (
                    <button
                      type="button"
                      key={b ?? "any"}
                      onClick={() => setBedrooms(b)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        bedrooms === b
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {b ?? "Any"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bathrooms */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Bathrooms
                </label>
                <div className="flex gap-2">
                  {([undefined, 1, 2] as const).map((b) => (
                    <button
                      type="button"
                      key={b ?? "any"}
                      onClick={() => setBathrooms(b)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        bathrooms === b
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {b ?? "Any"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <ModeToggle modes={commuteModes} onChange={setCommuteModes} />
            </div>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={() => {
              if (step === 1) {
                localStorage.setItem("savedPlaces", JSON.stringify(places));
                setStep(2);
              } else if (step === 2) {
                localStorage.setItem(
                  "listingFilters",
                  JSON.stringify({ priceType, bedrooms: bedrooms ?? null, bathrooms: bathrooms ?? null })
                );
                setStep(3);
              } else {
                localStorage.setItem("commuteMode", commuteModes[0] || "transit");
                navigate("/swipe");
              }
            }}
            disabled={!canContinue}
            className="w-full mt-6 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 3 ? "Start Swiping" : "Continue"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
