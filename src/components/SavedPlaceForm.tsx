import { useState } from "react";
import { Plus, Trash2, GraduationCap, Briefcase, Dumbbell } from "lucide-react";

interface Place {
  id: string;
  label: string;
  address: string;
  importance: "low" | "medium" | "high";
}

interface SavedPlaceFormProps {
  places: Place[];
  onChange: (places: Place[]) => void;
}

const labelOptions = [
  { value: "School", icon: GraduationCap },
  { value: "Work", icon: Briefcase },
  { value: "Gym", icon: Dumbbell },
];

const SavedPlaceForm = ({ places, onChange }: SavedPlaceFormProps) => {
  const addPlace = () => {
    if (places.length >= 3) return;
    onChange([
      ...places,
      { id: crypto.randomUUID(), label: "Work", address: "", importance: "medium" },
    ]);
  };

  const removePlace = (id: string) => {
    onChange(places.filter((p) => p.id !== id));
  };

  const updatePlace = (id: string, field: keyof Place, value: string) => {
    onChange(places.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  return (
    <div className="space-y-3">
      {places.map((place, index) => (
        <div
          key={place.id}
          className="p-4 rounded-2xl bg-secondary/50 border border-border space-y-3 animate-scale-in"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Place {index + 1}
            </span>
            <button
              onClick={() => removePlace(place.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Label selector */}
          <div className="flex gap-2">
            {labelOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => updatePlace(place.id, "label", opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    place.label === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.value}
                </button>
              );
            })}
          </div>

          {/* Address input */}
          <input
            type="text"
            placeholder="Enter address..."
            value={place.address}
            onChange={(e) => updatePlace(place.id, "address", e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Importance */}
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((imp) => (
              <button
                key={imp}
                onClick={() => updatePlace(place.id, "importance", imp)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                  place.importance === imp
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {imp}
              </button>
            ))}
          </div>
        </div>
      ))}

      {places.length < 3 && (
        <button
          onClick={addPlace}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add place
        </button>
      )}
    </div>
  );
};

export default SavedPlaceForm;
