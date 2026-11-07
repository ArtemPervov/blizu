import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { CITIES } from "../../shared/types";
import { useI18n } from "../lib";

const allCities = "Вся Черногория";
const cities = [allCities, ...CITIES.filter((city) => city !== allCities)];

export function CityPicker({
  city,
  onChange,
}: {
  city: string;
  onChange: (city: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = Math.max(0, cities.indexOf(city));
  const label = (value: string) => (value === allCities ? t.everywhere : value);
  const show = (index = current) => {
    setActive(index);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const option = list.current?.children.item(
      active,
    ) as HTMLButtonElement | null;
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

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
      className="city-control city-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="city-picker-trigger"
        type="button"
        aria-label={`Ваш город: ${label(cities[current])}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          }
        }}
      >
        <MapPin size={15} aria-hidden="true" />
        <span>{label(cities[current])}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          className="city-picker-options"
          role="listbox"
          aria-label="Города Черногории"
          onKeyDown={(event) => {
            switch (event.key) {
              case "ArrowDown":
                setActive((index) => Math.min(cities.length - 1, index + 1));
                break;
              case "ArrowUp":
                setActive((index) => Math.max(0, index - 1));
                break;
              case "Home":
                setActive(0);
                break;
              case "End":
                setActive(cities.length - 1);
                break;
              case "Escape":
                close();
                break;
              case "Tab":
                close();
                return;
              default: {
                if (
                  event.key.length !== 1 ||
                  event.key === " " ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey
                )
                  return;
                const letter = event.key.toLocaleLowerCase();
                for (let offset = 1; offset <= cities.length; offset++) {
                  const index = (active + offset) % cities.length;
                  if (
                    label(cities[index]).toLocaleLowerCase().startsWith(letter)
                  ) {
                    setActive(index);
                    break;
                  }
                }
              }
            }
            event.preventDefault();
          }}
        >
          {cities.map((value, index) => (
            <button
              className="city-picker-option"
              key={value}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === current}
              onClick={() => {
                onChange(value);
                close();
              }}
            >
              <span>{label(value)}</span>
              {index === current && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
