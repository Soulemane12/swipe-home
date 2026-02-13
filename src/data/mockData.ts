export type CommuteMode = "transit" | "drive" | "walk";

export interface SavedPlace {
  id: string;
  name: string;
  label: "School" | "Work" | "Gym" | "Other";
  address: string;
  importance: "low" | "medium" | "high";
}

export interface CommuteTimes {
  placeId: string;
  label: string;
  minutes: number;
}

export interface Listing {
  id: string;
  image: string;
  price: number;
  priceType: "rent" | "buy";
  beds: number;
  baths: number;
  sqft: number;
  neighborhood: string;
  address: string;
  latitude?: number;
  longitude?: number;
  commuteTimes: CommuteTimes[];
  tradeoff: string;
  matchExplanation: string;
  matchScore: number;
}
