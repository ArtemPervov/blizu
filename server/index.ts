import { createApp, passwordHash } from "./app.js";
import { now } from "./db.js";
import { randomUUID } from "node:crypto";
import { provisionOperator } from "./provision-operator.js";

const production = process.env.NODE_ENV === "production";
const staleHours = Number(process.env.DELIVERY_STALE_HOURS ?? 72);
if (!Number.isFinite(staleHours) || staleHours <= 0)
  throw new Error("DELIVERY_STALE_HOURS must be a positive number.");
if (production && !process.env.APP_ORIGIN)
  throw new Error("Set APP_ORIGIN to the public HTTPS origin.");
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("APP_ORIGIN must use HTTPS in production.");
const { app, store, checkStaleOrders } = createApp({
  production,
  demo:
    process.env.ENABLE_DEMO === undefined
      ? !production
      : process.env.ENABLE_DEMO === "true",
  origin: process.env.APP_ORIGIN,
  dataDir: process.env.DATA_DIR,
  staleHours,
});
if (
  process.env.ADMIN_EMAIL &&
  process.env.ADMIN_PASSWORD &&
  !store.get("SELECT id FROM users WHERE email=?", process.env.ADMIN_EMAIL)
) {
  if (process.env.ADMIN_PASSWORD.length < 12)
    throw new Error("ADMIN_PASSWORD must have at least 12 characters.");
  store.run(
    "INSERT INTO users (id,name,email,password,city,role,contact,createdAt) VALUES (?,?,?,?,?,?,?,?)",
    randomUUID(),
    "Команда заботы blizu",
    process.env.ADMIN_EMAIL.toLowerCase(),
    await passwordHash(process.env.ADMIN_PASSWORD),
    "Будва",
    "arbiter",
    "Поддержка в диалоге заказа",
    now(),
  );
}
await provisionOperator(store, process.env.OPERATOR_EMAIL, process.env.OPERATOR_PASSWORD);
const server = app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () =>
  console.log(`blizu API http://localhost:${process.env.PORT ?? 3001}`),
);
checkStaleOrders();
const timer = setInterval(() => {
  try {
    checkStaleOrders();
  } catch (error) {
    console.error("Delivery watchdog failed", error);
  }
}, 60_000);
timer.unref();
const shutdown = () => {
  clearInterval(timer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
