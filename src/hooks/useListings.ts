import { useQuery } from "@tanstack/react-query";
import { fetchListings, type ListingFilters } from "@/services/rentcast";

export function useListings(filters: ListingFilters) {
  return useQuery({
    queryKey: ["listings", filters],
    queryFn: () => fetchListings(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
