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
  backdrop = false,
}: {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  backdrop?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const image = src === failed ? photoPlaceholder : src;
  return (
    <>
      {backdrop && image !== photoPlaceholder && (
        <img
          className="listing-photo-backdrop"
          src={image}
          alt=""
          aria-hidden="true"
          loading={loading}
          decoding="async"
        />
      )}
      <img
        className="listing-photo"
        src={image}
        alt={alt}
        loading={loading}
        decoding="async"
        onError={() => setFailed(src)}
      />
    </>
  );
}
