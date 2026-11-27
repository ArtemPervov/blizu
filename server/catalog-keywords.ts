import { stemmer as stemEnglish } from "@orama/stemmers/english";
import { stemmer as stemRussian } from "@orama/stemmers/russian";
import { stemmer as stemSerbian } from "@orama/stemmers/serbian";

const stopWords = new Set([
  "и",
  "в",
  "на",
  "по",
  "для",
  "из",
  "с",
  "со",
  "к",
  "у",
  "о",
  "об",
  "от",
  "до",
  "a",
  "an",
  "the",
  "for",
  "of",
  "and",
  "in",
  "with",
  "za",
  "od",
  "sa",
  "i",
  "u",
]);

export function foldCatalogText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("ё", "е")
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC");
}

export function catalogTermForms(word: string) {
  const original = word.toLowerCase();
  const forms = [foldCatalogText(original)];
  if (original.length >= 4) {
    const stems = /^[а-яё]+$/u.test(original)
      ? [stemRussian(original)]
      : /^\p{L}+$/u.test(original)
        ? [stemEnglish(original), stemSerbian(original)]
        : [];
    forms.push(
      ...stems.filter((stem) => stem.length >= 3).map(foldCatalogText),
    );
  }
  return [...new Set(forms)];
}

export function createCatalogMatcher() {
  let previous = "";
  let phrase = "";
  let terms: string[][] = [];

  return (text: string, query: string) => {
    if (query !== previous) {
      previous = query;
      phrase = foldCatalogText(query).trim();
      const words = query.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
      const keywords = words.filter(
        (word) => !stopWords.has(foldCatalogText(word)),
      );
      terms = [...new Set(keywords)].map(catalogTermForms);
    }
    if (!phrase) return 0;
    const value = foldCatalogText(text);
    if (value.includes(phrase)) return 2;
    return terms.length &&
      value.split(/(?:[.!?…;](?=\s|$)|[\r\n])+/u).some((part) => {
        const words = part.match(/[\p{L}\p{N}]+/gu) ?? [];
        return terms.every((forms) =>
          words.some((word) => forms.some((form) => word.startsWith(form))),
        );
      })
      ? 1
      : 0;
  };
}
