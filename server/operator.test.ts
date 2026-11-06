import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { Store } from "./db.js";
import { provisionOperator } from "./provision-operator.js";

const reason = "Проверено командой: обнаружено нарушение правил сервиса.";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "blizu-operator-"));
  const f = createApp({
    store: new Store(":memory:"),
    demo: true,
    dataDir: dir,
    origin: "https://blizu.test",
  });
  return {
    ...f,
    cleanup() {
      f.store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function login(app: ReturnType<typeof createApp>["app"], role: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").send({ role }).expect(200);
  return agent;
}

test("operator access is separate from public roles and enforced on every route", async () => {
  const f = fixture();
  try {
    const isolated = new Store(":memory:");
    try {
      isolated.run(
        "INSERT INTO users (id,name,email,password,city,role,contact,createdAt) VALUES (?,?,?,?,?,?,?,?)",
        "demo-operator",
        "Демо-оператор",
        "operator@demo.blizu.local",
        "unused",
        "Будва",
        "customer",
        "",
        new Date().toISOString(),
      );
      assert.throws(
        () => createApp({ store: isolated, production: true, demo: false }),
        /demo accounts/,
      );
    } finally {
      isolated.close();
    }
    for (const path of ["summary", "users", "listings", "reports", "audit"])
      await request(f.app).get(`/api/operator/${path}`).expect(401);
    for (const role of ["customer", "provider", "arbiter"]) {
      const agent = await login(f.app, role);
      for (const path of ["summary", "users", "listings", "reports", "audit"])
        await agent.get(`/api/operator/${path}`).expect(403);
      await agent
        .patch("/api/operator/users/demo-provider")
        .send({ action: "block", reason })
        .expect(403);
    }
    const op = await login(f.app, "operator");
    const me = (await op.get("/api/auth/me").expect(200)).body.user;
    assert.equal(me.isOperator, true);
    assert.equal(me.role, "customer");
    await op.get("/api/orders/order-demo").expect(403);
    const users = (await op.get("/api/operator/users").expect(200)).body;
    assert.ok(users.items.length > 0);
    assert.ok(
      users.items.every(
        (u: Record<string, unknown>) => !("password" in u) && !("token" in u),
      ),
    );
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "verify", reason, role: "arbiter", isOperator: true })
      .expect(400);
    await request(f.app)
      .post("/api/auth/register")
      .send({
        name: "Новый участник",
        email: "new@example.com",
        password: "long-password-2026",
        role: "operator",
        city: "Будва",
        contact: "@new",
      })
      .expect(400);
    const registration = await request(f.app)
      .post("/api/auth/register")
      .send({
        name: "Новый участник",
        email: "new@example.com",
        password: "long-password-2026",
        role: "customer",
        city: "Будва",
        contact: "@new",
        isOperator: true,
      })
      .expect(201);
    assert.equal(registration.body.user.isOperator, false);
    assert.equal(
      f.store.get(
        "SELECT userId FROM operator_access WHERE userId=?",
        registration.body.user.id,
      ),
      undefined,
    );
  } finally {
    f.cleanup();
  }
});

