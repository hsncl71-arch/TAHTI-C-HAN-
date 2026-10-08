import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "./en";
import { tr } from "./tr";
import type { Locale } from "@/domains/types";

const DICT: Record<Locale, Record<string, string>> = { tr, en };

type I18nStore = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocale = create<I18nStore>()(
  persist(
    (set) => ({
      locale: "tr",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "taht-locale" },
  ),
);

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = DICT[locale]?.[key] ?? DICT.tr[key] ?? key;
  return interpolate(raw, vars);
}

export function useT() {
  const locale = useLocale((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
