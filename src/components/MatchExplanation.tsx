import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { FeedbackLabel } from "@/services/monitoring";

interface MatchExplanationProps {
  text: string;
  onFeedback?: (label: FeedbackLabel) => void;
  onToggle?: (open: boolean) => void;
}

const FEEDBACK_OPTIONS: Array<{ label: FeedbackLabel; text: string }> = [
  { label: "wrong_commute", text: "Wrong commute" },
  { label: "wrong_price_fit", text: "Wrong price fit" },
  { label: "wrong_explanation", text: "Wrong explanation" },
  { label: "not_similar_to_likes", text: "Not similar to my likes" },
];

const MatchExplanation = ({ text, onFeedback, onToggle }: MatchExplanationProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={(e) => {
          e.stopPropagation();
          const nextOpen = !open;
          setOpen(nextOpen);
          onToggle?.(nextOpen);
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
          <p>{text}</p>
          {onFeedback && (
            <div className="mt-2.5 pt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground mb-1.5">Flag this match:</p>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFeedback(option.label);
                    }}
                    className="px-2 py-1 rounded-md text-[11px] bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MatchExplanation;
