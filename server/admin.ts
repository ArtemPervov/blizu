import { Store, now } from "./db.js";
import { passwordHash } from "./app.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).",
  );
const store = new Store(
  resolve(process.env.DATA_DIR ?? "data", "blizu.sqlite"),
);
if (store.get("SELECT id FROM users WHERE email=?", email))
  throw new Error(
    "An account with this email already exists; no changes made.",
  );
store.run(
  "INSERT INTO users (id,name,email,password,city,role,contact,createdAt) VALUES (?,?,?,?,?,?,?,?)",
  randomUUID(),
  "Команда заботы blizu",
  email.toLowerCase(),
  await passwordHash(password),
  "Будва",
  "arbiter",
  "Поддержка в диалоге заказа",
  now(),
);
store.close();
console.log("Arbiter account created.");
