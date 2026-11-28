import { useUiText } from "./lib";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  BriefcaseBusiness,
  Link2,
  Package,
  Plus,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { CATEGORIES, CITIES, type Listing } from "../shared/types";
import { api, json, useAuth, useI18n, useToast } from "./lib";
import { Field, FormError, Modal } from "./components/ui";
import { categoryName, cityName } from "./market-copy";
import type { RequestDraft } from "../shared/assistant-stream";

export type CreateKind = "request" | "delivery" | "listing";
export type CreatePreset = Partial<Listing> & {
  productUrl?: string;
  origin?: string;
  request?: Pick<RequestDraft, "description" | "budget">;
};
const categoryImage: Record<string, string> = {
  repair: "repair",
  food: "food",
  auto: "auto",
  beauty: "wellness",
  business: "business",
  goods: "market",
  delivery: "delivery",
};

export function AuthModal({
  demo,
  onClose,
  onSuccess,
}: {
  demo: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const tr = useUiText();
  const { language } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const auth = useAuth();
  const qc = useQueryClient();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "login")
        await auth.login(String(f.get("email")), String(f.get("password")));
      else {
        const result = await api("/auth/register", {
          method: "POST",
          body: json(Object.fromEntries(f)),
        });
        await qc.cancelQueries();
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
        qc.setQueryData(["me"], result);
      }
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={mode === "login" ? tr("С возвращением") : tr("Будем ближе")}
      onClose={onClose}
    >
      <p className="modal-description">
        {mode === "login"
          ? tr("Ваши заказы, любимые мастера и полезные находки — здесь.")
          : tr("Присоединяйтесь к своим людям в Черногории.")}
      </p>
      <div className="segmented">
        <button
          className={mode === "login" ? "active" : ""}
          aria-pressed={mode === "login"}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          {tr("Войти")}
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          aria-pressed={mode === "register"}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          {tr("Создать аккаунт")}
        </button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        {mode === "register" && (
          <>
            <Field label={tr("Как к вам обращаться")}>
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder={tr("Ваше имя")}
              />
            </Field>
            <div className="form-row">
              <Field label={tr("Ваш город")}>
                <select name="city" defaultValue="Будва">
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {cityName(c, language)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label={tr("Контакт для связи")}
              hint={tr(
                "Будет доступен только второй стороне после согласования заказа.",
              )}
            >
              <input
                name="contact"
                required
                minLength={3}
                maxLength={150}
                placeholder={tr("Телефон или @telegram")}
                autoComplete="tel"
              />
            </Field>
          </>
        )}
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>
        <Field
          label={tr("Пароль")}
          hint={mode === "register" ? tr("Не меньше 10 символов.") : undefined}
        >
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 10 : 1}
            maxLength={128}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            placeholder={tr("Ваш пароль")}
          />
        </Field>
        <FormError message={error} />
        <button className="button primary full" disabled={pending}>
          {pending
            ? tr("Подождите…")
            : mode === "login"
              ? tr("Войти в аккаунт")
              : tr("Создать аккаунт")}
          <ArrowRight size={17} />
        </button>
      </form>
      {demo && (
        <div className="demo-login">
          <span>{tr("ПОЗНАКОМИТЬСЯ БЕЗ РЕГИСТРАЦИИ")}</span>
          <div>
            {[
              ["customer", tr("Заказчик"), UserRound],
              ["provider", tr("Мастер"), Wrench],
              ["arbiter", tr("Арбитр"), ShieldCheck],
              ["operator", tr("Оператор"), BriefcaseBusiness],
            ].map(([role, name, Icon]) => {
              const I = Icon as typeof UserRound;
              return (
                <button
                  disabled={pending}
                  key={String(role)}
                  onClick={async () => {
                    setPending(true);
                    setError("");
                    try {
                      await auth.demoLogin(String(role));
                      onSuccess();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  <I size={17} />
                  {String(name)}
                </button>
              );
            })}
          </div>
          <small>{tr("Демонстрационные аккаунты и вымышленные данные.")}</small>
        </div>
      )}
    </Modal>
  );
}

export function CreateModal({
  kind: initialKind,
  preset,
  onClose,
  deliveryEnabled,
}: {
  kind: CreateKind;
  preset?: CreatePreset;
  onClose: () => void;
  deliveryEnabled: boolean;
}) {
  const tr = useUiText();
  const { language } = useI18n();
  const { user } = useAuth();
  const [kind, setKind] = useState(initialKind);
  const draftKey = `blizu.draft.${user?.id}.${preset?.id ?? preset?.productUrl ?? "new"}`;
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    () => {
      try {
        const value = JSON.parse(sessionStorage.getItem(draftKey) || "{}");
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      } catch {
        return {};
      }
    },
  );
  const draft = drafts[kind] || {};
  const requestPreset = kind === "request" ? preset?.request : undefined;
  const [selectedCategory, setSelectedCategory] = useState(
    drafts[initialKind]?.category ?? preset?.category ?? "repair",
  );
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: async (f: FormData) => {
      const body = {
        ...Object.fromEntries(f),
        kind: kind === "delivery" ? "delivery" : "service",
        category: kind === "delivery" ? "delivery" : selectedCategory,
      };
      if (kind === "listing")
        return api<{ id: string }>("/listings", {
          method: "POST",
          body: json({
            ...body,
            price: Number(f.get("price")),
            image: categoryImage[selectedCategory] ?? "home",
          }),
        });
      return api<{ id: string }>("/requests", {
        method: "POST",
        body: json({ ...body, budget: Number(f.get("budget") || 0) }),
      });
    },
    onSuccess: (result) => {
      try {
        const next = { ...drafts };
        delete next[kind];
        sessionStorage.setItem(draftKey, JSON.stringify(next));
      } catch {}
      qc.invalidateQueries();
      onClose();
      navigate(
        kind === "listing"
          ? `/listings/${result.id}`
          : `/requests/${result.id}`,
      );
      toast(
        kind === "listing"
          ? tr("Предложение опубликовано")
          : tr("Заявка создана. Ждём первые отклики!"),
      );
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(new FormData(e.currentTarget));
  }
  return (
    <Modal
      title={
        kind === "delivery"
          ? tr("Доставим то, чего не хватает")
          : kind === "listing"
            ? tr("Ваше предложение")
            : tr("Что нужно сделать?")
      }
      onClose={onClose}
      className="publication-modal"
    >
      <p className="modal-description">
        {kind === "delivery"
          ? tr(
              "Добавьте ссылку — логисты рассчитают итоговую стоимость и сроки.",
            )
          : tr("Расскажите чуть подробнее, чтобы быстрее найти своих людей.")}
      </p>
      <div className="create-tabs">
        <button
          disabled={mutation.isPending}
          className={kind === "request" ? "active" : ""}
          aria-pressed={kind === "request"}
          onClick={() => {
            setKind("request");
            setSelectedCategory(
              drafts.request?.category ?? preset?.category ?? "repair",
            );
            mutation.reset();
          }}
        >
          <Wrench size={16} />
          {tr("Заявка")}
        </button>
        {deliveryEnabled && (
          <button
            disabled={mutation.isPending}
            className={kind === "delivery" ? "active" : ""}
            aria-pressed={kind === "delivery"}
            onClick={() => {
              setKind("delivery");
              mutation.reset();
            }}
          >
            <Package size={16} />
            {tr("Доставка")}
          </button>
        )}
        <button
          disabled={mutation.isPending}
          className={kind === "listing" ? "active" : ""}
          aria-pressed={kind === "listing"}
          onClick={() => {
            setKind("listing");
            setSelectedCategory(
              drafts.listing?.category ?? preset?.category ?? "repair",
            );
            mutation.reset();
          }}
        >
          <BriefcaseBusiness size={16} />
          {tr("Предложение")}
        </button>
      </div>
      <form
        key={kind}
        className="form-stack"
        onSubmit={submit}
        onChange={(event) => {
          const values = Object.fromEntries(
            new FormData(event.currentTarget),
          ) as Record<string, string>;
          const next = { ...drafts, [kind]: values };
          setDrafts(next);
          try {
            sessionStorage.setItem(draftKey, JSON.stringify(next));
          } catch {}
        }}
      >
        {drafts[kind] && (
          <p className="draft-note">
            <Check size={15} />
            {tr("Черновик сохранён в этой вкладке")}
          </p>
        )}
        <Field
          label={
            kind === "listing"
              ? tr("Название предложения")
              : tr("Коротко о задаче")
          }
        >
          <input
            name="title"
            required
            minLength={5}
            maxLength={120}
            defaultValue={draft.title ?? preset?.title ?? ""}
            placeholder={
              kind === "delivery"
                ? tr("Например, доставить кофемашину из Европы")
                : tr("Например, починить кондиционер в Шушани")
            }
          />
        </Field>
        {kind === "delivery" && (
          <>
            <Field label={tr("Ссылка на товар")}>
              <div className="input-with-icon">
                <Link2 size={17} />
                <input
                  name="productUrl"
                  defaultValue={draft.productUrl ?? preset?.productUrl ?? ""}
                  required
                  type="url"
                  pattern="https?://.*"
                  maxLength={2000}
                  placeholder="https://магазин.ру/товар"
                />
              </div>
            </Field>
            <Field label={tr("Откуда доставить")}>
              <select
                name="origin"
                defaultValue={draft.origin ?? preset?.origin ?? "Россия"}
              >
                {["Россия", "Китай", "Европа", "Другая страна"].map(
                  (origin) => (
                    <option key={origin} value={origin}>
                      {tr(origin)}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </>
        )}
        <Field
          label={
            kind === "listing"
              ? tr("Расскажите о своём предложении")
              : tr("Подробности")
          }
        >
          <textarea
            name="description"
            defaultValue={
              draft.description ??
              (kind === "listing" ? preset?.description : requestPreset?.description) ??
              ""
            }
            required
            minLength={kind === "listing" ? 20 : 15}
            maxLength={5000}
            rows={4}
            placeholder={
              kind === "delivery"
                ? tr("Что за товар, вес и размеры, удобный способ получения…")
                : tr("Что нужно сделать, когда удобно, что важно учесть…")
            }
          />
        </Field>
        <div className="form-row">
          {kind !== "delivery" && (
            <Field label={tr("Категория")}>
              <select
                name="category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c.id, language)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={tr("Город")}>
            <select
              name="city"
              defaultValue={draft.city ?? preset?.city ?? user?.city ?? "Будва"}
            >
              {CITIES.filter((c) => c !== "Вся Черногория").map((c) => (
                <option key={c} value={c}>
                  {cityName(c, language)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field
            label={kind === "listing" ? tr("Стоимость от, €") : tr("Бюджет, €")}
            hint={
              kind === "listing"
                ? undefined
                : tr("Можно оставить 0 — обсудите в откликах.")
            }
          >
            <input
              name={kind === "listing" ? "price" : "budget"}
              type="number"
              min={kind === "listing" ? 1 : 0}
              max={1000000}
              step="0.01"
              defaultValue={
                draft[kind === "listing" ? "price" : "budget"] ??
                requestPreset?.budget ??
                preset?.price ??
                ""
              }
              required={kind === "listing"}
              placeholder={tr("По договорённости")}
            />
          </Field>
          {kind === "listing" && (
            <Field label={tr("За что")}>
              <select
                name="unit"
                defaultValue={draft.unit ?? preset?.unit ?? "услуга"}
              >
                <option value="услуга">{tr("За услугу")}</option>
                <option value="час">{tr("За час")}</option>
                <option value="порция">{tr("За порцию")}</option>
                <option value="товар">{tr("За товар")}</option>
                <option value="кг">{tr("За кг")}</option>
                <option value="консультация">{tr("За консультацию")}</option>
              </select>
            </Field>
          )}
        </div>
        {kind === "listing" && (
          <details
            className="listing-contact-fields"
            open={!!(draft.telegram || draft.viber)}
          >
            <summary>
              {tr("Контакты в объявлении")}{" "}
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>
              {tr(
                "Указывайте только те контакты, которые хотите показать всем посетителям.",
              )}
            </p>
            <div className="form-row">
              <Field label="Telegram">
                <input
                  name="telegram"
                  placeholder="@username"
                  defaultValue={draft.telegram ?? ""}
                  maxLength={33}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label="Viber">
                <input
                  type="tel"
                  name="viber"
                  placeholder="+382…"
                  defaultValue={draft.viber ?? ""}
                  maxLength={32}
                />
              </Field>
            </div>
          </details>
        )}
        <div className="form-note">
          <ShieldCheck size={19} />
          <p>
            {tr(
              "Цена и сроки согласовываются до начала работы. Оплата — напрямую между сторонами, наличными при встрече.",
            )}
          </p>
        </div>
        <FormError message={mutation.error?.message} />
        <button
          className="button primary full publication-submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? tr("Публикуем…")
            : kind === "listing"
              ? tr("Опубликовать предложение")
              : tr("Создать заявку")}
          <Plus size={18} />
        </button>
      </form>
    </Modal>
  );
}
