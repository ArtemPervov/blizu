import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  LoaderCircle,
  CircleAlert,
  SearchX,
  ArrowUpRight,
  MapPin,
  Star,
  Heart,
  BadgeCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Listing } from "../../shared/types";
import { api, json, euro, useAuth, useI18n, useToast } from "../lib";

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
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state-message empty">
      <div className="empty-icon">
        <SearchX size={28} />
      </div>
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
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
      className="modal"
      ref={ref}
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
          <h2>{title}</h2>
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
export function ListingCard({ listing }: { listing: Listing }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: () => api<{ ids: string[] }>("/favorites"),
    enabled: !!user,
  });
  const saved = data?.ids.includes(listing.id) ?? false;
  const mutation = useMutation({
    mutationFn: () =>
      api(`/favorites/${listing.id}`, {
        method: "PUT",
        body: json({ saved: !saved }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast(saved ? "Убрали из избранного" : "Сохранили в избранное");
    },
    onError: (e) => toast(e.message),
  });
  return (
    <article className="listing-card">
      <div className="listing-image">
        <Link to={`/listings/${listing.id}`} tabIndex={-1} aria-hidden="true">
          <img
            src={listing.image || "/images/home.jpg"}
            alt=""
            loading="lazy"
          />
        </Link>
        <span className="image-tag">
          {listing.tags[0] || "Местное предложение"}
        </span>
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          aria-label={saved ? "Убрать из избранного" : "В избранное"}
          aria-pressed={saved}
          disabled={mutation.isPending}
          onClick={() => {
            if (!user) {
              toast("Войдите, чтобы сохранять предложения");
              return;
            }
            mutation.mutate();
          }}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="listing-body">
        <div className="listing-location">
          <MapPin size={12} />
          {listing.city}
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {listing.providerRating.toFixed(1)}
            <span>({listing.reviewCount})</span>
          </span>
        </div>
        <Link className="listing-title" to={`/listings/${listing.id}`}>
          {listing.title}
        </Link>
        <div className="provider-line">
          <span className="mini-avatar">
            {listing.providerName.slice(0, 1)}
          </span>
          {listing.providerName}
          {listing.providerVerified && (
            <BadgeCheck size={14} className="green" />
          )}
        </div>
        <div className="listing-bottom">
          <div>
            <span className="muted small">{t.from} </span>
            <strong>{euro(listing.price)}</strong>
            <span className="muted small"> / {listing.unit}</span>
          </div>
          <Link
            className="card-arrow"
            aria-label={`${t.details}: ${listing.title}`}
            to={`/listings/${listing.id}`}
          >
            <ArrowUpRight size={19} />
          </Link>
        </div>
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
