import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LANGUAGE, resources } from "./resources";

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: "en",
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnNull: false,
});

export default i18n;
