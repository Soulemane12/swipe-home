import { ArrowRightLeft } from "lucide-react";

interface TradeoffBannerProps {
  text: string;
}

const TradeoffBanner = ({ text }: TradeoffBannerProps) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-sm">
      <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
};

export default TradeoffBanner;
