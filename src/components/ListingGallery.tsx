import { useState } from "react";
import type { Listing } from "../../shared/types";
import { CATEGORIES } from "../../shared/types";

export function ListingGallery({ listing }: { listing: Listing }) {
  const [index, setIndex] = useState(0);
  const photos = listing.source?.photos.length
    ? listing.source.photos
    : [listing.image];
  return (
    <div className="listing-gallery">
      <div className="detail-image">
        <img
          src={photos[index] ?? photos[0]}
          alt={`${listing.title}${photos.length > 1 ? ` · фото ${index + 1}` : ""}`}
        />
        <span className="image-tag">
          {
            CATEGORIES.find((category) => category.id === listing.category)
              ?.name
          }
        </span>
        {photos.length > 1 && (
          <span className="gallery-count">
            {index + 1} / {photos.length}
          </span>
        )}
      </div>
      {photos.length > 1 && (
        <div
          className="gallery-thumbnails"
          role="group"
          aria-label="Фотографии объявления"
        >
          {photos.map((photo, photoIndex) => (
            <button
              key={photo}
              type="button"
              aria-label={`Показать фото ${photoIndex + 1}`}
              aria-pressed={index === photoIndex}
              onClick={() => setIndex(photoIndex)}
            >
              <img src={photo} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
