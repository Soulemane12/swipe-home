import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, ArrowUpDown, Map, List } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Listing } from "@/data/listingTypes";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type SortBy = "match" | "price" | "commute";
type ViewMode = "list" | "map";

interface SavedPlace {
  id: string;
  label: string;
  address: string;
  importance: string;
}

interface GeocodedPlace extends SavedPlace {
  latitude: number;
  longitude: number;
}

const PLACE_ICONS: Record<string, string> = {
  Work: "\uD83C\uDFE2",
  School: "\uD83C\uDF93",
  Gym: "\uD83C\uDFCB\uFE0F",
};

const PLACE_COLORS: Record<string, string> = {
  Work: "#2563eb",
  School: "#7c3aed",
  Gym: "#059669",
};

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].center as [number, number]; // [lng, lat]
    }
  } catch { /* ignore */ }
  return null;
}

function SavedHomeThumb({ image, alt }: { image: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;

  if (!showImage) {
    return (
      <div className="w-24 h-24 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] text-muted-foreground">No preview</span>
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={alt}
      className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

const SavedHomes = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("match");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [geocodedPlaces, setGeocodedPlaces] = useState<GeocodedPlace[]>([]);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("savedListings");
    if (stored) {
      setListings(JSON.parse(stored));
    }

    // Load and geocode saved places
    const placesStr = localStorage.getItem("savedPlaces");
    if (placesStr) {
      const places: SavedPlace[] = JSON.parse(placesStr);
      Promise.all(
        places
          .filter((p) => p.address.trim())
          .map(async (p) => {
            const coords = await geocodeAddress(p.address);
            if (coords) {
              return { ...p, longitude: coords[0], latitude: coords[1] } as GeocodedPlace;
            }
            return null;
          })
      ).then((results) => {
        setGeocodedPlaces(results.filter((r): r is GeocodedPlace => r !== null));
      });
    }
  }, []);

  // Initialize and update map
  useEffect(() => {
    if (viewMode !== "map" || !mapContainer.current) return;
    if (listings.length === 0 && geocodedPlaces.length === 0) return;

    // Clean up previous map
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current = [];

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-74.006, 40.7128],
      zoom: 11,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidCoords = false;

      // Property listing markers (price pills)
      listings.forEach((listing) => {
        if (!listing.latitude || !listing.longitude) return;
        hasValidCoords = true;

        const el = document.createElement("div");
        el.style.cssText = `
          background: hsl(var(--primary));
          color: white;
          padding: 4px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          border: 2px solid white;
        `;
        el.textContent = `$${listing.price.toLocaleString()}`;

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
          <div style="font-family: system-ui, sans-serif; padding: 4px;">
            <div style="font-weight: 700; font-size: 16px;">$${listing.price.toLocaleString()}${listing.priceType === "rent" ? "/mo" : ""}</div>
            <div style="font-size: 13px; color: #666; margin-top: 2px;">${listing.beds}bd · ${listing.baths}ba · ${listing.sqft} sqft</div>
            <div style="font-size: 12px; color: #888; margin-top: 2px;">${listing.address}</div>
            <div style="font-size: 12px; font-weight: 600; color: hsl(221, 83%, 53%); margin-top: 4px;">${listing.matchScore}% match</div>
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([listing.longitude, listing.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        bounds.extend([listing.longitude, listing.latitude]);
      });

      // Saved places markers (emoji pins)
      geocodedPlaces.forEach((place) => {
        hasValidCoords = true;
        const color = PLACE_COLORS[place.label] || "#6b7280";
        const icon = PLACE_ICONS[place.label] || "\uD83D\uDCCD";

        const el = document.createElement("div");
        el.style.cssText = `
          background: ${color};
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          border: 3px solid white;
        `;
        el.textContent = icon;

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(`
          <div style="font-family: system-ui, sans-serif; padding: 4px;">
            <div style="font-weight: 700; font-size: 14px; color: ${color};">${icon} ${place.label}</div>
            <div style="font-size: 12px; color: #666; margin-top: 2px;">${place.address}</div>
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([place.longitude, place.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        bounds.extend([place.longitude, place.latitude]);
      });

      if (hasValidCoords) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode, listings, geocodedPlaces]);

  const sorted = [...listings].sort((a, b) => {
    if (sortBy === "match") return b.matchScore - a.matchScore;
    if (sortBy === "price") return a.price - b.price;
    const avgA = a.commuteTimes.reduce((s, c) => s + c.minutes, 0) / a.commuteTimes.length;
    const avgB = b.commuteTimes.reduce((s, c) => s + c.minutes, 0) / b.commuteTimes.length;
    return avgA - avgB;
  });

  const avgCommute = (listing: Listing) => {
    const avg = listing.commuteTimes.reduce((s, c) => s + c.minutes, 0) / listing.commuteTimes.length;
    return Math.round(avg);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <button
          onClick={() => navigate("/swipe")}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Home className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">Saved Homes</span>
        </div>
        {/* View toggle */}
        {listings.length > 0 && (
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("map")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "map"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Map className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {listings.length === 0 ? (
        <div className="text-center py-20 animate-fade-in">
          <p className="text-muted-foreground mb-4">No saved homes yet. Start swiping!</p>
          <button
            onClick={() => navigate("/swipe")}
            className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Start Swiping
          </button>
        </div>
      ) : (
        <>
          {/* Map view */}
          {viewMode === "map" && (
            <div
              ref={mapContainer}
              className="w-full h-[50vh] min-h-[300px]"
            />
          )}

          {/* List section */}
          <div className="max-w-2xl mx-auto p-4 w-full">
            {/* Sort bar */}
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              {(["match", "price", "commute"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    sortBy === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "match" ? "Best match" : s === "price" ? "Lowest price" : "Shortest commute"}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              {sorted.map((listing) => (
                <div
                  key={listing.id}
                  className="flex gap-3 p-3 rounded-2xl bg-card card-shadow border border-border animate-fade-in"
                >
                  <SavedHomeThumb image={listing.image} alt={listing.neighborhood} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-foreground">
                        ${listing.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {listing.priceType === "rent" ? "/mo" : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {listing.beds}bd · {listing.baths}ba · {listing.neighborhood}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        ~{avgCommute(listing)}m avg commute
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        {listing.matchScore}% match
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SavedHomes;
