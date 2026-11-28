import { useUiText } from "./lib";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  ExternalLink,
  EyeOff,
  FileImage,
  Handshake,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Truck,
  UserRound,
} from "lucide-react";
import {
  CATEGORIES,
  CITIES,
  STATUS_LABELS,
  isMarketplaceUser,
  type Incident,
  type Listing,
  type Offer,
  type OrderDetail,
  type OrderStatus,
  type ServiceRequest,
} from "../shared/types";
import { api, date, euro, json, useAuth, useI18n, useToast } from "./lib";
import {
  Empty,
  ErrorState,
  Field,
  FormError,
  ListingCard,
  Loading,
  Modal,
} from "./components/ui";
import type { CreateAction } from "./App";
import { useMarket } from "./market-state";
import { OrderProgress } from "./components/OrderProgress";
import { BrandIllustration } from "./components/BrandIllustration";
import { getOrderAction } from "./order-state";
import { ReportButton, type ReportTarget } from "./components/ReportButton";
import { ListingGallery } from "./components/ListingGallery";
import { ListingConversationForm } from "./components/ListingConversationForm";
import { listingAuthor, listingCity } from "./listing-format";
import { useListingFavorite } from "./listing-favorite";
import { categoryName, cityName } from "./market-copy";

function LoginRequired({ onLogin }: { onLogin: () => void }) {
  const tr = useUiText();
  return (
    <Empty
      title={tr("Ваши дела — в одном месте")}
      description={tr(
        "Войдите, чтобы создавать заявки, договариваться и следить за заказами.",
      )}
    >
      <button className="button primary" onClick={onLogin}>
        <UserRound size={17} />
        {tr("Войти в аккаунт")}
      </button>
    </Empty>
  );
}
export function RequestCard({
  item,
  showStatus = false,
}: {
  item: ServiceRequest;
  showStatus?: boolean;
}) {
  const tr = useUiText();
  const { language } = useI18n();
  return (
    <Link className="request-card" to={`/requests/${item.id}`}>
      <div
        className={`request-category-icon ${item.kind === "delivery" ? "blue-bg" : ""}`}
      >
        {item.kind === "delivery" ? (
          <Package size={22} />
        ) : (
          <MessageCircle size={22} />
        )}
      </div>
      <div className="request-card-content">
        <div className="request-meta">
          <span>
            <MapPin size={12} />
            {cityName(item.city, language)}
          </span>
          <span>
            {item.kind === "delivery"
              ? tr("Доставка")
              : categoryName(item.category, language)}
          </span>
          {showStatus && (
            <span className={`request-state request-state-${item.status}`}>
              {item.status === "open"
                ? tr("Открыта")
                : item.status === "assigned"
                  ? tr("Исполнитель выбран")
                  : tr("Закрыта")}
            </span>
          )}
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="request-card-footer">
          <span className="provider-line">
            <span className="mini-avatar">{item.customerName[0]}</span>
            {item.customerName}
          </span>
          <span>
            <MessageCircle size={13} />
            {item.offerCount} {tr("откликов")}
          </span>
        </div>
      </div>
      <div className="request-price">
        <strong>{item.budget ? euro(item.budget) : tr("Обсудим")}</strong>
        <span>{item.budget ? tr("бюджет") : tr("стоимость")}</span>
        <ArrowUpRight size={20} />
      </div>
    </Link>
  );
}

