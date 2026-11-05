import type { Order, OrderStatus } from "../shared/types";

export const ORDER_STEPS = {
  service: ["confirmed", "in_progress", "completed"],
  delivery: ["confirmed", "in_progress", "in_transit", "arrived", "completed"],
} satisfies Record<Order["kind"], OrderStatus[]>;

export function getOrderAction(order: Order, userId: string) {
  const owner = order.customerId === userId;
  const provider = order.providerId === userId;
  const actions: Partial<
    Record<OrderStatus, { status: OrderStatus; label: string }>
  > =
    order.kind === "delivery"
      ? {
          confirmed: { status: "in_progress", label: "Принять в работу" },
          in_progress: { status: "in_transit", label: "Посылка отправлена" },
          in_transit: { status: "arrived", label: "Прибыло в пункт выдачи" },
          arrived: { status: "completed", label: "Подтвердить получение" },
        }
      : {
          confirmed: { status: "in_progress", label: "Начать работу" },
          in_progress: { status: "completed", label: "Подтвердить выполнение" },
        };
  const action = actions[order.status];
  return action && (action.status === "completed" ? owner : provider)
    ? action
    : null;
}

export function getOrderPosition(order: Pick<Order, "kind" | "status">) {
  const steps: OrderStatus[] = ORDER_STEPS[order.kind];
  const index = steps.indexOf(order.status);
  return {
    steps,
    index,
    exceptional: index === -1,
    complete: order.status === "completed",
  };
}
