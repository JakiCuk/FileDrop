import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { supportedLanguages } from "../i18n";
import type { ReactNode } from "react";

const companyLogoUrl = import.meta.env.VITE_COMPANY_LOGO_URL || "";
const companyName = import.meta.env.VITE_COMPANY_NAME || "FileDrop";

export default function Layout({ children }: { children: ReactNode }) {
  const { token, user, logout } = useAuth();
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold text-brand-700"
          >
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt={companyName} className="h-8 w-auto" />
            ) : (
              <svg className="w-8 h-8" viewBox="0 0 100 100">
                <rect width="100" height="100" rx="20" fill="#2b6e33" />
                <path
                  d="M50 20 L50 55 M35 42 L50 55 L65 42"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M25 65 L25 75 Q25 80 30 80 L70 80 Q75 80 75 75 L75 65"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            )}
            {companyName}
          </Link>

          <nav className="flex items-center gap-4">
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white
                focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {Object.entries(supportedLanguages).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>

            {token ? (
              <>
                <span className="text-sm text-gray-500 hidden sm:inline">{user?.email}</span>
                <Link
                  to="/my-shares"
                  className="text-sm text-brand-600 hover:text-brand-800"
                >
                  {t("layout.myShares")}
                </Link>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {t("layout.logout")}
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="text-sm text-brand-600 hover:text-brand-800"
              >
                {t("layout.login")}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {children}
      </main>

      <footer className="border-t border-gray-200 py-4 text-center text-sm text-gray-400">
        {companyName} &mdash; {t("layout.footer")}
        {token && (
          <span> &bull; {t("layout.footerCredit")}</span>
        )}
      </footer>
    </div>
  );
}
