import { Home, ArrowRight, Sparkles, MapPin, Brain, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const Landing = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Zap,
      title: "Swipe to Discover",
      desc: "Tinder-style cards with real listings, prices, and photos.",
    },
    {
      icon: Brain,
      title: "AI That Learns You",
      desc: "Every swipe teaches the model. Better matches appear automatically.",
    },
    {
      icon: MapPin,
      title: "Real Commute Data",
      desc: "Drive, bike, walk, and transit times powered by Mapbox & HERE.",
    },
    {
      icon: Sparkles,
      title: "Smart Ranking",
      desc: "Match scores, tradeoff explanations, and pattern-based re-fetching.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
          <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-accent/40 blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center max-w-2xl"
        >
          <div className="w-16 h-16 rounded-3xl bg-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/25">
            <Home className="w-8 h-8 text-primary-foreground" />
          </div>

          <h1 className="text-5xl sm:text-7xl font-extrabold text-foreground tracking-tight leading-[1.1]">
            Home<span className="text-primary">Swipe</span>
          </h1>

          <p className="mt-4 text-lg sm:text-xl text-muted-foreground max-w-md">
            Swipe apartments. Learn your taste. Get smarter matches — automatically.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-10 w-full sm:w-auto">
            <button
              onClick={() => navigate("/filter")}
              className="group flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
            >
              Get Started
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigate("/swipe")}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-border bg-card text-foreground font-semibold text-base hover:bg-secondary transition-colors duration-200"
            >
              Open Feed
            </button>
          </div>
        </motion.div>
      </div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="px-4 pb-16 sm:pb-24"
      >
        <div className="mx-auto max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 + i * 0.08 }}
              className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Landing;
