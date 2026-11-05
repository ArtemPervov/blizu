import { createContext, useContext, useState, type ReactNode } from "react";
import type { Listing } from "../shared/types";
import { useToast } from "./lib";

function readListings(key: string): Listing[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is Listing =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.price === "number" &&
          Number.isFinite(item.price) &&
          typeof item.providerName === "string" &&
          typeof item.providerRating === "number" &&
          Number.isFinite(item.providerRating) &&
          typeof item.reviewCount === "number" &&
          ["image", "description", "city", "category", "unit"].every(
            (key) => typeof item[key] === "string",
          ) &&
          Array.isArray(item.tags) &&
          item.tags.every((tag: unknown) => typeof tag === "string"),
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browsing also works without storage. */
  }
}
type MarketState = {
  saved: Listing[];
  toggleSaved: (listing: Listing) => void;
  clearSaved: () => void;
  compared: Listing[];
  toggleCompare: (listing: Listing) => void;
  clearCompare: () => void;
  recent: Listing[];
  remember: (listing: Listing) => void;
};
const MarketContext = createContext<MarketState | null>(null);
export function MarketProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState(() =>
    readListings("blizu.guest-saved.v1"),
  );
  const [recent, setRecent] = useState(() =>
    readListings("blizu.recent.v1").slice(0, 6),
  );
  const [compared, setCompared] = useState<Listing[]>([]);
  const toast = useToast();
  const toggleSaved = (listing: Listing) => {
    const next = saved.some((item) => item.id === listing.id)
      ? saved.filter((item) => item.id !== listing.id)
      : [listing, ...saved].slice(0, 100);
    setSaved(next);
    write("blizu.guest-saved.v1", next);
  };
  const toggleCompare = (listing: Listing) => {
    if (compared.some((item) => item.id === listing.id))
      setCompared(compared.filter((item) => item.id !== listing.id));
    else if (compared.length < 3) setCompared([...compared, listing]);
    else
      toast(
        "Можно сравнить до трёх предложений. Уберите одно, чтобы добавить другое.",
      );
  };
  const remember = (listing: Listing) => {
    setRecent((current) => {
      const next = [
        listing,
        ...current.filter((item) => item.id !== listing.id),
      ].slice(0, 6);
      write("blizu.recent.v1", next);
      return next;
    });
  };
  return (
    <MarketContext.Provider
      value={{
        saved,
        toggleSaved,
        clearSaved: () => {
          setSaved([]);
          write("blizu.guest-saved.v1", []);
        },
        compared,
        toggleCompare,
        clearCompare: () => setCompared([]),
        recent,
        remember,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}
export function useMarket() {
  const value = useContext(MarketContext);
  if (!value) throw new Error("MarketProvider is missing");
  return value;
}
