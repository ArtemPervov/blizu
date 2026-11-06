import { resolve } from "node:path";
import { z } from "zod";
import { Store, now } from "./db.js";
import { provisionOperator } from "./provision-operator.js";
import { audit, isBlocked } from "./moderation.js";

const command = z.enum(["create", "grant", "revoke"]).parse(process.argv[2]);
const email = z.email().trim().toLowerCase().parse(process.env.OPERATOR_EMAIL);
const store = new Store(
  resolve(process.env.DATA_DIR ?? "data", "blizu.sqlite"),
);
try {
  if (command === "create") {
    const result = await provisionOperator(
      store,
      email,
      process.env.OPERATOR_PASSWORD,
    );
    console.log(
      result?.created
        ? "Operator account created."
        : "Operator account already exists; password unchanged.",
    );
  } else {
    const user = store.get<{ id: string; name: string }>(
      "SELECT id,name FROM users WHERE email=?",
      email,
    );
    if (!user) throw new Error("Account not found; no changes made.");
    store.transaction(() => {
      if (command === "grant" && isBlocked(store, user.id))
        throw new Error(
          "Unblock the account before granting operator access; no changes made.",
        );
      const granted = !!store.get(
        "SELECT userId FROM operator_access WHERE userId=?",
        user.id,
      );
      if ((command === "grant") === granted)
        throw new Error(
          "The account already has the requested access state; no changes made.",
        );
      if (command === "grant")
        store.run("INSERT INTO operator_access VALUES (?,?)", user.id, now());
      else store.run("DELETE FROM operator_access WHERE userId=?", user.id);
      store.run("DELETE FROM sessions WHERE userId=?", user.id);
      audit(
        store,
        user.id,
        `operator.${command}`,
        "user",
        user.id,
        user.name,
        "Изменение разрешения оператора через серверную команду",
        { isOperator: granted },
        { isOperator: command === "grant" },
      );
    });
    console.log(
      command === "grant"
        ? "Operator access granted. Sign in again."
        : "Operator access revoked and sessions cleared.",
    );
  }
} finally {
  store.close();
}
