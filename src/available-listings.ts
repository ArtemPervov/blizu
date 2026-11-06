import { useQuery } from "@tanstack/react-query";
import type { Listing } from "../shared/types";
import { api } from "./lib";

export function useAvailableListings(snapshots: Listing[], enabled = true) {
  const ids = snapshots
    .filter((item) => /^[a-zA-Z0-9_-]{1,100}$/.test(item.id))
    .slice(0, 100)
    .map((item) => item.id);
  const query = useQuery({
    queryKey: ["available-listings", ids.join(",")],
    queryFn: () =>
      api<{ items: Listing[] }>(
        `/listings?${new URLSearchParams({ ids: ids.join(","), limit: "100" })}`,
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 0,
    refetchInterval: 30000,
  });
  const items = ids.flatMap((id) => {
    const item = query.data?.items.find((item) => item.id === id);
    return item ? [item] : [];
  });
  return {
    ...query,
    items,
    loading: enabled && ids.length > 0 && query.isPending,
  };
}
