import { useEffect, useState } from "react";
import type { Language } from "../lib";

const suggestions = {
  ru: ["Найти ", ["велосипед", "мастера", "домашнюю еду", "массаж"]],
  en: ["Find ", ["a bicycle", "a handyman", "homemade food", "a massage"]],
  me: ["Pronađi ", ["bicikl", "majstora", "domaću hranu", "masažu"]],
} as const;

export function MobileSearchPrompt({
  active,
  language,
}: {
  active: boolean;
  language: Language;
}) {
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!active) return;

    const media = matchMedia(
      "(max-width: 760px) and (prefers-reduced-motion: no-preference)",
    );
    const [prefix, words] = suggestions[language];
    let timer: number;

    const start = () => {
      window.clearTimeout(timer);
      if (!media.matches || document.hidden) {
        setPrompt("");
        return;
      }

      let index = 0;
      let length = 0;
      let erasing = false;
      const tick = () => {
        const word = words[index];
        setPrompt(prefix + word.slice(0, length));

        if (!erasing && length === word.length) {
          erasing = true;
          timer = window.setTimeout(tick, 1700);
        } else if (erasing && length === 0) {
          index = (index + 1) % words.length;
          erasing = false;
          timer = window.setTimeout(tick, 240);
        } else {
          length += erasing ? -1 : 1;
          timer = window.setTimeout(tick, erasing ? 38 : 75);
        }
      };
      setPrompt(prefix);
      timer = window.setTimeout(tick, 300);
    };

    start();
    media.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [active, language]);

  if (!active || !prompt) return null;
  return (
    <span className="mobile-search-prompt" aria-hidden="true">
      {prompt}
    </span>
  );
}
