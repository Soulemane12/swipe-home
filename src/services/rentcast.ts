import type { Listing } from "@/data/mockData";

const API_BASE = "https://api.rentcast.io/v1";
const API_KEY = import.meta.env.VITE_RENTCAST_API_KEY;

export interface ListingFilters {
  priceType: "rent" | "buy" | "both";
  city?: string;
  state?: string;
  bedrooms?: number;
  bathrooms?: number;
  limit?: number;
  offset?: number;
}

interface RentCastListing {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  latitude: number;
  longitude: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  status: string;
  price: number;
  listedDate: string;
  daysOnMarket: number;
}

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&h=600&fit=crop",
];

function getPlaceholderImage(index: number): string {
  return PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];
}

function generateCommuteTimes(): Listing["commuteTimes"] {
  const places = [
    { placeId: "1", label: "Work" },
    { placeId: "2", label: "School" },
    { placeId: "3", label: "Gym" },
  ];
  // Use saved places from sessionStorage if available
  const savedPlaces = sessionStorage.getItem("onboardingPlaces");
  if (savedPlaces) {
    try {
      const parsed = JSON.parse(savedPlaces);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: { id: string; label: string }) => ({
          placeId: p.id,
          label: p.label,
          minutes: Math.floor(Math.random() * 45) + 10,
        }));
      }
    } catch { /* use defaults */ }
  }
  return places.map((p) => ({
    ...p,
    minutes: Math.floor(Math.random() * 45) + 10,
  }));
}

function transformToListing(
  item: RentCastListing,
  priceType: "rent" | "buy",
  index: number
): Listing {
  const commuteTimes = generateCommuteTimes();
  const avgCommute = commuteTimes.reduce((s, c) => s + c.minutes, 0) / commuteTimes.length;
  const matchScore = Math.floor(Math.random() * 25) + 70; // 70-94

  return {
    id: item.id,
    image: getPlaceholderImage(index),
    price: item.price,
    priceType,
    beds: item.bedrooms || 0,
    baths: item.bathrooms || 0,
    sqft: item.squareFootage || 0,
    neighborhood: item.zipCode ? `${item.city} ${item.zipCode}` : item.city,
    address: item.formattedAddress,
    latitude: item.latitude,
    longitude: item.longitude,
    commuteTimes,
    tradeoff: avgCommute < 25
      ? `Short ${Math.round(avgCommute)}min avg commute`
      : `${Math.round(avgCommute)}min avg commute, $${item.price.toLocaleString()}${priceType === "rent" ? "/mo" : ""}`,
    matchExplanation: `${item.propertyType || "Property"} in ${item.city} · ${item.bedrooms || 0}bd/${item.bathrooms || 0}ba · Listed ${item.daysOnMarket || 0} days ago`,
    matchScore,
  };
}

async function fetchFromAPI(endpoint: string, params: Record<string, string>): Promise<RentCastListing[]> {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Api-Key": API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchListings(filters: ListingFilters): Promise<Listing[]> {
  const { priceType, city = "New York", state = "NY", bedrooms, bathrooms, limit = 20, offset = 0 } = filters;

  const params: Record<string, string> = {
    city,
    state,
    status: "Active",
    limit: String(limit),
    offset: String(offset),
  };
  if (bedrooms) params.bedrooms = String(bedrooms);
  if (bathrooms) params.bathrooms = String(bathrooms);

  const results: Listing[] = [];

  if (priceType === "rent" || priceType === "both") {
    const rentals = await fetchFromAPI("/listings/rental/long-term", params);
    results.push(...rentals.map((item, i) => transformToListing(item, "rent", i)));
  }

  if (priceType === "buy" || priceType === "both") {
    const sales = await fetchFromAPI("/listings/sale", params);
    results.push(...sales.map((item, i) => transformToListing(item, "buy", results.length + i)));
  }

  return results;
}
