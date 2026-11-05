import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  BriefcaseBusiness,
  Link2,
  Package,
  Plus,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { CATEGORIES, CITIES, type Listing } from "../shared/types";
import { api, json, useAuth, useToast } from "./lib";
import { Field, FormError, Modal } from "./components/ui";

export type CreateKind = "request" | "delivery" | "listing";
export type CreatePreset = Partial<Listing> & {
  productUrl?: string;
  origin?: string;
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
      title={mode === "login" ? "С возвращением" : "Будем ближе"}
      onClose={onClose}
    >
      <p className="modal-description">
        {mode === "login"
          ? "Ваши заказы, любимые мастера и полезные находки — здесь."
          : "Присоединяйтесь к своим людям в Черногории."}
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
          Войти
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          aria-pressed={mode === "register"}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Создать аккаунт
        </button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        {mode === "register" && (
          <>
            <Field label="Как к вам обращаться">
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder="Ваше имя"
              />
            </Field>
            <div className="form-row">
              <Field label="Ваш город">
                <select name="city" defaultValue="Будва">
                  {CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Я здесь, чтобы…">
                <select name="role">
                  <option value="customer">Находить и заказывать</option>
                  <option value="provider">Предлагать услуги и товары</option>
                </select>
              </Field>
            </div>
            <Field
              label="Контакт для связи"
              hint="Будет доступен только второй стороне после согласования заказа."
            >
              <input
                name="contact"
                required
                minLength={3}
                maxLength={150}
                placeholder="Телефон или @telegram"
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
          label="Пароль"
          hint={mode === "register" ? "Не меньше 10 символов." : undefined}
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
            placeholder="Ваш пароль"
          />
        </Field>
        <FormError message={error} />
        <button className="button primary full" disabled={pending}>
          {pending
            ? "Подождите…"
            : mode === "login"
              ? "Войти в аккаунт"
              : "Создать аккаунт"}
          <ArrowRight size={17} />
        </button>
      </form>
      {demo && (
        <div className="demo-login">
          <span>ПОЗНАКОМИТЬСЯ БЕЗ РЕГИСТРАЦИИ</span>
          <div>
            {[
              ["customer", "Заказчик", UserRound],
              ["provider", "Мастер", Wrench],
              ["arbiter", "Арбитр", ShieldCheck],
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
          <small>Демонстрационные аккаунты и вымышленные данные.</small>
        </div>
      )}
    </Modal>
  );
}

export function CreateModal({
  kind: initialKind,
  preset,
  onClose,
}: {
  kind: CreateKind;
  preset?: CreatePreset;
  onClose: () => void;
}) {
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
          ? "Предложение опубликовано"
          : "Заявка создана. Ждём первые отклики!",
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
          ? "Доставим то, чего не хватает"
          : kind === "listing"
            ? "Ваше предложение"
            : "Что нужно сделать?"
      }
      onClose={onClose}
    >
      <p className="modal-description">
        {kind === "delivery"
          ? "Добавьте ссылку — логисты рассчитают итоговую стоимость и сроки."
          : "Расскажите чуть подробнее, чтобы быстрее найти своих людей."}
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
          Заявка
        </button>
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
          Доставка
        </button>
        {user?.role === "provider" && (
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
            Предложение
          </button>
        )}
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
            Черновик сохранён в этой вкладке
          </p>
        )}
        <Field
          label={
            kind === "listing" ? "Название предложения" : "Коротко о задаче"
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
                ? "Например, доставить кофемашину из Европы"
                : "Например, починить кондиционер в Шушани"
            }
          />
        </Field>
        {kind === "delivery" && (
          <>
            <Field label="Ссылка на товар">
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
            <Field label="Откуда доставить">
              <select
                name="origin"
                defaultValue={draft.origin ?? preset?.origin ?? "Россия"}
              >
                <option>Россия</option>
                <option>Китай</option>
                <option>Европа</option>
                <option>Другая страна</option>
              </select>
            </Field>
          </>
        )}
        <Field
          label={
            kind === "listing"
              ? "Расскажите о своём предложении"
              : "Подробности"
          }
        >
          <textarea
            name="description"
            defaultValue={draft.description ?? ""}
            required
            minLength={kind === "listing" ? 20 : 15}
            maxLength={5000}
            rows={4}
            placeholder={
              kind === "delivery"
                ? "Что за товар, вес и размеры, удобный способ получения…"
                : "Что нужно сделать, когда удобно, что важно учесть…"
            }
          />
        </Field>
        <div className="form-row">
          {kind !== "delivery" && (
            <Field label="Категория">
              <select
                name="category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Город">
            <select
              name="city"
              defaultValue={draft.city ?? preset?.city ?? user?.city ?? "Будва"}
            >
              {CITIES.filter((c) => c !== "Вся Черногория").map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field
            label={kind === "listing" ? "Стоимость от, €" : "Бюджет, €"}
            hint={
              kind === "listing"
                ? undefined
                : "Можно оставить 0 — обсудите в откликах."
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
                preset?.price ??
                ""
              }
              required={kind === "listing"}
              placeholder="По договорённости"
            />
          </Field>
          {kind === "listing" && (
            <Field label="За что">
              <select name="unit" defaultValue={draft.unit ?? "услуга"}>
                <option value="услуга">За услугу</option>
                <option value="час">За час</option>
                <option value="порция">За порцию</option>
                <option value="товар">За товар</option>
                <option value="кг">За кг</option>
                <option value="консультация">За консультацию</option>
              </select>
            </Field>
          )}
        </div>
        <div className="form-note">
          <ShieldCheck size={19} />
          <p>
            Цена и сроки согласовываются до начала работы. Оплата — напрямую
            между сторонами, наличными при встрече.
          </p>
        </div>
        <FormError message={mutation.error?.message} />
        <button className="button primary full" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Публикуем…"
            : kind === "listing"
              ? "Опубликовать предложение"
              : "Создать заявку"}
          <Plus size={18} />
        </button>
      </form>
    </Modal>
  );
}
