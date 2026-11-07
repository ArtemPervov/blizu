import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Listing } from "../shared/types";
import { api, json, useAuth, useToast } from "./lib";
import { useMarket } from "./market-state";

export function useListingFavorite(listing: Listing) {
  const { user } = useAuth();
  const market = useMarket();
  const toast = useToast();
  const client = useQueryClient();
  const queryKey = ["favorites", user?.id];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => api<{ ids: string[] }>("/favorites"),
    enabled: !!user,
  });
  const saved = user
    ? (data?.ids.includes(listing.id) ?? false)
    : market.saved.some((item) => item.id === listing.id);
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      api(`/favorites/${listing.id}`, {
        method: "PUT",
        body: json({ saved: next }),
      }),
    onSuccess: async (_, next) => {
      await client.invalidateQueries({ queryKey });
      toast(next ? "Сохранили в избранное" : "Убрали из избранного", "success");
    },
    onError: (error) => toast(error.message, "error"),
  });
  return {
    saved,
    busy: mutation.isPending || (!!user && isPending),
    toggle: () => {
      if (user) mutation.mutate(!saved);
      else {
        market.toggleSaved(listing);
        toast(
          saved ? "Убрали из избранного" : "Сохранено на этом устройстве",
          "success",
        );
      }
    },
  };
}
