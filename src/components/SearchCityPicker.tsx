import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useI18n } from "../lib";
import { cityName, localCities } from "../market-copy";

const selectedLabel = { ru: "Выбрано", en: "Selected", me: "Odabrano" };

export function SearchCityPicker({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (cities: string[]) => void;
  className?: string;
}) {
  const { t, language } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const summary =
    value.length === 0
      ? t.everywhere
      : value.length === 1
        ? cityName(value[0], language)
        : `${selectedLabel[language]} ${value.length}`;
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      ref={root}
      className={`search-city-picker ${className ?? ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        type="button"
        className="city-picker-trigger"
        ref={trigger}
        aria-label={`${t.searchCity} — ${summary}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setDraft(value);
          setOpen(!open);
        }}
      >
        <MapPin size={16} aria-hidden="true" />
        <span>{summary}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="city-picker-options search-city-options"
          role="group"
          id={id}
          aria-label={t.searchCity}
        >
          <div className="search-city-checks">
            <label className="city-picker-option">
              <input
                type="checkbox"
                checked={draft.length === 0}
                onChange={() => setDraft([])}
              />
              <span>{t.everywhere}</span>
            </label>
            {localCities.map((city) => (
              <label className="city-picker-option" key={city}>
                <input
                  type="checkbox"
                  checked={draft.includes(city)}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked
                        ? [...draft, city]
                        : draft.filter((item) => item !== city),
                    )
                  }
                />
                <span>{cityName(city, language)}</span>
              </label>
            ))}
          </div>
          <button
            className="button primary full"
            type="button"
            onClick={() => {
              onChange(draft);
              close();
            }}
          >
            {t.applyFilters}
          </button>
        </div>
      )}
    </div>
  );
}
