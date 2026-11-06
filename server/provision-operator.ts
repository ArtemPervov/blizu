import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store, now } from "./db.js";
import { passwordHash } from "./app.js";
import { audit } from "./moderation.js";

export async function provisionOperator(
  store: Store,
  email?: string,
  password?: string,
) {
  if (!email && !password) return null;
  const input = z
    .object({
      email: z.email().trim().toLowerCase(),
      password: z.string().min(12).max(128),
    })
    .parse({ email, password });
  const existing = store.get<{ id: string; name: string }>(
    "SELECT id,name FROM users WHERE email=?",
    input.email,
  );
  if (existing) {
    if (
      !store.get(
        "SELECT userId FROM operator_access WHERE userId=?",
        existing.id,
      )
    )
      throw new Error(
        "OPERATOR_EMAIL belongs to an existing account. Use operator:grant explicitly, or choose a separate operator email.",
      );
    return { id: existing.id, created: false };
  }
  const id = randomUUID();
  const hash = await passwordHash(input.password);
  store.transaction(() => {
    store.run(
      "INSERT INTO users (id,name,email,password,city,role,contact,createdAt) VALUES (?,?,?,?,?,?,?,?)",
      id,
      "Оператор blizu",
      input.email,
      hash,
      "Будва",
      "customer",
      "Поддержка сервиса",
      now(),
    );
    store.run("INSERT INTO operator_access VALUES (?,?)", id, now());
    audit(
      store,
      id,
      "operator.provision",
      "user",
      id,
      "Оператор blizu",
      "Создание оператора при первоначальной настройке сервиса",
      { isOperator: false },
      { isOperator: true },
    );
  });
  return { id, created: true };
}
