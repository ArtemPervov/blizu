import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useId,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import {
  X,
  LoaderCircle,
  CircleAlert,
  ArrowUpRight,
  MapPin,
  Star,
  Heart,
  BadgeCheck,
  Columns3,
  Check,
  ChevronLeft,
  ChevronRight,
  Images,
  Send,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CATEGORIES, type Listing } from "../../shared/types";
import { euro, useI18n } from "../lib";
const ParticleScene = lazy(() => import("./Particles"));
import { BrandIllustration, type IllustrationKind } from "./BrandIllustration";
import { listingAuthor, listingCity } from "../listing-format";
import { useListingFavorite } from "../listing-favorite";
import { ListingPhoto, listingPhotos } from "./ListingPhoto";

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="blizu — на главную">
      <svg width="31" height="31" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 3v26M4.75 9.5l22.5 13M4.75 22.5l22.5-13"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
      blizu<span className="brand-dot">.</span>
    </Link>
  );
}
export function Loading() {
  return (
    <div className="state-message" role="status">
      <LoaderCircle className="spin" size={26} />
      <p>Загружаем…</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  return (
    <div className="state-message" role="alert">
      <CircleAlert size={28} />
      <h3>Не удалось загрузить данные</h3>
      <p>{error?.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Попробовать снова
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
  illustration = "search",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  illustration?: IllustrationKind;
}) {
  return (
    <div className="state-message empty">
      <BrandIllustration kind={illustration} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className,
  onKeyDown,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      className={className ? `modal ${className}` : "modal"}
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function ListingCard({
  listing,
  immersive = false,
  onCompare,
  compared = false,
}: {
  listing: Listing;
  immersive?: boolean;
  onCompare?: () => void;
  compared?: boolean;
}) {
  const [photoActive, setPhotoActive] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = listingPhotos(listing);
  const activeIndex = Math.min(photoIndex, photos.length - 1);
  const image = photos[activeIndex];
  const author = listingAuthor(listing);
  const initial =
    [...author].find((character) => /[\p{L}\p{N}]/u.test(character)) ?? "·";
  const categoryName =
    CATEGORIES.find((category) => category.id === listing.category)?.name ||
    "Местное предложение";
  const { t } = useI18n();
  const { saved, busy, toggle } = useListingFavorite(listing);
  return (
    <article
      className={`listing-card${immersive ? " listing-card--immersive" : ""}`}
      data-category={listing.category}
      onFocusCapture={() => {
        if (immersive) setPhotoActive(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPhotoActive(false);
      }}
    >
      <div
        className={`listing-image listing-photo-frame${photoActive ? " listing-image--active" : ""}`}
        onPointerEnter={(event) => {
          if (immersive && event.pointerType === "mouse") setPhotoActive(true);
        }}
        onPointerLeave={(event) => {
          if (
            !event.currentTarget
              .closest("article")
              ?.contains(document.activeElement)
          )
            setPhotoActive(false);
        }}
      >
        <Link to={`/listings/${listing.id}`} tabIndex={-1} aria-hidden="true">
          <ListingPhoto src={image} alt="" />
        </Link>
        {immersive && photoActive && (
          <Suspense fallback={null}>
            <ParticleScene variant="photo" imageUrl={image} />
          </Suspense>
        )}
        {photos.length > 1 && (
          <div
            className="listing-photo-navigation"
            role="group"
            aria-label={`Фотографии: ${listing.title}`}
          >
            <span className="listing-photo-count">
              <Images size={13} />
              <span aria-live="polite">
                {activeIndex + 1} / {photos.length}
              </span>
            </span>
            <div>
              <button
                type="button"
                aria-label={`Предыдущее фото: ${listing.title}`}
                onClick={() =>
                  setPhotoIndex(
                    (activeIndex - 1 + photos.length) % photos.length,
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={`Следующее фото: ${listing.title}`}
                onClick={() => setPhotoIndex((activeIndex + 1) % photos.length)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          aria-label={saved ? "Убрать из избранного" : "В избранное"}
          aria-pressed={saved}
          aria-busy={busy}
          disabled={busy}
          onClick={toggle}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="listing-body">
        <div className="listing-eyebrow">
          <span className="listing-category">{categoryName}</span>
          {listing.source && (
            <span className="listing-source-label">
              <Send size={12} />
              Telegram
            </span>
          )}
          {!listing.source && listing.providerId.startsWith("demo-") && (
            <span className="listing-demo-label">Демо</span>
          )}
        </div>
        <h3 className="listing-heading">
          <Link className="listing-title" to={`/listings/${listing.id}`}>
            {listing.title}
          </Link>
        </h3>
        <div className="listing-bottom">
          <div>
            {listing.source ? (
              <strong className="source-price">
                {listing.source.priceLabel}
              </strong>
            ) : (
              <>
                <span className="muted small">{t.from} </span>
                <strong>{euro(listing.price)}</strong>
                <span className="muted small"> / {listing.unit}</span>
              </>
            )}
          </div>
        </div>
        <p className="listing-excerpt">{listing.description}</p>
        <div className="listing-location">
          <span>
            <MapPin size={13} />
            {listingCity(listing)}
          </span>
          {listing.source && (
            <time
              dateTime={listing.source.postedAt}
              title={new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "long",
              }).format(new Date(listing.source.postedAt))}
            >
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "short",
              }).format(new Date(listing.source.postedAt))}
            </time>
          )}
        </div>
        {listing.hidden && (
          <span className="listing-moderation-label">Скрыто оператором</span>
        )}
        <div className="provider-line">
          <span className="mini-avatar">{initial}</span>
          <span className="listing-provider-name">{author}</span>
          {!listing.source && listing.providerVerified && (
            <BadgeCheck
              size={14}
              className="green"
              aria-label="Профиль с отметкой"
            />
          )}
          {!listing.source && listing.reviewCount > 0 && (
            <span
              className="listing-provider-rating"
              aria-label={`Рейтинг ${listing.providerRating.toFixed(1)}, отзывов: ${listing.reviewCount}`}
            >
              <Star size={12} fill="currentColor" />
              {listing.providerRating.toFixed(1)}
              <span>({listing.reviewCount})</span>
            </span>
          )}
          {!listing.source && listing.reviewCount === 0 && (
            <span className="listing-no-reviews">Без отзывов</span>
          )}
        </div>
      </div>
      <div className="listing-card-actions">
        <Link
          className="listing-open"
          aria-label={`${t.details}: ${listing.title}`}
          to={`/listings/${listing.id}`}
        >
          {t.details}
          <ArrowUpRight size={16} />
        </Link>
        {onCompare && (
          <button
            className={`compare-choice ${compared ? "is-selected" : ""}`}
            aria-pressed={compared}
            onClick={onCompare}
            aria-label={`${compared ? "Убрать из сравнения" : "Сравнить"}: ${listing.title}`}
          >
            {compared ? <Check size={15} /> : <Columns3 size={15} />}{" "}
            {compared ? "Выбрано" : "Сравнить"}
          </button>
        )}
      </div>
    </article>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function FormError({ message }: { message?: string }) {
  return message ? (
    <div className="form-error" role="alert">
      <CircleAlert size={16} />
      {message}
    </div>
  ) : null;
}
