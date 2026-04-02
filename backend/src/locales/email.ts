/** Email translations for en, cs, sk, uk. Fallback: en */
import { config } from "../config";

export type EmailLocale = "en" | "cs" | "sk" | "uk";

const n = config.appName;

const translations: Record<
  EmailLocale,
  {
    otp: {
      subject: string;
      intro: string;
      validity: string;
      ignore: string;
    };
    reply: {
      subject: string;
      intro: string;
      downloadBtn: string;
      linkValidity: (date: string) => string;
      noExpiry: string;
      keyWarning: string;
    };
  }
> = {
  en: {
    otp: {
      subject: `${n} — Your verification code`,
      intro: "Your one-time verification code:",
      validity: "Validity",
      ignore: "If you did not request this code, ignore this message.",
    },
    reply: {
      subject: `${n} — Recipient uploaded files`,
      intro: "The recipient has uploaded files to your share.",
      downloadBtn: "Download files",
      linkValidity: (date) => `Link valid until: ${date}.`,
      noExpiry: "The link has no expiration.",
      keyWarning: "The encryption key is part of the link — do not forward it to unauthorized persons.",
    },
  },
  cs: {
    otp: {
      subject: `${n} — Váš overovací kód`,
      intro: "Váš jednorazový overovací kód:",
      validity: "Platnost",
      ignore: "Pokud jste tento kód nevyžadovali, tuto zprávu ignorujte.",
    },
    reply: {
      subject: `${n} — Příjemce nahrál soubory`,
      intro: "Příjemce nahrál soubory k vašemu sdílení.",
      downloadBtn: "Stáhnout soubory",
      linkValidity: (date) => `Platnost odkazu: do ${date}.`,
      noExpiry: "Odkaz nemá nastavenou expiraci.",
      keyWarning: "Šifrovací klíč je součástí odkazu — neposílejte ho neoprávněným osobám.",
    },
  },
  sk: {
    otp: {
      subject: `${n} — Váš overovací kód`,
      intro: "Váš jednorazový overovací kód:",
      validity: "Platnosť",
      ignore: "Ak ste o tento kód nežiadali, ignorujte túto správu.",
    },
    reply: {
      subject: `${n} — Príjemca nahral súbory`,
      intro: "Príjemca nahral súbory k vášmu zdieľaniu.",
      downloadBtn: "Stiahnuť súbory",
      linkValidity: (date) => `Platnosť odkazu: do ${date}.`,
      noExpiry: "Odkaz nemá nastavenú expiráciu.",
      keyWarning: "Šifrovací kľúč je súčasťou odkazu — nepreposielajte ho neoprávneným osobám.",
    },
  },
  uk: {
    otp: {
      subject: `${n} — Ваш код підтвердження`,
      intro: "Ваш одноразовий код підтвердження:",
      validity: "Термін дії",
      ignore: "Якщо ви не запитували цей код, ігноруйте це повідомлення.",
    },
    reply: {
      subject: `${n} — Отримувач завантажив файли`,
      intro: "Отримувач завантажив файли до вашого спільного посилання.",
      downloadBtn: "Завантажити файли",
      linkValidity: (date) => `Термін дії посилання: до ${date}.`,
      noExpiry: "Посилання не має терміну дії.",
      keyWarning: "Ключ шифрування є частиною посилання — не пересилайте його стороннім особам.",
    },
  },
};

const DATE_LOCALES: Record<EmailLocale, string> = {
  en: "en-GB",
  cs: "cs-CZ",
  sk: "sk-SK",
  uk: "uk-UA",
};

export function getEmailLocale(locale: string | undefined): EmailLocale {
  if (locale === "en" || locale === "cs" || locale === "sk" || locale === "uk") {
    return locale;
  }
  return "en";
}

export function getEmailTranslations(locale: EmailLocale) {
  return translations[locale];
}

export function getDateLocale(locale: EmailLocale): string {
  return DATE_LOCALES[locale];
}
