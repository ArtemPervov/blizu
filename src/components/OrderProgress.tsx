import { Check, CircleAlert, ShieldCheck } from "lucide-react";
import {
  STATUS_LABELS,
  type Order,
  type OrderStatus,
} from "../../shared/types";
import { getOrderPosition } from "../order-state";

const shortLabels: Partial<Record<OrderStatus, string>> = {
  confirmed: "Согласовано",
  in_progress: "В работе",
  in_transit: "В пути",
  arrived: "Прибыло",
  completed: "Завершено",
};

export function OrderProgress({
  order,
  compact = false,
}: {
  order: Pick<Order, "kind" | "status">;
  compact?: boolean;
}) {
  const { steps, index, exceptional, complete } = getOrderPosition(order);
  if (exceptional) {
    if (compact) return null;
    return (
      <div
        className={`order-stage-exception ${order.status === "disputed" ? "is-disputed" : ""}`}
      >
        {order.status === "disputed" ? (
          <CircleAlert size={23} />
        ) : (
          <ShieldCheck size={23} />
        )}
        <div>
          <strong>{STATUS_LABELS[order.status]}</strong>
          <p>
            {order.status === "disputed"
              ? "Дальнейшие действия — в разделе спора. История заказа и договорённостей сохранена."
              : "Решение и договорённости сторон сохранены в истории заказа."}
          </p>
        </div>
      </div>
    );
  }
  const label = `${order.kind === "delivery" ? "Доставка" : "Услуга"}: ${STATUS_LABELS[order.status]}. Этап ${index + 1} из ${steps.length}.`;
  if (compact)
    return (
      <div className="order-progress-mini" role="img" aria-label={label}>
        {steps.map((step, i) => (
          <span
            key={step}
            aria-hidden="true"
            className={
              i < index || complete
                ? "is-done"
                : i === index
                  ? "is-current"
                  : ""
            }
          />
        ))}
      </div>
    );
  return (
    <ol
      className="order-stages"
      data-kind={order.kind}
      aria-label="Этапы заказа"
    >
      {steps.map((step, i) => (
        <li
          key={step}
          className={
            i < index || complete ? "is-done" : i === index ? "is-current" : ""
          }
          aria-current={i === index ? "step" : undefined}
        >
          <span className="order-stage-mark" aria-hidden="true">
            {i < index || complete ? (
              <Check size={14} strokeWidth={2} />
            ) : (
              <span>{String(i + 1).padStart(2, "0")}</span>
            )}
          </span>
          <span className="order-stage-label">
            {step === "completed" && order.kind === "delivery"
              ? "Получено"
              : shortLabels[step]}
          </span>
          <span className="visually-hidden">
            {i < index || complete
              ? " — пройден"
              : i === index
                ? " — текущий этап"
                : " — впереди"}
          </span>
        </li>
      ))}
    </ol>
  );
}