export function RequestsPage({
  city,
  setCity,
  create,
  deliveryEnabled,
}: {
  city: string;
  setCity: (value: string) => void;
  create: CreateAction;
  deliveryEnabled: boolean;
}) {
  const tr = useUiText();
  const { language } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").slice(0, 200);
  const [search, setSearch] = useState(q);
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("");
  useEffect(() => setSearch(q), [q]);
  const query = new URLSearchParams({
    city,
    category,
    ...(q ? { q } : {}),
    ...(kind ? { kind } : {}),
  });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["requests", city, category, kind, q],
    queryFn: () => api<{ items: ServiceRequest[] }>(`/requests?${query}`),
  });
  return (
    <div className="page-shell">
      <div className="page-heading heading-with-action">
        <div>
          <span className="section-kicker">
            {tr("ПОМОЩЬ НАЧИНАЕТСЯ С ЗАПРОСА")}
          </span>
          <h1>
            {tr("Ищу исполнителя")}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {tr(
              "У кого-то есть задача. У кого-то — свободное время и нужный навык.",
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          <Plus size={18} />
          {tr("Создать заявку")}
        </button>
      </div>
      <form
        role="search"
        className="request-search"
        onSubmit={(event) => {
          event.preventDefault();
          setParams(search.trim() ? { q: search.trim() } : {}, {
            preventScrollReset: true,
          });
        }}
      >
        <label>
          <Search size={18} aria-hidden="true" />
          <span className="visually-hidden">{tr("Поиск по заявкам")}</span>
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Поиск по заявкам")}
          />
        </label>
        <button className="button primary" type="submit">
          {tr("Найти")}
        </button>
      </form>
      <div className="filter-bar">
        {deliveryEnabled && (
          <div className="pill-tabs">
            {[
              ["", tr("Все заявки")],
              ["service", tr("Услуги")],
              ["delivery", tr("Доставка")],
            ].map(([value, label]) => (
              <button
                className={kind === value ? "active" : ""}
                aria-pressed={kind === value}
                key={value}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div
          className="filter-bar-selects"
          role="group"
          aria-label={tr("Фильтры заявок")}
        >
          <select
            aria-label={tr("Категория заявок")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c.id, language)}
              </option>
            ))}
          </select>
          <select
            aria-label={tr("Город заявок")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {cityName(c, language)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="two-column-page">
        <section className="request-list">
          {isPending ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} retry={refetch} />
          ) : data?.items.length ? (
            data.items.map((item) => <RequestCard key={item.id} item={item} />)
          ) : (
            <Empty
              title={tr("Пока тихо")}
              description={
                q
                  ? tr(
                      "Попробуйте другой поисковый запрос или измените фильтры.",
                    )
                  : tr(
                      "Создайте первую заявку в этой категории — пусть нужные люди вас найдут.",
                    )
              }
            >
              <button
                className="button primary"
                onClick={() => create("request")}
              >
                {tr("Создать заявку")}
              </button>
            </Empty>
          )}
        </section>
        <aside className="help-card">
          <span className="help-card-icon">
            <Handshake size={29} />
          </span>
          <h3>
            {tr("Хорошие дела")}
            <br />
            {tr("находят своих людей.")}
          </h3>
          <p>
            {tr(
              "Опишите задачу, сравните отклики и выберите человека, которому доверяете.",
            )}
          </p>
          <div className="help-divider" />
          <span>
            <Check size={15} />
            {tr("Цена до начала работы")}
          </span>
          <span>
            <Check size={15} />
            {tr("Контакты после выбора")}
          </span>
          <span>
            <Check size={15} />
            {tr("Помощь при споре")}
          </span>
        </aside>
      </div>
    </div>
  );
}

export function RequestPage({ requireLogin }: { requireLogin: () => void }) {
  const tr = useUiText();
  const { language } = useI18n();
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["request", id, user?.id],
    queryFn: () =>
      api<{ item: ServiceRequest; offers: Offer[] }>(`/requests/${id}`),
  });
  const offer = useMutation({
    mutationFn: (f: FormData) =>
      api(`/requests/${id}/offers`, {
        method: "POST",
        body: json({ ...Object.fromEntries(f), price: Number(f.get("price")) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["request", id] });
      toast(tr("Отклик отправлен. Заказчик получил уведомление."));
    },
  });
  const accept = useMutation({
    mutationFn: (offerId: string) =>
      api<{ id: string }>(`/offers/${offerId}/accept`, {
        method: "POST",
        body: json({}),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      navigate(`/orders/${r.id}`);
      toast(tr("Исполнитель выбран. Условия сохранены в заказе."));
    },
  });
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  const { item, offers } = data;
  const owner = user?.id === item.customerId;
  const already = offers.some((o) => o.providerId === user?.id);
  return (
    <div className="page-shell">
      <Link className="back-link" to="/requests">
        <ArrowLeft size={16} />
        {tr("Все заявки")}
      </Link>
      <div className="detail-layout">
        <div>
          <span
            className={`status-pill ${item.status === "open" ? "green-pill" : ""}`}
          >
            {item.status === "open"
              ? tr("Ищет исполнителя")
              : item.status === "assigned"
                ? tr("Исполнитель выбран")
                : tr("Заявка закрыта")}
          </span>
          <h1 className="detail-title">{item.title}</h1>
          <div className="detail-meta">
            <span>
              <MapPin size={15} />
              {cityName(item.city, language)}
            </span>
            <span>
              <Clock3 size={15} />
              {date(item.createdAt)}
            </span>
            <span>
              <UserRound size={15} />
              {item.customerName}
            </span>
          </div>
          <section className="content-card">
            <h2>{tr("О задаче")}</h2>
            <p className="preserve-lines">{item.description}</p>
            {item.kind === "delivery" && (
              <div className="delivery-details">
                <span>
                  <Package size={17} />
                  {tr("Отправление:")} {item.origin}
                </span>
                {item.productUrl && (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {tr("Посмотреть товар")}
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}
          </section>
          <section className="content-card">
            <h2>
              {owner ? tr("Отклики исполнителей") : tr("Отклики")}{" "}
              <span className="count-badge">{item.offerCount}</span>
            </h2>
            {!user ? (
              <p className="muted">
                {tr("Войдите, чтобы откликнуться или увидеть свой отклик.")}
              </p>
            ) : !owner && user.role !== "arbiter" ? (
              <p className="muted small">
                {tr(
                  "Вам видны только ваши отклики. Полный список доступен автору заявки.",
                )}
              </p>
            ) : null}
            {offers.length ? (
              offers.map((o) => (
                <div className="offer-card" key={o.id}>
                  <div className="offer-top">
                    <span className="large-avatar">{o.providerName[0]}</span>
                    <div>
                      <strong>{o.providerName}</strong>
                      <span className="offer-rating">
                        <Star size={12} fill="currentColor" />
                        {o.providerRating.toFixed(1)}
                        <span>{tr("Исполнитель")}</span>
                      </span>
                    </div>
                    <strong className="offer-price">{euro(o.price)}</strong>
                  </div>
                  <p>{o.message}</p>
                  <span className="offer-eta">
                    <Clock3 size={14} />
                    {o.eta}
                  </span>
                  {owner && item.status === "open" && (
                    <button
                      className="button primary"
                      disabled={accept.isPending}
                      onClick={() => accept.mutate(o.id)}
                    >
                      {tr("Выбрать за")} {euro(o.price)}
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="muted padded">
                {owner
                  ? tr("Первые отклики появятся здесь. Мы уведомим вас.")
                  : tr("Пока нет доступных откликов.")}
              </div>
            )}
            <FormError message={accept.error?.message} />
          </section>
        </div>
        <aside className="sticky-aside">
          <div className="content-card">
            <span className="section-kicker">{tr("БЮДЖЕТ ЗАКАЗЧИКА")}</span>
            <div className="big-price">
              {item.budget ? euro(item.budget) : tr("Обсудим")}
            </div>
            <p className="muted small">
              {tr(
                "Итоговая цена фиксируется при выборе отклика. Оплата — при личной встрече.",
              )}
            </p>
            {!user ? (
              <button className="button primary full" onClick={requireLogin}>
                {tr("Войти и откликнуться")}
                <ArrowRight size={16} />
              </button>
            ) : isMarketplaceUser(user.role) &&
              !owner &&
              item.status === "open" &&
              !already ? (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  offer.mutate(new FormData(e.currentTarget));
                }}
              >
                <h3>{tr("Поможете с задачей?")}</h3>
                <Field label={tr("Ваша цена, €")}>
                  <input
                    type="number"
                    name="price"
                    required
                    min={1}
                    max={1000000}
                    step="0.01"
                    placeholder={tr("Итоговая стоимость")}
                  />
                </Field>
                <Field label={tr("Когда сможете")}>
                  <input
                    name="eta"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder={tr("Например, завтра после 14:00")}
                  />
                </Field>
                <Field label={tr("Сообщение")}>
                  <textarea
                    name="message"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    placeholder={tr("Как поможете, что входит в цену…")}
                  />
                </Field>
                <FormError message={offer.error?.message} />
                <button
                  className="button primary full"
                  disabled={offer.isPending}
                >
                  {offer.isPending ? tr("Отправляем…") : tr("Отправить отклик")}
                  <Send size={16} />
                </button>
              </form>
            ) : (
              <div className="form-note">
                <ShieldCheck size={20} />
                <p>
                  {owner
                    ? tr("Сравните предложения и выберите подходящее.")
                    : already
                      ? tr("Ваш отклик отправлен. Ждём решения заказчика.")
                      : isMarketplaceUser(user.role)
                        ? tr("По заявке уже выбран исполнитель.")
                        : tr("Откликаться могут аккаунты исполнителей.")}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ListingPage({
  authorize,
  report,
}: {
  authorize: (action: () => void) => void;
  report: (target: ReportTarget) => void;
}) {
  const { id } = useParams();
  const { user } = useAuth();
  const market = useMarket();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["listing", id, user?.id],
    queryFn: () => api<{ item: Listing }>(`/listings/${id}`),
  });
  useEffect(() => {
    if (data?.item && !data.item.hidden && !data.item.ownerBlocked)
      market.remember(data.item);
  }, [data?.item]);
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  return (
    <ListingDetail listing={data.item} authorize={authorize} report={report} />
  );
}

function ListingDetail({
  listing,
  authorize,
  report,
}: {
  listing: Listing;
  authorize: (action: () => void) => void;
  report: (target: ReportTarget) => void;
}) {
  const tr = useUiText();
  const { user } = useAuth();
  const toast = useToast();
  const { language, t } = useI18n();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [shareUrl, setShareUrl] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const from =
    typeof state?.from === "string" &&
    /^\/(?:favorites|dashboard|operator|order-help|providers\/[^/?#]+|listings\/[^/?#]+)?(?:[?#]|$)/.test(
      state.from,
    )
      ? state.from
      : null;
  const fromSimilarListing = from?.startsWith("/listings/");
  const favorite = useListingFavorite(listing);
  const source = listing.source;
  const author = listingAuthor(listing);
  const category = categoryName(listing.category, language);
  const contact = listing.publicContact;
  const price = source ? tr(source.priceLabel) : euro(listing.price);
  const tags = listing.tags.filter((tag) => !source || tag !== "Из Telegram");
  const visible = !listing.hidden && !listing.ownerBlocked;
  const favoriteProps = {
    "aria-pressed": favorite.saved,
    "aria-label": favorite.saved
      ? tr("Убрать из избранного")
      : tr("В избранное"),
    "aria-busy": favorite.busy,
    disabled: favorite.busy,
    onClick: favorite.toggle,
  };
  const priceClass = `listing-detail-price${source && !source.priceKnown ? " is-text" : ""}`;
  const priceContent = (
    <>
      {price}
      {!source && <small> / {tr(listing.unit)}</small>}
    </>
  );
  async function shareListing() {
    const url = new URL(
      `/listings/${encodeURIComponent(listing.id)}`,
      window.location.origin,
    ).href;
    try {
      if (navigator.share) await navigator.share({ title: listing.title, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast(t.linkCopied, "success");
      } else setShareUrl(url);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setShareUrl(url);
    }
  }
  return (
    <div className="page-shell listing-detail-page">
      <div className="listing-detail-toolbar">
        <Link
          className="back-link listing-detail-back"
          to={from ?? "/"}
          state={from && { restoreListing: listing.id }}
          replace={!!from}
          onClick={(event) => {
            if (
              !fromSimilarListing ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.shiftKey
            )
              return;
            event.preventDefault();
            navigate(-1);
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />{" "}
          {from?.startsWith("/favorites")
            ? t.backToSaved
            : fromSimilarListing
              ? t.listingBack
              : from
                ? t.backToList
                : t.all}
        </Link>
        {visible && (
          <div className="listing-detail-quick-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t.shareListing}
              onClick={shareListing}
            >
              <Share2 size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button listing-detail-save"
              {...favoriteProps}
            >
              <Heart
                size={21}
                fill={favorite.saved ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
      <header className="listing-detail-heading">
        <p className={`${priceClass} mobile-listing-detail-price`}>
          {priceContent}
        </p>
        <p className="listing-detail-kicker">
          {category ?? tr("Местное предложение")}
        </p>
        <h1>{listing.title}</h1>
        <div className="listing-detail-meta">
          <span>
            <MapPin size={15} />
            {cityName(listingCity(listing, t.searchCityUnknown), language)}
          </span>
          {source ? (
            <span className="listing-detail-source">
              <Send size={14} />
              Telegram
            </span>
          ) : (
            listing.reviewCount > 0 && (
              <span>
                <Star size={14} fill="currentColor" />
                {listing.providerRating.toFixed(1)} · {listing.reviewCount}{" "}
                {tr("оценок")}
              </span>
            )
          )}
          <time dateTime={listing.createdAt}>
            <Clock3 size={14} />
            {date(listing.createdAt)}
          </time>
          {!source && listing.providerId.startsWith("demo-") && (
            <span className="listing-demo-label">{t.demoLabel}</span>
          )}
        </div>
      </header>
      {listing.hidden && (
        <p className="listing-moderation-notice">
          <EyeOff size={17} />
          {tr("Скрыто оператором:")} {listing.moderationReason}
        </p>
      )}
      {listing.ownerBlocked && (
        <p className="listing-moderation-notice">
          {tr("Автор заблокирован. Предложение недоступно в каталоге.")}
        </p>
      )}
      <div className="listing-detail-layout">
        <ListingGallery key={listing.id} listing={listing} />
        <aside
          className="listing-detail-panel"
          aria-label={tr("Цена и связь с автором")}
        >
          <p className="listing-detail-price-label">
            {source ? tr("Условия автора") : tr("Стоимость от")}
          </p>
          <p className={priceClass}>{priceContent}</p>
          <div className="listing-detail-actions">
            <div className="listing-primary-action">
              <strong className="listing-action-price">{price}</strong>
              {source ? (
                <a
                  className="button primary full"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.openTelegram} <ExternalLink size={17} />
                </a>
              ) : visible && user?.id !== listing.providerId ? (
                <button
                  className="button primary full"
                  onClick={() => authorize(() => setMessageOpen(true))}
                >
                  {tr("Написать автору")} <MessageCircle size={17} />
                </button>
              ) : null}
            </div>
            {contact && (
              <div
                id="listing-contacts"
                className="listing-messenger-links"
                tabIndex={-1}
                aria-label={t.contactSeller}
              >
                {contact.viber && (
                  <a
                    className="button secondary"
                    href={`viber://chat?number=${encodeURIComponent(contact.viber)}`}
                  >
                    <MessageCircle size={17} /> Viber
                    <span>{contact.viber}</span>
                  </a>
                )}
                {contact.telegram && (
                  <a
                    className="button secondary"
                    href={`https://t.me/${contact.telegram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send size={17} /> Telegram
                  </a>
                )}
              </div>
            )}
            {visible && (
              <button
                className="button secondary full listing-detail-save"
                type="button"
                {...favoriteProps}
              >
                <Heart
                  size={17}
                  fill={favorite.saved ? "currentColor" : "none"}
                />
                {favorite.saved ? tr("В избранном") : tr("В избранное")}
              </button>
            )}
          </div>
          <div className="listing-detail-author">
            <span className="listing-detail-avatar" aria-hidden="true">
              {[...author].find((character) =>
                /[\p{L}\p{N}]/u.test(character),
              ) ?? "·"}
            </span>
            <div>
              <strong>
                {source || !visible ? (
                  author
                ) : (
                  <Link to={`/providers/${listing.providerId}`}>{author}</Link>
                )}
                {!source && listing.providerVerified && (
                  <BadgeCheck
                    size={17}
                    className="green"
                    aria-label={tr("Профиль с отметкой")}
                  />
                )}
              </strong>
              <span>
                {source
                  ? tr("Автор объявления в Telegram")
                  : tr("Местный исполнитель")}
              </span>
            </div>
          </div>
          {!source && listing.providerBio && (
            <p className="listing-provider-bio preserve-lines">
              {listing.providerBio}
            </p>
          )}
          {!contact && (
            <p className="listing-detail-hint">
              {source
                ? tr(
                    "Наличие и условия можно уточнить у автора в оригинальной публикации.",
                  )
                : tr(
                    "Уточните наличие, цену или детали услуги в личном диалоге.",
                  )}
            </p>
          )}
          {!source && (
            <ReportButton
              targetType="user"
              targetId={listing.providerId}
              targetLabel={listing.providerName}
              ownerId={listing.providerId}
              onReport={report}
            />
          )}
        </aside>
        <section className="listing-detail-description">
          <h2>{source ? tr("Описание объявления") : tr("Чем могу помочь")}</h2>
          <p className="preserve-lines">{listing.description}</p>
          {!!tags.length && (
            <div className="tag-list">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          {source && (
            <div className="listing-detail-provenance">
              <Send size={17} />
              <div>
                <span>
                  {tr("Публикация в @")}
                  {source.channel}
                </span>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {tr("Оригинал объявления")} <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}
          <div className="listing-detail-support">
            <ReportButton
              targetType="listing"
              targetId={listing.id}
              targetLabel={listing.title}
              ownerId={listing.providerId}
              onReport={report}
            />
            {user?.isOperator && (
              <Link
                className="quiet-link"
                to={
                  "/operator?tab=listings&q=" + encodeURIComponent(listing.id)
                }
              >
                {tr("Модерация предложения")} <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </section>
      </div>
      {visible && <SimilarListings listing={listing} />}
      {messageOpen && (
        <ListingConversationForm
          listing={listing}
          onClose={() => setMessageOpen(false)}
        />
      )}
      {shareUrl && (
        <Modal title={t.shareListing} onClose={() => setShareUrl("")}>
          <Field label={t.listingLink}>
            <input
              value={shareUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}

const mobileListingQuery = "(max-width: 760px)";
const isMobileListing = () => window.matchMedia(mobileListingQuery).matches;
function subscribeMobileListing(onChange: () => void) {
  const query = window.matchMedia(mobileListingQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function SimilarListings({ listing }: { listing: Listing }) {
  const { t } = useI18n();
  const mobile = useSyncExternalStore(subscribeMobileListing, isMobileListing);
  const { data } = useQuery({
    queryKey: ["similar-listings", listing.category],
    queryFn: () =>
      api<{ items: Listing[] }>(
        `/listings?${new URLSearchParams({ category: listing.category, limit: "5" })}`,
      ),
    enabled: mobile,
  });
  if (!mobile) return null;
  const items = data?.items
    .filter((item) => item.id !== listing.id)
    .slice(0, 4);
  if (!items?.length) return null;
  return (
    <section
      className="listing-detail-related"
      aria-labelledby="listing-related-title"
    >
      <h2 id="listing-related-title">{t.similarListings}</h2>
      <div className="listing-detail-related-grid">
        {items.map((item) => (
          <ListingCard key={item.id} listing={item} />
        ))}
      </div>
    </section>
  );
}

export function OrderPage({ requireLogin }: { requireLogin: () => void }) {
  const tr = useUiText();
  const { language } = useI18n();
  const { id } = useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["order", id, user?.id],
    queryFn: () => api<OrderDetail>(`/orders/${id}`),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const status = useMutation({
    mutationFn: (newStatus: OrderStatus) =>
      api(`/orders/${id}/status`, {
        method: "PATCH",
        body: json({ status: newStatus }),
      }),
    onSuccess: () => {
      refresh();
      toast(tr("Статус заказа обновлён"));
    },
  });
  const send = useMutation({
    mutationFn: () =>
      api(`/orders/${id}/messages`, {
        method: "POST",
        body: json({ text: message }),
      }),
    onSuccess: () => {
      setMessage("");
      refresh();
    },
  });
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <div className="page-shell">
        <LoginRequired onLogin={requireLogin} />
      </div>
    );
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  const { order, events, messages, incident } = data;
  const owner = order.customerId === user.id;
  const action = getOrderAction(order, user.id);
  return (
    <div className="page-shell">
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} />
        {tr("Все заказы")}
      </Link>
      <div className="page-heading">
        <span className="section-kicker">
          {tr("ЗАКАЗ #")}
          {order.id.slice(0, 8).toUpperCase()}
        </span>
        <h1 className="order-title">{order.title}</h1>
        <div className="detail-meta">
          <span className={`status-pill status-${order.status}`}>
            {tr(STATUS_LABELS[order.status])}
          </span>
          <span>
            <MapPin size={15} />
            {cityName(order.city, language)}
          </span>
          <span>
            {tr("Обновлён")} {date(order.updatedAt)}
          </span>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <section className="content-card">
            <div className="card-section-header">
              <h2>
                {order.kind === "delivery"
                  ? tr("Путь вашей посылки")
                  : tr("История заказа")}
              </h2>
              {order.kind === "delivery" && (
                <Truck size={23} className="muted" />
              )}
            </div>
            <OrderProgress order={order} />
            <div className="timeline">
              {events.map((event, i) => (
                <div
                  className={`timeline-item ${i === events.length - 1 ? "current" : ""}`}
                  key={event.id}
                >
                  <span className="timeline-marker">
                    {i === events.length - 1 ? <span /> : <Check size={12} />}
                  </span>
                  <div>
                    <span className="muted small">{date(event.createdAt)}</span>
                    <h3>{tr(STATUS_LABELS[event.status])}</h3>
                    <p>{event.note}</p>
                  </div>
                </div>
              ))}
            </div>
            {action && (
              <button
                className="button primary"
                disabled={status.isPending}
                onClick={() => status.mutate(action.status)}
              >
                {status.isPending ? tr("Сохраняем…") : action.label}
                <Check size={17} />
              </button>
            )}
            <FormError message={status.error?.message} />
          </section>
          {incident && (
            <section className="content-card incident-card">
              <span
                className={`status-pill ${incident.status === "open" ? "status-disputed" : "green-pill"}`}
              >
                <ShieldCheck size={13} />
                {incident.status === "open"
                  ? tr("Арбитр разбирается")
                  : tr("Решение принято")}
              </span>
              <h2>{tr("Проблема с заказом")}</h2>
              <p className="preserve-lines">{incident.description}</p>
              {incident.evidence && (
                <a
                  className="evidence-link"
                  href={`/api/incidents/${incident.id}/evidence`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileImage size={17} />
                  {tr("Фото к претензии")}
                  <ExternalLink size={13} />
                </a>
              )}
              {incident.status === "closed" && (
                <div className="resolution">
                  <strong>
                    {incident.decision === "refund"
                      ? tr("Полный возврат")
                      : incident.decision === "partial"
                        ? tr("Частичный возврат")
                        : tr("Жалоба отклонена")}
                  </strong>
                  <p>{incident.resolution}</p>
                  <span>
                    {tr("Сумма возврата:")} {euro(incident.refundAmount)}
                  </span>
                  <small>{tr("Возврат выполняется сторонами напрямую.")}</small>
                </div>
              )}
              {user.role === "arbiter" && incident.status === "open" && (
                <ResolveForm
                  incident={incident}
                  price={order.price}
                  onSuccess={refresh}
                />
              )}
            </section>
          )}
          <section className="content-card">
            <div className="card-section-header">
              <h2>{tr("Диалог по заказу")}</h2>
              <MessageCircle size={21} className="muted" />
            </div>
            <p className="muted small">
              {tr(
                "Договорённости сохраняются здесь. При споре их увидит арбитр.",
              )}
            </p>
            <div
              className="messages"
              role="log"
              aria-label={tr("Сообщения по заказу")}
            >
              {messages.length ? (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message ${m.authorId === user.id ? "own" : ""}`}
                  >
                    <strong>{m.authorName}</strong>
                    <p>{m.text}</p>
                    <small>{date(m.createdAt)}</small>
                  </div>
                ))
              ) : (
                <div className="conversation-empty">
                  <BrandIllustration kind="conversation" />
                  <p>{tr("Поздоровайтесь и уточните детали.")}</p>
                </div>
              )}
            </div>
            <form
              className="message-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) send.mutate();
              }}
            >
              <input
                aria-label={tr("Сообщение")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                required
                placeholder={tr("Напишите сообщение…")}
              />
              <button
                className="button primary"
                aria-label={tr("Отправить сообщение")}
                disabled={send.isPending || !message.trim()}
              >
                <Send size={17} />
              </button>
            </form>
            <FormError message={send.error?.message} />
          </section>
        </div>
        <aside className="sticky-aside">
          <section className="content-card">
            <span className="section-kicker">
              {tr("СОГЛАСОВАННАЯ СТОИМОСТЬ")}
            </span>
            <div className="big-price">{euro(order.price)}</div>
            <div className="payment-note">
              <Handshake size={18} />
              <span>{tr("Наличными при личной встрече")}</span>
            </div>
            <div className="price-divider" />
            <h3>{tr("Ваши контакты")}</h3>
            <div className="contact-block">
              <span className="mini-avatar">{order.providerName[0]}</span>
              <div>
                <strong>{order.providerName}</strong>
                <span>{tr("Исполнитель")}</span>
                <p>{order.providerContact}</p>
              </div>
            </div>
            <div className="contact-block">
              <span className="mini-avatar">{order.customerName[0]}</span>
              <div>
                <strong>{order.customerName}</strong>
                <span>{tr("Заказчик")}</span>
                <p>{order.customerContact}</p>
              </div>
            </div>
            {owner &&
              !incident &&
              !["resolved", "disputed"].includes(order.status) && (
                <button
                  className="button danger-outline full"
                  onClick={() => setIncidentOpen(true)}
                >
                  <CircleAlert size={16} />
                  {tr("Проблема с заказом")}
                </button>
              )}
            <p className="muted small">
              {tr("Контакты видны только участникам заказа и арбитру.")}
            </p>
          </section>
          <div className="aside-care">
            <ShieldCheck size={23} />
            <p>{tr("Если что-то пошло не так, мы поможем разобраться.")}</p>
          </div>
        </aside>
      </div>
      {incidentOpen && (
        <IncidentModal
          orderId={order.id}
          onClose={() => setIncidentOpen(false)}
          onSuccess={() => {
            setIncidentOpen(false);
            refresh();
            toast(
              tr("Спор открыт. Арбитр и исполнитель получили уведомления."),
            );
          }}
        />
      )}
    </div>
  );
}

function IncidentModal({
  orderId,
  onClose,
  onSuccess,
}: {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const tr = useUiText();
  const mutation = useMutation({
    mutationFn: (body: FormData) =>
      api(`/orders/${orderId}/incident`, { method: "POST", body }),
    onSuccess,
  });
  return (
    <Modal title={tr("Поможем разобраться")} onClose={onClose}>
      <p className="modal-description">
        {tr(
          "Опишите, что произошло. Исполнитель и арбитр получат уведомление, а заказ перейдёт в статус «Открыт спор».",
        )}
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(new FormData(e.currentTarget));
        }}
      >
        <Field label={tr("Что пошло не так")}>
          <textarea
            name="description"
            required
            minLength={15}
            maxLength={5000}
            rows={5}
            placeholder={tr(
              "Что ожидали получить, что получили, как хотели бы решить вопрос…",
            )}
          />
        </Field>
        <Field
          label={tr("Фото, если есть")}
          hint={tr(
            "JPG, PNG или WebP, до 5 МБ. Видно только участникам и арбитру.",
          )}
        >
          <input
            name="evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </Field>
        <FormError message={mutation.error?.message} />
        <button className="button primary full" disabled={mutation.isPending}>
          {mutation.isPending ? tr("Отправляем…") : tr("Открыть спор")}
          <ShieldCheck size={17} />
        </button>
      </form>
    </Modal>
  );
}

function ResolveForm({
  incident,
  price,
  onSuccess,
}: {
  incident: Incident;
  price: number;
  onSuccess: () => void;
}) {
  const tr = useUiText();
  const [decision, setDecision] = useState("refund");
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (f: FormData) =>
      api(`/incidents/${incident.id}/resolve`, {
        method: "POST",
        body: json({
          ...Object.fromEntries(f),
          decision,
          refundAmount:
            decision === "refund"
              ? price
              : decision === "rejected"
                ? 0
                : Number(f.get("refundAmount")),
        }),
      }),
    onSuccess: () => {
      onSuccess();
      toast(tr("Решение зафиксировано, стороны уведомлены."));
    },
  });
  return (
    <form
      className="form-stack resolve-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(new FormData(e.currentTarget));
      }}
    >
      <h3>{tr("Решение арбитра")}</h3>
      <Field label={tr("Результат")}>
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="refund">{tr("Полный возврат")}</option>
          <option value="partial">{tr("Частичный возврат")}</option>
          <option value="rejected">{tr("Отклонить жалобу")}</option>
        </select>
      </Field>
      {decision === "partial" && (
        <Field label={tr("Сумма возврата, €")}>
          <input
            name="refundAmount"
            type="number"
            min={0.01}
            max={price - 0.01}
            step="0.01"
            required
          />
        </Field>
      )}
      <Field label={tr("Комментарий к решению")}>
        <textarea
          name="resolution"
          minLength={15}
          maxLength={3000}
          rows={3}
          required
          placeholder={tr(
            "На основании чего принято решение и что должны сделать стороны…",
          )}
        />
      </Field>
      <Field label={tr("Ответственная сторона")}>
        <select name="guilty">
          <option value="none">{tr("Рейтинг не меняется")}</option>
          <option value="provider">{tr("Исполнитель · рейтинг −0,2")}</option>
          <option value="customer">{tr("Заказчик · рейтинг −0,2")}</option>
        </select>
      </Field>
      <p className="muted small">
        {tr(
          "Решение закрывает спор. Перевод средств стороны выполняют самостоятельно.",
        )}
      </p>
      <FormError message={mutation.error?.message} />
      <button className="button dark" disabled={mutation.isPending}>
        {tr("Зафиксировать решение")}
        <CheckCheck size={17} />
      </button>
    </form>
  );
}
