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
  commuteTimes: CommuteTimes[];
  tradeoff: string;
  matchExplanation: string;
  matchScore: number;
}

export const mockListings: Listing[] = [
  {
    id: "1",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
    price: 3200,
    priceType: "rent",
    beds: 2,
    baths: 1,
    sqft: 850,
    neighborhood: "East Village",
    address: "234 E 9th St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 28 },
      { placeId: "2", label: "Work", minutes: 41 },
      { placeId: "3", label: "Gym", minutes: 13 },
    ],
    tradeoff: "+12 min commute saves $250/mo",
    matchExplanation: "You liked: elevator buildings, bright units, near A/C train",
    matchScore: 94,
  },
  {
    id: "2",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop",
    price: 2800,
    priceType: "rent",
    beds: 1,
    baths: 1,
    sqft: 650,
    neighborhood: "Williamsburg",
    address: "145 Bedford Ave",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 35 },
      { placeId: "2", label: "Work", minutes: 22 },
      { placeId: "3", label: "Gym", minutes: 8 },
    ],
    tradeoff: "+7 min to school saves $400/mo",
    matchExplanation: "You liked: rooftop access, modern kitchens, walkable area",
    matchScore: 89,
  },
  {
    id: "3",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
    price: 4100,
    priceType: "rent",
    beds: 3,
    baths: 2,
    sqft: 1200,
    neighborhood: "Upper West Side",
    address: "312 W 86th St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 15 },
      { placeId: "2", label: "Work", minutes: 30 },
      { placeId: "3", label: "Gym", minutes: 20 },
    ],
    tradeoff: "Closest to school, +$900/mo vs cheapest",
    matchExplanation: "You liked: family-friendly, parks nearby, doorman buildings",
    matchScore: 87,
  },
  {
    id: "4",
    image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop",
    price: 2400,
    priceType: "rent",
    beds: 1,
    baths: 1,
    sqft: 550,
    neighborhood: "Bushwick",
    address: "67 Knickerbocker Ave",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 45 },
      { placeId: "2", label: "Work", minutes: 38 },
      { placeId: "3", label: "Gym", minutes: 5 },
    ],
    tradeoff: "Cheapest option, +17 min avg commute",
    matchExplanation: "You liked: creative neighborhoods, affordable, near L train",
    matchScore: 76,
  },
  {
    id: "5",
    image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop",
    price: 3600,
    priceType: "rent",
    beds: 2,
    baths: 2,
    sqft: 950,
    neighborhood: "Chelsea",
    address: "200 W 23rd St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 22 },
      { placeId: "2", label: "Work", minutes: 18 },
      { placeId: "3", label: "Gym", minutes: 10 },
    ],
    tradeoff: "Best avg commute, +$400/mo vs median",
    matchExplanation: "You liked: central location, modern finishes, gym in building",
    matchScore: 92,
  },
  {
    id: "6",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop",
    price: 2950,
    priceType: "rent",
    beds: 2,
    baths: 1,
    sqft: 780,
    neighborhood: "Astoria",
    address: "31-15 Ditmars Blvd",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 40 },
      { placeId: "2", label: "Work", minutes: 35 },
      { placeId: "3", label: "Gym", minutes: 12 },
    ],
    tradeoff: "Spacious for price, +10 min avg commute",
    matchExplanation: "You liked: quiet streets, good restaurants, outdoor space",
    matchScore: 82,
  },
  {
    id: "7",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=600&fit=crop",
    price: 5200,
    priceType: "rent",
    beds: 3,
    baths: 2,
    sqft: 1400,
    neighborhood: "Tribeca",
    address: "85 Hudson St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 20 },
      { placeId: "2", label: "Work", minutes: 12 },
      { placeId: "3", label: "Gym", minutes: 15 },
    ],
    tradeoff: "Premium location, shortest work commute",
    matchExplanation: "You liked: luxury finishes, concierge, waterfront views",
    matchScore: 95,
  },
  {
    id: "8",
    image: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&h=600&fit=crop",
    price: 2600,
    priceType: "rent",
    beds: 1,
    baths: 1,
    sqft: 600,
    neighborhood: "Park Slope",
    address: "456 5th Ave",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 18 },
      { placeId: "2", label: "Work", minutes: 32 },
      { placeId: "3", label: "Gym", minutes: 7 },
    ],
    tradeoff: "Close to school & gym, +$200/mo vs cheapest",
    matchExplanation: "You liked: tree-lined streets, brownstones, near Prospect Park",
    matchScore: 88,
  },
  {
    id: "9",
    image: "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=800&h=600&fit=crop",
    price: 3400,
    priceType: "rent",
    beds: 2,
    baths: 1,
    sqft: 820,
    neighborhood: "Hell's Kitchen",
    address: "520 W 48th St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 25 },
      { placeId: "2", label: "Work", minutes: 15 },
      { placeId: "3", label: "Gym", minutes: 18 },
    ],
    tradeoff: "Near everything, balanced tradeoff",
    matchExplanation: "You liked: walkable, near subway, diverse dining",
    matchScore: 85,
  },
  {
    id: "10",
    image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&h=600&fit=crop",
    price: 2200,
    priceType: "rent",
    beds: 1,
    baths: 1,
    sqft: 500,
    neighborhood: "Washington Heights",
    address: "600 W 181st St",
    commuteTimes: [
      { placeId: "1", label: "School", minutes: 12 },
      { placeId: "2", label: "Work", minutes: 50 },
      { placeId: "3", label: "Gym", minutes: 25 },
    ],
    tradeoff: "Lowest price, closest to school",
    matchExplanation: "You liked: affordable, close to campus, A train express",
    matchScore: 73,
  },
];
