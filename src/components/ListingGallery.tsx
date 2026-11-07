import { useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { Listing } from "../../shared/types";
import { ListingPhoto, listingPhotos, photoPlaceholder } from "./ListingPhoto";
import { Modal } from "./ui";

export function ListingGallery({ listing }: { listing: Listing }) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const photos = listingPhotos(listing);
  const index = Math.min(selected, photos.length - 1);
  const photo = photos[index];
  const multiple = photos.length > 1;
  const alt = `${listing.title}${multiple ? ` · фото ${index + 1}` : ""}`;
  const move = (direction: number) =>
    setSelected((index + direction + photos.length) % photos.length);
  const handleKeys = (event: KeyboardEvent) => {
    if (!multiple || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  };
  const navigation = multiple && (
    <div className="listing-gallery-nav">
      <button
        type="button"
        aria-label="Предыдущее фото"
        onClick={() => move(-1)}
      >
        <ChevronLeft size={20} />
      </button>
      <span aria-live="polite">
        {index + 1} / {photos.length}
      </span>
      <button type="button" aria-label="Следующее фото" onClick={() => move(1)}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
  return (
    <section
      className="listing-gallery"
      aria-label="Фотографии объявления"
      onKeyDown={handleKeys}
    >
      <div className="listing-photo-frame listing-gallery-stage">
        <ListingPhoto src={photo} alt={alt} loading="eager" />
        {photo !== photoPlaceholder && (
          <button
            className="listing-gallery-expand"
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Увеличить фото"
          >
            <Maximize2 size={19} />
          </button>
        )}
      </div>
      {multiple && (
        <div className="listing-gallery-toolbar">
          <div
            className="listing-gallery-thumbs"
            role="group"
            aria-label="Выбрать фото"
          >
            {photos.map((url, photoIndex) => (
              <button
                key={`${url}-${photoIndex}`}
                className="listing-photo-frame"
                type="button"
                aria-label={`Показать фото ${photoIndex + 1}`}
                aria-pressed={index === photoIndex}
                onClick={() => setSelected(photoIndex)}
              >
                <ListingPhoto src={url} alt="" />
              </button>
            ))}
          </div>
          {navigation}
        </div>
      )}
      {expanded && (
        <Modal
          title="Фотографии объявления"
          className="listing-lightbox"
          onClose={() => setExpanded(false)}
          onKeyDown={(event) => {
            handleKeys(event);
            event.stopPropagation();
          }}
        >
          <div className="listing-photo-frame listing-lightbox-stage">
            <ListingPhoto src={photo} alt={alt} loading="eager" />
          </div>
          {navigation}
        </Modal>
      )}
    </section>
  );
}
