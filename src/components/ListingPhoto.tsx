import { useState } from "react";
import type { Listing } from "../../shared/types";

export const photoPlaceholder = "/images/telegram-placeholder.svg";

export function listingPhotos(listing: Listing) {
  return listing.source?.photos.length
    ? listing.source.photos
    : [listing.image || photoPlaceholder];
}

export function ListingPhoto({
  src,
  alt,
  loading = "lazy",
}: {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState("");
  return (
    <img
      className="listing-photo"
      src={src === failed ? photoPlaceholder : src}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailed(src)}
    />
  );
}
