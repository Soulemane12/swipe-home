import { Train, Car, Footprints, Bike } from "lucide-react";
import type { CommuteMode } from "@/data/listingTypes";

interface ModeToggleProps {
  modes: CommuteMode[];
  onChange: (modes: CommuteMode[]) => void;
}

const modeOptions: { value: CommuteMode; label: string; icon: React.ElementType }[] = [
  { value: "transit", label: "Transit", icon: Train },
  { value: "drive", label: "Drive", icon: Car },
  { value: "bike", label: "Bike", icon: Bike },
  { value: "walk", label: "Walk", icon: Footprints },
];

const ModeToggle = ({ modes, onChange }: ModeToggleProps) => {
  const toggle = (value: CommuteMode) => {
    if (modes.includes(value)) {
      if (modes.length > 1) onChange(modes.filter((m) => m !== value));
    } else {
      onChange([...modes, value]);
    }
  };

  return (
    <div className="inline-flex rounded-xl bg-secondary p-1 gap-0.5">
      {modeOptions.map((m) => {
        const Icon = m.icon;
        const active = modes.includes(m.value);
        return (
          <button
            type="button"
            key={m.value}
            onClick={() => toggle(m.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
};

export default ModeToggle;
