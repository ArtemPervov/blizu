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
  fetchPriority,
  backdrop = false,
  preview = false,
}: {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high";
  backdrop?: boolean;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const image = src === failed ? photoPlaceholder : src;
  const imageUrl =
    preview && image.startsWith("/api/listing-images/")
      ? `${image}?variant=card`
      : image;
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
        src={imageUrl}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        onError={() => setFailed(src)}
      />
    </>
  );
}
