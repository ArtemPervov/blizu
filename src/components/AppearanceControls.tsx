import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Moon, Sun } from "lucide-react";
import { useI18n, type Language } from "../lib";

const labels = {
  ru: {
    language: "Язык интерфейса",
    light: "Светлая тема",
    dark: "Тёмная тема",
  },
  en: {
    language: "Interface language",
    light: "Light theme",
    dark: "Dark theme",
  },
  me: {
    language: "Jezik interfejsa",
    light: "Svijetla tema",
    dark: "Tamna tema",
  },
};
const languages: [Language, string][] = [
  ["ru", "Русский"],
  ["en", "English"],
  ["me", "Crnogorski"],
];

export function LanguagePicker() {
  const { language, setLanguage } = useI18n();
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      className="locale-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && root.current?.open) {
          root.current.open = false;
          root.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={labels[language].language}>
        <Globe2 size={16} aria-hidden="true" />
        {language.toUpperCase()}
        <ChevronDown size={12} aria-hidden="true" />
      </summary>
      <div className="city-picker-options">
        {languages.map(([value, name]) => (
          <button
            key={value}
            type="button"
            className="city-picker-option"
            aria-pressed={language === value}
            onClick={() => {
              setLanguage(value);
              if (root.current) {
                root.current.open = false;
                root.current.querySelector("summary")?.focus();
              }
            }}
          >
            {name}
            {language === value && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </details>
  );
}

const themeChanged = "blizu-theme-changed";
export function ThemeToggle() {
  const { language } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => {
      let next = false;
      try {
        next = localStorage.getItem("blizu-theme") === "dark";
      } catch {}
      document.documentElement.dataset.theme = next ? "dark" : "light";
      setDark(next);
    };
    sync();
    window.addEventListener(themeChanged, sync);
    return () => window.removeEventListener(themeChanged, sync);
  }, []);
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={dark ? labels[language].light : labels[language].dark}
      onClick={() => {
        const next = !dark;
        try {
          localStorage.setItem("blizu-theme", next ? "dark" : "light");
          window.dispatchEvent(new Event(themeChanged));
        } catch {
          document.documentElement.dataset.theme = next ? "dark" : "light";
          setDark(next);
        }
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
