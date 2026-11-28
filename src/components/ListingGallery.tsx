import { useUiText } from "../lib";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Listing } from "../../shared/types";
import { ListingPhoto, listingPhotos, photoPlaceholder } from "./ListingPhoto";
import { Modal } from "./ui";

export function ListingGallery({ listing }: { listing: Listing }) {
  const tr = useUiText();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const lightbox = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const swiped = useRef(false);
  const photos = listingPhotos(listing);
  const index = Math.min(selected, photos.length - 1);
  const photo = photos[index];
  const multiple = photos.length > 1;
  const alt = `${listing.title}${multiple ? tr(" · фото {0}", index + 1) : ""}`;
  const move = (direction: number) => {
    setSelected((index + direction + photos.length) % photos.length);
    setZoom(1);
  };
  const changeZoom = (direction: number) =>
    setZoom((value) => Math.max(1, Math.min(3, value + direction * 0.5)));
  useLayoutEffect(() => {
    const stage = lightbox.current;
    if (!stage) return;
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
  }, [zoom, expanded]);
  useLayoutEffect(() => {
    const rail = thumbs.current;
    const active = rail?.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    if (
      !rail ||
      !active ||
      (active.offsetLeft >= rail.scrollLeft &&
        active.offsetLeft + active.offsetWidth <=
          rail.scrollLeft + rail.clientWidth)
    )
      return;
    rail.scrollTo?.({
      left: Math.max(
        0,
        active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2,
      ),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [index]);
  const startSwipe = (event: PointerEvent) => {
    swiped.current = false;
    pointerStart.current =
      multiple && event.pointerType === "touch" && event.isPrimary
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  };
  const endSwipe = (event: PointerEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 36 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    swiped.current = true;
    move(dx < 0 ? 1 : -1);
  };
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
        aria-label={tr("Предыдущее фото")}
        onClick={() => move(-1)}
      >
        <ChevronLeft size={20} />
      </button>
      <span aria-live="polite">
        {index + 1} / {photos.length}
      </span>
      <button
        type="button"
        aria-label={tr("Следующее фото")}
        onClick={() => move(1)}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
  return (
    <section
      className="listing-gallery"
      aria-label={tr("Фотографии объявления")}
      onKeyDown={handleKeys}
    >
      <div
        className="listing-photo-frame listing-gallery-stage"
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      >
        <ListingPhoto src={photo} alt={alt} loading="eager" backdrop />
        {photo !== photoPlaceholder && (
          <button
            className="listing-gallery-expand"
            type="button"
            onClick={(event) => {
              if (event.detail === 0 || !swiped.current) {
                setZoom(1);
                setExpanded(true);
              }
              swiped.current = false;
            }}
            aria-label={tr("Увеличить фото")}
          >
            <Maximize2 size={19} />
          </button>
        )}
      </div>
      {multiple && (
        <div className="listing-gallery-toolbar">
          <div
            className="listing-gallery-thumbs"
            ref={thumbs}
            role="group"
            aria-label={tr("Выбрать фото")}
          >
            <div
              className="listing-gallery-strip"
              style={{ "--photo-index": index } as CSSProperties}
            >
              <span className="listing-gallery-focus" aria-hidden="true" />
              {photos.map((url, photoIndex) => (
                <button
                  key={`${url}-${photoIndex}`}
                  className="listing-photo-frame"
                  type="button"
                  aria-label={tr("Показать фото {0}", photoIndex + 1)}
                  aria-pressed={index === photoIndex}
                  onClick={() => setSelected(photoIndex)}
                >
                  <ListingPhoto src={url} alt="" />
                </button>
              ))}
            </div>
          </div>
          {navigation}
        </div>
      )}
      {expanded && (
        <Modal
          title={tr("Фотографии объявления")}
          className="listing-lightbox"
          onClose={() => setExpanded(false)}
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=" || event.key === "-") {
              event.preventDefault();
              changeZoom(event.key === "-" ? -1 : 1);
            } else if (zoom === 1) handleKeys(event);
            event.stopPropagation();
          }}
        >
          <div
            className="listing-lightbox-stage"
            ref={lightbox}
            tabIndex={zoom > 1 ? 0 : undefined}
            onDoubleClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
          >
            <div
              className="listing-photo-frame lightbox-zoom-frame"
              style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            >
              <ListingPhoto src={photo} alt={alt} loading="eager" />
            </div>
          </div>
          <div className="listing-lightbox-toolbar">
            {navigation}
            <div className="listing-zoom-controls">
              <button
                type="button"
                aria-label={tr("Уменьшить масштаб")}
                disabled={zoom <= 1}
                onClick={() => changeZoom(-1)}
              >
                <ZoomOut size={19} />
              </button>
              <button
                type="button"
                aria-label={tr("Сбросить масштаб")}
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label={tr("Приблизить фото")}
                disabled={zoom >= 3}
                onClick={() => changeZoom(1)}
              >
                <ZoomIn size={19} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