test("hiding a listing affects catalog, favorites and direct access, preserves owner history and is reversible", async () => {
  const f = fixture();
  try {
    const op = await login(f.app, "operator");
    const customer = await login(f.app, "customer");
    const provider = await login(f.app, "provider");
    const before = (await request(f.app).get("/api/listings").expect(200)).body
      .total;
    await customer
      .put("/api/favorites/l-repair")
      .send({ saved: true })
      .expect(200);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({ action: "hide" })
      .expect(400);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({ action: "hide", reason })
      .expect(200);
    await request(f.app).get("/api/listings/l-repair").expect(404);
    await customer.get("/api/listings/l-repair").expect(404);
    await op.get("/api/listings/l-repair").expect(200);
    assert.equal(
      (await provider.get("/api/listings/l-repair").expect(200)).body.item
        .hidden,
      true,
    );
    const dashboard = (await provider.get("/api/dashboard").expect(200)).body;
    assert.equal(
      dashboard.listings.find((l: { id: string }) => l.id === "l-repair")
        .moderationReason,
      reason,
    );
    assert.equal(
      (await request(f.app).get("/api/listings").expect(200)).body.total,
      before - 1,
    );
    assert.deepEqual(
      (await request(f.app).get("/api/listings?ids=l-repair").expect(200)).body
        .items,
      [],
    );
    assert.ok(
      !(await customer.get("/api/favorites").expect(200)).body.ids.includes(
        "l-repair",
      ),
    );
    await customer
      .put("/api/favorites/l-repair")
      .send({ saved: true })
      .expect(404);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({ action: "hide", reason })
      .expect(409);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({
        action: "restore",
        reason: "Предложение проверено повторно, нарушение устранено.",
      })
      .expect(200);
    await request(f.app).get("/api/listings/l-repair").expect(200);
    assert.ok(
      (await customer.get("/api/favorites").expect(200)).body.ids.includes(
        "l-repair",
      ),
    );
    const audit = (await op.get("/api/operator/audit").expect(200)).body.items;
    assert.equal(audit.length, 2);
    assert.deepEqual(audit[1].before, { hidden: false });
    assert.deepEqual(audit[1].after, { hidden: true });
    assert.equal(audit[1].reason, reason);
  } finally {
    f.cleanup();
  }
});

test("blocking revokes sessions and prevents new orders with the provider without deleting orders or manual hides", async () => {
  const f = fixture();
  try {
    const op = await login(f.app, "operator");
    const provider = await login(f.app, "provider");
    const customer = await login(f.app, "customer");
    const created = await provider
      .post("/api/requests")
      .send({
        title: "Нужна уборка помещения",
        description:
          "Нужно убрать помещение после ремонта на следующей неделе.",
        category: "repair",
        city: "Бар",
        budget: 50,
        kind: "service",
      })
      .expect(201);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({ action: "hide", reason })
      .expect(200);
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "block", reason })
      .expect(200);
    assert.equal(
      (
        await op
          .get("/api/operator/audit")
          .query({ q: "Аккаунт заблокирован" })
          .expect(200)
      ).body.total,
      1,
    );
    assert.equal(
      (await provider.get("/api/auth/me").expect(200)).body.user,
      null,
    );
    await provider.get("/api/dashboard").expect(401);
    await request(f.app)
      .post("/api/auth/login")
      .send({ email: "provider@demo.blizu.local", password: "demo-blizu-2026" })
      .expect(403);
    await request(f.app)
      .post("/api/auth/demo")
      .send({ role: "provider" })
      .expect(403);
    assert.equal(
      f.store.get<{ n: number }>(
        "SELECT COUNT(*) n FROM sessions WHERE userId='demo-provider'",
      )!.n,
      0,
    );
    assert.ok(
      !(await request(f.app).get("/api/requests").expect(200)).body.items.some(
        (r: { id: string }) => r.id === created.body.id,
      ),
    );
    await request(f.app).get(`/api/requests/${created.body.id}`).expect(404);
    await customer.post("/api/offers/offer-demo/accept").send({}).expect(409);
    assert.equal(
      f.store.get<{ status: string }>(
        "SELECT status FROM requests WHERE id='r-ac'",
      )!.status,
      "open",
    );
    assert.ok(f.store.get("SELECT id FROM orders WHERE id='order-demo'"));
    await op
      .patch("/api/operator/users/demo-operator")
      .send({ action: "block", reason })
      .expect(403);
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "unblock", reason })
      .expect(200);
    assert.equal(
      (await provider.get("/api/auth/me").expect(200)).body.user,
      null,
    );
    await provider
      .post("/api/auth/demo")
      .send({ role: "provider" })
      .expect(200);
    await provider.get("/api/dashboard").expect(200);
    await request(f.app).get("/api/listings/l-repair").expect(404);
    await customer.post("/api/offers/offer-demo/accept").send({}).expect(201);
  } finally {
    f.cleanup();
  }
});

