import type { Listing } from "../shared/types";
import { euro } from "./lib";

export const listingPrice = (listing: Listing) =>
  listing.source?.priceLabel ?? `от ${euro(listing.price)} / ${listing.unit}`;
export const listingAuthor = (listing: Listing) =>
  listing.source?.authorName ?? listing.providerName;
export const listingCity = (
  listing: Listing,
  unknown = "Город уточните у автора",
) =>
  listing.source && listing.city === "Вся Черногория" ? unknown : listing.city;
