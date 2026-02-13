import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SavedPlaceForm from "@/components/SavedPlaceForm";
import ModeToggle from "@/components/ModeToggle";
import { Home, ArrowRight } from "lucide-react";
import type { CommuteMode } from "@/data/mockData";

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
    { id: "1", label: "Work", address: "", importance: "high" },
  ]);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>("transit");

  const canContinue = step === 1 ? places.length > 0 && places.some((p) => p.address.trim()) : true;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
            <Home className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">HomeSwipe</span>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-border"}`} />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-border"}`} />
        </div>

        {/* Card */}
        <div className="bg-card rounded-3xl card-shadow-lg p-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            {step === 1 ? "Find your perfect home faster" : "How do you get around?"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {step === 1
              ? "Add places you commute to. We'll find homes that fit your life."
              : "Choose your main commute mode for accurate travel times."}
          </p>

          {step === 1 ? (
            <SavedPlaceForm places={places} onChange={setPlaces} />
          ) : (
            <div className="flex justify-center py-8">
              <ModeToggle mode={commuteMode} onChange={setCommuteMode} />
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => {
              if (step === 1) {
                setStep(2);
              } else {
                navigate("/swipe");
              }
            }}
            disabled={!canContinue}
            className="w-full mt-6 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 2 ? "Start Swiping" : "Continue"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
