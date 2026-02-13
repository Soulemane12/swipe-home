import { Train, Car, Footprints } from "lucide-react";
import type { CommuteMode } from "@/data/mockData";

interface ModeToggleProps {
  mode: CommuteMode;
  onChange: (mode: CommuteMode) => void;
}

const modes: { value: CommuteMode; label: string; icon: React.ElementType }[] = [
  { value: "transit", label: "Transit", icon: Train },
  { value: "drive", label: "Drive", icon: Car },
  { value: "walk", label: "Walk", icon: Footprints },
];

const ModeToggle = ({ mode, onChange }: ModeToggleProps) => {
  return (
    <div className="inline-flex rounded-xl bg-secondary p-1 gap-0.5">
      {modes.map((m) => {
        const Icon = m.icon;
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
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
