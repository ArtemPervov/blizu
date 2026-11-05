import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Columns3, Star, X } from "lucide-react";
import { useMarket } from "../market-state";
import { euro } from "../lib";
import { CATEGORIES } from "../../shared/types";
import { Modal } from "./ui";

export function CompareTray() {
  const { compared, toggleCompare, clearCompare } = useMarket();
  const [open, setOpen] = useState(false);
  if (!compared.length) return null;
  return (
    <>
      <aside className="compare-tray" aria-label="Предложения для сравнения">
        <div className="compare-preview">
          <Columns3 size={21} />
          <div>
            <strong>Ваш короткий список</strong>
            <span>{compared.length} из 3 предложений</span>
          </div>
        </div>
        <div className="compare-thumbs">
          {compared.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleCompare(item)}
              aria-label={`Убрать из сравнения: ${item.title}`}
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
          Сравнить
          <ArrowRight size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Очистить сравнение"
          onClick={clearCompare}
        >
          <X size={18} />
        </button>
      </aside>
      {open && (
        <Modal title="Выбирайте с уверенностью" onClose={() => setOpen(false)}>
          <p className="muted">
            Сравните условия и откройте предложение, которое подходит вашей
            задаче. Цены «от» указаны за разные единицы — учитывайте их при
            выборе.
          </p>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <caption className="visually-hidden">
                Сравнение выбранных предложений
              </caption>
              <thead>
                <tr>
                  <th scope="col">Что важно</th>
                  {compared.map((item) => (
                    <th key={item.id} scope="col">
                      <img src={item.image} alt="" />
                      {item.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Стоимость от</th>
                  {compared.map((item) => (
                    <td key={item.id}>
                      <strong>{euro(item.price)}</strong>
                      <small>за {item.unit}</small>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Город</th>
                  {compared.map((item) => (
                    <td key={item.id}>{item.city}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Категория</th>
                  {compared.map((item) => (
                    <td key={item.id}>
                      {CATEGORIES.find((c) => c.id === item.category)?.name}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Исполнитель</th>
                  {compared.map((item) => (
                    <td key={item.id}>
                      {item.providerName}
                      {item.providerVerified && (
                        <span className="compare-verified">
                          <BadgeCheck size={14} />
                          Профиль отмечен
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Оценка</th>
                  {compared.map((item) => (
                    <td key={item.id}>
                      <Star size={13} />
                      {item.providerRating.toFixed(1)}
                      <small>{item.reviewCount} оценок</small>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Следующий шаг</th>
                  {compared.map((item) => (
                    <td key={item.id}>
                      <Link
                        className="button secondary"
                        to={`/listings/${item.id}`}
                        onClick={() => setOpen(false)}
                      >
                        Подробнее
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
