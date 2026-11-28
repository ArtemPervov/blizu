import { useUiText } from "./lib";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Package, Plus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { Listing } from "../shared/types";
import type { CreateAction } from "./App";
import { Empty, ErrorState, ListingCard, Loading } from "./components/ui";
import { api, useI18n } from "./lib";
import { cityName } from "./market-copy";

export function OrderHelpPage({ create }: { create: CreateAction }) {
  const tr = useUiText();
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["listings", "order-help"],
    queryFn: ({ signal }) =>
      api<{ items: Listing[] }>("/listings?category=delivery&limit=100", {
        signal,
      }),
  });
  return (
    <div className="page-shell">
      <div className="page-heading heading-with-action">
        <div>
          <h1>
            {t.orderHelp}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {tr(
              "Найдите человека, который поможет оформить заказ или разобраться с получением покупки.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => create("request", { category: "delivery" })}
        >
          <Plus size={18} /> {t.newRequest}
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data.items.length ? (
        <div className="listing-grid">
          {query.data.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <Empty
          title={tr("Пока нет предложений")}
          description={tr(
            "Опишите, с каким заказом нужна помощь. На заявку смогут откликнуться исполнители.",
          )}
          illustration="route"
        />
      )}
    </div>
  );
}

type Provider = {
  id: string;
  name: string;
  city: string;
  verified: boolean;
  bio: string;
};

export function PublicProviderPage() {
  const tr = useUiText();
  const { id } = useParams();
  const { language, t } = useI18n();
  const query = useQuery({
    queryKey: ["provider", id],
    queryFn: ({ signal }) =>
      api<{ provider: Provider; items: Listing[] }>(`/providers/${id}`, {
        signal,
      }),
  });
  return (
    <div className="page-shell">
      <Link to="/" className="back-link">
        {t.backToList}
      </Link>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <>
          <section className="public-provider-head glass-panel">
            <span className="profile-monogram" aria-hidden="true">
              {query.data.provider.name[0]}
            </span>
            <div>
              <h1>
                {query.data.provider.name}
                {query.data.provider.verified && (
                  <BadgeCheck size={22} aria-label={tr("Профиль с отметкой")} />
                )}
              </h1>
              <p>
                <MapPin size={15} />{" "}
                {cityName(query.data.provider.city, language)}
              </p>
              {query.data.provider.bio && (
                <p className="preserve-lines">{query.data.provider.bio}</p>
              )}
            </div>
          </section>
          <h2 className="public-provider-list-title">
            <Package size={20} /> {tr("Объявления автора")}
          </h2>
          {query.data.items.length ? (
            <div className="listing-grid">
              {query.data.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <Empty
              title={tr("Пока нет объявлений")}
              description={tr("Здесь будут видны активные предложения автора.")}
            />
          )}
        </>
      )}
    </div>
  );
}
