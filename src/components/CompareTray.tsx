import { useUiText } from "../lib";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Columns3, Star, X } from "lucide-react";
import { useMarket } from "../market-state";
import { CATEGORIES } from "../../shared/types";
import { Empty, ErrorState, Loading, Modal } from "./ui";
import { useAvailableListings } from "../available-listings";
import { listingPrice, listingAuthor, listingCity } from "../listing-format";

export function CompareTray() {
  const tr = useUiText();
  const { compared, toggleCompare, clearCompare } = useMarket();
  const [open, setOpen] = useState(false);
  const available = useAvailableListings(compared, open);
  if (!compared.length) return null;
  return (
    <>
      <aside
        className="compare-tray"
        aria-label={tr("Предложения для сравнения")}
      >
        <div className="compare-preview">
          <Columns3 size={21} />
          <div>
            <strong>{tr("Ваш короткий список")}</strong>
            <span>
              {compared.length} {tr("из 3 предложений")}
            </span>
          </div>
        </div>
        <div className="compare-thumbs">
          {compared.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleCompare(item)}
              aria-label={tr("Убрать из сравнения: {0}", item.title)}
            >
              <img src={item.image} alt="" />
              <X size={11} />
            </button>
          ))}
        </div>
        <button
          className="button dark"
          disabled={compared.length < 2}
          onClick={() => setOpen(true)}
        >
          {tr("Сравнить")}
          <ArrowRight size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={tr("Очистить сравнение")}
          onClick={clearCompare}
        >
          <X size={18} />
        </button>
      </aside>
      {open && (
        <Modal
          title={tr("Выбирайте с уверенностью")}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            {tr(
              "Сравните условия и откройте предложение, которое подходит вашей задаче. Цены «от» указаны за разные единицы — учитывайте их при выборе.",
            )}
          </p>
          {available.loading ? (
            <Loading />
          ) : available.error ? (
            <ErrorState error={available.error} retry={available.refetch} />
          ) : !available.items.length ? (
            <Empty
              title={tr("Предложения больше недоступны")}
              description={tr("Выберите другие варианты из каталога.")}
            />
          ) : (
            <div className="compare-table-wrap">
              <table className="compare-table">
                <caption className="visually-hidden">
                  {tr("Сравнение выбранных предложений")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{tr("Что важно")}</th>
                    {available.items.map((item) => (
                      <th key={item.id} scope="col">
                        <img src={item.image} alt="" />
                        {item.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{tr("Стоимость от")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>
                        <strong>{listingPrice(item)}</strong>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{tr("Город")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>{listingCity(item)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{tr("Категория")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>
                        {CATEGORIES.find((c) => c.id === item.category)?.name}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{tr("Исполнитель")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>
                        {listingAuthor(item)}
                        {item.source && <small>{tr("Автор в Telegram")}</small>}
                        {!item.source && item.providerVerified && (
                          <span className="compare-verified">
                            <BadgeCheck size={14} />
                            {tr("Профиль отмечен")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{tr("Оценка")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>
                        {item.source ? (
                          <small>{tr("Нет оценок на blizu")}</small>
                        ) : (
                          <>
                            <Star size={13} />
                            {item.providerRating.toFixed(1)}
                            <small>
                              {item.reviewCount} {tr("оценок")}
                            </small>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{tr("Следующий шаг")}</th>
                    {available.items.map((item) => (
                      <td key={item.id}>
                        <Link
                          className="button secondary"
                          to={`/listings/${item.id}`}
                          onClick={() => setOpen(false)}
                        >
                          {tr("Подробнее")}
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
