import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface MatchExplanationProps {
  text: string;
}

const MatchExplanation = ({ text }: MatchExplanationProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Why this match?
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 text-sm text-muted-foreground animate-fade-in">
          {text}
        </div>
      )}
    </div>
  );
};

export default MatchExplanation;
