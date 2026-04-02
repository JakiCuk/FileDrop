import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en";
import sk from "./locales/sk";
import cs from "./locales/cs";
import de from "./locales/de";
import fr from "./locales/fr";
import es from "./locales/es";
import it from "./locales/it";
import pl from "./locales/pl";
import pt from "./locales/pt";
import nl from "./locales/nl";
import hu from "./locales/hu";
import ro from "./locales/ro";
import uk from "./locales/uk";
import hr from "./locales/hr";
import bg from "./locales/bg";
import sl from "./locales/sl";
import sv from "./locales/sv";
import da from "./locales/da";
import fi from "./locales/fi";
import el from "./locales/el";
import tr from "./locales/tr";
import nb from "./locales/nb";

export const supportedLanguages = {
  en: "English",
  sk: "Slovenčina",
  cs: "Čeština",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pl: "Polski",
  pt: "Português",
  nl: "Nederlands",
  hu: "Magyar",
  ro: "Română",
  uk: "Українська",
  hr: "Hrvatski",
  bg: "Български",
  sl: "Slovenščina",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  el: "Ελληνικά",
  tr: "Türkçe",
  nb: "Norsk",
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sk: { translation: sk },
      cs: { translation: cs },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
      it: { translation: it },
      pl: { translation: pl },
      pt: { translation: pt },
      nl: { translation: nl },
      hu: { translation: hu },
      ro: { translation: ro },
      uk: { translation: uk },
      hr: { translation: hr },
      bg: { translation: bg },
      sl: { translation: sl },
      sv: { translation: sv },
      da: { translation: da },
      fi: { translation: fi },
      el: { translation: el },
      tr: { translation: tr },
      nb: { translation: nb },
    },
    fallbackLng: "en",
    supportedLngs: Object.keys(supportedLanguages),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