test("profile marks can be changed only by an operator, with reasons and no privilege escalation", async () => {
  const f = fixture();
  try {
    const op = await login(f.app, "operator");
    const provider = await login(f.app, "provider");
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "unverify", reason })
      .expect(200);
    assert.equal(
      (await request(f.app).get("/api/listings/l-repair").expect(200)).body.item
        .providerVerified,
      false,
    );
    await provider
      .patch("/api/operator/users/demo-provider")
      .send({ action: "verify", reason })
      .expect(403);
    await op
      .patch("/api/operator/users/demo-customer")
      .send({ action: "verify", reason })
      .expect(400);
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "verify", reason: " " })
      .expect(400);
    await op
      .patch("/api/operator/users/demo-provider")
      .send({ action: "verify", reason })
      .expect(200);
    const me = (await provider.get("/api/auth/me").expect(200)).body.user;
    assert.equal(me.verified, true);
    assert.equal(me.isOperator, false);
    assert.equal(me.role, "provider");
    assert.equal(
      (await op.get("/api/operator/audit").expect(200)).body.total,
      2,
    );
  } finally {
    f.cleanup();
  }
});

test("report review and its moderation action are atomic, notify the reporter, and cannot run twice", async () => {
  const f = fixture();
  try {
    const op = await login(f.app, "operator");
    const customer = await login(f.app, "customer");
    const body = {
      targetType: "listing",
      targetId: "l-repair",
      category: "fraud",
      description:
        "В описании указаны условия, которые исполнитель не выполняет.",
    };
    await request(f.app).post("/api/reports").send(body).expect(401);
    await customer
      .post("/api/reports")
      .send({ ...body, targetType: "user", targetId: "demo-customer" })
      .expect(400);
    const created = await customer.post("/api/reports").send(body).expect(201);
    await customer.post("/api/reports").send(body).expect(409);
    await customer.get("/api/operator/reports").expect(403);
    const queue = (
      await op.get("/api/operator/reports?state=open&q=КОНДИЦИОНЕР").expect(200)
    ).body;
    assert.equal(queue.items.length, 1);
    assert.equal(queue.items[0].description, body.description);
    await op
      .patch(`/api/operator/reports/${created.body.id}`)
      .send({ status: "resolved", action: "block", resolution: reason })
      .expect(400);
    assert.equal(
      f.store.get<{ status: string }>(
        "SELECT status FROM reports WHERE id=?",
        created.body.id,
      )!.status,
      "open",
    );
    await request(f.app).get("/api/listings/l-repair").expect(200);
    await op
      .patch(`/api/operator/reports/${created.body.id}`)
      .send({ status: "dismissed", action: "hide", resolution: reason })
      .expect(400);
    await op
      .patch(`/api/operator/reports/${created.body.id}`)
      .send({ status: "resolved", action: "hide", resolution: reason })
      .expect(200);
    await request(f.app).get("/api/listings/l-repair").expect(404);
    await op
      .patch(`/api/operator/reports/${created.body.id}`)
      .send({ status: "dismissed", resolution: reason })
      .expect(409);
    assert.equal(
      (await op.get("/api/operator/reports?state=open").expect(200)).body.total,
      0,
    );
    assert.equal(
      (await op.get("/api/operator/reports?state=resolved").expect(200)).body
        .total,
      1,
    );
    const audit = (await op.get("/api/operator/audit").expect(200)).body;
    assert.equal(audit.total, 2);
    assert.ok(
      audit.items.some(
        (a: { action: string }) => a.action === "report.resolved",
      ),
    );
    assert.ok(
      (await customer.get("/api/notifications").expect(200)).body.items.some(
        (n: { text: string }) => n.text.includes(reason),
      ),
    );
    const other = await customer
      .post("/api/reports")
      .send({ ...body, targetType: "user", targetId: "demo-provider" })
      .expect(201);
    await op
      .patch(`/api/operator/reports/${other.body.id}`)
      .send({
        status: "dismissed",
        action: "none",
        resolution: "Факты проверены, оснований для блокировки не установлено.",
      })
      .expect(200);
    assert.equal(
      f.store.get<{ n: number }>("SELECT COUNT(*) n FROM account_restrictions")!
        .n,
      0,
    );
    assert.equal(
      (await op.get("/api/operator/reports?state=dismissed").expect(200)).body
        .total,
      1,
    );
  } finally {
    f.cleanup();
  }
});

