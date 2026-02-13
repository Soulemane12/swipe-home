import { GraduationCap, Briefcase, Dumbbell, MapPin } from "lucide-react";

interface CommuteChipProps {
  label: string;
  minutes: number;
}

const iconMap: Record<string, React.ElementType> = {
  School: GraduationCap,
  Work: Briefcase,
  Gym: Dumbbell,
};

const CommuteChip = ({ label, minutes }: CommuteChipProps) => {
  const Icon = iconMap[label] || MapPin;

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-sm font-medium text-foreground">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span>{label}</span>
      <span className="text-primary font-semibold">{minutes}m</span>
    </div>
  );
};

export default CommuteChip;
