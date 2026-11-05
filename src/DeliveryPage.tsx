import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Handshake,
  Link2,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import type { CreateAction } from "./App";
import { Accordion } from "./components/Accordion";
import { BrandIllustration } from "./components/BrandIllustration";

const ParticleScene = lazy(() => import("./components/Particles"));

const steps = [
  {
    icon: Link2,
    title: "Расскажите о покупке",
    text: "Ссылка на товар, страна отправления и город получения.",
  },
  {
    icon: Handshake,
    title: "Сравните предложения",
    text: "Логисты предложат цену и срок. Вы выбираете подходящие условия.",
  },
  {
    icon: Truck,
    title: "Следите за доставкой",
    text: "Переписка и история статусов сохранятся в одном заказе.",
  },
  {
    icon: Check,
    title: "Подтвердите получение",
    text: "Проверьте покупку и завершите заказ. Оплата — напрямую логисту.",
  },
];
const answers = [
  [
    "Как узнать стоимость?",
    "Создайте заявку со ссылкой на товар. Логисты пришлют свои предложения с ценой и сроками. До выбора отклика заказ не создаётся.",
  ],
  [
    "Можно ли обсудить детали с логистом?",
    "В отклике логист описывает условия. После выбора предложения в заказе доступны контакты исполнителя и общая переписка.",
  ],
  [
    "Как проходит оплата?",
    "Вы рассчитываетесь напрямую с логистом. Заранее согласуйте способ и порядок оплаты: сервис не принимает и не хранит деньги.",
  ],
  [
    "Что делать, если возникла проблема?",
    "Откройте спор из заказа, опишите ситуацию и приложите фотографии. Арбитру будет доступна история заказа и переписки.",
  ],
];

export function DeliveryPage({ create }: { create: CreateAction }) {
  const [productUrl, setProductUrl] = useState("");
  const [origin, setOrigin] = useState("Европа");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const url = new URL(productUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      setError("");
      create("delivery", { productUrl: url.href, origin });
    } catch {
      setError(
        "Добавьте ссылку на товар, начинающуюся с https:// или http://.",
      );
    }
  }
  return (
    <div className="page-shell delivery-page refined-page">
      <div className="page-breadcrumb">
        <Link to="/">Главная</Link>
        <span>/</span>
        <span>Доставка</span>
      </div>
      <section className="delivery-intro" aria-labelledby="delivery-title">
        <div className="delivery-intro-copy">
          <span className="section-kicker">ИЗ ДРУГИХ СТРАН — К ВАМ ДОМОЙ</span>
          <h1 id="delivery-title">
            Важное —<br />
            <em>ближе, чем кажется.</em>
          </h1>
          <p>
            Любимая вещь из России, Китая или Европы. Найдите логиста, сравните
            условия и договоритесь о доставке в Черногорию.
          </p>
          <form
            className="delivery-quote glass-panel"
            onSubmit={submit}
            aria-label="Заявка на доставку"
          >
            <label className="quote-url">
              <span>Что хотите доставить?</span>
              <div>
                <Link2 size={18} />
                <input
                  type="url"
                  required
                  pattern="https?://.*"
                  maxLength={2000}
                  value={productUrl}
                  onChange={(e) => {
                    setProductUrl(e.target.value);
                    setError("");
                  }}
                  placeholder="Вставьте ссылку на товар"
                  aria-label="Ссылка на покупку"
                  aria-describedby={error ? "quote-error" : "quote-help"}
                  aria-invalid={!!error}
                />
              </div>
            </label>
            <div className="quote-bottom">
              <label>
                <span>Откуда</span>
                <select
                  aria-label="Страна отправления"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option>Россия</option>
                  <option>Китай</option>
                  <option>Европа</option>
                  <option>Другая страна</option>
                </select>
              </label>
              <button className="button primary" type="submit">
                Получить предложения
                <ArrowRight size={17} />
              </button>
            </div>
            {error && (
              <p id="quote-error" className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <p className="quote-help" id="quote-help">
            <ShieldCheck size={14} />
            Сначала условия и цена. Затем — ваше решение.
          </p>
        </div>
        <div
          className="delivery-visual"
          aria-label="Доставка из России, Китая и Европы в Черногорию"
        >
          <div className="delivery-visual-heading">
            <span className="tiny-label">ДАЛЬШЕ — ТОЛЬКО ПУТЬ</span>
            <span>RU · CN · EU → ME</span>
          </div>
          <div className="parcel-art refined-parcel" aria-hidden="true">
            <Suspense
              fallback={
                <div className="parcel-fallback">
                  <Package size={90} strokeWidth={0.8} />
                </div>
              }
            >
              <ParticleScene variant="delivery" />
            </Suspense>
          </div>
          <div className="delivery-destination glass-panel">
            <span className="destination-mark">
              <Package size={21} strokeWidth={1.4} />
            </span>
            <div>
              <small>ТОЧКА НАЗНАЧЕНИЯ</small>
              <strong>Черногория</strong>
            </div>
            <span className="destination-line" />
            <ArrowUpRight size={20} />
          </div>
          <p className="delivery-visual-caption">
            От покупки до получения — в одном заказе
          </p>
        </div>
      </section>
      <section
        className="delivery-process"
        aria-labelledby="delivery-process-title"
      >
        <div className="refined-section-heading">
          <div>
            <span className="section-kicker">БЕЗ ЛИШНИХ СЛОЖНОСТЕЙ</span>
            <h2 id="delivery-process-title">Четыре простых шага</h2>
          </div>
          <Link className="quiet-link" to="/orders?kind=delivery">
            Мои доставки
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="delivery-process-grid">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <div className="process-item" key={title}>
              <div className="process-item-top">
                <Icon size={23} strokeWidth={1.4} />
                <span>0{i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
      <section
        className="delivery-answers"
        aria-labelledby="delivery-answers-title"
      >
        <div>
          <span className="section-kicker">ПОЛЕЗНО ЗНАТЬ ЗАРАНЕЕ</span>
          <h2 id="delivery-answers-title">
            Всё начинается
            <br />
            <em>с ясности.</em>
          </h2>
          <p>Чтобы вы чувствовали себя спокойно на каждом этапе.</p>
          <BrandIllustration kind="route" />
        </div>
        <div className="answer-list">
          {answers.map(([question, answer]) => (
            <Accordion key={question} title={question}>
              <p>{answer}</p>
            </Accordion>
          ))}
        </div>
      </section>
    </div>
  );
}