test("operator search and pagination are bounded, stable and parameterized", async () => {
  const f = fixture();
  try {
    const op = await login(f.app, "operator");
    const first = (
      await op.get("/api/operator/users?pageSize=3&page=1").expect(200)
    ).body;
    const second = (
      await op.get("/api/operator/users?pageSize=3&page=2").expect(200)
    ).body;
    assert.equal(first.items.length, 3);
    assert.equal(second.items.length, 3);
    assert.equal(first.total, second.total);
    assert.ok(
      first.items.every(
        (u: { id: string }) =>
          !second.items.some((v: { id: string }) => u.id === v.id),
      ),
    );
    assert.equal(
      (
        await op
          .get("/api/operator/users")
          .query({ q: "' OR 1=1 --" })
          .expect(200)
      ).body.total,
      0,
    );
    assert.equal(
      (await op.get("/api/operator/users").query({ q: "СЕРГЕЙ" }).expect(200))
        .body.total,
      1,
    );
    for (const query of ["page=0", "pageSize=1000", "state=unknown"])
      await op.get(`/api/operator/users?${query}`).expect(400);
    await op.get("/api/operator/listings?state=unknown").expect(400);
    await op.get("/api/operator/reports?state=unknown").expect(400);
  } finally {
    f.cleanup();
  }
});

test("schema upgrade preserves existing data and sessions; operator provisioning is explicit and persistent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-operator-upgrade-"));
  const path = join(dir, "data.sqlite");
  let store = new Store(path);
  try {
    const app = createApp({ store, demo: true, dataDir: dir }).app;
    const customer = await login(app, "customer");
    const session = (await customer.get("/api/auth/me").expect(200)).body.user
      .id;
    store.db.exec(
      "DROP TABLE operator_audit; DROP TABLE reports; DROP TABLE listing_moderation; DROP TABLE account_restrictions; DROP TABLE operator_access; DELETE FROM users WHERE id='demo-operator'; PRAGMA user_version=1;",
    );
    store.close();
    store = new Store(path);
    assert.equal(
      store.get<{ user_version: number }>("PRAGMA user_version")!.user_version,
      3,
    );
    assert.ok(store.get("SELECT id FROM users WHERE id=?", session));
    assert.ok(store.get("SELECT token FROM sessions WHERE userId=?", session));
    assert.ok(store.get("SELECT id FROM orders WHERE id='order-demo'"));
    const result = await provisionOperator(
      store,
      "operator@example.com",
      "operator-long-password",
    );
    assert.equal(result?.created, true);
    assert.equal(
      (
        await provisionOperator(
          store,
          "operator@example.com",
          "another-long-password",
        )
      )?.created,
      false,
    );
    await assert.rejects(() =>
      provisionOperator(
        store,
        "customer@demo.blizu.local",
        "operator-long-password",
      ),
    );
    const newApp = createApp({ store, demo: false, dataDir: dir }).app;
    const op = request.agent(newApp);
    await op
      .post("/api/auth/login")
      .send({
        email: "operator@example.com",
        password: "another-long-password",
      })
      .expect(401);
    await op
      .post("/api/auth/login")
      .send({
        email: "operator@example.com",
        password: "operator-long-password",
      })
      .expect(200);
    await op
      .patch("/api/operator/listings/l-repair")
      .send({ action: "hide", reason })
      .expect(200);
    store.close();
    store = new Store(path);
    assert.ok(
      store.get(
        "SELECT listingId FROM listing_moderation WHERE listingId='l-repair'",
      ),
    );
    assert.equal(
      store.get<{ n: number }>("SELECT COUNT(*) n FROM operator_audit")!.n,
      2,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
