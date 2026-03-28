"use client";

import { useEffect, useMemo, useState } from "react";
import { createTranslator, getDateTimeLocale } from "@/lib/i18n";
import { DEFAULT_SETTINGS, readSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings-storage";

export function useI18n() {
  const [uiLanguage, setUiLanguage] = useState(DEFAULT_SETTINGS.uiLanguage);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromStorage = () => {
      const next = readSettings().uiLanguage;
      setUiLanguage(next || DEFAULT_SETTINGS.uiLanguage);
    };

    syncFromStorage();
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncFromStorage);
    window.addEventListener("storage", syncFromStorage);

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);
  const dateTimeLocale = useMemo(() => getDateTimeLocale(uiLanguage), [uiLanguage]);

  return {
    uiLanguage,
    t,
    dateTimeLocale
  };
}
