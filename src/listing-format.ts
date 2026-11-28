import type { Listing } from "../shared/types";
import { euro, preferredLanguage } from "./lib";
import { translateUi } from "./ui-translations";

export const listingPrice = (listing: Listing) => {
  const language = preferredLanguage();
  return listing.source
    ? translateUi(language, listing.source.priceLabel)
    : `${translateUi(language, "от {0}", euro(listing.price, language))} / ${translateUi(language, listing.unit)}`;
};
export const listingAuthor = (listing: Listing) =>
  listing.source?.authorName ?? listing.providerName;
export const listingCity = (
  listing: Listing,
  unknown = "Город уточните у автора",
) =>
  listing.source && listing.city === "Вся Черногория" ? unknown : listing.city;
