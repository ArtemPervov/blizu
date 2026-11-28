import { useUiText } from "../lib";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Mail, MessageCircle, Save, UserRound } from "lucide-react";
import { CITIES, type AccountProfile, type User } from "../../shared/types";
import { api, json, useI18n, useToast, type Language } from "../lib";
import { cityName } from "../market-copy";
import { ErrorState, Field, FormError, Loading } from "./ui";

export function ProfileEditor({ user }: { user: User }) {
  const tr = useUiText();
  const { language, setLanguage } = useI18n();
  const query = useQuery({
    queryKey: ["account-profile", user.id],
    queryFn: ({ signal }) =>
      api<{ profile: AccountProfile }>("/profile", { signal }),
  });
  return (
    <div className="profile-settings">
      <div className="workspace-heading">
        <div>
          <h1>{tr("Профиль и контакты")}</h1>
          <p>{tr("Укажите, как к вам обращаться и как с вами связаться.")}</p>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <ProfileForm user={user} profile={query.data.profile} />
      )}
      <section
        className="profile-panel glass-panel"
        aria-labelledby="profile-account"
      >
        <h2 id="profile-account">
          <Globe2 size={19} /> {tr("Аккаунт")}
        </h2>
        <div className="profile-form-grid">
          <div className="profile-email">
            <span>
              <Mail size={15} /> {tr("Почта для входа")}
            </span>
            <strong>{user.email}</strong>
          </div>
          <Field label={tr("Язык на этом устройстве")}>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="ru">Русский</option>
              <option value="me">Crnogorski</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </section>
    </div>
  );
}

function ProfileForm({
  user,
  profile,
}: {
  user: User;
  profile: AccountProfile;
}) {
  const tr = useUiText();
  const [draft, setDraft] = useState(profile);
  const { language } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const dirty = (Object.keys(profile) as (keyof AccountProfile)[]).some(
    (field) => draft[field] !== profile[field],
  );
  const save = useMutation({
    mutationFn: () =>
      api<{ profile: AccountProfile; user: User }>("/profile", {
        method: "PATCH",
        body: json(draft),
      }),
    onSuccess: async (result) => {
      await client.cancelQueries({ queryKey: ["me"] });
      if (
        client.getQueryData<{ user: User | null }>(["me"])?.user?.id !== user.id
      )
        return;
      client.setQueryData(["me"], { user: result.user });
      client.setQueryData(["account-profile", user.id], {
        profile: result.profile,
      });
      setDraft(result.profile);
      for (const key of [
        "listings",
        "listing",
        "dashboard",
        "order",
        "favorites",
        "provider",
      ])
        void client.invalidateQueries({ queryKey: [key] });
      toast(tr("Профиль сохранён"), "success");
    },
  });
  const edit = <K extends keyof AccountProfile>(
    field: K,
    value: AccountProfile[K],
  ) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <form
      className="profile-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !save.isPending) save.mutate();
      }}
    >
      <fieldset className="profile-editor-fields" disabled={save.isPending}>
        <section
          className="profile-panel glass-panel"
          aria-labelledby="profile-details-heading"
        >
          <h2 id="profile-details-heading">
            <UserRound size={19} /> {tr("Личные данные")}
          </h2>
          <div className="profile-form-grid">
            <Field label={tr("Имя")}>
              <input
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
                value={draft.name}
                onChange={(event) => edit("name", event.target.value)}
              />
            </Field>
            <Field label={tr("Город профиля")}>
              <select
                name="city"
                value={draft.city}
                onChange={(event) => edit("city", event.target.value)}
              >
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {cityName(city, language)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={tr("О себе")}>
            <textarea
              name="bio"
              rows={3}
              value={draft.bio}
              maxLength={500}
              aria-describedby="profile-bio-note"
              placeholder={tr("Добавьте короткое описание")}
              onChange={(event) => edit("bio", event.target.value)}
            />
          </Field>
          <div className="profile-bio-meta">
            <small id="profile-bio-note">
              {tr("Описание видно в ваших объявлениях.")}
            </small>
            <small>{draft.bio.length} / 500</small>
          </div>
        </section>
        <section
          className="profile-panel glass-panel"
          aria-labelledby="profile-contacts-heading"
        >
          <h2 id="profile-contacts-heading">
            <MessageCircle size={19} /> {tr("Контакты")}
          </h2>
          <div className="profile-form-grid">
            <Field label="Viber">
              <input
                name="viber"
                type="tel"
                autoComplete="tel"
                maxLength={32}
                placeholder="+382 67 123 456"
                value={draft.viber}
                onChange={(event) => edit("viber", event.target.value)}
              />
            </Field>
            <Field label="Telegram">
              <input
                name="telegram"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                placeholder="@username"
                value={draft.telegram}
                onChange={(event) => edit("telegram", event.target.value)}
              />
            </Field>
          </div>
          <label className="profile-publication">
            <input
              type="checkbox"
              name="showListingContacts"
              checked={draft.showListingContacts}
              onChange={(event) =>
                edit("showListingContacts", event.target.checked)
              }
            />
            <span>
              <strong>
                {tr("Показывать Viber и Telegram в объявлениях")}
              </strong>
              <small>
                {tr(
                  "Посетители увидят их в объявлениях, где вы не указали отдельные контакты.",
                )}
              </small>
            </span>
          </label>
          <Field label={tr("Контакт для заказов")}>
            <input
              name="contact"
              maxLength={150}
              placeholder={tr("Номер телефона или имя в мессенджере")}
              aria-describedby="profile-order-contact-note"
              value={draft.contact}
              onChange={(event) => edit("contact", event.target.value)}
            />
          </Field>
          <small id="profile-order-contact-note" className="profile-field-note">
            {tr("Виден участникам заказа и арбитру после согласования.")}
          </small>
        </section>
      </fieldset>
      <FormError message={save.error?.message} />
      <div className={`profile-editor-actions${dirty ? " is-dirty" : ""}`}>
        {dirty && (
          <button
            type="button"
            className="button secondary"
            disabled={save.isPending}
            onClick={() => {
              setDraft(profile);
              save.reset();
            }}
          >
            {tr("Отменить")}
          </button>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={!dirty || save.isPending}
        >
          <Save size={17} />
          {save.isPending ? tr("Сохраняем…") : tr("Сохранить профиль")}
        </button>
      </div>
    </form>
  );
}
