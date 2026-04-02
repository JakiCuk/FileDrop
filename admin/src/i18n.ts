import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en";
import cs from "./locales/cs";
import sk from "./locales/sk";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, cs: { translation: cs }, sk: { translation: sk } },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
