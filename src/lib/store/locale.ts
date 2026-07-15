import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Locale = "en" | "ar";
type S = { locale: Locale; setLocale: (l: Locale) => void; toggle: () => void };

export const useLocaleStore = create<S>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (l) => set({ locale: l }),
      toggle: () => set((s) => ({ locale: s.locale === "en" ? "ar" : "en" })),
    }),
    { name: "buildpos-locale-v1" }
  )
);

// Apply dir + lang to <html>
export function LocaleEffect() {
  const locale = useLocaleStore((s) => s.locale);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  return null;
}

// Tiny label helper — swaps EN/AR strings if both provided.
export function tr(en: string, ar?: string): string {
  const l = useLocaleStore.getState().locale;
  if (l === "ar" && ar) return ar;
  return en;
}