import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  const coreFeatures = [
    "Tinder-style swipe experience for homes.",
    "Swipe right to save homes, swipe left to teach the model what to avoid.",
    "Pre-filter before generation: Rent / Buy / All, Beds, Baths.",
    "Full address, price, beds, baths, sqft, and match score on each card.",
    "Saved homes page with list + map view.",
  ];

  const aiFeatures = [
    "After swipe history starts, unseen cards are re-scored live from your behavior.",
    "Learning uses both like and dislike patterns.",
    "Price learning uses ranges, not just one average number.",
    "Distance/commute is part of ranking and pattern matching.",
    "After enough swipes, the app fetches another 10 cards based on the learned pattern.",
    "AI-generated multiple-choice questions refine recommendations after swiping.",
    "Match explanation + tradeoff text explain why each home is recommended.",
  ];

  const dataIntegrations = [
    "RentCast API for live listings.",
    "Mapbox Directions for drive / bike / walk commute times.",
    "HERE Maps Transit API for real subway/bus routing.",
    "SerpApi + Groq for listing feature extraction, subway context, and recommendations.",
    "StreetEasy URL lookup per listing.",
  ];

  const uxAndReliability = [
    "Initial batch starts fast, then background enrichment continues.",
    "Session/listing cache avoids restarts when user leaves and returns.",
    "No mock listing feed in the current flow.",
    "Cards are hardened with fallbacks so broken images/data don't render blank UI.",
    "NYC coverage includes all boroughs in listing fetch.",
  ];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-border bg-card card-shadow-lg overflow-hidden">
          <div className="bg-primary/10 border-b border-border px-6 py-6 sm:px-8">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground">HomeSwipe</h1>
                <p className="text-base text-muted-foreground mt-1">
                  Tinder for homes.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Swipe apartments. Learn your pattern. Auto-fetch better matches.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8 space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                What This Page Is
              </h2>
              <div className="rounded-2xl border border-border p-4 bg-secondary/30">
                <p className="text-sm text-foreground">
                  HomeSwipe is a swipe-based home discovery app that works like a dating app for apartments and homes.
                  It combines real listing data, real commute times, and AI preference learning to rank what you should
                  see next.
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">Core Product Features</h3>
                <div className="space-y-2">
                  {coreFeatures.map((item) => (
                    <p key={item} className="text-sm text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">AI Personalization Features</h3>
                <div className="space-y-2">
                  {aiFeatures.map((item) => (
                    <p key={item} className="text-sm text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">Real Data and API Stack</h3>
                <div className="space-y-2">
                  {dataIntegrations.map((item) => (
                    <p key={item} className="text-sm text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">Performance and Reliability</h3>
                <div className="space-y-2">
                  {uxAndReliability.map((item) => (
                    <p key={item} className="text-sm text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
            </section>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate("/filter")}
                className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Start in Filters
              </button>
              <button
                onClick={() => navigate("/swipe")}
                className="flex-1 py-3 rounded-2xl bg-secondary text-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Open Swipe Feed
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
