import { useState, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "./Sidebar";

interface AdminLayoutProps {
  children: ReactNode;
}

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "cs", label: "CS" },
  { code: "sk", label: "SK" },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-admin-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 bg-admin-800/80 backdrop-blur-sm border-b border-admin-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-admin-300 hover:bg-admin-700"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    i18n.language?.startsWith(lang.code)
                      ? "bg-blue-600 text-white"
                      : "text-admin-400 hover:text-white"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
